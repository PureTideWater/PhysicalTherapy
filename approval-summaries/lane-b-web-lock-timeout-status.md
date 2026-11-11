# No web mutation waits on a lock a reconcile pass holds (Queues item 24): status

W3, session_019i9ifE6JAC24yB5654GXcV (acting Lane B on Lane A's account), under the orchestrator
session_019i9ifDAzQNA3kLHozjBoeS. Branch `co-001/web-lock-timeout`, worktree `/home/user/wl`, cut from
`claude/build-platform` at 06cde5eb (#136 merged). Reserved: test-matrix CAS-57; a dated amendment to ADR 0092.

## Now
**2026-11-11 01:40 UTC: BUILT and pushed.** `openWebPool` (apps/web/src/lib/server/web-pool.ts) sets lock_timeout 3 s as
a connection parameter on the web's application, billing and e-signature pools (openPool's new `lockTimeoutMs`); 55P03
from a route is `{ status: 'busy', what: 'records' }` (the try-lock's is `what: 'ledger'`); the form's sentence for it
is "These records are being updated, so nothing was saved. What you typed is still here: try again in a minute."; CAS-57
(a source guard in web-pool.test.ts; a second session holding a case's row in reconciliation-routes.db.test.ts). Fast
checks green. Next: draft PR, subscribe, two adversarial reviews (database, auth) and the ux-brand review of the new
sentence, fixes, the full local suite once, the base merged before the last push, CI, merge on green.

## Decisions (recommended option, with reasons; ADR 0092's amendment holds the alternatives)
- A connection parameter on the web's pools, not SET LOCAL in handlers (a handler can forget), not withPracticeScope
  (shared with the worker and the gateway), not a role setting (a migration; would bound the login everywhere).
- Three seconds: person-to-person waits are milliseconds, a triage job's a second or two.
- The model gateway's pool is excepted by name: its waits are its own design and no request's mutation runs on it.
- A closed word on the outcome (`ledger` or `records`) so the sentence is true to what was held.

## Log
- 2026-11-11 01:40 UTC: built, pushed.
- 2026-11-10 23:46 UTC: allocated by the orchestrator (CAS-57; amendment to ADR 0092).
