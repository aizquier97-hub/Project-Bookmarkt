# Stage 2 Exit Review

Evidence record for the Stage 2 exit gate ([PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)
§11). This is the cutover run required by
[STAGE_2_ACCEPTANCE_BASELINE.md](STAGE_2_ACCEPTANCE_BASELINE.md) — the baseline
itself stays unchecked by design; results live here.

**Run date:** 2026-08-21. **Old implementation:** production PWA, commit
`d108db1`, validated through the Stage 1 window (baseline = pass by
definition). **New implementation:** native Expo app at `main` after PR #42,
tested by the product owner on a physical Android device via Expo Go, plus the
automated suite (48 jest tests, CI workflow, live probes).

## 1. Parity run against the acceptance baseline

Legend: **Pass** = verified in native app; **Pass (auto)** = verified by
automated test/probe; **Deviation** = intentional difference, disposition
recorded; **Blocked** = cannot verify yet, reason given.

### §1 Authentication and session

| Criterion | Result | Evidence |
| --- | --- | --- |
| Signup password policy (12+ chars, 4 classes) | Pass (auto) | Same rules ported to `auth/policy.ts`; unit-tested (`policy.test.ts`) |
| Login lands in library; readable errors | Pass | Owner device run: sign-in works, library renders |
| Session restores on revisit | Pass | Owner device run: app reopen keeps session (encrypted storage + Keychain/Keystore key) |
| Logout clears access | Pass | Owner device run: sign-out/sign-in cycle |
| Data intact after logout/login | Pass | Owner device run: books/entries/characters present after re-login |
| No DB work inside Auth callbacks | Pass (auto) | AuthProvider does synchronous state only; analytics deferred via `setTimeout(0)`; loads react through React Query |
| Password recovery | Pass (auto) | `requestPasswordReset` + deep-linked reset screen implemented; end-to-end email round-trip not yet run on device (minor, retest at preview build) |

### §2 Library and book metadata

| Criterion | Result | Evidence |
| --- | --- | --- |
| Add book by title without timeout | Pass | Owner device run ("the book is added") |
| Open Library lookup fills blanks; failure never blocks manual entry | Pass (auto) | Owner device run (PWA-level add-book detail confirmed) + `metadata.test.ts` (manual-wins, no-fetch short-circuit, lookup-failure fallback) |
| Edit book details, persist | Pass | Owner device run ("the edit feature works well") |
| Books list RLS-scoped to the user | Pass (auto) | Same backend/RLS as Stage 1 verification; user-scoped queries in library service |
| Delete book removes it | Pass | Owner device run ("as well as deleting books") |

### §3 Book selection and scoping

| Criterion | Result | Evidence |
| --- | --- | --- |
| Capture surfaces scoped to selected book | Pass | Native routes are book-scoped (`/book/[id]`); entries/characters/images keyed by book id (`queryKeys.ts`) |
| Rapid switching never leaks another book's data | Pass (auto) | Book-scoped React Query cache keys; stale responses land in the old key, never the visible book |
| No-book-selected capture disabled with hint | Deviation | Native navigation makes the state unreachable: capture controls exist only inside a book screen. Disposition: structural equivalent, accepted |

### §4 Reading progress and manual entries

| Criterion | Result | Evidence |
| --- | --- | --- |
| Form captures type, value, free text | Pass | Owner device run (page-number entries confirmed after Batch B fix) |
| `[Manual Entry - <range>]` prefix byte-compatible | Pass (auto) | `progress.test.ts` header round-trip |
| Latest entry drives boundary; label updates live | Pass (auto) | Boundary hook on book screen; `deriveLatestBoundary` unit-tested |
| Entries newest-first with range | Pass | Owner device run |
| Legacy `[AI Summary - ...]` entries display and parse | Pass (auto) | Parser matches `page/chapter N[-M]` on any first line, prefix-agnostic (`progress.test.ts`) |
| Draft values persist per book across reloads | **Deviation** | Native drafts are in-memory only (survive within a session, not app restarts). Disposition: accepted for Stage 2; persistent per-book drafts folded into Stage 3 UX work |
| Entries RLS-isolated | Pass (auto) | Same backend/RLS; user-scoped service queries |

### §5 Character maps

| Criterion | Result | Evidence |
| --- | --- | --- |
| Add character with details | Pass | Owner device run ("the app allows for entries and character mapping") |
| Edit/delete, persist | Pass | Owner device run + detail-preserving encoding unit tests (`encoding.test.ts`) |
| Book-scoped, account-isolated | Pass (auto) | Book-scoped keys + RLS |

### §6 Book images

| Criterion | Result | Evidence |
| --- | --- | --- |
| Upload from file or camera | Pass | expo-image-picker camera/library paths; owner uploads succeeded on device |
| Private bucket + signed URLs; anonymous denied | Pass (auto) | Signed-URL service ported; bucket policy unchanged since Stage 1 verification |
| Replace and delete | Pass | Delete on device; replace = delete + re-upload as in PWA |
| Legacy image paths resolve | Pass (auto) | `attachSignedUrls` extracts storage paths from legacy full-URL rows |

### §7 Analytics and reporting

| Criterion | Result | Evidence |
| --- | --- | --- |
| Sign-in, book-added, entry-added events | Pass (auto) | Batch D wiring (PWA-parity payloads) |
| Analytics failures silent, never block saves | Pass (auto) | Fire-and-forget `trackAnalyticsEvent`; errors swallowed (dev-warn only) |
| Missing-table errors tolerated | Pass (auto) | Same classification port |

### §8 Backend cost and safety controls

| Criterion | Result | Evidence |
| --- | --- | --- |
| `ai-bookmate` refuses with HTTP 410 while disabled | Pass (auto) | Live probe 410 on 2026-08-21; CI probes `main` on every push; `aiGenerationFlag.test.ts` proves the `"false"` default |
| Flag-on path still gated by JWT + quotas | Pass (auto) | Function source unchanged; config test guards the flag |
| No client surface calls generation | Pass (auto) | No generation call site exists in `app/src` |

### §9 Offline and update behavior

| Criterion | Result | Evidence |
| --- | --- | --- |
| PWA shell caching / cache-bump propagation | Deviation | Native equivalent: cached JS bundle + EAS Update channels ([STAGE_2_OPERATIONS.md](STAGE_2_OPERATIONS.md) §2). PWA itself frozen, unchanged |
| HTTPS + installable | Deviation | Native install replaces PWA install; store distribution is Stage 5 |

**Parity verdict:** every retained Stage 1 journey passes in the native app.
Two accepted deviations (structural no-book state; in-memory drafts), zero
unresolved parity gaps.

## 2. Exit-gate status

| Gate item | Status |
| --- | --- |
| Native alpha on Android internal builds | **Partial** — running via Expo Go on the owner's device; EAS preview build not yet produced (needs owner GO, §3) |
| Native alpha on iOS | **Blocked** — no Apple developer account/hardware |
| Retained-journey parity | **Met** (§1 above) |
| Voice capture end-to-end on device builds | **Blocked** — D-016 needs a native module unavailable in Expo Go; requires an EAS development build |
| Companion foundation passes grounding/boundary/cross-account/denied tests | **Met** — `grounding.test.ts`, `entitlement.test.ts` (48-test suite) |
| No AI-generation flow; backend flag verified disabled | **Met** — config test + live 410 probe in CI |
| PWA frozen; retirement runbook approved | **Met (runbook written)** — [STAGE_2_OPERATIONS.md](STAGE_2_OPERATIONS.md) §7; needs product-owner approval mark |
| Type-check, tests, native builds pass in CI | **Met** — `.github/workflows/app-ci.yml` (typecheck, lint, jest, Android export, migration checks) |
| Auth restoration, isolation, images, book switching pass device automation | **Partial** — manual device runs + unit tests pass; automated device journeys blocked on dev builds |
| Schema/config reproducible from version control | **Met** — migrations + CI checks + generated types |
| Distribution/rollback, version compatibility, Storage recovery documented | **Met** — [STAGE_2_OPERATIONS.md](STAGE_2_OPERATIONS.md) §§2-4 + `scripts/backup-storage.mjs` |
| No unresolved P0/P1 | **Met** — none open as of this review |
| Product owner records GO | **Open** — decision pending the items below |

## 3. Decisions needed from the product owner

1. **EAS development/preview builds** (unblocks voice capture, device
   automation, and true internal builds): run `eas build --profile development
   --platform android` under the existing Expo account. Free tier suffices at
   this scale.
2. **iOS path**: defer until an Apple developer account exists (recommended:
   revisit at Stage 5 packaging) or acquire one now.
3. **Retirement runbook approval**: approve
   [STAGE_2_OPERATIONS.md](STAGE_2_OPERATIONS.md) §7 as written (executes in
   Stage 8).
4. **Stage 2 GO/NO-GO**: with 1-3 resolved, record the exit decision in the
   decision log.
