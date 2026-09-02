# Stage 4 Build Plan - AI Reading Companion

**Status:** Approved plan, not yet started (recorded 2026-09-02, at Stage 4
entry per D-046). This document sequences the
[PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) §13 work plan into build phases; the
roadmap remains the authoritative scope list. Revisit and refine before each
phase begins.

**Sequencing principle:** the highest-risk decisions come first, the
companion becomes owner-testable within weeks (Phases 1-2 ship over-the-air
to the Android preview build), and billing - the slowest, most bureaucratic
part - proceeds in parallel without blocking companion development.

---

## Phase 0 - Decisions and groundwork (owner-led)

Do these before or alongside Phase 1; none require code.

- [ ] **Open the Google Play Console account** ($25 one-time) and the
      **Apple Developer account** ($99/year). Approval can take days to
      weeks; Stage 5 needs both regardless. (Roadmap: "Open Apple Developer
      and Google Play Console accounts early.")
- [ ] **Financial model**: AI cost per companion session (provider pricing x
      expected usage), infrastructure, app-store commission (~15% small
      business tier), taxes, refunds, support, and target margin.
- [ ] **Set the price, billing period, and introductory offer.** The trial
      is server-authorized, time-bound, one per account, and begins only
      after the qualifying number of entries exists.
- [ ] **Billing architecture decision**: evaluate StoreKit and Google Play
      Billing with a shared entitlement provider (RevenueCat is the leading
      candidate - free at MVP scale, handles receipts, webhooks, and
      cross-platform restore). Record the choice as a decision-log entry.
      No web purchase flows without a separate approved decision.
- [ ] **Verify current Apple and Google digital-subscription rules**; native
      users are never routed around required in-app purchase mechanisms.

## Phase 1 - Server foundation (invisible, build first)

The entitlement and cost-control skeleton. Nothing user-visible ships, but
every later phase depends on it.

- [ ] Server-authoritative **entitlement model in Supabase** (tables +
      RLS): subscription state, trial state, and per-feature usage quotas
      (for example dialogue turns and recap/quiz generations per day).
- [ ] The **gatekeeper Edge Function** path: every AI request validates the
      authenticated user, the active companion entitlement, and the
      applicable quota **before** any provider call. Authorization failure
      returns a clear subscription-offer response and consumes neither
      quota nor provider cost.
- [ ] **Companion session auditing**: entitlement decision, feature, quota
      outcome, provider cost, latency, and grounding source counts - without
      logging unnecessary entry content.
- [ ] **Context assembly inside the user's security boundary**: entries
      never leave user-owned RLS rows; no reader content trains models.
- [ ] A **development "comp" entitlement** for the owner's account so the
      companion is fully testable through Phases 2-3, long before billing
      exists.
- [ ] No client-only entitlement decisions, ever.

## Phase 2 - The Companion (user-visible, ships OTA)

Build order within the phase:

1. [ ] **Companion chat screen + mascot dialogue layer (D-038)**: the
       intellectual-archetype profile (Analyst / Empath / Philosopher /
       World-Builder) derived silently from logged genres, driving the
       system-prompt personality within the fixed rule-set (calm,
       non-judgmental, deadpan-scholarly). Text-only; a simple static
       avatar as the speaker label. Provenance labels ("from your notes" /
       "from my knowledge"), the latest-entry spoiler boundary, visible
       declines, and the notes-mirror stance ship with this first surface
       (Stage 3 deferral, gates/STAGE_3_EXIT.md).
2. [ ] **"Where you left off" recaps (D-022)**: prose or bullets at
       reader-chosen detail - the highest-value single feature.
3. [ ] **Free-tier feeders (D-039)**: Quote Logs and manual important event
       flags (ship with or before the subscription so beta readers exercise
       them).
4. [ ] Remaining companion feature set (D-039): cue cards, character-map
       quizzes, semantic search with premium onboarding explainer,
       book-club prep from the reader's own entries, the level- and
       genre-aware word bank with first-use assessment, the capture
       structuring aid (the reader authors every saved word), and
       AI-suggested important event flags.
5. **Backburner** - pattern recognition (embeddings + clustering) stays
       sequenced after closed-beta buy-in (D-039); not MVP scope.

## Phase 3 - Billing (requires a new EAS build, not OTA)

- [ ] Integrate the chosen billing SDK (native module - new preview build).
- [ ] Create the subscription product in the Play Console; Apple's side
      waits for Stage 5's iOS builds.
- [ ] Webhooks -> Supabase entitlement activation: idempotent, signed, with
      transaction reconciliation.
- [ ] Purchase, restore, cancellation, grace period, expiry, refund, and
      billing-retry states; a declined/canceled/abandoned purchase returns
      safely to capture without losing work.
- [ ] Server-verified purchase state required before companion access.
- [ ] Subscription and account-management screens (Settings gains a
      subscription row); the companion offer appears only after a few
      entries exist, matching the trial rule.
- [ ] Free capture is never paywalled and never degraded by subscription
      state.

## Phase 4 - Hardening and exit gate

- [ ] Sandbox purchase test matrix: duplicate events, delayed webhooks,
      refunds, revocations, offline receipts, cross-platform restoration.
- [ ] Subscription analytics without exposing payment details.
- [ ] Account email/password recovery and secure sensitive-account changes.
- [ ] Data export and account-deletion foundations (entries, character
      maps, images, voice transcripts).
- [ ] Customer-support procedures for billing disputes.
- [ ] Walk the Stage 4 exit gate (roadmap §13) and record the review in
      `gates/STAGE_4_EXIT.md`.

---

## Distribution notes

- Phases 1-2 are JS/Supabase work: every round ships over-the-air to the
  owner's preview build, same as Stage 3.
- Phase 3 adds a native billing module: that round requires a fresh EAS
  Android build installed on the device (OTA cannot deliver native code).
- iOS billing verification is Stage 5 scope (Apple account + iOS builds);
  Stage 4 exits on Android evidence plus server-side state, per the
  established Android-first pattern (D-020).
