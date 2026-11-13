# Review A: auth and tenant isolation, Queues item 37 (hardware-key registry)

Branch co-001/wip-key-registry at ad684695, base 1f652b6f. Read only. No SQL run, no tests run. Line numbers point to
HEAD. "fn/X.sql" means packages/db/functions/X.sql. "mig" means packages/db/migrations/20261115090000_key_registry.sql.
This review does not judge whether anything is HIPAA compliant.

## Confirmed by reading the code

### A1. high. The target of an open request can still void it, through "user", not membership. NEEDS-MIGRATION
- Where: mig 514-525 (membership_removal_target_holds covers BEFORE UPDATE ON membership only);
  fn/account_removes_keys.sql (it requires `u.status = 'active' AND u.mfa_enrolled` for the requester, re-checked at
  confirm: fn/hardware_key_removal_confirm.sql, the `hardware_key_removal_requester_left` branch);
  fn/user_guarded_columns.sql (an actor who is a platform admin may change any user's `status`; nothing guards
  `mfa_enrolled`); tenancy grant `GRANT UPDATE (email, mfa_enrolled, hardware_key_required, status) ON "user" TO tp_app`
  (20261015140000_tenancy.sql:599), with policy user_self_and_platform_admin_update.
- Steps: (1) admin B requests removal of thief-held admin account T. (2) Working as T, the thief runs
  `UPDATE "user" SET mfa_enrolled = false WHERE id = B` (or sets `status = 'disabled'`). 16.4's trigger does not fire
  because no membership changes. (3) Admin C's confirm raises `hardware_key_removal_requester_left`. (4) The thief repeats
  this against each new requester. R8/16.4 closed the membership route; this is the same attack through a sibling table.
- Reach: no web route updates another user's status or mfa_enrolled today (grep of apps/web/src/lib finds only the
  `settings` update in routes/monitoring.ts:223). So the attack needs SQL as tp_app with app.actor_id set to T. R4 and
  16.3 already treat that as in scope ("one platform administrator can change that column at the database").
- Verification: add to packages/db/src/key-registry.db.test.ts (SGN-24): with a removal of T requested by B, as actor T
  run `UPDATE "user" SET mfa_enrolled=false WHERE id=B`. Expect `check_violation` with constraint
  `hardware_key_removal_target_acts`. Repeat with `status='disabled'`. Today both UPDATEs succeed, and the next confirm
  by C fails with requester_left.
- Smallest fix: a BEFORE UPDATE trigger on "user" that refuses when app_actor_id() is the account of a `requested`
  removal and OLD.id <> app_actor_id() and status, mfa_enrolled or hardware_key_required changes. App-side stopgap:
  none is needed while no route can make that change. Record it as a queue item.

### A2. medium. The judge counts a try when it is given no code. Reaching the code screen costs one of the five. APP-ONLY
- Where: apps/web/src/lib/auth/sign-in.ts. judgeRegistration (about 888-899) passes `null` when `pending.code` is
  undefined. codeNeeded (about 906-908) calls it whenever `codeRequired !== true`. That covers the first
  beginKeyRegistration of every fresh pending step. In fn/hardware_key_registration_judge.sql, with a usable opening and
  `code_sha256 IS NULL`, the code falls through to `registration_code_tries + 1`.
- Steps: (1) the member of a closed account signs in with password and TOTP. The first beginKeyRegistration judges with
  null, counts try 1 and shows the code screen. (2) A wrong code makes answerRegistrationCode return
  `refused('registration_code')`, and the pending step is dropped. (3) Signing in again starts a new pending step without
  codeRequired, and its null judge counts again. Each mistake really costs 2 tries, so an honest member gets about 2 or 3
  real attempts. Anyone holding the password and TOTP can spend the opening with 5 sign-ins without typing any code.
  Spending it by guessing is equally possible, so this is mostly a usability and denial-of-service cost, but it is not
  what 16.2 says ("a wrong digest ... counts one try").
- Verification: in the sign-in flow test (with the provider twin and DB) or key-registry.db.test.ts (SGN-27): open
  registration for a closed account, call beginKeyRegistration once with no code, then assert
  `registration_code_tries = 0`. It is 1 today.
- Smallest fix (APP-ONLY): when probing with no code, call the judge with `began = NULL`. The judge returns
  `not_closed` before its began branch, and otherwise returns `refused` without counting. It still writes at most one
  `key_registration_refused` security event an hour, which is acceptable. Keep the counted call for
  answerRegistrationCode only. Also keep `codeRequired: true` on the step that a wrong code refuses, so a retry does not
  probe again.

### A3. medium. An unsalted SHA-256 of a 40-bit code can be reversed offline. Whoever reads the digest within the hour has the code. APP-ONLY
- Where: apps/web/src/lib/auth/registration-code.ts:33-35 (`createHash('sha256')`, no key). The digest sits in
  hardware_key_removal.registration_code_sha256 (mig 165). In hex it is also sealed in the pending sign-in step
  (sign-in.ts about 927-932) and sent as a bind parameter on three calls.
- Steps: anyone who reads the column (tp_owner, a snapshot, backup or replica, a dump) or the parameter (suspected: a
  Postgres slow-statement or error log that prints parameters) brute-forces 32^8 = 2^40 SHA-256 in minutes on one GPU,
  then registers a key during the open hour, given the password and TOTP. In practice, the rule "never stored in clear"
  is met in name only.
- Verification: unit test in apps/web/src/lib/auth/registration-code.test.ts: `registrationCodeDigest(c)` differs from
  `sha256(c)` and changes when the pepper changes.
- Smallest fix (APP-ONLY): HMAC-SHA256(server pepper from Secrets Manager, normalized code). That is still 32 bytes, so
  the DB, the constraints and the functions stay as they are. Pass `log_parameter_max_length*` = 0 for the app role if
  infra does not already do so (not checked).

### A4. low. hardware_key_record is an uncounted code check for anyone holding the app role. NEEDS-MIGRATION
- Where: fn/hardware_key_record.sql. A wrong code raises `hardware_key_registration_closed`, which rolls back, so no try
  is counted.
- Steps: an attacker holding tp_app with actor = the member calls record in a loop with guesses. Each call takes the
  account lock. The usable hour caps it at about 10^7 tries out of 1.1e12, so the chance of a hit is about 1e-5. The web
  passes `pending.code` only after the judge answered `open` (sign-in.ts about 932 and 1084). Confirmed.
- Verification: a db test that makes 6 calls to record with wrong codes and asserts that the 6th call with the right
  code is refused. It succeeds today.
- Fix: have the judge write a single-use "judged open" marker for the step (began plus request) and have record require
  that marker, not compare again. Record it as a queue item.

### A5. low. A refused key removal leaves no trace. The answer to point (a). APP-ONLY
- Where: apps/web/src/lib/routes/console-keys.ts:41-53. refused() maps the error to an InputError and writes no log
  line, and the function's transaction rolls back.
- Required? No. Sections 4.5 and 6 list audit rows only for acts that happened, and "every mutation ... an audit event"
  covers mutations that happen. Still, a refused `two_people`, `not_own_account`, `requester_left` or 42501 is exactly
  how a thief probing the rule would show up.
- Options that need no migration: (i) one log line in refused(), with IDs only (`user_id`, `request_id`, `route_id`, the
  constraint name in `error_code`), at warn for 42501 and at error for two_people, not_own_account, requester_left and
  target_acts, plus a metric filter and alarm in infra/lib/constructs/monitoring.ts. (ii) A second transaction after the
  rollback that writes an audit row under a new action that is not reserved (for example
  `hardware_key_removal_refused`, detail = the constraint name). The audit_event_record policy (mig 1513-1527) allows any
  unreserved action with actor_id = app_actor_id(). A security_event row would need a migration, because that action is
  reserved.
- Verification: a route test that a refused confirm by the requester yields exactly one log line with
  `error_code = 'hardware_key_removal_two_people'` (and one audit row if (ii) is chosen).

### A6. low. Point 49: the relying-party mismatch line pages nobody. APP-ONLY (infra and web)
- Where: sign-in.ts about 377-388. The `logger.error('configuration: the relying-party ID is not the provider's ...')`
  call has no `error_code`. infra/lib/constructs/monitoring.ts counts web lines by `$.msg` or `$.error_code`. Its only
  `$.level = 'error'` filter is on the screening log group (line 505), and no filter names this message.
- Unsafe? Not for security: it fails closed, and every key step is refused. It is unsafe for availability: every key
  sign-in in the environment fails, people see a generic refusal, and nothing pages.
- Fix: a constant message and `error_code: 'RELYING_PARTY_MISMATCH'`, counted and alarmed beside RemovedHardwareKeyUsed.
  Test it in infra/test/monitoring.test.ts (a metric filter on that code, alarm threshold 1).

### A7. low. Point 50: options with no rpId leave the check open. APP-ONLY
- Where: sign-in.ts about 377-381. `theirs === undefined` never settles the check (also at 855 and 947).
- Unsafe? It fails closed. Both verifications use the app's own `expectedRPID` (sign-in.ts about 1068-1073), so a
  provider using another ID gets every honest assertion refused as `assertion` or KeyNotVerified, with the wrong cause
  logged.
- Fix: when options carry no rpId, compare the value the browser will use, `new URL(webauthn.origin).hostname`, with
  `webauthn.rpId`. Test: the provider twin returns options without rpId while the app's rpId differs from the origin
  host; expect RelyingPartyMismatch.

### A8. medium. `AuditSpec.writtenBy: 'database'` is unguarded. The answer to point (f). APP-ONLY
- Where: apps/web/src/lib/http/route.ts (AuditSpec, about 166-172) and apps/web/src/lib/http/invoke.ts:303-304. Any
  route that declares `writtenBy: 'database'` skips its audit event, and no test ties the flag to a reserved action or a
  function that writes one. grep finds only the four console-keys routes using it today.
- Steps: a later route adds the flag (copy and paste) and its mutation is no longer audited. That breaks "every
  mutation ... an audit event" with no CI signal.
- Verification and fix: a registry test (next to the route catalog test) that every route with `writtenBy === 'database'`
  has `audit.action` in the reserved list of the latest audit_event_record policy, and its id in an allowlist of the four.
  Also a db route test that each of the four acts yields exactly one audit row (not checked whether this exists).
  Note: the routes declare objectType `hardware_key_removal`, but the functions write `object_type = 'user'`. Align the
  declaration.

### A9. note. Postgres trusts the app role for the acting session
- console-keys.ts:68, 87, 104 and 142 pass `actor.sessionId`. Confirmed. actor_key_session (mig 408-418) checks that the
  session is the actor's, live, webauthn, under 15 minutes old and on a live key. It cannot tell this request's session
  from another qualifying session of the same actor. This is accepted by 16.5. Test: a route test that the function
  receives the resolved session's id.
- In the same way, user_session_hardware_key (mig 460-483) accepts a webauthn session carrying the digest of a live key
  without proof. Proof of the key is the web's job. Digests are not secret: sign_in_hardware_keys returns them for any
  user id.

### A10. note. organizationId in the key routes' inputs is used for the redirect only. The answer to point (e)
- console-keys.ts:55, 64 and 75. The value is a Zod opaqueId (a UUID) placed into a fixed path. That is not an open
  redirect. The handler does not check it against the target account, so a wrong value only sends the admin to another
  organization's console page, which every platform admin can read anyway. It discloses nothing.

### A11. note. Two functions act for any user id with no actor
- fn/sign_in_hardware_keys.sql returns the credential digests and live public keys of any account to tp_app. They are
  public keys and non-secret IDs.
- fn/sign_in_key_refused.sql writes `key_refused_*` security events for any account, at most once an hour per purpose.
  A tp_app holder could pre-write one to suppress that hour's row. The paging comes from the log line, not the row.

## Suspected (not proven by reading)
- The Postgres log of bind parameters carrying the code digest (A3). infra parameter groups were not read.
- Point (c): lock-timeout.test.ts goes from 5 to 7. The diff's comment says the test counts bounded transaction sites per
  source file. The two new ones are judgeRegistration and recorded(): two real, sequential transactions, each through
  withActor, giving back their connection. This is not a pool size, so it does not hide a leak. The real cost is one
  extra round trip per registration step, plus up to two judge transactions (begin and complete each call codeNeeded).
  The test body beyond the diff was not read.

## Checked and found sound
- Two-person rule: the same account twice is refused by function and CHECK (requested_by <> decided_by). Two sessions or
  two memberships of one account are still one actor id. A role regained: a role change fires role_escalation
  (fn/membership_security_events.sql), and tp_app cannot update membership.created_at (UPDATE grant on role, ends_at
  only). Re-added means a new created_at. A confirmer added under seven days is refused. The requester leaving voids the
  request (16.4, no exception). The account acting on itself through another membership is refused (actor = user_id
  checks on the actor id). A platform admin of a non-internal organization is refused (account_removes_keys and
  app_actor_platform_permitted both require kind internal). Cancel then re-request: one open request (unique index); a new
  request again needs a different confirmer. A concurrent double confirm: account lock, then the removal row FOR UPDATE,
  then state re-read, so the second gets `decided`. The account cannot cancel. tp_app has no DELETE on membership.
- The code's generation: crypto.randomInt over a 32-symbol alphabet with no look-alikes, 8 symbols, 40 bits. It is
  returned once in the server-action answer (actions.ts) and is in no redirect. A duplicate request key returns
  `duplicate` with no stored data. Tries are counted under the account's lock (no race). Expiry is 1 hour (CHECK and
  usable). Constant time is met by hashing both sides again. hardware_key_removal_is_final lets tries only count up. The
  helper `account_key_registration_closed` is granted to no role. tp_app has no privilege on the four new tables
  (mig 1531-1533). The member flow uses the judge; the console uses hardware_key_removals(), gated by
  organization.manage in an internal organization. No path from the code to an audit row, a job payload or an error
  message was found. Refusal words carry no values.
- Session open: tp_app can INSERT only the granted columns. The BEFORE INSERT trigger fires on every row with no WHEN and
  takes the account lock, so it cannot be bypassed by tp_app. UPDATE is limited to ended_at and end_reason, and
  user_session_end_is_final blocks reviving a session. The previous image's no-digest key session is refused once the
  registry has touched the account. A closed account's non-key session is refused (`user_session_key_registration_closed`).
- Point (d): the /new-migration marker is `.claude/.allow-protected-edit` (.claude/hooks/protect-content.sh:75). It is
  absent in /home/user/PhysicalTherapy and in the /home/user/ops worktree, and the diff changes nothing under .claude/ or
  tools/hooks. No leftover marker was found, so there is nothing harmful in the tree. If the orchestrator meant a marker
  elsewhere, it was not found.
- Tenant isolation: hardware_key, hardware_key_removal, hardware_key_notice and provider_sign_out are platform identity
  tables with no practice_id. They hold no PHI: user ids, digests, public keys, request ids, and address_sha256 salted by
  the row id. All four have ENABLE and FORCE ROW LEVEL SECURITY (mig 278-289), a tp_owner-only policy, and are revoked
  from PUBLIC, tp_app and tp_operator. Every definer is owned by tp_owner with search_path pg_catalog, public, pg_temp
  (pg_catalog first, pg_temp last) and is revoked from PUBLIC. No LEAKPROOF, no EXECUTE of built SQL, no set_config of
  app.practice_ids or app.actor_id, no new schema, no GRANT to PUBLIC. The audit policy keeps its practice_ids scope
  line.
- Not checked: the domain-model function-diff summary, line by line against the migration.

## Not reached
- apps/web/src/lib/routes/sign-in.ts (diff), and sign-in.ts authenticated() (assertion verification, the cleaning, the
  removed-key log line).
- The React component that holds the code (whether it persists anywhere client-side).
- packages/db/src/key-registry.db.test.ts and provider-sign-out.db.test.ts coverage.
- Whether a route test asserts exactly one audit event per act.
- record_security_event's `at` value (role_escalation back-dating relies on it being now()).
- infra Postgres logging parameters.
