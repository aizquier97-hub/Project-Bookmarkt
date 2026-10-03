# Bookmarkt Reading Metrics (D-062)

This document is the reference for every number on the Progress tab, the
book screen's difficulty chip and trophy strip, and the Sandglass session
wrap-up. All metrics are computed **on the device** from the reader's own
entries and timed sessions (`app/src/domains/fitness/`); nothing is sent to
a model and nothing new is stored except the session rows themselves.

Design goals, in order: honest with sparse data, cheap to compute, and
explainable in one sentence inside the app ("How these are calculated").

## 1. Inputs

| Source | Table | What it contributes |
| --- | --- | --- |
| Bookmark entries | `entries` | Page/chapter boundaries (pages read), note words, `[Important]` flags, `[Quote]` passages, `reflection` text |
| Sandglass sessions | `reading_sessions` | Timed minutes, optional start/end page, pages read |
| Companion engagement | `analytics_events` | Days the reader used the companion (streak freezes only) |
| Book metadata | `topics` | Genre, publication year, page count, finished date, `difficulty_override` |

Days are **local calendar days** (`YYYY-MM-DD` from the device clock).
Weeks start on Monday.

## 2. Difficulty Index `D` (1-10)

The reader's own quoted passages are the best sample of the prose they are
actually reading, so difficulty is measured from them and backed by a prior
for books with little or no quoted text.

### 2.1 Measured text difficulty

For the concatenated `[Quote]` bodies of a book:

```
FKGL = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
D_text = clamp(1 + (FKGL - 3) * 9 / 13, 1, 10)
```

FKGL is the Flesch-Kincaid grade level. Grade 3 maps to 1, grade 16 maps to
10. Syllables are counted heuristically (vowel groups after stripping silent
`e`/`es`/`ed`, minimum 1 per word); sentences are `. ! ? ;` runs plus a
trailing fragment.

### 2.2 Metadata prior

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

### 2.3 Blend and override

```
confidence c = 0                      if quoted words < 20
             = min(1, words / 150)    otherwise
D = c * D_text + (1 - c) * D_prior
```

If the reader sets a difficulty in **Edit book** (`topics.difficulty_override`,
1-10 in half steps), it replaces `D` entirely and the UI says "set by you".
Otherwise the UI says "measured from N quoted words" (c > 0) or "estimated
from genre and length" (c = 0).

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
effort. The Progress tab shows the current value and the % change over
1M / 3M / 6M / 1Y (null until the series is at least 0.5 at the start of
the range).

Reading Fitness therefore realizes the brief's **Pace x Difficulty x
Comprehension**: pace and volume enter as pages per day, difficulty as
`D / 5`, comprehension as `C`, smoothed so one heroic Sunday does not
outrank a month of evenings.

## 6. Secondary metrics (Progress tab)

| Metric | Definition |
| --- | --- |
| Volume | Pages this week vs the average of the previous 4 weeks (`+X%`); 12 weekly bars |
| Pace | Pages per hour across timed sessions ≥ 60 s with a page range, last 28 days (all-time fallback) |
| Endurance | Mean timed session length, minutes |
| Consistency | Read days per week over the last 28 days |
| Difficulty | Pages-weighted mean `D`, last 28 days |
| Comprehension | Pages-weighted mean `C`, last 28 days |
| Reading days | 16-week heatmap; level 0-4 by load quartile |

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
finished, when the trophy completes outright. Completed trophies fill the
Progress tab's trophy case; pieces in progress list beneath it.

## 9. Known limits and follow-ups

- Comprehension is a behavioural proxy. A model-scored reflection quality
  (companion feature, quota-gated) is the natural v2.
- Vocabulary richness (type-token ratio of the reader's notes) was
  considered and deferred - too noisy below ~500 words.
- Pages estimated from minutes use the reader's own median pace; before any
  paged session exists the default 0.5 pages/min is a guess.
- Keeping the screen awake during the glass requires `expo-keep-awake` and a
  native build; the timer derives from wall-clock so backgrounding is safe.
