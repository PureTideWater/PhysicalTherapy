# Design: an operator removes a member's hardware keys, and End membership does not wait on the provider (`co-001/operator-removes-keys`)

W22 (acting Lane B), 2026-11-11. `LANES.md` Queues item 29; required before launch (the orchestrator's ruling). Base
58fb29e5 (#140, #142, #144, #149 merged). Sources: ADR 0091 D10, ADR 0093 D6 and "Not covered" 5, the incident and
support-mail runbooks' break-glass lines, `console.end_membership`, `settings.users.end_membership`, the provider
adapter. **Status: v2, 2026-11-11, after the orchestrator's rulings:** the design approved; ADR 0094 and SGN-19 for Part B; the
sign-out's retry is the outbox of section 2b, not a job the web sends; Part A and section 2b are `LANES.md` Queues item
37, Lane A's schema chain, required before launch. Part B's common part is built (WIP `co-001/wip-operator-removes-keys`).

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

## 2. Part B: End membership ends in the app whatever the provider answers

### 2a. Built now, no migration (ADR 0094, SGN-19)

- **One transaction, no provider call inside it.** Both routes end the membership, end every session of the user
  (`revokeUserSessions`) and write `membership_ended` (the wrapper's audit event). Role checks are unchanged:
  `organization.manage` (console) and `user.invite` (settings) in the handler, `membership_administrators_update` in
  Postgres, and the database's refusal for an only practice administrator.
- **The provider is asked once, after the commit** (`signOutAtProviderAfterCommit`, through #144's `afterCommit`). A
  failure undoes nothing and is one error line, `security event: membership end provider sign-out failed` (`user_id`,
  `request_id`, `error_code`: the provider's error name, or `NO_PROVIDER_SUBJECT`), counted by the alarm
  `MembershipEndProviderSignOutFailed` (at least 1 in 300 s), which pages the operator.
- **A fault found and fixed:** Settings' End membership read the provider subject after ending the membership, where
  row-level security hides the person's row from an administrator who administers them nowhere else, so the provider
  was never asked. It reads it first now.
- **What the app's own state does and does not refuse.** From the commit the person has no role in that organization
  and no session. The account can still sign in: `sign_in_account` reads no membership, and End membership never
  disabled an account. A missing provider sign-out adds only what the provider's own tokens can do: a key-registration
  step begun before it, for its 15 minutes, and calls made at the provider directly.
- **The limit, stated in the runbook and the PR:** until 2b lands nothing an operator holds sends a failed provider
  sign-out again; that one retry is the founder's break-glass.
- **Known and left to the reviews:** the request awaits the after-commit call, so a provider that hangs delays the
  page's answer by the SDK's timeout; a web task stopped between the commit and the call logs nothing (2b closes both).

### 2b. The retry, for Lane A (Queues item 37; the orchestrator's ruling: this, not a web-sent job)

ADR 0091's pattern, so nothing new to operate. Why not a job the web sends: every web-sent job is a practice job
(`practice_id` in its payload, key and scope), every platform job is scheduled with an empty payload, and the operator
role can neither read `"user"` nor write an audit row.

- **The outbox.** A table `provider_sign_out` (id; `user_id`; the event's `request_id`; `reason`: `membership_ended`
  or `password_reset_completed`; `queued_at`; `attempts`; `next_attempt_at`; `done_at`; `gave_up_at`; `last_error_code`
  as a short code, never text). No `practice_id`: it holds no PHI and no address; forced row-level security with no
  policy for the application role.
- **Written by the database.** The AFTER INSERT trigger on `audit_event` that ADR 0091 and 0093 already use writes one
  row for `membership_ended` (resolving the membership's user) and one for `password_reset_completed`, in the event's
  own transaction: a row exists if and only if the end committed, whichever route or future route ended it.
- **Claimed by a scheduled platform job** (`provider_sign_outs`, every minute, as the operator role) through two definer
  functions: a claim that returns due rows with the user's provider subject (`FOR UPDATE SKIP LOCKED`, a lease so a
  crashed run is taken up again), and a record of the outcome that also writes the audit row (`provider_signed_out` or
  `provider_sign_out_undelivered`, both reserved from the application role's own inserts). The job's payload stays empty.
- **Retries** on the notices' steps (1, 5, 15, 60 minutes) for 24 hours. The provider's call is idempotent, so a row
  claimed twice is harmless; "no such user" is done. The first failed attempt logs the line the alarm of 2a already
  counts (the same words, from the worker; the filter gains the platform log group); giving up logs it with
  `error_code` `GAVE_UP`.
- **The web then stops calling the provider** in both End membership routes, and the reset's own call after its commit
  goes the same way (its failed sign-out has no retry today). The worker needs a sign-out adapter of its own
  (`AdminUserGlobalSignOut`, which the shared task role already holds; the local twin does nothing), the user pool's ID
  in its environment, and the role test extended to scan it.
- **Tests:** the trigger writes a row only for those two actions and never for a rolled-back end; the claim's lease and
  skip; the steps; give-up; the reserved actions; the catalog and cross-tenant tests for the new table.

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

## 4. For Lane A: `LANES.md` Queues item 37 (migrations; none written here)

1. Part A's schema (section 3): the key registry, the two-person removal request, their functions, the reserved audit
   actions, the session check for a key sign-in, the notice outbox and its trigger.
2. Section 2b: the provider sign-out outbox, its trigger, its two functions and reserved actions.
3. `membership_ended` moves `sign_in_not_before` as a completed reset does, so a step begun before End membership opens
   nothing after it (Part B's in-flight tests state what is open today).

## 5. Tests (Part B, 2a)

Written first and green: End membership in both routes with a provider whose sign-out throws (the membership and
sessions ended and committed when the provider is asked, one audit event, one error line with IDs and a code only); a
refused End membership asks the provider nothing; the helper's three cases; the alarm's row, filter and words. Still to
write: the in-flight cases (a code step and a key-registration grant begun before End membership).
