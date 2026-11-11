# Lane A's handoff to Lane B, 2026-11-13

Kept current from 2026-11-11; final at 18:30 UTC on 2026-11-13. Last update: 2026-11-11 04:40 UTC.

Read `lanes/STATE.md` first: it is the current state. This file adds only what STATE.md does not hold.

## Why this file exists early
Lane A's weekly limit showed its warning level at about 00:30 UTC on 2026-11-11, 11 hours into its week (it resets Tue
2026-11-17 14:00 UTC). The co-founder reported it under 40% at 01:15 UTC and can reset it. If Lane A's account stops before the handback, nobody on it can write a handoff, so this file is
kept current instead. If STATE.md is newer than this file, trust STATE.md and the status files.

## What Lane A merged as acting Lane B
- #134, SUITE-CAP-3: 994ee303 (2026-11-10 23:20 UTC).
- #136, a person's ledger action never waits for the ledger lock (ADR 0092, CAS-56): 06cde5eb (2026-11-11 00:54 UTC).
- #138, MOD-16, a date or amount range glued to a word: ef3e8d20 (2026-11-11 02:35 UTC).
- #129, every worker email's lockup on a fixed White plate: ca504674 (2026-11-11 03:05 UTC).
- #137, a `lock_timeout` on every route's transaction (Queues item 24; CAS-57; amends ADR 0092): 4fe8bcca (2026-11-11 04:25 UTC).

## Handed back to Lane B (each item's status file holds its RESUME-BLOCK)
- STATE.md items 3, 8 and 9, as STATE.md shows them when you read it (items 1, 4 and 5 merged).
- `LANES.md` Queues item 25 (new on 2026-11-11): seven follow-ups from #137's reviews, in its order. Not assigned.

## Lane A keeps
- The schema chain (STATE.md items 2, 6 and 7).
- **If Lane A's account is stopped when the founder commits #126's approval line,** Lane B's orchestrator may run the
  merge step as acting Lane A, from `approval-summaries/lane-a-schema-chain-status.md`, under the same merge rule (the
  founder's committed line and green required checks). Nothing else of the chain moves without Lane A.

## Counters
Lane A's orchestrator allocates while its account runs. The next free numbers are in the last sentence of LANES.md rule
4's counters line. If Lane A's account is stopped, Lane B's orchestrator allocates and records it there.

## Check-ins to settle
- Lane B's own P2 check-in trig_01R6nXDdCD43e1PypnQ2Dtwi fires at 2026-11-13 19:15 UTC.
- Lane A's orchestrator's reminder trig_012EkWoxXjurCFJ5HhZQyvjn fires into its own session at 2026-11-13 18:00 UTC. It
  needs nothing from Lane B.

## What cost Lane A allowance, so it does not cost Lane B's
- A session's cost is its context size times its turns. Once a session's context passes about 300k tokens, it finishes
  its item and the next item starts in a fresh session.
- Review rounds were the largest single cost. A fix round gets a review of its delta, not of the whole change.
- While CI runs, a session subscribes to the PR and ends its turn. A polling loop re-reads the whole context each time.
- `tools/setup-container.sh` wants `/home/user/ops` on the branch `claude/build-ops`, not on a detached commit, and
  `claude/build-ops` is pushed from the hooked checkout (`/home/user/PhysicalTherapy`) after `pnpm install`.
