# Stage 2 Operations

This runbook operates the native Bookmarkt application (Expo workspace under
`app/`) and the shared Supabase backend, and governs the frozen PWA prototype
through its retirement. It extends [STAGE_1_OPERATIONS.md](STAGE_1_OPERATIONS.md)
(backend safeguards there carry forward unchanged) and implements the Stage 2
reliability/operations checklist in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) §11.
Accepted as Decision D-018 in [DECISION_LOG.md](DECISION_LOG.md).

## 1. Environments and build profiles

Three application environments map one-to-one to the EAS build profiles in
`app/eas.json`. The client refuses to start on a malformed configuration:
`app/src/lib/env.ts` validates `EXPO_PUBLIC_SUPABASE_URL` (https URL),
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_APP_ENV`
(`local` | `preview` | `production`) at import time.

| Environment | Build profile | Update channel | Purpose |
| --- | --- | --- | --- |
| local | `development` | `development` | Simulators, Expo Go, dev clients |
| preview | `preview` | `preview` | Internal installable review builds |
| production | `production` | `production` | Store submission (Stage 5) |

All environments currently share the single Supabase project
(`bfallxtcxxyykcnkedom`); a separate staging project is a Stage 5 prerequisite
before store distribution. Secrets policy is unchanged from Stage 1: publishable
URL/anon values live in `.env`/EAS env per profile, the service-role key exists
only in operator hands (never in the repository, app bundle, or CI), and edge
function secrets live in Supabase function config.

## 2. Version compatibility and over-the-air updates

Expo distinguishes the **native runtime** (compiled binary) from the
**JavaScript bundle** (updatable over the air via EAS Update).

Policy:

- **OTA-eligible:** JS/TS-only changes — screens, domain services, styling,
  copy, query logic — provided they work against the installed runtime's native
  module set.
- **Requires a new build (never OTA):** adding/removing native modules or
  config plugins, changing `app.json` native configuration (scheme, icons,
  splash, permissions), or upgrading the Expo SDK. These change the runtime.
- Each update channel maps to exactly one environment (table above); an update
  published to `preview` can never reach `production` installs.
- Runtime version policy is the SDK version (Expo default): a binary only
  accepts bundles built for its own SDK, which structurally prevents a new
  bundle from calling native code the installed binary lacks.
- **Stale clients:** an installed binary keeps its last-downloaded bundle and
  checks for updates on launch (Expo default). Because the schema is managed
  additively (§3), a client one bundle behind must keep working; any change
  that would break clients older than one bundle requires a forced-update gate,
  which does not exist yet and is recorded as a Stage 5 requirement.
- **Offline behavior:** the app requires connectivity for data operations
  (React Query surfaces the standardized error/timeout states from
  `app/src/components/states.tsx`); the shell itself launches offline from the
  cached bundle. Offline capture queues are out of Stage 2 scope.

## 3. Migration, deployment, and rollback procedures

### Database migrations

- Every schema change is a new file in `supabase/migrations/` named
  `<14-digit-UTC-timestamp>_<snake_case>.sql`; CI enforces the pattern,
  timestamp uniqueness, and ordering (`.github/workflows/app-ci.yml`).
- Migrations are **additive and backward-compatible** while any older client
  may be live: add columns/tables/policies rather than renaming or dropping;
  removal happens only after every distributed bundle has stopped reading the
  old shape.
- Apply order: run against the project with `supabase db push` (or the SQL
  editor mirroring the file exactly), verify, then regenerate types with
  `supabase gen types typescript` into `app/src/lib/database.types.ts` and
  commit both in the same PR. The migration folder in version control is the
  reproducible source of truth for the schema.
- **Rollback is forward-only:** write a new inverse migration rather than
  editing or deleting an applied file. If data was damaged, restore from the
  Supabase backup (metadata) plus the Storage object backup (§4), then
  reconcile (below).

### Application deployment

1. PR to `main` must pass CI (typecheck, lint, jest, Android export sanity,
   migration checks; the live 410 probe guards `main`).
2. Apply any migration first (additive), then release the client change: OTA
   (`eas update --channel <env>`) for JS-only changes, or `eas build` for
   runtime changes.
3. Verify on-device against the release checklist (§6).

### Application rollback

- OTA regression → republish the previous known-good bundle to the channel
  (`eas update:republish`); clients recover on next launch.
- Bad native build → previous binary remains installable from EAS; store-phase
  rollback procedures are a Stage 5 deliverable.
- Backend regression → edge functions redeploy from the previous git revision;
  flags (for example `AI_GENERATION_ENABLED`) flip in function config without
  a deploy. Material flag flips require a decision-log entry (D-012).

### Data reconciliation

After any restore: rejoin `book_images` rows to restored Storage objects by
path (`scripts/backup-storage.mjs` manifest lists every path), delete rows
whose object is unrecoverable (the app already tolerates missing signed URLs),
and spot-check one account's books/entries/characters against the owner's
knowledge. Record the incident and outcome in the decision log if user data
was lost.

## 4. Storage-object backup

Database backups preserve only Storage *metadata*; the image objects live in
the Storage service and need their own export.

- `scripts/backup-storage.mjs` downloads every object in the private
  `book-images` bucket to `backups/storage-<timestamp>/` with a
  `manifest.json` (paths, counts, failures). Requires `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` in the environment; `backups/` is git-ignored so
  user images can never be committed.
- Cadence: weekly during Stage 2 (single-operator project), and before every
  migration touching `book_images` or bucket policies. Automation into a
  scheduled job needs a secret store outside the repository and is deferred to
  Stage 6 (secure administration).
- Restore: re-upload saved files to identical bucket paths; rows reference
  those paths, so no database change is needed (drill this once per stage).

## 5. Performance budgets

Native budgets (roadmap §11), measured on a mid-tier physical Android device
over Wi-Fi; enforcement is manual observation in Stage 2 and becomes automated
telemetry when structured performance telemetry lands (open item, §8):

| Journey | Budget |
| --- | --- |
| Cold start → interactive library (signed in) | ≤ 4 s |
| QR scan → correct book capture screen (app installed, warm) | ≤ 5 s |
| Screen navigation (library → book, cached data) | ≤ 1.5 s |
| Screen load requiring network (uncached book data) | ≤ 3 s |
| Capture interaction feedback (save tap → toast/state) | ≤ 500 ms |
| Bundle export size guard | CI `expo export` must succeed; investigate if the Android bundle grows past ~10 MB |

A journey exceeding its budget on two consecutive releases is a P2 defect.

## 6. Release checklist (internal builds)

Before promoting any build or OTA update to `preview`:

1. CI green on `main` (typecheck, lint, 48-test jest suite, export, migration
   checks, live 410 probe).
2. Migrations applied and `database.types.ts` regenerated with no diff.
3. On-device pass: sign in → library renders → add book (manual + lookup) →
   edit book → entry with page and chapter progress (boundary label updates) →
   character add/edit/delete → photo upload/view/delete → bookmark link/scan →
   report an issue → sign out/sign in → data intact.
4. Cross-account spot check with a second test account (sees only its own
   data).
5. Version/channel confirmed (`eas update --channel preview`; never
   `production` before Stage 5).
6. Performance budgets (§5) eyeballed on the physical device.
7. Storage backup taken if the release touches images or bucket policy.

## 7. PWA freeze and retirement runbook

Per D-008/D-012 the PWA is a temporary prototype, not a launch channel. Its
data lives in the same Supabase project, so retirement is a client shutdown
with **no data migration**.

### Freeze (in force now)

- Scope: critical stabilization fixes only — security, data loss, or a P0/P1
  blocking the product owner's daily use. No features, no styling, no scope.
- Any PWA change requires a decision-log note stating why the freeze was
  breached.
- The service-worker cache name (`bookmarkt-v3`) bumps only when a critical
  fix ships, so installed clients pick it up on next visit.

### Retirement (executes in Stage 8; approved here so it is ready)

1. **Routing:** repoint the QR/smart-link destination from the Netlify PWA to
   the smart-link service (D-015/D-017); installed-app deep links open the
   book, uninstalled mobile users route to the store per D-008.
2. **Access restriction:** replace the PWA at the Netlify URL with a static
   sunset page (install links + support contact); no login form remains.
3. **Service-worker cleanup:** ship a final deploy whose service worker
   installs, deletes all `bookmarkt-*` caches, and unregisters itself
   (`registration.unregister()` in `activate`), so cached installations
   self-destruct on their next visit instead of serving the dead app shell
   forever.
4. **Cached installations:** the sunset page carries the same cleanup script;
   home-screen installs open it after cache cleanup, and abandoned offline
   clients can no longer mutate data once step 5 lands.
5. **User communication:** in-product notice inside the PWA at native beta
   (Stage 7) with install links, repeated on the sunset page. Single-digit
   user count keeps this lightweight.
6. **Backend/data continuity:** accounts, books, entries, characters, images,
   and reports are untouched — the native app reads the same rows under the
   same RLS. Nothing in the backend is PWA-specific except Auth redirect URLs,
   which drop the Netlify origin once the PWA is offline.
7. **Rollback:** Netlify keeps prior deploys; restoring the frozen PWA is a
   one-click rollback of the sunset deploy if retirement uncovers a gap.

Minimal web endpoints that outlive the PWA (per D-008): smart links, install
guidance, privacy, support, and account-deletion obligations.

## 8. Known open items (exit-gate blockers)

Tracked in the Stage 2 exit review; none are silently waived:

- Voice capture (D-016) needs an EAS development build — Expo Go cannot load
  the native speech-recognition module. Needs a product-owner GO to run
  `eas build`.
- iOS internal builds need an Apple developer account and build hardware;
  Android preview builds need only the existing Expo account.
- Device automation (Maestro or equivalent) and native component/integration
  tests are deferred until dev builds exist to run them against.
- The smart-link/store-routing service (D-015) is designed but not built;
  QR codes still point at the frozen PWA URL until it exists.
- Structured client error/performance telemetry is not yet wired; budgets in
  §5 are manually observed.
- Supabase integration tests run against the live project boundary today;
  a safe test project for cross-account automation is still to be provisioned.
