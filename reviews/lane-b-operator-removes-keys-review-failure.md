# Adversarial review: FAILURE PATHS of End membership (co-001/operator-removes-keys, HEAD 311c2743, base 58fb29e5)

Scope: the provider sign-out after the commit (apps/web/src/lib/auth/provider-sign-out.ts), both End membership routes,
runCommitted (apps/web/src/lib/http/invoke.ts:320), the MembershipEndProviderSignOutFailed filter and alarm. Read-only;
a throwaway test was written, run and deleted (git status clean).

## Findings

### F1. No request, connection or socket timeout on the Cognito client: a hung provider hangs the page with no line and no page. NON-BLOCKING. NEW in this diff's consequence (the client is PRE-EXISTING).
Evidence: cognitoClients (apps/web/src/lib/auth/cognito-provider.ts:79-80) builds `new CognitoIdentityProviderClient({ region })`
with no requestHandler, so @smithy/node-http-handler 4.14.0 defaults apply: DEFAULT_REQUEST_TIMEOUT = 0 (dist-cjs/index.js:230),
no connectionTimeout, and the default socket timeout only if `defaultSocketTimeout` is configured (index.js:127-130, 406-412),
which it is not. services.ts:186 passes these clients unchanged. globalSignOut (cognito-provider.ts:657-659) sends on `client`
(SDK default retries, 3 attempts). runCommitted awaits the work (invoke.ts:320-328) before transacted returns (invoke.ts:379).
What bounds the wait: nothing in the app. The browser is cut at the load balancer's idle timeout, 180 s
(infra/lib/constructs/edge.ts:35, LOAD_BALANCER_IDLE_TIMEOUT_SECONDS), and sees a gateway error although the membership,
sessions and membership_ended are committed; the server-side await continues until the OS gives up on the TCP connection
(minutes) times up to three attempts. While it hangs no error line is written, so MembershipEndProviderSignOutFailed does
not fire; if the task is replaced during that wait (deploy drain), the case the ADR's Consequences lists for "a web task
stopped between the commit and the call" occurs, but the ADR (docs/adr/0094 "Consequences", 4th and 3rd bullets) does not
say the wait is unbounded, so it understates the window. No database connection or row is held during the wait.
The person: a gateway error page after up to 180 s; a resubmit is safe (F3). An attacker cannot make Cognito slow; agreed
not exploitable.
Smallest fix (no migration): give the provider's `client` a NodeHttpHandler with connectionTimeout (e.g. 3000 ms) and
requestTimeout (e.g. 5000 ms) and keep maxAttempts bounded, so a hang becomes a thrown TimeoutError and one counted error
line well inside the load balancer's timeout; state the bound in ADR 0094's Consequences. (Also benefits the reset's sign-out.)

### F2. error_code is the raw error.name with no shape check: whatever a thrower puts in name is logged. NON-BLOCKING (hardening). NEW.
Evidence: provider-sign-out.ts:32 `error_code: error instanceof Error ? error.name : 'unknown'`. allowlistedFields
(packages/observability/src/logger.ts:43-56) checks only that the key is allowlisted and the value primitive; it does not
inspect the value. Throwaway run: an Error with name 'S-person@x.test' produced
`{"user_id":"u","request_id":"r","error_code":"S-person@x.test","level":"error","msg":"security event: membership end provider sign-out failed"}`.
On the real path the only thrower is client.send(AdminUserGlobalSignOutCommand): the SDK sets name from the service's error
type (Cognito-controlled class names, sanitized by smithy) or Node/SDK class names (TimeoutError, TypeError); the only
data-built name in this code base is cognito-provider.ts:639, and it is a Cognito error name on the confirm path, not this
one. So no identifier reaches the line today; not BLOCKING. It would if a future wrapper put data in name.
Also: an Error whose name is not a string drops error_code from the line entirely (throwaway: line written without
error_code); the line still counts (the filter keys on msg only).
Smallest fix (no migration): `error_code: error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : 'unknown'`,
and one unit case with a name carrying '@'.

### F3. A session opened by a sign-in committing concurrently with End membership survives it. NON-BLOCKING-FOR-THIS-PR. PRE-EXISTING at 58fb29e5 (unchanged by this diff).
Evidence: revoke_user_sessions (packages/db/functions/revoke_user_sessions.sql:29) is
`UPDATE user_session SET ended_at = now(), end_reason = 'revoked' WHERE user_id = target_user AND ended_at IS NULL` under
READ COMMITTED with no lock on the account's "user" row; the sign-in inserts its session at apps/web/src/lib/auth/sessions.ts:104.
sign_in_lock_account (packages/db/functions/sign_in_lock_account.sql:15, `FOR NO KEY UPDATE` on the "user" row) serializes a
sign-in with a password reset (ADR 0093 D2), but End membership takes no such lock.
Interleaving: T1 (sign-in) INSERT user_session (uncommitted) -> T2 (End membership) UPDATE membership; revoke_user_sessions'
UPDATE does not see T1's uncommitted row -> T2 writes membership_ended, COMMIT -> T1 COMMIT: the session is open, no
membership_ended undoes it. Then T2's after-commit globalSignOut ends provider tokens, not the app session.
Judgement: not an account takeover; the session carries no role in the ended organization, and it is the same state ADR 0094
already states as open (a sign-in after End membership still opens a role-less session; "What a failed or missing sign-out
leaves open", item 1). It does mean "no session that was open" (D5) is not strictly true for a sign-in in flight.
Fix: needs a migration: for Queues item 37 (revoke_user_sessions, or End membership, takes the account's row lock as
sign_in_lock_account does, and membership_ended moves sign_in_not_before, which ADR 0094 already plans).

### F4. If the logger's sink throws, the counted line is lost and only the generic warn (or nothing) remains. NON-BLOCKING. NEW path, generic cause PRE-EXISTING.
Evidence: throwaway run with a sink that throws: the after-commit work rejected ('rejected EPIPE'), so runCommitted's catch
(invoke.ts:324-326) writes 'work after the commit did not run; the job's schedule takes it up' with AFTER_COMMIT_FAILED at
warn, through the same sink, which would throw out of runCommitted and turn a committed request into a server error.
In practice createLogger's sink is process.stdout.write (logger.ts:59-61), which reports write errors asynchronously and
does not throw synchronously, and JSON.stringify of primitive fields cannot throw; so this is theoretical. Note also the
warn's text ("the job's schedule takes it up") is false for this work: nothing retries the sign-out (ADR 0094 D5).
Smallest fix (no migration): none needed for the sink; optionally make runCommitted's warn text not promise a retry.

### F5. A double submit after success answers not_found (new requestKey) or duplicate (same requestKey). NON-BLOCKING. PRE-EXISTING.
Evidence: same requestKey: claimRequestKey's INSERT ... ON CONFLICT DO NOTHING returns 0 rows and run() answers
{ status: 'duplicate' } before the handler (invoke.ts:270-299): no handler, no afterCommit, no audit, no line. New
requestKey: the UPDATE finds no row (ends_at set) and the handler throws NotFoundError (console.ts, settings.ts:1113),
the transaction rolls back, no after-commit work is registered (it is registered only after the UPDATE and revoke), so the
provider is not asked again, no second membership_ended, no line. Covered for a refused/unknown membership by the test
'asks the provider nothing when End membership is refused' (console-routes.db.test.ts). The person who resubmits after a
gateway timeout (F1) is told not_found for a membership that did end, which is misleading but harmless; the members list
shows it ended. Smallest fix (no migration): optional, none required for this PR.

## Checked and found sound
- Throw shapes (throwaway test, deleted): rejected Error with name -> one line, error_code = name; rejected string -> one
  line, 'unknown'; rejected plain object with a name holding an address -> one line, 'unknown' (instanceof gate); synchronous
  throw inside globalSignOut -> caught by the try around `await` (one line, 'TypeError'). Exactly one error line each time,
  with only user_id, request_id, error_code, level, msg, time. The error's message, stack and the subject are never passed
  to the logger, and allowlistedFields would drop non-allowlisted keys anyway.
- NO_PROVIDER_SUBJECT: one line, provider not asked (unit test).
- Ordering: after-commit work runs only after COMMIT answered committed (invoke.ts:345-381); a refused, rolled-back or
  unknown commit runs none. The DB test observes from another connection that the membership was ended and 0 sessions were
  open when the provider was called.
- Settings subject read (settings.ts:1089-1097) uses the same predicate as the UPDATE (organization, not the actor, not
  ended), so it can name no one the update would not end; the only-administrator refusal throws before afterCommit.
- Metric filter: RESET_AND_ENROLMENT_COUNTS entry (infra/lib/security-events.ts:136) with message
  'security event: membership end provider sign-out failed', matched by `$.msg =` on the web log group
  (monitoring.ts:623-629); errorCodes [] so every error_code, including a missing one (F2), counts. The filter does not
  test $.level, which is fine since the msg is unique. infra/test/monitoring.test.ts pins the literal and splits
  provider-sign-out.ts on the exact logger.error call text (expects 2 occurrences, 2 logger calls), so the web and infra
  strings are tied. Threshold 1 in 300 s, action to the operator topic.
- user_id is the "user".id uuid and request_id the request's opaque ID; both allowlisted (packages/observability/src/fields.ts:10,13,59).
- SGN-19 DB test (console-routes.db.test.ts, both routes): the subject is `synthetic-<userId>` and the thrown message
  contains it; `JSON.stringify(lines)).not.toMatch(/synthetic-|@/)` over every line would catch the subject or any address
  or the error text. It cannot catch data in error.name by design (F2). Ran: 2 files, 12 tests passed.
- pnpm lint:logs scans apps/, packages/, tools/, infra/ (tools/lint-logs/index.ts:6); ran: 1202 files, pass, exit 0.
- No migration, schema, function or policy change in the diff; nothing to read in packages/db/functions.
