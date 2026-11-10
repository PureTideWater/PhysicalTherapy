# No web request waits on a reconcile pass (Queues item 21): status

W3, session_019i9ifE6JAC24yB5654GXcV (acting Lane B on Lane A's account), under the orchestrator
session_019i9ifDAzQNA3kLHozjBoeS. Branch `co-001/web-ledger-try-lock`, worktree `/home/user/wl`, cut from
`claude/build-platform` at 994ee303 (#134 merged). Draft PR #136. Reserved: ADR 0092, test-matrix CAS-56 (the
orchestrator, 2026-11-10 22:46 UTC: its own ADR, one dated line in ADR 0087). No migration, fixture release or synth module.

## Now
**2026-11-10 23:50 UTC: BUILT, draft #136 at a31a13d3; reviews running.** `tryLockLedger` beside `lockLedger`;
`manual.ts` `begin()` refuses with `ledger_busy`; the write-off and reopen handlers take the lock first; a new web
outcome `{ status: 'busy' }` (409, Retry-After 5, the form's "The ledger is being updated, so nothing was saved. Try
again in a moment."); CAS-56 in `reconciliation-routes.db.test.ts` (a second session holds the lock: seven actions answer
busy within a second and write nothing; red first by timeout). Fast checks green (typecheck, lint, lint:copy, lint:logs,
check:fixtures, the touched unit and db tests). Reviews: security-reviewer and payment-engine-reviewer (adversarial),
ux-brand-reviewer (the words), on a31a13d3. Subscribed to #136. Next: verify and fix findings; the full local suite
once; the base merged once before the last push; the description's review table; CI; merge on green.

## Decisions (recommended option, with reasons; ADR 0092 holds the alternatives)
- A first-class `busy` outcome, not an input error on a field: nothing the person typed is wrong, the refusal is
  retryable as sent, and a JSON client gets 409 with Retry-After. It costs a place in every reader of the outcome list
  (the download refusals among them), which keeps that list closed.
- The lock is taken in the write-off and reopen before the case line is read for update, so that read never waits on a
  pass either.
- The reconcile job keeps the blocking lock: a job may wait.
- Freeze exception: none needed (no amount, rule, stage, write or total changes; a refused action writes nothing).

## Log
- 2026-11-10 23:50 UTC: built, pushed a31a13d3, draft #136 opened, three reviews launched.
- 2026-11-10 22:50 UTC: claimed (LANES.md), counters allocated.
