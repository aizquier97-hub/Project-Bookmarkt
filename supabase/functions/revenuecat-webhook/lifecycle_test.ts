import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  decideEntitlementWrite,
  type EntitlementRow,
  isStale,
  ledgerRow,
  mapStoreSource,
  parseWebhookEvent,
  planTransfer,
  type WebhookEvent,
} from "./lifecycle.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";
const NOW = new Date("2026-10-05T12:00:00.000Z");
const T0 = Date.parse("2026-10-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function event(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: "evt-1",
    type: "INITIAL_PURCHASE",
    appUserId: USER,
    eventAtMs: T0,
    expirationAtMs: T0 + 30 * DAY,
    gracePeriodExpirationAtMs: null,
    store: "PLAY_STORE",
    environment: "SANDBOX",
    productId: "club_monthly:base",
    periodType: "NORMAL",
    cancelReason: null,
    expirationReason: null,
    transferredFrom: [],
    transferredTo: [],
    ...overrides,
  };
}

function row(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    user_id: USER,
    status: "active",
    source: "play_store",
    trial_started_at: null,
    trial_expires_at: null,
    current_period_end: new Date(T0 + 30 * DAY).toISOString(),
    will_renew: true,
    billing_issue_detected_at: null,
    grace_period_expires_at: null,
    cancel_reason: null,
    expiration_reason: null,
    period_type: "NORMAL",
    product_id: "club_monthly:base",
    store_environment: "SANDBOX",
    last_event_at: new Date(T0).toISOString(),
    ...overrides,
  };
}

Deno.test("parseWebhookEvent normalizes the envelope and tolerates junk", () => {
  const parsed = parseWebhookEvent({
    event: {
      id: "abc",
      type: "renewal",
      app_user_id: USER,
      event_timestamp_ms: T0,
      expiration_at_ms: T0 + DAY,
      store: "play_store",
      environment: "production",
      product_id: "p",
      period_type: "trial",
      cancel_reason: "unsubscribe",
      transferred_from: ["$RCAnonymousID:x", OTHER],
      price: 4.99,
    },
  });
  assertEquals(parsed.type, "RENEWAL");
  assertEquals(parsed.store, "PLAY_STORE");
  assertEquals(parsed.environment, "PRODUCTION");
  assertEquals(parsed.periodType, "TRIAL");
  assertEquals(parsed.cancelReason, "UNSUBSCRIBE");
  assertEquals(parsed.transferredFrom, [OTHER]);
  assertEquals(parsed.gracePeriodExpirationAtMs, null);
  assertEquals(parseWebhookEvent(null).type, "");
  assertEquals(parseWebhookEvent({ event: { expiration_at_ms: "soon" } }).expirationAtMs, null);
});

Deno.test("mapStoreSource maps stores and falls back to the row's store source", () => {
  assertEquals(mapStoreSource("PLAY_STORE"), "play_store");
  assertEquals(mapStoreSource("APP_STORE"), "app_store");
  assertEquals(mapStoreSource("MAC_APP_STORE"), "app_store");
  assertEquals(mapStoreSource("TEST_STORE"), "test_store");
  assertEquals(mapStoreSource("STRIPE"), "test_store");
  assertEquals(mapStoreSource(null, "app_store"), "app_store");
  assertEquals(mapStoreSource(null, "trial"), "test_store");
  assertEquals(mapStoreSource(null, null), "test_store");
});

Deno.test("anonymous ids and unknown event types are skipped", () => {
  assertEquals(decideEntitlementWrite(event({ appUserId: "$RCAnonymousID:abc" }), null, NOW), {
    kind: "skip",
    reason: "non_uuid_app_user_id",
  });
  assertEquals(decideEntitlementWrite(event({ type: "TEST" }), null, NOW), {
    kind: "skip",
    reason: "unhandled_event_type",
  });
  assertEquals(decideEntitlementWrite(event({ type: "INVOICE_ISSUANCE" }), row(), NOW), {
    kind: "skip",
    reason: "unhandled_event_type",
  });
});

Deno.test("dev_comp rows are never touched by store events", () => {
  for (const type of ["INITIAL_PURCHASE", "EXPIRATION", "CANCELLATION", "BILLING_ISSUE"]) {
    assertEquals(
      decideEntitlementWrite(event({ type }), row({ status: "comped", source: "dev_comp" }), NOW),
      { kind: "skip", reason: "dev_comp_preserved" },
    );
  }
});

Deno.test("INITIAL_PURCHASE activates, clears every lifecycle flag, and leaves trial columns alone", () => {
  const decision = decideEntitlementWrite(event(), null, NOW);
  assertEquals(decision.kind, "upsert");
  if (decision.kind !== "upsert") return;
  assertEquals(decision.patch, {
    user_id: USER,
    status: "active",
    source: "play_store",
    current_period_end: new Date(T0 + 30 * DAY).toISOString(),
    expiration_reason: null,
    last_event_at: new Date(T0).toISOString(),
    updated_at: NOW.toISOString(),
    product_id: "club_monthly:base",
    period_type: "NORMAL",
    store_environment: "SANDBOX",
    will_renew: true,
    cancel_reason: null,
    billing_issue_detected_at: null,
    grace_period_expires_at: null,
  });
  assertEquals("trial_started_at" in decision.patch, false);
  assertEquals("trial_expires_at" in decision.patch, false);
});

Deno.test("a purchase during a Bookmarkt trial supersedes it without erasing the once-per-account marker", () => {
  const trial = row({
    status: "trial",
    source: "trial",
    trial_started_at: "2026-09-30T00:00:00.000Z",
    trial_expires_at: "2026-10-07T00:00:00.000Z",
    last_event_at: null,
  });
  const decision = decideEntitlementWrite(event(), trial, NOW);
  assertEquals(decision.kind, "upsert");
  if (decision.kind !== "upsert") return;
  assertEquals(decision.patch.status, "active");
  assertEquals(decision.patch.source, "play_store");
  assertEquals("trial_started_at" in decision.patch, false);
});

Deno.test("RENEWAL after a cancellation turns auto-renew back on and closes a billing issue", () => {
  const troubled = row({
    will_renew: false,
    cancel_reason: "BILLING_ERROR",
    billing_issue_detected_at: new Date(T0 + 29 * DAY).toISOString(),
    grace_period_expires_at: new Date(T0 + 36 * DAY).toISOString(),
    last_event_at: new Date(T0 + 29 * DAY).toISOString(),
  });
  const decision = decideEntitlementWrite(
    event({ id: "evt-2", type: "RENEWAL", eventAtMs: T0 + 31 * DAY, expirationAtMs: T0 + 60 * DAY }),
    troubled,
    NOW,
  );
  assertEquals(decision.kind, "upsert");
  if (decision.kind !== "upsert") return;
  assertEquals(decision.patch.status, "active");
  assertEquals(decision.patch.will_renew, true);
  assertEquals(decision.patch.cancel_reason, null);
  assertEquals(decision.patch.billing_issue_detected_at, null);
  assertEquals(decision.patch.grace_period_expires_at, null);
  assertEquals(decision.patch.current_period_end, new Date(T0 + 60 * DAY).toISOString());
});

Deno.test("UNCANCELLATION re-enables renewal; SUBSCRIPTION_EXTENDED and PRODUCT_CHANGE keep access", () => {
  const canceled = row({ will_renew: false, cancel_reason: "UNSUBSCRIBE" });
  const un = decideEntitlementWrite(
    event({ type: "UNCANCELLATION", eventAtMs: T0 + DAY, expirationAtMs: T0 + 30 * DAY }),
    canceled,
    NOW,
  );
  assertEquals(un.kind, "upsert");
  if (un.kind === "upsert") {
    assertEquals(un.patch.will_renew, true);
    assertEquals(un.patch.cancel_reason, null);
    // Not a payment: an open billing issue is not cleared by an uncancellation.
    assertEquals("billing_issue_detected_at" in un.patch, false);
  }
  const extended = decideEntitlementWrite(
    event({ type: "SUBSCRIPTION_EXTENDED", eventAtMs: T0 + DAY, expirationAtMs: T0 + 45 * DAY }),
    canceled,
    NOW,
  );
  assertEquals(extended.kind, "upsert");
  if (extended.kind === "upsert") {
    assertEquals(extended.patch.current_period_end, new Date(T0 + 45 * DAY).toISOString());
    // Extending the period says nothing about the reader's renewal choice.
    assertEquals("will_renew" in extended.patch, false);
  }
  const changed = decideEntitlementWrite(
    event({ type: "PRODUCT_CHANGE", eventAtMs: T0 + DAY, productId: "club_annual:base" }),
    canceled,
    NOW,
  );
  assertEquals(changed.kind, "upsert");
  if (changed.kind === "upsert") {
    assertEquals(changed.patch.product_id, "club_annual:base");
    assertEquals(changed.patch.will_renew, true);
  }
});

Deno.test("NON_RENEWING_PURCHASE and TEMPORARY_ENTITLEMENT_GRANT grant access that will not renew", () => {
  const oneOff = decideEntitlementWrite(event({ type: "NON_RENEWING_PURCHASE" }), null, NOW);
  assertEquals(oneOff.kind, "upsert");
  if (oneOff.kind === "upsert") {
    assertEquals(oneOff.patch.status, "active");
    assertEquals(oneOff.patch.will_renew, false);
  }
  const grant = decideEntitlementWrite(
    event({ type: "TEMPORARY_ENTITLEMENT_GRANT", store: null, expirationAtMs: T0 + DAY }),
    row({ source: "app_store" }),
    NOW,
  );
  assertEquals(grant.kind, "upsert");
  if (grant.kind === "upsert") {
    assertEquals(grant.patch.source, "app_store");
    assertEquals(grant.patch.will_renew, false);
    assertEquals(grant.patch.current_period_end, new Date(T0 + DAY).toISOString());
  }
});

Deno.test("CANCELLATION keeps access to the period end and records the reason", () => {
  const decision = decideEntitlementWrite(
    event({ id: "evt-3", type: "CANCELLATION", eventAtMs: T0 + 10 * DAY, cancelReason: "UNSUBSCRIBE" }),
    row(),
    NOW,
  );
  assertEquals(decision, {
    kind: "update",
    patch: {
      last_event_at: new Date(T0 + 10 * DAY).toISOString(),
      updated_at: NOW.toISOString(),
      product_id: "club_monthly:base",
      period_type: "NORMAL",
      store_environment: "SANDBOX",
      will_renew: false,
      cancel_reason: "UNSUBSCRIBE",
      current_period_end: new Date(T0 + 30 * DAY).toISOString(),
    },
  });
  assertEquals(decideEntitlementWrite(event({ type: "CANCELLATION" }), null, NOW), {
    kind: "skip",
    reason: "no_row_for_period_update",
  });
});

Deno.test("a refund is CANCELLATION (customer support) then EXPIRATION: access ends with the reason kept", () => {
  const canceled = decideEntitlementWrite(
    event({ id: "evt-4", type: "CANCELLATION", eventAtMs: T0 + 2 * DAY, cancelReason: "CUSTOMER_SUPPORT" }),
    row(),
    NOW,
  );
  assertEquals(canceled.kind, "update");
  const expired = decideEntitlementWrite(
    event({
      id: "evt-5",
      type: "EXPIRATION",
      eventAtMs: T0 + 2 * DAY + 1000,
      expirationAtMs: T0 + 2 * DAY,
      expirationReason: "CUSTOMER_SUPPORT",
    }),
    row({ will_renew: false, cancel_reason: "CUSTOMER_SUPPORT", last_event_at: new Date(T0 + 2 * DAY).toISOString() }),
    NOW,
  );
  assertEquals(expired.kind, "upsert");
  if (expired.kind === "upsert") {
    assertEquals(expired.patch.status, "expired");
    assertEquals(expired.patch.expiration_reason, "CUSTOMER_SUPPORT");
    assertEquals(expired.patch.will_renew, false);
    assertEquals(expired.patch.current_period_end, new Date(T0 + 2 * DAY).toISOString());
    assertEquals("cancel_reason" in expired.patch, false);
  }
});

Deno.test("REFUND_REVERSED re-activates an expired row", () => {
  const decision = decideEntitlementWrite(
    event({ id: "evt-6", type: "REFUND_REVERSED", eventAtMs: T0 + 3 * DAY, expirationAtMs: T0 + 30 * DAY }),
    row({ status: "expired", expiration_reason: "CUSTOMER_SUPPORT", last_event_at: new Date(T0 + 2 * DAY).toISOString() }),
    NOW,
  );
  assertEquals(decision.kind, "upsert");
  if (decision.kind === "upsert") {
    assertEquals(decision.patch.status, "active");
    assertEquals(decision.patch.expiration_reason, null);
    assertEquals(decision.patch.billing_issue_detected_at, null);
  }
});

Deno.test("BILLING_ISSUE opens the grace period and extends the recorded period end to its close", () => {
  const decision = decideEntitlementWrite(
    event({
      id: "evt-7",
      type: "BILLING_ISSUE",
      eventAtMs: T0 + 30 * DAY,
      expirationAtMs: T0 + 30 * DAY,
      gracePeriodExpirationAtMs: T0 + 37 * DAY,
    }),
    row(),
    NOW,
  );
  assertEquals(decision.kind, "update");
  if (decision.kind === "update") {
    assertEquals(decision.patch.billing_issue_detected_at, new Date(T0 + 30 * DAY).toISOString());
    assertEquals(decision.patch.grace_period_expires_at, new Date(T0 + 37 * DAY).toISOString());
    assertEquals(decision.patch.current_period_end, new Date(T0 + 37 * DAY).toISOString());
    assertEquals("status" in decision.patch, false);
  }
  const noGrace = decideEntitlementWrite(
    event({ id: "evt-8", type: "BILLING_ISSUE", eventAtMs: T0 + 30 * DAY, gracePeriodExpirationAtMs: null }),
    row(),
    NOW,
  );
  if (noGrace.kind === "update") {
    assertEquals(noGrace.patch.grace_period_expires_at, null);
    assertEquals(noGrace.patch.current_period_end, new Date(T0 + 30 * DAY).toISOString());
  }
});

Deno.test("SUBSCRIPTION_PAUSED never revokes; the matching EXPIRATION does", () => {
  const paused = decideEntitlementWrite(
    event({ id: "evt-9", type: "SUBSCRIPTION_PAUSED", eventAtMs: T0 + 5 * DAY }),
    row(),
    NOW,
  );
  assertEquals(paused.kind, "update");
  if (paused.kind === "update") {
    assertEquals(paused.patch.will_renew, false);
    assertEquals(paused.patch.cancel_reason, "SUBSCRIPTION_PAUSED");
    assertEquals("status" in paused.patch, false);
  }
  const expired = decideEntitlementWrite(
    event({ id: "evt-10", type: "EXPIRATION", eventAtMs: T0 + 30 * DAY, expirationReason: "SUBSCRIPTION_PAUSED" }),
    row({ will_renew: false, cancel_reason: "SUBSCRIPTION_PAUSED", last_event_at: new Date(T0 + 5 * DAY).toISOString() }),
    NOW,
  );
  assertEquals(expired.kind, "upsert");
  if (expired.kind === "upsert") {
    assertEquals(expired.patch.status, "expired");
    assertEquals(expired.patch.expiration_reason, "SUBSCRIPTION_PAUSED");
  }
});

Deno.test("EXPIRATION without a reason records UNKNOWN and creates the row when none exists", () => {
  const decision = decideEntitlementWrite(
    event({ id: "evt-11", type: "EXPIRATION", eventAtMs: T0 + 30 * DAY, expirationReason: null }),
    null,
    NOW,
  );
  assertEquals(decision.kind, "upsert");
  if (decision.kind === "upsert") {
    assertEquals(decision.patch.status, "expired");
    assertEquals(decision.patch.expiration_reason, "UNKNOWN");
    assertEquals(decision.patch.user_id, USER);
  }
});

Deno.test("ordering guard: a delayed EXPIRATION cannot undo a later RENEWAL", () => {
  const renewed = row({ last_event_at: new Date(T0 + 31 * DAY).toISOString() });
  const late = event({
    id: "evt-12",
    type: "EXPIRATION",
    eventAtMs: T0 + 30 * DAY,
    expirationAtMs: T0 + 30 * DAY,
    expirationReason: "BILLING_ERROR",
  });
  assertEquals(isStale(late, renewed), true);
  assertEquals(decideEntitlementWrite(late, renewed, NOW), { kind: "skip", reason: "stale_event" });
  // Same instant is not stale (two events can share a timestamp).
  assertEquals(isStale(event({ eventAtMs: T0 + 31 * DAY }), renewed), false);
  // Events without a timestamp, or rows that never saw a store event, are never stale.
  assertEquals(isStale(event({ eventAtMs: null }), renewed), false);
  assertEquals(isStale(late, row({ last_event_at: null })), false);
});

Deno.test("events without a timestamp stamp the receive time", () => {
  const decision = decideEntitlementWrite(event({ eventAtMs: null }), null, NOW);
  assertEquals(decision.kind, "upsert");
  if (decision.kind === "upsert") {
    assertEquals(decision.patch.last_event_at, NOW.toISOString());
  }
});

Deno.test("TRANSFER moves the store state to the destination and expires the source", () => {
  const source = row({ user_id: USER, will_renew: false, cancel_reason: "UNSUBSCRIBE" });
  const plan = planTransfer(
    event({ id: "evt-13", type: "TRANSFER", appUserId: "", eventAtMs: T0 + 6 * DAY, transferredFrom: [USER], transferredTo: [OTHER] }),
    new Map([[USER, source]]),
    NOW,
  );
  assertEquals(plan.skipped, []);
  assertEquals(plan.expire.length, 1);
  assertEquals(plan.expire[0].user_id, USER);
  assertEquals(plan.expire[0].patch.status, "expired");
  assertEquals(plan.expire[0].patch.expiration_reason, "TRANSFER");
  assertEquals(plan.activate.length, 1);
  assertEquals(plan.activate[0].user_id, OTHER);
  assertEquals(plan.activate[0].patch.status, "active");
  assertEquals(plan.activate[0].patch.source, "play_store");
  assertEquals(plan.activate[0].patch.will_renew, false);
  assertEquals(plan.activate[0].patch.cancel_reason, "UNSUBSCRIBE");
  assertEquals(plan.activate[0].patch.current_period_end, source.current_period_end);
});

Deno.test("TRANSFER never takes a comp or a trial away and needs a known active source", () => {
  const comp = row({ user_id: USER, status: "comped", source: "dev_comp" });
  const plan = planTransfer(
    event({ type: "TRANSFER", appUserId: "", transferredFrom: [USER], transferredTo: [OTHER] }),
    new Map([[USER, comp]]),
    NOW,
  );
  assertEquals(plan.expire, []);
  assertEquals(plan.activate, []);
  assertEquals(plan.skipped, [
    { user_id: USER, reason: "dev_comp_preserved" },
    { user_id: OTHER, reason: "transfer_source_unknown" },
  ]);
  const toComp = planTransfer(
    event({ type: "TRANSFER", appUserId: "", transferredFrom: [USER], transferredTo: [OTHER] }),
    new Map([
      [USER, row()],
      [OTHER, row({ user_id: OTHER, status: "comped", source: "dev_comp" })],
    ]),
    NOW,
  );
  assertEquals(toComp.expire.length, 1);
  assertEquals(toComp.activate, []);
  assertEquals(toComp.skipped, [{ user_id: OTHER, reason: "dev_comp_preserved" }]);
});

Deno.test("ledgerRow records lifecycle facts only - never prices", () => {
  const line = ledgerRow(event({ id: "evt-14", type: "RENEWAL", cancelReason: null }), USER, true, null, NOW);
  assertEquals(line, {
    event_id: "evt-14",
    user_id: USER,
    event_type: "RENEWAL",
    event_at: new Date(T0).toISOString(),
    store: "PLAY_STORE",
    environment: "SANDBOX",
    product_id: "club_monthly:base",
    period_type: "NORMAL",
    cancel_reason: null,
    expiration_reason: null,
    expiration_at: new Date(T0 + 30 * DAY).toISOString(),
    applied: true,
    skip_reason: null,
  });
  const fallback = ledgerRow(event({ id: null, type: "TEST", eventAtMs: null }), null, false, "unhandled_event_type", NOW);
  assertEquals(fallback.event_id, `TEST:unknown:${NOW.getTime()}`);
  assertEquals(fallback.applied, false);
  assertEquals(fallback.skip_reason, "unhandled_event_type");
});
