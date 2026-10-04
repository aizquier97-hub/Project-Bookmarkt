# Stage 4 Exit Review - Monetization and accounts

| Field | Value |
| --- | --- |
| Stage | Stage 4 - Monetization and accounts |
| Review type | Exit |
| Status | Draft |
| Review date | Opened 2026-10-04 (review pending); pricing decided 2026-10-04 (D-070) |
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
| The trial activates server-side only after the qualifying entries exist, once per account | Pass | The store's 7-day free trial is the trial (D-070): Google enforces once per store account and converts it to a paid period; the webhook records it as INITIAL_PURCHASE `period_type = trial`. The 5-entry gate still guards the plan buttons (`companion_trial_eligibility()` answers `needs_entries` first, then `store_trial`); live smoke 2026-10-04. Bookmarkt's own no-card trial (D-068, once per account, live smoke `needs_entries` -> `eligible` -> started -> `trial_used`) stays available behind `bookmarkt_trial_enabled`. | Engineering |
| Denied requests consume neither provider cost nor quota | Pass | Gate order auth -> entitlement -> quota -> provider; denials audited with `status = denied` and no model call (D-047). | Engineering |
| A user who declines, cancels, abandons, or fails purchase returns to capture without losing work | Pass | `purchaseBillingPackage` returns `cancelled` on user cancel; the screen shows "No charge was made and nothing changed" and stays put; failures show the message and keep the reader on the screen (D-068). Real store sheet cancel still to be exercised with the Play product. | Engineering |
| A new subscription grants companion access only after server-authoritative purchase verification and entitlement activation | Pass | Client never writes entitlement rows; activation happens only through the webhook (D-061/D-068); the screen re-reads the row after a purchase. | Engineering |
| Companion sessions are fully reconstructable from audit records | Pass | `companion_usage_events` records entitlement decision, feature, quota outcome, model, tokens, latency, grounding counts (D-047); billing events in `companion_billing_events` (D-068). | Engineering |
| Billing events are verified server-side, idempotent, and reconcilable | Pass | Shared-secret auth; event-id ledger makes re-deliveries no-ops; `last_event_at` ordering guard; 20 Deno unit tests + 29-check live integration smoke 2026-10-04 (D-068). | Engineering |
| Purchase restoration, cancellation, expiry, and refund cases pass | Conditional | All cases pass in unit tests and the live handler smoke (CANCELLATION, UNCANCELLATION, BILLING_ISSUE, RENEWAL, stale EXPIRATION, duplicate, EXPIRATION, refund sequence, REFUND_REVERSED, TRANSFER). **Pending:** one real Play sandbox cycle (purchase -> cancel -> expire -> restore) once the product exists. | Engineering |
| Usage quotas enforce cost limits safely | Pass | Per-user and project-wide caps under advisory locks (D-047); verified in production use since 2026-09-02. | Engineering |
| Pricing demonstrates an acceptable expected margin | Pass | Owner's financial model (2026-10-04) -> Monthly $7.99 USD / Yearly $59.99 USD, 7-day store trial on both (D-070). Unit costs stay observable in `companion_usage_events` for the post-beta re-check. | Product owner |
| No unresolved P0/P1 payment, entitlement, or account-lifecycle defect exists | Pass | None open as of 2026-10-04. | Engineering |
| The product owner approves pricing and subscription behavior | Pending | Pricing approved by the owner's own decision (D-070) and rendered on the plan buttons from the store's phases. Subscription behavior is reviewable now (Subscription screen states, entries gate); the owner's sign-off on the behaviour follows the fresh-account check and the first sandbox cycle. | Product owner |

## Defects and unresolved risks

| ID | Severity | Summary | Mitigation or disposition | Owner |
| --- | --- | --- | --- | --- |
| R-1 | P2 | The live `REVENUECAT_WEBHOOK_SECRET` is visible only as a digest in Supabase, so the deployed endpoint cannot be smoke-tested with a real signed payload from here. | Handler logic is exercised directly with a fake secret against the live database (D-068 smoke); the deployed endpoint is probed for 405/401. RevenueCat's dashboard "send test event" is the owner-side check once the product exists. | Engineering |
| R-2 | P3 | The owner's own account is `dev_comp`, so the plan buttons and the entries gate never appear for it. | Verify the flow with a fresh account (roadmap D-070 checklist): locked card at 0/5, then the plan buttons with "7 days free, then $7.99 per month". | Product owner |
| R-3 | P3 | Plan-button wording comes from the store's pricing phases; until the Play product exists the Test Store shows prices without a trial phase, so the "7 days free" line is verified by unit tests (`planCopy.test.ts`) rather than on a device. | First sandbox cycle with the `goog_` key confirms it on-device; a missing phase degrades to the price alone, never to wrong copy. | Engineering |

## Deferred work

| Work | Destination gate | Trigger for earlier action | Accepted risk | Owner |
| --- | --- | --- | --- | --- |
| Play Console subscription `companion` (base plans `monthly` / `yearly`, 7-day free-trial offers), RevenueCat product/entitlement/offering mapping, `goog_` key swap, one sandbox cycle | This gate (closes it) | Pricing decided 2026-10-04 (D-070) - owner-side setup is the only remaining input | None - development runs on RevenueCat's Test Store meanwhile | Product owner |
| iOS billing verification (StoreKit sandbox, cross-platform restore) | Stage 5 exit | Apple Developer account approval | Stage 4 exits on Android evidence (D-020) | Engineering |
| Offline receipt handling | Stage 5 exit | First store sandbox cycle | RevenueCat SDK caches receipts; the server stays authoritative | Engineering |
| Keep-awake during the Sandglass timer (native module) | Stage 5 (next binary) | Next EAS build | Screen may dim during a sitting (D-062) | Engineering |
| Pattern recognition across books (embeddings + clustering) | Post-beta | Closed-beta buy-in (D-039) | None | Product |
| Social features from the September 2026 feedback (ghost bookmarks, feed, multi-user clubs) | Post-beta | Solo habit loops prove retention (D-062) | None | Product |

## Domain recommendations

| Domain | Recommendation | Reviewer/evidence |
| --- | --- | --- |
| Product | GO (pricing) | Monthly $7.99 / Yearly $59.99 USD, 7-day store trial (D-070); behaviour sign-off after the fresh-account check |
| Engineering | GO (conditional on one real sandbox cycle) | D-047..D-070 evidence above; 372 tests across 31 suites pass; Deno tests in CI |
| Design/accessibility | GO | Subscription states, trial card, and plan buttons ("7 days free, then $7.99 per month", "Save 37%") follow the D-054 tactile language; every control has a role and label |
| Security/privacy | GO | Entitlement rows RLS-scoped; ledger and policy service-role only (live smokes D-068 and D-070: readers get nothing); trial RPCs SECURITY DEFINER with `auth.uid()` only; no payment details stored |
| Legal/compliance | GO | Purchases only through store IAP (D-061); the free trial is the store's, cancellable from the store (D-070); no web purchase flow |
| Operations/support | GO | SUPPORT_BILLING_DISPUTES.md revised for the ledger, lapse tolerance, and the store trial; STAGE_2_OPERATIONS.md §3 item 5 (policy flag) |

## Decision

- Decision: *pending*
- Decision date:
- Approver: Bookmarkt product owner
- Conditions and deadlines: Play product `companion` created with both base
  plans and trial offers; RevenueCat mapping done and `goog_` key swapped;
  one real sandbox purchase cycle recorded here; fresh-account check of the
  entries gate and plan buttons. (Pricing decided and
  `companion_trial_policy` set 2026-10-04, D-070.)
- Rationale:
- Next-stage entry date:
- Approval tag: `stage-4-approved` (when granted)
