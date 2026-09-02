# Billing Dispute Support Procedures

**Scope:** customer-support procedures for subscription billing disputes
(Stage 4 Phase 4, [STAGE_4_BUILD_PLAN.md](STAGE_4_BUILD_PLAN.md)). Written
before billing ships so the procedures exist the day the first real charge
does. Update alongside the Phase 3 billing integration.

**Ground rules**

- All purchases flow through Apple App Store / Google Play in-app
  subscriptions. **Bookmarkt never holds card details** - refunds are
  executed by the store, not by us.
- The server is the single source of entitlement truth
  (`companion_entitlements`); every companion request is audited in
  `companion_usage_events` (entitlement decision, feature, quota outcome,
  cost, latency - never entry content).
- Free capture is never paywalled (D-012): a billing dispute can never cost
  a reader access to their own entries, character maps, or images.

## 1. Intake

Disputes arrive through **Settings → Report an issue** (in-app), the store's
refund flow, or email. For each case record: account email, store (Apple /
Google), approximate purchase date, and what the reader expected versus what
happened.

## 2. Triage by claim

| Claim | First checks | Resolution path |
| --- | --- | --- |
| "I paid but the companion is locked" | Entitlement row for the account; store purchase state; recent webhook deliveries | If the store shows an active purchase and the entitlement row disagrees, reconcile the entitlement server-side (this is our failure - fix immediately, apologize, consider a goodwill extension). |
| "I was charged after cancelling" | Store subscription status and cancellation date; store charges post-date the cancellation? | Store-side billing: direct the reader to the store's refund flow (links below). Cancellation takes effect at period end - explain the store's proration rules honestly. |
| "I didn't authorize this purchase" | Nothing on our side proves authorization | Always route to the store's refund process; never argue authorization ourselves. |
| "The companion didn't work during my subscription" | `companion_usage_events` for error rates/denials in the claimed window | If our audit confirms a real outage or systemic denial, support the refund request with the store and say so plainly. |
| "I want a refund, no specific complaint" | Subscription age, prior refunds | Point to the store flow; the store decides. Be gracious - a reader who refunds today may subscribe again later. |

## 3. Store refund routes

- **Google Play:** reader requests at <https://play.google.com/store/account>
  → Order history, or via Play support within 48h for instant self-service.
  Developer-side, refunds can also be issued from the Play Console order
  list - use this when the failure was ours.
- **Apple:** reader requests at <https://reportaproblem.apple.com>. Apple
  decides; developers cannot issue App Store refunds directly.

## 4. After any refund or chargeback

1. Verify the store webhook revoked the entitlement; if the webhook was
   missed, revoke manually and log the reconciliation.
2. Never claw back reader data - capture stays intact regardless of
   subscription state (D-012).
3. Record the case outcome (date, store, claim type, resolution) so
   patterns surface - repeated "paid but locked" cases mean a webhook or
   reconciliation bug, not a support problem.

## 5. Response principles

- Reply within 2 business days; honestly, without legalese.
- Our entitlement mistakes are fixed first and explained second.
- Store billing decisions belong to the store; we help the reader get
  there quickly rather than relitigating them ourselves.
