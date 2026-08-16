# Bookmarkt Decision Log

This log records accepted material product and governance decisions. Detailed
implementation choices may use separate Architecture Decision Records later.

| ID | Date | Status | Decision | Consequence |
| --- | --- | --- | --- | --- |
| D-001 | 2026-08-16 | Accepted | Bookmarkt uses a nine-stage process: Stabilization, Architecture, UI/UX, Monetization, Native Packaging, Compliance, Beta, Launch, and Operations/Growth. | Work and approval follow the stage order defined in the roadmap. |
| D-002 | 2026-08-16 | Accepted | Repository roadmap, governance, gate records, and decision history are the durable source of truth. | Conversation and local task history remain supporting context only. |
| D-003 | 2026-08-16 | Accepted | Stage 2 creates an app-quality shared web/PWA core; it does not abandon the PWA. Native iOS/Android packaging occurs in Stage 5. | QR users retain a no-install web path while native applications reuse the shared core. |
| D-004 | 2026-08-16 | Accepted | Supabase Pro is not required to enter Stages 2-6. Daily backups and leaked-password protection are mandatory before Stage 7 external beta. | Stage 1 can close on stability evidence; external users cannot be invited until the paid controls are active. Upgrade earlier if data value or Free limits justify it. |
| D-005 | 2026-08-16 | Accepted | AI and spoiler reports require human review before corrective action. Raw reports do not automatically modify user content or retrain a model. | Stage 2 adds report lifecycle foundations, Stage 6 adds secure administration and operations, and Stage 7 requires active monitoring. |
| D-006 | 2026-08-16 | Accepted | The Stage 1 stability window runs for seven consecutive 24-hour periods after all production-phone checks passed at 10:55 MDT (16:55 UTC). | Earliest Stage 1 exit review is August 23, 2026 at 10:55 MDT (16:55 UTC), assuming no P0/P1 defect. |
| D-007 | 2026-08-16 | Accepted | Printed QR codes must use a Bookmarkt-controlled durable HTTPS destination with native deep-link behavior and web fallback. | Hosting or app changes must not invalidate physical bookmarks already distributed. |

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
