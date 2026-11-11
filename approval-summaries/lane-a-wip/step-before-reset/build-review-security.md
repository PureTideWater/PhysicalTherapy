# Build review, security: a sign-in step begun before a password reset (f5d1c05e vs 238e6c64)

Read-only adversarial review. Read: the diff of the seven auth files, sign-in.ts whole, migration 20261112090000,
test titles SGN-17/18, and four greps (provider confirm catch, isClientCredentialFailure, openSession callers,
route rate limits). No test was run. Nothing was checked against a live Cognito pool: such claims say "unverified". Paths: W = apps/web/src/lib/auth, M = packages/db/migrations/20261112090000_sign_in_not_before.sql.

Counts: blocking 1, should-fix 4, note 8.

## Blocking

B1. A key registered across a reset is removed with a token the reset itself has just revoked.
- Where: W/sign-in.ts:626-640; W/cognito-provider.ts:489-499 (DeleteWebAuthnCredential with the grant's access
  token); W/sign-in.ts:768-769 (endedByReset: AdminUserGlobalSignOut straight after the commit).
- Scenario: an internal-role user with no key; an attacker holds the old password and the TOTP secret and sits on a
  register_key step. The owner resets. The attacker's verify passes registrationStale (mark not yet committed),
  Cognito stores the key, the reset commits, endedByReset calls globalSignOut. The second judge (626) refuses only
  after that commit, so removeHardwareKey runs after or beside the sign-out. Cognito refuses token-authorized user
  calls once the user is signed out globally, so the delete answers NotAuthorizedException, removed = false, and the
  key stays, audited as registered. The attacker then starts a fresh key sign-in (a start after the mark, a valid
  assertion) and gets a session on an internal account. The rule's "registers no hardware key afterwards" then rests
  on how fast a person answers a page. In the only interleaving this branch exists for, removal is expected to fail
  nearly always; the test (sign-in.db.test.ts:1115) proves removal against the twin, where sign-out does not revoke.
- Unverified: live Cognito behaviour of DeleteWebAuthnCredential after AdminUserGlobalSignOut (documented behaviour
  for token-authorized operations; not run here). If it does still succeed, this drops to a note.
- Smallest fix: fail closed when removed is false: lock the account in the same step (the existing lock, lifted by
  a platform administrator after the key is removed), so beginKey and authenticated refuse the planted key. Better:
  run the judge and the provider's completeKeyRegistration inside one transaction that holds sign_in_lock_account(),
  so a registration is strictly before the mark or refused before the provider is asked, and no removal is needed.

## Should-fix

S1. Crossed state: the database's exact check and the reset's sweep cover one account, the flow's check two.
- Where: W/sign-in.ts:394-411 and 709/730/737 (the reset marks account({email})); M:164-176 (the insert's trigger
  reads only NEW.user_id's mark).
- Scenario: address E names app account A, the provider's subject for E names account B. (a) Race: the flow judges
  [B, A] and passes, the reset of E commits (mark and sweep on A only), the insert for B is not refused: a session
  opens for B after the reset, begun before it, with no record. (b) No race needed: B's live sessions, opened with
  E's old password, are never ended by E's reset, and globalSignOut goes to A's subject, not the user whose password
  changed. (c) If E names no app account at all (709 undefined) the reset records nothing, so 556 and 396 judge
  only B, whose mark never moved: the old-password step opens a session after the reset.
- Smallest fix: refuse the crossed state outright in authenticated(): when typed is undefined or typed.user_id is
  not account.user_id, release the grant, log a security event by both IDs, answer refused. Then one account is
  judged, locked and swept everywhere. (register_key's addressUserId then goes away.)

S2. An unknown outcome can be produced without the code whenever the provider cannot be reached.
- Where: W/cognito-provider.ts:209-215 and 604-610; W/sign-in.ts:723-732.
- Scenario: confirmChangedNothing is false for anything without a 4xx: ECONNREFUSED, DNS failure, a connect
  timeout, an SDK error thrown before the socket write, any 5xx. During a Cognito or egress fault, anyone who knows
  a user's address asks for a reset step and posts any six characters: the victim's sessions end, the mark moves
  (killing the victim's own in-flight sign-ins), an audit row password_reset_outcome_unknown is written with the
  victim as actor, and the operator is paged, once per request, for every address the attacker lists. Outside a
  fault the wrong code answers CodeMismatch (rejected), so this is a fault-time amplifier, not an everyday one.
  The route's 'sign_in' rate limit applies; its key and ceiling were not read (unverified).
- Smallest fix: (1) treat failures that prove nothing was sent (connect-phase errors, errors raised before the
  request is written) as "changed nothing" and throw; (2) make the effect once per account per window: when the
  account already has an outcome_unknown event in the last N minutes and no session opened since, log and return
  without a second sweep, audit row or page.

S3. A throw after the provider stored the key leaves it registered with no record at all.
- Where: W/sign-in.ts:619-646.
- Scenario: completeKeyRegistration returns true at the provider; the judge at 626 (a database call) or the audit
  at 637/642 throws. The request fails with the key registered, not judged, not removed, not audited, no security
  line, and the grant not released (639/644 are skipped). The audit at 637 throwing also skips the release.
- Smallest fix: try/finally around everything after 619 with the release in the finally; a throw from the judge is
  handled as refused (attempt removal, log 'hardware key registered across a password reset' with the error name).

S4. When the reset's transaction fails twice the mark never moves and nothing retries it.
- Where: W/sign-in.ts:751-767 and 729-732.
- Scenario: the provider changed the password (or may have); both tries of the transaction fail. The log line
  pages, but sign_in_not_before stays where it was, so every step begun with the old password is still good for
  its whole life, and for outcome_unknown the answer does not even differ. The rule then holds only if a person
  acts within the step's lifetime.
- Smallest fix: on a second failure enqueue a singleton job keyed by the user ID (IDs only in the payload) that
  records the same event until it commits; the trigger then moves the mark and ends the sessions.

## Notes

N1. Residual window, by construction: a key registered after the provider changed the password and before the
  reset's commit (sign-in.ts:616-626 both read the committed mark) is kept and audited as an ordinary registration.
  Narrow (one provider call plus one transaction); B1's lock does not close it. State it in the ADR's "not covered".
N2. A lost answer applied late: if Cognito applies the confirm after the app gave up and moved the mark, a sign-in
  begun after the mark proves the old password before the change and its session is never swept. Seconds wide,
  needs the old password and the factor. The page's runbook should say "end sessions again once the outcome is known".
N3. stale() (sign-in.ts:323-331) logs the paging line "refused after a password reset" for every refusal the
  function returns, including "start ahead of the clock" and "no such account" (M:205), which write no audit row.
  After a failover to a database whose clock is behind, every in-flight step pages falsely. Fix: return the reason,
  log the paging line only for the recorded case.
N4. A stale sealed step is replayable until it closes: each replay of an old mfa or new_password cookie writes one
  security_event row and one page (M:211-213), bounded only by the 'mfa' rate limit. Needs the old password, so it
  is evidence, but it is noise an attacker controls. Fix: skip the insert when the same (user, step, began) is recorded.
N5. Rows with no start are unchecked and unlocked (M:179-181), so during a rolling deploy or a rollback the
  previous image's sign-in can open a session after the sweep. Acknowledged in the migration; openSession's only
  caller in apps/web is the flow (verified by grep), which always passes a start.
N6. Grant not released on three paths: a register_key cookie with no start is dropped by pendingOf
  (routes/sign-in.ts:282-287) before the flow can release it; a throw from stale() at sign-in.ts:396 or from
  hasHardwareKey at 401. The tokens never reach the browser and lapse on their own.
N7. Unverified: the confirm's rethrown 4xx (cognito-provider.ts:606) carries Cognito's message, which for a refused
  parameter can quote the value sent (the code or the password). Confirm the route layer's handler logs the error
  name only for thrown errors. Everything logged inside the seven files is user_id, request_id, error names, step
  names and elapsed_ms: no address, code, password, token or provider message (verified by reading each call).
N8. passwordChosen (sign-in.ts:468-472) has no check after the provider stored the password, unlike the key. On
  Cognito a user in FORCE_CHANGE_PASSWORD cannot complete ForgotPassword, so only an outcome_unknown mark can race
  it (unverified).

## Checked and found sound

- began is read from the clock only in started() (438) and beginKey() (566), before the account read and the first
  provider call; every later step copies pending.began; no step re-stamps it. It lives in the sealed cookie only.
- No start: pendingOf refuses every non-reset step; the flow refuses again (stale() 324, completeKey 584), asks the
  provider nothing and records nothing.
- Key sign-in: nothing reset-dependent runs before the provider verifies the assertion (583-589); a wrong key after
  a reset is an ordinary failed key; no answer, timing or log before a valid assertion depends on the mark.
- Check-to-insert race, one account: openSession locks the account row first; the trigger refuses under the same
  lock; the refusal is caught by constraint name, judged again for the record, answered 'expired' (410-424).
- Stale refusals count no failure and use up no TOTP code: 556 runs before answerTotp, 525 before completeTotpSetup,
  469 before setNewPassword; sign_in_step_refused never calls sign_in_failed.
- Unknown outcome: no password-changed mail (the notice trigger is on password_reset_completed only); the answer is
  the generic COULD_NOT_CONTINUE; the confirm goes on confirmClient, maxAttempts read as 1 before the send, built
  with maxAttempts: 1 in cognitoClients; Lambda-trigger names and 5xx land on "unknown", code problems on
  'rejected', throttles and refused parameters on "changed nothing".
