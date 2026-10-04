/**
 * RevenueCat lifecycle decisions (Stage 4 Phase 3/4, D-068). Pure: no Deno
 * APIs, no database - `handler.ts` feeds it the parsed event and the
 * reader's current entitlement row and applies whatever it returns. Every
 * rule here is covered by `lifecycle_test.ts`.
 *
 * Model: the entitlement row is an absolute snapshot of what the store last
 * told us. Events are applied in event-time order (`last_event_at`), so a
 * delayed EXPIRATION can never undo a later RENEWAL; a retried delivery
 * (same RevenueCat event id) is a no-op through the billing-event ledger.
 */

export interface EntitlementRow {
  user_id: string;
  status: string;
  source: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  current_period_end: string | null;
  will_renew: boolean;
  billing_issue_detected_at: string | null;
  grace_period_expires_at: string | null;
  cancel_reason: string | null;
  expiration_reason: string | null;
  period_type: string | null;
  product_id: string | null;
  store_environment: string | null;
  last_event_at: string | null;
}

/** The columns `handler.ts` reads before deciding (keep in sync with the row type). */
export const ENTITLEMENT_COLUMNS =
  "user_id, status, source, trial_started_at, trial_expires_at, current_period_end, will_renew, " +
  "billing_issue_detected_at, grace_period_expires_at, cancel_reason, expiration_reason, " +
  "period_type, product_id, store_environment, last_event_at";

export interface WebhookEvent {
  id: string | null;
  type: string;
  appUserId: string;
  eventAtMs: number | null;
  expirationAtMs: number | null;
  gracePeriodExpirationAtMs: number | null;
  store: string | null;
  environment: string | null;
  productId: string | null;
  periodType: string | null;
  cancelReason: string | null;
  expirationReason: string | null;
  transferredFrom: string[];
  transferredTo: string[];
}

export type SkipReason =
  | "non_uuid_app_user_id"
  | "unhandled_event_type"
  | "dev_comp_preserved"
  | "stale_event"
  | "duplicate_event"
  | "no_row_for_period_update"
  | "transfer_source_unknown";

export type Decision =
  | { kind: "skip"; reason: SkipReason }
  | { kind: "upsert"; patch: Record<string, unknown> }
  | { kind: "update"; patch: Record<string, unknown> };

/** Events that leave the reader with live access. */
const ACTIVATE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
  "REFUND_REVERSED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);
/** Activation events that prove a successful charge: they close any billing issue. */
const PAYMENT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
  "REFUND_REVERSED",
]);
/** Activation events that (re)affirm auto-renew. */
const RENEWING_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
/** One-off access: it ends at the recorded period end without renewing. */
const NON_RENEWING_EVENTS = new Set(["NON_RENEWING_PURCHASE", "TEMPORARY_ENTITLEMENT_GRANT"]);
/** Events that only annotate the current period; access is untouched. */
const PERIOD_EVENTS = new Set(["CANCELLATION", "BILLING_ISSUE", "SUBSCRIPTION_PAUSED"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function uuidList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && isUuid(v)) : [];
}

/** Normalize RevenueCat's `{ event: {...} }` envelope; tolerant of missing fields. */
export function parseWebhookEvent(body: unknown): WebhookEvent {
  const envelope = (body ?? {}) as Record<string, unknown>;
  const event = (envelope.event ?? {}) as Record<string, unknown>;
  return {
    id: str(event.id),
    type: str(event.type)?.toUpperCase() ?? "",
    appUserId: str(event.app_user_id) ?? "",
    eventAtMs: num(event.event_timestamp_ms),
    expirationAtMs: num(event.expiration_at_ms),
    gracePeriodExpirationAtMs: num(event.grace_period_expiration_at_ms),
    store: str(event.store)?.toUpperCase() ?? null,
    environment: str(event.environment)?.toUpperCase() ?? null,
    productId: str(event.product_id),
    periodType: str(event.period_type)?.toUpperCase() ?? null,
    cancelReason: str(event.cancel_reason)?.toUpperCase() ?? null,
    expirationReason: str(event.expiration_reason)?.toUpperCase() ?? null,
    transferredFrom: uuidList(event.transferred_from),
    transferredTo: uuidList(event.transferred_to),
  };
}

/** Store -> entitlement `source` (constraint: app_store / play_store / test_store). */
export function mapStoreSource(store: string | null, fallback: string | null = null): string {
  switch ((store ?? "").toUpperCase()) {
    case "PLAY_STORE":
      return "play_store";
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    case "":
      // Events without a store (temporary grants) keep whatever source the row has.
      return fallback && fallback !== "none" && fallback !== "dev_comp" && fallback !== "trial"
        ? fallback
        : "test_store";
    default:
      // RevenueCat's Test Store and anything unexpected.
      return "test_store";
  }
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function laterIso(a: number | null, b: number | null): string | null {
  if (a === null) return iso(b);
  if (b === null) return iso(a);
  return iso(Math.max(a, b));
}

/** True when the event is older than the last event already applied to the row. */
export function isStale(event: WebhookEvent, existing: EntitlementRow | null): boolean {
  if (!existing?.last_event_at || event.eventAtMs === null) {
    return false;
  }
  const lastMs = Date.parse(existing.last_event_at);
  return Number.isFinite(lastMs) && event.eventAtMs < lastMs;
}

/**
 * Decide what a subscription lifecycle event does to the reader's row.
 * `now` is the receive time, used only when the event carries no timestamp.
 */
export function decideEntitlementWrite(
  event: WebhookEvent,
  existing: EntitlementRow | null,
  now: Date = new Date(),
): Decision {
  if (!isUuid(event.appUserId)) {
    return { kind: "skip", reason: "non_uuid_app_user_id" };
  }
  const type = event.type;
  const isActivate = ACTIVATE_EVENTS.has(type);
  const isExpiration = type === "EXPIRATION";
  const isPeriod = PERIOD_EVENTS.has(type);
  if (!isActivate && !isExpiration && !isPeriod) {
    return { kind: "skip", reason: "unhandled_event_type" };
  }
  // Complimentary access is never overwritten by store events (the owner's
  // dev comp must survive test purchases and their expirations).
  if (existing?.source === "dev_comp") {
    return { kind: "skip", reason: "dev_comp_preserved" };
  }
  if (isStale(event, existing)) {
    return { kind: "skip", reason: "stale_event" };
  }

  const eventAt = iso(event.eventAtMs) ?? now.toISOString();
  const updatedAt = now.toISOString();
  const descriptive: Record<string, unknown> = {};
  if (event.productId) descriptive.product_id = event.productId;
  if (event.periodType) descriptive.period_type = event.periodType;
  if (event.environment) descriptive.store_environment = event.environment;

  if (isActivate) {
    const patch: Record<string, unknown> = {
      user_id: event.appUserId,
      status: "active",
      source: mapStoreSource(event.store, existing?.source ?? null),
      current_period_end: iso(event.expirationAtMs),
      expiration_reason: null,
      last_event_at: eventAt,
      updated_at: updatedAt,
      ...descriptive,
    };
    if (RENEWING_EVENTS.has(type)) {
      patch.will_renew = true;
      patch.cancel_reason = null;
    } else if (NON_RENEWING_EVENTS.has(type)) {
      patch.will_renew = false;
    }
    if (PAYMENT_EVENTS.has(type)) {
      patch.billing_issue_detected_at = null;
      patch.grace_period_expires_at = null;
    }
    return { kind: "upsert", patch };
  }

  if (isExpiration) {
    // Access ends. The reason tells the client what to say (unsubscribed,
    // billing error, refund, pause...). A row that never existed is still
    // recorded so support sees what the store reported.
    return {
      kind: "upsert",
      patch: {
        user_id: event.appUserId,
        status: "expired",
        source: mapStoreSource(event.store, existing?.source ?? null),
        current_period_end: iso(event.expirationAtMs) ?? existing?.current_period_end ?? null,
        will_renew: false,
        grace_period_expires_at: null,
        expiration_reason: event.expirationReason ?? "UNKNOWN",
        last_event_at: eventAt,
        updated_at: updatedAt,
        ...descriptive,
      },
    };
  }

  // Period annotations: access continues; only the row's lifecycle flags
  // change. Without a row there is nothing to annotate.
  if (!existing) {
    return { kind: "skip", reason: "no_row_for_period_update" };
  }
  const patch: Record<string, unknown> = { last_event_at: eventAt, updated_at: updatedAt, ...descriptive };
  if (type === "CANCELLATION") {
    // Auto-renew off (or a refund, which EXPIRATION follows): access runs
    // to the period end.
    patch.will_renew = false;
    patch.cancel_reason = event.cancelReason ?? "UNKNOWN";
    if (event.expirationAtMs !== null) patch.current_period_end = iso(event.expirationAtMs);
  } else if (type === "BILLING_ISSUE") {
    // A failed charge opens the store's grace period: access continues to
    // its end (RevenueCat extends the expiration accordingly).
    patch.billing_issue_detected_at = eventAt;
    patch.grace_period_expires_at = iso(event.gracePeriodExpirationAtMs);
    const periodEnd = laterIso(event.expirationAtMs, event.gracePeriodExpirationAtMs);
    if (periodEnd) patch.current_period_end = periodEnd;
  } else {
    // SUBSCRIPTION_PAUSED: never revoke here - EXPIRATION (reason
    // SUBSCRIPTION_PAUSED) does that at the period end.
    patch.will_renew = false;
    patch.cancel_reason = "SUBSCRIPTION_PAUSED";
    if (event.expirationAtMs !== null) patch.current_period_end = iso(event.expirationAtMs);
  }
  return { kind: "update", patch };
}

export interface TransferPlan {
  /** Rows to expire (the ids the purchases left). */
  expire: { user_id: string; patch: Record<string, unknown> }[];
  /** Rows to activate (the ids the purchases moved to). */
  activate: { user_id: string; patch: Record<string, unknown> }[];
  skipped: { user_id: string; reason: SkipReason }[];
}

/**
 * TRANSFER: the store purchases moved between app user ids (a reader signed
 * into a second account on the same store account). The destination
 * inherits the source row's store state; the source loses access.
 */
export function planTransfer(
  event: WebhookEvent,
  rows: Map<string, EntitlementRow>,
  now: Date = new Date(),
): TransferPlan {
  const plan: TransferPlan = { expire: [], activate: [], skipped: [] };
  const eventAt = iso(event.eventAtMs) ?? now.toISOString();
  const updatedAt = now.toISOString();

  let template: EntitlementRow | null = null;
  for (const from of event.transferredFrom) {
    const row = rows.get(from) ?? null;
    if (!row) continue;
    if (row.source === "dev_comp" || row.source === "trial" || row.source === "none") {
      plan.skipped.push({ user_id: from, reason: "dev_comp_preserved" });
      continue;
    }
    if (isStale(event, row)) {
      plan.skipped.push({ user_id: from, reason: "stale_event" });
      continue;
    }
    if (!template && row.status === "active") template = row;
    plan.expire.push({
      user_id: from,
      patch: {
        status: "expired",
        will_renew: false,
        grace_period_expires_at: null,
        expiration_reason: "TRANSFER",
        last_event_at: eventAt,
        updated_at: updatedAt,
      },
    });
  }

  for (const to of event.transferredTo) {
    const row = rows.get(to) ?? null;
    if (row?.source === "dev_comp") {
      plan.skipped.push({ user_id: to, reason: "dev_comp_preserved" });
      continue;
    }
    if (row && isStale(event, row)) {
      plan.skipped.push({ user_id: to, reason: "stale_event" });
      continue;
    }
    if (!template) {
      plan.skipped.push({ user_id: to, reason: "transfer_source_unknown" });
      continue;
    }
    plan.activate.push({
      user_id: to,
      patch: {
        user_id: to,
        status: "active",
        source: template.source,
        current_period_end: template.current_period_end,
        will_renew: template.will_renew,
        billing_issue_detected_at: template.billing_issue_detected_at,
        grace_period_expires_at: template.grace_period_expires_at,
        cancel_reason: template.cancel_reason,
        expiration_reason: null,
        period_type: template.period_type,
        product_id: template.product_id,
        store_environment: template.store_environment,
        last_event_at: eventAt,
        updated_at: updatedAt,
      },
    });
  }
  return plan;
}

/** The ledger row written for every delivery (never prices or attributes). */
export function ledgerRow(
  event: WebhookEvent,
  userId: string | null,
  applied: boolean,
  skipReason: string | null,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    event_id: event.id ?? `${event.type}:${userId ?? "unknown"}:${event.eventAtMs ?? now.getTime()}`,
    user_id: userId,
    event_type: event.type || "UNKNOWN",
    event_at: iso(event.eventAtMs) ?? now.toISOString(),
    store: event.store,
    environment: event.environment,
    product_id: event.productId,
    period_type: event.periodType,
    cancel_reason: event.cancelReason,
    expiration_reason: event.expirationReason,
    expiration_at: iso(event.expirationAtMs),
    applied,
    skip_reason: skipReason,
  };
}
