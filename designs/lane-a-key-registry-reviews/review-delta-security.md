# Delta security review, Queues item 37 fix round (ad684695..c505ad28)

Scope: `git diff ad684695 c505ad28 -- apps/web/src/lib apps/web/scripts apps/worker infra packages/db/src`, plus
packages/db/functions/{hardware_key_registration_judge,operator_provider_sign_out_claim,operator_provider_sign_out_failed,
account_removes_keys,user_guarded_columns,membership_removal_target_holds}.sql and a1-trigger.sql.txt. Read only; no suite,
no PostgreSQL. Nothing here says anything is HIPAA compliant.

## Findings

D1 (medium) infra/lib/security-events.ts ~109-114 (PROVIDER_SIGN_OUT_NO_SUCH_USER_ALARM), monitoring.ts ~693-708.
  Three "no such user" in 15 minutes. A worker given the wrong COGNITO_USER_POOL_ID marks every row done with no sign-out
  made. At launch volumes (one or two sign-outs per 15 minutes), the alarm never fires, so nobody is signed out at
  Cognito and nothing pages. Steps: deploy the worker with another pool's ID; end two memberships 20 minutes apart; both
  rows are done with outcome_code no_such_user and the alarm stays OK.
  Verification: in infra/test/monitoring.test.ts, assert there is an alarm on outcome_code no_such_user with threshold 1,
  or with a window of at least 24 hours (it fails today: threshold 3, period 900).
  Fix: add a second alarm (>=1 in 15 minutes at low volume, or >=3 in 24 hours), or have the worker check at start that
  its pool matches the stack's. APP-ONLY (infra). Confirmed by reading; the volume figure is an assumption.

D2 (medium) apps/web/src/lib/auth/sign-in.ts:975-984. KEY_ALGORITHMS_NOT_OFFERED is logged at error, but nothing in
  infra filters on it (grep of infra: no hit). If the provider stops offering ES256 and RS256, every key registration
  fails closed with no alarm. RELYING_PARTY_MISMATCH got an alarm in this round; this line has the same impact and did not.
  Verification: grep -rn KEY_ALGORITHMS_NOT_OFFERED infra finds nothing; add a monitoring test asserting a filter on
  $.error_code = 'KEY_ALGORITHMS_NOT_OFFERED' on the web log group. Fix: a constant in security-events.ts and an alarm
  that copies RelyingPartyMismatch. APP-ONLY. Confirmed.

D3 (low) sign-in.ts:395-405 with monitoring.ts ~710-725. The mismatch line is written once per process (state
  'differs' is cached). The alarm has threshold 1, NOT_BREACHING and no OK action, so after one period it reads OK while
  every hardware-key step is still refused. A new task only alarms again once it handles a key step. Verification: unit
  test that two refused key steps in one SignInFlow produce two lines (fails today: one). Fix: log the constant line on
  every refused key step (it holds only IDs), or treat missing data as BREACHING until an OK signal exists. APP-ONLY.
  Confirmed by reading.

D4 (low) the completion's algorithm refusal has no test: sign-in.ts:1111, supportedAlgorithmIDs in
  verifyRegistrationResponse. The test that would show it: in sign-in.db.test.ts, a software authenticator makes an
  attestation-'none' credential under EdDSA (-8) for the step's creation challenge, then completeKeyRegistration runs.
  Assert the result is the key-not-verified refusal, the provider's completeKeyRegistration mock was never called, and
  count(hardware_key WHERE user_id) is unchanged. Is the gap unsafe? Not today. @simplewebauthn/server 14.1.0 takes and
  enforces the option (its d.ts says the default list includes EdDSA, so dropping the option would quietly admit -8),
  Cognito checks against its own list, and the column length still keeps ML-DSA keys out. The risk is a regression
  nothing catches, not an open hole. APP-ONLY (test only).

D5 (note, blocks merge) packages/db/src/key-registry.db.test.ts:820-924, SGN-24. The describe is committed red, and
  user_removal_target_holds is in no migration or functions file (grep packages/db/migrations packages/db/functions: no
  hit). `pnpm test:db` is red on this branch until the migration lands, and CLAUDE.md rule 4 requires that suite to pass
  on every PR. NEEDS-MIGRATION. Confirmed.

D6 (low, trigger) a1-trigger.sql.txt. Ways the requester can be voided (account_removes_keys): status, mfa_enrolled,
  the membership (ends_at, role, created_at), and a role_escalation event. Each one:
  - status: covered.
  - mfa_enrolled: tp_app's UPDATE is revoked (20261015180000_tenancy_hardening.sql:481), and record_sign_in_with_mfa
    only sets true, on the actor's own row.
  - membership: handed to membership_removal_target_holds, which I did not check for DELETE/INSERT. Suspected gap: if it
    is BEFORE UPDATE only and tp_app holds DELETE on membership, the target deletes the requester's internal membership
    and voids the request.
  - SECURITY DEFINER paths: the trigger fires inside definer functions with the session's app_actor_id. None of the
    definer functions that write "user" (record_sign_in_with_mfa, sign_in_*, unlock_user, hardware_key_removal_confirm,
    membership_end_marks_account) set status or hardware_key_required on another account, so I found no bypass.
  - DELETE of "user": tp_app has no grant.
  - NULL actor and the operator role: unbound by design (system).
  - email: the target may still change another administrator's email (tp_app holds UPDATE(email); the WHEN clause leaves
    it out). That voids nothing but redirects that person's notices.
  Wrongly blocked: no. End membership changes sign_in_not_before, not status. The sign-in flow updates the actor's own
  row. hardware_key_removal_confirm writes no status or hardware_key_required.
  Race: the uncommitted-request residual is as recorded. The target cannot aim at a request it cannot see, so I accept it.
  Verification for the suspected gap: in SGN-24, as the target, `DELETE FROM membership WHERE user_id = requester AND
  organization_id = internal`; expect HOLDS. NEEDS-MIGRATION if it fails.

D7 (note) packages/db/functions/hardware_key_registration_judge.sql (the audit INSERT after the opening block). A step
  with no code (A2) now skips the try, but it still writes the security_event 'key_registration_refused' (once an hour)
  for every legitimate arrival at the code screen. It did that before the fix as well. No infra filter reads it (grep:
  none), but the audit trail now records a refusal that was never a guess. Fix: return 'refused' before the INSERT when
  began IS NULL. NEEDS-MIGRATION. Confirmed by reading.

D8 (note) apps/web/src/lib/server/services.ts:65,280. registrationCodeKey is a public Buffer on Services. I found no
  path from Services to a log (field allowlist), a JSON body or a client prop (grep apps/web/src: no serialization of
  services outside tests), and Services already carries the Sealer. Narrower: hold the key in a closure that only
  exposes digest(typed). APP-ONLY. Suspected risk only.

D9 (note) apps/web/src/lib/routes/console-keys.ts:93,127. MutationResult.objectId is the removal ID while
  audit.objectType is now 'user'. The wrapper writes no event for writtenBy 'database', so I saw no wrong row; it would
  matter if objectId is used elsewhere. Not verified.

## Claimed fixes judged sound
- A2: NULL began cannot produce 'open'. The began/mark/clock checks gate only the try and the 'open' result; a closed
  account still gets 'refused'; the not_closed path is unchanged. Staleness is still enforced by registrationStale().
- A3: HKDF-SHA-256 with an empty salt and info 'paidwhole registration-code digest v1'. It is separate from derive()
  (sha256(key||label)) and from sign() (HMAC under the raw key with a VERSION:purpose prefix). One value reaches both
  callers (createServices). The database still compares sha256(a) = sha256(b), as before. The sealed hex is now an HMAC,
  so it is no weaker. The 32-byte length check is in place.
- A7/A6: an absent rpId is compared with the origin's hostname, which fails closed. The filter $.error_code =
  'RELYING_PARTY_MISMATCH' on webLogGroup matches the line, and error_code is allowlisted. See D3 for the lifetime problem.
- Algorithm begin: the throw happens before the pending step is updated, so the cookie keeps the earlier step with no
  challenge and the options are never sent; the grant lapses. The intersection and its order are tested
  (sign-in.db.test.ts:2453-2481).
- A8: the registry test pins the four routes, their actions and 'user'.
- B1/B4: $.msg = 'provider sign-out attempt failed' and $.outcome_code = 'no_such_user' are on platformLogGroup, and the
  done line is logged only when recorded. The timeout break cannot starve a row: _failed sets next_attempt_at = now() +
  1/5/15/60 min, and the claim orders by next_attempt_at, id, so a poison row moves behind the others (it costs at most
  one run in two).
- B3: every withClient use goes through asOperator (BEGIN; SET LOCAL ROLE; set_config is_local true) on each
  per-step connection. done/failed are keyed on attempts = try, so a stale worker's write is a no-op. A failed connect
  throws and the step fails with nothing marked. The run line is written once, after step() has caught everything.

## Not reached
membership_removal_target_holds on DELETE/INSERT and tp_app's membership grants; console-routes.db.test.ts audit
counts; infra/test/monitoring.test.ts assertions; most of the sign-in.db.test.ts delta; the dev provider's own
verification list; operator_provider_sign_out_done's try predicate (assumed unchanged, outside the delta).
