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

The public website is a fourth, simpler surface (D-069): `bookmarkt.io` is
the static `website/` folder served by the Cloudflare Pages project
`project-bookmarkt` (production branch `main`, no build command). It carries
no secrets - the waitlist form posts to Supabase with the publishable key
only, and the `waitlist_signups` table is insert-only for anonymous callers.
Operating details (deploy loop, previews, rollback, reading signups) are in
§3 and in [website/README.md](../website/README.md).

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
- Runtime version policy is `appVersion` (`app.json` →
  `runtimeVersion.policy`): a binary only accepts bundles published while
  `expo.version` equals the version it was built with, which structurally
  prevents a new bundle from calling native code the installed binary lacks.
  `expo.version` is therefore bumped only when a native module is added
  (1.0.0 → 1.0.1 for D-061's `react-native-purchases`).
- **Publishing across a version bump:** testers may still run the previous
  binary after a bump (the 1.0.1 build from 2026-09-04 was never confirmed
  installed, and every September OTA targeted 1.0.0). When the change itself
  adds no native module, publish once per live runtime: run
  `eas update --channel preview` as-is, then temporarily set `expo.version`
  to the older value, publish again, and `git checkout -- app.json`. Code
  that touches the newer module must degrade when it is absent (D-061's lazy
  import does). First done for D-062 on 2026-10-03; repeated for D-063,
  D-064, D-065, and D-066.
- **Local prerequisites for `eas update`:** `npx --yes eas-cli@latest`
  authenticates from the EAS login in `~/.expo/state.json`; the bundle reads
  `app/.env` (gitignored) for the `EXPO_PUBLIC_*` values, which must mirror
  the `build.preview.env` block in `app/eas.json` - the EAS-hosted
  environment has no variables, so do not pass `--environment`.
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
- **Auth and project settings in `supabase/config.toml`** (redirect
  allowlist, password policy, email settings) do not reach the hosted
  project on their own: run `supabase config push` from `supabase/`, review
  the printed diff (it should name only the keys you changed), and confirm.
  D-072 shipped a new redirect URL in the file alone and the confirmation
  link kept falling back to the Site URL until D-074 pushed it.

### Application deployment

1. PR to `main` must pass CI (typecheck, lint, jest, Android export sanity,
   migration checks, Deno test + check of the Edge Functions; the live 410
   probe guards `main`).
2. Apply any migration first (additive), then deploy any changed Edge
   Function (`npx --yes supabase@latest functions deploy <name>
   --project-ref bfallxtcxxyykcnkedom`; `supabase/config.toml` carries each
   function's `verify_jwt`/entrypoint - `companion`, `book-difficulty`,
   `delete-account`, `revenuecat-webhook`, `ai-bookmate`), then release the
   client change: OTA (`eas update --channel <env>`) for JS-only changes, or
   `eas build` for runtime changes. Functions are deployed before the OTA so
   the first updated client never calls a missing endpoint.
3. Verify on-device against the release checklist (§6). For functions, a
   throwaway account created through the Auth admin API (and deleted
   afterwards) exercises the live endpoint without touching reader data -
   first done for `book-difficulty` (D-063), repeated for the companion's
   `comprehension` feature (D-065: fresh call, cached call, persisted grade,
   single usage row, then the account removed) and again for D-066's rubric
   r2 and the tightened `cue_cards` deal.
4. Companion quotas are per-feature daily limits read from function env at
   request time; each has a built-in default and an override secret
   (`COMPANION_*_DAILY_LIMIT`) - `comprehension` defaults to 20/day under
   `COMPANION_COMPREHENSION_DAILY_LIMIT` (D-065). A cache hit or an empty
   book is served before the quota gate and never consumes a unit. A rubric
   change is shipped by bumping `COMPREHENSION_RUBRIC_VERSION` on **both**
   the function and the client (`fitness/comprehension.ts`): the hash
   suffix changes, every cached grade goes stale, and each reader's books
   re-grade at most four per launch within the daily quota (D-066).
5. Billing (D-061 / D-068). `revenuecat-webhook` is the only writer of
   store-sourced `companion_entitlements` rows; RevenueCat authenticates
   with a fixed `Authorization` header equal to the `REVENUECAT_WEBHOOK_SECRET`
   function secret (its value lives in the RevenueCat dashboard; Supabase
   shows only a digest - do not rotate it casually, both sides must change
   together). Every delivery lands in `companion_billing_events` (event id
   primary key; `applied` / `skip_reason` say what happened), so a
   re-delivery is a `duplicate_event` no-op and an out-of-order event is a
   `stale_event` no-op - to re-apply a lost event, re-send it from the
   RevenueCat dashboard rather than editing rows. The `companion` gate and
   the client both lapse an `active` row 7 days past its period end
   (`ACTIVE_LAPSE_TOLERANCE_MS`, keep the two constants equal). The free
   trial is server-side: `companion_trial_policy` (one row: `trial_days`,
   `qualifying_entries`, `bookmarkt_trial_enabled`) is read by
   `companion_trial_eligibility()` / `start_companion_trial()`, so the trial
   length and entry threshold change with one `update` and no release -
   record any change in the decision log. Since D-070 the flag is **false**:
   the store's own free trial is the trial (7 days on the monthly plan, 14
   on the yearly, D-071), the RPCs answer
   `store_trial`, and the entry threshold only gates the plan buttons.
   Setting the flag to true re-enables the Bookmarkt no-card trial on the
   next app launch (no release) - do it only with a decision-log entry, and
   never while a store trial offer is live, or new readers get two trials.
   Prices live in the Play Console, not in code: the plan buttons print the
   store's pricing phases, so a price change needs no release either.
   The webhook's decision logic is pure (`lifecycle.ts`) and covered by Deno
   tests that CI runs (`edge-functions` job); a live integration smoke with
   a throwaway user (trial RPCs, the full event sequence through the handler,
   the deployed 402 gate, the deployed 405/401 endpoint) was the D-068
   verification and is the pattern to repeat after any webhook change.

### Application rollback

- OTA regression → republish the previous known-good bundle to the channel
  (`eas update:republish`); clients recover on next launch.
- Bad native build → previous binary remains installable from EAS; store-phase
  rollback procedures are a Stage 5 deliverable.
- Backend regression → edge functions redeploy from the previous git revision;
  flags (for example `AI_GENERATION_ENABLED`) flip in function config without
  a deploy. Material flag flips require a decision-log entry (D-012).

### Website deployment and rollback (bookmarkt.io, D-069)

- Deploy = merge to `main`. Cloudflare Pages publishes `website/` within a
  minute; every pull request that touches the folder gets a preview URL as
  the "Cloudflare Pages" check. There is no build, so the only failure mode
  is a missing `website/` folder - the dashboard's "Retry deployment" rebuilds
  the *same* old commit, so retrying a pre-D-069 row fails forever and means
  nothing; deploy by merging instead.
- Rollback → Cloudflare Pages → Deployments → "Rollback to this deployment"
  on the previous green row (instant), then fix forward on `main`.
- Waitlist data: `waitlist_signups` is readable only with the service role
  (Supabase Table Editor or `db query`); anonymous callers may only insert
  `email`, `name`, `platform`, `currently_reading`. A trigger normalises the
  row and refuses more than 300 signups an hour (`waitlist_rate_limited`), so
  a flood shows as 400s on the site, not as rows. Signups are personal data:
  they belong in the Stage 6 data inventory and are deleted on request from
  `support@bookmarkt.io`.
- Email: `support@bookmarkt.io` is the address printed on the site; it needs
  Cloudflare Email Routing (owner task) before it delivers anywhere.

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
- Any PWA change requires product-owner approval and a decision-log note
  stating why the freeze was breached.
- Freeze-breach deploy checklist (all steps required):
  1. Product-owner approval recorded in the decision log.
  2. Bump the service-worker cache name (`bookmarkt-v3` → `-v4`, …) so
     installed clients fetch the fix instead of serving stale caches.
  3. Verify the fix on the live URL after deploy.

### Retirement (executes in Stage 8; approved here so it is ready)

Steps run in this order — later steps depend on earlier ones:

1. **Notice period:** the in-product notice ships inside the PWA at native
   beta (Stage 7) with install links; the sunset deploy waits at least
   14 days after the notice is live. The sunset page repeats the notice.
2. **Test the self-destructing service worker** on a Netlify deploy preview
   before production: confirm it installs, deletes all `bookmarkt-*` caches,
   and completes `registration.unregister()`. A broken self-destruct can only
   be fixed by shipping another worker, so it is proven before the final
   deploy.
3. **Ship the final cleanup deploy to the live PWA URL** while QR codes still
   point at it: the worker self-destructs on each client's next visit —
   including QR scanners in the transition window, who would never receive it
   after repointing.
4. **Stand up and verify the smart-link service** (D-015/D-017): confirm
   installed-app deep links open the book and uninstalled mobile users route
   to the store per D-008.
5. **Repoint the QR/smart-link destination** from the Netlify URL to the
   verified smart-link service.
6. **Replace the PWA at the Netlify URL with the static sunset page**
   (install links + support contact, no login form), carrying the same
   cache-cleanup script for home-screen installs. Verify it renders on a
   clean device before proceeding.
7. **Drop the Netlify origin from Supabase Auth redirect URLs** — only after
   the sunset page is confirmed live, so no one hits an unexplained auth
   error mid-transition. At the same time move **Site URL** off the Netlify
   origin (to `https://bookmarkt.io`): the app's own links already name
   their redirect (`bookmarkt:///reset-password`, `bookmarkt:///email-confirmed`,
   D-072), so Site URL is only the fallback. This blocks link-based flows (recovery, OAuth) from
   the old origin; new sign-ins stop because the sunset page has no login
   form. Existing tokens expire naturally (access-token TTL, ~1 hour) and RLS
   enforces correct data access throughout; a hard stop, if ever needed, is
   revoking sessions in the Supabase dashboard.
8. **Audit Netlify environment variables** and remove any not needed by the
   sunset page. (The PWA ships only the public anon key — safe by design
   under RLS — but the audit keeps the retired site a zero-secret surface.)
9. **Confirm rollback:** note the last frozen-PWA deploy ID; Netlify keeps
   prior deploys, so restoring it is a one-click rollback if retirement
   uncovers a gap.

**Backend/data continuity (throughout):** accounts, books, entries,
characters, images, and reports are untouched — the native app reads the same
rows under the same RLS. Retirement is a client shutdown; no data migrates at
any step.

Minimal web endpoints that outlive the PWA (per D-008): smart links, install
guidance, privacy, support, and account-deletion obligations. Their home is
`bookmarkt.io` (D-069): the landing page and waitlist are live there now; the
privacy, support, and account pages land in Stage 6, and the smart-link
service (D-015) can sit under the same domain when it is built.

## 8. Known open items (carried forward at the Stage 2 exit gate)

Stage 2 closed with `GO` (D-020). These items were not silently waived — each
is named in [gates/STAGE_2_EXIT.md](gates/STAGE_2_EXIT.md) (Deferred work) and
now sits in the receiving stage's roadmap work plan:

- iOS internal builds need an Apple developer account — Stage 5 work plan
  (D-020). Android internal builds are done (dev build d0af7ec8,
  owner-verified 2026-08-21).
- Device automation (Maestro or equivalent) and native component/integration
  tests are now unblocked by the Android dev build — Stage 3 work plan.
- The smart-link/store-routing service (D-015) is designed but not built;
  QR codes still point at the frozen PWA URL until it exists — Stage 5 work
  plan, before the retirement switch.
- Structured client error/performance telemetry is not yet wired; budgets in
  §5 are manually observed — Stage 5 work plan (crash/performance
  monitoring), pulled into Stage 3 early if a §5 budget is breached.
- Supabase integration tests run against the live project boundary today;
  a safe test project for cross-account automation is still to be
  provisioned — Stage 3 work plan.
- `eas.json` preview/production profiles still need
  `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`; the first
  preview build is in the Stage 3 work plan (dev builds get these from
  Metro; release builds embed them).
- **Auth emails go out through Supabase's built-in sender**, which caps the
  project at a handful of messages an hour (confirmation and recovery share
  the cap) and surfaces as "email rate limit exceeded" (D-073). Before any
  tester beyond the owner creates an account, configure **custom SMTP** in
  Supabase → Authentication → SMTP Settings: Resend (free tier is ample),
  domain `bookmarkt.io` verified in Resend with its DNS records added in
  Cloudflare, sender `noreply@bookmarkt.io`, then raise the hourly email
  rate limit under Authentication → Rate Limits. This also unlocks the
  branded email templates `config.toml` notes as deferred. Owner action.
  **Runbook (D-075):** (1) resend.com → sign up → *Domains → Add domain*
  `bookmarkt.io` (region closest to the project) → copy the DKIM/SPF/MX
  records it shows into Cloudflare DNS (proxy **off**) → wait for
  "Verified"; (2) *API Keys → Create*, permission *Sending access*, domain
  `bookmarkt.io` - the key is shown once; (3) hand the key over out of band
  (never into the repo); the agent sets `RESEND_API_KEY` in the shell,
  uncomments the `[auth.email.smtp]` block in `supabase/config.toml` (host
  `smtp.resend.com`, port 465, user `resend`, `pass = "env(RESEND_API_KEY)"`)
  and the `[auth.rate_limit] email_sent = 100` line, runs `supabase config
  push`, and confirms with a password-reset email. Alternatively paste the
  same values into the dashboard SMTP page yourself - the push diff will
  then show them as remote-only and leave them alone.
