# Bookmarkt Decision Log

This log records accepted material product and governance decisions. Detailed
implementation choices may use separate Architecture Decision Records later.

| ID | Date | Status | Decision | Consequence |
| --- | --- | --- | --- | --- |
| D-001 | 2026-08-16 | Accepted | Bookmarkt uses a nine-stage process: Stabilization, Architecture, UI/UX, Monetization, Native Packaging, Compliance, Beta, Launch, and Operations/Growth. | Work and approval follow the stage order defined in the roadmap. |
| D-002 | 2026-08-16 | Accepted | Repository roadmap, governance, gate records, and decision history are the durable source of truth. | Conversation and local task history remain supporting context only. |
| D-003 | 2026-08-16 | Superseded | Stage 2 creates an app-quality shared web/PWA core; it does not abandon the PWA. Native iOS/Android packaging occurs in Stage 5. | Superseded by D-008 because the final product is native-app-only. |
| D-004 | 2026-08-16 | Accepted | Supabase Pro is not required to enter Stages 2-6. Daily backups and leaked-password protection are mandatory before Stage 7 external beta. | Stage 1 can close on stability evidence; external users cannot be invited until the paid controls are active. Upgrade earlier if data value or Free limits justify it. |
| D-005 | 2026-08-16 | Accepted | AI and spoiler reports require human review before corrective action. Raw reports do not automatically modify user content or retrain a model. | Stage 2 adds report lifecycle foundations, Stage 6 adds secure administration and operations, and Stage 7 requires active monitoring. |
| D-006 | 2026-08-16 | Accepted | The Stage 1 stability window runs for seven consecutive 24-hour periods after all production-phone checks passed at 10:55 MDT (16:55 UTC). | Earliest Stage 1 exit review is August 23, 2026 at 10:55 MDT (16:55 UTC), assuming no P0/P1 defect. |
| D-007 | 2026-08-16 | Superseded | Printed QR codes must use a Bookmarkt-controlled durable HTTPS destination with native deep-link behavior and web fallback. | Superseded by D-008. The durable destination remains, but its fallback routes mobile users to the correct app store rather than the reading PWA. |
| D-008 | 2026-08-16 | Accepted | Bookmarkt v1 is a native iOS/Android product. A physical QR opens the installed app or routes an uninstalled mobile user to the Apple App Store/Google Play. The current PWA is a temporary prototype and is retired as a public reading product at Stage 8. | Stage 2 builds the native app core; Stage 5 completes app/store routing and native integration; Stage 8 launches the apps and retires the PWA. Minimal web infrastructure remains only for smart links, installation guidance, privacy, support, and account obligations. Supersedes D-003 and D-007. |
| D-009 | 2026-08-16 | Superseded | Bookmarkt v1 limits AI to three paid capabilities: AI text summary, AI character mapping, and AI image generation. The backend must verify the authenticated user's active paid tier, requested feature entitlement, and quota before any provider call. | Superseded by D-010, which preserves these controls and fixes the exact cumulative tier assignments. |
| D-010 | 2026-08-16 | Superseded | Bookmarkt has three cumulative paid tiers: Base includes AI Summary only; Base+ includes AI Summary and AI Character Mapping; Ultimate includes all Base+ features plus AI Image Generation. When no paid subscription is active, the app displays all three tiers. A verified purchase enters the paid stream; no selection or a canceled/failed/abandoned purchase returns to manual entry. | Superseded by D-011, which preserves the fixed tier ladder and defines simultaneous multi-feature generation. |
| D-011 | 2026-08-16 | Superseded | Paid tiers authorize feature sets in one generation session, not an either/or workflow. Base generates AI Summary. Base+ may generate Summary, Character Mapping, or both together. Ultimate may generate any one, any two, or all three entitled features together. The user controls amount/detail per selected feature within tier limits. | Superseded by D-012, which removes AI-generated content from the product entirely and replaces the tier ladder with a single AI Reading Companion subscription. The server-authoritative entitlement rigor defined here carries forward. Supersedes D-010. |
| D-013 | 2026-08-21 | Accepted | Stage 1 exits early with a GO after five consecutive clean days (2026-08-16 to 2026-08-21) of daily product-owner use, waiving the final two days of the seven-day stability window defined in D-006. The observed window included the 2026-08-17 D-012 capture-first production deploy with zero defects. | Stage 1 is closed and Stage 2 (Architecture rebuild) opens 2026-08-21. Accepted risk: defects that would have surfaced on days 6-7 are undetected at exit; any post-exit P0/P1 is fixed with Stage 1 priority. Amends D-006 for this window only; the seven-day standard remains the default for future stability windows. |
| D-012 | 2026-08-17 | Accepted | Bookmarkt pivots from AI-generated content to reader-authored capture plus one paid AI Reading Companion. All reading records - summaries, notes, and character maps - are authored manually by the reader, typed or by voice. AI Summary, AI Character Mapping, and AI Image Generation are removed from the product; the image-generation backend stays dormant behind a server-side disabled flag. The Base/Base+/Ultimate ladder collapses to a single subscription: a companion that operates exclusively on the reader's own entries - Socratic dialogue, cue cards, "Previously on..." recaps, character-map quizzes, semantic search, cross-book threads, book-club prep, continuity flags, and a vocabulary bank. The reader's latest entry marks the content boundary. | The mission becomes recall/comprehension support for readers with fragmented attention, measured in books finished. The companion never writes the record and never presents model memory as unlabeled fact, structurally preventing the hallucination and spoiler failures observed in prototype AI generation. Free capture is never paywalled. Roadmap v2.0 redefines the Stage 2-8 work plans. Supersedes D-011. |

## D-008 scope clarification

- Stage 1 PWA evidence remains valid as historical prototype and backend-behavior
  evidence.
- The PWA may remain available during Stages 2-7 as a frozen internal/reference
  implementation and may receive critical stabilization fixes.
- New product capabilities target the native application rather than expanding
  the PWA into a permanent channel.
- The Bookmarkt-controlled HTTPS destination remains permanent because iOS
  Universal Links, Android App Links, platform store routing, and printed QR
  durability require it.
- Unsupported or desktop scans may show installation information, but no web
  reading application ships at v1.

## D-011 scope clarification

*Historical - superseded by D-012 on 2026-08-17. Retained because it defined the
server-authoritative entitlement rigor that D-012 carries forward to the
companion subscription.*

- Authentication and remaining quotas are necessary but not sufficient for AI
  access; the verified active paid tier must authorize the entire requested
  feature set.
- The feature ladder is cumulative and fixed:
  - Base: AI Summary.
  - Base+: AI Summary and AI Character Mapping.
  - Ultimate: AI Summary, AI Character Mapping, and AI Image Generation.
- Feature selection is set-based:
  - Base has one valid set: Summary.
  - Base+ has three valid non-empty sets: Summary; Character Mapping; both.
  - Ultimate has seven valid non-empty sets: each feature individually, each
    two-feature combination, and all three.
- "Together" means one user action and one generation session. Selected provider
  work runs concurrently where technically safe. Internal sequencing is permitted
  for a genuine dependency but must not require separate user workflows.
- Every selected feature uses the same immutable reading boundary and has its own
  amount/detail configuration, execution status, output, and approval state.
- Pricing, billing periods, optional introductory offers/trials, and per-feature
  quotas remain Stage 4 implementation decisions.
- Entitlement denial occurs before quota consumption and before an external AI
  provider is contacted.
- Store selection alone does not grant access. Purchase verification and
  server-authoritative entitlement activation are required.
- Declining, canceling, abandoning, or failing a purchase returns the reader to
  manual entry without deleting unsaved manual work.
- A client-side hidden button or paywall is user experience only, not the
  authorization boundary.
- Manual notes, manual character-map maintenance, and personal image uploads
  remain outside the paid-AI catalog unless a later material decision changes
  them.
- AI output is reviewable before save. Text and character artifacts use
  user-owned RLS rows; generated images use private user-scoped Storage.
- Entitlement and quota preflight covers the full selected feature set and is
  all-or-none before provider calls. After execution begins, successful outputs
  survive a sibling failure and only failed work may be retried idempotently.
- Adding another AI capability requires a material roadmap decision rather than
  silently adding it to an existing tier.

## D-012 scope clarification

Problem statement and mission:

- The problem is fragmented attention impairing book reading in three ways:
  P1 stamina (sustaining sessions), P2 recall (losing the thread between
  sessions, leading to abandonment), and P3 comprehension (tracking characters,
  plot, and causality).
- The mission: for individuals whose fragmented attention impedes their ability
  to read for long periods or to recall and understand what they're reading,
  Bookmarkt makes it easy to pick a book back up, stay oriented in it, and
  finish it. The success metric is books finished.
- The product addresses P2 directly, P3 through active production, and P1 only
  indirectly. This gap is recorded honestly in the roadmap; direct session
  mechanics remain an additive post-launch candidate.

Authoring and capture:

- The reader authors everything. Summaries, notes, and character maps are
  written by the reader - typed or by voice. No product surface writes the
  reading record.
- One-sentence entries are always acceptable and never judged or graded.
- Voice capture preserves the raw transcript; cleanup touches punctuation and
  casing, never meaning. The reader reviews and confirms the transcript.
- The reader's latest entry marks the upper content boundary for every
  companion feature.
- Free capture - entries, character maps, progress/boundary tracking, metadata,
  and personal images - is never paywalled.

The AI Reading Companion (single paid subscription):

- The companion operates exclusively on the requesting reader's own entries. It
  never recalls the book from model memory as unlabeled fact and asks more than
  it answers.
- Provenance ladder: answers ground in the reader's notes first; model
  knowledge appears only on explicit request and is labeled as such; on weak
  recognition the companion declines rather than guesses. It never grades a
  reader's answer using unverifiable knowledge.
- Socratic dialogue is ungraded by default. When a reader's answer conflicts
  with their own notes, the companion mirrors the notes back. Wrong answers are
  explored with follow-up questions rather than corrected outright; right
  answers are occasionally probed.
- Features: Socratic dialogue, cue cards with deterministic spaced repetition,
  "Previously on..." recaps, character-map quizzes (the reader's map is the
  answer key), semantic search, cross-book threads, boundary-bounded book-club
  prep, continuity flags between the reader's entries, and a vocabulary bank.
- The trial is server-authorized and begins only after a few entries exist.
- The backend validates identity, active companion entitlement, and usage quota
  before any provider call; denied requests consume nothing.

Removed and rejected scope:

- AI Summary, AI Character Mapping, and AI Image Generation are removed. The
  image-generation backend remains dormant behind a server-side disabled flag;
  re-enabling it requires a new material decision. The `book-images` Storage
  bucket is unchanged.
- Read-next recommendations: rejected as commodity.
- AI-generated character bios or world guides: rejected - this is the prototype
  failure mode that motivated the pivot.
- Note-quality coaching or grading: rejected - grading capture kills the habit.

Minors and compliance:

- "Individuals" brings minors into scope. Launch posture: 13+ with an age gate.
  Under-13 access requires COPPA/GDPR-K parental-consent work and a separate
  material decision before any expansion. App-store age ratings follow the 13+
  posture. This posture is revisitable.

Stage 1 disposition:

- Stage 1 observation continues unchanged against the retained scope:
  authentication, storage isolation, sync, manual entry, images, and backend
  cost controls.
- Prototype AI-generation evidence is retired as launch-feature evidence but
  remains valid for the backend controls it exercised. The deployed prototype
  AI endpoints keep their Stage 1 safeguards until removed by a code change.

## Decision status

- **Proposed:** Under review and not authoritative.
- **Accepted:** Active and reflected in the roadmap.
- **Superseded:** Replaced by a later decision that cites the original ID.
- **Rejected:** Considered but not adopted.

## Entry template

Add material decisions as a new row and include supporting detail below when the
tradeoff is not self-evident.

```text
ID:
Date:
Status:
Context:
Decision:
Alternatives considered:
Affected stages:
Consequences and risks:
Approver:
Supersedes:
```
