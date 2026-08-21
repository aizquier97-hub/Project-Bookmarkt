# Stage 2 Exit Review - Architecture Rebuild

| Field | Value |
| --- | --- |
| Stage | Stage 2 - Architecture rebuild |
| Review type | Exit |
| Status | Approved |
| Review date | 2026-08-21 |
| Product owner | Bookmarkt product owner |
| Roadmap version | 2.0 |
| Related gate issue | N/A (single-operator project; review conducted in-session) |

## Outcome required

The native application foundation is maintainable, typed, and tested; every
retained Stage 1 journey works natively against the shared Supabase backend;
voice capture works end-to-end under D-016; the companion foundation is
grounded and entitlement-gated; the PWA is frozen with an approved retirement
runbook.

## Product-scope conformance

- Native iOS/Android impact: Android development build installed and verified
  on the owner's device; iOS deferred to Stage 5 (D-020).
- Physical QR and app/store-routing impact: unchanged; QR codes still point at
  the frozen PWA until the smart-link service (D-015) is built.
- Temporary PWA or retirement impact: PWA frozen; hardened retirement runbook
  approved (D-019), executes in Stage 8.
- Minimal web endpoint impact: none this stage.
- AI Reading Companion subscription and entitlement impact: retrieval
  foundation only, behind a server-authoritative entitlement gate; no user
  surface.
- Reader-authored capture (typed/voice), latest-entry boundary, and companion
  grounding/provenance impact: full native parity; voice adds
  `entries.raw_transcript` with punctuation-only cleanup (D-016).
- User-content storage impact: additive migration only
  (`20260821230000_add_entries_raw_transcript.sql`); RLS unchanged.
- Governing decision references: D-008, D-012, D-014, D-015, D-016, D-017,
  D-018, D-019, D-020.

## Criteria and evidence

Full criterion-by-criterion evidence lives in
[../STAGE_2_EXIT_REVIEW.md](../STAGE_2_EXIT_REVIEW.md) (parity table, gate
status, decision resolutions). Summary:

| Criterion | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Android internal build runs | Pass | EAS build d0af7ec8 installed on owner device | Product owner |
| iOS internal build runs | Deferred to Stage 5 | D-020 | Product owner |
| Retained-journey parity | Pass | STAGE_2_EXIT_REVIEW.md §1 device runs | Product owner |
| Voice capture end-to-end (D-016) | Pass | Owner-verified on device 2026-08-21; cleanup invariant unit-tested | Product owner |
| Companion grounding/entitlement tests | Pass | grounding.test.ts, entitlement.test.ts | Engineering |
| No AI-generation flow; flag disabled | Pass | Config test + live 410 CI probe | Engineering |
| PWA frozen; runbook approved | Pass | D-018 freeze, D-019 approval | Product owner |
| CI green (typecheck, lint, tests, export, migrations) | Pass | .github/workflows/app-ci.yml on main | Engineering |
| Device automation for auth/isolation/images/switching | Deferred | Manual device runs + unit tests pass; automation tracked for Stage 3+ | Engineering |
| Schema/config reproducible | Pass | Migrations + generated types + CI checks | Engineering |
| Ops procedures documented | Pass | STAGE_2_OPERATIONS.md + backup-storage.mjs | Engineering |
| No unresolved P0/P1 | Pass | None open | Product owner |

## Defects and unresolved risks

| ID | Severity | Summary | Mitigation or disposition | Owner |
| --- | --- | --- | --- | --- |
| None | N/A | No open P0/P1/P2 at review time | N/A | N/A |

## Deferred work

| Work | Destination gate | Trigger for earlier action | Accepted risk | Owner |
| --- | --- | --- | --- | --- |
| iOS internal builds | Stage 5 exit | Apple developer account acquired | None — Expo builds both platforms from this codebase | Product owner |
| Device automation (Maestro or equivalent) + native integration tests | Stage 3+ | Regression found that unit tests missed | Manual device passes cover current scope | Engineering |
| Smart-link service (D-015) | Stage 5 | QR reprint or store listing | QR codes still resolve to the frozen PWA | Engineering |
| Structured client telemetry | Stage 3+ | Performance budget breach suspected | Budgets manually observed (§5) | Engineering |
| Safe Supabase test project for integration tests | Stage 3+ | Cross-account automation needed | Typed services + RLS tests cover the boundary | Engineering |

## Domain recommendations

| Domain | Recommendation | Reviewer/evidence |
| --- | --- | --- |
| Product | GO | Product owner device verification, 2026-08-21 |
| Engineering | GO | CI green; 61 tests across 8 suites; typed domain modules |
| Design/accessibility | N/A | Stage 3 scope |
| Security/privacy | GO | RLS unchanged; no raw audio persisted; anon-key-only client |
| Legal/compliance | N/A | Stage 6 scope |
| Operations/support | GO | D-018 runbook + D-019 retirement approval |

## Decision

- Decision: `GO`
- Decision date: 2026-08-21
- Approver: Bookmarkt product owner
- Conditions and deadlines: none (deferred work is tracked above, not
  conditioned)
- Rationale: all mandatory criteria pass on Android; the two non-critical
  deferrals (iOS, device automation) are named, owned, and destination-gated
  per D-020.
- Next-stage entry date: 2026-08-21 (Stage 3 - Polished UI/UX)
- Approval tag: `stage-2-approved`
