# Item 25 (b), review B2: what the refusal discloses, and whether personal data reaches the refusal, log, URL or errors

Change: `git diff origin/claude/build-platform..HEAD` on co-001/screening-upload-bounded-wait (commits d20469fb, fe04a4f5).
This was a read-only review. I changed no file in the repository, pushed nothing and ran no tests. Availability and the transaction itself are left to the other reviewer.
No finding is a blocker. Nothing here means the change is HIPAA compliant.

## How the path runs (as read)
- Order of checks in `public.screening_submit` (apps/web/src/lib/screening/routes.ts):
  1. publicRoute: origin check, Zod parse, then the rate limit, counted before the handler runs (http/invoke.ts:501-530). The limit is 10 an hour per client address and 20 a day per account; the account is the email's domain for a business address and the whole address for a free-mail one (http/rate-limit.ts:52; routes.ts:583).
  2. screeningOpen.
  3. Upload checks. A refused upload stops here.
  4. Address hint.
  5. screening_submit_mail_refusal (routes.ts:695).
  6. DNS and SES address checks (routes.ts:704): up to 2 s, and each one spends the global 1,000-a-day validation budget.
  7. Only then the lock: withBoundedLockWaits (routes.ts:205-222) sets lock_timeout as a local setting (set_config with is_local true, routes.ts:210), then submit_screening takes its two advisory locks in key order (packages/db/functions/submit_screening.sql:67-75) and FOR UPDATE on the screenings it replaces (sql:137-147).
- A 55P03 error becomes InputError([{field:'input', message:SCREENING_BUSY}]) (routes.ts:756-761). publicRoute turns that into `{status:'invalid'}`. runAction returns it as ActionState from the server action, with no redirect, so no URL is involved. The upload form (components/screening/upload-form.tsx) submits through onSubmit with preventDefault and useGuardedSubmit ("no reset of the form"), so what the person typed stays in the browser's DOM state. A form-wide 'input' issue shows as "Not done" plus the sentence, without the "Fix the fields" lead (upload-form.test.tsx:160-175).
- Status and headers: like every other screening refusal, a server-action response with an ActionState body. The status code and headers do not differ by cause.

## Findings

B2-1 (note): timing and refusal oracle for "this practice or this address is uploading right now". routes.ts:756-761; messages.ts:235.
- Scenario: someone knows a victim's practice name and ZIP. They post their own valid upload with their own email and the victim's practice key at the moment the victim's upload is in its submit_screening transaction. If that transaction still has more than about 3 s to run, they get SCREENING_BUSY after about 3 s, and so learn the practice is uploading right now.
- This is not new in kind. Before the change the same probe waited and then succeeded, and the latency told the same thing. Also, if the victim is not in flight, the probe succeeds and replaces the victim's earlier screening. That is a pre-existing, destructive behaviour of the practice key (sql:154-165) and a far stronger signal than this refusal.
- Probing by contact email is noisier still. It sends a screening result to the victim's mailbox, replaces the victim's screening and spends the victim's account count.
- Practicality: the probe has to land inside the victim's own transaction window (seconds, and only for large uploads). It costs one rate-limit hit and one address validation, and gets about 10 tries an hour per client address. That is low value.
- The refusal does not reveal that an earlier screening exists. A wait on the row locks of a replaced run happens only while a worker or open transaction holds that run (operator_screening_claim/complete, screening_result_opened, convert_screening: short transactions). It answers with the same sentence and timing as an advisory-lock wait, so it cannot be told apart from "in flight". It also needs both an earlier screening and a concurrent short transaction. I could not make this practical.
- The sentence names no practice, address or "other upload" (messages.ts:229-235; the test pins it).
- Fix: none needed for this PR.

B2-2 (should fix, or at least record as an accepted risk): a new targeted refusal of a victim's honest upload. routes.ts:714, 756-761.
- Scenario: an attacker who knows the victim's practice name and ZIP sends back-to-back large uploads (up to 50,000 rows) under their own addresses with the victim's practice key, so that each of their submit_screening transactions holds the practice advisory lock. When the victim's upload waits more than 3 s on one of those locks, it is refused, and each retry spends one of the victim's own 10-an-hour and 20-a-day counts.
- Before this change the victim waited and then replaced the attacker's screening. Now the victim is refused.
- Limits:
  - Every attacker transaction must itself run more than 3 s past the moment the victim starts waiting. lock_timeout is per wait, and the victim is queued ahead of the attacker's next upload.
  - The attacker does not know when the victim will post, so the lock must be held almost continuously. That means hundreds of uploads an hour across many client addresses and accounts.
  - Each one passes the address checks (spending the global 1,000-a-day budget) and needs a ZIP the release can price.
- The order of checks does not let the attacker reach the lock cheaply. The lock comes last, after the rate limit, the upload checks and the paid address check.
- The same attacker can already do something worse: overwrite the victim's screening through the practice key, which already exists. So this is a modest widening, not a new class.
- Smallest fix in this PR: say in the busy log line which lock refused. Use an allowlisted enum field, e.g. error_code SCREENING_UPLOAD_BUSY_PRACTICE versus _CONTACT, if the practice and contact waits can be told apart; otherwise, as now, by request_id alone. Then operations can spot repeated refusals.
- Better: do not charge a busy refusal against the submitter's rate counts. This needs the rate guard to refund on this outcome, which is outside this PR's files.
- The root cause is that a stranger can claim a practice key by name and ZIP. Fixing that needs a migration (for Lane A).

B2-3 (note): the log line is clean. routes.ts:759.
- The message is a constant. Its fields are error_code and request_id, both in packages/observability/src/fields.ts (lines 10 and 59).
- It holds no address, practice, ZIP, row content, lock key or SQL. The test checks that no line from the request contains the address or domain (routes.db.test.ts, new case).
- The new path logs nothing else, and the lock_timeout parameter is a constant.

B2-4 (note, pre-existing, not introduced): errors that are rethrown can carry typed values. routes.ts:762 (`throw error`).
- A pg error other than 23514/23505/55P03 is rethrown to Next.js, which prints the error object to the server console. node-pg's DatabaseError carries `detail`. For a not-null, length or check error raised by a table constraint (rather than by the function's own RAISE), `detail` is "Failing row contains (...)", which would include the practice name and contact email.
- The same `throw error` existed before this change (with withClient).
- The new code adds two error kinds through committed(): CommitOutcomeUnknownError, which wraps a connection-level error, and TransactionNotCommittedError. Neither holds statement parameters. pg errors never hold the bound parameters themselves.
- Smallest fix, outside this PR's scope: before rethrowing, log only `{error_code: <sqlstate>, request_id}` and throw a plain Error that carries no detail.

B2-5 (note): the words.
- "nothing was sent" is true in every case that reaches it. The 55P03 is raised inside submit_screening before COMMIT. The transaction is rolled back, no run is queued and no email goes out. The earlier screening, if any, is left as it was. A COMMIT never waits on a lock, so the refusal cannot follow a commit.
- One reading is a little off: the rows did travel to the server, and "sent" means sent for screening. That is acceptable.
- "Wait a minute" is right when the other upload is slow, since its transaction lasts seconds, and when a worker transaction holds the row. It is wrong when the lock holder is stuck: an idle-in-transaction session (the new test shows a holder with no end) or a schema change holding a lock on a screening table. Then every retry is refused again after 3 s and spends a rate-limit hit.
- Smallest fix: have the sentence say what to do if it happens again, e.g. "Wait a minute, then send it again; if it happens again, request an audit". "request an audit" is already turned into a link by refusalSentence. Also confirm that an idle_in_transaction_session_timeout is set for the roles that can hold these locks (an ops check, not code here).

B2-6 (note): a comment is inaccurate. routes.ts:757-758 says "Another upload of the same practice or contact address held its place". A 55P03 can also come from a worker or result-open transaction holding a replaced run's row (sql:143-147), or from a relation lock. The sentence the person sees does not depend on this. Fix: reword the comment.

## What I could not break
- The URL: the refusal is a server-action return, not a redirect. No typed value goes to a query string, cookie or path. Only a successful upload redirects (screeningSentPath, which carries a state name only).
- Form state: the values stay in the browser's DOM. They are not written to storage, a cookie, a log or a server-side store on the refusal path.
- Disclosure of the refusal list: the busy refusal comes after the address checks, and the list is checked in submit_screening's run trigger after the locks. So a listed and an unlisted address get the same busy answer, and the list is not disclosed.
- Status code and headers: the same as every other refusal.
- The scope setting: lock_timeout is set local to the transaction (is_local true), so it does not leak to the next user of the pooled connection. The connection is released after a ROLLBACK.
