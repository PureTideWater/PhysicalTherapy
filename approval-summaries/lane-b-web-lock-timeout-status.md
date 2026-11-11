# No web mutation waits on a lock a reconcile pass holds (Queues item 24): status

W4, session_019i9ifAM5Y3ftqx7i6Cx8Gk (acting Lane B on Lane A's account), from 2026-11-11 01:20 UTC, under the
orchestrator session_019i9ifDAzQNA3kLHozjBoeS; built by W3, session_019i9ifE6JAC24yB5654GXcV. Branch
`co-001/web-lock-timeout`, worktree `/home/user/weblock`, cut from `claude/build-platform` at 06cde5eb (#136 merged).
Reserved: test-matrix CAS-57; a dated amendment to ADR 0092.

## Now
**2026-11-11 01:50 UTC: FIX ROUND 1 (W4).** The three reviews of 59eb9e9d are in and recorded under "Reviews" below:
no blocker, eleven findings confirmed and two refuted. The words half of the fix round is committed and pushed as the
WIP ref `co-001/wip-web-lock-timeout` = 709fe620 (one commit on 59eb9e9d). The server half is being built. The
container restarted once at 01:46 UTC; nothing was lost. The machine was ready at start (the environment's setup
script: its log ended OK, and `/tmp/setup-container.sh` equals `tools/setup-container.sh` at 52ea8bcf).

### RESUME-BLOCK (a fresh session builds from this; nothing else is needed)
- **Where it is:** branch `co-001/web-lock-timeout` = 59eb9e9d on origin (one commit on the base 06cde5eb), draft PR
  #137 with its description filled from the template (the review table says Pending). Review round 1 is DONE (three
  reviews of 59eb9e9d, "Reviews" below: do not run them again). The fix round is in hand: start from the WIP ref
  `co-001/wip-web-lock-timeout` (`git fetch origin co-001/wip-web-lock-timeout && git merge --ff-only FETCH_HEAD` in
  the worktree), build what "Reviews" marks TO DO, then run a review of the fix round's delta only
  (`git diff 59eb9e9d..HEAD`): two adversarial (auth and tenancy; database) and one ux-brand, each with a budget of
  about 18 tool calls and its report asked for by name.
- **CI on 59eb9e9d:** `unit` failed, everything else passed (`mutation`, `screening-capacity gate`, `capacity`,
  `approval-of-record`, db 1 to 4, e2e 1 and 2, static, lint, build, images). The failure is this change's:
  `tools/screening-capacity/watched.test.ts` (twice), because the committed watched list lacks
  `apps/web/src/lib/server/web-pool.ts`. Fix: `pnpm exec tsx tools/screening-capacity/watched.ts --write`.
- **A gap found on the takeover:** no test ties the form's sentence to the outcome's word (`BUSY_MESSAGE` and
  `BUSY_RECORDS_MESSAGE` appear in no test). Add one in `apps/web/src/lib/http/next.test.ts` in the fix round.
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
  setup script brings it back (`bash /tmp/setup-container.sh co-001/web-lock-timeout:/home/user/weblock`). Database tests:
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

## Reviews

### Round 1, on 59eb9e9d (2026-11-11 01:26 to 01:44 UTC; every finding checked against the code by W4)
No blocker. DONE = fixed in the WIP ref 709fe620; TO DO = confirmed, fix not yet committed.

**Security (auth and tenancy), `security-reviewer`:**
- S1, should fix, CONFIRMED, TO DO: three paths answer a lock timeout as a server error, and pg's error object reaches
  Next's own log: the session's read (`invoke.ts` `signedIn`, before the try), the rate limit's count (`guard`), and a
  public route's catch. Fix: one mapping of 55P03 to `busy` around every route's `invoke`.
- S2, should fix, CONFIRMED, TO DO: pg-boss's own pool (`uploads/queue.ts:38`) has no timeout, its sends run inside
  the request's transaction, and the guard's scan cannot see `new PgBoss(`. Fix: `lock_timeout` on the queue's pool
  as pg's own parameter (never through `options`: production URLs carry `options=-c role=...`,
  `infra/lib/launch.ts:54`, and pg lets a URL's query replace the pool's settings); the scan widened.
- S3, note, REFUTED: `busy` in place of `not_found` for another practice's case id. Both routes refuse a case the
  practice does not hold before any lock (`routes/workbench.ts:110` `caseExists`; `routes/packets.ts:222`
  `versionOfCase`).
- S4, note, CONFIRMED as the existing design, TO DO (words only): a job a handler queued outlives a rolled-back
  request ("Queued in the request: a failure to queue undoes ...": the send is each handler's last step). The ADR
  and the description must not say "nothing was written" without it. A follow-up for the orchestrator: make the
  sends transactional.
- S5, note, CONFIRMED, TO DO (words only): the model pool's stated reason is wrong (the budget lock is held for
  `hold()`'s short transaction, `postgres-store.ts:100`). The exemption stays for a true reason: a call's record,
  written after the model has answered, must wait and never be lost.

**Database, a general agent with a PostgreSQL and pool lens (it ran its own experiments in a throwaway database):**
- The mechanism holds: pg sends `lock_timeout` as a startup parameter on every connection; `RESET ALL` and
  `DISCARD ALL` keep it; nothing in the repository resets it; no pooler or RDS Proxy is in `infra`.
- D1, should fix, CONFIRMED, TO DO: a page that meets the timeout is shown "not found" (`loadPage` falls to
  `notFound()`), and "pages are unaffected" is false (a read behind a migration's pending ACCESS EXCLUSIVE; a page's
  audit event). Fix: a page's `busy` goes to the error state with "Try again", never a 404. Follow-up for the
  orchestrator: `packages/db/src/migrate.ts` sets no `lock_timeout`, so a migration queued behind a long job blocks
  every reader of that table (existing, not this change's).
- D2 = S2.
- D3, should fix, CONFIRMED, TO DO: the same request key sent while its first request is still running waits on the
  first's uncommitted key row and is now told "nothing was saved". Fix: a third closed word, `request`: "This form
  was already sent and is still being processed, so nothing new was saved."
- D4, should fix, CONFIRMED, TO DO: a public route answers the timeout as a server error, and `submit_screening`
  waits on another upload of the same practice or contact by design. Fix: S1's mapping covers public routes.
- D5 = S5. D6 = S4.
- D7, note, CONFIRMED, TO DO: `?lock_timeout=` in a database URL silently replaces the pool's. Fix: `openPool`
  refuses such a URL when it is given a timeout (the error never prints the URL).
- D8, note, CONFIRMED, TO DO: wording overstates (the bound is per lock wait, not per statement or request; the
  wait may be an advisory lock or a key, not "a row").
- D9, note, CONFIRMED, TO DO: tests. Hold the case's row FOR NO KEY UPDATE (what a pass's update takes); release the
  holder from a timer; a unit assertion that the option reaches pg; the scan also reads `apps/web/scripts`.
- D10, note, REFUTED: the savepoint in `routes/settings.ts:1021` absorbs 23505, 42501 and 23514 only.

**UX and brand, `ux-brand-reviewer`:**
- U1, should fix, CONFIRMED, DONE (the noun changes once more in the server half: "this form", since a public
  form and a sign-in step can now show it): "These records" pointed at the wrong record. Now "The records this form
  needs are being updated".
- U2, should fix, CONFIRMED, DONE: "in a minute" promised less than a pass takes. Now "in a few minutes", on forms
  and downloads. TO DO: `Retry-After` 60 for `records` and `request` (5 stays for the try-lock).
- U3, should fix, CONFIRMED, DONE: "What you typed is still here" was false where a refusal empties passwords and
  codes, and on a post without JavaScript. The server's words claim nothing about the form; the form's own lead
  says what stays (`busy-words.ts`, `RefusalLead`), with a browser test on four forms.
- U4, should fix, CONFIRMED, DONE: the upload client told a busy refusal to "Reload the page", which drops the
  files on screen; and it read this server's own receiver's busy 409 as "bytes already stored".
- U5, note, CONFIRMED, DONE: the download's comment and sentence.
- U6 and U7, notes: two sentences kept, the colon kept (the house pattern).

**Decisions of the fix round (the optimized option, with the reason):**
- One mapping around every route, not one per path: no path can forget it.
- A page's `busy` shows the error state, not a page of its own: it is rare (a relation lock, the session's row),
  and "Try again" is the true next step.
- The queue's pool is bounded like the request pools; the model gateway's stays exempt (a call's record must wait).
- The same key in flight waits the three seconds (a first request that finishes inside them still answers
  "Already sent"), then says the earlier send is still being processed: truer than "nothing was saved".

## Log
- 2026-11-11 01:50 UTC: review round 1 recorded; the words half of the fix round pushed as WIP 709fe620; the container restarted once (01:46 UTC), nothing lost.
- 2026-11-11 01:28 UTC: W4 took the claim over; the machine was ready at start; CI on 59eb9e9d read (`unit` red: the watched list); the three reviews launched again (01:26 UTC).
- 2026-11-11 01:10 UTC: held on the orchestrator's stand-down; draft #137 at 59eb9e9d; the three reviews stopped unfinished; RESUME-BLOCK written.
- 2026-11-11 01:40 UTC: built, pushed.
- 2026-11-10 23:46 UTC: allocated by the orchestrator (CAS-57; amendment to ADR 0092).
