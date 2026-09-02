# Competitor and reference apps

This is the documented set of shipped apps Bookmarkt references when making
UX decisions (owner request, 2026-09-02; recorded in D-042). When a design
question comes up, these are the apps we check first - the goal is that a
reader of any of them finds Bookmarkt immediately familiar, while the
things that make Bookmarkt different stay deliberate, not accidental.

## The reference set

| App | What it is | What we reference it for | Where it shows in Bookmarkt |
| --- | --- | --- | --- |
| **Goodreads** | The category giant: social cataloging, reviews, shelves (Amazon). | The canonical add-book flow (search-first, one-tap add, barcode scan adjacent); shelf/status conventions; the scale-tested baseline for any library feature. | Search-first add-book (D-042); scan-to-add (D-028); reading-status pill placement on the book screen (D-023). |
| **The StoryGraph** | The leading independent alternative: clean tracking, stats, moods. | Clean warm-neutral UI that lets cover art carry the color; cover-first library grid; a modern indie look that still reads professional. | Clean interface direction and palette (D-040); 3-across sectioned cover grid; stats chips. |
| **Fable** | Design-forward book clubs and social reading. | Warm, contemporary aesthetic; bottom-tab structure; how a small team ships a polished feel. | Bottom-tab navigation and overall warmth (D-040). |
| **Bookmory** | Focused personal reading tracker (no social). | Closest to Bookmarkt's private, tracker-first scope; Google Books-powered add flow; minimal forms. | Google Books as metadata source (D-042); minimal book details (D-032). |
| **Bookly** | Reading-session tracker with timers and stats. | Frictionless capture philosophy; scan-to-add; warm onboarding tone that never guilts the reader. | Frictionless entry (D-028, D-031); first-run welcome tone (D-036); zero-guilt language. |
| **Kindle / Apple Books** | The platform reading apps. | Platform conventions readers already have in their hands: typography, offline grace, nav-bar Edit, system-standard gestures. | Offline-aware error states (D-040); nav-bar Edit (D-026); serif typography on literary surfaces. |

## What we deliberately do not copy

- **Social feeds, follower graphs, and public reviews** (Goodreads, Fable):
  Bookmarkt is a private reading companion; entries are the reader's own
  words, for the reader.
- **Star-rating marketplaces and ads**: no ratings economy, no ad surface.
- **AI-written summaries of books**: the reader authors every saved word
  (D-012); the paid companion asks questions and arranges - it never writes
  the record (D-039).

## The differentiators these apps do not have

- Reader-authored records with spoiler-safe recaps ("Where you left off").
- The physical QR bookmark as the bridge from paper book to app.
- The scholarly capybara mascot companion with a dynamic personality
  (D-038/D-039) - professionally built after closed-beta validation.
