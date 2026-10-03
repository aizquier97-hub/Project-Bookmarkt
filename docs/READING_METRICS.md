# Bookmarkt Reading Metrics (D-062, D-063, D-064)

This document is the reference for every number on the Profile tab (the
home tab since D-064; "Progress" until then), the reading calendar, the
book screen's difficulty chip and trophy strip, and the Sandglass session
wrap-up. All metrics are computed **on the device** from the reader's own
entries and timed sessions (`app/src/domains/fitness/`). The one exception
is the Difficulty Index's knowledge rating (D-063): the `book-difficulty`
Edge Function sends a book's **catalog details only** (title, author,
edition year, genre, page count - never a note, quote, or reflection) to
the model once per book and caches the result on the `topics` row.

Design goals, in order: honest with sparse data, cheap to compute, and
explainable in one sentence inside the app ("How these are calculated").

## 1. Inputs

| Source | Table | What it contributes |
| --- | --- | --- |
| Bookmark entries | `entries` | Page/chapter boundaries (pages read), note words, `[Important]` flags, `[Quote]` passages, `reflection` text |
| Sandglass sessions | `reading_sessions` | Timed minutes, optional start/end page, pages read |
| Companion engagement | `analytics_events` | Days the reader used the companion (streak freezes only) |
| Book metadata | `topics` | Genre, publication year, page count, finished date, `difficulty_override`, cached `difficulty_estimate` + confidence + rationale |

Days are **local calendar days** (`YYYY-MM-DD` from the device clock).
Weeks start on Monday.

## 2. Difficulty Index `D` (1-10)

```
D = difficulty_override                     if the reader set one   ("set by you")
  = difficulty_estimate                     if the book has been rated   ("from what is known about this book")
  = c * D_text + (1 - c) * D_prior          until then   (fallback, §2.3)
```

### 2.0 Why the knowledge rating replaced the metadata-first design

D-062 shipped `D = c * D_text + (1 - c) * D_prior` alone. Three weeks of
real libraries showed it collapses toward 5 for almost every novel:

- Google Books' first category is usually just "Fiction" (−0.5), so the
  genre factor cannot tell Dostoevsky from a LitRPG.
- `publication_year` is the **edition's** year. A 2002 reprint of an 1880
  novel gets `era_adj = 0`, so the "+2.0 for the 1800s" row never fires for
  the classics it was written for.
- Length moves the score by less than ±1.
- The quote measurement only activates after 20 quoted words, and quotes
  are hand-picked aphorisms, not a fair sample of the prose.

Observed: *The Brothers Karamazov* 5.2, *Dungeon Crawler Carl* 4.9,
*Monsterholic* 4.9 - all "Moderate". Worked: Karamazov = 5 − 0.5 (fiction)
+ 0.84 (796 pp) ≈ 5.3; DCC = 5 − 0.5 + 0.34 (446 pp) = 4.85 → 4.9.

### 2.1 Knowledge rating (`book-difficulty` Edge Function)

The function is called once per book (after **Add book**, and by a gentle
backfill on launch for older books - 8 per launch, one at a time, each book
tried at most once per launch). It asks Gemini 2.5 Flash (temperature 0,
thinking off, JSON output) to place the book on a **fixed rubric with
anchor books**, using only the catalog fields:

| Score | Anchors (from the prompt) |
| --- | --- |
| 1 | Picture books and early readers (Dr. Seuss, *Frog and Toad*) |
| 2 | Chapter books (*Magic Tree House*, *Diary of a Wimpy Kid*) |
| 3 | Middle grade, manga, light novels, LitRPG, comic or cozy genre fiction (*Percy Jackson*, *Dungeon Crawler Carl*, *Harry Potter 1*, *Legends & Lattes*) |
| 4 | Fast commercial fiction and popular self-help (*The Hunger Games*, Dan Brown, Colleen Hoover, *Atomic Habits*) |
| 5 | Mainstream adult fiction and narrative nonfiction (Stephen King, *Project Hail Mary*, *Educated*, *Sapiens*) |
| 6 | Ambitious genre fiction with heavy worldbuilding, or dense popular nonfiction (*Dune*, *The Lord of the Rings*, *Thinking, Fast and Slow*, *A Brief History of Time*) |
| 7 | Literary fiction with demanding prose or structure, most 19th-century novels (*Beloved*, *Crime and Punishment*, *Jane Eyre*, *Blood Meridian*, *One Hundred Years of Solitude*) |
| 8 | Long canonical heavyweights and serious scholarship (*Moby-Dick*, *The Brothers Karamazov* 8.5, *War and Peace* 8.5, *Infinite Jest* 8.5, *The Wealth of Nations*) |
| 9 | Modernist and philosophical landmarks (*Ulysses*, *Gravity's Rainbow*, *Being and Time*, *The Sound and the Fury*) |
| 10 | The hardest texts in the language (*Finnegans Wake*, *Critique of Pure Reason*, *Phenomenology of Spirit*) |

The prompt tells the model to judge the reading experience of the standard
English edition or translation - vocabulary and sentence complexity,
narrative/structural complexity, conceptual density and background
knowledge, archaic or translated prose, and length as a minor stamina
factor - and never quality, popularity, or enjoyment. The stored year is
labelled "edition year (may be a reprint)" so a 2002 Karamazov is not read
as a contemporary novel.

The model returns `{ difficulty, confidence, rationale, known }`. Rules
applied server-side (`supabase/functions/book-difficulty/index.ts`):

- `difficulty` is rounded to 0.1 and clamped to 1-10; the function
  rejects non-JSON or out-of-range replies (the client falls back to §2.3).
- `confidence` ∈ {high, medium, low}; `known: false` forces `low`, and the
  UI then says "rough estimate - little is known about this book" and
  shows "(rough)" beside the estimate in Edit book, inviting an override.
- `rationale` is capped at 240 characters and shown in **Edit book** so the
  reader can see *why* ("Long, dense 19th-century Russian novel with complex
  philosophical themes…").
- The result is written to `topics.difficulty_estimate`,
  `difficulty_estimate_confidence`, `difficulty_rationale`,
  `difficulty_estimated_at` under the reader's own RLS; repeat calls return
  the cached row (`cached: true`) with no model call.
- Per-user cap of 60 ratings per UTC day (`DIFFICULTY_DAILY_USER_LIMIT`),
  then HTTP 429 `RATE_LIMITED`. No companion entitlement gate: difficulty is
  a core free metric. Cost ≈ US$0.0002 per book.
- Changing a book's **title or author** in Edit book clears the cached
  rating (it described a different book); the backfill rates it again.

Live calibration on deploy (2026-10-03, throwaway account): Karamazov 8.5
high, Dungeon Crawler Carl 3.0 high, Monsterholic 3.0 low, Harry Potter 1
3.0 high, Critique of Pure Reason 10.0 high, Atomic Habits 4.0 high.

The rating is deliberately **stable** once stored, like a Strava segment:
a book's difficulty is a property of the book, not of which quotes the
reader happened to log.

### 2.2 Measured text difficulty (fallback input)

For the concatenated `[Quote]` bodies of a book:

```
FKGL = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
D_text = clamp(1 + (FKGL - 3) * 9 / 13, 1, 10)
```

FKGL is the Flesch-Kincaid grade level. Grade 3 maps to 1, grade 16 maps to
10. Syllables are counted heuristically (vowel groups after stripping silent
`e`/`es`/`ed`, minimum 1 per word); sentences are `. ! ? ;` runs plus a
trailing fragment.

### 2.3 Metadata prior and fallback blend

```
D_prior = clamp(5 + genre_adj + era_adj + length_adj, 1, 10)
```

Genre rows are checked in this order against the lower-cased genre string;
the first match wins ("Science Fiction" matches the -1.0 row before the
science row).

| Factor | Adjustment |
| --- | --- |
| Genre: children, juvenile, picture book, early reader | -2.5 |
| Genre: young adult, teen, middle grade, graphic novel, manga, comics, light novel, litrpg | -1.5 |
| Genre: philosophy, theology, metaphysics | +2.5 |
| Genre: classics, poetry, literary criticism, academic, scholarly, textbook | +2.0 |
| Genre: science fiction, romance, fantasy | -1.0 |
| Genre: science, physics, mathematics, economics, law, medicine, history, engineering | +1.5 |
| Genre: literary, nonfiction, essays, biography, memoir, politics, psychology, business | +1.0 |
| Genre: mystery, thriller, horror, adventure, humor, fiction (plain) | -0.5 |
| Published before 1800 | +2.5 |
| 1800-1899 | +2.0 |
| 1900-1949 | +1.0 |
| 1950-1989 | +0.3 |
| Length | `clamp(log2(pages / 300) * 0.6, -1.5, 1.5)` |

Unknown genre or year contributes 0.

```
confidence c = 0                      if quoted words < 20
             = min(1, words / 150)    otherwise
D_fallback = c * D_text + (1 - c) * D_prior
```

The fallback is what the chip shows in the seconds between adding a book
and its rating arriving, and whenever the function is unreachable. Its UI
caption is "measured from N quoted words" (c > 0) or "estimated from genre,
era, and length" (c = 0).

### 2.4 Override, labels, weight

If the reader sets a difficulty in **Edit book** (`topics.difficulty_override`,
1-10 in half steps), it replaces `D` entirely and the UI says "set by you".

Labels: **Light** < 3.5, **Moderate** < 5.5, **Demanding** < 7.5, **Dense** ≥ 7.5.

Difficulty weight used in effort: `w(D) = D / 5` (a 5/10 book counts pages at
face value; a 10/10 book doubles them; a 1/10 book counts a fifth).

## 3. Comprehension factor `C` (0.6-1.4)

A deterministic proxy for engagement with the text, per book per day. v1
deliberately uses no model: it rewards the behaviours Bookmarkt already
asks for.

```
C = 0.6
  + 0.4  if at least one entry was logged that day
  + 0.2 * min(1, note_words / 80)
  + 0.1  if any entry that day carries [Important]
  + 0.1  if any quote that day has a written reflection
C = min(C, 1.4)
```

`note_words` counts the reader's own words: note bodies and quote
reflections. Quoted passages are the author's words and do not count.

## 4. Session Effort `E` and daily load

Per book per day:

```
pages = max(pages_from_entries, pages_from_sessions)
E     = pages * (D / 5) * C
```

Pages from entries come from boundary headers (`[Manual Entry - page 21-35]`
= 15 pages; a single-value header after a previous boundary = pages
advanced; chapters count 10 pages each). A book's first logged position is
capped at 50 pages (3 chapters) so adding a half-read book does not spike
the day. A note with no page movement credits 5 pages.

Pages from sessions use `end_page - start_page` when both were entered,
otherwise `minutes * median pace` from the reader's own timed sessions
(default 0.5 pages/min before any exist). Entry pages and session pages are
not summed - the same reading would be counted twice.

Daily load `L_d` is the sum of `E` across books that day.

## 5. Reading Fitness `F`

```
F_d = F_(d-1) + (L_d - F_(d-1)) / 42
```

A 42-day exponentially weighted moving average of daily load, the same
construction Strava's Fitness uses for training load. A quiet day lowers F
by about 2.4%; a steady habit lifts it toward the reader's typical daily
effort. The Profile tab shows the current value and the % change over
1M / 3M / 6M / 1Y (null until the series is at least 0.5 at the start of
the range). Since D-064 a rising value is set in gold ink and a falling one
in slate ink (`colors.rise` / `colors.fall`) rather than green/red.

Reading Fitness therefore realizes the brief's **Pace x Difficulty x
Comprehension**: pace and volume enter as pages per day, difficulty as
`D / 5`, comprehension as `C`, smoothed so one heroic Sunday does not
outrank a month of evenings.

## 6. Secondary metrics (Profile tab)

| Metric | Definition |
| --- | --- |
| Volume | Pages this week vs the average of the previous 4 weeks (`+X%`); 12 weekly bars |
| Pace | **Pages per minute** (two decimals) across timed sessions ≥ 60 s with a page range, last 28 days (all-time fallback). Was pages per hour until D-064; the timer's wrap-up reports the same unit for the single sitting (`sessionPacePagesPerMinute`) |
| Endurance | Mean timed session length, minutes |
| Consistency | Read days per week over the last 28 days |
| Difficulty | Pages-weighted mean `D`, last 28 days |
| Comprehension | Pages-weighted mean `C`, last 28 days |
| Reading days | 16-week heatmap; level 0-4 by load quartile. Tapping it opens the **reading calendar** (D-064) |

### 6.1 Reading calendar (D-064)

`computeCalendarMonth` lays one month out Monday-first (nulls pad the first
and last week). Each day is one of:

| Kind | Rule | Drawn as |
| --- | --- | --- |
| `read` | the day's `DailyLoad` has pages, entries, or sessions > 0 | gold disc |
| `current` | not read, but an engagement day (§7) | dashed leather ring ("Reading Current") |
| `quiet` | neither | plain |

Today is ringed in walnut; future days are muted and not tappable. Month
totals are reading days, pages, timed minutes, and (when > 0) Reading
Current days. Tapping a day shows its pages, minutes, entries, and
sessions. The forward arrow stops at the current month.

## 7. Streaks and "Reading Current"

- A **read day** is any day with an entry or a Sandglass session.
- An **engagement day** is a day with any of: `companion_opened`,
  `companion_message_sent`, `companion_tool_used`, `recap_requested`,
  `semantic_search_used`, `entry_flag_applied`.
- The current streak counts consecutive read days ending today or yesterday.
  An engagement-only day inside the run **freezes** it (does not count, does
  not break) for at most 2 consecutive days. The state is `active` (read
  today), `at_risk` (alive, nothing yet today), `frozen` (today covered only
  by engagement), or `none`.
- Longest streak is counted the same way across all history.
- Per-book streaks use the same rule with that book's days only.

## 8. Segment trophies

Each book with a page count `P` has four pieces at thresholds
`ceil(P * k / 4)` for `k = 1..4`. The reader's furthest page (max of entry
boundaries and session end pages) unlocks pieces; marking the book finished
completes the trophy. Books without a page count are ineligible until
finished, when the trophy completes outright.

Completed trophies fill the Profile tab's **trophy case, shelved by
difficulty band** (D-064): four fixed shelves - Light (D < 3.5), Moderate
(3.5-5.4), Demanding (5.5-7.4), Dense (≥ 7.5), the same bands as
`difficultyLabel` - each showing its count; empty shelves stay visible so
the case reads as something to fill. Tapping a shelf lists its books
(newest finished first); tapping a book opens it. Beneath the shelves,
**Pieces in progress** previews up to four part-built trophies and expands
to **every unfinished book** (`booksInProgress`, most recently active
first), each with its trophy strip and `n/4` count.

### 8.1 After the glass: the entry handoff (D-064)

When a Sandglass sitting is saved without the optional note, the summary
screen leads with a "Now, one line about it" prompt. Its primary action
opens the book at `/book/[id]?compose=write&page=<end page>`: the entry
composer is already open and focused with the stopping page prefilled, so
the entry that lifts the sitting's comprehension factor is one tap and a
sentence away. Sittings saved with a note keep the plain "Open the book"
action.

## 9. Known limits and follow-ups

- The knowledge rating is only as good as the model's familiarity with the
  book. Obscure, self-published, or non-English titles come back `low`
  (shown as "rough"); the reader override is the correction path. A later
  v3 could blend the quote measurement back in for low-confidence books
  once enough quoted words exist.
- Ratings are per topic row, so two readers of the same book each spend a
  call; a shared `book_difficulty` cache keyed by ISBN would cut cost if the
  per-book spend ever matters (today ≈ US$0.0002).
- Comprehension is a behavioural proxy. A model-scored reflection quality
  (companion feature, quota-gated) is the natural v2.
- Vocabulary richness (type-token ratio of the reader's notes) was
  considered and deferred - too noisy below ~500 words.
- Pages estimated from minutes use the reader's own median pace; before any
  paged session exists the default 0.5 pages/min is a guess.
- Keeping the screen awake during the glass requires `expo-keep-awake` and a
  native build; the timer derives from wall-clock so backgrounding is safe.
