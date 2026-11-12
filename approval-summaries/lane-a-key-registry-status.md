# Status: Queues item 37, the key registry (Lane A)

## RESUME-BLOCK (2026-11-12, W31, session_019i9ifATnNexCuvDi2pzPWi)

- **Brief:** a design note with two bounded reviews; no migration, no PR, no build. **Done; W31 holds nothing.**
- **The note:** `designs/lane-a-key-registry.md`, v2 after its reviews and one fix round (its section 15 lists every
  finding, how it was checked and what changed). Base read: 93e137f9.
- **Reviews:** `reviews/lane-a-key-registry-review-auth.md` (1 blocking, 7 should fix, 5 notes) and
  `reviews/lane-a-key-registry-review-db.md` (1 blocking, 5 should fix, 3 notes). All taken in the fix round; the fix
  round itself was not reviewed again (one round, by the brief). The database review ran nothing: no server on its
  machine.
- **Numbers (the orchestrator's, 2026-11-12):** ADR 0095; SGN-20 to SGN-27; SEC-25 to SEC-27; JOB-06 to JOB-08. All
  used by the note; none released.
- **Founder questions (the note's section 12):** Q1 seven days in the role before taking part in a removal
  (recommended yes); Q2 at least three platform administrators named before launch (recommended); Q3 registration
  after a removal needs an administrator's word (recommended yes; the note is written for "no" and says what "yes"
  adds).
- **For the build session:** read the note alone. Not started; it starts only on the orchestrator's word, after #156
  and PR 5 by turn. Two checks the database review left to the build are at the end of section 15.
- **Holds nothing else:** no branch, no WIP ref, no PR. The checkout at `/home/user/PhysicalTherapy` is detached at
  the base and unchanged.
