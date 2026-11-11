## What changes

- **A sign-in step begun before a password reset is refused after it.** Each account now carries a mark, the time of its latest completed reset by the database's own clock. A code step, a new-password step or a hardware-key step that began at or before the mark is refused as a closed step, before the identity provider is asked: it opens no session, counts no failure and uses up no code. A session is refused the same way by a trigger when its sign-in began at or before the mark, under the account's row lock, so a sign-in racing a reset is either ended by it or refused.
- **The reset itself ends the sessions in the database.** The trigger that moves the mark ends every open session of the account in the transaction that records the reset. "Every session of this account has ended." in the password-changed email now rests on that.
- **A hardware key registered across a reset is removed or the account is locked.** If the provider had already stored the key when the reset committed, the app removes it there; when it cannot, the account is locked and stays locked: Unlock on the console refuses, with one new sentence that says why and what lifts it, until the key is removed and the removal is recorded (the runbook's steps; today through the founder's break-glass, until `LANES.md` Queues item 29).
- **A reset whose answer from the provider was lost is read on the safer side.** The confirm is sent once. When the answer does not say whether the password changed, the account's sessions end, the mark moves, the event is recorded and an operator is paged; the person is no longer told the code did not match. No password-changed email is sent for it, since nothing proves a change.
- **A crossed account is refused at sign-in:** when the address typed names one account and the provider's subject another, no session opens and no key step starts.
- **The password-changed email's second-factor sentence follows the account as it was at the reset** (case (d) of #140's trade-off): the fact is kept with the notice in the reset's transaction, so a factor enrolled between the reset and the send does not put the sentence in.
- **An operator is paged** by four new alarms, each with a runbook section: `SignInStepRefusedAfterReset`, `HardwareKeyRegisteredAcrossReset`, `PasswordResetOutcomeUnknown`, `SignInRefusedCrossedAccount`.
- **Running the build:** migration `20261112090000_sign_in_not_before.sql` takes four table locks without queueing (`"user"`, `user_session`, `audit_event`, `password_notice`; the loop of #140's migration, up to five minutes, failing the deploy before any service moves). Any open transaction that has touched `"user"` refuses a try, and one reconcile pass can outlast the five minutes: deploy off-hours with no reconcile queued or running (`docs/runbooks/deploy-and-rollback.md`). It is safe with the previous image running.

## Why

ADR 0093 (new in this pull request), test matrix SGN-17 (the rule) and SGN-18 (a reset whose answer was lost); `LANES.md` Queues item 28, required before launch. It closes the residuals #140 put to the founder as its trade-off (ADR 0091 D10, cases (a), (b) and (d), and D15's case (c)); SGN-16's two "open residual" tests flip to refusals.

## What the founder should know before approving

- **The rule holds for an account only once the Cognito client is confidential** (ADR 0088's second release, Cognito PR 2, which waits on staging items F1 to F5 and ruling 16). While the client is public, the same moves can be made at Cognito directly, past the app: a reset made there from start to finish, and a challenge opened there before a reset and answered after it. Nothing in this pull request can close that; it is required before the first customer invitation.
- **A key not removed locks the account,** and only the founder's break-glass clears it until Queues item 29 is built.
- **Case (d) is closed with two limits,** each only while the client is public (ADR 0093, D10): a factor enrolled in the moments before the reset is recorded, and a second reset by the same hand after enrolling. A wider rule (report only a factor older than the reset by some days) was not built: it would take the sentence from every new account in its first weeks, to cover a route Cognito PR 2 closes. If that release slips past launch, that rule is built first.
- **Still open, named in ADR 0093's known limits:** a reset for an address the app has no account for; the web's process ending between the provider's answer and the commit (the runbook's step for `PasswordResetSessionsNotEnded` now moves the mark by hand); a session row with no start is not checked (a later migration refuses one once no earlier image can run).
- **Not verified without a real user pool:** that `DeleteWebAuthnCredential` works after a global sign-out, and the names of the confirm's errors. Both are read on the safer side and are staging checks.
- **Read first:** ADR 0093 (the rule; D6, the lock and hold; D9, the unknown outcome; D10, the deploy and case (d); the known limits); the four new sections of `docs/runbooks/incident-response.md`; and the function files the summary flags: the two triggers, the three replaced functions (`unlock_user`, `audit_event_password_notice`, `operator_password_notice_claim`), `sign_in_step_refused` and `sign_in_lock_key_across_reset`.

## What it does not change

- Pricing engine (`packages/pricing`): nothing.
- Ledger (`packages/ledger`): nothing.
- Database schema and migrations: one new migration, `20261112090000_sign_in_not_before.sql`. No applied migration is edited. It adds three nullable columns (`"user".sign_in_not_before`, `user_session.sign_in_began_at`, `password_notice.mfa_enrolled_at_reset`), one column grant, two triggers and six functions, and replaces three functions in place (their stored bodies compared by hash in its preflight). No policy changes; no PHI table, no ledger, rule or pricing table.
- Content releases (`content/`): nothing.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: the document is regenerated; its approval line is blank for the founder; `approvers.json` is untouched.
- CI and the GitHub settings: nothing.
- Also unchanged: every email's words (the second-factor sentence is the same sentence, sent on a different fact); the Cognito user pool and its client; what a person sees at sign-in, except that a step begun before a reset now ends as any closed step does.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`, `screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

| Command | Result |
| --- | --- |
@@CHECKS@@

## Reviewer agents' findings

Two adversarial reviews of the design (sign-in and session security; database; 22 findings, all real, all answered in design version 2), two of the build (f5d1c05e), and a review of each fix round's delta. Every finding was checked against the code or an experiment before anything changed. No wording review ran on the build: it adds no words to a screen; the one console sentence added in the second round was read by that round's reviewer. Findings and rulings: `approval-summaries/lane-a-wip/step-before-reset/` on `claude/build-ops`.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Security (build) | B1 (blocking): a key registered across a reset is removed with a token the reset's sign-out has ended | Fixed (79c98137): `sign_in_lock_key_across_reset()`; a key not removed locks the account, recorded and paged |
| Security (build) | S1: the crossed state is judged by the flow, but the trigger and the reset cover one account | Fixed (79c98137): a crossed account is refused outright. Detecting and repairing it stays Schema PR 6 |
| Security (build) | S2: an unknown outcome was read for a request never sent | Fixed in part (79c98137): a connection that cannot have reached the provider ends nothing; a timeout, a reset connection and a 5xx stay unknown |
| Security (build) | S3: a throw after the provider stored the key | Fixed (79c98137): a judgement that throws is read as refused; the grant is always released; the line always logged |
| Security (build) | S4: the reset's transaction failing twice leaves the mark unmoved | Known limit: the runbook step gains the owner's statements that move the mark; a job that retries is handed on |
| Security, database (build) | N3, S2: the paging line fired with no audit row; the refusal recorded on every call | Fixed (79c98137): the function answers the reason and records once for an account, a step and a mark |
| Security (build) | N6, N7: paths that left the grant unreleased; the confirm's rethrown error | N6: covered by S3's fix (the grant is always released). N7: handed on: two confirm errors are still thrown as the platform's failure, and the other provider methods rethrow the provider's error whole |
| Database (build) | S1: a session with no start is unchecked and the type allowed one | Fixed (79c98137): `began` is required; the migration that refuses a row with no start is handed on |
| Database (build) | N1: the preflight's trigger text depended on `search_path` | Fixed (79c98137) |
| Database (build) | N3: REPEATABLE READ on the session insert | Sound; a test asserts the serialization failure |
| Security, database (build) | Notes N1, N2, N4, N5, N8; N2, N4 to N8 | Known limits, recorded in ADR 0093 |
| First fix round | B1 (blocking): the ordinary Unlock undid the key lock with the key still registered | Fixed (1a6b2e8b): `unlock_user()` refuses while the lock's record has no later clear; the lock is recorded even for an account locked already |
| First fix round | S1: evidence matched on the transaction's start time against a clock-time mark | Fixed (1a6b2e8b): the evidence rows carry the clock's time |
| First fix round | S2: the crossed-account line was skipped when the release threw | Fixed (1a6b2e8b): logged before the release |
| First fix round | S3: a failed audit write after a clean registration left no line | Fixed (1a6b2e8b) |
| First fix round | S4: a step sealed before the round could lock the wrong account | Fixed (1a6b2e8b): the lock always goes to the key's account |
| Second fix round | B1 (blocking, verified with two sessions): `unlock_user()` read the hold before taking the row lock | Fixed as specified (47c99ac7), with a two-session test; no review of its own |
| Second fix round | S1: the console's refusal did not say what lifts the hold | Fixed (47c99ac7): one clause in the file's voice, naming the next step |
| Second fix round | S2: the runbook's clear could cover a lock it never saw | Fixed (47c99ac7): the clear runs in one transaction on the account's row |
| Case (d), database | S1: the trigger read the second-factor fact without the account's row lock | Fixed (5222fe59) |
| Case (d), database | S2: the lock-loop test never exercised the fourth table | Fixed (5222fe59) |
| Case (d), sign-in | S1: a second reset after enrolling brings the sentence back | Not built: a limit while the client is public (ADR 0093, D10; above) |
| Case (d), sign-in | S2: the fact is read when the reset is recorded, not when the provider changed the password | Not built: the same limit and reason |

## Freeze exception

No: it changes none of them. (It changes sign-in inside the existing security program's rules; ADR 0093 records it.)

## Domain model

The summary that opens this description is the whole output of `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`. Document SHA-256 before: `@@BEFORE@@` (approved with #140). After: `@@AFTER@@`, awaiting approval. The copy in the `domain model` check's job summary is the one that counts. The build posts the approval line as a suggested change and never writes it.

Hazards in the changed function files, read as diffs against the new-migration list:

- **A grant to a role that did not have one, four times:** EXECUTE to `tp_app` on `sign_in_step_began()`, `sign_in_lock_account()`, `sign_in_step_refused(uuid, timestamptz, text, text)` and `sign_in_lock_key_across_reset(uuid, text)`; and INSERT on the one new column `user_session.sign_in_began_at`.
- **Two SECURITY DEFINER functions the app role calls with a user ID it passes, before anyone is signed in, so neither reads `app.actor_id`:** `sign_in_step_refused()` reads that account's mark and can write one `security_event` for it (once for an account, a step and a mark); `sign_in_lock_key_across_reset()` locks that account, and raises unless a `key_registered_across_reset` event since the mark is on record. Neither returns anything of the account but the reason.
- **`sign_in_lock_account()`** is a definer that locks the caller's own row (`app_actor_id()`); it reads the actor and sets nothing.
- **Two new SECURITY DEFINER trigger functions,** owned by `tp_owner`, granted to no role: `audit_event_sign_in_not_before()` (moves the mark and ends the account's sessions on the reset's event) and `user_session_sign_in_not_before()` (refuses a session begun at or before the mark).
- **`unlock_user()` is stricter:** it keeps its `organization.manage` check, takes the account's row first and refuses while a key lock has no later clear.
- None of the others: every definer names `search_path = pg_catalog, public, pg_temp` (`sign_in_step_began()`, an invoker, names `pg_catalog, pg_temp`); no `set_config` or `SET` of `app.practice_ids` or `app.actor_id`; no built SQL; no LEAKPROOF, no STRICT removed; no volatility change on a function a policy calls; no grant to PUBLIC; every new function is owned by `tp_owner` and no existing owner changes; no overload of a scope function; no scope check removed.
