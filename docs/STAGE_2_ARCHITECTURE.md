# Stage 2 Architecture Design

Accepted architecture decisions for the Stage 2 native rebuild. This document
is the ADR set referenced by Decision D-017. Companion product behavior is
governed by D-012; bookmark behavior by D-015; the native stack by D-014;
voice capture by D-016.

## 1. Smart link and store routing

- Every printed QR encodes `https://<bookmarkt-domain>/b/<bookmark-id>`, a
  Bookmarkt-controlled HTTPS destination (D-008, D-015). The path carries the
  unique bookmark ID; no per-user data is ever in the URL.
- The smart-link service is a minimal static/edge web endpoint, deployed
  separately from the reading app. It serves:
  - `/.well-known/apple-app-site-association` for iOS Universal Links.
  - `/.well-known/assetlinks.json` for Android App Links.
  - A platform-detection fallback page: installed app opens directly via
    Universal/App Links; otherwise iOS routes to the App Store, Android to
    Google Play, and unsupported/desktop devices see installation guidance.
- Deferred QR context: Android restores the scanned bookmark ID after install
  via the Play Install Referrer. iOS has no first-party deferred deep link;
  v1 ships without it on iOS - after first open, the reader signs in and the
  next physical scan links normally. No third-party attribution SDK is added
  for this.
- The service never renders reading data and holds no session.

## 2. Domain boundaries

Typed service/repository modules isolate Supabase behind one module per
domain. Domains own their tables; cross-domain access goes through the owning
service, never raw table access from screens.

| Domain | Owns | Notes |
| --- | --- | --- |
| authentication | session, credentials, recovery | No database work inside Auth callbacks |
| library | books, metadata, Open Library lookup | |
| progress | reading boundary derivation | Boundary always derives from the latest entry (entries domain) |
| entries | typed and voice entries, raw transcripts | Raw transcript stored beside cleaned text (D-016) |
| voice capture | recording, on-device transcription, review | Produces entries; never stores audio server-side |
| companion | retrieval, session contract, provenance, audit | Behind entitlement; see sections 3-4 |
| characters | manual character maps | |
| images | private Storage objects, signed URLs | Legacy-path compatibility until migration completes |
| bookmarks | ID registry, claim, link, unlink, relink, history | D-015; scanning is an accelerator, never a capture gate |
| reporting | issue reports, lifecycle fields | Status, priority, assignment, resolution |
| analytics | product events | Failures silent, never block saves |
| subscriptions | companion entitlement state | Server-authoritative; Stage 4 implements billing |

## 3. Companion entitlement boundary

- Entitlement is server-authoritative. The native client can request companion
  access and display state; it can never grant, extend, or cache-extend it.
- Every companion request is verified server-side (edge function) against the
  subscriptions domain before any retrieval or provider work runs. Denied
  requests return before any AI provider call and are audited.
- Free capture never touches the entitlement path: capture screens make no
  entitlement checks and no companion calls. A reader with no subscription has
  the complete capture product.
- The image-generation backend stays dormant behind `AI_GENERATION_ENABLED`
  (default false, live-verified 410); a configuration test asserts the flag
  state in CI (quality-system work item).

## 4. Companion session contract

Every companion session binds:

1. One authenticated user.
2. One book - or explicitly the user's whole library for cross-book features.
3. A content boundary equal to that scope's latest entry at session start.
4. Retrieval restricted to the requesting user's own entries within the
   boundary; no other account's data, no external book text, no model memory
   presented as fact.
5. Provenance labeling on every companion statement: grounded-in-your-entries
   versus general-knowledge framing, with verified facts labeled.
6. Decline behavior: when recognition confidence in the reader's entries is
   weak, the companion says so and declines rather than inventing.
7. An audit record per session: user, scope, boundary, retrieval set, feature,
   and outcome.

Grounding, boundary, cross-account, and denied-request behavior each get
automated tests before the companion feature flag ever turns on (Stage 2 exit
gate).

## 5. Environments, secrets, configuration, deployment

- Environments: `local` (Expo dev client + local env file), `preview`
  (EAS internal distribution builds), `production` (EAS store builds from
  tagged commits). Build-profile configuration is validated at startup; a
  build refuses to run with missing/invalid configuration.
- Secrets: client builds carry only the Supabase URL and publishable key.
  Service-role keys and provider keys live exclusively in Supabase function
  secrets. EAS secrets hold signing material. No secret is committed; `.env*`
  stays gitignored.
- Session material uses platform secure storage (Keychain/Keystore) via
  expo-secure-store, not AsyncStorage.
- Deployment ownership: the product owner owns all environments, the single
  shared Supabase project, Netlify (frozen PWA + smart-link service), and EAS.
  Every deploy is reproducible from a tagged commit; schema changes ship only
  through committed migrations.
- Over-the-air updates (expo-updates) may deliver JS-level fixes to preview
  builds; production OTA policy is decided at Stage 5 with store compliance.

## 6. Repository layout

The native app lives in this repository under `app/` (Expo workspace), beside
the frozen PWA prototype at the root and `supabase/` shared backend assets.
One repository preserves the single source of truth for docs, migrations, and
gate history. Revisit only if CI times or tooling isolation demand a split.
