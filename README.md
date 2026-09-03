# Bookmarkt

Bookmarkt modernizes the physical bookmark. A reader scans a QR code on the
bookmark to open the installed native application or, when it is not installed,
the correct Apple App Store or Google Play listing. In the app, readers capture
their reading in their own words - typed or voice summaries, notes, and manual
character maps - plus progress, book details, and images, all saved to an
account that follows them across devices.

Bookmarkt exists for individuals whose fragmented attention impedes their
ability to read for long periods or to recall and understand what they're
reading. It makes it easy to pick a book back up, stay oriented in it, and
finish it. Bookmarkt helps people read - it never reads for them.

Capture is free forever. The single paid subscription is the **AI Reading
Companion**, which works exclusively on the reader's own entries: "Previously
on..." recaps, Socratic dialogue, cue cards, character-map quizzes, semantic
search, cross-book threads, book-club prep, continuity flags, and a vocabulary
bank. The reader's latest entry is the spoiler-safe boundary, and the companion
labels the provenance of everything it says (Decision D-012).

The current PWA is a temporary prototype used to validate the product quickly.
The launch product is a subscription-based iOS and Android application, not a
public web/PWA reading application. A minimal website remains only for durable QR
routing, store redirection, privacy, support, and account-management obligations.

## Product development

Bookmarkt follows a mandatory nine-stage development process. Repository
documentation is the durable source of truth; conversations and local task lists
are supporting context.

- [Authoritative product roadmap](docs/PRODUCT_ROADMAP.md)
- [Stage-gate governance and approvals](docs/STAGE_GATES.md)
- [Material product decision log](docs/DECISION_LOG.md)
- [Gate review records](docs/gates/README.md)

## Operations

- [Stage 1 operations, AI controls, monitoring, and recovery](docs/STAGE_1_OPERATIONS.md)
- [Billing dispute support procedures](docs/SUPPORT_BILLING_DISPUTES.md)

## Current status

Stages 1-3 are complete (Stage 3 `GO` recorded September 2, 2026, D-046). The
prototype PWA has been succeeded by the native Expo app in `app/`, delivered
to the owner's Android phone as an EAS preview build with over-the-air
updates.

Stage 4 (Monetization and accounts) is active. The AI Reading Companion is
built and live for entitled accounts, presented per the owner's Interface
v2.0 brief: a **Book Club** home tab, a **Cue Cards** home tab (flip-card
decks), bookmark-ribbon entry timelines with one-line AI summaries, and a
gold bookmark that retells any chosen stretch of entries at a chosen detail -
all server-gated (entitlement + daily quotas) and grounded only in the
reader's own entries (see
[docs/STAGE_4_BUILD_PLAN.md](docs/STAGE_4_BUILD_PLAN.md)). The Book Club is a
Socratic card deck held in **session salons** (D-057, D-058): a returning
reader lands on an orientation hub - last session's takeaway card, "Continue
discussion" or "Start a new discussion", and an archive of past sessions as
question-and-answer index cards. A fresh discussion opens on a primer card (at
most three bullets), then one question card at a time - answered by
perspective-stem chips, dictation, or typing - with each companion mirror
(validate, then probe, under 50 words) dealt as the next card while answered
cards stack behind it. "End session" (offered gently after three answers,
never forced) distills the reader's answers into a takeaway card and can save
their own words to the journal.
Quiz Me and the word bank are built but hidden, on hold per the owner; the
capture structuring aid, suggested important flags, and search by meaning
remain live. Account self-service foundations are in place: change password,
JSON data export, and permanent account deletion from Settings. Remaining
Stage 4 work: native billing integration and pricing decisions.
