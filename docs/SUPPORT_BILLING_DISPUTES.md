# Billing Dispute Support Procedures

**Scope:** customer-support procedures for subscription billing disputes
(Stage 4 Phase 4, [STAGE_4_BUILD_PLAN.md](STAGE_4_BUILD_PLAN.md)). Written
before billing ships so the procedures exist the day the first real charge
does. Revised 2026-10-04 alongside the D-068 lifecycle hardening (billing
ledger, lapse tolerance, server-authorized trial) and again for D-070 (the
store's 7-day free trial is the trial; prices $7.99 monthly / $79.99 yearly).

**Ground rules**

- All purchases flow through Apple App Store / Google Play in-app
  subscriptions. **Bookmarkt never holds card details** - refunds are
  executed by the store, not by us.
- The server is the single source of entitlement truth
  (`companion_entitlements`); every companion request is audited in
  `companion_usage_events` (entitlement decision, feature, quota outcome,
  cost, latency - never entry content), and every store event RevenueCat
  delivered is in `companion_billing_events` (event id, type, store,
  reason, whether it was applied or why it was skipped - never a price).
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
| "I paid but the companion is locked" | Entitlement row (`status`, `current_period_end`, `will_renew`, `expiration_reason`, `last_event_at`); the account's lines in `companion_billing_events` (was the activation delivered? applied, or skipped as `stale_event` / `dev_comp_preserved`?); RevenueCat dashboard customer view | If the store shows an active purchase and the row disagrees: re-send the event from the RevenueCat dashboard (a re-delivery with a newer timestamp applies; an exact duplicate is a no-op by design), or reconcile the row server-side. This is our failure - fix immediately, apologize, consider a goodwill extension. If the ledger shows the activation **skipped as stale**, a later event already superseded it - read the row's `expiration_reason`. |
| "I paid but it says my subscription ended" | Row `status = active` with `current_period_end` more than 7 days in the past means the **lapse tolerance** fired (a lost EXPIRATION or a renewal the webhook never saw) | Check the ledger for the missing RENEWAL; re-send it from RevenueCat. Access resumes the moment the row's period end moves forward. |
| "I was charged after cancelling" | Store subscription status and cancellation date; row `will_renew` and `cancel_reason`; store charges post-date the cancellation? | Store-side billing: direct the reader to the store's refund flow (links below). Cancellation takes effect at period end - explain the store's proration rules honestly. |
| "My payment failed - do I still have access?" | Row `billing_issue_detected_at` and `grace_period_expires_at` | Yes, until the grace end shown on their Subscription screen; the store retries the charge. Fixing the payment method in the store account clears it (we see RENEWAL). No action on our side. |
| "I didn't authorize this purchase" | Nothing on our side proves authorization | Always route to the store's refund process; never argue authorization ourselves. |
| "The companion didn't work during my subscription" | `companion_usage_events` for error rates/denials in the claimed window | If our audit confirms a real outage or systemic denial, support the refund request with the store and say so plainly. |
| "I want a refund, no specific complaint" | Subscription age, prior refunds | Point to the store flow; the store decides. Be gracious - a reader who refunds today may subscribe again later. |
| "Where is my free trial?" | Which trial? The **store trial** (D-070, the live one): the Play/App Store subscription offer - 7 days free, then $7.99 monthly or $79.99 yearly; the store shows it only to an account that never used one. Check RevenueCat's customer view for the trial purchase and the row's `period_type = trial`. The **Bookmarkt trial** (D-068) is switched off (`companion_trial_policy.bookmarkt_trial_enabled = false`); `companion_trial_eligibility()` answers `store_trial` for an eligible reader, `needs_entries` with the count before five entries. | Plan buttons appear once five entries exist (the Subscription screen shows the progress bar until then). If the store offered no trial, the reader's store account already used one - we cannot grant a second store trial and do not hand out Bookmarkt trials while the flag is off; a goodwill extension is the exception, logged. |
| "I was charged when the free trial ended" | Store subscription history: trial start, conversion date, cancellation (if any); row `period_type` moved from `trial` to `normal` on the RENEWAL | Expected behaviour: the store converts a trial that was not cancelled before its end and sends its own reminder beforehand. Route refund requests to the store (links below); Google often grants a first refund within 48 hours. Cancelling now stops the next charge; access runs to the period end. |
| "I switched phones / accounts and lost access" | Ledger for a TRANSFER event; rows for both accounts | Restore purchases on the new device moves store access (TRANSFER expires the old row with `expiration_reason = TRANSFER`). Bookmarkt trials and comps never move. |

## 3. Store refund routes

- **Google Play:** reader requests at <https://play.google.com/store/account>
  → Order history, or via Play support within 48h for instant self-service.
  Developer-side, refunds can also be issued from the Play Console order
  list - use this when the failure was ours.
- **Apple:** reader requests at <https://reportaproblem.apple.com>. Apple
  decides; developers cannot issue App Store refunds directly.

## 4. After any refund or chargeback

1. Verify the store webhook revoked the entitlement: a refund arrives as
   CANCELLATION (`cancel_reason = CUSTOMER_SUPPORT`) followed by EXPIRATION,
   so the row should read `status = expired`, `expiration_reason =
   CUSTOMER_SUPPORT`, and both events should be in `companion_billing_events`
   as applied. If the EXPIRATION never arrived, re-send it from the
   RevenueCat dashboard rather than editing the row by hand; the 7-day lapse
   tolerance closes access on its own if nothing arrives.
2. Never claw back reader data - capture stays intact regardless of
   subscription state (D-012).
3. Record the case outcome (date, store, claim type, resolution) so
   patterns surface - repeated "paid but locked" cases mean a webhook or
   reconciliation bug, not a support problem. The ledger's `skip_reason`
   column is the first place to look for such a pattern.

## 5. Response principles

- Reply within 2 business days; honestly, without legalese.
- Our entitlement mistakes are fixed first and explained second.
- Store billing decisions belong to the store; we help the reader get
  there quickly rather than relitigating them ourselves.
