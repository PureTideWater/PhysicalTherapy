# Status: Queues item 37, the key registry (Lane A)

## RESUME-BLOCK (2026-11-12, W47, session_019i9if9pdiBq7WR2Rdf8ezT): the BUILD of item 37 is whole (W43's item 5 done: the web asks the provider for no sign-out, the alarms moved); what is left is seeing it in a browser, the two reviews, and the papers

**WIP `co-001/wip-key-registry` 7f986ed0** (three commits on 03f0af53). No PR is open. No migration was touched: the step
needed nothing the functions and grants did not already give (the row is queued by `audit_event_provider_sign_out`,
the trigger W33 built, on the audit event each act already wrote). The last session needs this block; W46's (the
console), W45's (the code screen), W44's (the flow), W43's (the job) and W33's (the database) are the references.

### What W47 built (W43's item 5, whole; commit 5b7729a4)
- **The three call sites.** `lib/routes/console.ts` `endMembership`, `lib/routes/settings.ts` `endMembershipAction`
  and `lib/auth/sign-in.ts` `endedByReset` no longer ask the provider anything. Each already wrote its audit event
  (`membership_ended`; `password_reset_completed` or `password_reset_outcome_unknown`) inside its own transaction,
  and the database's trigger queues one `provider_sign_out` row on that insert, so **the enqueue is the act's own
  transaction: a committed act has its row, a rolled-back act has none.** The job `provider_sign_outs` sends it.
  Nothing is sent from the web, after commit or otherwise. The Settings route no longer reads the person's provider
  subject at all (the trigger reads the account).
- **Removed with it:** `lib/auth/provider-sign-out.ts` and its test (`signOutAtProviderAfterCommit`,
  `NO_PROVIDER_SUBJECT`); `AuthProvider.globalSignOut` from the interface, the Cognito provider (with
  `signOutTimeoutMs`, `SIGN_OUT_TIMEOUT_MS` and the `AdminUserGlobalSignOutCommand` import) and the local twin, and
  their unit tests; `AfterCommitOptions.whenCommitUnknown` (`http/route.ts`, `http/invoke.ts`), which only the helper
  used: a commit that ends without an answer now runs no handler work at all, and what must follow it is the row's.
  `packages/synth/src/cases/registry.ts` SGN-19 lists the new test file in place of the deleted one.
- **The proof, kept as a test:** `lib/auth/no-provider-sign-out.test.ts` scans every `.ts`, `.tsx`, `.js`, `.mjs`,
  `.cjs` and `.json` file under `apps/web` (not `node_modules`, not dot-directories) and fails on any mention of the
  provider's sign-out, code or comment; the one allowed line is a test's `expect(provider).not.toHaveProperty(...)`.
  The grep (the same on 7f986ed0):
  ```
  $ grep -rn 'globalSignOut\|signOutAtProviderAfterCommit' apps/web/src
  apps/web/src/lib/auth/no-provider-sign-out.test.ts:20:const ALLOWED = /^\s*expect\(provider\)\.not\.toHaveProperty\('globalSignOut'\);$/;
  apps/web/src/lib/auth/sign-in.db.test.ts:591:    expect(provider).not.toHaveProperty('globalSignOut');
  apps/web/src/lib/routes/console-routes.db.test.ts:400:      expect(provider).not.toHaveProperty('globalSignOut');
  apps/web/src/lib/routes/console-routes.db.test.ts:1232:    expect(provider).not.toHaveProperty('globalSignOut');
  $ grep -rn 'GlobalSignOutCommand' apps packages --include=*.ts -l
  apps/worker/src/platform/cognito-sign-out.ts
  apps/worker/src/platform/cognito-sign-out.test.ts
  ```
  Four lines, all tests asserting the method does not exist; no call. The SDK's command is the worker's alone.
- **The alarms (same commit).** `infra/lib/security-events.ts`: `PasswordResetProviderSignOutFailed` and
  `MembershipEndProviderSignOutFailed` (and their two message constants) are gone from `RESET_AND_ENROLMENT_COUNTS`
  (the web's set, now 13 lines); `PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM` (`ProviderSignOutNotDelivered`, the job's
  words, 1 in 300 s) is new and `monitoring.ts` builds it on the **platform** log group
  (`monitoring.providerSignOutNotDeliveredAlarm`, namespace `TherapyPlatform/Worker`, filter on `$.msg` alone so
  LATE and GAVE_UP both count, operator topic, missing data not breaching). `RemovedHardwareKeyUsed` (W43's "plus")
  joined the web's set for the line `sign-in.ts` 502 writes. The filter count stays 41 (two out, two in).
  `PasswordResetSessionsNotEnded`'s words now also say no sign-out at Cognito was queued. `infra/test/monitoring
  .test.ts` ties the job's line to `apps/worker/src/platform/provider-sign-outs.ts` and holds that the three web
  sources hold no words about the provider's sign-out. `application-role.test.ts`: the web's provider sends
  `AdminCreateUser` and `AdminGetUser` only; the third action of the shared task role is the worker's.

### Tests first, and what was seen failing
- `no-provider-sign-out.test.ts`: failed on its assertion (`expected [ …(31) ] to deeply equal []`: 31 lines in 9
  files named the sign-out), then green.
- `sign-in.db.test.ts` and `console-routes.db.test.ts`, rewritten before the code: **4 failed, 114 passed**, each
  failure the assertion `expected DevAuthProvider{…} to not have property "globalSignOut"` (SGN-07's reset, SGN-19
  in both routes, the key removal's confirm). **Said plainly: the assertions on the queued row passed already before
  the change**, because the trigger has queued the row since W33's migration; what the change removes is the web's
  call, and that is what was red. (The first two runs of these files failed only because PostgreSQL was not
  running; those do not count and are not the failures above.)
- `infra/test/monitoring.test.ts`, rewritten before the infra change: 20 failed (the pinned list of counted lines
  by assertion; the web line's tie by assertion; the new alarm's tests because the construct did not exist yet),
  then green. `application-role.test.ts` then failed by assertion (the web's commands no longer equal the role's
  three) and was rewritten to say whose each action is.
- New cases: a reset's row carries IDs only (no address, no subject), `attempts` 0; a reset whose transaction fails
  twice, a reset made as the database goes away, a refused code and an unknown outcome with no account queue
  nothing; one retried try queues exactly one row; End membership through both routes writes one row tied to its
  audit event (`source_event_id`, `request_id`) and no line of the web's; a refused End membership queues nothing;
  **an End membership whose COMMIT the server refuses leaves no row, no audit event, the membership standing and
  the session active** (both routes).

### What is green (on 5b7729a4, PostgreSQL 18, Node 24)
The tip is **7f986ed0** (three commits on 03f0af53: 5b7729a4 the change; 34e84b87 and 7f986ed0 one generated file
each, `fixtures/synthetic/SGN-19/expected.json` by `pnpm synth --all` and `tools/screening-capacity/watched-paths
.txt` by its `--write`, which had not followed W45's `registration-code.ts`). Said exactly: typecheck, lint,
lint:logs, the web's unit tests, infra's tests and `pnpm test:db` ran on 5b7729a4, nothing edited while they ran;
the two later commits change one JSON line and one text line, and the whole unit suite ran on 34e84b87.
- `pnpm typecheck`: passed (exit 0). `pnpm lint`: 1,959 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,209 files,
  every call allowlisted. `pnpm verify-content`: every content set passes.
- The web's unit tests (`vitest run --project unit apps/web`): **126 files, 1,691 passed, 0 failed** (1,700 before:
  the deleted helper's and the provider method's tests out, the scan's two in).
- Infra's tests (`vitest run --project unit infra/`): **29 files, 825 passed, 0 failed.**
- `pnpm test:db` whole, 32 minutes, alone on the machine: **175 files passed; 10,551 tests passed, 1 skipped, 0
  failed.** `reconcile.large.db.test.ts` passed inside it; no re-run was needed.
- The worker's tests: none touched. `cognito-sign-out.test.ts` and `packages/synth` run again: passed.
- **The whole unit suite (`vitest run --project unit`, 510 files): 14,366 passed, 4 skipped, 4 failed on 34e84b87;
  2 of the 4 were the watched list, mended in 7f986ed0 (its file re-run: passed). The other 2 are NOT W47's and are
  red on 03f0af53 too (checked out and run there: the same 2 failed, 31 passed):** `packages/db/src/migrate.test.ts`,
  "the deploy runbook quotes 20261115090000_key_registry.sql's (and 20261115091000_key_registry_validate.sql's)
  lock-loop failure as the deploy log shows it". `docs/runbooks/deploy-and-rollback.md` does not yet hold those two
  quoted lines: **the runbook step's, and it must land before the PR's unit job can be green.** No earlier block
  names this (W46 ran only the web's unit tests).
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`.

### Safe with the previous image running (both do it for one act)
The migration is already applied when either image runs, so the trigger queues the row whichever image ends the
membership or records the reset.
- **Previous web, new worker (a rolling deploy):** the previous web calls the provider after its commit *and* the
  row is queued; the job calls the provider again within about a minute. The provider's global sign-out is
  idempotent (design section 7: a second one ends tokens already ended; the app's own sessions are not the
  provider's and ended at the commit), so the person is signed out once in effect and loses nothing more. The job
  marks the row done on its own answer. If the previous web's call fails it writes its old line, **which no alarm
  counts any more once the new infra is deployed**; nothing is lost, because the row is there and the job delivers
  it or pages `ProviderSignOutNotDelivered`.
- **New web, previous worker (the worker not yet replaced, or rolled back):** nothing asks the provider until a
  worker with the job runs. The app's sessions and the account's mark moved at the commit, so what stays open is
  only what the provider's own tokens can do, and a code step or key registration in flight is refused by the mark.
  Rows wait, undone and untried (a row never tried is never given up: 16.6), and are claimed when the job exists.
  **Nothing pages for a job that is not there**: see the point on the missed-run alarm below. Deploy the worker
  with or before the web; the deploy runbook should say so.
- **A full rollback to the previous image and the previous infra:** the previous web asks the provider itself
  again and its two alarms return; the rows queue and wait as above.

### NOT seen in a browser (nothing of item 37's screens has been; said first to whoever reviews)
- **The code screen** (`app/sign-in/register-key/page.tsx`, W45): the code field after the password and the
  authenticator code, its refusals, the step forward when the account is not closed.
- **The four console screens** on `/console/organizations/[organizationId]`, the Members card (W46): request key
  removal; the requested state as the requester and as another administrator (confirm, cancel); keys removed with
  Open registration; the code panel shown once and what a reload shows.
- Each at **390 px and 1,280 px**, by **keyboard**, with **focus** watched (the code panel takes focus; the table
  scrolls sideways at 390 px inside `ScrollTable`; what a refusal and a refresh keep).
- W47 changed no screen and no word a person sees: End membership's and the reset's pages answer as before, without
  the wait on the provider. The alarm descriptions (operator-facing) are new words: see the wording point below.
- `pnpm test:e2e` has not been run on this WIP by any session, and the e2e journey (request, confirm, open, the code
  typed, the new key registered) is not written.

### Every named point for the two reviews, in one list (W33, W43, W44, W45, W46 carried over; W47's added)
**For the security review, first, from the orchestrator:**
1. **A refused act leaves no trace.** A refused act writes no audit event because it rolls back (W46), so a refused
   key removal (the requester confirming their own request, an administrator under seven days, a stale key session,
   the account acting on itself) is recorded nowhere but a log line of the wrapper's. The security review says
   whether sections 4.5 and 6 of the note require a trace of a refused removal and, if so, how it survives the
   rollback (a second transaction after the refusal, an autonomous write by the function before it raises, or a
   counted log line with an alarm).

**Auth review**
2. (W33, the ruling's point 4) Every session insert now takes the account's row, the previous image's included,
   which ADR 0093 D4 had left unlocked on purpose. ADR 0095 needs the dated section amending D4, and "What the
   founder should know" a line.
3. (W33) `hardware_key_record` is an uncounted check of a code digest for whoever holds the application role
   (decision 7); the 40 bits and the hour bound it.
4. (W43) The job reads the provider's `UserNotFoundException` as `no_such_user` and marks the row done with no
   sign-out; a pool ID naming the wrong pool would turn every row into that answer. Nothing checks the pool at start.
5. (W43) The `removed` email tells the reader that support gives a one-time code: whether an email should say a code
   exists at all.
6. (W44, W45) `hardware_key_registration_judge` asked with no code counts a try, and the free "closed?" helper is
   granted to no role. The web reads closed from the registry's rows; the one case it cannot see is a removal
   confirmed for an account that never had a key row, whose first visit spends one of the five tries. Recorded for
   the contract migration, not built.
7. (W44) `codeRequired` and `code` live in the sealed step, but nothing trusts them: `judge` runs before each
   provider call and `hardware_key_record` judges again under the lock.
8. (W44) The cleaning skips a provider credential whose ID is not canonical base64url of 16 to 1,023 bytes; whether
   Cognito's `CredentialId` is exactly the browser's `id` is unverified; if not, the cleaning deletes nothing.
9. (W44) The cleaning measures "older than 15 minutes" from the database's clock against the provider's: two clocks.
10. (W44) A registration that fails for a reason that is not a refusal now answers `key_not_registered` after
    removing the key, where the base threw; the error's class name is logged.
11. (W45) The code action is counted in `mfa` by the sealed step, the same budget as the key routes; whether the
    code deserves a budget of its own.
12. (W45) A code typed for an account that is not closed is answered as a step forward (`not_closed`), not a refusal.
13. (W45) The shape's refusal differs from the wrong code's (a field issue against the one refusal).
14. (W46) `AuditSpec.writtenBy: 'database'` lets a route name an audit action the wrapper never writes; only the
    four key routes use it, each tested for exactly one event; no test yet refuses the flag on any other route.
15. (W46) `runAction`'s `answer` returns a server action's success state without a redirect. One caller.
16. (W46) 42501 from the functions is answered `invalid` with the rule's words, not `forbidden`.
17. (W46) The lost code: one administrator can hold an account closed an hour at a time by opening and discarding
    codes; each is audited and sends the member the opening's notice.
18. (W46) The page lists removals only beside an organization's members; an account with no membership row has no
    row to act on.
19. (W46) `organizationId` in the key routes' inputs is used for the redirect only and is not checked against the
    account's memberships.
20. **(W47) A reset that recorded nothing now signs out nowhere.** When both tries of `endedByReset` fail (or the
    database goes away after the provider took the new password), the previous web still asked the provider to sign
    the user out; now no cause committed, so no row exists and nothing asks. The password is changed at the
    provider, the app's sessions stand, and the one signal is `security event: password reset sessions not ended`
    (`PasswordResetSessionsNotEnded`, whose words now say no sign-out was queued). The provider's sign-out never
    ended the app's sessions, so what is lost is the provider's tokens ending for that account until the operator
    acts. Closing it would take a way to queue a sign-out without the reset's event (a function and a grant: a
    migration, closed to W47). The review says whether the runbook's step is enough.
21. **(W47) The web's task can still send the sign-out.** The web and the worker share one task role
    (`USER_POOL_ADMIN_ACTIONS`), so the web's credentials still hold `cognito-idp:AdminUserGlobalSignOut` though no
    code of the web sends it. Splitting the role is larger than this step.
22. **(W47) `whenCommitUnknown` is gone from the wrapper.** After a commit with no answer no handler work runs. No
    route but the two End memberships used it; any later route that wants work for that case must write a row.
23. **(W47) The Settings route no longer reads `cognito_sub`** under the administrator's scope before ending the
    membership; ADR 0094's note on reading the subject "while the membership stands" is now moot and ADR 0095
    should say so.

**Security review**
24. (W46) The registration code crosses the server-action response to the administrator's browser and lives in
    React state until the page goes; `autocomplete`, storage and the URL never see it.
25. **(W47) During a deploy the previous web's failure line pages nobody** once the new infra is in (its two alarms
    are gone); covered by the row and the job, as "Safe with the previous image" says. And the reverse order (new
    web, no job yet) asks the provider nothing until the worker is replaced.
26. **(W47, W43's open point, still open) Nothing by name alarms when `provider_sign_outs` does not run.** Section 7
    asks the build to confirm the platform schedule's missed-run alarm covers the job. W47 looked: `infra/lib` names
    the job in no alarm list; what exists is the platform heartbeat (the process is alive) and the final-failure
    filter on the platform group (`JobFailedOnLastAttempt`, a run that fails). A schedule that stops firing this one
    job while the process beats is heard by neither, and rows then wait unpaged (LATE needs tries). Not built: it
    needs a decision on a per-job missed-run signal (for example an alarm on rows undone past N minutes, written by
    another job, or a per-job beat).
27. (W43) The failed-try warning carries no cause `request_id` (`operator_provider_sign_out_claim()` does not return
    it; migrations closed). The LATE and GAVE_UP lines carry it.

**Database review**
28. (W33) `membership_removal_target_holds` holds while a request is `requested`, including one past its 24 hours
    that the job has not yet marked expired (at most a minute).
29. (W43) The run's 8 seconds are counted from the first claim and each call may take 10 seconds more; the operator
    pool has two connections and this job holds one for the run.
30. (W43) The worker's tests assert `operator_key_removals_expire` is called; they do not expire a real lapsed
    request (W32's database tests hold the function).

**Wording, UX and brand review**
31. (W43) The step-failed line's `error_code` is `<step>:<error name>`, a compound code.
32. (W45, W46) "by phone, on a number you already hold" states the runbook before it exists.
33. (W46) The Actions cell of a member under removal holds two paragraphs and two buttons in a table cell; at 390 px
    the table scrolls sideways, not seen.
34. (W46) "Confirm key removal" is one press with its consequence in the paragraph above, no typed confirmation.
35. (W46) The refusals are lower-case rule sentences in the form's error; the first is long.
36. (W46) If the code is lost the opening stands for its hour; the screen says "shown once" and not what to do then.
37. (W46) "It cannot be undone" on a button whose effect a new registration mends.
38. (W46) The requester sees their own request as "You asked".
39. **(W47) The two new alarm descriptions** (`ProviderSignOutNotDelivered`, `RemovedHardwareKeyUsed`) point at
    "docs/runbooks/incident-response.md, the hardware key section", which the runbook step has yet to write, and
    `ProviderSignOutNotDelivered` tells the operator to have the user signed out "through the founder's break-glass"
    for GAVE_UP (16.6: until an operator function exists the one resend left is the founder's).

### What is left of item 37 (no code of the build; in this order)
1. **See it in a browser** (the list above) and write the e2e journey; `pnpm test:e2e`.
2. **W43's item 6:** the relying-party tie (the web refusing to start when the pool's and the app's differ) and the
   infra test tying `KEY_USER_VERIFICATION_REQUIRED` to the pool's setting. (Small code; not started.)
3. **The two build reviews** (auth and security, with the database and wording points), on the list above.
4. **ADR 0095** (with the dated section amending ADR 0093 D4, ADR 0094's open case closed and its subject note
   moot, the decisions W33 lists under "Decisions the migration takes beyond the note").
5. **The runbooks** (first the two lock-loop lines `migrate.test.ts` wants in `deploy-and-rollback.md`, red today): `incident-response.md` (lines about 13, 30, 216 to 234, 282 to 297, 537 to 539 still describe
   the two old alarms; the hardware key section, `ProviderSignOutNotDelivered` LATE and GAVE_UP, a removed key
   used, `KEY_NOTICE_UNDELIVERED`), `support-mail.md` (65, 88), `deploy-and-rollback.md` (415 to 443; the worker
   with or before the web).
6. **The test-matrix rows:** `packages/synth/src/cases/matrix.ts` 931 and 949 still describe the web asking the
   provider and the two old alarms (SGN-16's row and SGN-19's); SGN-21 to SGN-27 and JOB-07, JOB-08 as W33 lists.
7. **The domain model's regeneration** and **the PR**, opened with `pnpm -s db:domain-model --summary-since
   origin/claude/build-platform --function-diffs list`, the approval line posted as a suggestion, never written.

### Machine notes
PostgreSQL 18 was stopped when this container woke: `cd / && runuser -u postgres -- /opt/pg18/bin/pg_ctl -D
/root/pgdata18 -l /root/pgdata18/server.log -w start -o "-p 5433 -k /tmp"`. Node 24 first on PATH
(`/opt/node24/bin`); `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`. The checkout is detached at
the WIP commit; push with `git push origin HEAD:refs/heads/co-001/wip-key-registry`. To write this block W47 read,
beyond what it was told to read, the named-points sections of W45's, W44's, W43's and W33's blocks and W43's "Left
open" (about 75 lines), since the list above had to carry them. W47 holds nothing else: no PR, no subagent, no
scheduled task; its one background run (the database suite) has ended.

## The earlier block (2026-11-12, W46, session_019i9ifBCSRKBX2qnkTHphgZ): cut B's CONSOLE is built (four routes, their screens); the provider sign-out removal and the alarm swap are NOT started

**WIP `co-001/wip-key-registry` 03f0af53** (one commit on c2450a78). No PR is open. No migration was touched; every
route was built on the functions and grants as they are. W46 stopped at its token limit (about 185k) at a clean
boundary instead of leaving the sign-out removal half done. The successor needs this block, W45's below (the code
screen), W44's (the flow) and W43's item 5.

### What W46 built (W43's item 4; `apps/web` only)
- `lib/routes/console-keys.ts` (new): `console.request_key_removal`, `console.confirm_key_removal`,
  `console.cancel_key_removal`, `console.open_key_registration`. Each a `platformRoute`, action, path
  `/console/organizations/[organizationId]`, `phi: false`, permission `organization.manage`, Zod input of opaque IDs
  only (`organizationId` for the redirect, `userId` or `removalId`). Each passes `actor.sessionId` (this request's
  resolved session) as `acting_session` and the request's ID. In `CONSOLE_ROUTES` through `CONSOLE_KEY_ROUTES`.
- **Who may act, as built.** Handler: `organization.manage` against the actor's internal roles (a practice
  administrator: `forbidden`; an internal role on a code session: `hardware_key_required`, the wrapper's). Postgres,
  again: the four functions (`account_removes_keys`, `actor_key_session(acting_session)`, the constraints). The
  routes add no rule of their own. Scoped transaction: the wrapper's `withActor` (no practice in scope).
- **Audit.** The functions write the reserved actions themselves, so the wrapper must not write a second.
  `route.ts` had no such mode; W46 added `AuditSpec.writtenBy?: 'database'` and one condition in `invoke.ts` `run`
  (design section 6 asked for exactly this). The route still names its action, so the registry's "a mutation names an
  audit event" holds. Tests hold exactly one event for each act and none for a refusal (a refused act rolls back:
  **a refusal writes no audit event; the acceptance line "each with its audit event" is met as "each act has its one
  event, each refusal has none", said plainly**).
- **The code.** `openKeyRegistration` makes it (`newRegistrationCode`), passes `registrationCodeDigest` only, and
  returns `{ objectId, registrationCode, openUntil }` with **no redirect**. `lib/http/next.ts` `runAction` gained
  `options.answer` (success returns a state to the form that asked, nothing redirects), used by
  `openKeyRegistrationAction` alone. The client component `components/console/open-registration.tsx` holds the code
  in React state only: no URL, cookie, storage, log, job payload or error. Tested: not in the audit row, the log
  lines or the page's data; the stored digest equals the code's.
- **Refusals' words:** `KEY_REFUSALS` in `console-keys.ts`, by constraint name; 42501 is `not_permitted`; P0002 is
  not found; `hardware_key_removal_open_once` (23505) mapped. `cancel` returning false is answered as decided.
- **The list.** `organizationPage` (`console.ts`) calls `keyRemovalsByAccount` (`hardware_key_removals()` joined to
  the requester's email) and each `MemberSummary` gains `self` and `keyRemoval` (the account's latest removal).
- **Tests first.** `console-routes.db.test.ts`, describe "hardware key removals from the console (SGN-23, SGN-24,
  SGN-25, SGN-27)", 5 cases, written before the routes. **Seen failing only as a file that could not load** (the
  module did not exist: "no tests"), then 3 failed on wrong expectations of W46's own (a code session is
  `hardware_key_required` at the wrapper, not a database refusal; two seed mistakes), then green. Covered: the same
  person twice, the account itself (request, confirm, cancel), under seven days (3 and 6 days), a key session 16
  minutes old while a fresh one exists elsewhere, a code session, the console's administrator with no registered
  key, a practice administrator, no such account or removal, a second open request, an already decided removal, the
  ended session of the closed account (turned away, nothing written; Postgres opens it no new session by key or
  code), open before confirmation, open twice. No new SGN number was taken.
- **Test support, said plainly:** `lib/routes/test-support/key-holders.ts` (new: `recordKey`, `keySession`,
  `seedPlatformAdmin`, which inserts the membership with triggers off to give it an age, as W33's tests do). The
  generated route tests' world (`route-tests/world.ts`) changed: its platform administrator is seeded eight days in
  the role with a registered key and signs in with it, and each world gains a key holder, a second and third
  administrator, two requested removals and one confirmed. `SampleRefs` gained four refs. `registry.test.ts` lists
  the new module.

### What is green (on 03f0af53, PostgreSQL 18, Node 24)
All run on the committed tree 03f0af53, nothing edited while they ran, one after another.
- `pnpm typecheck`: 24 projects passed. `pnpm lint`: 1,960 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,210
  files, every call allowlisted.
- The web's unit tests (`vitest run --project unit apps/web`): **126 files, 1,700 passed, 0 failed.**
- `pnpm test:db` whole, 25 minutes: **175 files passed; 10,549 tests passed, 1 skipped, 0 failed.** The worker's
  `reconcile.large.db.test.ts` passed this time (nothing ran beside it).
- Within that: `console-routes.db.test.ts` 46 passed; the generated route tests of the four routes passed.
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`, the unit suite outside `apps/web`, the infra tests.

### NOT done by W46
1. **W43's item 5, whole: the web still calls the provider's sign-out.** Not started, on purpose: half of it leaves
   `infra/test/monitoring.test.ts` red. The inventory, read on 03f0af53:
   - calls: `lib/routes/console.ts` 16 (import) and about 799 to 801 (the `sub` read and
     `signOutAtProviderAfterCommit`); `lib/routes/settings.ts` 30 and about 1117; `lib/auth/sign-in.ts` 1172 to 1174
     (`endedByReset`, the call and its error line);
   - then delete `lib/auth/provider-sign-out.ts` and `provider-sign-out.test.ts`, and the latter's line in
     `packages/synth/src/cases/registry.ts` 1175 (matrix rows at `matrix.ts` 931 and 949 describe the old behaviour);
   - tests that spy on `globalSignOut`: `console-routes.db.test.ts` 359 to 428 (the End membership case and the
     SGN-19 block of two routes; W46's confirm case already asserts the web calls nothing and one outbox row exists,
     the shape to reuse) and `sign-in.db.test.ts` 551, 586, 631 to 635, 683, 741, 935 to 940, 1438, 1486, 1512;
   - alarms: `infra/lib/security-events.ts` 65 to 78 and 135 to 136, `infra/lib/constructs/monitoring.ts` 617 to
     618, `infra/test/monitoring.test.ts` 65, 66, 152, 154, 178 to 194, 583 to 599; replaced by
     `ProviderSignOutNotDelivered` on the **platform** log group (`PROVIDER_SIGN_OUT_NOT_DELIVERED`,
     `apps/worker/src/platform/provider-sign-outs.ts` 77) and the `removed hardware key used` alarm;
   - `AuthProvider.globalSignOut` (`provider.ts` 167, `cognito-provider.ts` 683, `dev-provider.ts` 432) would then
     be called by nothing in the web: remove it or say why it stays;
   - the proof asked for: `grep -rn 'globalSignOut\|signOutAtProviderAfterCommit' apps/web/src` showing no call.
   - the runbooks name both old alarms (`incident-response.md` 13, 30, 216 to 234, 282 to 297, 537 to 539;
     `support-mail.md` 65, 88; `deploy-and-rollback.md` 415 to 443): the runbook step's.
2. **Nothing was seen in a browser**: W45's code screen and W46's console, at 390 px and 1,280 px, keyboard and
   focus. The e2e journey W45 describes can now be written the honest way (request, confirm, open, the code typed).
3. W43's item 6 and the rest of item 37: the relying-party and user-verification ties, the e2e spec, the two build
   reviews, ADR 0095, the runbooks, the test-matrix rows, the domain model's regeneration, the PR.

### For the UX and brand review: the console's screens and words (all on `/console/organizations/[organizationId]`, the Members card)
Files: `app/console/organizations/[organizationId]/page.tsx`, `components/console/key-removal.tsx`,
`components/console/open-registration.tsx`. No new page, no navigation change.
- Members card description, a sentence added: "Removing an account’s hardware keys takes two platform
  administrators, neither of them the account: one requests, another confirms within 24 hours."
- Account column, badges added: "key removal requested" (destructive), "keys removed" (destructive),
  "registration open" (outline).
- Actions column, per member, one of:
  - no removal standing: button "Request key removal" (outline). It asks for no confirmation: a request changes
    nothing by itself.
  - requested: "{You | requester's email} asked to remove this account’s hardware keys at {time UTC}. The request
    ends at {time UTC}." Then, to the requester: "Another platform administrator confirms it. You cannot confirm your
    own request." To anyone else: "Confirming removes every hardware key of {email}, ends their sessions at once and
    closes the account to sign-in until an administrator opens registration of a new key. It cannot be undone." and
    the button "Confirm key removal" (destructive). Both see "Cancel request" (outline).
  - confirmed and closed, nothing open: "Keys removed at {time UTC}. Open registration only when you are speaking
    with the person and are sure it is them: it lasts one hour and gives you a code to read to them." Button "Open
    registration" (outline).
  - after pressing it, in place of the form (the panel takes focus; `role="group"`, labelled "Registration code for
    {email}"): "Registration is open for {email} until {time UTC}." / "Code: XXXX XXXX" (mono, grouped in fours) /
    "Read it to the person by phone, on a number you already hold for them. It is shown once: PaidWhole keeps no
    copy, and it goes when you leave or reload this page." / "Never send the code by email or chat. They enter it
    after their password and authenticator code, then register the new key. Five wrong codes close this opening."
  - confirmed and open (after a reload, or to another administrator): "Registration of a new key is open until
    {time UTC}. The code was shown once to the administrator who opened it."
  - on the reader's own row: nothing, or while a request stands: "Another administrator asked to remove your
    hardware keys. Two others decide it."
- Refusals, shown by the form as its error (the nine sentences of `KEY_REFUSALS`), for example: "only a platform
  administrator who has held the role for seven days, signed in with their registered hardware key in the last 15
  minutes, does this; sign out, sign in again with your key, then try again"; "ask another platform administrator to
  confirm this removal; the one who requested it cannot"; "this request has expired; ask again".
- **What a refresh keeps:** every state but the code. The code panel is memory only; a reload shows "open until".
- **Points W46 names for that review:** (1) the Actions cell of a member under removal holds two paragraphs and two
  buttons inside a table cell; at 390 px the table scrolls sideways (`ScrollTable`), not seen. (2) "Confirm key
  removal" is one press with its consequence in the paragraph above, no typed confirmation. (3) The refusals are
  lower-case rule sentences in the form's error, as the unlock's is; the first is long. (4) "by phone, on a number
  you already hold" states the runbook before it exists (W45's point 2, the same). (5) If the code is lost (reload,
  a duplicate post), the opening still stands for its hour and cannot be reopened until it ends; the screen says
  "shown once" and not what to do then. (6) "It cannot be undone" on a destructive button whose effect a new
  registration mends. (7) The requester sees their own request as "You asked".

### Named points for the two reviews (W46 adds; W45's, W44's, W43's and W33's stand)
- **Auth review:** `AuditSpec.writtenBy: 'database'` lets a route name an audit action the wrapper never writes; a
  route that claimed it falsely would change records unaudited. Only the four key routes use it, and each has a test
  of exactly one event; no test yet refuses the flag on any other route.
- **Auth review:** `runAction`'s `answer` returns a server action's success state without a redirect. One caller.
- **Auth review:** 42501 from the functions is answered `invalid` with the rule's words, not `forbidden`: it names
  the three conditions together and so does not say which one failed.
- **Auth review:** the lost-code case above: one administrator can hold an account closed for an hour at a time by
  opening and discarding codes; each is on the audit log and sends the member the opening's notice.
- **Auth review:** the page lists removals only beside an organization's members (current and ended). An account
  with no membership row at all has no row to act on (the design's line on an account with no membership).
- **Auth review:** `organizationId` in the inputs is used for the redirect only and is not checked against the
  account's memberships (as `console.unlock_user` does).
- **Security review:** the code crosses the server-action response to the administrator's browser and lives in
  React state until the page goes; `autocomplete`, storage and the URL never see it.

### Machine notes
As W45's. `pnpm install --frozen-lockfile --offline` was needed again after checking out the WIP ref. W46 holds
nothing else: no PR, no subagent, no scheduled task; its one background run (the suites above) has ended.

## The earlier block (2026-11-12, W45, session_019i9ifCFdvWD98TKN6iy9fs): cut A is whole (the flow verified, the code SCREEN built); next is cut B, none of it started

**WIP `co-001/wip-key-registry` c2450a78** (one commit on dde86284). No PR is open. No migration was touched. The
successor needs this block, W44's below (the flow, its named points) and W43's "exact next step" items 4 to 6.

### What W45 built (W43's item 3; `apps/web` only)
- `lib/routes/sign-in.ts`: the action **`answerRegistrationCode`** (`sign_in.registration_code`, POST of the
  `/sign-in/register-key` form, rate limit `mfa` by the sealed step, in `SIGN_IN_ROUTES`). Zod: `registrationCode`
  (`lib/routes/schemas.ts`: at most 32 characters, spaces and hyphens dropped, upper-cased, then the shape, eight of
  the 32 symbols). It reads the sealed `register_key` step (none: the grant of an unstarted step is given back, then
  the restart), calls the flow's `answerRegistrationCode`, and settles: `open` seals the digest and returns to the
  same page, which now shows the key ceremony; `refused` is `MESSAGES.registration_code`, the step kept.
  `registerKeyPage` returns `codeRequired: true` and `supportEmail` only when the sealed step has `codeRequired` and
  no `code`; it asks the database nothing, so showing the screen counts no try. **The judge is never called without
  a code by anything W45 added.**
- `app/sign-in/actions.ts`: the server action `registrationCodeStep`. `app/sign-in/register-key/page.tsx`: the code
  form in place of the key ceremony when `codeRequired`.
- **Who may act, as built:** this is a sign-in step, so there is no session and no role. The handler requires the
  sealed step (password and authenticator code proven, the step begun after the mark, inside its limit); Postgres
  judges for `app_actor_id()` alone under the account's lock (`hardware_key_registration_judge`), counts a wrong code
  and records `key_registration_refused`; `hardware_key_record` judges again at the registration. The audit events
  are the functions' own. Nothing new is logged; the code is in no cookie, result or log line (tested).
- Tests first, seen failing (three on the missing route, one on the missing `codeRequired`), then green:
  `lib/routes/sign-in-routes.db.test.ts`, describe "SGN-27: the code screen" (4 cases; number SGN-27 reused, none
  new taken). Written after their code, said plainly: `lib/routes/schemas.test.ts` (2 cases) and
  `lib/auth/registration-code.test.ts` (2 cases; W44's helper had no unit test).

### What was red on dde86284, and what W45 did
- **`apps/web/src/lib/server/lock-timeout.test.ts` (unit; the flow's): fixed.** Its inventory of places that reach
  the application pool said 5 for `lib/auth/sign-in.ts`; the flow made it 7 (the judgement, whose counted try must
  commit, and the key's record; both before any session). The count and its comment now say so. Not loosened: the
  list is still exact by file and count.
- **`pnpm typecheck` failed in three projects only because this container had not installed W43's worker dependency**
  (`@aws-sdk/client-cognito-identity-provider`); `pnpm install --frozen-lockfile --offline` once, then green. A
  machine matter, not the code's. **The setup script should run that install after checking out a WIP ref.**
- **`pnpm test:db` whole: one suite's `afterAll` timed out at 30 s** (`apps/worker/src/reconcile/reconcile.large
  .db.test.ts`; its one test passed) while typecheck and lint ran beside it on this machine. Alone it passes. Not the
  web half's and not touched; told to the orchestrator.
- Nothing else was red.

### What is green (on c2450a78, PostgreSQL 18, Node 24)
- `pnpm typecheck`: 24 projects passed. `pnpm lint`: 1,956 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,206
  files, every call allowlisted.
- The web's unit tests (`vitest run --project unit apps/web`): **126 files, 1,696 passed, 0 failed** (run on the tree
  one type-only edit before the commit; the two unit files W45 added, 6 passed, run again after).
- `pnpm test:db` whole, 32 minutes, started on dde86284 and running while W45 edited (so a mixed tree; said, not
  hidden): **175 files, 174 passed and the one above failed in its hook; 10,416 tests passed, 1 skipped, 0 failed.**
- On the committed tree, alone: `sign-in-routes.db.test.ts` 38, `sign-in.db.test.ts` 72 and
  `reconcile.large.db.test.ts` 1: **3 files, 111 passed.**
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`, the whole unit suite outside `apps/web`, and the whole database
  suite again on c2450a78 exactly.

### NOT done, said first to whoever reviews: the screen has not been seen in a browser
W45 stopped at its token limit before driving the page. Keyboard order, focus after a refusal and after the right
code, and the layout at 390 px and 1280 px are **read from the code and the shared components, not observed**. What
is needed: an e2e journey (best written with cut B's console route, which makes the removal and the code the honest
way; a persona of its own, since a removal would break every other spec's key) and before and after screenshots for
the UX and brand reviewer. Expected from the components, to be confirmed: Tab order is the code field, Continue,
then the timer's Start again, then the support link; the field is a secret one (`autoComplete="one-time-code"`), so
`ActionForm` empties it after a refusal and focuses the error as on the authenticator-code step; the right code
redirects to the same path, a full navigation, so focus starts at the top of the key step.

### For the UX and brand review: the screen and its words (`app/sign-in/register-key/page.tsx`)
- Title and h1, unchanged: "Register a hardware key" (with "Step n of n" when numbered). Card title: the email.
- Card text, new: "The hardware key for this account was removed. To register a new one, first enter the code
  PaidWhole gave you. Your password and authenticator code alone open nothing for this account."
- Field label: "Code from PaidWhole". Hint: "Eight letters and digits. Spaces, hyphens and lower case are fine."
  Button: "Continue".
- Field issues: "fill this in" (empty); "enter the eight letters and digits of the code PaidWhole gave you" (wrong
  shape; never reaches the database).
- Refusal (W44's words, now shown): "That code did not open registration. Check the code PaidWhole gave you and try
  again." One answer for no opening, a wrong code, a spent or dead opening. It names no account and no state.
- Under the card, new: "No code? A PaidWhole administrator gives it to you by phone. Write to {support address} from
  the address you sign in with."
- The timer and its two notes are the key step's, unchanged.
- **What a refresh keeps:** the step (the sealed cookie) and its time left; never the typed code. After the right
  code a refresh shows the key ceremony (the digest is sealed, not the code). Start again ends the step as before.
- **Points W45 names for that review:** (1) the card says the key "was removed" to a person who has proven password
  and authenticator code only; it is true whenever the screen shows, but the reviewer may prefer words that do not
  state it. (2) "by phone" states the runbook's channel before the runbook exists. (3) The code is set in the
  field's ordinary face, not mono; BRAND.md asks mono for codes shown, and this one is typed, as the six-digit field
  is. (4) `autoComplete="one-time-code"` is used for the secret-field behaviour; a phone may offer an SMS code there.

### Named points for the two reviews (W45 adds; W44's, W43's and W33's stand)
- **Auth review, W44's point stands and is not solved here:** `judge` asked with no code counts a try, and the free
  "closed?" helper is granted to no role. W45's screen and action never ask without a code; the one case W44 named
  (a removal confirmed for an account with no key row) still spends a try at the key routes' first judgement.
- **Auth review:** the code action is counted in `mfa` by the sealed step, the same budget as the key routes; a
  person who spends it on codes is refused by the rate limit before the database's five tries are reached or not,
  whichever is first. Whether the code deserves a budget of its own is the review's.
- **Auth review:** a code typed for an account that is not closed is answered as a step forward (`not_closed`), not
  a refusal; it reveals only what the page already showed that person.
- **Auth review:** the shape's refusal differs from the wrong code's (an issue on the field against the one
  refusal). The shape is public and the difference says nothing of an account or an opening; named for completeness.

### The exact next step: cut B (W43's items 4 and 5, none started; another session takes it)
The four console routes (request, confirm, cancel, open; `newRegistrationCode` and `registrationCodeDigest` from
`lib/auth/registration-code.ts`, the code shown once to the opener), the removal of `signOutAtProviderAfterCommit`
and the reset's provider call, the two alarms swapped; then W43's item 6; then the e2e journey and screenshots named
above, the two build reviews, ADR 0095, the test-matrix rows, the runbooks and the PR.

### Machine notes
PostgreSQL 18 was stopped when this container woke (W33's start command, in its block, brought it up). The shell's
default Node is 22: put `/opt/node24/bin` first on PATH. Database tests need `DATABASE_URL=postgres://postgres:test@
localhost:5433/postgres`. The ops worktree was one commit behind origin at the start (W44's block was not in it);
`git pull --rebase` first. W45 holds nothing else: no PR, no subagent, no scheduled task, no background run.

## The earlier block (2026-11-12, W44, session_019i9ifCbvaBHG1q7YBdjKGM): the web half's FLOW (cut A, items 1 and 2); still the reference for the flow and its named points

**WIP `co-001/wip-key-registry` dde86284** (one commit on e85c3b40). No PR is open. No migration was touched. W44
handed over at about 250k tokens, most of it reading. The successor needs this block, W43's below (its "exact next
step" items 3 to 6 are what is left) and W33's (signatures, refusals).

### What W44 built (W43's items 1 and 2)
- `apps/web/src/lib/auth/sign-in.ts`:
  - `authenticated()` reads `sign_in_hardware_keys` (one read, only for a key sign-in or an account that must hold a
    key) in place of `provider.hasHardwareKey`, which is gone from the interface and both providers.
  - A key sign-in, section 5's four steps: `registeredKey()` (well formed; a live row, else `sign_in_key_refused`
    `removed` or `not_registered`, the paging line `security event: removed hardware key used` for a removed one, and
    `cleaned()` with the grant; the app's own `verifyAuthenticationResponse` against the row's public key, counter
    zero, a failure logged as `security event: hardware key assertion refused by the registry` with the error's class
    name only and recorded `assertion`); then `openSession` with the digest. `user_session_hardware_key_live` is
    answered `expired` and recorded `removed`; `user_session_key_registration_closed` is answered
    `hardware_key_required` with the warn line `security event: code session refused while key registration is closed`.
  - The plumbing: `beginKey` seals `assertion` (the options' challenge) in the pending key step; `completeKey` passes
    the response and it down; a key step with no `assertion` (the previous image's) starts again (`expired`).
  - Registration: `judgeRegistration()` (`hardware_key_registration_judge` as the account) before
    `beginKeyRegistration` and before `completeKeyRegistration` ask the provider; `recorded()` verifies the
    registration response itself (the challenge sealed as `creation`) and calls `hardware_key_record` with the code's
    digest; a failure of either removes the key at the provider with the grant, logs `hardware key registered at the
    provider but not recorded` (`user_id`, `request_id`, `error_code` the constraint or a class name, `outcome_code`
    removed or not_removed) and answers `key_not_registered`. The flow no longer writes `hardware_key_registered`
    itself (the function does; the event's purpose is now empty, not `webauthn`). ADR 0093 D6's path is unchanged.
  - The code: `answerRegistrationCode(pending, typed, context)`; the pending `register_key` step gains `creation`,
    `codeRequired` and `code` (the digest in hex, only after `open`); a new refusal reason `registration_code`.
- `apps/web/src/lib/auth/registration-code.ts` (new): the alphabet (32 symbols, no 0 1 I O), `newRegistrationCode()`
  (8 symbols, `crypto.randomInt`), `normalizeRegistrationCode`, `isRegistrationCodeShaped`, `registrationCodeDigest`.
  **Cut B's console route uses `newRegistrationCode` and `registrationCodeDigest` from here.**
- `sessions.ts`: `openSession` carries `keyCredentialSha256` (the INSERT names the column, null for a code session);
  `KEY_NOT_LIVE_CONSTRAINT`, `KEY_REGISTRATION_CLOSED_CONSTRAINT`, `refusedConstraint()`.
- `provider.ts`, `cognito-provider.ts`, `dev-provider.ts`, `dev-store.ts`: `listHardwareKeys(grant)` (credential ID
  and creation time; Cognito's by `ListWebAuthnCredentials`, paged); the twin stores `createdAt`.
- `SignInDependencies.webauthn { rpId, origin }` (required); `services.ts` fills it from the configuration
  (`ServiceParts.rpId`, the origin's host when absent). `KEY_USER_VERIFICATION_REQUIRED = true` is the one constant.
- `apps/web/src/lib/routes/sign-in.ts`: ONLY the refusal's words, so the switch is whole (see the screen list). **The
  code screen itself is not built: a closed account that reaches `/sign-in/register-key` today is sent back to the
  same page with no options (nothing registers, nothing opens; a dead end until item 3 is built).**

### What is green, and what is not known
- `apps/web/src/lib/auth/sign-in.db.test.ts`: **72 passed** on PostgreSQL 18 (20 of them new or restated). Seen
  failing first: the file did not load without `registration-code.ts`, then 14 failed on missing behaviour, with the
  type errors naming `webauthn`, `answerRegistrationCode`, `codeRequired` and `creation`. `registration-code.ts` (a
  pure helper the tests import) was written between those two runs; nothing else preceded its tests.
- **Added after the background run ended, on the tree committed as dde86284:** `pnpm typecheck` passed (24
  projects); `pnpm lint` 1,955 files, 0 errors, 0 warnings; `pnpm lint:logs` 1,206 files, every call allowlisted; the
  web's unit tests under `lib/auth` and `lib/routes/sign-in`: 10 files, 136 passed; **the web's database tests, all
  of `apps/web`: 61 files, 7,656 passed, 0 failed** (the route tests that sign in with a key included).
- **Still not run by W44:** `pnpm test:db` whole (the packages' and the worker's database tests) and the full local
  suite. W43's whole-suite result on e85c3b40 is in W43's block, if it was added.
- Tests restated, none skipped or loosened: the first key test's event is `hardware_key_registered:` (no purpose);
  SGN-17's "audit write fails" case is now "the registry's record fails": removed at the provider, the new line,
  `key_not_registered` (it threw before); SEC-20's hand-made key step carries an `assertion`.
- Numbers used: SGN-20, SGN-21, SGN-26, SGN-27 (the flow's cases). None other taken.

### Session open: the round trips (acceptance)
A password-and-code sign-in of an account that need not hold a key: **none added** (no statement changed but the
INSERT's column list). A key sign-in: **one read added** (`sign_in_hardware_keys`), as section 5 states, and nothing
else on the accepted path (the app's verification is local). A password-and-code sign-in of an account that must
hold a key: the same one read **replaces** the provider's network call. `resolveSession` is untouched.

### The exact next step
1. W43's item 3: the code screen and `routes/sign-in.ts` (the register-key page shows the code form
   when the sealed step has `codeRequired` and no `code`; a server action with a Zod schema calls
   `answerRegistrationCode`; the `registration_code` refusal keeps the step and the typed value is not echoed;
   `isRegistrationCodeShaped` is for the field's own message, before the database is asked).
2. W43's items 4 and 5 (cut B, none started): the four console routes, the removal of `signOutAtProviderAfterCommit`
   and the reset's `globalSignOut`, the two alarms swapped. Then item 6.

### Named points for the two reviews (W44 adds; W43's and W33's stand)
- **Auth review, a property of `hardware_key_registration_judge` the web works around:** called with no code for a
  closed account with a usable opening, it counts a try. `account_key_registration_closed` is granted to no role, so
  the web cannot ask "closed?" for free. The flow therefore reads closed from the registry's rows (any row and none
  live means every key was removed) and seals `codeRequired`, and answers the code screen without asking the
  database; reaching the screen counts no try (tested). **The one case it cannot see: a removal confirmed for an
  account that never had a key row** (closed, no rows). Its first visit to the register-key step asks `judge` with no
  code and, if an opening stands, spends one of the five tries. Small; a free "closed?" answer would need a grant,
  so it is recorded for the contract migration, not built.
- **Auth review:** `codeRequired` and `code` live in the sealed step, but nothing trusts them: `judge` runs before
  each provider call and `hardware_key_record` judges again under the lock (the forged-step test).
- **Auth review:** the cleaning skips a provider credential whose ID is not canonical base64url of 16 to 1,023 bytes
  (never deleted). Whether Cognito's `CredentialId` in `ListWebAuthnCredentials` is exactly the browser's `id` is
  unverified from here; if it is not, the cleaning deletes nothing (the safe side) and removed keys stay at the
  provider, where they still open nothing.
- **Auth review:** the cleaning measures "older than 15 minutes" from the attempt's start (the database's clock)
  against the provider's creation time: two clocks.
- **Auth review:** a registration that fails for a reason that is not a refusal (the database unreachable) now
  answers `key_not_registered` after removing the key, where the base threw; the error's class name is logged.
- **Not done, W43's item 6:** the relying-party tie (the web refusing to start when the pool's and the app's
  differ) and the infra test tying `KEY_USER_VERIFICATION_REQUIRED` to the pool's setting.

### For the UX and brand review: what a person sees that W44 changed
- **Sign-in, the register-key step, one new error text** (`MESSAGES.registration_code`, `routes/sign-in.ts`): "That
  code did not open registration. Check the code PaidWhole gave you and try again." The same words for no opening
  and a wrong code. A refusal keeps the step (the person may type again); a refresh keeps it too (the sealed cookie).
  **No screen shows it yet: the code form is not built.**
- A key sign-in with an unknown or removed key, or one the registry's check refuses: the existing wrong-credential
  words ("That did not match."), no new text. A key step sealed by the previous image: the existing restart.
- A code sign-in of an account whose registration is closed and that need not hold a key: the existing
  hardware-key-required page.
- No other screen, email or PDF changed.

### Machine notes
As W33's, below; `pnpm install --offline --frozen-lockfile` was needed once here for W43's new worker dependency.
W44 holds nothing else: no PR, no subagent, no scheduled task; one background check run that ends on its own.

## RESUME-BLOCK (2026-11-12, W43, session_019i9ifCCuiEbFzA2DZGJFA1): step 3 is cut in two; the JOB half is built; next is the WEB half

**WIP `co-001/wip-key-registry` e85c3b40** (one commit on 969ac389). No PR is open. No migration was touched. The
successor needs this block, W33's block below (the functions' signatures, the refusals' names, the lock order), the
note's sections 16, 2, 5 and 8, and the files named here. Step 3 was plainly more than one session; it was cut at the
handlers/job line (told to the orchestrator at the start).

### What W43 built (the job half)
- `apps/worker/src/platform/provider-sign-outs.ts`: `runProviderSignOuts`. One run: (1) claim one row, call the
  provider with no transaction open, record `done` or `failed` for the try it names, for 8 seconds; (2) the overdue
  sweep, the paging line `security event: provider sign-out not delivered` (`sign_out_id`, `user_id`, the cause's
  `request_id`, `error_code` LATE or GAVE_UP) written **before** `operator_provider_sign_out_reported`; (3)
  `operator_key_removals_expire`; (4) `operator_provider_sign_outs_expire`. Each step in its own try; the run throws
  `ProviderSignOutRunFailed` naming the failed steps after the others ran.
- `apps/worker/src/platform/cognito-sign-out.ts`: the adapter (`AdminUserGlobalSignOut`, 10 second abort,
  `UserNotFoundException` read as `no_such_user`) and development's twin (asks no one).
- `apps/worker/src/platform/hardware-key-notices.ts`: `sendHardwareKeyNotices`, the password notice's job re-pointed,
  plus one branch: a claim that answers `undelivered` (AddressChanged) sends nothing, logs it and commits.
- `packages/auth-mail/src/words.ts`: `HARDWARE_KEY_NOTICE_SUBJECTS`, `hardwareKeyNoticeLines` (three kinds).
- `apps/worker/src/jobs/platform.ts`: the two jobs `provider_sign_outs` and `hardware_key_notices`, each `* * * * *`,
  payload `z.strictObject({})`. `PlatformDependencies.providerSignOut` (absent: the job throws
  `NoProviderSignOutError`); `wiring.ts` always gives it.
- `apps/worker/src/config.ts`: `providerSignOut` from `COGNITO_USER_POOL_ID`, **required in production**;
  `infra/lib/constructs/compute.ts` sets it on the platform task. `apps/worker/package.json` gains
  `@aws-sdk/client-cognito-identity-provider` (the web's version; the lockfile gained three lines;
  `pnpm toolchain:check` and `pnpm actions:check` passed).
- Log fields added (`packages/observability/src/fields.ts`): `sign_out_id`, `outcome_code`, `hardware_key_notice_id`.
  `MAIL_LOG_CODES.keyNoticeUndelivered = 'KEY_NOTICE_UNDELIVERED'`, a seventh platform mail code with its metric filter
  and alarm (`infra/lib/mail.ts`, `monitoring.ts`). `infra/test/application-role.test.ts` scans the worker's adapter.
  `tools/screening-capacity/watched-paths.txt` regenerated by its own generator (three files more).

### What is green (on e85c3b40)
- `apps/worker/src/platform/provider-sign-outs.db.test.ts` (15) and `hardware-key-notices.db.test.ts` (10), with the
  platform's other database tests: 8 files, 76 passed, 1 skipped. Infra: 29 files, 816 passed. The worker's, the mail
  words', the log fields' and the tools' unit tests: 1,132 passed in the last run of the worker and the two tools.
  `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`: 0 errors.
- **`pnpm test:db`, whole, on e85c3b40 (PostgreSQL 18): 175 files, 10,397 passed, 1 skipped, 0 failed** (28 minutes). That is W33's 173 files and 10,372 tests plus the two new files' 25; W32's 26, the catalog test and the cross-tenant test are in it.
- Numbers used: **JOB-08** only (the worker's rows). JOB-06 and JOB-07 are the database's (W32's). None other taken.
- **Said plainly:** `provider-sign-outs.ts` was written before its tests (a slip against "tests first"). Its tests
  were then seen failing only where the job was not yet registered (`handlers.provider_sign_outs is not a function`)
  and on one wrong expectation of the test's own. The key-notice tests failed first on their own seeding and on one
  wrong assumption (a successful send counts no try), not for missing behaviour. The two reviews should weigh the
  tests on what they assert, not on having been red.

### Acceptance, as far as the job half goes
- **Idempotent and safe to retry (16.6):** proved by the tests: a crash after the claim, after the provider's answer,
  while `failed` is recorded, between the sweep's mark and its line, and between the line and its acknowledgement; a
  stale worker's `done` and `failed`; two overlapping runs; a failing expiry step. The call is at-least-once by design.
- **Session open: no round trip added.** W43 changed no file under `apps/web`; W33's count stands (none added).
- **Safe with the previous image running:** the job half adds two job types and reads nothing the previous image
  writes differently. Not verified by W43: what the previous worker image does with the two new schedules during a
  rollback (the rows wait in the outbox meanwhile, and the previous web image still calls the provider itself).
- Synthetic data only: every address is `@synthetic.test`, every subject and ID a random UUID.

### The exact next step: the web half (none of it started)
1. `apps/web/src/lib/auth/sign-in.ts`, tests first in `sign-in.db.test.ts` (SGN-21, SGN-26's flow cases, SGN-27, the
   flow's SGN-19): `authenticated()` reads `sign_in_hardware_keys` in place of `provider.hasHardwareKey`; the key
   sign-in's four steps of section 5 (well-formed response; live row or `sign_in_key_refused` plus the cleaning with
   the grant; the app's own assertion check with `@simplewebauthn/server`, which needs the challenge sealed at
   `beginKey` and the response passed down from `completeKey`; `openSession` with the digest and the
   `user_session_hardware_key_live` refusal answered as a stale session). Registration: `hardware_key_registration_judge`
   before `beginKeyRegistration` and before `completeKeyRegistration` asks the provider (decision 7 below W33's
   block), the app's own verification of the registration response for the public key, then `hardware_key_record`
   with the code's digest; a failure removes the key at the provider with the grant. The provider interface needs a
   way to list credentials with their creation time (the cleaning) in both `cognito-provider.ts` and `dev-provider.ts`.
2. `apps/web/src/lib/auth/sessions.ts`: `openSession` carries `key_credential_sha256`.
3. The code screen ("the code PaidWhole gave you", the same screen with or without an opening) and
   `apps/web/src/lib/routes/sign-in.ts`; the pending step carries the code's digest only after `judge` said `open`.
4. The four console routes (`console.request_key_removal`, `confirm`, `cancel`, `open_key_registration`) with
   `acting_session` from the request's resolved session, the one-time code made by the web (8 of 32 symbols,
   `crypto`), shown once, only its SHA-256 passed; the list from `hardware_key_removals()`; tests in
   `console-routes.db.test.ts`.
5. Remove `signOutAtProviderAfterCommit` (both End membership routes) and the reset's `provider.globalSignOut` call
   in `endedByReset`; their tests and the two web lines go; in `infra/lib/security-events.ts` the alarms
   `MembershipEndProviderSignOutFailed` and `PasswordResetProviderSignOutFailed` are replaced by
   `ProviderSignOutNotDelivered` on the **platform** log group (the words are `PROVIDER_SIGN_OUT_NOT_DELIVERED` in
   `provider-sign-outs.ts`; the existing reset alarms read the web log group, so this one is built like the mail-code
   alarms), plus the `removed hardware key used` alarm.
6. Then the note's later steps: the relying-party and user-verification ties, the e2e spec, ADR 0095, the test-matrix
   rows, the runbooks, the two reviews, the PR.

### Left open in the job half (small, each for the next session or a ruling)
- **The failed-try line has no cause `request_id`** (section 7 names one): `operator_provider_sign_out_claim()` does
  not return it and the migrations are closed. The line carries `sign_out_id` and `user_id`; the LATE and GAVE_UP
  lines carry the cause's request. Enough without a migration change, in W43's reading; the orchestrator may rule.
- Section 7 asks the build to confirm that the platform schedule's missed-run alarm covers `provider_sign_outs`: not
  checked.
- The worker's tests assert `operator_key_removals_expire` is called and that its failure stops nothing; they do not
  expire a real lapsed request (W32's database tests hold the function).
- No runbook text yet for `KEY_NOTICE_UNDELIVERED`; its alarm's words point at the incident runbook's hardware-key
  section, which step 6 writes.

### For the UX and brand review: what a person sees that W43 added (emails only; no screen changed)
Three emails, the `account` variant, no link, Reply-To the support address, the account footer, subject followed by
the product's name: "Your hardware keys were removed", "Registration of a new hardware key is open", "A new hardware
key was registered" (`packages/auth-mail/src/words.ts`, `hardwareKeyNoticeLines`). **The `removed` email departs from
section 7's words on purpose:** v3 (16.2) closed registration after a removal, so "the next sign-in ... then registers
a new key" would be untrue; it says support opens registration and gives a one-time code. One operator alarm text
(`KEY_NOTICE_UNDELIVERED`).

### Named points for the build's two reviews (W33's three stand, below; W43 adds)
- **Auth review:** the job trusts the adapter's reading of `UserNotFoundException` as `no_such_user`, which marks
  the row done with no sign-out; a pool ID that names the wrong pool would turn every row into that answer. The
  worker and the web take the pool from the same stack output; nothing checks it at start.
- **Auth review:** `removed`'s email tells the reader that support gives a one-time code. Whether an email should
  say that a code exists at all (it tells a mailbox thief what to ask support for) is a wording decision.
- **Database review:** the run's 8 seconds are counted from the first claim, and each call may take 10 seconds more;
  the operator pool has two connections and this job holds one for the run, as `password_notices` does.
- **Wording review:** the step-failed line's `error_code` is `<step>:<error name>` (for example `sign_outs:Crash`),
  a compound code where every other line carries one name.

### Machine notes
As W33's, below. W43 holds nothing else: no PR, no subagent, no scheduled task.

## The earlier block (2026-11-12, W33, session_019i9ifBTTYtTEJn5cydNmex): the database half; still the reference for the functions, refusals, lock order and measurements

**WIP `co-001/wip-key-registry` 969ac389** (the base 1f652b6f, #156 included, merged in). No PR is open. The successor
needs this block, the note (`designs/lane-a-key-registry.md` v3; section 16 rules) and the files named here.

### What exists
- **Migrations, created by the co-founder's typed `/new-migration key_registry` and `key_registry_validate` in W33's
  session (2026-11-12):** `packages/db/migrations/20261115090000_key_registry.sql` and
  `20261115091000_key_registry_validate.sql`. They sort after #156's `20261114090000`. Applied nowhere but local
  scratch databases. **Any further change to either file needs the co-founder's command again** (the hook's marker).
- **Tables:** `hardware_key`, `hardware_key_removal`, `hardware_key_notice`, `provider_sign_out` (no `practice_id`;
  FORCE ROW LEVEL SECURITY, one policy for `tp_owner`, no privilege for `tp_app` or `tp_operator`);
  `user_session.key_credential_sha256` (insertable by `tp_app`); `mail_send`'s two kind CHECKs admit
  `hardware_keys_removed`.
- **Functions for the web (`tp_app`), signatures exact:** `hardware_key_record(new_credential bytea, new_public_key
  bytea, code_sha256 bytea, began timestamptz, request text) -> (key_id, first_after_removal)`;
  `hardware_key_registration_judge(code_sha256, began, request) -> text` (`not_closed` | `open` | `refused`);
  `sign_in_hardware_keys(target_user) -> (credential_sha256, public_key, removed)`;
  `sign_in_key_refused(target_user, why, request)` (`not_registered` | `removed` | `assertion` | `malformed`);
  `hardware_key_removal_request(target_user, acting_session, request) -> uuid`;
  `hardware_key_removal_confirm(removal, acting_session, request) -> (keys_removed, sessions_ended)`;
  `hardware_key_removal_cancel(removal, acting_session, request) -> boolean`;
  `hardware_key_removals() -> (removal_id, user_id, requested_by, requested_at, expires_at, state, decided_by,
  decided_at, live_keys, registration_open_until, registration_closed)`;
  `hardware_key_registration_open(removal, acting_session, code_sha256, request) -> timestamptz`.
- **For the jobs (`tp_operator`):** `operator_provider_sign_out_claim() -> (sign_out_id, account_id, subject, try)`,
  `_done(sign_out, try, outcome, request) -> boolean` (`signed_out` | `no_such_user`), `_failed(sign_out, try,
  error_name, request)`, `operator_provider_sign_outs_overdue(request) -> (sign_out_id, account_id,
  cause_request_id, code)` (`LATE` | `GAVE_UP`), `operator_provider_sign_out_reported(sign_out, code)`,
  `operator_provider_sign_outs_expire(at_most)`, `operator_key_removals_expire(at_most, request)`;
  `operator_key_notices_stale(at_most, request)`, `operator_key_notices_due(at_most)`,
  `operator_key_notice_claim(notice) -> (user_id, email, kind, event_at, undelivered)`,
  `operator_key_notice_sent(notice, message_id, request)`, `operator_key_notice_failed(notice, error_name, permanent,
  request)`. `operator_record_mail_event` and `operator_mail_expire` replaced in place (signatures unchanged).
- **Refusals the handlers map to words (SQLSTATE 23514 with this constraint name unless said):**
  `hardware_key_sign_in_not_before`, `hardware_key_one_live`, `hardware_key_credential_once` (23505),
  `hardware_key_registration_closed`, `hardware_key_removal_not_own_account`, `hardware_key_removal_open_once`
  (23505), `hardware_key_removal_two_people`, `hardware_key_removal_in_time`, `hardware_key_removal_decided`,
  `hardware_key_removal_requester_left`, `hardware_key_registration_not_closed`,
  `hardware_key_registration_open_once`, `hardware_key_removal_target_acts`, `user_session_hardware_key_live`,
  `user_session_key_registration_closed`, `user_session_key_digest`, `membership_ended_is_recorded_by_the_end`; not
  a platform administrator seven days in the role with a fresh key session: 42501; no such account or removal: P0002.
- **Also changed:** the Drizzle schema (`packages/db/src/schema/identity.ts`, `operations.ts`, `index.ts`: the four
  tables, the column, `MAIL_KINDS`), `packages/db/domain-model/areas.json`, `cross-check.ts` (the bytea custom type),
  and the regenerated `docs/product/domain-model.md` and `packages/db/functions` (35 files written). **The approval
  line is blank.** A later migration edit or schema change means regenerating again.

### What is green
- `pnpm test:db`, whole, on PostgreSQL 18: **173 files, 10,372 passed, 1 skipped, 0 failed** (30 minutes here; give
  it a budget over 25). That includes W32's 26, the catalog test and the cross-tenant test (both read the live
  catalog, so the four tables are covered), `pnpm db:domain-model --check`, `pnpm typecheck` and `pnpm lint`.
- **Tests changed, each to state the new truth, none skipped or loosened:**
  - `packages/db/src/key-registry.db.test.ts`: SGN-23's seeded stale session moves `expires_at` with `started_at`.
  - `packages/db/src/sign-in-not-before.db.test.ts` (ADR 0093 D4, the orchestrator's ruling of 06:55 UTC): "does not
    check a row with no start" stays; "nor locks" became what is locked (FOR NO KEY UPDATE: a second taker is refused,
    a key-share lock passes), until the transaction's end.
  - `packages/db/src/password-notice.db.test.ts`: the mail recorder's live body is 20261111090000's with exactly
    three additions. `hardening.db.test.ts` and `migrate.db.test.ts`: the reserved actions and the table list.
  - `apps/web/src/lib/auth/sign-in.db.test.ts`, SGN-19's two cases ("open until Queues item 37"): the step begun
    before End membership is now refused (`step_before_reset_mfa`, `step_before_reset_register_key`).

### Measured (step C; synthetic rows: 1,000,000 `audit_event`, 1,000,000 `mail_send`, 200,000 `user_session`)
- **File 1, whole, quiet database: 107 and 127 ms** (two runs); its five table locks are held for less than that.
  The note's bound (well under a second) holds. Beside a transaction that had read `user_session` and written
  `audit_event` and stayed open 4 s: applied 4.1 s after it started (it retried each second, NOWAIT), and a read of
  `user_session` plus a write of `audit_event` made meanwhile took 54 ms: nothing queued behind the migration.
- **File 2: 649 ms whole** (72, 424 and 324 ms a validation; SHARE UPDATE EXCLUSIVE); an insert into `mail_send`
  during a validation took 47 ms.
- **The session-open path: no round trip added** (no application statement changed; the check rides the session's
  INSERT in the trigger). One session insert with a start, alone: 1.03 ms before, 1.05 ms after. Eight in parallel
  for ONE account: 5.6 ms before, 6.4 ms after (they already queued on the account's row since ADR 0093). The
  previous image's insert (no start), eight in parallel for one account: 1.9 ms before, 5.8 ms after: it now queues
  on the same row, which is the ruling's point 3. No bound of the note is broken.
- **No deadlock:** 20 s, 12 clients, one target account: session inserts, End membership, a recorded reset, removal
  requests and confirmations mixed: 24,757 transactions, 0 failed, **0 deadlocks**, 1,426 removals confirmed, and no
  open session begun at or before the mark. **The lock order, for the note and ADR 0095:** a membership row (End
  membership only), then the account's `"user"` row (FOR NO KEY UPDATE), then the removal row, then key rows, then
  session rows, then outbox and notice rows. No path takes the account's row and then a membership row; the
  confirmation reads `membership` without a lock and locks only the target's account, never an administrator's.

### Decisions the migration takes beyond the note (each to be said in ADR 0095 and the PR)
1. `hardware_key_removal.address_sha256` (SHA-256 of the removal's ID, a colon, the lower-cased address at the
   request): the note's `"user".updated_at` moves with every sign-in and with the confirmation itself, so it cannot
   say whether the address changed. The notice's claim compares the digest and fails the notice as `AddressChanged`
   (reported; the row returned has no address and `undelivered = true`: the job logs it and commits).
2. `hardware_key_notice.event_at`, not `removed_at` (two of three kinds are not removals).
3. `operator_mail_expire` replaced in place so key notices expire (the note gave the column and no reader).
4. `hardware_key_removals()` asks `organization.manage`, not the seven days: a new administrator sees the list.
5. Two more helpers granted to no role: `hardware_key_opening_usable(uuid, timestamptz)`,
   `hardware_key_notice_report_undelivered(uuid, text)`. Code digests are compared after a second SHA-256 each side.
6. `operator_record_mail_event` keeps its seven columns: an undelivered key notice is on the audit log
   (`hardware_key_notice_undelivered`), not in a result column.
7. `hardware_key_record` raises on a wrong code, so it counts no try; only `judge` counts. **The flow must call
   `hardware_key_registration_judge` first** and pass the digest on only after `open`.
8. `provider_signed_out` does not record which outcome (`signed_out` or `no_such_user`); the job's log line should.

### Named points for the build's two reviews
- **Auth review (the ruling's point 4):** every session insert now takes the account's row, the previous image's
  included, which ADR 0093 D4 had left unlocked on purpose ("it would then always land after the reset, never
  swept"). What D4 protected still holds for the new image (its inserts carry a start and are refused after the
  mark). For the previous image's no-start insert during a deploy or a rollback, the lock makes "lands after the
  reset, unswept" certain where it was a matter of timing; against that, a removal's confirmation now always sees
  or refuses it. ADR 0095 needs the dated section amending D4 that says so, and "What the founder should know"
  a line (ADR 0093 was approved with #142).
- **Auth review:** `hardware_key_record` is an uncounted check of a code digest for whoever holds the application
  role (decision 7); the 40 bits and the hour bound it.
- **Database review:** `membership_removal_target_holds` holds while a request is `requested`, including one past
  its 24 hours that the job has not yet marked expired (at most a minute).

### What is left of item 37 (the note's steps 3 to 7; none started)
The handlers and `sign-in.ts` plumbing; the four console routes; the code screen; the worker's `provider_sign_outs`
and `hardware_key_notices` jobs and the sign-out adapter; removing `signOutAtProviderAfterCommit` and the reset's
call; the rest of the tests (SGN-21, SGN-22, SGN-26, the flow's SGN-19 and SGN-27, the notice's five functions,
JOB-08, the migration's own preflight and lock-loop tests); the two build reviews; ADR 0095; the test-matrix rows;
the runbooks; the PR with `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs
list` and the approval line posted as a suggestion, never written.

### Machine notes
PostgreSQL 18 stops when the container sleeps: `cd / && runuser -u postgres -- /opt/pg18/bin/pg_ctl -D
/root/pgdata18 -l /root/pgdata18/server.log -w start -o "-p 5433 -k /tmp"`. Database tests:
`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db <files>`.
One slip, corrected at once and told: W33's first marker trap used a relative path after a `cd`, so the marker
outlived one command; nothing but W33's own rename was written while it stood. Use an absolute path in the trap.
**W33 holds nothing else:** no PR, no subagent, no scheduled task; its scratch databases and files are disposable.

## The earlier block (2026-11-12, W32, session_019i9ifC7PLenwLnTRu7ZVhZ; handed over at about 240k tokens)

- **Brief:** build item 37 from the note; the orchestrator's brief of 2026-11-12 06:20 UTC (steps 1 to 7) stands for
  the successor. Rulings: Q1 yes, Q3 yes; Q2 is the founder's. No PR until the orchestrator says #156 has merged.
- **The note:** `designs/lane-a-key-registry.md` **v3** (build-ops 83be44b6 or later). **Section 16 rules** where it
  differs from sections 2 to 14: one live key an account; registration after a removal closed until opened with a
  one-time code; a code session of a closed account refused in Postgres; the target of an open request changes no
  internal membership; the acting session as an argument (`actor_key_session`); the outbox's late and given-up arms.
- **Step 1, done:** `reviews/lane-a-key-registry-review-delta1.md` (R1 to R11; two blocking, both taken; it ran no
  SQL). Every finding verified and placed in section 16's table. No second round on the note. To the queue from it: a
  backup key from inside a session; an operator retry of a given-up sign-out; a second person for End membership in
  the internal organization; seven days measured on the person's key, not the membership row.
- **Step 2, half done. WIP `co-001/wip-key-registry` c0c43f2d** (base 93e137f9), two files, failing first (26 tests,
  each because the objects do not exist; type-check and lint clean):
  - `packages/db/src/key-registry.db.test.ts`: SEC-25, SEC-26, SEC-27, SGN-20, SGN-23, SGN-24, SGN-25, SGN-27.
  - `packages/db/src/provider-sign-out.db.test.ts`: JOB-06, JOB-07, SGN-19's database rows.
  They fix the names the migration must use: the function signatures (SEC-25's table, including the three helpers
  `account_removes_keys(uuid)`, `actor_key_session(uuid)`, `account_key_registration_closed(uuid)` and the two
  finality functions `hardware_key_is_final()` and `hardware_key_removal_is_final()`), and every constraint name.
  They were never run against a migration: expect to adjust details (for example `wait_minutes` after a claim).
- **BLOCKED: the migration.** `/new-migration` cannot be run by a session (the skill is for a person's typed command
  only; the hook refuses any write under `packages/db/migrations` without its marker). Told to the orchestrator
  2026-11-12. It needs the co-founder to type `/new-migration key_registry` in the building session, or their word
  there. No migration file, marker or draft SQL exists anywhere. Nobody routes around it.
- **Not started:** the rest of step 2's tests (SEC-25's lists in `catalog`, `cross-tenant`, `migrate.db.test.ts` and
  `hardening.db.test.ts`; SGN-21, SGN-22, SGN-26 and the flow's SGN-19 and SGN-27 in `sign-in.db.test.ts`; the
  notice's five functions; JOB-08; the migration tests); steps 3 to 7 entire (handlers, the four console routes, the
  flow's own assertion check and the code screen, the worker's two jobs and adapter, the measurements, the domain
  model, the two build reviews, ADR 0095, the test-matrix rows, the runbooks, the PR description).
- **What does not need the migration, for the successor to start on:** `sign-in.ts` plumbing (the challenge sealed at
  `beginKey`, the response passed to `authenticated()`, the app's own assertion and registration verification, the
  relying-party check), the dev provider twin's listing and deleting of credentials, the worker's sign-out adapter
  and job with fakes, the removal of `signOutAtProviderAfterCommit` and the reset's call.
- **Machine notes:** PostgreSQL 18 answers on `localhost:5433` and the `/tmp` socket, not `/var/run/postgresql`; run
  database tests with `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db
  <file>`. The setup script moves the checkout to `claude/build-platform`: check out the WIP branch after it.
- **Numbers:** ADR 0095; SGN-20 to SGN-27; SEC-25 to SEC-27; JOB-06 to JOB-08. None released, none added.
- **For "What the founder should know" (to carry into the PR text):** a rollback leaves staff unable to sign in until
  roll-forward; staff re-register keys once at deploy, and no removal is possible until two administrators have;
  Q2 (at least three platform administrators, each seven days in the role); after a removal the member needs a
  one-time code from an administrator, by voice, to register the next key; one key an account for now.
- **W32 holds nothing else:** no PR, no open subagent, no scheduled task.
