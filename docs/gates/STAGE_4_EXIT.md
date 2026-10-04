# Stage 4 Exit Review - Monetization and accounts

| Field | Value |
| --- | --- |
| Stage | Stage 4 - Monetization and accounts |
| Review type | Exit |
| Status | Draft |
| Review date | Opened 2026-10-05 (review pending) |
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
  tunable policy row (D-068).
- Reader-authored capture, latest-entry boundary, and companion
  grounding/provenance impact: capture never reads the entitlement (verified
  2026-10-05 - only companion features and their offer cards do); every
  companion feature stays grounded in the reader's own rows under RLS with
  the spoiler boundary enforced server-side (D-047..D-052, D-056..D-059).
- User-content storage impact: new tables `companion_entitlements`,
  `companion_usage_events`, `companion_messages`, `entry_embeddings`,
  `reading_sessions`, `companion_billing_events`, `companion_trial_policy`;
  `entries.is_favorite` / `reflection`, `topics.difficulty_override` and
  comprehension columns. All additive, all RLS-scoped; no reader content is
  used to train models.
- Governing decision references: D-046 (entry) through D-068.

## Criteria and evidence

Criteria are the roadmap §13 exit gate. "Pass" means evidenced today;
"Pending" names what still has to happen.

| Criterion | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Entitlements are consistent across iOS and Android test contexts and the server-authoritative account state | Conditional | Android: server row drives both the gate and the UI (D-047, D-061, D-068 live smoke). iOS context does not exist until Stage 5 builds; Stage 4 exits on Android evidence plus server state per D-020. | Engineering |
| A free account keeps full capture functionality and cannot invoke any AI provider | Pass | Capture paths never read the entitlement (2026-10-05 review); the Edge Function denies with 402 before any provider call (D-047; live smoke 2026-10-05: expired and lapsed rows both 402). | Engineering |
| An active companion subscription can use every companion feature within its usage quotas | Pass | Per-feature daily quotas via `consume_companion_quota` (D-047..D-052, D-065); the owner's comped account exercises every feature; `active` rows pass the same gate (lifecycle tests). | Engineering |
| The trial activates server-side only after the qualifying entries exist, once per account | Pass | `companion_trial_eligibility()` / `start_companion_trial()` (D-068); live smoke: `needs_entries` at 0 -> `eligible` at 5 -> started once -> second start `trial_used`; former subscribers `subscription_history`. Final numbers pending pricing (placeholders 7 days / 5 entries). | Engineering |
| Denied requests consume neither provider cost nor quota | Pass | Gate order auth -> entitlement -> quota -> provider; denials audited with `status = denied` and no model call (D-047). | Engineering |
| A user who declines, cancels, abandons, or fails purchase returns to capture without losing work | Pass | `purchaseBillingPackage` returns `cancelled` on user cancel; the screen shows "No charge was made and nothing changed" and stays put; failures show the message and keep the reader on the screen (D-068). Real store sheet cancel still to be exercised with the Play product. | Engineering |
| A new subscription grants companion access only after server-authoritative purchase verification and entitlement activation | Pass | Client never writes entitlement rows; activation happens only through the webhook (D-061/D-068); the screen re-reads the row after a purchase. | Engineering |
| Companion sessions are fully reconstructable from audit records | Pass | `companion_usage_events` records entitlement decision, feature, quota outcome, model, tokens, latency, grounding counts (D-047); billing events in `companion_billing_events` (D-068). | Engineering |
| Billing events are verified server-side, idempotent, and reconcilable | Pass | Shared-secret auth; event-id ledger makes re-deliveries no-ops; `last_event_at` ordering guard; 20 Deno unit tests + 29-check live integration smoke 2026-10-05 (D-068). | Engineering |
| Purchase restoration, cancellation, expiry, and refund cases pass | Conditional | All cases pass in unit tests and the live handler smoke (CANCELLATION, UNCANCELLATION, BILLING_ISSUE, RENEWAL, stale EXPIRATION, duplicate, EXPIRATION, refund sequence, REFUND_REVERSED, TRANSFER). **Pending:** one real Play sandbox cycle (purchase -> cancel -> expire -> restore) once the product exists. | Engineering |
| Usage quotas enforce cost limits safely | Pass | Per-user and project-wide caps under advisory locks (D-047); verified in production use since 2026-09-02. | Engineering |
| Pricing demonstrates an acceptable expected margin | Pending | Financial model in progress (owner). Unit costs are available from `companion_usage_events`. | Product owner |
| No unresolved P0/P1 payment, entitlement, or account-lifecycle defect exists | Pass | None open as of 2026-10-05. | Engineering |
| The product owner approves pricing and subscription behavior | Pending | Subscription behavior is reviewable now (Subscription screen states, trial rule); pricing approval follows the model. | Product owner |

## Defects and unresolved risks

| ID | Severity | Summary | Mitigation or disposition | Owner |
| --- | --- | --- | --- | --- |
| R-1 | P2 | The live `REVENUECAT_WEBHOOK_SECRET` is visible only as a digest in Supabase, so the deployed endpoint cannot be smoke-tested with a real signed payload from here. | Handler logic is exercised directly with a fake secret against the live database (D-068 smoke); the deployed endpoint is probed for 405/401. RevenueCat's dashboard "send test event" is the owner-side check once the product exists. | Engineering |
| R-2 | P3 | The owner's own account is `dev_comp`, so the trial UI and plan buttons never appear for it. | Verify the trial flow with a fresh account (roadmap D-068 checklist). | Product owner |

## Deferred work

| Work | Destination gate | Trigger for earlier action | Accepted risk | Owner |
| --- | --- | --- | --- | --- |
| Play Console subscription product, `goog_` key swap, store introductory offer, final `companion_trial_policy` values | This gate (closes it) | Pricing decision | None - development runs on RevenueCat's Test Store meanwhile | Product owner |
| iOS billing verification (StoreKit sandbox, cross-platform restore) | Stage 5 exit | Apple Developer account approval | Stage 4 exits on Android evidence (D-020) | Engineering |
| Offline receipt handling | Stage 5 exit | First store sandbox cycle | RevenueCat SDK caches receipts; the server stays authoritative | Engineering |
| Keep-awake during the Sandglass timer (native module) | Stage 5 (next binary) | Next EAS build | Screen may dim during a sitting (D-062) | Engineering |
| Pattern recognition across books (embeddings + clustering) | Post-beta | Closed-beta buy-in (D-039) | None | Product |
| Social features from the September 2026 feedback (ghost bookmarks, feed, multi-user clubs) | Post-beta | Solo habit loops prove retention (D-062) | None | Product |

## Domain recommendations

| Domain | Recommendation | Reviewer/evidence |
| --- | --- | --- |
| Product | Pending | Pricing and trial numbers from the financial model |
| Engineering | GO (conditional on one real sandbox cycle) | D-047..D-068 evidence above; 363 tests / 30 suites; Deno tests in CI |
| Design/accessibility | GO | Subscription states and trial card follow the D-054 tactile language; every control has a role and label |
| Security/privacy | GO | Entitlement rows RLS-scoped; ledger and policy service-role only (live smoke: readers get nothing); trial RPCs SECURITY DEFINER with `auth.uid()` only; no payment details stored |
| Legal/compliance | GO | Purchases only through store IAP (D-061); no web purchase flow |
| Operations/support | GO | SUPPORT_BILLING_DISPUTES.md revised for the ledger, lapse tolerance, trial cases; STAGE_2_OPERATIONS.md §3 item 5 |

## Decision

- Decision: *pending*
- Decision date:
- Approver: Bookmarkt product owner
- Conditions and deadlines: pricing decision; Play product created and
  `goog_` key swapped; one real sandbox purchase cycle recorded here;
  `companion_trial_policy` set to the decided values.
- Rationale:
- Next-stage entry date:
- Approval tag: `stage-4-approved` (when granted)
