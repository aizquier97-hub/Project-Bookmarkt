import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  decideEntitlementWrite,
  ENTITLEMENT_COLUMNS,
  type EntitlementRow,
  isUuid,
  ledgerRow,
  parseWebhookEvent,
  planTransfer,
  type WebhookEvent,
} from "./lifecycle.ts";

/**
 * RevenueCat webhook handler (Stage 4 Phase 3/4, D-061 + D-068).
 *
 * RevenueCat posts every billing lifecycle event here; this function is the
 * ONLY writer of store-sourced `companion_entitlements` rows (D-047: the
 * server owns entitlement, the client only renders it). Design:
 *
 *   - Authentication: RevenueCat sends a fixed Authorization header value,
 *     configured in their dashboard; it must equal REVENUECAT_WEBHOOK_SECRET.
 *   - Idempotent twice over: every applied event is an absolute write of the
 *     row's state, and the `companion_billing_events` ledger (keyed by the
 *     RevenueCat event id) turns a retried delivery into a no-op.
 *   - Ordered: events older than the row's `last_event_at` are ignored, so
 *     a delayed EXPIRATION cannot undo a later RENEWAL.
 *   - app_user_id is the Supabase user id (the app configures the SDK that
 *     way); anonymous RevenueCat ids are acknowledged and skipped.
 *   - dev_comp rows are never modified: the owner's complimentary access
 *     survives test purchases and their later expirations.
 *   - Unknown event types are acknowledged (200) so RevenueCat does not
 *     retry forever; they are still recorded in the ledger.
 *
 * Decisions live in `lifecycle.ts` (pure, unit-tested); this file only
 * reads the row, applies the decision, and records the ledger entry.
 */

export interface WebhookEnv {
  secret: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

const jsonHeaders = { "Content-Type": "application/json" };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

async function readRows(admin: SupabaseClient, userIds: string[]): Promise<Map<string, EntitlementRow>> {
  const rows = new Map<string, EntitlementRow>();
  if (userIds.length === 0) return rows;
  const { data, error } = await admin
    .from("companion_entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .in("user_id", userIds);
  if (error) throw error;
  for (const row of (data ?? []) as unknown as EntitlementRow[]) {
    rows.set(row.user_id, row);
  }
  return rows;
}

async function recordLedger(
  admin: SupabaseClient,
  event: WebhookEvent,
  userId: string | null,
  applied: boolean,
  skipReason: string | null,
  now: Date,
) {
  const { error } = await admin
    .from("companion_billing_events")
    .upsert(ledgerRow(event, userId, applied, skipReason, now), { onConflict: "event_id" });
  if (error) {
    // The entitlement write already happened; a missing ledger line must
    // not turn a successful delivery into a RevenueCat retry.
    console.error("revenuecat-webhook ledger write failed", error.message);
  }
}

async function alreadyApplied(admin: SupabaseClient, eventId: string | null): Promise<boolean> {
  if (!eventId) return false;
  const { data, error } = await admin
    .from("companion_billing_events")
    .select("applied")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data?.applied === true;
}

export async function handleWebhook(
  req: Request,
  env: WebhookEnv,
  now: Date = new Date(),
  adminClient?: SupabaseClient,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!env.secret || !env.supabaseUrl || !env.serviceRoleKey) {
    return jsonResponse({ error: "Webhook is not configured." }, 500);
  }

  const authHeader = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (authHeader !== env.secret) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let event: WebhookEvent;
  try {
    event = parseWebhookEvent(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const admin =
    adminClient ??
    createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  try {
    if (event.type === "TRANSFER") {
      return await applyTransfer(admin, event, now);
    }

    // TEST events (dashboard "send test event") and anonymous ids: acknowledge.
    if (!isUuid(event.appUserId)) {
      return jsonResponse({ ok: true, skipped: "non_uuid_app_user_id" });
    }
    if (await alreadyApplied(admin, event.id)) {
      return jsonResponse({ ok: true, skipped: "duplicate_event" });
    }

    const rows = await readRows(admin, [event.appUserId]);
    const decision = decideEntitlementWrite(event, rows.get(event.appUserId) ?? null, now);

    if (decision.kind === "skip") {
      await recordLedger(admin, event, event.appUserId, false, decision.reason, now);
      return jsonResponse({ ok: true, skipped: decision.reason });
    }

    if (decision.kind === "upsert") {
      const { error } = await admin
        .from("companion_entitlements")
        .upsert(decision.patch, { onConflict: "user_id" });
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("companion_entitlements")
        .update(decision.patch)
        .eq("user_id", event.appUserId);
      if (error) throw error;
    }
    await recordLedger(admin, event, event.appUserId, true, null, now);
    return jsonResponse({ ok: true, applied: event.type });
  } catch (error) {
    console.error("revenuecat-webhook failed", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Entitlement write failed." }, 500);
  }
}

async function applyTransfer(admin: SupabaseClient, event: WebhookEvent, now: Date): Promise<Response> {
  const ids = [...new Set([...event.transferredFrom, ...event.transferredTo])];
  if (ids.length === 0) {
    return jsonResponse({ ok: true, skipped: "non_uuid_app_user_id" });
  }
  if (await alreadyApplied(admin, event.id)) {
    return jsonResponse({ ok: true, skipped: "duplicate_event" });
  }
  const plan = planTransfer(event, await readRows(admin, ids), now);
  for (const item of plan.expire) {
    const { error } = await admin.from("companion_entitlements").update(item.patch).eq("user_id", item.user_id);
    if (error) throw error;
  }
  for (const item of plan.activate) {
    const { error } = await admin.from("companion_entitlements").upsert(item.patch, { onConflict: "user_id" });
    if (error) throw error;
  }
  const applied = plan.expire.length + plan.activate.length > 0;
  const ledgerUser = event.transferredTo[0] ?? event.transferredFrom[0] ?? null;
  await recordLedger(
    admin,
    event,
    ledgerUser,
    applied,
    applied ? null : plan.skipped[0]?.reason ?? "transfer_source_unknown",
    now,
  );
  return jsonResponse({
    ok: true,
    applied: applied ? "TRANSFER" : undefined,
    skipped: applied ? undefined : plan.skipped[0]?.reason ?? "transfer_source_unknown",
    expired: plan.expire.map((item) => item.user_id),
    activated: plan.activate.map((item) => item.user_id),
  });
}
