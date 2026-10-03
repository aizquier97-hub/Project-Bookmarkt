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
- [ ] **Financial model**: AI cost per companion session (provider pricing x
      expected usage), infrastructure, app-store commission (~15% small
      business tier), taxes, refunds, support, and target margin.
- [ ] **Set the price, billing period, and introductory offer.** The trial
      is server-authorized, time-bound, one per account, and begins only
      after the qualifying number of entries exists.
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
      waits for Stage 5's iOS builds. *Blocked on the pricing decision
      (Phase 0); development runs against RevenueCat's Test Store meanwhile.*
- [x] Webhooks -> Supabase entitlement activation: idempotent, signed, with
      transaction reconciliation.
      *Done 2026-09-06: `revenuecat-webhook` Edge Function - shared-secret
      auth, absolute idempotent upserts, dev_comp rows preserved (D-061).*
- [ ] Purchase, restore, cancellation, grace period, expiry, refund, and
      billing-retry states; a declined/canceled/abandoned purchase returns
      safely to capture without losing work.
- [x] Server-verified purchase state required before companion access.
      *Structural since D-047: the Edge Function re-checks the entitlement
      row on every request; the webhook is that row's only store writer.*
- [ ] Subscription and account-management screens (Settings gains a
      subscription row); the companion offer appears only after a few
      entries exist, matching the trial rule.
      *Partially done 2026-09-06: Subscription screen (plans, purchase,
      restore) + Settings row + the offer's View plans button shipped
      (D-061). The entries-before-offer rule and the trial itself follow
      with the pricing decision.*
- [ ] Free capture is never paywalled and never degraded by subscription
      state.

## Phase 4 - Hardening and exit gate

- [ ] Sandbox purchase test matrix: duplicate events, delayed webhooks,
      refunds, revocations, offline receipts, cross-platform restoration.
- [ ] Subscription analytics without exposing payment details.
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
      revisit alongside the Phase 3 billing integration.*
- [ ] Walk the Stage 4 exit gate (roadmap §13) and record the review in
      `gates/STAGE_4_EXIT.md`.

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
- [x] Ship the OTA for both runtimes; record group IDs - PR #PRNUM, published
      2026-10-04 to `preview`: runtime 1.0.1 group `GROUP101`, runtime 1.0.0
      group `GROUP100`.

---

## Distribution notes

- Phases 1-2 are JS/Supabase work: every round ships over-the-air to the
  owner's preview build, same as Stage 3.
- Phase 3 adds a native billing module: that round requires a fresh EAS
  Android build installed on the device (OTA cannot deliver native code).
- iOS billing verification is Stage 5 scope (Apple account + iOS builds);
  Stage 4 exits on Android evidence plus server-side state, per the
  established Android-first pattern (D-020).
