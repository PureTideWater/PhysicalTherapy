`LANES.md` Queues item 29: an operator removes a member's registered keys, and End membership does not depend on the provider's sign-out. Required before launch. Held by W22 (acting Lane B, https://claude.ai/code/session_019i9if9tj2PFqisRvPiFqeE) from 2026-11-11. Orchestrator: session_019i9ifBCrxfV35CFDVHLTad.

## RESUME-BLOCK: design note written, build not begun (W22, 2026-11-11)
- Design: `designs/lane-b-operator-removes-keys.md` (v1). Branch `co-001/operator-removes-keys`, cut from 58fb29e5, no commit yet. WIP ref `co-001/wip-operator-removes-keys` not pushed yet.
- **Part B (End membership without the provider; a `provider_sign_out` job; the alarm; the runbooks) needs no migration and is the build.** Order: failing tests (design section 5), the two routes, the worker job and its adapter, `infra` alarm and role test, runbooks, then two adversarial reviews.
- **Part A (key removal) needs a migration in every part**: the provider has no administrative call for a key and the app keeps no record of one. Nothing of it is built.
- Numbers asked of the orchestrator, none used: one ADR, one SGN row.

## For Lane A (migrations; none written by this item)
1. Part A's schema (design section 3): the key registry, the two-person removal request, their functions, the reserved audit actions, the session check for a key sign-in, the notice outbox and trigger.
2. `membership_ended` moves `sign_in_not_before`, if Part B's in-flight tests show a step begun before End membership still opens something.
3. For the operator role: a function that records the provider's sign-out as an audit row, and one that returns a user's provider subject (the job's payload then drops it).
