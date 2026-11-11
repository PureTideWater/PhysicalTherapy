`LANES.md` Queues item 28: a sign-in step begun before a password reset is refused after it. The next schema PR after password-changed-notice; required before launch. Held by W8 (Lane A, https://claude.ai/code/session_019i9ifE7teUhX79iAZKaxt5) from 2026-11-11 05:48 UTC for the design. **W8 stood down on 2026-11-11 at 07:25 UTC, on the orchestrator's ruling of 07:14 UTC (its context had passed 300k tokens): the build goes to a fresh session at the default effort, from this RESUME-BLOCK. Nothing of the build exists yet.**

W9 (Lane A, https://claude.ai/code/session_019i9ifBKxrX229x23BggpZK) holds this item from 2026-11-11, taking it over from W8 in a fresh context (the orchestrator's assignment). It also holds password-changed-notice's merge step once W6 has posted its approval line.

## RESUME-BLOCK: step-before-reset, W9, 2026-11-11 09:20 UTC (built and reviewed; waits for #140 to merge)
- **Heads:** WIP ref `co-001/wip-step-before-reset` = **47c99ac7** (everything committed; the worktree is clean):
  the build (f5d1c05e), review rounds one (79c98137), two (1a6b2e8b) and three (47c99ac7). Worktree
  `/home/user/step-before-reset` (disposable), branch `co-001/step-before-reset`. No PR yet. Still stacked on ffa44ea9;
  #140's head is 7da699b1 (one test-only commit more), taken with the base merge.
- **The full local suite ran once, on 1a6b2e8b: every step exit 0** (typecheck, lint, lint:copy, lint:logs,
  check:fixtures, synth, verify-content, domain model --check --strict; unit 13,376 passed and 4 skipped; infra;
  golden; oracle; db in four shards 10,202 passed and 1 skipped; build; e2e 87 passed). After it, round three changed
  three lines of `unlock_user()`, one console sentence, the runbook and one test: its three touched test files pass
  (106), lint:copy passes. CI is the suite of record for the rest.
- **Reviews** (`lane-a-wip/step-before-reset/`): the build, `build-review-security.md` (1 blocking, 4 should-fix) and
  `build-review-database.md` (0, 2), rulings `build-rulings.md`; round one's delta, `fix-delta-review.md` (1 blocking:
  the ordinary unlock undid the key lock; 4 should-fix), fixed in round two; round two's delta with the console's one
  new sentence, `fix-delta-review-2.md` (1 blocking: `unlock_user()` read the hold before taking the row; 2
  should-fix: the sentence, the runbook's clear), fixed in round three exactly as the review specified, with a
  two-session test. Round three has no review of its own: three lines the review wrote, proven by that test.
- **Next:** when #140 has merged: merge `claude/build-platform` into the branch, regenerate the domain model and
  functions on a fresh database, the targeted checks, push `co-001/step-before-reset`, open the draft PR with
  `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`, fill the template,
  post the approval line as a suggestion on the document's last line (`gh api .../pulls/<n>/comments`), one line to
  the orchestrator with the comment's link and the founder's decisions; merge after the founder's committed line and
  green required checks; stand down.
- **For the PR description (the founder reads these):** W8's three (the rule holds only once the Cognito client is
  confidential, ADR 0088's second release; the deploy needs a moment with no reconcile queued or running; the
  provider's behaviour on a repeated confirm is unproven without a pool); the migration also replaces `unlock_user()`
  (a hold until the owner records `key_across_reset_cleared`) and adds `sign_in_lock_key_across_reset()`; a key not
  removed locks the account and only the founder's break-glass clears it until Queues item 29; `tp_app` can place
  that hold on any account that has reset (the same trust as ten `sign_in_failed`); a crossed account is now refused
  at sign-in; one new sentence in the console; unverified without a pool: DeleteWebAuthnCredential after a global
  sign-out, the confirm's error names.
- **Handed on, for the orchestrator's queue:** W8's four (below); a job that records a reset whose transaction failed
  twice until it commits; `PasswordHistoryPolicyViolationException` and `UserNotConfirmedException` on the confirm
  still throw as the platform's failure; the other provider methods rethrow the SDK's error whole.
- **#140's merge step:** subscribed; head 7da699b1 green but for `domain model` (the blank line) at 09:02 UTC; no
  suggestion committed yet. A check-in is set for 09:53 UTC. Merge only after the founder's committed line and green
  required checks, the base merged first if it moved; record it in `lane-a-auth-emails-status.md`; one line to the
  orchestrator.
- **Token rule from the orchestrator (09:01 UTC):** at most two subagents at a time, each with a named scope, about
  20 tool calls and a report file.

## W8's RESUME-BLOCK (2026-11-11 07:25 UTC), kept for its notes

### Where things stand
- **Done:** both cases reproduced on the provider twin; the design, reviewed twice adversarially (sign-in and session
  security; database), every finding checked and ruled, now **v2**; a migration draft and a code-level spec for the
  web's flow, neither run. **Not done:** the whole build, its reviews, the PR.
- **Heads.** WIP ref `co-001/wip-step-before-reset` = **238e6c64**: password-changed-notice's fix round (ffa44ea9, the
  base 2e26a416 an ancestor) merged into one commit, fadadf4b, which adds
  `apps/web/src/lib/auth/step-before-reset.repro.db.test.ts` (the two cases, 2 of 2 passing on the tree before the
  close; reproduction only: it is deleted when the cases flip). The branch `co-001/step-before-reset` is not on
  origin; cut it from the WIP ref. No PR, no subscription, no check-in scheduled. No migration is placed and no source
  file is changed. W8's worktree and scratch files were on its own machine and are gone; everything kept is on
  `claude/build-ops`.
- **Counters:** ADR 0093; test-matrix SGN-17 (the rule) and SGN-18 (a reset whose answer from the provider was lost);
  migration `20261112090000_sign_in_not_before.sql`. No synth module, no fixture release.

### Read, in this order
1. `designs/lane-a-step-before-reset.md`: design v2, the decision of record (the rule; D1 to D12; alternatives; known
   limits; staging checks; what is handed on; three questions for the build's reviews).
2. `approval-summaries/lane-a-wip/step-before-reset/build-plan.md`: how to build it (the contract between the parts,
   the files of each part, the tests, what is not yet decided).
3. `.../build-F-spec.md`: the web flow, method by method.
4. `.../migration-draft-20261112090000_sign_in_not_before.sql`: the migration, drafted from v2, never run.
5. `.../design-rulings.md` with `design-review-security.md` and `design-review-database.md`: what the reviews found
   and why v2 is as it is. `.../dbreview-scripts/`: the database review's scripts (lock orders, the deadlock, the
   guards, the driver round trip), models for the concurrency tests.

### The build order, and the files each part touches (details in the build plan)
1. **The database** (first): `packages/db/migrations/20261112090000_sign_in_not_before.sql` (only by the new-migration
   skill's marker route), `packages/db/src/schema/tenancy.ts` and `schema/identity.ts`,
   `packages/db/src/sign-in-not-before.db.test.ts` (new, written to fail first), and the generated
   `docs/product/domain-model.md` and five files in `packages/db/functions/`. Two nullable columns, five functions, two
   triggers, one column grant; no policy changes; no PHI, ledger, rule or pricing table.
2. **Infra and the records** (any time): `infra/lib/security-events.ts`, `infra/test/monitoring.test.ts` (three counted
   lines, nine becoming twelve); `docs/adr/0093-*.md` (new) and dated amendments to ADR 0081 and ADR 0091;
   `docs/product/sessions.md`; `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts`,
   `fixtures/synthetic/SGN-17` and `SGN-18`; `docs/runbooks/incident-response.md` and `deploy-and-rollback.md`.
3. **The web's flow** (after the database): `apps/web/src/lib/auth/{sign-in.ts,sessions.ts,provider.ts,
   dev-provider.ts,cognito-provider.ts}`, `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/server/services.ts`,
   their tests, every test under `apps/web/src/lib` that calls `openSession(` (about 35 files),
   `apps/web/e2e/sign-in.spec.ts`; the reproduction file is deleted.
4. The suite once; two adversarial reviews of the build (sign-in and session security; database); the fix round with
   a review of its delta. After password-changed-notice merges: merge the base, regenerate the domain model, open the
   draft PR with `pnpm db:domain-model --summary-since <base>`, post the approval line as a suggested change in one
   pull-request comment, one line to the orchestrator with its link. Merge after the founder's committed line and
   green required checks.

### The two SGN-16 residual tests to flip
In `apps/web/src/lib/auth/sign-in.db.test.ts`, both passing today, both titled "SGN-16, open residual (ADR 0091 D10):
...": (1) "a step that proved the old password before a reset still opens a session when its code is answered after
the reset ..."; (2) "a key-registration step begun before a reset still registers a key after it when the provider's
sign-out had no effect ...". After the close: (1) is refused before the provider is asked, opens no session and
writes one `security_event`; (2) is refused at the options and at the verify, and the twin's store holds no key.

### Every ruled finding, and where design v2 answers it
All 22 findings were checked against the code or an experiment; all are real. The reasons are in `design-rulings.md`.

| Finding | Where v2 answers it |
| --- | --- |
| SEC-D1 (blocking while the Cognito client is public): the same moves made at Cognito directly bypass the app | Not closable here. Section 2 states the scope and names ADR 0088's second release as a precondition; section 5. **For the PR description** |
| SEC-D2: the reset marks the address's account, the step is judged on the subject's | D5 judges both accounts; section 5 (the crossed state); section 7 item 1 (handed on: Schema PR 6) |
| SEC-D3: a key registered across the reset is neither removed nor reported | D6 (a second check after the provider registered it; removed or reported, counted and paged) |
| SEC-D4: a refusal is neither counted nor audited | D5: the check and the `security_event` record are one database function; a counted line and alarm |
| SEC-D5: a stale code step still counts failures and uses up codes | D5's table: `answerTotp` is refused before the provider is asked; never `completeKey` (an enumeration leak) |
| SEC-D6: the clock's margin and wording; a guard | D3 (about one provider round trip, 10 ms); D4 (a start ahead of the clock is refused); sections 4, 5 and 6 |
| SEC-D7: more completed resets record nothing, one through the SDK's retry | Section 5; D9 (the orchestrator's ruling: one attempt; an unknown outcome; SGN-18) |
| SEC-D8: where the check sits | D5's table (after the account is found, not disabled, not locked; after ADR 0088's checks) |
| SEC-D9: a rolling deploy is not "once"; lock a row with no start | D8; D4 (the lock is NOT taken for a row with no start, and why) |
| SEC-D10: the words | D7 (no new words; the e2e uses a second browser context) |
| SEC-D11: "set a password" overstates the rule | Section 2 says "replaces a temporary password"; section 6 (the two-code staging check) |
| DB-D1 (blocking): v1 added lock cycles | D2: the account's row first, in `openSession` and in the reset's transaction (`sign_in_lock_account()`) |
| DB-D2: the migration's lock on `"user"` is refused by any open transaction that touched it | D10: what refuses a try, when to deploy; a test of the loop |
| DB-D3: at REPEATABLE READ the mark moves and a session stays live | D1 step 1 and D5: both functions refuse outside READ COMMITTED |
| DB-D4: a start ahead of the clock passes for good | D4 and D5 |
| DB-D5, DB-D6: two false sentences in v1 | Struck (D1, D4) |
| DB-D7: the sequence alternative's reasons | Section 4, reworded; the replication claim marked unverified |
| DB-D8: a mark ahead of the clock; the function's snapshot; a NULL start | Section 5 and the runbook; D5 |
| DB-D9: a policy change would need its own lock | None in v2 |
| DB-D10: what the build updates | The build plan, part D |
| DB-D11: `resolve_session()` against `revokeDevice` deadlocks on the base | Outside this change: section 7 item 2 |

### What is verified, and what is not
- **Verified by experiment** (the database review, on PostgreSQL 18, against a control): both lock orders of D4; the
  insert re-reads the mark after waiting; the sweep sees a just-committed session; the guard admits only the account's
  own event; the start survives node-postgres exactly; the lock set of D10 is right and rewrites nothing; with the
  account's row first, the stress run had 1 deadlock (one the base already has) against 74.
- **Not verified:** the migration draft and the flow spec were never run. Nothing about Cognito (no pool): the staging
  checks are design section 6.

### Not yet decided (the build plan, section 6, has all eight)
Whether an unknown outcome pages and whether ending the sessions on an unproved code is the right trade (the design
says yes to both; the orchestrator asked that the build's reviewers weigh it); the rule for "the provider answered and
changed nothing"; what to do when a key's removal fails; and five build-level choices. If the build's reviewers say
the lost-answer close must be its own PR, tell the orchestrator in one line.

### Handed on, for the orchestrator's queue (none blocks this item)
1. The reset resolves its account by the typed address; resolve it by the provider's subject, or detect a crossed
   state and page (Schema PR 6, sign-in identity).
2. `resolve_session()` and `revokeDevice` deadlock two ways on the base; one statement closes it (the database review,
   DB-D11).
3. Once no image before this release can run: a migration that refuses a session with no start.
4. The other provider calls the SDK repeats (a code answer, a key registration).

### Notes for the machine
- The PostgreSQL servers the container setup starts were not running when W8's session began; running the setup
  script again started them. Local db tests need `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`.
- The pre-push secret scan refuses a test constant named for a password with a high-entropy value: name such constants
  for their role, or reuse `sign-in.db.test.ts`'s.
- A merge commit made by `git merge --no-edit` has no trailer: amend it before it is pushed.

## Decisions (W8's, under the standing instruction; the reasons are in the design and the rulings)
- The mark is a time on the database's clock (`"user".sign_in_not_before`), compared with the attempt's start read
  from the same clock; not a counter, a sequence, the web's clock or Cognito's `auth_time`.
- The database refuses a stale session itself (a trigger on `user_session` under the account's row lock), and the
  reset's trigger sweeps sessions after taking that lock, so a sign-in racing the reset is either ended or refused.
- The account's row is locked first in both transactions; a refusal is a recorded security event and a counted line;
  a stale code step is refused before the provider is asked, a key step never before a valid assertion; both the
  address's and the subject's account are judged; a key registered across the reset is removed or reported.
- The `reset` step is not checked (it holds no proof). No new words on any screen.
- By the orchestrator's ruling (06:49 UTC): one attempt for `ConfirmForgotPassword`; an unknown outcome is never told
  as a wrong code, ends the sessions, moves the mark, queues no email and pages.

## Log (UTC, 2026-11-11)
- 05:48: assigned. 06:07: both cases reproduced on the twin at 68895f0f. 06:12: design v1; two reviews started.
- 06:13: ADR 0093 and SGN-17 allocated. 06:45: the security review returned (1 blocking while the client is public, 4
  should-fix, 6 notes). 06:49: the orchestrator ruled the lost-answer close into this PR; 06:51: SGN-18.
- 06:58: password-changed-notice's fix round pushed (ffa44ea9). 07:00: the database review returned (1 blocking, 3
  should-fix, 7 notes). 07:05: rulings and design v2; restacked on ffa44ea9 (238e6c64).
- 07:10: two builders started (the database; infra and the records); 07:14: the orchestrator ruled the build to a
  fresh session; both builders stopped having changed nothing (their scratch database dropped, the second worktree
  removed). 07:25: this RESUME-BLOCK; W8 stood down.
