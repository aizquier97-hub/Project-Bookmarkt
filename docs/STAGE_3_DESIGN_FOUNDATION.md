# Stage 3 Design Foundation - Target Readers and Journey Map

| Field | ```<br>Value<br>``` |
| --- | --- |
| ```<br>Status<br>``` | ```<br>Approved<br>``` |
| ```<br>Date<br>``` | ```<br>August 22, 2026<br>``` |
| ```<br>Owner<br>``` | ```<br>Bookmarkt product owner<br>``` |
| ```<br>Sources<br>``` | ```<br>PRODUCT_ROADMAP.md §1-4, §12 (incl. D-021 problem-statement expansion); Stage 2 acceptance baseline; current app screens<br>``` |
```
```
```
Every Stage 3 design decision should trace back to this document. If a design
```
```
choice doesn't serve one of the readers below on one of the journeys below, it
```
```
doesn't ship. The running list of concrete look-and-feel requirements (what
```
```
shipped, what's proposed, and the research behind each) lives in
```
DESIGN\_REQUIREMENTS.md.

## 1. Target readers

All three readers share the root problem (roadmap §1): fragmented attention,
trained by short-form media, has made long-form reading harder than it used to
be. They differ in which failure hits them hardest.

### R1 - The re-entry reader (primary)

- **Who:** reads in bursts around a busy life; a book sits untouched for days
  or weeks between sessions. Often mid-book in one to three books at once.
- **Failure that bites:** P2 - Recall. Picking the book back up means
  re-reading pages to remember who people are and what happened; that feels
  like work, so the book stalls and eventually gets abandoned.
- **Job-to-be-done:** \*"When I finally have twenty minutes to read, get me
  back into the story in seconds, not pages."\*
- **What they need from design:** opening the app lands them one tap from
  their current book; their latest entry (their own words) is the fastest
  recap; capture at session end takes under a minute so future-them is always
  covered.
- **Design north star for R1: time-to-oriented.** From app-open to "I know
  where I was" must be seconds.

### R2 - The tracker (secondary)

- **Who:** actively reading, often dense fiction or nonfiction with large
  casts (fantasy, history, classics). May read regularly but still loses
  threads.
- **Failure that bites:** P3 - Comprehension. Characters, relationships, and
  causality blur mid-book; flipping back to check breaks immersion. Per the
  expanded problem statement (D-021), this is also where critical thinking
  lives: following motives and causality across a long text is that faculty
  in practice.
- **Job-to-be-done:** \*"Help me keep the cast and the plot straight without
  leaving my chair or spoiling what's ahead."\*
- **What they need from design:** character maps that are fast to build and
  glanceable mid-reading; entries that capture a thought in one sentence
  without ceremony; the spoiler-safe boundary respected everywhere. R2 is
  also the reader for whom the companion's thinking work pays off most -
  Socratic questions and quizzes built from their own tracked cast.
- **Design north star for R2: capture-without-friction.** Recording a
  character or thought must cost less attention than losing it would.

### R3 - The lapsed reader (aspirational)

- **Who:** used to read; wants to again. Buys books, starts them, drifts by
  chapter three. The bookmark QR (a gift or purchase) may be their entry
  point into Bookmarkt.
- **Failure that bites:** P1 - Stamina, compounded by P2 when they try to
  return.
- **Job-to-be-done:** *"Make finishing a book feel achievable again."*
- **What they need from design:** a first-run experience that asks nothing
  intimidating; visible, gentle progress (a bookshelf that fills); zero
  judgment - one-sentence entries are treated as fully valid; re-entry cost
  so low that a three-week gap doesn't end the book.
- **Design north star for R3: judgment-free momentum.** The product never
  makes them feel behind.

### Who Bookmarkt is not designing for (v1)

- Speed-readers and book-a-day readers optimizing throughput.
- Students needing citation-grade study notes or exam prep.
- Social readers wanting feeds, reviews, ratings, or sharing.
- Desktop readers - the launch product is a phone app (roadmap §4).

These exclusions keep capture fast and surfaces quiet; features serving them
are out of scope for Stage 3 design.

## 2. Journey map

Current implementation status uses the native app as it exists entering
Stage 3. "Design gap" is what Stage 3 must produce - it is the working list
for the design-system and screen-polish work items.

### J1. Signup and sign-in

- **Reader moment:** R3's first impression; R1/R2 return path on a new phone.
- **Today:** `(auth)` screens - sign-in, sign-up, forgot/reset password -
  functional with baseline styling; session persists across restarts.
- **Design gap:** ~~apply brand... error states in plain language~~ -
  shipped: serif brand title and tagline were in place, and D-036 added
  the plain-language error mapper (invalid credentials, unconfirmed
  email, duplicate account, rate limits, network) across sign-in,
  sign-up, and forgot-password; fields are password-manager-friendly
  (autocomplete hints). Remaining: none - J1 is closed for Stage 3.

### J2. First-run onboarding

- **Reader moment:** R3 deciding within a minute whether this is for them.
- **Today:** first-run welcome shipped 2026-08-22 (D-036): the empty shelf
  greets with a serif welcome, the one-line promise, one gold "Add your
  first book" action, and a judgment-free hint - invitation, not tutorial.
  The book screen's empty entries state teaches ("One line about where you
  are is a perfect start"); no permission asks until a feature needs them.
- **Design gap:** a fuller multi-screen welcome only if usage shows the
  need; J2 is otherwise closed for Stage 3.

### J3. QR entry

- **Reader moment:** R1 scanning the bookmark in their book to jump back in.
- **Today:** `bookmark/[code]` route resolves a bookmark code to its book;
  every scan outcome has a plain-language screen (linked → straight to the
  book with the scan audited; unregistered → add to account; unclaimed →
  claim; unlinked → pick the book from the shelf; conflict → belongs to
  another account). Physical QR codes still point at the frozen PWA until
  the smart-link service ships (Stage 5).
- **Design gap:** none in-app for Stage 3 - the journey's full payoff
  arrives with Stage 5 routing.

### J4. Library (the bookshelf)

- **Reader moment:** R1's homecoming screen; R3's progress-at-a-glance.
- **Today:** bookshelf-metaphor library (direction locked 2026-08-21) with
  the D-023 redesign shipped 2026-08-22: 2.5D covers (cloth color, paper
  label, page block) with completion percent where computable; recency
  sort - the freshest book sits top-left under a gold spotlight with a
  "last entry" bubble, finished books settle onto the lower shelves in
  gold; pull-out animation on open; finished-book marking from the book
  screen (`topics.finished_at`, `book_finished` analytics - the primary
  metric measured directly); QR-bookmark management now lives behind a
  ribbon bookmark on the bookcase frame. Sign-out is a header link.
  Refined same day (D-024): add-a-book is a bottom-right floating +
  (thumb-zone research); the ribbon is burgundy leather over a crown
  molding; titles wrap at spaces with cover-style type scaling (mid-word
  breaks eliminated, extreme single words ellipsize); the case has plank
  and shading depth with a resting book pile in odd slots; the spotlight
  book leads the shelf with an ink-and-gold "last entry" bubble and a
  one-time peek nudge (uniform book sizes per D-026 - prominence comes
  from position, glow, and motion, the pattern reading trackers use).
  Finished books render as a matched
  leather-bound collector set - deep leather, gold stamping and tooling,
  gilt page edges (D-025). Real cover art shipped 2026-08-22 (D-028):
  covers chosen via Open Library picker or filled by ISBN scan/lookup
  render on the shelf and book header, painted cloth stays the fallback,
  and the add-book screen leads with a barcode scan card (typed-ISBN
  lookup everywhere; scanning arrives with the next native build).
  Look-and-feel requirements are logged in DESIGN\_REQUIREMENTS.md.
  The D-031 professional pass (2026-08-22) reshaped the screen to match
  shipped trackers: real art full-bleed (painted strips retired over
  photographs), a Continue Reading hero card above the case replacing
  the spotlight halo/bubble/nudge, dark-walnut wood, scrim progress bars
  and a gold corner medal on finished covers, the resting pile retired,
  a reading/finished stat line, and scan-first add-book (typed-ISBN row
  removed per owner). Owner review (D-032, same day) settled the grid at
  two covers per shelf, removed the cloth-tint halo around real art,
  quieted the painted fallback under a soft ink veil, and cut book
  details to title + author + pages (publisher/year retired from forms
  and header; a scan records title, author, pages, cover). The case now
  scrolls as one piece of furniture - the crown molding and ribbon ride
  away with the top shelf instead of floating over lower ones (D-037,
  2026-08-22). **Superseded 2026-09-01 (D-040):** the bookshelf metaphor
  is retired for the MVP. The library is now a clean, competitor-matched
  screen - warm neutral surfaces, bottom tabs (Library / My bookmarks /
  Settings), stats chips, the Continue Reading hero, and a flat 3-across
  cover grid under "Currently reading" and "Finished" headers; gold
  survives as the finished-book check badge. Recency order, real cover
  art, the FAB, and the hero card all carry over.
- **Design gap:** none remaining for the MVP; the mascot-era redesign is
  professionally outsourced after beta validation (D-038). Historical:
  sign-out left the header for the settings screen 2026-08-22 (J9, D-035);
  uniform cover sizing was hardened 2026-08-22 (D-027); empty/error states
  closed 2026-09-01 with the offline-aware pass (D-040).

### J5. Book home and progress

- **Reader moment:** R1 orienting ("where was I?"); the screen most visits
  land on.
- **Today:** `book/[id]` with entries/characters/photos tabs; latest-entry
  boundary drives ordering; progress types (page/percent/chapter/finished).
  Entries render in a day-grouped timeline (Today / Yesterday / dated
  headings) with search from six entries; search hits are highlighted
  inside the entry text (gold marker, D-034) so the reader sees where
  the word appears; finishing is a gold status pill
  under the title and Edit lives in the nav bar (D-026).
- **Design gap:** the "re-entry moment" is the paid recap - "Where you left
  off" (working name, D-022): an AI-written story-so-far from the reader's
  entries, prose or bullets at reader-chosen detail. Free tier shows a
  locked teaser row (taps counted as buying-interest signal); free
  orientation stays glanceable via the header's position chip and
  last-entry age. Progress glanceable; tab bar styled to brand; this is
  the highest-value screen for R1 and gets design priority.

### J6. Capture - typed and voice

- **Reader moment:** R2 mid-chapter with a thought to keep; R1 at session
  end investing one minute for future-them.
- **Today:** entry composer with progress fields; voice dictation (record →
  review → confirm, raw transcript preserved) on dev/preview builds. The
  capture bar follows the active tab (D-026): entries write/speak an entry,
  characters add/speak a character, photos open the picker.
- **Design gap (roadmap: capture is the fastest path in the product):**
  composer opens focused with one-tap reachability from anywhere in the
  book; one-sentence entries visibly acceptable (short placeholder, no
  minimum, no "add more" nudges); voice one tap away with the same
  prominence as typing; review step preserves "your words, kept verbatim"
  framing; nothing anywhere grades, scores, or corrects the reader's
  writing. Proposed (D-027, owner idea, needs approval): an \*\*AI capture
  assist\*\* companion capability - the reader describes a character by
  voice and AI structures it into the four-field record for review before
  save; blocked on a boundary decision against D-012/D-016, and free
  capture stays frictionless with or without it.

### J7. Character maps

- **Reader moment:** R2 adding "Thomas Cromwell - blacksmith's son, now
  Wolsey's man" in ten seconds flat.
- **Today:** characters tab with name/role/description/relationships;
  add/edit/delete. Name alone is enough to save (J7's entry-speed bar);
  the list is searchable and ordered for mid-reading lookup.
- **Design gap:** relationship text kept lightweight -
  a visual graph is out of scope for v1 unless usability tests demand it.

### J8. Companion (design-only in Stage 3)

- **Reader moment:** R1 tapping "Where you left off" (working name, D-022)
  after three weeks away.
- **Today:** no user surface; retrieval foundation and entitlement gate
  exist server-side (Stage 2); subscription arrives Stage 4.
- **Design gap (all states designed now, built against Stage 4 backend):**
  questions-first dialogue; provenance labels ("from your notes" vs "from my
  knowledge"); visible declines; notes-mirror stance; locked/offer/trial/
  loading/expired states that never block capture; offer appears only after
  a few entries exist. Per D-021, these surfaces must make the thinking
  value visible in the experience: the dialogue visibly asks rather than
  tells, quizzes and cue cards visibly come from the reader's own words,
  and the offer frames the companion as exercise for the reader's thinking -
  mechanism-level framing only, never a measured-outcome claim.
  Per D-038/D-039 (2026-09-01) the companion is embodied by the scholarly-
  capybara mascot with an archetype-driven personality, and the feature set
  is revised (word bank, quote logs, important event flags, structuring aid,
  background reasoning; continuity flags removed) - the MVP ships these
  text-only, with professional mascot art following closed-beta validation.

### J9. Settings and account

- **Reader moment:** infrequent but trust-defining - password, privacy,
  sign-out, subscription management (Stage 4).
- **Today:** settings screen shipped 2026-08-22 (D-035): gear icon in the
  library header opens grouped sections - account (signed-in email), Your
  QR bookmarks, Report an issue, app version - with sign-out as a
  confirmed destructive action at the bottom. Password reset exists via
  the auth flow.
- **Design gap:** privacy/data links land here when the policies exist;
  subscription management (Stage 4) and data export/deletion (Stage 4)
  now have a home to land in.

### J10. Support and reports

- **Reader moment:** something's wrong (spoiler shown, bad transcript, bug);
  the reader needs to feel heard.
- **Today:** `report-issue` screen writes to the reports table (spoiler and
  issue categories); its entry point moved to the settings screen
  (D-035) - the shelf no longer carries a report link. Submitting confirms
  in-line ("Thanks - your report is in") and the reader's reports list
  shows status chips and resolution notes - the "we got it" loop exists.
- **Design gap:** contextual entry points on companion surfaces when they
  exist; empty/error/loading illustration polish waits on the brand pass.

### J11. Subscription purchase (design-only in Stage 3)

- **Reader moment:** R1/R2 deciding the companion is worth paying for.
- **Today:** nothing (Stage 4 scope).
- **Design gap:** offer surface, price presentation, trial framing, expired/
  downgraded states; canceled purchase returns to capture unharmed; designed
  in Stage 3 so Stage 4 wires billing into finished screens.

## 3. Priorities

Stage 3 design effort, in order:

1. **J5 + J6 (book home + capture)** - the daily loop; serves R1's
   time-to-oriented and R2's capture-without-friction directly.
2. **J4 (bookshelf)** - the emotional home and progress mirror; R3's
   momentum.
3. **J2 + J9 (onboarding + settings)** - new screens that complete the
   product skeleton.
4. **J1, J7, J10** - polish existing functional screens to brand.
5. **J8 + J11 (companion + subscription states)** - design-complete for
   Stage 4 to build against.
6. **J3 (QR transition states)** - designed now, fully exercised in Stage 5.

### Postponed from the D-031 redesign round (logged 2026-08-22)

To keep the shelf redesign shippable in one OTA round, these were
deliberately deferred and stay on this stage's list:

- **J9 - settings screen and sign-out relocation.** ~~Sign-out remains a
  header link on the library screen~~ - **shipped 2026-08-22 (D-035)**: a
  gear in the shelf header opens the settings screen (account, bookmarks,
  support, version, confirmed sign-out).
- **J2 - first-run onboarding.** ~~A warm welcome remains undesigned~~ -
  **shipped 2026-08-22 (D-036)**: the empty shelf now welcomes, promises,
  and invites the first book in one screen.
- **J10 - empty/error/loading illustration polish** ~~continues to wait on
  the brand illustration pass~~ - the clean D-040 states (plain invitation
  copy, offline-aware errors with retry) are the MVP treatment;
  illustrations join the outsourced professional UI/UX pass (D-038).

## 4. Stage 3 implementation record

Everything below shipped over-the-air during Stage 3 and is live on the
owner's EAS preview build, validated on every round by typecheck, lint,
and the test suite (139 tests across 14 suites at this writing).
Decisions D-021 through D-041 in [DECISION_LOG.md](DECISION_LOG.md) carry
the full rationale; the roadmap's Stage 3 "Completed work" list mirrors
this record.

| Shipped | Journeys served | Decisions |
| --- | --- | --- |
| Reader definitions, journey map, priorities (this document), problem-statement expansion, recap scope merge | all | D-021, D-022 |
| Bookshelf: wooden case with crown molding and leather QR ribbon, dark-walnut professional pass, full-bleed cover art, Continue Reading hero card, two covers per shelf, stat line, scan-first add-book, case scrolls as one piece | J4 | D-023, D-024, D-026, D-027, D-031, D-032, D-037 |
| Finished-book celebration: leather-bound collector set on painted covers, gold corner medal over real art | J4 | D-025, D-029, D-031 |
| Real cover art and frictionless entry via Open Library: barcode scan / ISBN lookup with checksum validation, cover picker on add and edit, cover pick fills blank author/pages with one-tap Undo | J4, J5 | D-028, D-029, D-033 |
| Book screen: day-grouped entry timeline, search with in-text match highlighting, gold finish pill, nav-bar Edit, context-aware capture bar | J5, J6 | D-026, D-034 |
| Settings screen behind a header gear (account, bookmarks, support, version, confirmed sign-out) | J9 | D-035 |
| First-run welcome on the empty shelf; plain-language auth errors on sign-in/sign-up/reset | J1, J2 | D-036 |
| Professional finish: vector icons replace emoji chrome, uniform cover slots, title typography ladder, true 2:3 cover geometry | J4 | D-027, D-029 |
| Crash flight recorder (unhandled errors reported to analytics) plus screen error boundary; diagnosed its first field crash remotely | reliability | D-030 |
| Clean interface: warm-neutral theme tokens, bottom-tab navigation (Library / My bookmarks / Settings), sectioned 3-across cover grid, flat book cards with gold finished badges, stats chips, restyled hero card | J4, J9 | D-040 |
| Offline-aware error states: connectivity failures render friendly "you're offline" messaging with retry on every query screen | J10 | D-040 |
| Device automation: Maestro flows for sign-in, add-book, and log-entry with an owner-run guide (`.maestro/`) | testing | D-040 |
| RLS hardening and isolation evidence: content writes now require topic ownership; a simulated two-user probe passes 13 cross-account checks against the live project | security | D-041 |
| Search-first add-book: Google Books-powered live search with one-tap add, scan adds the match immediately, manual entry as fallback; Open Library stays as cover picker and silent fallback | J4 | D-042 |

Still open in Stage 3 (all owner-run): the WCAG 2.2 AA audit checklist
results, the dogfooding log review, moderated usability tests with
representative readers, the physical bookmark prototype, and the Stage 3
exit sign-off - the roadmap's Stage 3 work plan is the authoritative
list. J8 (companion) and J11 (subscription) are design-complete and build
against Stage 4 billing.

## 5. Approval

- Product-owner approval of reader definitions and priorities: \*\*Approved,
  2026-08-22\*\* (recorded in session; readers R1/R2/R3, exclusions, journey
  priorities as written above).
