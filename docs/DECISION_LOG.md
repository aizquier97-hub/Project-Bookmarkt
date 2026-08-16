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
| D-010 | 2026-08-16 | Accepted | Bookmarkt has three cumulative paid tiers: Base includes AI Summary only; Base+ includes AI Summary and AI Character Mapping; Ultimate includes all Base+ features plus AI Image Generation. When no paid subscription is active, the app displays all three tiers. A verified purchase enters the paid stream; no selection or a canceled/failed/abandoned purchase returns to manual entry. | The tier-feature matrix is fixed; Stage 4 sets prices, billing periods, offers, quotas, and billing implementation. The backend verifies identity, store purchase/active tier, requested feature, and quota before provider access. Approved output syncs only to the user's RLS rows/private Storage. Supersedes D-009. |

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

## D-010 scope clarification

- Authentication and a remaining quota are necessary but not sufficient for AI
  access; the verified active paid tier must also authorize the requested feature.
- The feature ladder is cumulative and fixed:
  - Base: AI Summary.
  - Base+: AI Summary and AI Character Mapping.
  - Ultimate: AI Summary, AI Character Mapping, and AI Image Generation.
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
- Adding another AI capability requires a material roadmap decision rather than
  silently adding it to an existing tier.

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
