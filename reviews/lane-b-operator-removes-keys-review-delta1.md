# Review: lane B, operator removes keys, delta 1 (git diff 311c2743 3f35ebf9 -- apps/web)

Scope: only this delta and the lines it calls. Repository unchanged; HEAD 3f35ebf9, git status clean.
Run: vitest provider-sign-out.test.ts, cognito-provider.test.ts, transaction-scope.db.test.ts: 3 files, 68 tests passed.

## Findings

No BLOCKING finding.

### NB-1 (NON-BLOCKING, latent): "unknown" is decided by the error's class, not by where it came from
- Evidence: apps/web/src/lib/http/invoke.ts:378-381 runs the `unknown` works for any CommitOutcomeUnknownError that
  leaves `transact`, wherever it was thrown. The only producer is `committed()` (packages/db/src/authz/scope.ts:96-101),
  which the scope calls for the request's own COMMIT (scope.ts:219). The other `committed()` callers do not run inside
  a request's transact today: apps/web/src/lib/uploads/queue.ts:141 is the held queue's commit, called from
  RequestSends.settle after transact has ended (invoke.ts:375); apps/web/src/lib/screening/routes.ts:219 is its own
  client and catches the error itself (routes.ts:227). So today the works run only on the request's own missing COMMIT
  answer. A handler throwing before the commit (NotFoundError, InputError, pg ERROR) or a COMMIT answered ROLLBACK
  (TransactionNotCommittedError) or with a server ERROR (rethrown as is) never runs them; a committed request runs
  only `committed`, not `unknown` (invoke.ts:385-386).
- Risk: a future handler that calls `committed()` on another connection inside its transaction and lets the error
  through would make a rolled-back request run its unknown works (for End membership: a provider sign-out for a
  membership that did not end). Not reachable now.
- Smallest fix: in `transacted`, set a flag when `hold()` returns (the wrapper calls it as the transaction's last step,
  invoke.ts:371/575/642/694) and run `unknown` only when the flag is set; or have withScope wrap its own commit's error
  in a marker the request checks.

### NB-2 (NON-BLOCKING): two security lines (two pages) for one unknown commit whose provider call also failed
- Evidence: apps/web/src/lib/auth/provider-sign-out.ts:50-53: `ask()` logs its own line on a thrown sign-out
  (error_code = the error's name) or on a missing subject (NO_PROVIDER_SUBJECT), then the COMMIT_OUTCOME_UNKNOWN line
  is written as well. Both carry the same user_id and request_id, so nothing is lost; the runbook should say to read
  them together by request_id.
- Smallest fix: none needed in code; one sentence in docs/runbooks/incident-response.md.

### NB-3 (NON-BLOCKING): the refusal of an unknown commit now waits for the provider
- Evidence: invoke.ts:381 awaits runCommitted(unknown) before `refuse(error)`; the sign-out is bounded by
  SIGN_OUT_TIMEOUT_MS (cognito-provider.ts:119, 668-676), and AbortError is not retried (see sound, 3). Bounded at
  about 10 s plus the SDK's own backoff already in progress; acceptable.

### Note (outside the delta, called by it): the reset's line takes error.name unchecked
- apps/web/src/lib/auth/sign-in.ts:173 `errorCode` returns `error.name` with no shape check, unlike the new
  provider-sign-out.ts:13-17. The reset's sign-out now can reject with AbortError, logged as
  'security event: password reset provider sign-out failed' with error_code AbortError (sign-in.ts:870-874), which is
  the wanted behaviour. SDK names are class names, so no text leaks today; apply the same regex there for parity.

## Sound

1. Unknown work cannot run outside an unknown COMMIT (NB-1 for the latent case). Authorization runs before the handler
   (guard, gates, requirePlatformPermission, invoke.ts:555-570; the same in the other wrappers); a refusal for
   authorization throws before the handler registers anything, and any throw after registration (audit event, shell,
   hold) is an ordinary rollback that runs neither list. An unauthorized actor cannot cause the provider sign-out.
2. Both callers register only after the row check under RLS: settings.ts:1104-1117 (UPDATE ... RETURNING user_id under
   the organization route's 'user.invite' permission, NotFoundError when no row, then revokeUserSessions, then
   signOutAtProviderAfterCommit) and console.ts:779-793 (UPDATE ... RETURNING, NotFoundError, revokeUserSessions, then
   the call). In the unknown case the sign-out targets a person the authorized actor was ending; the worst case is one
   extra sign-in for that person if the commit had in fact not been made. The connection loss that produces the case
   is not attacker-controlled.
3. AWS SDK: @smithy/types 4.19.0 HttpHandlerOptions has `abortSignal?: AbortSignal | DeprecatedAbortSignal` (http.d.ts:103-104),
   so the global AbortController's signal is accepted. @smithy/node-http-handler 4.14.0 rejects with an Error named
   "AbortError" (index.js:9-26, 324, 391, 774), and checks `aborted` at the start of each attempt. @smithy/core 3.38.0
   retry: `isTransientError` excludes name "AbortError" (submodules/retry/index.js:60), so an aborted sign-out is not
   retried. The timer is cleared in `finally` on success, rejection and abort (cognito-provider.ts:673-675).
4. Doubles and dev provider: dev-provider.ts:431 `globalSignOut()` does not call send; the test clients' `send`
   (cognito-provider.test.ts:50 binds a real client; :122, credential-probe.test.ts:177, sign-in.db.test.ts:1830 take
   one parameter) ignore the extra argument in JS and remain assignable in TS. Tests pass.
5. Regex /^[A-Za-z][A-Za-z0-9]{0,63}$/: Cognito and smithy error names (NotAuthorizedException, UserNotFoundException,
   TooManyRequestsException, TimeoutError, AbortError) all match; no SDK error class uses '.', '_' or '$'. A miss costs
   only 'unknown' in the line; the runbook keys on the line and request_id, so nothing it needs is lost.
6. Logged fields through this delta: user_id, request_id, error_code (a fixed constant or a class-shaped name) in
   provider-sign-out.ts; invoke.ts:381 adds no line (runCommitted logs AFTER_COMMIT_FAILED without request_id or
   text). No subject, address, error message or cause reaches a log; CommitOutcomeUnknownError's cause is not logged.
