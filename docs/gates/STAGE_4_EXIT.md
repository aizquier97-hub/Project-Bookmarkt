# Stage 4 Exit Review - Monetization and accounts

| Field | Value |
| --- | --- |
| Stage | Stage 4 - Monetization and accounts |
| Review type | Exit |
| Status | Approved |
| Review date | Opened 2026-10-04; Approved 2026-10-07 (D-070, D-077, D-078) |
| Product owner | Bookmarkt product owner |
| Roadmap version | 2.0 |
| Related gate issue | N/A (single-operator project; review conducted in-session) |

## Outcome required

The AI Reading Companion is a working, server-authoritative subscription:
free capture is untouched by subscription state, every companion request is
gated and audited server-side, billing events are verified, idempotent, and
reconcilable, every purchase lifecycle state is handled and explained to the
reader, the trial is server-authorized and once per account, and the price
demonstrates an acceptable margin. Account self-service (recovery, export,
deletion) exists before external readers arrive.

## Product-scope conformance

- Native iOS/Android impact: the billing SDK (`react-native-purchases`)
  shipped in the Android 1.0.1 binary (D-061); every later Stage 4 round
  shipped over-the-air to both live runtimes. iOS billing verification is
  Stage 5 (Apple account + iOS builds, D-020).
- Physical QR and app/store-routing impact: none this stage.
- Temporary PWA or retirement impact: none; the PWA stays frozen (D-018).
- Minimal web endpoint impact: none; no web purchase flow exists (D-061).
- AI Reading Companion subscription and entitlement impact: the whole stage.
  `companion_entitlements` is the single source of truth (D-047); the
  `companion` Edge Function gates auth -> entitlement -> quota before any
  provider call; `revenuecat-webhook` is the only store writer (D-061,
  hardened D-068); the free trial is two SECURITY DEFINER RPCs with a
  tunable policy row (D-068), switched to "the store runs the trial" by
  policy flag once the price landed (D-070).
- Reader-authored capture, latest-entry boundary, and companion
  grounding/provenance impact: capture never reads the entitlement (verified
  2026-10-04 - only companion features and their offer cards do); every
  companion feature stays grounded in the reader's own rows under RLS with
  the spoiler boundary enforced server-side (D-047..D-052, D-056..D-059).
- User-content storage impact: new tables `companion_entitlements`,
  `companion_usage_events`, `companion_messages`, `entry_embeddings`,
  `reading_sessions`, `companion_billing_events`, `companion_trial_policy`;
  `entries.is_favorite` / `reflection`, `topics.difficulty_override` and
  comprehension columns. All additive, all RLS-scoped; no reader content is
  used to train models.
- Governing decision references: D-046 (entry) through D-070.

## Criteria and evidence

Criteria are the roadmap §13 exit gate. "Pass" means evidenced today;
"Pending" names what still has to happen.

| Criterion | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Entitlements are consistent across iOS and Android test contexts and the server-authoritative account state | Conditional | Android: server row drives both the gate and the UI (D-047, D-061, D-068 live smoke). iOS context does not exist until Stage 5 builds; Stage 4 exits on Android evidence plus server state per D-020. | Engineering |
| A free account keeps full capture functionality and cannot invoke any AI provider | Pass | Capture paths never read the entitlement (2026-10-04 review); the Edge Function denies with 402 before any provider call (D-047; live smoke 2026-10-04: expired and lapsed rows both 402). | Engineering |
| An active companion subscription can use every companion feature within its usage quotas | Pass | Per-feature daily quotas via `consume_companion_quota` (D-047..D-052, D-065); the owner's comped account exercises every feature; `active` rows pass the same gate (lifecycle tests). | Engineering |
| The trial activates server-side only after the qualifying entries exist, once per account | Pass | The store's free trial is the trial (D-070; 7 days on the monthly plan, 14 on the yearly, D-071): Google enforces once per store account and converts it to a paid period; the webhook records it as INITIAL_PURCHASE `period_type = trial`. The 5-entry gate still guards the plan buttons (`companion_trial_eligibility()` answers `needs_entries` first, then `store_trial`); live smoke 2026-10-04. Bookmarkt's own no-card trial (D-068, once per account, live smoke `needs_entries` -> `eligible` -> started -> `trial_used`) stays available behind `bookmarkt_trial_enabled`. | Engineering |
| Denied requests consume neither provider cost nor quota | Pass | Gate order auth -> entitlement -> quota -> provider; denials audited with `status = denied` and no model call (D-047). | Engineering |
| A user who declines, cancels, abandons, or fails purchase returns to capture without losing work | Pass | `purchaseBillingPackage` returns `cancelled` on user cancel; the screen shows "No charge was made and nothing changed" and stays put; failures show the message and keep the reader on the screen (D-068). Real store sheet cancel still to be exercised with the Play product. | Engineering |
| A new subscription grants companion access only after server-authoritative purchase verification and entitlement activation | Pass | Client never writes entitlement rows; activation happens only through the webhook (D-061/D-068); the screen re-reads the row after a purchase. | Engineering |
| Companion sessions are fully reconstructable from audit records | Pass | `companion_usage_events` records entitlement decision, feature, quota outcome, model, tokens, latency, grounding counts (D-047); billing events in `companion_billing_events` (D-068). | Engineering |
| Billing events are verified server-side, idempotent, and reconcilable | Pass | Shared-secret auth; event-id ledger makes re-deliveries no-ops; `last_event_at` ordering guard; 20 Deno unit tests + 29-check live integration smoke 2026-10-04 (D-068). | Engineering |
| Purchase restoration, cancellation, expiry, and refund cases pass | Pass | Live verified on-device 2026-10-07 with Play Store test account: `INITIAL_PURCHASE` (trial) activated entitlement (`status = active`, `source = play_store`, `will_renew = true`), followed by `CANCELLATION` (`cancel_reason = UNSUBSCRIBE`, `will_renew = false`, entitlement remained `active` through `current_period_end = 2026-10-14`). Unit tests and live handler smoke cover remaining cases (BILLING_ISSUE, RENEWAL, EXPIRATION, refunds, transfers). | Engineering |
| Usage quotas enforce cost limits safely | Pass | Per-user and project-wide caps under advisory locks (D-047); verified in production use since 2026-09-02. | Engineering |
| Pricing demonstrates an acceptable expected margin | Pass | Owner's financial model (2026-10-04) -> Monthly $7.99 USD / Yearly $79.99 USD, store trial of 7 days (monthly) / 14 days (yearly) (D-070, D-071). Unit costs stay observable in `companion_usage_events` for the post-beta re-check. | Product owner |
| No unresolved P0/P1 payment, entitlement, or account-lifecycle defect exists | Pass | None open as of 2026-10-07. | Engineering |
| The product owner approves pricing and subscription behavior | Pass | Pricing approved (D-070); subscription behaviour (paywall comparison, free trial start, cancel retain-access until period end) tested and confirmed on device 2026-10-07. | Product owner |

## Defects and unresolved risks

| ID | Severity | Summary | Mitigation or disposition | Owner |
| --- | --- | --- | --- | --- |
| R-1 | P2 | The live `REVENUECAT_WEBHOOK_SECRET` is visible only as a digest in Supabase, so the deployed endpoint cannot be smoke-tested with a real signed payload from here. | Handler logic is exercised directly with a fake secret against the live database (D-068 smoke); the deployed endpoint is probed for 405/401. RevenueCat's dashboard "send test event" is the owner-side check once the product exists. | Engineering |
| R-2 | P3 | The owner's main account (`alfonso_izquierdo97@hotmail.com`) is `dev_comp`, so the plan buttons never appear for it; `aizquier97@gmail.com` had its comp removed 2026-10-05 (D-076) and is the sandbox account. | Closed: verified on device 2026-10-07 with `aizquier97@gmail.com` (paywall table rendered, trial initiated and cancelled successfully). | Product owner |
| R-3 | P3 | Plan-button wording comes from the store's pricing phases; until the Play product `premium` is linked in RevenueCat and the `goog_` key is in place, the Test Store shows prices without a trial phase, so the "7 days free" / "14 days free" lines are verified by unit tests (`planCopy.test.ts`) rather than on a device. | Closed: verified on device 2026-10-07 with live Play billing key (`goog_`). | Engineering |

## Deferred work

| Work | Destination gate | Trigger for earlier action | Accepted risk | Owner |
| --- | --- | --- | --- | --- |
| Real Play Store sandbox purchase cycle (purchase -> cancel) with a license-tester account recorded in this gate | Completed (2026-10-07) | Initial purchase (trial) and cancellation verified in live DB ledger (`companion_billing_events`) and `companion_entitlements`. | None | Product owner & Engineering |
| iOS billing verification (StoreKit sandbox, cross-platform restore) | Stage 5 exit | Apple Developer account approval | Stage 4 exits on Android evidence (D-020) | Engineering |
| Offline receipt handling | Stage 5 exit | First store sandbox cycle | RevenueCat SDK caches receipts; the server stays authoritative | Engineering |
| Custom SMTP for auth emails (Resend via `bookmarkt.io`) - lifts Supabase's built-in hourly email cap and enables branded templates (D-073, STAGE_2_OPERATIONS §8) | Completed (2026-10-07) | Domain `bookmarkt.io` verified in Resend; test email and password reset delivered successfully. | None | Product owner |
| Keep-awake during the Sandglass timer (native module) | Stage 5 (next binary) | Next EAS build | Screen may dim during a sitting (D-062) | Engineering |
| Pattern recognition across books (embeddings + clustering) | Post-beta | Closed-beta buy-in (D-039) | None | Product |
| Social features from the September 2026 feedback (ghost bookmarks, feed, multi-user clubs) | Post-beta | Solo habit loops prove retention (D-062) | None | Product |

## Domain recommendations

| Domain | Recommendation | Reviewer/evidence |
| --- | --- | --- |
| Product | GO | Monthly $7.99 / Yearly $79.99 USD, store trial 7 days monthly / 14 days yearly (D-070, D-071); behaviour confirmed on device |
| Engineering | GO | D-047..D-078 evidence above; 385 tests across 34 suites pass; Deno tests in CI; live billing cycle verified |
| Design/accessibility | GO | Subscription states, trial card, and plan buttons ("7 days free, then $7.99 per month", "Save 17%") follow the D-054 tactile language; every control has a role and label |
| Security/privacy | GO | Entitlement rows RLS-scoped; ledger and policy service-role only (live smokes D-068 and D-070: readers get nothing); trial RPCs SECURITY DEFINER with `auth.uid()` only; no payment details stored |
| Legal/compliance | GO | Purchases only through store IAP (D-061); the free trial is the store's, cancellable from the store (D-070); no web purchase flow |
| Operations/support | GO | SUPPORT_BILLING_DISPUTES.md revised for the ledger, lapse tolerance, and the store trial; STAGE_2_OPERATIONS.md §3 item 5 (policy flag) |

## Decision

- Decision: **Approved** (Stage 4 Exit Complete)
- Decision date: 2026-10-07
- Approver: Bookmarkt product owner
- Conditions and deadlines: All Stage 4 monetization, account self-service, paywall, billing lifecycle, and timer feedback requirements are delivered and verified on device.
- Rationale: Live Play billing purchase and cancellation verified; 1.0.3 Android binary active on Internal track with working bell and character extraction; zero unresolved blockers.
- Next-stage entry date: 2026-10-08 (Stage 5 - Native packaging, Store compliance & iOS setup)
- Approval tag: `stage-4-approved`
