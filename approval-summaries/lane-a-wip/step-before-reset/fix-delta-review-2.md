# Fix-delta review 2: the key-across-reset hold (79c98137..1a6b2e8b)

Read-only. SQL experiments ran in a scratch database (dr2, cloned from sbr, dropped afterwards;
app_actor_platform_permitted stubbed to true there only). Counts: 1 blocking, 2 should-fix, 4 notes.

## Blocking
B1. unlock_user() checks the hold before it takes the row lock, so a concurrent lock is undone (VERIFIED).
- packages/db/migrations/20261112090000_sign_in_not_before.sql:293-304 (the EXISTS, then the UPDATE).
- Scenario: the account is already locked (ten failures, which anyone can cause). Session B runs
  sign_in_lock_key_across_reset(U): row lock taken, held event inserted, not yet committed. Session A runs
  unlock_user(U): the EXISTS sees no committed held row, the UPDATE waits on B, B commits, the UPDATE re-checks
  `locked_at IS NOT NULL` (still true) and clears it.
- Observed in dr2: B "lock|f", A "unlock during|t", then locked_at IS NULL with account_locked_key_across_reset on
  record and no clearance. The key signs in, the console shows no Unlock button, nothing alarms. The window is B's
  transaction (milliseconds unless the connection stalls), but it is the state the delta exists to prevent.
- Smallest fix: in unlock_user, before the EXISTS: `PERFORM 1 FROM "user" u WHERE u.id = target_user FOR NO KEY UPDATE;`
  At READ COMMITTED the EXISTS then reads after B's commit. Add a two-session db test.

## Should-fix
S1. KEY_HOLD_REFUSAL does not say what lifts the hold and breaks the file's voice. apps/web/src/lib/routes/console.ts:800-801.
- True as far as it goes, and plain. But "It stays locked until the key is removed" is short of the rule: removal
  changes nothing until the owner records key_across_reset_cleared, and the administrator must then press Unlock
  again; a retry after removal gets the same sentence with no reason. "See the incident runbook" names no section.
- Voice: every neighbour is one lowercase clause, no full stop, the next step after a semicolon ("this email belongs
  to another identity; ask an engineer to reconcile it"; "the organization's status changed since this page loaded;
  reload the page"). This one is three capitalised sentences.
- Proposed: 'this account is locked because a hardware key was registered across its password reset; it stays locked
  until the key is removed and the removal is recorded (incident runbook, the hardware key steps); then unlock it again'
  (the runbook section's exact title was not read: the parenthesis is UNVERIFIED wording).
- Shown the neighbours' way: field 'input' is in NO_FIELD (components/form-issues.tsx:369), so it stands in the form's
  error summary as screening's formless refusals do (the summary's markup was not read: announcement UNVERIFIED).

S2. The runbook's clearance can clear a lock it never saw (UNVERIFIED, reasoned). docs/runbooks/incident-response.md:335-336
  against `cleared.at > held.at` (migration :301).
- Scenario: L1 is committed and the operator removes the key. A second registration's lock L2 has inserted its held
  row (at = t2), uncommitted. The operator's INSERT gets t3 > t2 and commits; L2 commits. The clearance covers L2,
  whose key arrived after the operator looked; the unlock succeeds with a key present.
- Smallest fix: the runbook's SQL in one transaction: `SELECT 1 FROM "user" WHERE id = '<user id>' FOR UPDATE;`, then
  confirm at the provider that no key remains, then the INSERT, then COMMIT.

## Notes
N1. Timestamps (VERIFIED): a clearance with at equal to the held row's leaves the hold (strict >, fails closed); the
  runbook's clock_timestamp() does not depend on when its transaction began; its INSERT works as tp_owner and the
  unlock then returns true.
N2. tp_app cannot write either purpose (VERIFIED): its INSERT of action security_event is refused by policy
  audit_event_record (20261111090000:625-632) and it has no INSERT on `at`. No SECURITY DEFINER function takes a free
  purpose: sign_in_failed and sign_in_step_refused take closed lists; record_security_event is not granted to tp_app
  and its callers are triggers with literals. locked_at is written only by sign_in_failed,
  sign_in_lock_key_across_reset and unlock_user; tp_app's UPDATE grant on "user" excludes it; the web refuses a
  locked account on the password, key and enrolment paths (sign-in.ts:421, 493, 621).
N3. The evidence row outlives the clearance (VERIFIED): after clear and unlock, sign_in_lock_key_across_reset(U) holds
  again with no new registration. Not reachable from the web: completeKeyRegistration refuses a stale step before the
  provider is asked (sign-in.ts:668), so keyRegistered follows only a real registration. A compromised tp_app can,
  and with sign_in_step_refused(U, an old start, 'key_registered', ...) can hold any account that has ever reset:
  worse than sign_in_failed x10 only in who undoes it (the owner by SQL), and it fails closed. Each call also writes
  a row now (migration :274-275); sign_in_failed already allowed that growth.
N4. unlock_user (index: the hold reads one account's rows via audit_event_by_object, fine) against its previous body: nothing lost (VERIFIED in sbr's catalog: volatile, owner tp_owner, ACL
  tp_owner and tp_app only, same search_path). Added `#variable_conflict use_variable` is harmless. The preflight
  hash begins dcb9d4ff9b6626f1, the old generated body hash; a missing function also refuses. A refused unlock rolls
  back, so the attempt leaves no audit row (UNVERIFIED whether the route wrapper logs it).

## Flow delta (sign-in.ts, cognito-provider.ts): nothing found
- Crossed account: logged, then release(); a throwing release throws as before, with the line already out.
- Lock loop: each account in its own try, so one refusal no longer skips the rest; any failure reports
  not_removed_not_locked, the urgent runbook case. The security line precedes the final audit write.
- Audit rethrow: completeKeyRegistration's catch still releases the grant and rethrows (sign-in.ts:676-684).
- neverSent: members before the aggregate's own code; an empty errors array falls through to the code.
