# Design Requirements Log - How Bookmarkt Should Look and Feel

| Field | Value |
| --- | --- |
| Status | Living document - updated every design round |
| Owner | Bookmarkt product owner |
| Companions | STAGE_3_DESIGN_FOUNDATION.md (readers and journeys), DECISION_LOG.md (D-numbers) |

This log records every look-and-feel requirement discussed with the owner:
what the app should look like, how it should feel to use, the research or
proven pattern backing each choice, and whether it has shipped. New rounds
append or amend rows; nothing is deleted, superseded rows are struck through
with a pointer to the replacement.

## 1. Experience pillars (how the app should FEEL)

1. **A warm library, not a productivity tool.** Wood, cloth, paper, leather
   and gold - the materials of reading - instead of flat cards. The shelf is
   Bookmarkt's identity (locked 2026-08-21). *Amended 2026-09-01 (D-040): the
   MVP expresses the warmth through a clean warm-neutral palette
   (paper-white surfaces, warm ink, terracotta accent, reserved gold) and
   serif literary typography rather than skeuomorphic materials; the
   mascot-era redesign sets the final identity after beta validation
   (D-038).*
2. **Judgment-free.** No streaks, no guilt mechanics, no red badges. The app
   celebrates progress and never scolds absence (roadmap principle; owner).
3. **Seconds to oriented.** Opening the app must answer "where was I?"
   almost instantly (R1 north star: time-to-oriented).
4. **One-handed and reachable.** Primary actions live in the natural thumb
   zone (Hoober's one-handed-use research; Material FAB guidance).
5. **Motion with meaning.** Animations guide attention or reward action;
   attention nudges play once (never loop) and are staggered so motions
   don't compete.
6. **Celebration, never dimming.** Completed things get richer, not grayer -
   dimming reads as "disabled" (platform conventions reserve it for
   unavailable controls).
7. **Research-cited decisions.** Every design choice cites published UX
   research or a dominant pattern from shipped reading apps (owner rule,
   2026-08-22; recorded per-decision in DECISION_LOG.md).

## 2. The bookshelf (library screen)

> **2026-09-01 (D-040): the skeuomorphic bookshelf below is retired for the
> MVP.** The rows in this table stand as design history. Carried forward
> into the clean library: recency ordering, the Continue Reading hero,
> cover-title typography, real cover art at 2:3, scan-to-add, minimal book
> details, vector iconography, the bottom-right FAB, and gold as the
> finished/celebration marker. Retired: the wooden case, 2.5D painted covers
> as the primary look (a flat painted cover remains the placeholder), the
> pull-out animation, the QR ribbon, and the settings gear (bookmarks and
> settings are now bottom tabs). The current library is specified in the
> **Clean library (D-040)** table at the end of this section. The add-book
> flow was later rebuilt search-first (D-042): the "Scan to add a book" and
> "Minimal book details" rows below describe the pre-D-042 flow; the current
> flow lives in the Clean library table.

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| Bookcase with depth | Wooden case: crown molding across the top, plank-seam back panel, shaded sides, full-bleed shelf boards with under-shelf shadow. D-031 deepened the wood to a dark, slightly desaturated walnut - the pale honey case read as clip-art next to real cover art. D-037 made the case scroll as one piece: crown and ribbon ride away with the top shelf instead of staying pinned over lower ones. | Owner: "plain, soulless" flat case; skeuomorphic warmth is the app's differentiator while big apps went flat. Dark interiors are how physical cases (and Kindle/StoryGraph shelf themes) make cover colors pop forward. A pinned molding floating over mid-shelf books broke the physical metaphor (owner report). | Shipped 2026-08-22; deepened and made scrolling same day | D-023, D-024, D-031, D-037 |
| Books look like books | 2.5D covers: cloth color per book, darker spine ridge, paper title label, fore-edge page block, drop shadow. | Owner: titles alone "no longer look like books"; Apple Books/Kindle covers stay literal. | Shipped 2026-08-22 | D-023 |
| Recency shelf order | Most recently touched book takes the top-left slot; untouched books follow by newest-added; finished books settle onto lower shelves. | Default sort in Apple Books, Kindle, Bookly, StoryGraph. | Shipped 2026-08-22 | D-023 |
| Spotlight the active read | The freshest book leads the shelf with a gold halo, ink-dark "last entry" bubble with gold text, and a one-time peek nudge on arrival. ~~Largest on the shelf (widest slot, tallest cover)~~ - superseded by D-026: all books share one uniform size; prominence comes from position, glow, and motion. D-027 hardens this: every slot reserves the same bubble band and covers are a fixed height, so no book ever renders taller than its neighbors. Superseded by D-031: halo, bubble, and nudge retired - the active read now leads via the Continue Reading hero card above the case and keeps the top-left shelf slot. | Reading trackers (Bookly, StoryGraph, Kindle home) keep covers uniform and highlight the current read via placement, badges, and motion; owner: the size difference made neighbors look thin, then the spotlight's bubble made its neighbor render taller. | Shipped 2026-08-22; superseded same day by the hero card | D-023, D-024, D-026, D-027, D-031 |
| Continue Reading hero card | A full-width resume card above the bookcase: cover thumbnail, CONTINUE READING eyebrow, serif title, author, gold progress bar + %, "position · last entry" subline; one tap opens the book. The hero book also keeps its shelf slot so the shelf always shows the complete collection. A "X reading · Y finished" stat line sits above it. | Kindle home, Bookly, and StoryGraph all lead with a resume-reading hero above the library grid - returning to the current read is the highest-frequency action; keeping the hero in the grid mirrors Kindle. | Shipped 2026-08-22 | D-031 |
| Completion percent on cover | Progress bar + % on the label when a page position and total pages are known. Real covers (D-031): a slim dark scrim bar across the cover base carries the gold fill + white % - readable on any art (the old floating pill vanished on light covers, e.g. the owner's Brothers Karamazov). | Bookly progress rings / Kindle percent - proven motivator; a scrim under text-on-imagery is the Kindle/Apple pattern and keeps WCAG-level contrast on unpredictable art. | Shipped 2026-08-22; amended same day | D-023, D-031 |
| Cover title typography | Wrap at spaces only - never break a word; type steps down for long words AND long overall titles (stricter rule wins), within readable bounds; single-word titles always render on ONE line, shrinking first and ellipsizing last (D-029 - React Native breaks any overflowing word mid-word, so "Monsterholic" split until the word thresholds tightened to the label's real width). | Kindle/Apple Books generated-cover behavior; NN/g glanceable-type guidance (don't shrink below readable). Owner 2026-08-22: scaling wasn't visible - the old rule only watched the longest word, which normal multi-word titles never trip; then "Monsterholic" still broke mid-word. | Shipped 2026-08-22 (amended per D-027, D-029) | D-024, D-027, D-029 |
| Pull-out open animation | Tapping a book tips it off the shelf (lift, tilt, grow ~200ms) before the book screen opens. | Physical metaphor continuity; owner liked it on sight. | Shipped 2026-08-22 | D-023 |
| Finished books = leather collector set | Painted covers: deep leather cover, gold-stamped title, gold tooling frame, gilt page edges, gold FINISHED band with ink lettering. Real covers (D-029): the diagonal band gave way to a stamped gilt inner frame + a solid-gold trophy plaque along the base, so the celebration never hides the cover art's title. D-031 simplified again: on real covers the frame + plaque became a single gold corner trophy medal (Kindle's finished-badge pattern) - the plaque still "didn't feel rewarding" over art; the cover now celebrates itself. Darker AND celebratory - never dimmed/grayed. Unmarking a finished book returns it cleanly to its cloth cover (D-027 fixed an Android redraw glitch that left it a solid color). | Gestalt similarity groups the trophy row; dimming = "disabled" in platform conventions; Kindle/Apple celebrate completion; Easton Press collector-set metaphor. Owner chose over per-color darkening; owner 2026-08-22: the band over real art "doesn't feel rewarding as it previously did". | Shipped 2026-08-22 (amended per D-029) | D-025, D-027, D-029 |
| QR bookmarks behind a ribbon | Burgundy leather ribbon with gold thread draped over the crown molding, one-time pull nudge; replaces a top-level button. Scrolls away with the case top (D-037). | Peeking-content affordance; conventional bookmark shape is icon-safe in a book app; owner: previous accent color blended in, earlier ribbon overlapped covers. | Shipped 2026-08-22 | D-023, D-024, D-037 |
| Add-a-book as floating + | Bottom-right FAB; top of screen stays clear for the shelf. | Thumb-zone research (Hoober: ~49% one-handed; bottom-right = natural zone, top = hard zone); Material FAB; Bookly pattern. Owner feared top button wasted space - confirmed. | Shipped 2026-08-22 | D-024 |
| Lived-in shelf | ~~Odd empty slot holds a casual resting pile of books instead of a gap~~ - superseded by D-031: empty slots stay clear. At three-across the painted pile read as fake filler beside real cover art; no shipped tracker decorates empty grid slots. | Empty-state warmth; skeuomorphic consistency. D-031: authenticity beats decoration once real covers arrived. | Superseded 2026-08-22 | D-024, D-031 |
| No "My bookmarks" top button | Removed; function fully behind the ribbon. | Chrome reduction; the case is the hero. | Shipped 2026-08-22 | D-024 |
| Cover art treatment | Real cover art per book: chosen in add/edit via a cover picker (search Open Library by title/author, up to 8 candidates) or auto-filled by an ISBN scan; the painted-cloth cover remains the permanent fallback and broken images fall back silently. Covers render at true 2:3 book proportions (D-029) and, per D-031, full-bleed - no painted spine/page strips over photographs (the strips squeezed art to ~0.59 width ratio and "looked odd"); D-032 settled the grid at **two-across** (owner: three felt small) and made the tile behind artwork transparent so no cloth tint halos a cover's edge (the finished gold ring left real covers too - the medal is the whole celebration); the painted fallback wears a soft ink veil so a placeholder never outshines real art. Finished real covers wear the gold corner medal; in-progress real covers carry the scrim progress bar. Attribution "Covers from Open Library" shows in the forms. | Real covers are the strongest "finished app" marker in every shipped reading tracker (StoryGraph/Bookly/Goodreads - all render covers full-bleed at 2:3, three-plus across). Open Library permits moderate per-reader lookups with attribution; Google Books declined (ToS conflicts with the paid companion). Owner: first covers looked "not scaled"; after D-030 the strips made covers "look odd". | Shipped 2026-08-22 (amended per D-029, D-031) | D-028, D-029, D-031 |
| Scan to add a book | The add-book screen leads with a "Scan the barcode" card (camera opens a full-screen scan sheet, EAN-13 only); one scan fills title, author, total pages, and the cover - manual input always wins, and everything stays editable (publisher/year retired per D-032). ~~A typed-ISBN field with "Look up" sat below it~~ - removed per owner (D-031): nobody types a 13-digit number when scan and plain manual entry exist; the scan card itself shows a spinner during lookup. The edit screen's cover picker keeps the exact-edition ISBN path (the ISBN is stored). ISBNs are checksum-validated so a misread never fires a bogus lookup. The scan card hides on builds without the camera module - manual entry remains. | Barcode-scan-to-add is the marquee frictionless-entry pattern in Goodreads and Bookly; owner: "Remember, frictionless!", then: "remove the ISBN row and just ask for the book scan". | Shipped 2026-08-22 (scan needs the camera build) | D-028, D-029, D-031 |
| Minimal book details | Add and edit ask only title, author, and total pages (plus the cover picker); publisher and publication year are gone from the forms and the book header. A scan records title, author, pages, and cover; Open Library still auto-fills missing pages. Picking a cover from the search also fills a blank author and blank page count from the matched edition (median pages across editions), with a one-tap Undo toast - typed input always wins and every field stays editable (D-033). Older books keep stored publisher/year in the database untouched - just no longer asked for or shown. | Every removed form field lifts completion (Baymard form research); Goodreads/Bookly scan-to-add asks for nothing beyond the scan; owner: publisher/year "not necessary at this stage". Undo-toast for a reversible automatic fill is the Material snackbar pattern; the median-pages caveat lives in the toast copy per the owner's edition-variance concern. | Shipped 2026-08-22 (amended per D-033) | D-032, D-033 |
| Vector iconography everywhere | All UI chrome uses Ionicons vector icons (flag, trophy, pencil, mic, camera, lock, sparkles, +); emoji stays only inside user-facing celebration copy (e.g., the finish toast). | Apple HIG and Material: emoji-as-icon renders inconsistently across OSes, can't be styled/weighted, and is ambiguous for screen readers; every major reading app uses drawn icons. | Shipped 2026-08-22 | D-027 |
| Settings behind a gear | A gear icon in the shelf header opens a Settings screen: grouped sections for the signed-in account (email + "your entries sync to this account"), a Your QR bookmarks shortcut, Report an issue, and the app version, with Sign out as a destructive-styled action behind a confirm dialog at the bottom. The shelf itself carries no sign-out link and no report link - the case is the hero. | Kindle, Apple Books, Goodreads, and Bookly all keep account/support behind a profile or gear entry; Apple HIG puts destructive actions behind an intentional step, never beside everyday navigation. Owner: "the settings window is not placed... make sure the app looks professional." | Shipped 2026-08-22; entry point superseded by the Settings tab (D-040) - the screen itself is unchanged | D-035 |

### Clean library (D-040, current)

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| Warm neutral surfaces | Paper-white background (#faf7f2), white cards, warm-ink text, a single terracotta accent, soft warm borders; serif stays on headers and book titles; gold appears only on finished/celebration markers. All text tokens meet 4.5:1 contrast on their surfaces. | StoryGraph, Goodreads, Fable, and Kindle all use clean neutral surfaces that let cover art carry the color; a single accent keeps actions unmistakable (Material/HIG). | Shipped 2026-09-01 | D-040 |
| Bottom-tab navigation | Three tabs - Library, My bookmarks, Settings - with vector icons and the terracotta active tint; book, add-book, and support screens stack above the tabs. | Bottom tabs are the universal pattern in StoryGraph, Goodreads, Fable, and Bookmory; top-level reachability beats hidden entry points (the ribbon and gear required discovery). | Shipped 2026-09-01 | D-040 |
| Sectioned cover grid | Flat 3-across grid of covers under "Currently reading" and "Finished" section headers; recency order carries over; stats chips ("X reading · Y finished") and the Continue Reading hero sit above the grid; bottom-right FAB adds a book. | Cover-first grids at 3-across are the shipped norm (StoryGraph library, Goodreads shelves, Kindle); section headers replace physical shelf rows. | Shipped 2026-09-01 | D-040 |
| Flat book cards | 2:3 cover with an 8pt radius; real art full-bleed; placeholder is a flat per-book color with the word-safe title typography; finished covers wear a small gold check badge; title, author, and a slim progress bar render below the cover; press feedback is a gentle opacity change (reduce-motion safe). | Flat cards with metadata below the cover match every current competitor; the gold badge keeps the celebration language without skeuomorphism. | Shipped 2026-09-01 | D-040 |
| Offline-aware error states | Every query screen distinguishes "you're offline" (cloud icon, friendly copy, retry) from other errors (alert icon, plain-language message, retry); retry buttons carry accessibility roles and labels. | Kindle/Goodreads degrade gracefully offline; NN/g error-message guidance (say what happened, in plain words, with a way forward). | Shipped 2026-09-01 | D-040 |
| Search-first add | The add-book screen leads with one search field (title, author, or a pasted ISBN) and a barcode-scan button beside it; results appear as you type - cover thumbnail, title, author · year · pages - and one tap adds the book (cover, author, and pages included) and returns to the library with a confirmation toast. A successful scan adds the matched book immediately; a miss opens the manual form with the ISBN kept. Scans only trust an exact ISBN match - a series sibling volume never stands in for the scanned one - and series subtitles merge into the title so volumes stay distinguishable. Blank pages on a manual add fill from Google Books (exact title match) before Open Library's cross-edition median. "Can't find it? Add it manually" reveals the previous three-field form with the cover picker. Google Books powers search and scan; Open Library remains the cover-picker source and the silent fallback; attribution for both shows in the form. | Search-first one-tap add is the shipped norm in Goodreads, StoryGraph, Fable, Bookmory, and Bookly - all lead with search, keep scan adjacent, and tuck manual entry behind a fallback link. Owner: "Adding books is not an easy process." Reference set: [COMPETITOR_REFERENCES.md](COMPETITOR_REFERENCES.md). | Shipped 2026-09-02 | D-042 |

## 3. The book screen

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| Companion recap teaser | Locked "Where you left off" row: gold-tinted Companion-branded card with serif title and gold pill; taps are counted as buying interest (ids/counts only). | Locked-preview upsell pattern; teaser taps as demand signal. | Shipped 2026-08-22 | D-022 |
| Finish / reopen a book | One prominent gold status pill under the title block: flag icon + "Mark as finished" (soft gold fill, firm border) flips to a solid-gold trophy icon + "Finished <date> · undo"; finishing celebrates with a toast and the shelf's leather treatment; undo is one tap, no ceremony. | Goodreads/StoryGraph place reading status directly under the title; Bookly uses a bold colored finish button; owner: the old outline buttons were "lost in the text". | Shipped 2026-08-22 (amended per D-026, D-027) | D-023, D-026, D-027 |
| Edit lives in the nav bar | "Edit" sits top-right in the navigation header, off the content. | Platform convention (iOS nav-bar Edit); rare actions don't spend body space. | Shipped 2026-08-22 | D-026 |
| Context-aware capture bar | The bottom bar follows the active tab (pencil/mic vector icons): Entries = Write / Speak; Characters = Add character / Speak character; Photos = Add photos. Same spot, same two-tap promise everywhere. | Material FAB guidance: the primary action button should reflect the current screen/tab's primary action. | Shipped 2026-08-22 | D-026, D-027 |
| Character form on demand | The four-field character form appears only when asked for via the capture bar (with ✕ to close); the tab is otherwise a searchable character list. Speak mode auto-starts dictation into the notes field with review before anything is kept. | Progressive disclosure; Day One's "+"-first capture; voice parity (J6). | Shipped 2026-08-22 | D-026 |
| Day-grouped entry timeline | Entries render under day headings - Today, Yesterday, then "Friday, August 15" (year added when different); a search field appears once a book has six entries. Search results highlight every match inside the entry text and the page/chapter chip - gold marker, bold, case-insensitive - so the reader sees where the word appears, not just which entries contain it (D-034). | Day One / Journey / Apple Journal group high-volume journals by day; search is the standard escape hatch as volume grows. Highlighted hits are the universal search convention (browsers, editors, mail); owner: "I do not see where in the text it is being used." | Shipped 2026-08-22 (amended per D-034) | D-026, D-034 |
| Voice equals typing | Capture bar offers Speak and Write with equal prominence; dictation auto-starts in speak mode. | Capture-without-friction principle (J6). | Shipped (Stage 2/3) | J6 |
| Tabs never lose work | Entries/Characters/Photos stay mounted; drafts and searches survive tab peeks. | Never cost the reader their words. | Shipped (Stage 2) | J5/J6 |
| Position at a glance | Header chip shows current page/chapter and relative time of last entry. | R1 time-to-oriented. | Shipped 2026-08-22 | J5 |

## 4. Paid companion incentives (Stage 6 surfaces, designed in Stage 3)

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| One paid re-entry feature | "Where you left off" (name TBD): AI-written story-so-far from the reader's own entries, story or bullets at chosen detail, never past the latest entry. | Merged free+paid concepts - a verbatim replay added too little beyond rereading notes (owner bar). | Decided; ships Stage 6 | D-022 |
| Free tier sees a locked teaser | Teaser row present but locked until the companion exists; taps measured as buying interest. | Demand validation before build. | Shipped 2026-08-22 | D-022 |
| Free capture is never paywalled | Notes, characters, photos, positions stay free forever. | Trust; the reader's own words are theirs. | Standing rule | D-012 |
| Thinking-benefit claims stay mechanism-level | Socratic prompts, cue cards, important event flags are described by mechanism, never marketed as measured outcomes. | Honest-claims rule anchored in the problem statement. | Standing rule | D-021 |
| Companion mascot identity | A distinguished scholarly capybara: textured brown tweed jacket, muted sage waistcoat, bow tie, monocle with chain, leather-bound journal, fountain pen, gold/brass accents. Adult, dignified, anatomically grounded proportions - never chibi, oversized-eye, or glossy-sticker cartoon. Earthy warm palette harmonizing with the app's paper/leather/wood aesthetic. Strictly non-judgmental (no scolding or grading) and book-genre-neutral in appearance. | Duolingo/Finch mascot-driven retention; quirkiness from dignified seriousness (deadpan), not cartoon antics; zero-guilt philosophy carried into the character. | Decided; concept drawing exists, professional art post-validation | D-038 |
| Dynamic mascot personality | A spider chart of intellectual archetypes (Analyst - thrillers/mystery, Empath - romance/drama, Philosopher - non-fiction/classics, World-Builder - fantasy/sci-fi) updates silently from logged genres and alters the system prompt governing the mascot's conversational flavor. Visuals never change - humor comes from deadpan contrast (a romance-heavy chart yields a Victorian sociologist analyzing love triangles). A fixed rule-set bounds the personality; the AI fits a flavor within it. | Prompt-driven personality makes dynamic character nearly free - no per-personality animation. Fixed rule-set avoids the branding risk of an off-model mascot. | Decided; ships with Stage 4 companion (text-only until final art) | D-038 |
| Mascot delivers every premium feature | Socratic dialogue, recaps, word bank, quizzes, book-club prep, and the structuring aid are all voiced/framed by the mascot - the companion IS the character. | Single coherent premium identity; the personality is the product's differentiator. | Decided; Stage 4 | D-038, D-039 |
| Word bank interaction | A box the mascot keeps safe, from which he pulls a word with definition, pronunciation, and an example sentence. Contents are AI-generated to the reader's level (light first-use assessment) and dominant genres, plus manually added words. | Genre-adaptive vocabulary keeps the bank relevant (cyberpunk vs Shakespeare); the box framing makes review a ritual, not a drill. | Decided; Stage 4 | D-039 |
| Mascot art deliverables (final version) | 5 layered vector master poses (neutral scholar, reflection, note-taker, encouragement, milestone trophy) + 6 animation sequences (onboarding bow, daily greeting, note-taking loop, pondering/loading loop, action-complete nod, book-finished celebration) as Lottie JSON or Rive, rigging-ready Illustrator sources. ~$5k, artist engaged. | Mobile-ready vector animation (Lottie/Rive) is the Expo-compatible standard; layer separation enables future rigging without redraw. | Deferred until closed-beta buy-in (validation-first strategy) | D-038 |
| Capture structuring aid (formerly "AI capture assist") | Premium: the mascot asks leading questions and helps the reader arrange their own words into a structured summary or character record. The AI never generates or summarizes content - the reader authors every saved word. Free capture stays frictionless without it. | Resolves the D-027 proposal: D-012/D-016 are amended (D-039) to permit question-asking and arrangement help, never authorship. Voice-first guidance reduces entry friction; reader-as-author preserves trust. | Decided; ships Stage 4 | D-039, D-027, D-012, D-016 |

## 5. Auth, first-run, and support

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| First-run welcome | A brand-new account's empty shelf greets instead of apologizing: serif "Welcome to Bookmarkt", the one-line promise ("Your reading, in your own words..."), one gold **Add your first book** button, and an italic reassurance that one sentence per sitting is plenty. Teaching happens by invitation - no tutorial screens, no permission asks until a feature needs them (mic on first dictation). | Stage 3 foundation J2: "progressive hints, not a tutorial; empty states that teach." Bookly/StoryGraph onboard by inviting the first book, not by touring; R3's north star is judgment-free momentum. | Shipped 2026-08-22 | D-036 |
| Plain-language auth errors | Sign-in, sign-up, and forgot-password never surface raw API phrasing: "Invalid login credentials" becomes "That email and password don't match...", unconfirmed email, duplicate account, rate limits, and network failures all get human copy via a unit-tested mapper; unknown errors fall back gracefully. | NN/g error-message guidelines (human language, say how to recover); J1 design gap "error states in plain language". | Shipped 2026-08-22 | D-036 |
| Report confirmation and status | Submitting a report confirms in-line ("Thanks - your report is in. You can track its status below.") and the screen lists the reader's reports with status chips (Received / In review / Resolved) and resolution notes when present. Entry point lives in Settings (D-035). | J10: "we got it" acknowledgment - readers need to feel heard; status visibility is the support-ticket convention. | Shipped (Stage 2/3) | J10, D-035 |
| QR bookmark states | Every scan outcome has a plain-language screen: linked bookmarks jump straight to the book (scan audited), unregistered codes offer "Add this bookmark to my account", unclaimed ones offer claiming, unlinked ones list the shelf to link, and conflicts explain that the code belongs to another account. Full physical-QR payoff arrives with Stage 5 smart links. | J3 design gap (landing / wrong-account / unclaimed states); frictionless re-entry is R1's north star. | Shipped (Stage 2/3) | J3 |

## 6. Open design work (not yet designed/shipped)

- Companion and subscription surfaces (J8, J11) - now mascot-led per
  D-038/D-039; MVP ships them text-only with in-house art.
- **Pattern recognition** (D-039, backburner): the mascot noticing recurring
  themes across a reader's entries and books and building on them in
  dialogue. Key differentiator for a unique per-reader experience; deferred
  until closed-beta buy-in.
- Final-version investments awaiting beta validation (D-038): professional
  mascot animation (~$5k, specced) and an outsourced professional UI/UX
  redesign.
- Onboarding polish beyond the first-run welcome (J2 shipped 2026-08-22,
  D-036) - a fuller multi-screen welcome only if usage shows the need;
  premium onboarding must also explain semantic search clearly (D-039).
- QR scan-to-book transition states (J3; full payoff with Stage 5 smart links).
- Empty-state illustrations (J10) - deferred to the professionally
  outsourced UI/UX pass (D-038); the clean D-040 empty states (plain
  invitation copy + action) are the MVP treatment.
- App icon and splash screen (Stage 5 packaging).

## 7. Component-state inventory (Stage 3)

The reusable pieces and the states each one covers, as shipped. This is the
formal design-system inventory required by the Stage 3 work plan.

| Component | States covered | Lives in |
| --- | --- | --- |
| Screen data states | Loading (spinner + label), empty (invitation copy + action button), offline error (cloud icon, "you're offline" copy, retry), other error (alert icon, plain-language message, retry), content | `components/states.tsx` + `lib/networkErrors.ts`; used by the library, book, and bookmarks screens |
| Book card | Real cover / flat placeholder with word-safe title / failed image falls back to placeholder; reading (progress bar) vs finished (gold check badge); pressed (opacity, reduce-motion safe) | `components/BookCard.tsx` |
| Continue Reading hero | Present when an in-progress book exists, hidden otherwise; pressed feedback; progress bar with or without a known % | `components/ContinueReadingCard.tsx` |
| Buttons | Default, pressed, disabled, busy (label swap, e.g. "Saving...") | Per-screen, shared token styling |
| Text inputs | Default, focused, inline validation error in plain language, disabled while submitting | Auth and book forms |
| Capture bar | Idle, typing, recording (state announced, not color-only), transcribing, error with retry | Book screen |
| Toasts | Success and undo variants, auto-dismiss, reduce-motion safe | Toast provider |
| Dialogs | Destructive confirmation (sign out, delete) with cancel as the safe default | Settings, book screen |
| Session states | Signed-out routing, session restore on launch, expired-session redirect with plain-language message | `(app)/_layout.tsx`, auth flow |
| Tabs | Active (terracotta tint + label), inactive (muted) | `(app)/(tabs)/_layout.tsx` |
