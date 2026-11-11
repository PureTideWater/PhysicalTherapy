# No web mutation waits on a lock a reconcile pass holds (Queues item 24): status

W3, session_019i9ifE6JAC24yB5654GXcV (acting Lane B on Lane A's account), under the orchestrator
session_019i9ifDAzQNA3kLHozjBoeS. Branch `co-001/web-lock-timeout`, worktree `/home/user/wl`, cut from
`claude/build-platform` at 06cde5eb (#136 merged). Reserved: test-matrix CAS-57; a dated amendment to ADR 0092.

## Now
**2026-11-11 01:10 UTC: HELD (the orchestrator's stand-down, 00:59 UTC: the account's weekly limit at its warning level).**
W3 stopped here; unsubscribed from #137; no check-in pending. The claim row is held; CAS-57 stays reserved.

### RESUME-BLOCK (a fresh session builds from this; nothing else is needed)
- **Where it is:** branch `co-001/web-lock-timeout` = 59eb9e9d on origin (one commit on the base 06cde5eb), draft PR
  #137 with its description filled from the template (the review table says Pending). The item is BUILT; it is not
  reviewed. Three reviews were launched on 59eb9e9d and stopped unfinished at the stand-down: none counts. Run them
  again: two adversarial (auth and tenancy: `security-reviewer`; database: a general agent with a PostgreSQL and pool
  lens), and `ux-brand-reviewer` for the new sentence. Give each a budget of about 18 tool calls and ask for the
  report by name, or it ends at its turn limit with none.
- **What is built (all in 59eb9e9d):**
  - `packages/db/src/connect.ts`: `openPool(url, max, { lockTimeoutMs })` passes pg's `lock_timeout` (a startup
    parameter; pg 8.23.1 `lib/connection-parameters.js:122`, `lib/client.js:561`); omitted, nothing changes.
  - `apps/web/src/lib/server/web-pool.ts`: `WEB_LOCK_TIMEOUT_MS = 3_000`, `openWebPool(url, max)`.
  - `apps/web/src/lib/server/services.ts` `servicesFromConfig`: the application, billing and e-signature pools through
    `openWebPool`; the model gateway's pool (`modelPool`) stays `openPool`, on purpose, with a comment.
  - `apps/web/src/lib/http/route.ts`: the outcome is now `{ status: 'busy', what: 'ledger' | 'records' }`
    (`BusyWhat`); `BusyError(what = 'ledger')`. `http/invoke.ts` `refusal()`: `BusyError` → its `what`; pg `55P03` →
    `what: 'records'`. `http/next.ts`: `BUSY_MESSAGE` for ledger, `BUSY_RECORDS_MESSAGE` = "These records are being
    updated, so nothing was saved. What you typed is still here: try again in a minute." `http/handler.ts` (409,
    Retry-After 5) and `download-refusal-words.ts` are #136's, unchanged (the download words ignore `what`).
  - Tests: `apps/web/src/lib/server/web-pool.test.ts` (a source scan: the web's non-test code opens a pool or client
    only in `web-pool.ts` and, for the model pool, once in `services.ts`); CAS-57 at the end of
    `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` (a superuser session holds the case's row FOR UPDATE;
    `assignCaseAction` on an `openWebPool` pool answers `{ status: 'busy', what: 'records' }` after about 3 s, writes
    nothing, and goes through under the same request key once the row is free; `SHOW lock_timeout` = `3s`). CAS-56's
    expectations now carry `what: 'ledger'`.
  - Documents: ADR 0092's "Amendment, 2026-11-11" (end of the file); CAS-57 in the test matrix, `matrix.ts`,
    `registry.ts`, `fixtures/synthetic/CAS-57/expected.json`; CAS-56's row says the closed word.
- **Checked on 59eb9e9d:** typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all stable; unit
  `apps/web/src/lib/server` and `lib/http` 256 passed; db `reconciliation-routes.db.test.ts` 16 passed. **Not done:**
  a red-first run of CAS-57 (take `lockTimeoutMs` out of `openWebPool`: the pool test must fail and the route test
  wait to its 60 s timeout); the full local suite; CI's result on 59eb9e9d was not read.
- **Open questions the reviews must settle (my calls, each recorded in the amendment):**
  1. The model gateway's pool is exempt (its `model_budget:` advisory lock in
     `packages/model-gateway/src/postgres-store.ts:103` may be held behind a call in flight). Confirm no request's
     mutation runs on it, or bound it too.
  2. Requests outside `refusal()` (sign-in and session writes in `apps/web/src/lib/auth`, `http/rate-limit.ts`,
     the public routes' catch in `invoke.ts` near line 396, `routes/onboarding.ts`, `routes/support.ts`,
     `screening/*`) run on timed pools and would answer a 55P03 as a server error. I judged none meets a long holder;
     a reviewer should try to show one that does, and a sign-in or rate-limit denial of service by a held row.
  3. Web requests take advisory locks jobs also hold (`packet:` in `apps/web/src/lib/cases/workbench.ts:120` and
     `apps/worker/src/packets/records.ts:170`; `case_owner:`; `document_use:` in `contracts/tagging.ts`;
     `plan_months:` in `pricing/mapped-plan.ts`; SQL functions `pricing_current_change_lock`, `submit_screening`,
     and others under `packages/db/functions` that call `pg_advisory*`). After 3 s these now refuse where they
     waited: intended, but check for a legitimate wait of 3 to 30 s that becomes a regression.
  4. Whether any SQL function has its own `SET` clause that resets `lock_timeout`, and whether the deployment puts a
     transaction-mode pooler in front of the database (startup parameters could be dropped): grep `infra/`.
  5. The JSON shape of `busy` changed from #136's `{ status }` to `{ status, what }` one merge later: fine before
     launch; say so in the description.
  6. The sentence "These records are being updated…": the ux-brand review has not seen it.
- **Then:** verify each finding before fixing it; the full local suite once; merge the base once right before the
  last push; fill the description's review table; CI green; the up-to-date check; merge with a merge commit; record
  here and in LANES.md; tell the orchestrator.
- **Environment notes from this session:** the container restarted twice and PostgreSQL was down after each; the
  setup script brings it back (`bash /tmp/setup-container.sh co-001/web-lock-timeout:/home/user/wl`). Database tests:
  `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`, `PATH=/opt/node24/bin:$PATH`, heavy commands under
  `flock /tmp/laneb-heavy.lock`. Push `claude/build-ops` from the hooked main checkout. Plain `npx eslint` on the web
  runs out of memory: use `pnpm lint`.

**Earlier, 2026-11-11 01:40 UTC (this session's clock ran ahead of the entries above by its own estimate): BUILT and pushed.**
`openWebPool` (apps/web/src/lib/server/web-pool.ts) sets lock_timeout 3 s as
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
- 2026-11-11 01:10 UTC: held on the orchestrator's stand-down; draft #137 at 59eb9e9d; the three reviews stopped unfinished; RESUME-BLOCK written.
- 2026-11-11 01:40 UTC: built, pushed.
- 2026-11-10 23:46 UTC: allocated by the orchestrator (CAS-57; amendment to ADR 0092).
