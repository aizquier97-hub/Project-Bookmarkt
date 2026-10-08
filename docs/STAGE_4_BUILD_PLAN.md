# Stage 4 Build Plan - AI Reading Companion

**Status:** Phases 1-2 complete (2026-09-02, D-047..D-052) - the full
companion feature set is live OTA. Phase 4's non-billing items (account
self-service foundations, dispute procedures) are done (D-053). Remaining:
Phase 0 owner decisions, Phase 3 billing, and the billing-dependent Phase 4
items. This document sequences the
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

- [x] **Open the Google Play Console account** ($25 one-time) and the
      **Apple Developer account** ($99/year). Approval can take days to
      weeks; Stage 5 needs both regardless. (Roadmap: "Open Apple Developer
      and Google Play Console accounts early.")
      *Play Console opened 2026-09-03; the Apple account is deliberately
      deferred to Stage 5 (Android-first, D-020).*
- [x] **Financial model**: AI cost per companion session (provider pricing x
      expected usage), infrastructure, app-store commission (~15% small
      business tier), taxes, refunds, support, and target margin.
      *Done 2026-10-04 by the owner; outputs recorded in D-070.*
- [x] **Set the price, billing period, and introductory offer.** The trial
      is server-authorized, time-bound, one per account, and begins only
      after the qualifying number of entries exists.
      *Done 2026-10-04 (D-070): Monthly $7.99 USD / Yearly $79.99 USD
      (saves 17%), auto-renewing, a 7-day free trial on the monthly plan
      and 14 days on the yearly plan (D-071; D-070 first said 7 on both).
      The store trial is the trial - Bookmarkt's no-card trial is switched
      off by `companion_trial_policy.bookmarkt_trial_enabled`; the 5-entry
      gate still guards the plan buttons.*
- [x] **Billing architecture decision**: evaluate StoreKit and Google Play
      Billing with a shared entitlement provider (RevenueCat is the leading
      candidate - free at MVP scale, handles receipts, webhooks, and
      cross-platform restore). Record the choice as a decision-log entry.
      No web purchase flows without a separate approved decision.
      *Done 2026-09-06: RevenueCat chosen (D-061); development runs against
      its Test Store until pricing and the Play product exist.*
- [ ] **Verify current Apple and Google digital-subscription rules**; native
      users are never routed around required in-app purchase mechanisms.

## Phase 1 - Server foundation (invisible, build first)

The entitlement and cost-control skeleton. Nothing user-visible ships, but
every later phase depends on it.

- [x] Server-authoritative **entitlement model in Supabase** (tables +
      RLS): subscription state, trial state, and per-feature usage quotas
      (for example dialogue turns and recap/quiz generations per day).
      *Done 2026-09-02: `companion_entitlements` table + `consume_companion_quota`
      RPC (per-user-per-feature daily caps plus a project-wide cap), D-047.*
- [x] The **gatekeeper Edge Function** path: every AI request validates the
      authenticated user, the active companion entitlement, and the
      applicable quota **before** any provider call. Authorization failure
      returns a clear subscription-offer response and consumes neither
      quota nor provider cost.
      *Done 2026-09-02: `companion` Edge Function deployed (auth → entitlement
      → quota → provider), D-047.*
- [x] **Companion session auditing**: entitlement decision, feature, quota
      outcome, provider cost, latency, and grounding source counts - without
      logging unnecessary entry content.
      *Done 2026-09-02: `companion_usage_events` (service-role only; no entry
      text stored), D-047.*
- [x] **Context assembly inside the user's security boundary**: entries
      never leave user-owned RLS rows; no reader content trains models.
      *Done 2026-09-02: the function reads context with the caller's own JWT
      (RLS enforced); Gemini API calls do not train on request data.*
- [x] A **development "comp" entitlement** for the owner's account so the
      companion is fully testable through Phases 2-3, long before billing
      exists.
      *Done 2026-09-02: migration comps all pre-existing accounts (dev_comp
      source), revocable before external beta.*
- [x] No client-only entitlement decisions, ever.
      *Standing rule, now structural: the client's entitlement read is
      render-only; the Edge Function re-checks the row on every request.*

## Phase 2 - The Companion (user-visible, ships OTA)

Build order within the phase:

1. [x] **Companion chat screen + mascot dialogue layer (D-038)**: the
       intellectual-archetype profile (Analyst / Empath / Philosopher /
       World-Builder) derived silently from logged genres, driving the
       system-prompt personality within the fixed rule-set (calm,
       non-judgmental, deadpan-scholarly). Text-only; a simple static
       avatar as the speaker label. Provenance labels ("from your notes" /
       "from my knowledge"), the latest-entry spoiler boundary, visible
       declines, and the notes-mirror stance ship with this first surface
       (Stage 3 deferral, gates/STAGE_3_EXIT.md).
       *Done 2026-09-02: book-scoped chat at `/companion` with provenance
       chips, boundary chip, "Spoiler held back" declines, suggestion
       chips, offer state, and quota copy; entry row on the book screen
       (D-048).*
2. [x] **"Where you left off" recaps (D-022)**: prose or bullets at
       reader-chosen detail - the highest-value single feature.
       *Done 2026-09-02: the locked teaser became the live RecapCard —
       brief/detailed toggle, stored newest recap (reopening costs
       nothing), boundary + provenance chips (D-049).*
3. [x] **Free-tier feeders (D-039)**: Quote Logs and manual important event
       flags (ship with or before the subscription so beta readers exercise
       them).
       *Done 2026-09-02: the composer gained a Note / Quote / Important
       selector; quotes render serif-italic with an accent rule, important
       moments earn a gold chip, and All/Quotes/Important filters appear
       once any exist (D-050).*
4. [x] Remaining companion feature set (D-039): cue cards, character-map
       quizzes, semantic search with premium onboarding explainer,
       book-club prep from the reader's own entries, the level- and
       genre-aware word bank with first-use assessment, the capture
       structuring aid (the reader authors every saved word), and
       AI-suggested important event flags.
       *Done 2026-09-02: cue cards, quizzes, club prep, and word bank as
       chat tools; structure aid in the composer; suggested flags over the
       timeline (D-051). Semantic "search by meaning" shipped last -
       pgvector embeddings, one-time explainer, matches filter the
       timeline (D-052).*
5. [x] **Interface v2.0 (owner brief, D-055)**: the companion's standout
       features move one tap from home - a **Book Club** tab (renamed chat
       with date-ranged club snapshots) and a **Cue Cards** tab (real
       flip-card decks); book-screen entries become horizontal bookmark
       ribbons with cached one-line AI summaries opening a premium-paper
       full-entry screen; a gold bookmark retells any chosen stretch of
       bookmarks at Brief/Standard/Detailed. Quiz Me and the word bank UI
       are hidden (on hold per the owner; Edge Function paths intact).
       *Done 2026-09-03 (D-055).*
6. [x] **Socratic facilitator redesign (owner brief, D-056)**: observation
       cards greet the reader with 1-3 grounded openers drawn from their
       own notes (tap to start the thread; nothing invented, nothing past
       the boundary); dialogue replies follow the mirror contract -
       validate in one sentence, probe with one open question - with 2-3
       tappable perspective stems above the composer; the composer gains
       dictation (D-016 cleanup). A migration widened the companion
       feature allowlists that had silently pinned the quota RPC to the
       original nine feature names.
       *Done 2026-09-04 (D-056).*
7. [x] **Socratic card deck (owner brief, D-057)**: the chat transcript and
       date-picker snapshot are gone - the Book Club opens on a primer card
       (at most 3 bullets from the last few notes), "Start discussion" deals
       the strongest observation as the first question card, answers come by
       stem chips / dictation / typing, each mirror (under 50 words) slides
       in as the next card, and "End session" can save the reader's own
       answers to the journal (D-012).
       *Done 2026-09-04 (D-057).*
8. [x] **Session salons (owner brief, D-058)**: discussions become discrete,
       bounded sessions instead of one infinite thread. A returning reader
       lands on an **orientation hub** - the last session's takeaway card,
       "Continue discussion" / "Start a new discussion", and a browsable
       archive of past sessions as question-and-answer index cards. In the
       deck, answered cards collect visibly behind the active one with a
       "Card N" count, and after three answers a gentle "Wrap up?" nudge
       appears (closing stays manual). "End session" distills the reader's
       own answers into a short **takeaway card** (feature `insight`,
       persisted on the salon). Also fixed: malformed model JSON can no
       longer reach the primer card raw - truncated documents are repaired
       or the request fails cleanly to a retry.
       *Done 2026-09-05 (D-058).*
9. [x] **3-turn convergence arc (owner brief, D-059)**: each salon runs a
       bounded three-card arc that lands on an explicit realization - the
       opening tension, a **wedge** card (one-sentence mirror + one sharp
       counter-question, 3 conceptual chips, under 45 words), and a
       gold-tinted **"Insight unlocked"** synthesis card crystallizing the
       reader's own answers. The synthesis forks: "Save insight & finish"
       persists the crystallized takeaway verbatim (no second model call);
       "Push further" deals 1-2 more cards before converging again. The
       dialogue contract returns split `mirror`/`probe` fields plus
       `is_convergence` and `insight`; clients not sending a turn keep the
       old open-ended contract.
       *Done 2026-09-05 (D-059).*
10. **Backburner** - pattern recognition (embeddings + clustering) stays
       sequenced after closed-beta buy-in (D-039); not MVP scope.

## Phase 3 - Billing (requires a new EAS build, not OTA)

- [x] Integrate the chosen billing SDK (native module - new preview build).
      *Done 2026-09-06: react-native-purchases in the 1.0.1 binary, lazy-loaded
      with graceful degradation on older runtimes (D-061).*
- [ ] Create the subscription product in the Play Console; Apple's side
      waits for Stage 5's iOS builds. *Pricing decided 2026-10-04 (D-070);
      owner-side setup is specified under "Store setup identifiers" below.
      Development runs against RevenueCat's Test Store meanwhile.*
- [x] Webhooks -> Supabase entitlement activation: idempotent, signed, with
      transaction reconciliation.
      *Done 2026-09-06: `revenuecat-webhook` Edge Function - shared-secret
      auth, absolute idempotent upserts, dev_comp rows preserved (D-061).
      Hardened 2026-10-04: `companion_billing_events` ledger (duplicate
      deliveries are no-ops), `last_event_at` ordering guard (a late
      EXPIRATION cannot undo a later RENEWAL), TRANSFER handling, pure
      decision module with 20 Deno tests (D-068).*
- [x] Purchase, restore, cancellation, grace period, expiry, refund, and
      billing-retry states; a declined/canceled/abandoned purchase returns
      safely to capture without losing work.
      *Done 2026-10-04 (D-068): the row carries will_renew, billing issue +
      grace end, cancel/expiration reasons, period type; the Subscription
      screen renders a tested sentence for every state; a canceled or failed
      purchase shows "No charge was made and nothing changed" and the reader
      stays on the screen. Live store sandbox runs still wait for the Play
      product (see Phase 4 matrix).*
- [x] Server-verified purchase state required before companion access.
      *Structural since D-047: the Edge Function re-checks the entitlement
      row on every request; the webhook is that row's only store writer.
      2026-10-04: the gate also treats an active row lapsed more than 7 days
      past its period end as unentitled (D-068).*
- [x] Subscription and account-management screens (Settings gains a
      subscription row); the companion offer appears only after a few
      entries exist, matching the trial rule.
      *2026-09-06: Subscription screen (plans, purchase, restore) + Settings
      row + the offer's View plans button shipped (D-061). 2026-10-04: the
      server-authorized trial (`start_companion_trial`, policy table with
      placeholder 7 days / 5 entries) and the entries-before-offer rule
      (locked trial card with progress bar until the qualifying entries
      exist; subscription history fails open to plans) shipped (D-068).
      2026-10-04: the store's free trial became the trial - the Bookmarkt
      trial is off by policy flag and the plan buttons print "7 days free,
      then $7.99 per month" / "14 days free, then $79.99 per year" / "Save
      17%" from the store's phases (D-070, D-071).*
- [x] Free capture is never paywalled and never degraded by subscription
      state.
      *Confirmed 2026-10-04: no capture, character, bookmark, timer, or
      profile path reads the entitlement; only companion features and their
      offer cards do (D-068 review).*

## Phase 4 - Hardening and exit gate

- [ ] Sandbox purchase test matrix: duplicate events, delayed webhooks,
      refunds, revocations, offline receipts, cross-platform restoration.
      *Partially done 2026-10-04 (D-068): duplicate events, delayed/out-of-
      order webhooks, refunds (CANCELLATION + EXPIRATION), revocations,
      billing retry, pause, and transfer are covered by the Deno unit tests
      and a 29-check live integration smoke against the deployed schema. Real
      store sandbox purchases, offline receipts, and cross-platform restore
      need the Play product (pricing) and the iOS build (Stage 5).*
- [x] Subscription analytics without exposing payment details.
      *Done 2026-10-04 (D-068): `subscription_viewed`, `purchase_started /
      completed / cancelled / failed`, `purchases_restored`, `trial_started`,
      `trial_locked_viewed` - package identifiers and states only.*
- [x] Account email/password recovery and secure sensitive-account changes.
      *Done 2026-09-02: recovery (forgot/reset password deep-link flow)
      shipped in Stage 3; Settings gained a Change password row that sends
      the same email-verified reset link (D-053).*
- [x] Data export and account-deletion foundations (entries, character
      maps, images, voice transcripts).
      *Done 2026-09-02: Settings → Your data — JSON export via the share
      sheet, and two-confirmation account deletion through the
      `delete-account` Edge Function (D-053).*
- [x] Customer-support procedures for billing disputes.
      *Done 2026-09-02: [SUPPORT_BILLING_DISPUTES.md](SUPPORT_BILLING_DISPUTES.md);
      revisited 2026-10-04 for the ledger, lapse tolerance, and trial cases
      (D-068).*
- [ ] Walk the Stage 4 exit gate (roadmap §13) and record the review in
      `gates/STAGE_4_EXIT.md`.
      *Draft opened 2026-10-04 ([gates/STAGE_4_EXIT.md](gates/STAGE_4_EXIT.md)):
      every criterion that does not depend on the price is evidenced; pricing
      decided 2026-10-04 (D-070); the review stays open until the Play
      product exists and one real sandbox purchase cycle is recorded.*

## Phase 5 - Beta engagement layer (added 2026-10-03, D-062)

Inserted after the September 2026 internal test. Solo habit loops ship
before any social feature; see roadmap §13 "Beta engagement layer" and
[READING_METRICS.md](READING_METRICS.md) for the formulas.

- [x] Domain layer `app/src/domains/fitness/` (difficulty, activity,
      fitness, streaks, trophies, model) - pure, unit-tested (42 tests).
- [x] Migration `20261003120000_add_reading_fitness.sql`: `reading_sessions`
      (owner RLS, topic-ownership inserts), `entries.is_favorite` +
      `entries.reflection`, `topics.difficulty_override`.
- [x] Screens: `/reading-timer`, Progress tab, Quotes tab; book screen gains
      the difficulty chip, trophy strip, "Reading session" button, and
      trophy-unlock toasts; Edit book gains the difficulty override.
- [x] Export v2 (sessions, favorites, reflections, override); theme paper
      tokens lightened; six-tab shelf with My bookmarks under Settings.
- [x] Apply the migration to the linked project. *Done 2026-10-03:
      `supabase db push` against `bfallxtcxxyykcnkedom`; migration history
      21/21 in sync; smoke test over REST - `reading_sessions` returns
      42501 for `anon`, `entries.is_favorite` / `reflection` and
      `topics.difficulty_override` resolve. `database.types.ts` checked
      against `supabase gen types` (only pre-existing D-052 omissions
      differ).*
- [x] Ship the OTA (`eas update --channel preview`). *Done 2026-10-03 from
      commit `9527c59`, published for both preview runtimes: 1.0.1 (group
      `47304468-aaa2-4ffa-b503-0c4a1b463d55`) and 1.0.0 (group
      `a570fafd-e06a-41cc-8ed8-d9acb8bf81aa`), android + ios. The 1.0.0
      publish exists because the only 1.0.1 binary (2026-09-04, D-061) was
      never confirmed installed and every September OTA targeted 1.0.0;
      D-062 adds no native module, so both bundles are runtime-safe.*
- [ ] Owner on-device check (fully close and reopen the app twice to pick up
      the update): timer flow end to end (finish and leave-early),
      a trophy piece unlocking from an entry, a frozen streak after a
      companion-only day.
- [ ] Next binary build: `expo-keep-awake` during the glass.

### Phase 5b - Difficulty Index v2 (added 2026-10-03, D-063)

Owner feedback after the OTA: Karamazov 5.2 / Dungeon Crawler Carl 4.9 /
Monsterholic 4.9, all "Moderate". Root cause and method in
[READING_METRICS.md](READING_METRICS.md) §2.0-2.1.

- [x] `supabase/functions/book-difficulty/` (Gemini 2.5 Flash rubric
      rating, cached on `topics`, per-user daily cap, RLS write) +
      `config.toml` entry. *Deployed 2026-10-03.*
- [x] Migration `20261003210000_add_difficulty_estimate.sql`
      (`difficulty_estimate`, `_confidence`, `_rationale`, `_estimated_at`).
      *Applied 2026-10-03; remote history 22/22; `database.types.ts`
      updated by hand to match.*
- [x] Domain: `difficulty.ts` precedence override → knowledge → fallback,
      sources `override | knowledge | measured | metadata`; `model.ts`
      passes the cached columns through; 8 new tests (293 total).
- [x] Client: `difficultyEstimate.ts` (invoke + sequential backfill, 8 per
      launch, once per book per launch) mounted as `DifficultyBackfill` in
      `(app)/_layout.tsx`; Add book requests a rating on success; Edit book
      clears the rating when title/author change and shows the estimate +
      rationale; Progress explainer and book-screen comments updated.
- [x] Live test with a throwaway account against the deployed function
      (6 books, cache hit verified, rows persisted under RLS, account
      deleted - 0 topics left).
- [x] Ship the OTA for runtimes 1.0.1 and 1.0.0. *Done 2026-10-03 from
      commit `576a861`: groups `74615eaf-4899-454a-90d8-199b2c190996`
      (1.0.1) and `93d8e897-89af-4f74-97da-e40e8b8d49a1` (1.0.0), android +
      ios.*
- [ ] Owner confirms the three flagged books re-rate (Edit book shows
      "Bookmarkt's estimate").

### Phase 5c - Profile home and feedback rounds 2-3 (added 2026-10-04, D-064 / D-065 / D-066)

Eleven owner notes after a week on the D-062/D-063 build, then four more
after Drop 2; see [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) §13 for the
product framing. Split into a device-only drop, a server drop, and a
third drop that corrects the comprehension rubric and turns the cue cards
into the Recall match.

**Drop 1 (D-064) - pure client, OTA.**

- [x] `(tabs)/progress.tsx` → `(tabs)/index.tsx` (**Profile**, home) and
      `(tabs)/index.tsx` → `(tabs)/library.tsx`; tab bar reordered
      (Profile, Library, Quotes, Club, Cards, Settings); Edit book's delete
      returns to `/library`.
- [x] `theme.ts` trend ink `rise` / `riseSoft` / `fall` / `fallSoft`;
      hero and volume deltas use it.
- [x] `model.ts`: `trophyGroups` (`groupTrophyCase`, four fixed bands),
      `booksInProgress`, `readDays`, `engagementDays`. `fitness.ts`:
      `pacePagesPerMinute` (+ `roundPace`, `sessionPacePagesPerMinute`),
      `computeCalendarMonth`, `shiftMonth`.
- [x] Profile UI: `TrophyCase` shelves with inline book lists, expandable
      "Pieces in progress", two-column metric grid with shrink-to-fit
      labels, pressable "Reading days" card.
- [x] New `(app)/reading-calendar.tsx` Stack screen.
- [x] `reading-timer.tsx` saved phase: pace `/min`, "Write an entry" prompt
      → `/book/[id]?compose=write&page=N`; `book/[id].tsx` honours
      `compose` and `page` (composer opens, progress page prefilled).
- [x] Tests: new `model.test.ts`; calendar / pace cases in
      `fitness.test.ts`. `tsc`, `jest` (26 suites / 300 tests), `expo lint`
      clean.
- [x] Ship the OTA for runtimes 1.0.1 and 1.0.0. *Done 2026-10-04 from commit
      `c93b3e0`: groups `06a9ba6e-e792-4a46-badb-64b6fc25fceb` (1.0.1) and
      `41198a21-1716-44af-903c-398c8aba8ab7` (1.0.0), android + ios.*
- [ ] Owner confirms on device (Profile opens first; shelves, calendar,
      entry prompt).

**Drop 2 (D-065) - companion feature + client.**

- [x] `comprehension` companion feature in `supabase/functions/companion/index.ts`:
      four-mark rubric prompt (recall / interpretation / connection /
      evaluation, 0-4 each; `m = (0.3R + 0.3I + 0.2C + 0.2E) / 4`), Gemini
      at temperature 0 / thinking off / JSON; material = that book's
      entries + reflections only; result cached on `topics`
      (`comprehension_score`, `_confidence`, `_rationale`, `_marks`,
      `_hash`, `_scored_at`) and served from cache **before** the quota
      gate; `NO_ENTRIES` short-circuit; `TOOL_LIMITS.comprehension` 20/day
      (`COMPANION_COMPREHENSION_DAILY_LIMIT`). Migration
      `20261004090000_add_comprehension_score.sql` adds the columns and
      widens the usage-events CHECK and `consume_companion_quota`.
- [x] Client: `database.types.ts`; `companion/api.ts`
      (`requestComprehensionScore`, `CompanionComprehension`);
      `fitness/comprehension.ts` (material builder + djb2 hash mirroring
      the server, `booksNeedingComprehension`, backfill ≤4 per launch,
      `useComprehensionBackfill`); `ComprehensionBackfill` mounted in the
      signed-in shell next to `DifficultyBackfill`, skipped when not
      entitled; `activity.ts` `blendComprehensionFactor` +
      `comprehensionByBook`, `BookDayActivity.modelComprehension`;
      `model.ts` passes `comprehension_score`; Profile `BookRow`
      "understanding N%" and the Explainer paragraph.
- [x] Cue-card memory match: `domains/cueCards/memoryGame.ts` (pure:
      `playableCards`, `buildBoard`, `applyFlip`, `hideMismatch`, `isWon`,
      `deckOverlap`, `MIN_PAIRS` 3 / `MAX_PAIRS` 6), `components/MemoryMatch.tsx`
      (three-across face-down grid, 0.9 s mismatch linger), Cards / Match
      toggle and win panel in `(app)/cue-cards.tsx` ("New cards" re-deals
      via the companion; "Same cards, reshuffled" re-keys the board; <3
      playable cards or ≥80% overlap → "add more entries or characters";
      quota 429 → reshuffle), `(tabs)/cards.tsx` lede.
- [x] Tests: `fitness/__tests__/comprehension.test.ts`,
      `cueCards/__tests__/memoryGame.test.ts`; `difficultyEstimate.test.ts`
      fixture gains the new columns. 320 tests / 28 suites; tsc and lint
      clean.
- [x] Migration applied (`db push`, history 23/23) and `companion`
      deployed 2026-10-04; live smoke test (throwaway comped user, five
      notes → 0.9 medium, repeat served from cache, one usage event, user
      deleted) passed; client hash parity pinned in a unit test.
- [x] Ship the OTA for both runtimes; record group IDs - PR #108, published
      2026-10-04 to `preview`: runtime 1.0.1 group
      `9c522575-37b0-40f4-98fd-d022ace6183e`, runtime 1.0.0 group
      `4dff8505-a016-493e-b19b-d3e97e6d47dd`.

**Drop 3 (D-066) - feedback round 3: rubric r2 and Recall.**

- [x] Server (`supabase/functions/companion/index.ts`): `COMPREHENSION_WEIGHTS`
      0.5 / 0.25 / 0.125 / 0.125, `COMPREHENSION_RUBRIC_VERSION = "r2"`,
      `comprehensionHash()` = `hashContent(material) + ":r2"` (the shared
      `hashContent` is untouched - embeddings and summaries still use it);
      `buildComprehensionPrompt` rewritten (grade what the notes
      demonstrate; own knowledge only to check accuracy; plot-only notes →
      recall 4, others 0, never mark recall down); `cue_cards` prompt asks
      for 6-8 cards, fronts ≤10 words, backs ≤12 words, distinct facts;
      provider temperature 0.5 for `cue_cards`, 0.7 otherwise.
- [x] Client metric: `activity.ts` `blendComprehensionFactor` lift form,
      `dampComprehensionByConfidence`, `describeComprehensionGrade`;
      `model.ts` reads `comprehension_confidence` and stores the damped
      grade in `comprehensionByBook`; `fitness/comprehension.ts`
      `COMPREHENSION_RUBRIC_VERSION` + `:r2` hash suffix; Profile `BookRow`
      "comprehension N%, word" and the rewritten Explainer paragraph.
- [x] Recall: `(tabs)/cards.tsx` → `(tabs)/recall.tsx` (lede, pushes
      `/match`), `(tabs)/_layout.tsx` entry `recall` / "Recall" /
      `extension-puzzle-outline`; `(app)/cue-cards.tsx` → `(app)/match.tsx`
      (game only: intro → deal → board → win card; `records.ts` best time;
      overlap / quota fallbacks); `components/MemoryMatch.tsx` two across,
      `minHeight` 136, text 15/21 centred without `adjustsFontSizeToFit`,
      pinned status row with stopwatch (250 ms tick from the first turn)
      and best, `onWon(GameResult)`; `memoryGame.ts` `MAX_PAIRS` 5,
      `formatClock`, `GameResult`, `betterResult`; copy touch-ups in
      `subscription.tsx`, `PremiumOffer.tsx`, `BookPickerRow.tsx`.
- [x] Tests: `comprehension.test.ts` (hash `:r2` pins incl. the live
      `djb2:6c2c609c:690:r2`, lift blend, neutral pass-through, floor,
      damping, grade words), `memoryGame.test.ts` (`MAX_PAIRS` 5,
      `formatClock`, `betterResult`). 332 tests / 28 suites; tsc and lint
      clean.
- [x] `companion` deployed 2026-10-04; smoke tests (throwaway comped user,
      deleted afterwards): comprehension R4 I4 C3 E3 → 0.938 medium, hash
      `...:690:r2`, repeat from cache, one usage event; cue cards 7
      distinct, backs ≤5 words.
- [x] Ship the OTA for both runtimes; record group IDs - PR #109, published
      2026-10-04 to `preview`: runtime 1.0.1 group `7b9848e1-0f29-47ad-8377-bf952f6cb0c5`, runtime
      1.0.0 group `91552287-0f9f-4646-af02-bc7c9314b7ca`.

**Drop 3 follow-up (D-067) - comprehension shown as a 0-100 score.**

- [x] `activity.ts` `comprehensionPercent(factor)` - linear rescale of
      [0.6, 1.4] onto 0-100 (neutral x1.0 = 50), clamped; the band word
      comes from `describeComprehensionGrade(S / 100)`, which already took
      the unit interval.
- [x] Profile `index.tsx`: Comprehension `Metric` value `${S}%`, unit the
      capitalised band word (`comprehensionWord`, next to `formatFitness`)
      or "of 100" before any data; `BookRow` meta "notes graded N%, word";
      Explainer heading "Comprehension (0-100%)" with the paragraph
      rewritten in points. Copy: `reading-timer.tsx` note hint and entry
      prompt, `quotes.tsx` reflection hint → "comprehension score".
- [x] Tests: `comprehension.test.ts` `comprehensionPercent` (0 / 50 / 59 /
      75 / 91 / 100, clamp, shared band words). 335 tests / 28 suites; tsc
      and lint clean. No server or migration work.
- [x] Ship the OTA for both runtimes; record group IDs - PR #110, published
      2026-10-04 to `preview`: runtime 1.0.1 group `20b42395-d1f5-4fec-9a70-96fe445ad60d`, runtime 1.0.0
      group `c89f7b3c-4259-4ca4-9008-4566574a2dd1`.

### Phase 5d - Sandglass feedback round (added 2026-10-05, D-077)

Owner feedback from the first timed sitting: the end of the glass should
be heard, the wrap-up note should be speakable, and the people met in the
sitting should reach the character map without a detour. Also the first
companion tool that writes toward the map (still reader-confirmed).

- [x] **Bell at zero.** `assets/sounds/bell.wav` (original synthesized
      singing-bowl chime, 2.4 s, 528 Hz, soft) played through `expo-audio`
      from `domains/fitness/bell.ts`, lazily required so older runtimes
      buzz without sound. `app.json` version -> **1.0.2**; the bell needs
      the new Internal-testing binary (native module).
- [x] **Dictation on the wrap-up note** via the reusable
      `components/DictationPanel.tsx`; raw transcript stored on the entry.
- [x] **"Did you meet someone new?"** card on the saved screen: *Add a
      character* / *Speak one* -> `/book/[id]?tab=characters&composeCharacter=write|speak`.
- [x] **Custom sitting length** (Custom chip, 1-240 minutes).
- [x] **Companion `character_extract`** (premium, transient): one saved
      note + current map -> up to five people not yet mapped, with
      role/description/relationships where the note gives them. Rendered by
      `components/CharacterSuggestions.tsx` on the saved screen and under the
      book composer after a save; *Add to map* / *Skip* per card. Migration
      `20261010120000_add_character_extract.sql` pushed; function deployed.
- [x] Tests: `api.test.ts` character parsing + `hashNoteText`. 385 tests /
      34 suites; tsc and lint clean.
- [x] EAS build `0685c332-d523-435a-a290-d6e8e71459de` (runtime 1.0.2) ->
      uploaded as Internal-testing release 2 on 2026-10-07. **Crashed on
      launch** ("this app has a bug") - superseded by 1.0.3 below (D-078).
- [x] **1.0.3 rebuild (D-078).** Cause: `expo-audio`'s peer dependency
      `expo-asset: "*"` let npm hoist `expo-asset@57.0.19` (a later SDK's
      native module) to the root, and autolinking compiled it into 1.0.2.
      Pinned `expo-asset ~12.0.13` (`npx expo install expo-asset`),
      version -> **1.0.3**. EAS build
      `56b394ef-8228-42b7-aa82-b588b314b7d9` (versionCode 3) -> uploaded by
      owner as Internal-testing release 3 on 2026-10-07; verified working
      on device with notification bell sound. Guard for next time: after
      adding a native module, diff `package-lock.json` for new root
      `node_modules/expo-*` entries and scan root packages against
      `node_modules/expo/bundledNativeModules.json` before building.
- [x] Ship the OTA for runtimes 1.0.1 and 1.0.0 (everything but the bell) -
      published 2026-10-05 to `preview`: runtime 1.0.1 group `db174e1e-8610-44d9-a34f-832d17d959a4`, runtime 1.0.0 group `2b23e527-8134-4f25-9eee-54ddf4bcbc23`.
      Republished 2026-10-07 from the corrected dependency tree (D-078):
      runtime 1.0.1 group `727dba4e-53f7-40d2-90f4-0d2f5d71a14a`, runtime
      1.0.0 group `0e4fd8d4-0b96-4394-8d7d-55c59843657e`.

**Sandbox price, answered (owner question, D-077).** The paywall shows
CAD 10.99 because Google quotes the real localised list price to every
account; $0 never appears in the app. A license tester is told "Test card,
always approves" only on the Google Play purchase sheet after tapping a
plan. The webhook accepts SANDBOX events, so the test order grants Book
Club and the cancel -> expire -> restore cycle can be recorded.

### Phase 5e - Auth link and email-sent round (added 2026-10-07, D-080)

Owner feedback from the closed-group rehearsal: the password-reset link
left the app "stuck loading", and the Create-account confirmation was a
single line lost under the form.

- [x] **Root cause of the hang.** The landing screens used
      `Linking.useURL()` = RN `getInitialURL()` (launch intent only) + a
      `url` listener registered on mount. On a warm start expo-router
      navigates to the screen in response to the same `url` event, so the
      screen's listener misses it; URL stays null, `setSession` never runs,
      spinner forever. Cold starts worked (D-076's "sometimes token-less").
- [x] **Fix at the root.** `AuthProvider` seeds from
      `Linking.getLinkingURL()` (Expo's native latest URL) and keeps a
      root-level `url` listener; links parsed by the pure
      `domains/auth/authLink.ts` (`parseAuthLink`, Supabase `error_code`
      mapping). Context now exposes `authLink`
      (`pending | idle | establishing | established | error`);
      `reset-password` and `email-confirmed` only reflect it, with a 12 s
      safety timeout to "That link didn't work" (*Request a new link* /
      *Back to sign in*).
- [x] **Email-sent screens.** `components/EmailSentCard.tsx` replaces the
      form after sign-up and after a reset request: address, instructions,
      *Send it again* (60 s cooldown = Supabase `max_frequency`; sign-up
      uses `auth.resend({ type: 'signup' })`), *Wrong address? Change it*,
      *Back to sign in*.
- [x] Tests: `authLink.test.ts` (fragment/query tokens, type mapping, none,
      `otp_expired`, description passthrough, error precedence,
      `parseUrlParams` merge). 394 tests / 35 suites; tsc and lint clean.
- [x] Ship the OTA for runtimes 1.0.3, 1.0.1 and 1.0.0 - published
      2026-10-07 to `preview` after PR #136: runtime 1.0.3 group
      `bc6e34ef-ea14-4cb9-bf2f-198a8d10de4a`, runtime 1.0.1 group
      `3caeab69-ca83-4131-9737-f3df215d2cf0` (an identical earlier group
      `8d8b31aa-beeb-4a47-b824-1d0c02f2fb14` was superseded within the
      minute), runtime 1.0.0 group `fa773212-4eef-49cd-81e4-c58582533cd1`.
- [ ] Owner re-test on device: (a) with the app already open on the sign-in
      screen, request a reset and tap the link - "Choose a new password"
      appears without a wait; (b) tap the same link a second time - the
      expired-link message appears, not a spinner; (c) Create account lands
      on the "Check your email" card and *Send it again* counts down.
### Phase 3/4 follow-through - billing lifecycle, trial, states (added 2026-10-04, D-068)

Price-independent billing work done while the owner finishes the financial
model. Nothing here changes with the price; the price landed the next day
(D-070, below) and set only the store product, the `goog_` key swap, and the
trial policy.

- [x] Migration `20261005090000_add_billing_lifecycle_and_trial.sql`:
      `companion_entitlements` + `will_renew`, `billing_issue_detected_at`,
      `grace_period_expires_at`, `cancel_reason`, `expiration_reason`,
      `period_type`, `product_id`, `store_environment`, `last_event_at`;
      `companion_billing_events` ledger (service-role only; event id PK);
      `companion_trial_policy` single row (`trial_days` 7, `qualifying_entries`
      5 - **placeholders**); RPCs `companion_trial_eligibility()` and
      `start_companion_trial()` (SECURITY DEFINER, advisory lock, one trial
      per account ever, former subscribers ineligible). Applied 2026-10-04,
      history 24/24.
- [x] `revenuecat-webhook` split: `lifecycle.ts` (pure: parse, store
      mapping, `decideEntitlementWrite`, `planTransfer`, `ledgerRow`),
      `handler.ts` (auth -> dedupe via ledger -> read row -> apply ->
      record), 13-line `index.ts`. 20 Deno tests in `lifecycle_test.ts`.
      Deployed 2026-10-04.
- [x] `companion` gate: `ACTIVE_LAPSE_TOLERANCE_MS` (7 days) for active rows
      whose period end has passed; comps and lifetime rows untouched.
      Deployed 2026-10-04.
- [x] Client: `entitlement.ts` reads the lifecycle columns
      (`ENTITLEMENT_SELECT`, `readLifecycle`, `foldEndReason`) and mirrors the
      lapse rule; `trial.ts` wraps the RPCs; `subscriptionCopy.ts` is the
      pure status/trial copy; `subscription.tsx` renders status card, trial
      card (offer / locked with progress bar), plans (entries-before-offer
      rule), store-management hint, cancelled-purchase notice, and the eight
      new analytics events; `PremiumOffer.tsx` loses "coming soon" for a
      View plans button; `CompanionOffer` copy mentions the trial.
- [x] Tests: `entitlement.test.ts` (lapse tolerance, lifecycle reads, reason
      folding), `trial.test.ts`, `subscriptionCopy.test.ts` (every state
      sentence). 363 tests / 30 suites; tsc and lint clean. CI gains the
      `edge-functions` Deno job.
- [x] Live integration smoke 2026-10-04 (throwaway user, cleaned up): 29
      checks - trial locked -> eligible after 5 entries -> started (7 days)
      -> second start refused -> eligibility `trial_used`; client select
      under RLS; policy + ledger invisible to readers; handler 405/401/400 +
      anonymous skip; INITIAL_PURCHASE (trial columns preserved) ->
      CANCELLATION -> UNCANCELLATION -> BILLING_ISSUE (period extended to
      grace end) -> RENEWAL (issue cleared) -> stale EXPIRATION skipped ->
      duplicate RENEWAL skipped -> EXPIRATION with reason; deployed gate 402
      on expired and on lapsed; ledger 8 lines with e6 `stale_event`;
      deployed webhook 405/401.
- [x] Docs: DECISION_LOG D-068, PRODUCT_ROADMAP §13 ticks + D-068 checklist,
      SUPPORT_BILLING_DISPUTES (ledger, lapse, trial), STAGE_2_OPERATIONS
      (function + table notes), `gates/STAGE_4_EXIT.md` draft.
- [x] Ship the OTA for both runtimes; record group IDs - PR #111, published
      2026-10-04 to `preview`: runtime 1.0.1 group `cd7e58c3-6dd1-40ae-8423-b0da4b7e6011`, runtime 1.0.0
      group `8dbe2974-6742-4de5-b465-27d9466f7bcd`.
- [x] After the pricing decision: set `companion_trial_policy`. *Done
      2026-10-04 (D-070): `bookmarkt_trial_enabled = false` - the store runs
      the trial; 7 days / 5 entries stay as the gate and the lever.*
- [ ] After the pricing decision (owner side): create the Play product, swap
      the `goog_` key, run one real sandbox purchase cycle (purchase ->
      cancel -> expire -> restore), close the exit gate. *See the D-070
      block.*

### Pricing decision and the store trial (added 2026-10-04, D-070)

Owner's financial model: **Monthly $7.99 USD, Yearly $79.99 USD** (saves
17%), auto-renewing, a **7-day free trial** on the monthly plan and **14
days** on the yearly plan (D-071; D-070 first said 7 on both). The
store's trial is the trial; Bookmarkt's own no-card trial (D-068) is off by
policy flag, not deleted.

- [x] Migration `20261005130000_store_trial_is_the_trial.sql`:
      `companion_trial_policy.bookmarkt_trial_enabled boolean not null
      default false`; `companion_trial_eligibility()` returns reason
      `store_trial` after the `needs_entries` check when the flag is off;
      `start_companion_trial()` refuses with `store_trial` and writes nothing.
      Applied 2026-10-04 (the version follows the bookmarkt.io waitlist
      migration `20261005120000`, D-069, already in the remote history).
- [x] Client: `billing/planCopy.ts` (pure: `readFreeTrial` from Play
      `defaultOption.freePhase` or a zero-priced `introPrice`, WEEK
      normalized to days; `freeTrialLabel` -> "7 days free";
      `annualSavingsPercent` -> 17 for 7.99 / 79.99); `BillingPackage` gains
      `packageType`, `price`, `trialLabel`; `subscription.tsx` plan buttons
      render "7 days free, then $7.99 per month" / "14 days free, then
      $79.99 per year" (the yearly phase per D-071),
      a "Save 17%" badge on the annual plan, and the store-trial note;
      `purchase_started` carries `store_trial`; `trial.ts` /
      `subscriptionCopy.ts` know the `store_trial` reason (no card).
- [x] Tests: `planCopy.test.ts` (Play phase, intro-price fallback, week
      normalization, no-trial, savings rounding and guards), `trial.test.ts`
      and `subscriptionCopy.test.ts` extended. 372 tests across 31 suites pass; tsc and lint
      clean.
- [x] Live smoke 2026-10-04 (throwaway user, cleaned up): policy row as
      applied; `needs_entries` at 0 -> `store_trial` at 5 ->
      `start_companion_trial` refused with no entitlement row -> flag on
      `eligible` -> flag off `store_trial`; policy unreadable by readers.
- [x] Docs: DECISION_LOG D-070; roadmap §13 ticks + D-070 checklist;
      `gates/STAGE_4_EXIT.md` pricing rows; SUPPORT_BILLING_DISPUTES trial
      row; STAGE_2_OPERATIONS flag note; DESIGN_REQUIREMENTS plan-button row.
- [x] Ship the OTA for both runtimes; record group IDs - PR #114, published
      2026-10-04 to `preview`: runtime 1.0.1 group `a9a254b9-6e01-4b1e-bd9f-541c9b75fb11`, runtime 1.0.0
      group `2eef106c-732f-46e2-aacf-dc6794e42578`.

**Store setup identifiers (owner side, then one line of code):**

| Where | Create | Notes |
| --- | --- | --- |
| Play Console -> Monetize -> Subscriptions | Subscription **`premium`** (buyer-facing name "Bookmarkt Premium") - **created 2026-10-04 (D-071)** | One subscription, two base plans; the client never hard-codes the id (it reads RevenueCat offerings), so the id names the tier rather than the app. Permanent. |
| Base plan 1 | **`monthly`**, auto-renewing, monthly, **$7.99 USD**; offer `free-trial`: **7-day free trial**, eligibility "new customer" - **created 2026-10-04** | Grace period 7 days with automatic account hold (the webhook handles BILLING_ISSUE, D-068); charge immediately on plan changes; resubscribe allowed. |
| Base plan 2 | **`yearly`**, auto-renewing, yearly, **$79.99 USD**; offer `free-trial`: **14-day free trial**, eligibility "new customer" - **created 2026-10-04** | Google computes and enforces one trial per account across both plans. |
| Google Cloud + Play Console -> Users and permissions | A service account (RevenueCat's Cloud Shell script or manual: Android Publisher, Play Developer Reporting, and Pub/Sub APIs enabled; JSON key downloaded), invited to the Play developer account with *View app information*, *View financial data*, *Manage orders and subscriptions*, and *Manage store presence* | Credentials can take up to 36 hours to validate against the Play Developer API. |
| RevenueCat -> Project -> Apps | Link the Play app `com.inkmarkt.bookmarkt` (service-account JSON) | Then **Products**: import `premium:monthly` and `premium:yearly`. |
| RevenueCat -> Entitlements | **`companion`** <- both products | The webhook maps any store event to the reader's row; the entitlement keeps RevenueCat's customer view meaningful. |
| RevenueCat -> Offerings | **`default`**: `$rc_monthly` = `premium:monthly`, `$rc_annual` = `premium:yearly` | The screen orders by package type and computes the saving (17% at the decided prices) from the two prices. |
| Play Console -> Monetization setup | Paste the Pub/Sub topic RevenueCat shows for Real-time developer notifications | Cancellations and renewals reach the webhook within seconds instead of on the next poll. |
| RevenueCat -> API keys | Copy the **`goog_`** public SDK key | Configured `goog_acdCtFcKInxdmAvZqOmGVrNHLBu` in `app/src/domains/billing/purchases.ts` (D-071); shipped OTA on `preview` (1.0.1 group `a3c3eb86-9d4a-4917-bbfd-55c12920c632`, 1.0.0 group `db83ed9a-f4c4-42a3-9671-5cd9112b3495`). |
| Play Console -> License testing | Add the fresh test account | Sandbox cycle: purchase (trial) -> cancel -> expire -> restore; record it in `gates/STAGE_4_EXIT.md`. Owner added their own account 2026-10-04. |

**Play Internal testing build (owner side, step by step):**

Play will not let you create a subscription until an app bundle that
carries the billing permission (react-native-purchases adds it) has been
uploaded, so the build comes first. `eas.json` has a `play-internal`
profile: an **.aab** signed for the store, `preview` update channel, live
Supabase project baked in.

1. Play Console -> **Create app**: name "Bookmarkt", default language,
   App/Free, accept the declarations. Package name is fixed by the first
   upload: `com.inkmarkt.bookmarkt`.
2. In `app/`, run `npx eas-cli@latest build --platform android --profile play-internal`.
   First time it asks to generate an Android keystore - say yes (EAS keeps
   it; Play App Signing re-signs on top). About 15-20 minutes on EAS.
3. Download the `.aab` from the link EAS prints (or expo.dev -> project ->
   Builds).
4. Play Console -> **Testing -> Internal testing -> Create new release** ->
   upload the `.aab` -> accept Play App Signing -> release name = version ->
   **Save** -> **Review release** -> **Start rollout to Internal testing**.
   The release goes live within minutes, no Google review.
5. Same screen, **Testers** tab -> create an email list containing the
   accounts that will install (the owner's and the fresh test account) ->
   copy the **opt-in URL**. License testing (Setup -> License testing) and
   this testers list are two separate lists; both are needed.
6. On the phone, signed in to Play with a listed account: open the opt-in
   URL, accept, install from the Play Store. Remove any sideloaded preview
   APK first - same package name, different signature.
7. Only now: **Monetize -> Subscriptions -> Create subscription** and
   follow the identifier table above. New products take up to a few hours
   to become purchasable; a license-tester account sees them sooner.
8. Later builds: repeat step 2 and 4 (**Create new release** on the same
   track). JS-only changes still arrive OTA over the `preview` channel.
   The `play-internal` profile auto-increments the Android `versionCode`
   (remote, D-077) - Play rejects a bundle whose code was already uploaded.
   Before building after a new native dependency, confirm no package from
   another SDK was hoisted: `git diff -- package-lock.json` should add no
   unexpected root `node_modules/expo-*` entry, and every root `expo-*`
   package must satisfy `node_modules/expo/bundledNativeModules.json`
   (D-078 - a wildcard peer dependency pulled in `expo-asset@57` and the
   1.0.2 binary crashed on launch).

Sandbox purchases with a license-tester account are not charged, renew
every 5 minutes (monthly) / 30 minutes (yearly), and the trial lasts
minutes rather than days - that is what makes the
purchase -> cancel -> expire -> restore cycle a same-evening test.

**What "sandbox" looks like (D-075).** License testing is keyed on the
**Google account signed in to Play on the phone**, not on the Bookmarkt
account - creating fresh Bookmarkt accounts changes nothing. The paywall
always shows the real store price (that is the price Google quotes); the
test status appears only on the **Google Play purchase sheet**, which says
"Test card, always approves" / "You will not be charged" instead of asking
for a payment method. If that sheet shows a real card, the phone's Play
account is not on Setup -> License testing (allow up to 15 minutes after
adding it; sign out/in of Play if needed) or the build was not installed
from the Internal testing track.

**Closed-group rollout checklist (friends and family, D-075):**

1. [x] Custom SMTP live (STAGE_2_OPERATIONS §8) - verified with domain
   `bookmarkt.io` in Resend 2026-10-07; emails delivered reliably.
2. [ ] Testing -> Internal testing -> Testers: add each tester's Gmail (the
   one on their phone's Play Store) to the email list; up to 100.
3. [ ] Setup -> License testing: add the same Gmails, so a tap on a plan is a
   test order rather than a real charge. Tell them it is safe to try.
4. [ ] Send the opt-in URL with three lines: accept, install from Play, open
   the app twice after installing (the second launch picks up the latest
   OTA update).
5. [ ] Point them at **Settings -> Report an issue** in the app for feedback;
   reports land in `issue_reports`.

---

## Distribution notes

- Phases 1-2 are JS/Supabase work: every round ships over-the-air to the
  owner's preview build, same as Stage 3.
- Phase 3 adds a native billing module: that round requires a fresh EAS
  Android build installed on the device (OTA cannot deliver native code).
- iOS billing verification is Stage 5 scope (Apple account + iOS builds);
  Stage 4 exits on Android evidence plus server-side state, per the
  established Android-first pattern (D-020).
