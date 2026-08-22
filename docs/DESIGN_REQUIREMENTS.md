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
   Bookmarkt's identity (locked 2026-08-21).
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

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| Bookcase with depth | Wooden case: crown molding across the top, plank-seam back panel, shaded sides, full-bleed shelf boards with under-shelf shadow. | Owner: "plain, soulless" flat case; skeuomorphic warmth is the app's differentiator while big apps went flat. | Shipped 2026-08-22 | D-023, D-024 |
| Books look like books | 2.5D covers: cloth color per book, darker spine ridge, paper title label, fore-edge page block, drop shadow. | Owner: titles alone "no longer look like books"; Apple Books/Kindle covers stay literal. | Shipped 2026-08-22 | D-023 |
| Recency shelf order | Most recently touched book takes the top-left slot; untouched books follow by newest-added; finished books settle onto lower shelves. | Default sort in Apple Books, Kindle, Bookly, StoryGraph. | Shipped 2026-08-22 | D-023 |
| Spotlight the active read | The freshest book leads the shelf with a gold halo, ink-dark "last entry" bubble with gold text, and a one-time peek nudge on arrival. ~~Largest on the shelf (widest slot, tallest cover)~~ - superseded by D-026: all books share one uniform size; prominence comes from position, glow, and motion. D-027 hardens this: every slot reserves the same bubble band and covers are a fixed height, so no book ever renders taller than its neighbors. | Reading trackers (Bookly, StoryGraph, Kindle home) keep covers uniform and highlight the current read via placement, badges, and motion; owner: the size difference made neighbors look thin, then the spotlight's bubble made its neighbor render taller. | Shipped 2026-08-22; amended same day | D-023, D-024, D-026, D-027 |
| Completion percent on cover | Progress bar + % on the label when a page position and total pages are known. | Bookly progress rings / Kindle percent - proven motivator. | Shipped 2026-08-22 | D-023 |
| Cover title typography | Wrap at spaces only - never break a word; type steps down for long words AND long overall titles (stricter rule wins), within readable bounds; a single extreme word ellipsizes on one line. | Kindle/Apple Books generated-cover behavior; NN/g glanceable-type guidance (don't shrink below readable). Owner 2026-08-22: scaling wasn't visible - the old rule only watched the longest word, which normal multi-word titles never trip. | Shipped 2026-08-22 (amended per D-027) | D-024, D-027 |
| Pull-out open animation | Tapping a book tips it off the shelf (lift, tilt, grow ~200ms) before the book screen opens. | Physical metaphor continuity; owner liked it on sight. | Shipped 2026-08-22 | D-023 |
| Finished books = leather collector set | All finished books share one treatment: deep leather cover, gold-stamped title, gold tooling frame, gilt page edges, gold FINISHED band with ink lettering. Darker AND celebratory - never dimmed/grayed. Unmarking a finished book returns it cleanly to its cloth cover (D-027 fixed an Android redraw glitch that left it a solid color). | Gestalt similarity groups the trophy row; dimming = "disabled" in platform conventions; Kindle/Apple celebrate completion; Easton Press collector-set metaphor. Owner chose over per-color darkening. | Shipped 2026-08-22 | D-025, D-027 |
| QR bookmarks behind a ribbon | Burgundy leather ribbon with gold thread draped over the crown molding, one-time pull nudge; replaces a top-level button. | Peeking-content affordance; conventional bookmark shape is icon-safe in a book app; owner: previous accent color blended in, earlier ribbon overlapped covers. | Shipped 2026-08-22 | D-023, D-024 |
| Add-a-book as floating + | Bottom-right FAB; top of screen stays clear for the shelf. | Thumb-zone research (Hoober: ~49% one-handed; bottom-right = natural zone, top = hard zone); Material FAB; Bookly pattern. Owner feared top button wasted space - confirmed. | Shipped 2026-08-22 | D-024 |
| Lived-in shelf | Odd empty slot holds a casual resting pile of books instead of a gap. | Empty-state warmth; skeuomorphic consistency. | Shipped 2026-08-22 | D-024 |
| No "My bookmarks" top button | Removed; function fully behind the ribbon. | Chrome reduction; the case is the hero. | Shipped 2026-08-22 | D-024 |
| Cover art treatment | Real cover art per book: chosen in add/edit via a cover picker (search Open Library by title/author, up to 8 candidates) or auto-filled by an ISBN scan/lookup; the painted-cloth cover remains the permanent fallback and broken images fall back silently. Finished books keep the gold border, FINISHED band, and gilt pages over real art; a percent pill overlays in-progress real covers. Attribution "Covers from Open Library" shows in the forms. | Real covers are the strongest "finished app" marker in every shipped reading tracker (StoryGraph/Bookly/Goodreads). Open Library permits moderate per-reader lookups with attribution; Google Books declined (ToS conflicts with the paid companion). | Shipped 2026-08-22 | D-028 |
| Scan or type the ISBN to add a book | The add-book screen leads with a "Scan the barcode" card (camera opens a full-screen scan sheet, EAN-13 only); a typed-ISBN field with "Look up" sits beside it. One scan or lookup fills title, author, publisher, year, pages, and cover in a single request - manual input always wins, and everything stays editable. ISBNs are checksum-validated so a misread never fires a bogus lookup. The scan card hides itself on builds without the camera module. | Barcode-scan-to-add is the marquee frictionless-entry pattern in Goodreads and Bookly; owner: "Remember, frictionless!" | Shipped 2026-08-22 (scan needs the next native build; typed lookup works everywhere) | D-028 |
| Vector iconography everywhere | All UI chrome uses Ionicons vector icons (flag, trophy, pencil, mic, camera, lock, sparkles, +); emoji stays only inside user-facing celebration copy (e.g., the finish toast). | Apple HIG and Material: emoji-as-icon renders inconsistently across OSes, can't be styled/weighted, and is ambiguous for screen readers; every major reading app uses drawn icons. | Shipped 2026-08-22 | D-027 |

## 3. The book screen

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| Companion recap teaser | Locked "Where you left off" row: gold-tinted Companion-branded card with serif title and gold pill; taps are counted as buying interest (ids/counts only). | Locked-preview upsell pattern; teaser taps as demand signal. | Shipped 2026-08-22 | D-022 |
| Finish / reopen a book | One prominent gold status pill under the title block: flag icon + "Mark as finished" (soft gold fill, firm border) flips to a solid-gold trophy icon + "Finished <date> · undo"; finishing celebrates with a toast and the shelf's leather treatment; undo is one tap, no ceremony. | Goodreads/StoryGraph place reading status directly under the title; Bookly uses a bold colored finish button; owner: the old outline buttons were "lost in the text". | Shipped 2026-08-22 (amended per D-026, D-027) | D-023, D-026, D-027 |
| Edit lives in the nav bar | "Edit" sits top-right in the navigation header, off the content. | Platform convention (iOS nav-bar Edit); rare actions don't spend body space. | Shipped 2026-08-22 | D-026 |
| Context-aware capture bar | The bottom bar follows the active tab (pencil/mic vector icons): Entries = Write / Speak; Characters = Add character / Speak character; Photos = Add photos. Same spot, same two-tap promise everywhere. | Material FAB guidance: the primary action button should reflect the current screen/tab's primary action. | Shipped 2026-08-22 | D-026, D-027 |
| Character form on demand | The four-field character form appears only when asked for via the capture bar (with ✕ to close); the tab is otherwise a searchable character list. Speak mode auto-starts dictation into the notes field with review before anything is kept. | Progressive disclosure; Day One's "+"-first capture; voice parity (J6). | Shipped 2026-08-22 | D-026 |
| Day-grouped entry timeline | Entries render under day headings - Today, Yesterday, then "Friday, August 15" (year added when different); a search field appears once a book has six entries. | Day One / Journey / Apple Journal group high-volume journals by day; search is the standard escape hatch as volume grows. | Shipped 2026-08-22 | D-026 |
| Voice equals typing | Capture bar offers Speak and Write with equal prominence; dictation auto-starts in speak mode. | Capture-without-friction principle (J6). | Shipped (Stage 2/3) | J6 |
| Tabs never lose work | Entries/Characters/Photos stay mounted; drafts and searches survive tab peeks. | Never cost the reader their words. | Shipped (Stage 2) | J5/J6 |
| Position at a glance | Header chip shows current page/chapter and relative time of last entry. | R1 time-to-oriented. | Shipped 2026-08-22 | J5 |

## 4. Paid companion incentives (Stage 6 surfaces, designed in Stage 3)

| Requirement | Look and feel | Research / proven pattern | Status | Refs |
| --- | --- | --- | --- | --- |
| One paid re-entry feature | "Where you left off" (name TBD): AI-written story-so-far from the reader's own entries, story or bullets at chosen detail, never past the latest entry. | Merged free+paid concepts - a verbatim replay added too little beyond rereading notes (owner bar). | Decided; ships Stage 6 | D-022 |
| Free tier sees a locked teaser | Teaser row present but locked until the companion exists; taps measured as buying interest. | Demand validation before build. | Shipped 2026-08-22 | D-022 |
| Free capture is never paywalled | Notes, characters, photos, positions stay free forever. | Trust; the reader's own words are theirs. | Standing rule | D-012 |
| Thinking-benefit claims stay mechanism-level | Socratic prompts, cue cards, continuity flags are described by mechanism, never marketed as measured outcomes. | Honest-claims rule anchored in the problem statement. | Standing rule | D-021 |
| AI capture assist (owner idea) | The reader describes a character (or entry) by voice in their own words; AI structures it into the four-field record for the reader to review and approve before anything saves. A quality-of-life companion capability - never required, and free capture stays frictionless without it. | Voice-first structured capture reduces entry friction; review-before-save keeps the reader the author. Tension to resolve before build: D-012 says the companion never writes the record, D-016 limits cleanup to punctuation/casing - approving this means amending those boundaries by decision entry. | Proposed - awaiting owner approval | D-027, D-012, D-016 |

## 5. Open design work (not yet designed/shipped)

- **AI capture assist** (owner idea, D-027): awaiting owner approval and a
  boundary decision against D-012/D-016 before any build.
- Onboarding and settings surface; move sign-out off the library header (J2, J9).
- QR scan-to-book transition states (J3; full payoff with Stage 5 smart links).
- Companion and subscription surfaces (J8, J11).
- Empty/error/loading state polish pass across screens (J10), including
  empty-state illustrations.
- App icon and splash screen (Stage 5 packaging).
