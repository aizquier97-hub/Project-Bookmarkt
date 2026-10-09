# Stage 5 Build Plan - Native iOS and Android packaging

**Status:** Active (entered 2026-10-08 with D-085). Stage 4 closed on
2026-10-07 (D-079); the Android Internal-testing track is live on 1.0.4,
with the 1.0.5 artwork build (Phase 3, D-088) as the next release.

This plan carries the Stage 5 work plan from
[PRODUCT_ROADMAP.md §14](PRODUCT_ROADMAP.md) phase by phase. Phase 1 is
everything that can be done for iOS **before** an Apple Developer account
exists, so that the first TestFlight build is a single command on the day
the account is approved. The owner-side runbook that follows it mirrors the
Play Internal testing runbook in
[STAGE_4_BUILD_PLAN.md](STAGE_4_BUILD_PLAN.md).

---

## Phase 1 - iOS build readiness (D-085, shipped 2026-10-08)

Goal: the `main` branch builds, signs and submits to TestFlight with no
further code change once the account exists; Apple review requirements that
are code-visible are already met; nothing promised in an iOS usage string is
untrue.

### Native configuration (`app/app.json`)

- [x] `ios.bundleIdentifier` **`com.inkmarkt.bookmarkt`** - the same string
      as the Android package, so the RevenueCat project, Supabase redirect
      allow-list and the future Universal Links AASA file name one app.
      Permanent once the first build is uploaded.
- [x] `ios.supportsTablet: false` - iPhone only until the tablet layout pass
      (roadmap item below). iPads can still install it in iPhone
      compatibility mode; App Store screenshots are iPhone-only.
- [x] `ios.config.usesNonExemptEncryption: false` - writes
      `ITSAppUsesNonExemptEncryption = false` into the Info.plist so App
      Store Connect does not ask the export-compliance question on every
      upload. See "Export compliance" below for what the owner confirms.
- [x] `ios.entitlements` - `com.apple.developer.usernotifications.time-sensitive`
      so the Sandglass bell (D-083, `interruptionLevel: 'timeSensitive'`)
      breaks through Focus modes. EAS syncs the matching capability onto the
      bundle ID at the first build (verified in eas-cli's capability map);
      the `aps-environment` entitlement the `expo-notifications` plugin adds
      (Push Notifications capability) is unused - Bookmarkt schedules local
      notifications only - and harmless.
- [x] `ios.privacyManifests` - `NSPrivacyTracking: false` and the four
      required-reason API categories that Expo, React Native and
      AsyncStorage touch: UserDefaults `CA92.1`, FileTimestamp `C617.1`,
      SystemBootTime `35F9.1`, DiskSpace `E174.1`. Each listed SDK also
      ships its own `PrivacyInfo.xcprivacy`; Xcode merges them at archive.
- [x] Usage strings, all specific (Apple rejects generic ones):
      microphone and speech recognition (existing, D-065), camera (existing,
      barcode scan), **photo library** (new, via the `expo-image-picker`
      plugin - the picker is used only to attach pictures to a book),
      **Face ID** (new, via the `expo-secure-store` plugin: "Bookmarkt
      stores your sign-in on this device; Face ID is never requested" -
      SecureStore is used without `requireAuthentication`, the string
      exists because the module links LocalAuthentication).
- [x] Verified with `npx expo config --type introspect`: the resolved
      `ios.infoPlist`, `entitlements` and `privacyManifests` match the
      above, `CFBundleURLTypes` carries `bookmarkt` and the bundle ID.
      `npx expo prebuild --platform ios` refuses to run on Windows; EAS runs
      it on its macOS builders, from exactly this config.
- [x] `npx expo export --platform ios` succeeds (the CI export step runs
      Android; the iOS bundle was exported locally once for D-085).

### Build and submit profiles (`app/eas.json`)

- [x] **`testflight-internal`** build profile: extends `preview` (live
      Supabase project, `preview` update channel), `distribution: store`,
      `autoIncrement: true` (remote `buildNumber`, D-077 pattern),
      `environment: preview` so EAS environment variables in the *preview*
      environment are applied (a `distribution: store` profile would
      otherwise infer `production`), device build (`simulator: false`).
- [x] `submit.testflight-internal` profile (empty iOS block): `eas submit`
      asks for the App Store Connect app on first use and stores it.

### Runtime version policy - decision

The roadmap carried "switch `runtimeVersion` from `appVersion` to the
`fingerprint` policy at the first Stage 5 native build". **Not done, on
purpose.** The fingerprint is computed where `eas update` runs; this project
publishes updates from a Windows checkout (CRLF line endings, different
`node_modules` layout) and EAS computes the build's fingerprint on its macOS
and Linux workers. A mismatch would not fail loudly - the update would simply
never be delivered to the binary. The D-083 discipline (any native change
bumps `version`, and the version *is* the runtime) gives the same protection
with a value both sides compute identically, so the item closes as
"deliberately kept `appVersion`". Revisit only if an OTA ever has to be
withheld from one binary that shares a version with another.

### App Review requirements met in code

| Guideline | Requirement | Where |
| --- | --- | --- |
| 3.1.2 (subscriptions) | Terms of Use (EULA) and privacy policy links near the purchase buttons | `subscription.tsx` footer: *Privacy policy* (`https://bookmarkt.io/privacy`) and, on iOS only, *Terms of Use* -> Apple's standard EULA (`apple.com/legal/internet-services/itunes/dev/stdeula/`), which Apple accepts in place of a custom one. Android shows the privacy link only; Play has no equivalent rule. `domains/billing/legalLinks.ts`. A Bookmarkt-written Terms page is a Stage 6 item. |
| 3.1.1 | Restore purchases | Existing *Restore purchases* link (D-070). |
| 5.1.1 (data collection) | Privacy policy reachable in the app, not only in the listing | Settings -> Support -> **Privacy policy** row, new. |
| 5.1.1 (permissions) | Purpose strings that say what the data is for | Strings above. |
| 5.1.2 | No tracking | `NSPrivacyTracking: false`; no ad or analytics SDK beyond first-party `analytics_events`. |
| 4.0 / 2.1 | Nothing in the app says "not available on this platform" | RevenueCat initialises only when a key exists for the platform (below); until the Apple key is in place the Subscription screen shows the existing "Purchases are not available in this build" state, which is acceptable for TestFlight and must be gone before App Review. |

### Billing on iOS

- [x] `domains/billing/purchases.ts` picks the RevenueCat public SDK key per
      platform: `goog_...` (D-071) on Android, **`appl_...`** on iOS from
      `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` (empty until the owner has it).
      `revenueCatKeyFor(platform)` returns `null` when the store is not set
      up, and `ensureBillingReady` then reports billing `unavailable`
      instead of throwing - the Subscription screen already renders that
      state.
- [x] The client reads product IDs, prices and trial phases from the
      RevenueCat offering (`default`, `$rc_monthly` / `$rc_annual`, D-070),
      so attaching the App Store products to the same packages needs **no
      app change**. Prices mirror Play: $6.99 / $69.99 USD (D-081).

### Dictation on iOS

- [x] The iOS speech usage string says "audio never leaves your phone".
      `expo-speech-recognition` on iOS falls back to Apple's servers unless
      the session sets `requiresOnDeviceRecognition`, so
      `domains/voice/recognition.ts` now (a) offers dictation on iOS only
      when `supportsOnDeviceRecognition()` is true and (b) starts every iOS
      session with `requiresOnDeviceRecognition: true`, `addsPunctuation`
      and `iosTaskHint: 'dictation'`. Android behaviour is unchanged (its
      on-device preference is already set, D-065). `recognition.test.ts`.

### Already iOS-capable, verified, no change

- Sandglass bell (`domains/fitness/timerAlarm.ts`): `timeSensitive`
  interruption level, no channel on iOS, `isExactAlarmAllowed()` is `true`
  on iOS (no exact-alarm permission exists there); `modules/exact-alarms`
  is Android-only behind a JS guard that returns `null` on iOS.
- Secure session storage (`lib/supabase.ts`): AES-CTR via `aes-js` with the
  key in `expo-secure-store` (Keychain on iOS) - the Expo-documented
  pattern, platform-neutral.
- Deep links: `scheme: bookmarkt`; the auth-link root handler (D-080) uses
  `expo-linking` APIs that behave the same on iOS.
- No social sign-in, so *Sign in with Apple* (4.8) is not required.

### Tests and validation (D-085)

`storeSetup.test.ts` (`revenueCatKeyFor`, `subscriptionLegalLinks`) and
`recognition.test.ts` (`dictationOffered`, `dictationStartOptions`) added;
**424 tests / 40 suites**, `tsc` and `eslint` clean, Android and iOS
exports succeed. Shipped as PR #142 (`d28ae8b`); the JS-visible parts went
OTA to runtime 1.0.4 on 2026-10-08, update group
`61dcdd25-eff0-4049-8bc9-b0e166106487` (android + ios - the first iOS
1.0.4 binary picks it up on launch).

### Export compliance - what the owner confirms

`usesNonExemptEncryption: false` declares that the app uses no encryption
beyond what is exempt. Bookmarkt uses HTTPS (Apple's OS implementation) and
`aes-js` to encrypt the stored sign-in session at rest with a Keychain-held
key - a standard published algorithm, protecting the reader's own data, no
custom cryptography. That is the answer most Expo apps with this exact
pattern give. The owner should read Apple's two export-compliance questions
once, in App Store Connect -> App -> App Information -> *Export Compliance
Information*, and confirm the answer; if the owner prefers the conservative
route (treat `aes-js` as mass-market encryption, file the annual BIS
self-classification report), change the flag to `true` and answer the
questionnaire per build. Either way no Apple-side blocker exists for
TestFlight.

### Not in Phase 1 (owner artwork or later phases)

- ~~`ios.icon` is still the Expo Icon Composer sample (`assets/expo.icon`)
  and the splash is the template blue `#208AEF`~~ *Closed by D-088
  (Phase 3): the production icon and splash ship from 1.0.5; `ios.icon`
  is gone and iOS uses `icon.png`.*
- `ios.associatedDomains` (Universal Links) needs the Apple Team ID in the
  `apple-app-site-association` file on `bookmarkt.io`: Phase 4 below.
- Tablet layout (`supportsTablet: true`) is Phase 5.
- A Bookmarkt Terms of Service page: Stage 6.

---

## Owner runbook - from Apple Developer enrollment to the first TestFlight build

Nothing below can start before step 1 completes; everything in Phase 1 is
already on `main`.

### A. Account and agreements (Apple, 1-3 days)

1. Enroll at developer.apple.com/programs ($99/year). *Individual* is the
   fastest (no D-U-N-S number); the developer name shown on the App Store
   is then the owner's legal name. *Organization* needs a registered
   company with a D-U-N-S number and takes longer.
2. When the enrollment email arrives, open App Store Connect
   (appstoreconnect.apple.com) -> **Business** (Agreements, Tax, and
   Banking) -> accept the **Paid Apps** agreement and complete the bank
   and tax forms. Subscriptions cannot be created, and sandbox purchases
   fail, until Paid Apps shows *Active*.

### B. Production icon and splash artwork (done in D-088; reference for later changes)

The owner's artwork landed on `main` in D-088 and is baked into every build
from 1.0.5 on, iOS included - nothing to do here before the first
TestFlight build. If a file is ever replaced, these are the slots:

- **App Icon (Universal & iOS):** `app/assets/images/icon.png` - 1024×1024 px PNG, no transparency, no rounded corners (the bookmark on parchment `#F4EDE1`). `ios.icon` is intentionally absent; add it back only with a full Icon Composer bundle.
- **Android Adaptive Icon:**
  - Foreground: `app/assets/images/android-icon-foreground.png` (1024×1024 px, artwork inside the centre 66% circle - currently within 59%).
  - Background: `app/assets/images/android-icon-background.png` (solid parchment) plus `backgroundColor` `#F4EDE1` in `app.json`.
  - Monochrome (Android 13+ themed icons **and** the notification small icon): `app/assets/images/android-icon-monochrome.png`, white on transparent.
- **Splash Screen:**
  - Mark: `app/assets/images/splash-icon.png` (1024×1024 transparent PNG, mark centred), shown at `imageWidth` 200 dp.
  - Background: `"backgroundColor": "#F4EDE1"` under the `expo-splash-screen` plugin in `app/app.json`; no dark variant yet (parchment in both modes).

Whenever artwork files are updated, bump `expo.version` and re-run the native builds (`eas build`) - icons and splash are baked at build time and never travel over the air.

### C. First build (one command, about 20 minutes on EAS)

3. In `app/`: `npx eas-cli@latest build --platform ios --profile testflight-internal`.
   EAS asks to log in with the Apple ID (two-factor code), then:
   registers the bundle ID `com.inkmarkt.bookmarkt`, enables the Push
   Notifications and Time Sensitive Notifications capabilities, creates a
   distribution certificate and an App Store provisioning profile (kept on
   EAS, like the Android keystore), and builds. Answer *yes* to every
   "generate / set up" prompt. No Mac is needed at any point.
4. Download link: EAS prints it (or expo.dev -> project -> Builds). The
   `.ipa` cannot be sideloaded onto an iPhone; it goes through TestFlight.

### C. App Store Connect app and the upload

5. `npx eas-cli@latest submit --platform ios --latest`. On first use it
   offers to create the App Store Connect app entry (name **Bookmarkt**,
   SKU any stable string such as `bookmarkt-ios`, primary language
   English) and asks how to authenticate - choose **App Store Connect API
   key** and let EAS generate one (stored on EAS; it is also what later
   automated submits use). The upload takes 5-15 minutes to *process*;
   App Store Connect emails when the build is ready. No export-compliance
   prompt appears because the Info.plist already answers it.
6. App Store Connect -> App -> **TestFlight** -> *Test Information*: Beta
   App Description (two sentences on what to try), feedback email,
   **Privacy Policy URL** `https://bookmarkt.io/privacy`, contact details,
   and under *Sign-in required* a demo account (a throwaway Bookmarkt
   account with a few books) - Beta App Review signs in with it.

### D. Testers

TestFlight has two kinds of groups and they are not interchangeable:

| | Internal | External |
| --- | --- | --- |
| Who | Members of the App Store Connect team (up to 100) | Anyone, by email or public link (up to 10,000) |
| Review | None - every build is available within minutes | The **first** build of each version goes through *Beta App Review* (usually under 24 h; checks crashes and the obvious guidelines - the legal links and privacy row exist for this); later builds of the same version skip it |
| Use here | The owner's own iPhone | **Friends.** This is the Play "closed testers list" equivalent. |

7. Internal: TestFlight -> *Internal Testing* -> **+** -> group "Owner" ->
   add the owner's Apple ID (it is already a team member). Install the
   TestFlight app on the iPhone, accept the invite, install Bookmarkt.
8. External: TestFlight -> *External Testing* -> **+** -> group "Friends"
   -> add testers by email (they get an invite and install via the
   TestFlight app) or enable the **public link** and send that. Attach the
   build; the first build waits for Beta App Review. Each build expires
   after 90 days; re-run B+C for a new one.
9. From then on, JS-only changes reach iPhones **over the air** on the
   `preview` channel exactly as on Android (`eas update --channel preview`)
   - the iOS binary picks up the update groups published for its runtime
   (1.0.5 from D-088 on) on first launch. Native changes (a new module, a
   plugin, artwork, a `version` bump) need B+C again.

### E. App Store subscriptions (so the paywall works on iPhone)

Apple product IDs may not contain `:`; use dots. The client never
hard-codes them.

| Where | Create | Notes |
| --- | --- | --- |
| App Store Connect -> App -> **Subscriptions** -> **+** group | Subscription group **Bookmarkt Premium** (reference name) | One group = one trial per Apple ID across both plans, the same rule Google enforces. Localization: display name "Bookmarkt Premium". |
| Inside the group, first subscription | Product ID **`premium.monthly`**, reference name "Monthly", duration 1 month; price **$6.99 USD** (Apple derives other territories, equalize if offered); *Introductory Offer* -> Free -> **1 week**, eligibility new subscribers | Localization display name "Monthly", description one line; review screenshot: any paywall screenshot (required before App Review, not for sandbox). |
| Second subscription | Product ID **`premium.yearly`**, "Yearly", 1 year, **$69.99 USD**; *Introductory Offer* Free -> **2 weeks** | Apple shows "Save 17%" only if the app computes it; the screen already does from the two prices (D-070). |
| Subscriptions page -> *Billing Grace Period* | Enable, **16 days**, all renewals | Apple offers 3/16/28 days; 16 is nearest to Play's 7 days + account hold. The RevenueCat webhook handles `BILLING_ISSUE` store-agnostically (D-068). |
| App Information -> *App-Specific Shared Secret* | Generate, copy | RevenueCat needs it for receipt validation. |
| App Information -> *App Store Server Notifications* | Production **and** Sandbox URL = the URL RevenueCat shows for the App Store app (next step); version 2 | Cancellations and renewals reach the webhook in seconds instead of on the next poll. |
| Users and Access -> **Integrations** -> *In-App Purchase* | Generate a key; download the `.p8` once; note Issuer ID and Key ID | Uploaded to RevenueCat. |
| Users and Access -> **Sandbox** -> Testers | A fresh sandbox Apple ID (any email that is not an Apple ID yet) | Used only on the test iPhone's *Settings -> App Store -> Sandbox Account*. |

### F. RevenueCat - App Store app and the Apple key

10. RevenueCat -> Project -> **Apps** -> **+ New** -> *App Store*: bundle ID
    `com.inkmarkt.bookmarkt`, upload the In-App Purchase `.p8` with Issuer
    ID and Key ID, paste the App-Specific Shared Secret. Copy the *App Store
    Server Notifications URL* it shows back into step E.
11. **Products** -> import `premium.monthly` and `premium.yearly` (or add
    them by ID). **Entitlements** -> `companion` -> attach both.
    **Offerings** -> `default` -> `$rc_monthly` gains the App Store product
    `premium.monthly` next to the Play product, `$rc_annual` gains
    `premium.yearly`. A package holds one product per store; nothing about
    the Play side changes.
12. **API keys** -> copy the **`appl_`** public SDK key. It is a public key
    by design (the `goog_` key already ships in the bundle, D-071). Send it
    to the assistant: it is pasted into
    `app/src/domains/billing/purchases.ts` as the Apple default (one-line
    PR, ships OTA to every iOS build - the same path as D-071). *Alternative
    without a code change:* `npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_REVENUECAT_APPLE_KEY --value appl_... --visibility plaintext`
    then rebuild (B+C). **Caveat with the env-var route:** every later
    `eas update` must pass `--environment preview`, otherwise the OTA bundle
    is built with an empty key and iPhones lose purchases until the next
    update. The paste-into-code route has no such trap, which is why it is
    the recommended one.

### G. Sandbox purchase cycle (same evening)

13. On the test iPhone: Settings -> App Store -> *Sandbox Account* -> sign in
    with the sandbox Apple ID from E. TestFlight builds use the sandbox
    automatically; nothing is charged. The purchase sheet says
    *[Environment: Sandbox]*.
14. Bookmarkt -> Subscription -> Monthly: the sheet shows the 1-week free
    trial. In the sandbox a 1-week trial lasts **3 minutes**, a month
    **5 minutes**, a year **1 hour**, and a subscription auto-renews at
    most 6 times, then expires on its own - that is what makes
    purchase -> cancel -> expire -> restore a same-evening test.
15. Cancel from Settings -> App Store -> Sandbox Account -> *Manage*; after
    expiry, *Restore purchases* on a second sign-in. Confirm the RevenueCat
    customer page shows the App Store transactions and `companion`
    flipping, and that `billing_subscriptions` in Supabase follows (the
    webhook is store-agnostic). Record the cycle in the Stage 5 exit gate.

### H. Before App Review (Stage 6, listed here so nothing is forgotten)

- App Store **privacy nutrition label** (App Privacy) - mirror the Play
  Data Safety answers: account info, user content (notes, photos, voice
  transcripts processed on device), purchases via Apple, diagnostics; no
  tracking.
- Screenshots (iPhone 6.7" and 6.1"), description, keywords, support URL,
  marketing URL `https://bookmarkt.io`.
- A Bookmarkt Terms page and the export-compliance confirmation above
  (the production icon and splash shipped in D-088).

---

## Phase 2 - Android hardening on the live track (next)

- [ ] Background/resume and expired-session behaviour, interrupted voice
      recordings, offline capture (roadmap items); gather the Internal
      testers' feedback for 7-14 days first.
- [ ] Session persistence for a process kill mid-sitting (D-083 residual).

## Phase 3 - Icons, splash and platform metadata (owner artwork + one PR)

- [x] Production app icon (1024 px master; Android adaptive foreground /
      background / monochrome; iOS via Icon Composer or a flat PNG),
      splash screen colour and mark replacing `#208AEF` /
      `splash-icon.png`, notification small icon re-check. *(D-088,
      2026-10-10: owner artwork - a leather bookmark with a gold-capped
      tassel on parchment `#F4EDE1`. `icon.png` flattened to an opaque
      1024² tile; adaptive foreground / monochrome inside 59% of the
      half-width; splash mark at 200 dp on parchment; `ios.icon` and the
      Icon Composer sample removed; notification small icon unchanged
      (monochrome file, white on transparent). `expo.version` -> **1.0.5**
      (runtime 1.0.5); `play-internal` build for the next Internal-testing
      release - build ID in the decision log
      (`34fdbe2e-598a-4040-b322-a2eb3c72df70`, versionCode 5). No OTA
      for 1.0.4: the JS is unchanged.)*
- [ ] Store listings: App Store Connect and Play Console copy, screenshots.
      *(Ready to upload under Play Console -> Store listing -> Graphics: the
      512² Play icon derived from `icon.png` and the owner's 1024×500
      feature graphic "Restore your focus / Your personalized reading
      companion." Copy direction from the owner, 2026-10-10: stop the
      hyper-emphasis on paper books - format-neutral, focus / companion
      framing; the current listing title still says "Paper Book Journal"
      and should be revised with the rest of the copy.)*

## Phase 4 - Universal Links / App Links and store routing

- [ ] `ios.associatedDomains: ["applinks:bookmarkt.io"]` once the Team ID
      exists; `apple-app-site-association` and `assetlinks.json` served from
      `website/.well-known/`; `intentFilters` with `autoVerify` on Android.
- [ ] Smart-link / store-routing service (D-015/D-017/D-020): uninstalled
      iPhone -> App Store, uninstalled Android -> Play, desktop -> install
      information; deferred QR context decision.

## Phase 5 - Tablets, device matrix, crash SDK

- [ ] `supportsTablet: true` with the cover grid, book screen and character
      map adapted; both orientations.
- [ ] Device/OS compatibility matrix on physical devices (owner).
- [ ] Privacy-conscious native crash SDK on top of the D-030 flight
      recorder.

## Phase 6 - PWA retirement rehearsal

- [ ] Follows the STAGE_2_OPERATIONS §7 runbook; executes in Stage 8.

## Stage 5 exit gate

Unchanged from the roadmap: signed builds on real devices on both
platforms; QR scans route installed/uninstalled users correctly; capture,
character maps, images, companion and subscription restoration pass on
both; no unnecessary permission; crash telemetry and rollback controls
exist; owner approves both internal builds.
