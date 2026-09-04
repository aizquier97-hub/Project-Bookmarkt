import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * RevenueCat webhook (Stage 4 Phase 3, STAGE_4_BUILD_PLAN.md).
 *
 * RevenueCat posts every billing lifecycle event here; this function is the
 * ONLY writer of store-sourced `companion_entitlements` rows (D-047: the
 * server owns entitlement, the client only renders it). Design:
 *
 *   - Authentication: RevenueCat sends a fixed Authorization header value,
 *     configured in their dashboard; it must equal REVENUECAT_WEBHOOK_SECRET.
 *   - Idempotent: every event maps to an absolute upsert of the row's state,
 *     so duplicate or replayed deliveries settle on the same result.
 *   - app_user_id is the Supabase user id (the app configures the SDK that
 *     way); anonymous RevenueCat ids are acknowledged and skipped.
 *   - dev_comp rows are never modified: the owner's complimentary access
 *     survives test purchases and their later expirations.
 *   - Unknown event types are acknowledged (200) so RevenueCat does not
 *     retry forever; nothing is written for them.
 */

const jsonHeaders = { "Content-Type": "application/json" };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

const ACTIVATE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);
// CANCELLATION only turns off auto-renew: access continues to period end,
// so it updates the period without deactivating. EXPIRATION deactivates.
const DEACTIVATE_EVENTS = new Set(["EXPIRATION"]);
const PERIOD_ONLY_EVENTS = new Set(["CANCELLATION", "BILLING_ISSUE"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapStoreSource(store: string | undefined): string {
  switch ((store ?? "").toUpperCase()) {
    case "PLAY_STORE":
      return "play_store";
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    default:
      // RevenueCat's Test Store and anything unexpected.
      return "test_store";
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Webhook is not configured." }, 500);
  }

  const authHeader = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (authHeader !== secret) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let event: Record<string, unknown>;
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const type = typeof event.type === "string" ? event.type : "";
  const appUserId = typeof event.app_user_id === "string" ? event.app_user_id : "";
  const expirationMs = typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : null;
  const store = typeof event.store === "string" ? event.store : undefined;

  // TEST events (dashboard "send test event") and anonymous ids: acknowledge.
  if (!UUID_RE.test(appUserId)) {
    return jsonResponse({ ok: true, skipped: "non_uuid_app_user_id" });
  }
  const isActivate = ACTIVATE_EVENTS.has(type);
  const isDeactivate = DEACTIVATE_EVENTS.has(type);
  const isPeriodOnly = PERIOD_ONLY_EVENTS.has(type);
  if (!isActivate && !isDeactivate && !isPeriodOnly) {
    return jsonResponse({ ok: true, skipped: "unhandled_event_type" });
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Complimentary access is never overwritten by store events (the owner's
  // dev comp must survive test purchases and their expirations).
  const { data: existing, error: readError } = await admin
    .from("companion_entitlements")
    .select("source")
    .eq("user_id", appUserId)
    .maybeSingle();
  if (readError) {
    return jsonResponse({ error: "Entitlement read failed." }, 500);
  }
  if (existing?.source === "dev_comp") {
    return jsonResponse({ ok: true, skipped: "dev_comp_preserved" });
  }

  const periodEnd = expirationMs ? new Date(expirationMs).toISOString() : null;
  const now = new Date().toISOString();

  let row: Record<string, unknown>;
  if (isActivate) {
    row = {
      user_id: appUserId,
      status: "active",
      source: mapStoreSource(store),
      current_period_end: periodEnd,
      updated_at: now,
    };
  } else if (isDeactivate) {
    row = {
      user_id: appUserId,
      status: "expired",
      source: mapStoreSource(store),
      current_period_end: periodEnd,
      updated_at: now,
    };
  } else {
    // Cancellation / billing issue: access runs to the period end; only the
    // recorded period changes. No row yet means nothing to update.
    if (!existing) {
      return jsonResponse({ ok: true, skipped: "no_row_for_period_update" });
    }
    const { error: updateError } = await admin
      .from("companion_entitlements")
      .update({ current_period_end: periodEnd, updated_at: now })
      .eq("user_id", appUserId);
    if (updateError) {
      return jsonResponse({ error: "Entitlement update failed." }, 500);
    }
    return jsonResponse({ ok: true, applied: type });
  }

  const { error: upsertError } = await admin
    .from("companion_entitlements")
    .upsert(row, { onConflict: "user_id" });
  if (upsertError) {
    return jsonResponse({ error: "Entitlement write failed." }, 500);
  }
  return jsonResponse({ ok: true, applied: type });
});
