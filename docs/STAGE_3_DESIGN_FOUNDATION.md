# Stage 3 Design Foundation - Target Readers and Journey Map

| Field | Value |
| --- | --- |
| Status | Approved |
| Date | August 22, 2026 |
| Owner | Bookmarkt product owner |
| Sources | PRODUCT_ROADMAP.md §1-4, §12 (incl. D-021 problem-statement expansion); Stage 2 acceptance baseline; current app screens |

Every Stage 3 design decision should trace back to this document. If a design
choice doesn't serve one of the readers below on one of the journeys below, it
doesn't ship. The running list of concrete look-and-feel requirements (what
shipped, what's proposed, and the research behind each) lives in
DESIGN_REQUIREMENTS.md.

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
- **Job-to-be-done:** *"When I finally have twenty minutes to read, get me
  back into the story in seconds, not pages."*
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
- **Job-to-be-done:** *"Help me keep the cast and the plot straight without
  leaving my chair or spoiling what's ahead."*
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
- **Design gap:** apply brand (paper-and-leather, serif); warm first-contact
  copy that sells the promise in one line; error states in plain language;
  password-manager-friendly fields.

### J2. First-run onboarding

- **Reader moment:** R3 deciding within a minute whether this is for them.
- **Today:** none - a new account lands on an empty library.
- **Design gap (build in Stage 3):** guide from empty library → first book →
  first entry with progressive hints, not a tutorial; empty states that teach
  ("Your shelf is empty - add the book you're reading"); no permission asks
  until the feature needs them (mic on first dictation).

### J3. QR entry

- **Reader moment:** R1 scanning the bookmark in their book to jump back in.
- **Today:** `bookmark/[code]` route resolves a bookmark code to its book;
  physical QR codes still point at the frozen PWA until the smart-link
  service ships (Stage 5).
- **Design gap:** design the scan-to-book transition (landing state, wrong-
  account state, unclaimed-code state); this journey's full payoff arrives
  with Stage 5 routing, but the in-app screens are designed now.

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
  gilt page edges (D-025). Look-and-feel requirements are logged in
  DESIGN_REQUIREMENTS.md.
- **Design gap:** cover art treatment - real covers are the top
  professional-polish item per the D-027 audit (Open Library Covers /
  Google Books sources identified; awaiting owner approval, no schema
  field yet); move sign-out into settings (J9). Uniform cover sizing was
  hardened 2026-08-22 (D-027): fixed cover heights and a reserved bubble
  band in every slot, and all UI chrome now uses vector icons.

### J5. Book home and progress

- **Reader moment:** R1 orienting ("where was I?"); the screen most visits
  land on.
- **Today:** `book/[id]` with entries/characters/photos tabs; latest-entry
  boundary drives ordering; progress types (page/percent/chapter/finished).
  Entries render in a day-grouped timeline (Today / Yesterday / dated
  headings) with search from six entries; finishing is a gold status pill
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
  writing. Proposed (D-027, owner idea, needs approval): an **AI capture
  assist** companion capability - the reader describes a character by
  voice and AI structures it into the four-field record for review before
  save; blocked on a boundary decision against D-012/D-016, and free
  capture stays frictionless with or without it.

### J7. Character maps

- **Reader moment:** R2 adding "Thomas Cromwell - blacksmith's son, now
  Wolsey's man" in ten seconds flat.
- **Today:** characters tab with name/role/description/relationships;
  add/edit/delete.
- **Design gap:** entry speed (name alone is enough to save); glanceable
  list ordered for mid-reading lookup; relationship text kept lightweight -
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

### J9. Settings and account

- **Reader moment:** infrequent but trust-defining - password, privacy,
  sign-out, subscription management (Stage 4).
- **Today:** no settings screen; sign-out is a library header link;
  password reset exists via auth flow.
- **Design gap (build in Stage 3):** a simple settings screen - account,
  sign-out, app version, support link, privacy/data links - giving
  subscription management (Stage 4) and data export/deletion (Stage 4) a
  home to land in.

### J10. Support and reports

- **Reader moment:** something's wrong (spoiler shown, bad transcript, bug);
  the reader needs to feel heard.
- **Today:** `report-issue` screen writes to the reports table (spoiler and
  issue categories).
- **Design gap:** confirmation and status messaging (roadmap item) - "we
  got it" acknowledgment; entry point relocated to settings + contextual
  spots (companion surfaces when they exist).

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

## 4. Approval

- Product-owner approval of reader definitions and priorities: **Approved,
  2026-08-22** (recorded in session; readers R1/R2/R3, exclusions, journey
  priorities as written above).
