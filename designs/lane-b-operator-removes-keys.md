# Design: an operator removes a member's hardware keys, and End membership does not wait on the provider (`co-001/operator-removes-keys`)

W22 (acting Lane B), 2026-11-11. `LANES.md` Queues item 29; required before launch (the orchestrator's ruling). Base
58fb29e5 (#140, #142, #144, #149 merged). Sources: ADR 0091 D10, ADR 0093 D6 and "Not covered" 5, the incident and
support-mail runbooks' break-glass lines, `console.end_membership`, `settings.users.end_membership`, the provider
adapter. **Status: v1, before build.** ADR and test-matrix numbers are asked of the orchestrator, none used here.

## 1. Three facts the design rests on (each checked)

1. **The provider has no administrative call for a hardware key.** Cognito lists and deletes a WebAuthn credential
   only with the member's own access token (`ListWebAuthnCredentials`, `DeleteWebAuthnCredential`). The pinned SDK
   (3.1160.0) and the newest published one (3.1167.0, read from the registry today) hold no `Admin*WebAuthn*` command.
   The AWS documentation host is outside this machine's network, so the SDK's command list is the evidence. What an
   administrator can do there is delete or disable the whole user, which the application role does not hold and
   should not. So "remove a key" cannot mean a call an operator sends to the provider.
2. **The app keeps no record of a key.** `hardware_key_registered` is audited with the user's ID only; the credential
   ID is not stored, and the key sign-in opens a session for whatever credential the provider accepted
   (`sign-in.ts`, `completeKey` to `authenticated`). Registration is offered only to an account that must hold a key
   (PaidWhole's own staff, by `user_is_internal`, or a flagged account), but any account whose provider user has a key
   signs in with it.
3. **End membership calls the provider inside its transaction** (`globalSignOut` after the membership and the sessions
   end, both routes). A throw rolls everything back: the page shows an error and nothing ended.

## 2. Part B, built now (no migration): End membership ends in the app whatever the provider answers

- **One transaction, no provider call in the request.** Both routes end the membership, end every session of the user
  (`revokeUserSessions`), write `membership_ended` (the wrapper's audit event) and send one `provider_sign_out` job
  through the request's queue, which pg-boss writes on the same transaction's connection (#144): the job exists if and
  only if End membership committed. The request never waits on the provider, so a provider that hangs cannot hold the
  page either. Role checks are unchanged: `organization.manage` (console) and `user.invite` (settings) in the handler,
  `membership_administrators_update` in Postgres, and the database's refusal for an only practice administrator.
- **The job** (`apps/worker`, platform queue, one per End membership: singleton by the request's ID) asks the
  provider to sign the user out everywhere through a worker-side adapter (`AdminUserGlobalSignOut`, the one action
  the shared task role already holds; the local twin does nothing). The call is idempotent. "No such user" at the
  provider is success (nothing to sign out). Payload: `user_id`, the provider's subject (an opaque ID the database
  already holds; the operator role cannot read `"user"`, and a function that returns it is a migration), `request_id`.
  No address or name; logs carry `user_id`, `request_id`, `error_code`.
- **Retries and the page.** pg-boss retries twice with backoff (the queues' one policy). On the last failure the job
  logs `security event: provider sign-out failed after a membership ended` (error) and sends itself again in 15
  minutes with a round counter, for 24 hours; a new alarm (at least 1 in 300 s) pages the operator on the first such
  line. When the last round fails the line carries `error_code` `GAVE_UP`. A later success logs an info line with the
  same IDs, which the runbook reads to close the page.
- **What refuses sign-in meanwhile.** The membership and the sessions are ended by the app's own rows. The build's
  first tests state what a step in flight can still do after End membership with the provider's sign-out never
  performed (a fresh sign-in, a code step, a key-registration grant), as SGN-16 did for the reset; whatever is open is
  recorded and goes to section 4, not papered over.
- **Audit.** `membership_ended` in the transaction (existing). The provider's sign-out, done by the operator role, is a
  log line for now: an audit row from that role needs a function (section 4).
- **Refusals read as today** (not found; the only-administrator refusal). The screens' words change only if the build
  finds one that is no longer true; then one ux-brand pass.
- **Runbooks.** "If the provider refuses the sign-out, the page shows an error and nothing was ended" and the
  break-glass hand-off for it are replaced by the page, its query and what to check.

## 3. Part A, the design (all of it needs a migration; nothing of it is built here)

- **What "removed" means: the app's own registry decides, the provider is cleaned at first use.** A table of
  registered keys (user, a digest of the credential ID, registered at, removed at, removed by; no PHI, forced RLS, no
  policy for the application role, reached through definer functions). A key sign-in opens a session only for a
  credential with a live row, checked where the session is opened, in Postgres. Registration records the row in the
  transaction that audits `hardware_key_registered`. A removal marks rows; it needs nothing from the provider, so it
  cannot fail with it. A removed or unknown key that signs in is refused, and the grant that very sign-in produced
  deletes it at the provider; an account that must hold a key and has no live row has the provider's leftovers
  deleted with its own grant at its next password-and-code sign-in, then registers a new key. Keys registered before
  the registry have no row: before launch those are test and staging accounts, which register again.
- **Who.** Platform administrators only (`organization.manage`, held by no other role), never a customer's
  administrator and never the account's own practice peers: Settings gets no key action. Not on one's own account.
- **Two people: yes, for every account.** Every account that holds a key is staff or flagged, and a key is the one
  factor a stolen password and authenticator cannot replace (password and code alone are refused while a key exists).
  Removing it lowers the account to those two, and a second staff identity defeats the packets' two-person approval.
  So one platform administrator requests, a different one confirms within 24 hours, neither is the account. With
  fewer than two other administrators the founder is one of the two, as an administrator in the console, not by
  break-glass.
- **What is removed: every key of the account**, never one. The app cannot show an operator which key is which, and a
  suspect account's keys are all suspect. The confirmation also ends the account's sessions and moves its
  `sign_in_not_before`, so a key sign-in in flight is refused (ADR 0093's rule), in the same transaction.
- **The hold of ADR 0093 D6.** The confirmation records `key_across_reset_cleared` where a hold exists, since no key
  registered before it is live; Unlock then works. The runbook's break-glass steps 3.1 and 3.2 go.
- **What the member is told.** A notice from an outbox the confirmation's transaction writes (ADR 0091's pattern):
  the keys on the account were removed by PaidWhole at a time, the next sign-in asks for the password and the code and
  then registers a key, and whom to tell if this was not expected. No name, practice or PHI.
- **Audit.** `hardware_key_removal_requested`, `hardware_key_removal_confirmed` (or `_cancelled`, `_expired`), both
  reserved from the application role's own inserts; `hardware_key_removed_at_provider` per deleted credential.
- **Refused, in words.** "Ask another platform administrator to confirm this removal" (the requester or the account
  confirming); "this request has expired; ask again"; "you cannot remove the keys of your own account".

## 4. For Lane A (migrations; none written here)

1. Part A's schema: the key registry, the removal request, their functions, the reserved audit actions, the session
   check for a key sign-in, the notice outbox and its trigger.
2. `membership_ended` moves `sign_in_not_before` as a completed reset does, if section 2's tests show a step begun
   before End membership still opens something.
3. A function for the operator role that records the provider's sign-out as an audit row, and one that returns a
   user's provider subject, so the job's payload drops it.

## 5. Tests first (Part B)

End membership with a queue and no provider: commits, sessions ended, one job, no provider call (both routes); a
rolled-back End membership leaves no job; the job: success, "no such user", a failure thrown for the retry, the last
attempt's line and re-send, the give-up; the role test that the worker's adapter uses only actions the role holds; the
alarm's filter; the in-flight cases of section 2.
