# Gate Review Records

This directory contains durable evidence and decisions for Bookmarkt stage gates.
Every future gate must conform to Decision D-008: the launch reading product is
native iOS/Android, the QR opens the app or correct platform store, and the PWA
remains a temporary prototype until retirement.

Stage 4 and later gates must also conform to Decision D-011: Base includes AI
Summary; Base+ may run Summary, Character Mapping, or both together; Ultimate may
run any one feature, any two, or all three together. A verified purchase enters
the paid stream, while no/canceled/failed purchase returns to manual entry. The
server authorizes and reserves quota for the complete selected set before
provider calls. All outputs share a reading boundary but retain independent
result/retry state and are stored only under the user's security boundary.

## Records

- [Stage 1 exit review](STAGE_1_REVIEW.md) - observation window active
- [Gate review template](GATE_REVIEW_TEMPLATE.md)

## Process

1. Copy the template to `STAGE_N_REVIEW.md`.
2. Create and link a gate-review GitHub Issue.
3. Fill every mandatory criterion with direct evidence.
4. Record defects, accepted risks, and deferred work.
5. Record `GO`, `CONDITIONAL GO`, or `NO-GO` with the product owner.
6. Update the roadmap, governance register, and decision log.
7. Tag approved stages according to [STAGE_GATES.md](../STAGE_GATES.md).
