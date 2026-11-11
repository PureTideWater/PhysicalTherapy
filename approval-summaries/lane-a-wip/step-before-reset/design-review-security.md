# Design review, sign-in and session security: a step begun before a password reset is refused after it (design v1)

Reviewed `/home/user/ops/designs/lane-a-step-before-reset.md` (v1) against the worktree `/home/user/step-before-reset` at fadadf4b; paths below are relative to it. Read only. The design is not built, so nothing of it was run; the reproduction was read, not rerun; the only thing executed was one read-only session of clock queries on the local PostgreSQL 18 (port 5433).

Counts: 1 blocking (conditional on the pool's public client), 4 should-fix, 6 notes.

In two sentences: on the new image I found no path through `SignInFlow` or `routes/sign-in.ts` to a session, a key, a factor or a first password that passes neither D3 nor D4, and no way for anyone without a completed reset to turn the mechanism on a victim. What is open lies around it: the same moves made at the provider directly, which account the stamp lands on, and what happens (and who hears) when the rule fires.

## Findings, most severe first

### 1. SEC-D1. Blocking while the pool's client is public (today's tree); gone once ADR 0088's second release is live
**The rule is bypassed at the provider, where neither D3 nor D4 is ever asked.**

1. The attacker holds the old password and the authenticator (case 1's attacker, the party a reset is meant to shut out).
2. Before the reset they call Cognito directly with the client ID, which needs no secret: `InitiateAuth` with the old password. They now hold a challenge session (3 minutes).
3. The owner resets. The app records it, stamps the mark, ends every session, and `AdminUserGlobalSignOut` succeeds.
4. The attacker answers their own challenge at Cognito (`RespondToAuthChallenge` with a current code). These tokens are issued after the sign-out, which invalidates only tokens already issued. With the access token they call `StartWebAuthnRegistration` and `CompleteWebAuthnRegistration`.
5. They open `/sign-in/hardware-key`: a fresh attempt, `began` after the mark, D4 and D3 pass honestly, a session opens. No later reset removes the key.

A variant needs no race at all: steps 2 and 4 a minute before the reset plant a key on any account, customer accounts included, which the app itself never lets register one (`register_key` is reached only when a key is required, `apps/web/src/lib/auth/sign-in.ts:301-303`).

- Evidence: `infra/lib/constructs/identity.ts:140-145` (`generateSecret: false`), `:97` (a passkey is a first factor), `:13-18` (lifetimes); `apps/web/src/lib/auth/sign-in.ts:301-309` (a key sign-in opens a session whatever the account); `apps/web/src/lib/auth/cognito-provider.ts:417-436` (registration needs only an access token); the installed SDK's own text, `node_modules/.pnpm/@aws-sdk+client-cognito-identity-provider@3.1160.0/node_modules/@aws-sdk/client-cognito-identity-provider/dist-types/commands/StartWebAuthnRegistrationCommand.d.ts:27-31` ("Authorize this action with a signed-in user's access token") and `AdminUserGlobalSignOutCommand.d.ts:27-48` (it invalidates the tokens issued to the user); `docs/adr/0088-*.md:33-35` (routes A1 to A3) and `:172-174` (the window); `docs/adr/0081-*.md:288-295`.
- Unproven here (no pool): that Cognito answers a challenge opened before the reset (ADR 0081:288-289 records it as true) and that the public client's token may register a passkey.
- Smallest change: nothing in D1 to D4 can close it. Section 2 and Known limits say the rule covers the steps the application carries, and that it holds for the account only once the client is confidential; the new ADR and SGN-17 name ADR 0088's release N+1 as a precondition of this item's "required before launch" (ruling 15 already puts N+1 before the first customer invitation); section 2's "It needs no Cognito fact" goes (see also SEC-D6). Staging check with the confidential client: a direct `InitiateAuth` without the hash is refused.

### 2. SEC-D2. Should-fix
**The reset stamps the account the typed address names; the step is judged on the account the provider's subject names. Where the two differ the rule fails for the right account and fires on the wrong one.**

The state is the one `apps/web/src/lib/auth/sign-in.db.test.ts:846-852` builds ("a row for the address and a row for the subject, and they are different users"); ADR 0088 D3 was written because such states exist.

1. App rows: U_e (address E, subject S') and U_s (address F, subject S). The provider's user for address E is S.
2. Attacker: `start(E, old password)`. `started()` reads U_e by address, the provider accepts for S, the code step is sealed with `began` B.
3. Owner resets with address E. The provider changes S's password. `confirmPasswordReset` reads the account by address (U_e), ends U_e's sessions and records the event as U_e; D1 stamps `NEW.actor_id`, so U_e. The provider sign-out goes to S', U_e's subject.
4. Attacker answers the code. The tokens name S; `authenticated()` reads U_s by subject; `sign_in_step_current(U_s, B)` is true (no mark) and D3 reads U_s's mark: a session opens for U_s. U_s's earlier sessions never ended. U_e lost its sessions and has its own sign-ins in flight refused.

A one-sided difference (one address changed, the other not) cannot be reset through the app at all, since the app and the provider look the address up separately (`sign-in.ts:476-478`); it is reachable only with a code obtained at Cognito directly (SEC-D1's client) and lands in the branch that records nothing: no mark, no line, no page (`sign-in.ts:529-531`), while the account by subject keeps its sessions and its steps.

- Evidence: `sign-in.ts:528` and `:535-537` (by address) against `:292` and `:309` (by subject); `:303` (`register_key` keeps the subject's account and that account's address, so the typed address is gone by then); design D1 (`WHERE id = NEW.actor_id`) and D4's table (two rows by subject, one by address); the Alternatives table's third row shows the design knows the two addresses can differ. No route changes `"user".email` (the only `UPDATE "user"` in the apps is `apps/web/src/lib/routes/monitoring.ts:223`, settings), so the state comes from an out-of-band reconcile: that bounds it.
- Smallest change: the reset ends and stamps the account `authenticated()` will find. The provider's confirm returns its subject for the address (Cognito: `AdminGetUser`, a call `ensureUser` already makes, `cognito-provider.ts:479`; the twin: the record's `sub`) and the transaction runs as that account; when it is not the address's account, or there is none, one counted security line (request ID; user ID or null). Least: Known limits says "for no account under that address" and why, and the stray branch logs a counted line in place of nothing.

### 3. SEC-D3. Should-fix (the task's question 6)
**A key registered across the reset is neither removed nor reported, and the window is wider than "one provider call".**

1. A staff account with no key; the attacker holds a `register_key` step (the grant lasts 15 minutes).
2. The owner resets. The attacker's verify passes D4 at any moment from the provider's password change until the mark's commit: D4 reads the committed mark, and the commit comes after the provider's confirm, the account lookup and the transaction with its lock waits and its retry (`sign-in.ts:515-543`).
3. The provider registers the key. The provider sign-out is sent only after the commit (`sign-in.ts:547-548`), that is, after the call Known limits says it closes; so "the provider's own sign-out closes it when it succeeds" does not hold for the case it describes.
4. `hardware_key_registered` is audited after `password_reset_completed`; nobody is told (the runbook step added by ruling R1 looks only when the sign-out failed); the key then signs in with a fresh `began`.

The design's reasoning is right about prevention: this attacker could have registered a moment earlier, and holding the lock across the provider call buys nothing. It is not a reason for silence: a key added around a reset is what the person who reset most needs undone, and the reset removes none.

- Evidence: `sign-in.ts:448-459`; `cognito-provider.ts:426-436`; `DeleteWebAuthnCredentialCommand` (access token and credential ID) is in the installed SDK; design Known limits, second bullet.
- Smallest change: after the provider answers true, ask `sign_in_step_current` again. If false: remove the credential with the same grant (the twin: drop it from the record), answer `expired`, and record and page a distinct security event either way (removed, or not because the grant was already revoked). Then the exact statement holds: a key whose registration returned after the reset was recorded is removed or reported. Enrolment has the same second look already (`authenticated()` after `completeTotpSetup`), but the factor stays at the provider while the app row stays not enrolled, a stuck account: name it in Known limits beside the key.

### 4. SEC-D4. Should-fix (design question 5)
**A refusal is a warn line that nothing counts, and no audit row.**

What it signals. At the code step the refusal comes in `authenticated()`, after the provider took the code: someone presented the old password and a currently valid authenticator code after the reset. If that is not the owner, the second factor is known to the party the reset was meant to shut out, and only the new password stands in their way. At `register_key` someone tried to add a key to a staff account with a grant from before the reset. The benign reading is rarer than D4 says: a reset requested in the same browser replaces the pending step (`apps/web/src/lib/routes/sign-in.ts:695-701`), so "the person's own other tab" cannot hold a stale one; it takes a second browser or device.

- Evidence: design D4 ("warn ... counts no failure"). Every other security line of this flow is durable and counted: the burst and the lock are `security_event` rows the database writes (`packages/db/functions/sign_in_failed.sql:34-47`) and log lines (`sign-in.ts:263-268`); `infra/lib/security-events.ts:63-72` counts and alarms all eight reset and enrolment lines; ADR 0091 D9 (`docs/adr/0091-*.md:144-152`) pages on the same reasoning (tiny volume, the account holder's only warning). `packages/observability/src/fields.ts` has no field for a step's name, so as designed the line would lose it.
- Smallest change: (a) the refusal is an audit `security_event` for the account (object the user, a purpose such as `step_before_reset`, the request ID), written by a definer function as `sign_in_failed()` writes its own, in a transaction of its own because D3's refusal rolls the session's back; D4's function can record it itself (volatile, taking the step and the request) so no call site can skip it. (b) The line joins `RESET_AND_ENROLMENT_COUNTS` at 1 in 300 s, with a runbook step and the step in an allowlisted field; the key step's refusals (no password proof; a fresh attempt succeeds) may be left out of the page by that field. Counting no failure is right: a count would let a stale step lock the account.

### 5. SEC-D5. Should-fix
**D4's heading is untrue for the code step: the provider is asked first, so a stale code step still acts on the account after the reset.**

1. The reset is recorded. Within the step's 3 minutes the holder of a stale code step submits codes.
2. `answerTotp` calls the provider before anything else (`sign-in.ts:414-419`). A wrong code counts `sign_in_failed` against the account that has just reset (`sign-in.ts:284-285`, `:254-269`): the burst event at three, and one more toward the ten that lock it, which a reset never lifts.
3. A right code is consumed at the provider, which issues tokens (`cognito-provider.ts:272-287`, `:224-245`); only then does `authenticated()` refuse. The step also remains a test of whether a code is right.

Not new power (wrong passwords lock an account too), but it is what "a step begun before the reset can do nothing after it" should exclude.

- Smallest change: one more row in D4's table: `answerTotp`, before the provider call, by the address's account, as the new-password and enrolment rows resolve it; `authenticated()`'s check by subject stays the one that decides. The page of SEC-D4 then says an old-password step was tried, not that its code was right.
- Not for `completeKey`. The key step is sealed for any typed address with no proof (`routes/sign-in.ts:493-515`); an early refusal there would tell an outsider that the address has an account whose password was reset inside the step's life. The design as written has no such leak (a key step is refused only after a valid assertion); the heading must not lead the build into one.

### 6. SEC-D6. Note (design question 4; the clock)
A wall clock is acceptable here. Three statements about it need correcting, and two guards are nearly free.

- The margin. D2 says `began < mark` "by at least two provider round trips". Only the request leg of the sign-in's call and the response leg of the confirm's call are forced between the two readings (the confirm can already be in flight when `began` is read; the sign-in's answer can arrive after the mark): one round trip's network time plus about six database round trips (`sign-in.ts:322-334`, `:515-537`), in the order of 10 ms in one region. Known limits should say the clock must not step back by more than that across an attempt's life, which is up to 6 minutes to a session and 21 to a key (3 + 3 + 15; `apps/web/src/lib/auth/step-limits.ts:12-17`), not "a step's life (at most 15 minutes)". Slewing never breaks it; a step back does; a failover lasts longer than any skew. No attacker can cause one.
- "It needs no Cognito fact" (section 2). D2's argument needs the provider to refuse the old password from the moment `ConfirmForgotPassword` returns. If it lags, an attempt whose `began` is after the mark can prove the old password. Staging: sign-ins with the old password in a tight loop across a confirm.
- Guards: the insert trigger also refuses a `sign_in_began_at` later than `clock_timestamp()` (proof of a step back) or older than any attempt can be (30 minutes is generous).
- Not in the Alternatives table: a one-row counter table that D1's trigger bumps and the start reads (`began` is its committed value; stale when below the account's mark). A dump and logical replication carry it, which were the objections to a sequence and to transaction IDs, and it needs no clock; it trades the clock for "no committed row lost at failover". I do not ask for it; the ADR should say why not.
- Build hazard. `began` is truncated to the millisecond and the mark is not, so a fresh sign-in begun in the mark's own millisecond is refused. No person can do that; the flow test "a fresh sign-in after the reset works" can (consecutive statements on the local socket were 0.07 to 0.21 ms apart). Make the test wait for the next millisecond; never loosen the comparison.

### 7. SEC-D7. Note
**More completed resets stamp nothing than Known limits lists.** For each, old sessions stay and a stale step finishes; only the last one pages.

- The provider completed the confirm and its answer was lost. The SDK retries (3 attempts, transient network errors: `apps/web/src/lib/server/services.ts:144` builds the client with defaults; `node_modules/.pnpm/@smithy+core@3.38.0/node_modules/@smithy/core/dist-cjs/submodules/retry/index.js:35-38`, `:440`, `:620`). The replay meets a used code, which maps to `rejected` (`cognito-provider.ts:164`, `:529-532`): the person reads "That did not match", the new password works, nothing is recorded. What Cognito answers the replay is not verified here; any other answer throws and records nothing either.
- The process dies between the confirm and the commit.
- A reset made at Cognito directly (SEC-D1).
- The two the design lists (no account under the address; the transaction failed twice).

Smallest change: list them. For the first, one attempt for this call and a counted "outcome unknown" line with the user ID (ruling R2 puts the lookup before the confirm). And give ADR 0091 D15's runbook a statement that stamps the mark: "End membership" ends sessions and stamps nothing, so a step begun before the containment still finishes after it.

### 8. SEC-D8. Note
**Where the check sits inside `authenticated()` and the enrolment steps.** "First" in D4's table, read literally, puts it before `no_account`, `disabled` and `locked` (`sign-in.ts:292-300`), and `sign_in_step_current` is false for no account by D4's own definition: an account only the provider knows would then read "That sign-in step closed" on every try, in place of the refusal that ends the attempt (`routes/sign-in.ts:239-242`). Say: after the account is found and its lock read; before `hasHardwareKey`, `release` and the session. In the three enrolment rows: after `newPasswordOpen` and `enrolment`, so ADR 0088's refusal, its words and its alarm are not masked by `expired`.

### 9. SEC-D9. Note
**D6 across a rolling deploy is not "once", and the old image finishes new steps unchecked.** While both images serve, an attempt whose step an old task seals and a new task reads starts again, and can again; and a step the new image sealed is finished by an old task, which ignores `began` and inserts NULL. Both end with the deploy; a rollback reopens the second. Say so, deploy off-hours as ADR 0088 does for its cutover (`docs/adr/0088-*.md:228-229`), and date the migration that refuses NULL. D3's trigger could take the account's lock for a NULL row too, so the commit-during-reset race closes for the old image as well.

### 10. SEC-D10. Note (the words)
`expired` and its words are right: true; no new oracle (only someone who proved the old password, or holds a registered key, reaches a refusal, and the old password's own refusal tells them as much); D3's refusal maps to it. Small untruths that remain: a step page's "This step stays open for 3 minutes" for a step the reset closes early; after a refused new-password or enrolment step the arrival notice may add "Use the password you chose" (`apps/web/src/app/sign-in/notice.tsx:74-77`), which a reset has just made untrue (reachable only for an account still in its invitation, so only with a code from Cognito directly). D5's "tells the holder ... nothing about the reset" is true only in that sense. The e2e's "stale tab" needs a second browser context (SEC-D4).

### 11. SEC-D11. Note
**"Set a password" in the rule does not cover a second reset with an older code**, which D4 leaves out on purpose. If Cognito keeps an earlier code valid after a reset completes with a later one (unverified; ADR 0081's staging list asks only about a second request), whoever saw the earlier code sets the password again within its hour, and the app cannot tell which code it was handed. Either narrow the rule's words to the invitation's first password, or add the staging check (two codes; complete with the second; try the first).

## The task's question 8: what ADR 0091 D10 would still get wrong after this design

- "Every session of this account has ended.": true when the event commits, on both images (D1's sweep). Broken afterwards by a stale step the previous image finishes (rollback, the rolling window); by the account-by-subject of SEC-D2, whose sessions never ended while the notice goes out about another account; and in spirit by a key planted through SEC-D1 or SEC-D3, which opens a new session at will.
- D10's "a provider session that survives ... can only finish ... a sign-in step already started" becomes "cannot finish one either, except a registration already past its check" (SEC-D3); its "tokens live only in the sealed cookie" stays conditional on the confidential client (the earlier review's SEC-03; SEC-D1).
- "Signing in still asks for your authenticator code or hardware key.": true for an enrolled account (ruling R3's variant covers the rest). It cannot say that the code or the key may be the intruder's; a refusal at the code step is the evidence of exactly that (SEC-D4).

## Checked and found sound

- Coverage: every method of `SignInFlow` and all 18 routes of `SIGN_IN_ROUTES`. Every flow call comes from `routes/sign-in.ts` (grep), and `openSession` is the only writer of `user_session` outside tests (`apps/web/src/lib/auth/sessions.ts:75-78`, called at `sign-in.ts:309` alone).
- No step is re-stamped after its proof. `began` is read only in `started()` and `beginKey()`, before the provider; `after()`, `passwordChosen`, `totpSetupBegun` and `beginKeyRegistration` build on the step they were handed; the web layer builds no proof-bearing step of its own; `flowOf` (`apps/web/src/lib/auth/pending.ts:52-55`) keeps `began` through `writePending` and the refused-password rewrite; Start again clears the step and needs the password again (`routes/sign-in.ts:369-381`); the kept email carries no proof.
- Sessions under D1 with D3: the session first (swept); the reset first (refused on the re-read); a reset in progress (provider changed, mark not yet committed: a session opened then is swept); a reset that rolls back and is retried; one step replayed twice around the commit; a second reset (`GREATEST`); both orders for the previous image's reset, whose stamp and sweep are the database's.
- Internal users: with a key, a password-and-code sign-in is refused before `hasHardwareKey`; without one, `register_key` carries the attempt's `began` and both ceremony calls check; the key sign-in after `key_registered` is a new attempt. Invited path: the mark is NULL and every check passes; the app sends no code to an invited account (`sign-in.ts:477`).
- Against a victim: only a completed reset (the mailed code) moves a mark, and never back; nobody without one can force a refusal, end a session or lock an account through it. No request without a proof reaches a D4 refusal, so nothing new tells an outsider that an account exists or was reset; `sign_in_step_began()` and D4 add the same work for every address; a refusal counts no failure.
- The sweep ends only what `revoke_user_sessions` would, and the WHEN admits only a person's own event. The notice job's claim locks the notice row alone (`packages/db/migrations/20261111090000_password_changed_notice.sql:285-298`), so it never holds the account's row across its send; the membership-end routes hold session rows across their provider call, not the account's row.
- A cookie sealed by the release before cannot be forged or extended (AES-GCM seal with its own expiry, `apps/web/src/lib/auth/seal.ts`); the new image refuses it. D6 must exempt the `reset` step, which has no `began`; the reset routes' tests would catch a slip.

## Could not determine

- Provider facts, none provable without a pool: whether Cognito refuses the old password at once after the confirm (SEC-D6); whether a completed reset or a newer request voids earlier codes (SEC-D11); what `AdminUserGlobalSignOut` does to an open challenge; that the public client's token may register a passkey (SEC-D1); what a replayed confirm answers (SEC-D7); whether `DeleteWebAuthnCredential` works with a token the app holds (SEC-D3).
- Whether the production database's clock can ever step back (SEC-D6 assumes a slewed clock).
- For the database review: `openSession`'s and the reset's transactions carry no `lock_timeout` (`sessions.ts:47`, `sign-in.ts:535`; only signed-in requests are bounded, `apps/web/src/lib/http/invoke.ts:103`) and now wait on one row; and one three-party cycle I could only sketch (the sweep waits on a session row `resolve_session` holds, which waits on a device row a second sign-in holds, which waits on the account's row), possible only when a session commits between the reset's two statements.
