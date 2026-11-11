# No web mutation waits on a lock a reconcile pass holds (Queues item 24): status

W4, session_019i9ifAM5Y3ftqx7i6Cx8Gk (acting Lane B on Lane A's account), from 2026-11-11 01:20 UTC, under the
orchestrator session_019i9ifDAzQNA3kLHozjBoeS; built by W3, session_019i9ifE6JAC24yB5654GXcV. Branch
`co-001/web-lock-timeout`, worktree `/home/user/weblock`, cut from `claude/build-platform` at 06cde5eb (#136 merged).
Reserved: test-matrix CAS-57; a dated amendment to ADR 0092.

## Now
**2026-11-11 04:10 UTC: PUSHED, CI RUNNING (W4).** `co-001/web-lock-timeout` = 39f27397 on origin (pushed 04:09 UTC),
with the base ca504674 merged; draft #137's title and description are rewritten for the mechanism as it now is; W4
is subscribed to it. All four review rounds are done and recorded below. The full local suite ran once on 22eb6c18
(03:14 to 04:04 UTC): unit 13,165 passed and 4 skipped; db 10,012 passed and 1 skipped in four shards; golden;
oracle; build and e2e, 84 passed. The last commit's files were run again on 39f27397. The mutation shards were not
run locally (16 selected only through an import of `scope.ts`; the required `mutation` check runs them).

### RESUME-BLOCK (a fresh session builds from this; nothing else is needed)
- **Where it is:** branch `co-001/web-lock-timeout` = 59eb9e9d on origin (one commit on the base 06cde5eb), draft PR
  #137 with its description filled from the template (the review table says Pending). Review round 1 is DONE (three
  reviews of 59eb9e9d, "Reviews" below) and so are rounds 2, 3 and 4: run no review again. The branch
  `co-001/web-lock-timeout` = 39f27397 on origin holds everything, with the base ca504674 merged. What it is: the
  routes' wrapper opens every signed-in request's transaction with a bound on its lock waits (`invoke.ts`,
  `BOUNDED`), which the scope sets right after BEGIN (`packages/db/src/authz/scope.ts`, `LockWaitBound`); the queue
  producer's pool carries the same timeout; nothing else is bounded. **Left to do:** (1) read CI on 39f27397 (the
  required checks: `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`); a red check is
  reproduced and fixed, never skipped; (2) if `claude/build-platform` moved past ca504674, merge it once more, run
  the fast checks and generators, push, wait for CI again (the up-to-date rule); (3) mark the PR ready and merge it
  with a merge commit; (4) record the merge here and in LANES.md's claim row, unsubscribe, and tell the
  orchestrator in one line: the merge, that the machine was ready at start, and that the next item (STATE.md item 8)
  starts in a fresh session (this one is past its context budget).
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
No blocker. Every confirmed finding is fixed in the WIP ref f3dc3ee6 ("TO DO" below was the state at 01:50 UTC; all are DONE).

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

### Round 2, the delta `59eb9e9d..f3dc3ee6` (2026-11-11 02:08 to 02:25 UTC; every finding checked by W4)
No blocker.

**Security delta, `security-reviewer`:**
- R2-S1, should fix, CONFIRMED: "nothing was saved" is false where a path committed before its timeout:
  `resolveSession` ends a session in one statement and writes its `session_ended` audit event in a second
  transaction (`auth/sessions.ts:145`), so a timeout on the second loses the event for good; a sign-in step releases
  the provider's grant before `openSession` (`auth/sign-in.ts:304`).
- R2-S2, should fix, CONFIRMED: a timeout inside `sign_in_failed` (FOR UPDATE on the user's row) skips the failure
  count and answers `busy` where an unknown address answers `credentials`.
- R2-S3, note, CONFIRMED: the URL guard's `options` check is case-sensitive (harmless: the startup parameter wins).
- R2-S4, note, ANSWERED: a form keeps its request key after a busy refusal (the browser test sends the same key twice).
- R2-S5, note: the local receiver may have stored the bytes before a timeout (development and e2e only; the retry
  recovers).
- R2-S6, note, REFUTED: the screening's send after its commit is caught ("the minute's sweep sends its job",
  `screening/routes.ts:746`).
- R2-S7, note: no test covered busy on sign-in.
- **What W4 did with S1, S2 and S7:** not patched one by one. They are what a pool-wide bound does to every flow
  that commits in steps, and more such flows were not read (password reset, enrolment, the health check). The
  timeout is set on the routes' own transaction instead, so those flows are untouched.

**Database delta, a general agent (it ran both test files and its own experiments):**
- R2-D1, should fix, CONFIRMED, DONE in 74d6db9a: `claimRequestKey` called every timeout at its insert "the same key
  in flight" (the person's row behind the foreign key and a table lock give the same 55P03). Now the same key waits
  on an advisory lock of the key's own, in a statement of its own; the insert's timeout is `records`. Both logged.
- R2-D2, note, CONFIRMED, DONE: a URL's `options` cannot replace the startup parameter (measured), and the check
  refused `deadlock_timeout`. Only a URL that names `lock_timeout` is refused now.
- R2-D3, note, DONE: the queue's URL is checked as the queue is made, not at the first send.
- R2-D4, note, DONE: a comment named a test file that did not exist.
- R2-D5, note, DONE: the holder's fail-safe takes the timeouts it must outlast.
- R2-D6, note: the session's end and its audit event; met by the narrowed mechanism (the session's read is unbounded).
- R2-D7, note, DONE: a re-rendered form sends a new key. The form pins its key on `busy: 'request'`; the server's
  words (a post without JavaScript) say to reload the page, not to send again.
- R2-D8, note, in the ADR: pg-boss's own heartbeat now fails after three seconds where it waited.
- Found sound by experiment: pg-boss hands `lock_timeout` to every connection it opens, a refused send keeps
  `code: '55P03'`, the connection is discarded and the next send works.

**UX and brand delta, `ux-brand-reviewer`:**
- R2-U1, should fix, CONFIRMED: on a form whose only field is a password or a code, "What you typed is still here,
  except passwords and codes" keeps nothing. Fix: count only fields a refusal keeps; "Passwords and codes are not
  kept: type them again, then try again in a few minutes."
- R2-U2, should fix, CONFIRMED: the `request` lead sat under "Not done", though the first send may yet save. Fix:
  titled "Not confirmed".
- R2-U3, should fix, CONFIRMED: the `request` lead invited edits a retry would silently drop. Fix: "Send it again in
  a few minutes, changing nothing, to see whether it saved: nothing is saved twice."; the server's words (a post
  without JavaScript) say to reload the page.
- R2-U4, should fix, CONFIRMED (development and e2e only): the upload client ignored the closed word.
- R2-U5, note: "The records this form needs" read badly on a sign-in step and the public screening upload. With
  the narrowed mechanism neither can show it.
- R2-U6, note, DECLINED: "in a minute" for the ledger word only. Round 1 asked for one wait on every surface, and a
  pass takes minutes.
- R2-U7, note, follow-up for the UX queue: a page's busy state is the generic error state.
- R2-U8 and R2-U9, notes: the button's name in the lead; "typed" for a choice. Kept as the house pattern.

### Round 3, the narrowed mechanism at 74d6db9a (2026-11-11 02:45 to 03:08 UTC; every finding checked by W4)
No blocker. All confirmed findings are fixed in f7853552.

**Security, `security-reviewer`:**
- R3-S1, note, CONFIRMED, DONE: the request key's advisory lock shared its key space with the ledger's and every
  other lock, and a key is text its sender chooses. Now the two-number form with a class of the request keys' own.
- R3-S2, note, CONFIRMED, DONE (with R3-D1): "the first statement" was the callback's, not the transaction's.
- R3-S3, should fix, CONFIRMED, DONE: the guard's pattern could miss a connection taken from a pool. It now counts,
  by file, every place the web's code reaches the application pool, and holds that each transaction the wrapper
  opens carries the bound.
- R3-S4, note: a send commits by itself (known; in the ADR; a follow-up).
- Found sound: the paths outside the wrapper are byte for byte the base's; `busy` cannot replace `unauthenticated`,
  `forbidden` or `not_found`; a resend runs once or not at all.

**Database, a general agent (ten experiments; the CAS-57 block ran 5 of 5):**
- R3-D1, should fix, CONFIRMED, DONE: a practice route's scope read six tables (its permission read) before the
  bound was set. The scopes now take the bound as an option (`LockWaitBound`), set right after BEGIN; only the
  web's wrapper passes it. A new case locks a table of that read.
- R3-D2, note, DONE: another spelling of a key (upper case) took another lock. The key is locked as a uuid's text.
- R3-D3, note, DONE: false or overstated sentences (a test file that does not exist, "only when", the heartbeat).
- R3-D4, note, DONE: a first request that ends inside the timeout now has its test (COMMIT: already sent;
  ROLLBACK: done).
- R3-D5, note, a follow-up in `packages/db`: the scope does not read COMMIT's answer (no reach found today).
- Found sound by experiment: the bound covers definer functions, triggers, deferred constraints at COMMIT,
  savepoints and REPEATABLE READ; a pooled connection never keeps it; lock then insert never runs a mutation twice.

**UX and brand, `ux-brand-reviewer`:**
- R3-U1, should fix, CONFIRMED, DONE: the resend's lead said it only checks; it now says what it does either way
  ("If the first send saved, PaidWhole says so; if not, this one saves it. Nothing is saved twice.").
- R3-U2, should fix, CONFIRMED, DONE: "type them again" is untrue of a one-time code ("type your password again
  or enter a new code").
- R3-U3, should fix, REFUTED: the upload row's button is "Retry" (`uploader.tsx:965`), which the words name.
- Notes: the button's name in the lead, "Reload the page": kept as the house pattern.

### Round 4, the last delta `74d6db9a..f7853552` (2026-11-11 03:15 to 03:35 UTC; every finding checked by W4)
No blocker; the database reviewer could not break it. Fixed in 39f27397 unless said otherwise.
- R4-S1 (security, should fix) and R4-D2 (database, note), CONFIRMED, DONE: a 32-bit request-key lock let two
  people's keys meet by chance. Now the first 64 bits of a SHA-256 of the person and the key: not steerable, and
  chance is once in 2^64.
- R4-S2 (security, should fix), CONFIRMED, a FOLLOW-UP: the guard's count can be sidestepped (an alias, a package
  function). The better guard is a type: handlers' services without the pool. A wide change in files this PR does
  not touch, so its own PR; no handler takes a second connection today.
- R4-D1 (note), ACCEPTED and said in the ADR: the session's read still waits behind a schema change.
- R4-D3 and R4-S4 (notes), DONE: a timeout above PostgreSQL's integer setting is refused before a connection.
- R4-D4 (note), DONE: an assertion slowness alone could fail. R4-D5 (note), DONE: a stale comment.
- Found sound by experiment: `set_config('lock_timeout', $1, true)` is `SET LOCAL`'s equal and is gone after every
  end of a transaction; it bounds the scope's opening read; other callers issue the statements they did.

**Follow-ups for the orchestrator to queue (none blocks this PR):** (1) `packages/db/src/migrate.ts` sets no
`lock_timeout`, so a migration queued behind a long job blocks every reader; (2) a handler's queue send commits by
itself: make the sends transactional or move them after the commit; (3) the session's end and its audit event are
two transactions (`auth/sessions.ts`); (4) the scope does not read COMMIT's answer; (5) a page's busy state is the
generic error state (the UX queue); (6) a second free-screening upload waits for the first without limit; (7) type
the signed-in handlers' services without the application pool, so a second connection cannot be taken (R4-S2).

## Log
- 2026-11-11 04:10 UTC: round 4 recorded; the full local suite passed on 22eb6c18 (finished 04:04 UTC); 39f27397 pushed to the PR branch at 04:09 UTC; the description rewritten; subscribed; CI running.
- 2026-11-11 03:16 UTC: round 3 recorded and fixed (f7853552); the base ca504674 merged (22eb6c18, pushed to the WIP ref); two last reviews launched; the full local suite started 03:14 UTC.
- 2026-11-11 02:50 UTC: the narrowed mechanism built and pushed as WIP 74d6db9a; round 2's database findings recorded; round 3 launched (02:45 UTC).
- 2026-11-11 02:10 UTC: fix round 1 built and pushed as WIP f3dc3ee6 (words, one mapping for every route, the queue's pool, the same key in flight, a page's error state, the URL guard, a log line by code); three delta reviews launched.
- 2026-11-11 01:50 UTC: review round 1 recorded; the words half of the fix round pushed as WIP 709fe620; the container restarted once (01:46 UTC), nothing lost.
- 2026-11-11 01:28 UTC: W4 took the claim over; the machine was ready at start; CI on 59eb9e9d read (`unit` red: the watched list); the three reviews launched again (01:26 UTC).
- 2026-11-11 01:10 UTC: held on the orchestrator's stand-down; draft #137 at 59eb9e9d; the three reviews stopped unfinished; RESUME-BLOCK written.
- 2026-11-11 01:40 UTC: built, pushed.
- 2026-11-10 23:46 UTC: allocated by the orchestrator (CAS-57; amendment to ADR 0092).
