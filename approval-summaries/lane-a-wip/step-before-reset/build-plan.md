# Build plan for `co-001/step-before-reset` (Queues item 28), for a session with none of W8's context

W8, 2026-11-11 07:20 UTC. Nothing of the build exists yet: no migration is placed, no source file is changed. Read
`designs/lane-a-step-before-reset.md` (design v2, reviewed) first; this file is how to build it. The design decides;
where this file and the design differ, the design wins.

Counters (allocated by the orchestrator): **ADR 0093**; **SGN-17** (the rule); **SGN-18** (a reset whose answer from
the provider was lost). Migration **`20261112090000_sign_in_not_before.sql`**. No synth module, no fixture release.

## 0. Before building
- Branch `co-001/step-before-reset` is not on origin. Start from the WIP ref: `git fetch origin
  co-001/wip-step-before-reset && git worktree add -b co-001/step-before-reset <dir> FETCH_HEAD`. It is **238e6c64** =
  password-changed-notice's fix round (ffa44ea9) merged into one commit (fadadf4b) that adds
  `apps/web/src/lib/auth/step-before-reset.repro.db.test.ts` (both cases reproduced; it goes when the cases flip).
- password-changed-notice may gain one more small commit (W6 names it): merge its head again before building. Never
  rebase or force the WIP ref; push it with `git push origin co-001/step-before-reset:refs/heads/co-001/wip-step-before-reset`.
- Local db tests: `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`. If the local PostgreSQL is not
  running, run the container setup script again (it starts both servers).
- The secret scan refuses a test constant named for a password with a high-entropy value: reuse
  `sign-in.db.test.ts`'s constants, or name a constant for its role.

## 1. The contract between the three parts (do not rename)
- Columns: `"user".sign_in_not_before timestamptz` and `user_session.sign_in_began_at timestamptz`, both nullable;
  `GRANT INSERT (sign_in_began_at) ON user_session TO tp_app`.
- `sign_in_step_began() RETURNS timestamptz` (whole milliseconds; invoker; EXECUTE to `tp_app`).
- `sign_in_lock_account() RETURNS void` (definer; the acting account's own row, FOR NO KEY UPDATE; 42501 with no actor
  or no row; EXECUTE to `tp_app`).
- `sign_in_step_refused(target_user uuid, began timestamptz, step text, request text) RETURNS boolean` (definer,
  volatile; steps `new_password`, `mfa_setup`, `mfa`, `key`, `register_key`, `key_registered`; when the start is at or
  before the mark it writes an `audit_event` row: actor_kind `system`, action `security_event`, object_type `user`,
  object_id the account, purpose `step_before_reset_<step>` or, for `key_registered`, `key_registered_across_reset`).
- Trigger `audit_event_sign_in_not_before` AFTER INSERT ON `audit_event`, WHEN `NEW.action IN
  ('password_reset_completed', 'password_reset_outcome_unknown') AND NEW.actor_kind = 'user' AND NEW.object_type =
  'user' AND NEW.object_id = NEW.actor_id`.
- Trigger `user_session_sign_in_not_before` BEFORE INSERT ON `user_session`; its refusal is SQLSTATE 23514 with
  constraint name `user_session_sign_in_not_before`.
- The web's audit action for an unknown outcome: `password_reset_outcome_unknown`, purpose `unverified_code`.
- Log lines, word for word (IDs only):
  1. `security event: sign-in step refused after a password reset` (warn; `user_id`, `request_id`, the step in
     `error_code`). Metric `SignInStepRefusedAfterReset`, narrowed to `new_password`, `mfa_setup`, `mfa`,
     `register_key` (not `key`), 1 in 300 s.
  2. `security event: hardware key registered across a password reset` (error; `error_code` `removed` or
     `not_removed`). Metric `HardwareKeyRegisteredAcrossReset`, 1 in 300 s.
  3. `security event: password reset outcome unknown` (error; `user_id` or null; `error_code` the provider error's
     name). Metric `PasswordResetOutcomeUnknown`, 1 in 300 s.

## 2. Part D, the database (first; the other parts' db tests need it)
The draft, written from design v2 and not yet run: `migration-draft-20261112090000_sign_in_not_before.sql` in this
folder. Review it against the design, then place it only by the new-migration skill's marker route: one shell command
that sets `.claude/.allow-protected-edit`, copies the file into `packages/db/migrations/` and removes the marker in a
trap; never Edit or Write there; check the marker is gone.

Files: `packages/db/migrations/20261112090000_sign_in_not_before.sql` (new); `packages/db/src/schema/tenancy.ts`
(`signInNotBefore`) and `schema/identity.ts` (`signInBeganAt`); `packages/db/src/sign-in-not-before.db.test.ts` (new);
`docs/product/domain-model.md` and five new files in `packages/db/functions/` (generated: `pnpm db:domain-model --out
--strict` on a freshly migrated database; never the approval line, never `approvers.json`). The database review found
no list to change in `catalog.ts`, `catalog.db.test.ts`, `cross-tenant.db.test.ts`, `hardening.db.test.ts` or
`migrate.db.test.ts`'s table list, and no area or explanation to add; check again, since v2 has five functions, not
four, and writes `security_event` rows with new purposes (grep for any closed list of those purposes).

Tests (design D11, "Database"), written to fail before the migration is placed: the stamp for each action and every
arm of the guard; GREATEST; the sweep; REPEATABLE READ refused (0A000) in the trigger and in `sign_in_step_refused`;
the insert trigger (no start passes and takes no lock; after the mark passes; at it, before it, ahead of the clock and
`'infinity'` refused by name); both lock orders with two connections; the three-connection cycle (with
`sign_in_lock_account()` first in both transactions all three finish; without the two calls the wait graph closes);
`sign_in_lock_account`; every answer of `sign_in_step_refused` and the row it writes or does not; grants, owners,
definer or invoker, `search_path`; `tp_app` cannot write either column beyond the session insert; the previous image's
four-column insert and its reset (no lock call) still work; the two WHEN guards equal apart from the action test; the
lock loop with a reader holding `"user"` (refused, nobody queued). The database review's scripts are models for the
concurrency cases: `dbreview-scripts/` here (`deadlock.mjs`, `orders.mjs`, `pair2.mjs`, `m.mjs`, `sec.mjs`,
`loop.mjs`, `rt.mjs`; `draft.sql` and `guards.sql` are the review's own draft of v1, not the migration).

Then the hazard review of `git diff -- packages/db/functions` (the skill's list), named in the PR description.

## 3. Part M, infra and the records (any time; touches no source the others touch)
Files: `infra/lib/security-events.ts` and `infra/test/monitoring.test.ts` (the three counted lines and alarms, in the
pattern of commit 4eb7df15, which added the ninth; they become twelve); `docs/adr/0093-<slug>.md` (new; ADR 0091 and
0092 are the models; from the design's sections 1 to 7); dated amendments to `docs/adr/0081-*.md` ("Not covered", the
reset item; the staging checks of design section 6) and `docs/adr/0091-*.md` (D10's two cases and D15's lost-answer
reset are closed by ADR 0093; it already names Queues item 28 as their close); `docs/product/sessions.md`;
`docs/product/test-matrix.md` (SGN-16's two residual cases closed by SGN-17; new rows SGN-17 and SGN-18),
`packages/synth/src/cases/matrix.ts` and `registry.ts`, and `fixtures/synthetic/SGN-17` and `SGN-18` generated by
`pnpm synth` (the pattern of commit a42e33d7); `docs/runbooks/incident-response.md` (three sections, one per counted
line, in the form of "A password reset whose sessions were not ended"; the owner's SQL for a mark ahead of the clock;
one sentence in that existing section: disabling the user also refuses its steps in flight) and
`docs/runbooks/deploy-and-rollback.md` (this migration: what refuses a try of the lock loop, deploy with no reconcile
queued or running and off-hours, both images serving, rollback).

An infra test reads the web's `sign-in.ts` for the counted lines (`infra/test/monitoring.test.ts`, around lines 112
and 152): it passes only once part F is in. Do not weaken it.

## 4. Part F, the web's sign-in flow (after part D)
The code-level spec: `build-F-spec.md` in this folder (every method of `SignInFlow`, `openSession`, the providers, the
routes, the tests). Files: `apps/web/src/lib/auth/{sign-in.ts,sessions.ts,provider.ts,dev-provider.ts,
cognito-provider.ts}`, `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/server/services.ts`; their tests
(`sign-in.db.test.ts`, `cognito-provider.test.ts`, `dev-provider.test.ts`, the routes' tests, a services test);
every test under `apps/web/src/lib` that calls `openSession(` (about 35 files: add `began`);
`apps/web/e2e/sign-in.spec.ts`; and `step-before-reset.repro.db.test.ts` is deleted.

**The two tests to flip** are in `apps/web/src/lib/auth/sign-in.db.test.ts`, both titled "SGN-16, open residual (ADR
0091 D10): ...": (1) "a step that proved the old password before a reset still opens a session when its code is
answered after the reset, which queued its one notice; the close refuses it, and flips this case"; (2) "a
key-registration step begun before a reset still registers a key after it when the provider's sign-out had no effect,
and the reset queued its one notice; the close refuses it, and flips this case". After the close: (1) answers
`refused('expired')` before the provider is asked, opens no session and writes one `security_event`
(`step_before_reset_mfa`); (2) is refused at the options and at the verify, and the twin's store holds no key.

No new words on any screen: a refusal shows the existing "That sign-in step closed" notice, an unknown outcome the
existing "Sign-in could not continue. Start again.". So no wording review, unless the build finds it needs a word.

## 5. Then
The suite once on the final tree; two adversarial reviews of the build (sign-in and session security; database), with
the design's section 8 questions; the fix round and a review of its delta. The PR opens only after
password-changed-notice merges: merge the base, regenerate the domain model, open the draft with `pnpm
db:domain-model --summary-since <base>`, fill the template, post the approval line as a suggested change in one
pull-request comment (the new-migration skill), one line to the orchestrator with the comment's link. Merge only after
the founder's committed line and green required checks.

For the PR description, in plain words for the founder: the rule holds for an account only once the Cognito client is
confidential (ADR 0088's second release); the deploy needs a moment with no reconcile queued or running; Cognito's
behaviour on a repeated confirm is unproven without a pool, so the lost-answer close is by construction; the previous
image opens sessions unchecked during a rollback.

## 6. Not yet decided (the build and its reviews settle these)
1. Whether an unknown outcome pages, and whether ending the sessions on an unproved code is the right side of the
   trade (design D9 says yes to both; the orchestrator asked that the build's reviewers weigh it).
2. D9's rule for "the provider answered and changed nothing" (a client fault, 4xx, not named for a Lambda trigger):
   whether any Cognito error falls on the wrong side.
3. D6: anything safer than reporting when the key's removal fails.
4. Whether the infra test that reads `sign-in.ts` counts occurrences of a line (then each line keeps one call site;
   the existing "sessions not ended" line is needed in two paths).
5. How the lock loop's test is driven (the migration's DO block against a reader), and whether the three-connection
   cycle is asserted from the wait graph or from 40P01.
6. `began: Date.now()` at the tests' `openSession` call sites assumes the test host and the database share a clock
   (true locally and for CI's service container): confirm, or read `sign_in_step_began()` in a helper.
7. The label `authenticated()` records if `started()` ever reaches it directly (the spec says `mfa`; no provider does
   this, MFA being required).
8. If the build's reviewers say the lost-answer close must be its own PR, tell the orchestrator in one line.
