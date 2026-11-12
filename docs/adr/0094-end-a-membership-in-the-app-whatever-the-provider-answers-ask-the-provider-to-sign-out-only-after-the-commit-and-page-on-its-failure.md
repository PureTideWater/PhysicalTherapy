# 0094. End a membership in the app whatever the provider answers: ask the provider to sign out only after the commit, and page on its failure

- **Status:** proposed (`co-001/operator-removes-keys`, acting Lane B; `LANES.md` Queues item 29, Part B; no migration,
  index, table or function); accepted when the founder approves its pull request (docs/adr/0063). **Queues item 29 is
  not closed for launch by this record:** key removal (Part A), the sign-out's retry and the account's mark at a
  membership's end need one migration and ride `LANES.md` Queues item 37 (Lane A's schema chain). Follows
  [0091](0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md)
  D10 and
  [0093](0093-refuse-a-sign-in-step-begun-before-the-accounts-latest-password-reset-by-one-database-clock-and-read-an-unknown-reset-outcome-on-the-safer-side.md)
  D6 and "Not covered", and the after-commit work of
  [0092](0092-a-persons-ledger-action-never-waits-for-the-ledger-lock-it-takes-it-if-free-or-is-refused-at-once.md)'s
  second amendment of 2026-11-11.
- **Date:** 2026-11-12
- **Deciders:** the build (acting Lane B), on its design note of 2026-11-11; the orchestrator, who ruled on 2026-11-11
  that the sign-out's retry is a database outbox written by `membership_ended`'s trigger and claimed by a scheduled
  platform job (option Y), built with the schema chain and not here; the founder, on the pull request's review. Every
  option is judged under the founder's standing rule of 2026-10-18.
- **PRD sections:** 3 (Lifecycle events: a user who leaves an organization has their sessions revoked), 6 (Identity and
  sessions; the audit log; observability), 16 (Authentication; logging discipline: IDs and codes); CLAUDE.md's
  conventions for every mutation; test matrix SGN-19.

## Context

End membership is the one thing an organization's administrator or a platform administrator presses to cut a person
off at once. It is what the incident and support-mail runbooks reach for first when an account is thought to be in
another's hands.

- **It depended on the provider.** Both routes (`console.end_membership`, `settings.users.end_membership`) called the
  provider's sign-out inside the request's transaction. A provider that refused or could not be reached rolled the
  whole request back: the page showed an error and nothing had ended, at the moment the control mattered most. A slow
  provider held the transaction, and the rows it had locked, for as long as it took.
- **The Settings route never asked the provider at all.** It read the account's provider subject after ending the
  membership. Row-level security shows an administrator the `"user"` rows of people they administer; once the
  membership has ended, a person the administrator administers nowhere else is hidden, the read returned no row, and
  the sign-out was skipped in silence. The failing-first test for this record found it.
- **The provider has no administrative call for a hardware key,** and the app keeps no record of one (the design note's
  section 1). So what an operator can do about a key registered on an account is nothing, short of the founder's
  break-glass.

## Decision

- **D1. One transaction, no provider call inside it.** Both routes end the membership, end every session of the
  account (`revoke_user_sessions`) and write `membership_ended`, and commit. Authorization is unchanged:
  `organization.manage` (console) and `user.invite` (Settings) in the handler, the membership policies and
  `revoke_user_sessions`' own check in Postgres, and the database's refusal for an organization's only practice
  administrator.
- **D2. The provider is asked once, after the commit is confirmed.** `signOutAtProviderAfterCommit`
  (`apps/web/src/lib/auth/provider-sign-out.ts`) leaves the call with the request's after-commit work, which runs
  only when COMMIT itself answered that it committed. A refused, rolled-back or not-found End membership asks the
  provider nothing. A failure undoes nothing: the answer is still that the membership ended.
- **D3. The subject is read while the membership stands** (Settings): in the same statement shape as the update that
  ends it (this organization's membership, not the actor's own, not already ended), so the read can name no one the
  update would not end.
- **D4. A failed sign-out is one line at error and pages.** `security event: membership end provider sign-out failed`
  with `user_id`, `request_id` and `error_code` only: the provider error's name, or `NO_PROVIDER_SUBJECT` when the
  subject could not be read and the provider was not asked (never skipped in silence). Never the subject, an address
  or the error's text. `MembershipEndProviderSignOutFailed` (`infra/lib/security-events.ts`) alarms at one in five
  minutes on the operator topic; the runbook is docs/runbooks/incident-response.md, "An ended membership whose
  provider sign-out failed".
- **D5. Nothing here sends the sign-out again.** The retry is option Y, with the migration it needs, in Queues item
  37. Until it lands a failed provider sign-out is sent again only through the founder's break-glass, and the
  runbooks say so. Meanwhile the app's own state is what holds: no role in that organization and no session that was
  open.

## What a failed or missing sign-out leaves open (stated by tests, SGN-19)

End membership never disabled an account, and sign-in reads no membership: an account with no live membership can
still sign in, to a session that carries no role. That was so before this record. What the provider's sign-out adds
is the end of the provider's own tokens and grants. While it has not happened:

1. **A code step begun before End membership still opens a session** when its code is answered after it. The session
   carries no role in the organization the membership was in.
2. **A key-registration step begun before End membership still registers a key** for the step's 15 minutes, and the
   key then signs in, again to a session with no role. `hardware_key_registered` is audited, and the runbook's query
   finds it.

Neither is refused because the membership's end moves no mark: ADR 0093's rule compares a step's start with
`"user".sign_in_not_before`, which only a reset moves. Both cases are pinned as they stand in
`apps/web/src/lib/auth/sign-in.db.test.ts` (SGN-19), named open, so the change that closes them must change the
tests. Closing them is `membership_ended` moving the mark in its own transaction, by the database: a migration, so
Queues item 37.

## For Queues item 37 (one migration; none is written here)

1. **Key removal (Part A):** the key registry, the two-person removal request, their functions, the reserved audit
   actions, the session check for a key sign-in, the notice outbox and its trigger (the design note's section 3).
2. **The mark:** `membership_ended` moves `sign_in_not_before` as a completed reset does, closing the two cases above;
   SGN-19's two in-flight tests then assert the refusals SGN-17 states.
3. **The retry (option Y):** an outbox row written by `membership_ended`'s trigger, claimed by a scheduled platform
   job, which also retries a reset's failed sign-out (`PasswordResetProviderSignOutFailed`). For the operator role: a
   function that records the provider's sign-out as an audit row, and one that returns a user's provider subject.

## Consequences

- End membership works during a provider outage, and the person pressing it is told the truth about the app's state.
- A provider that fails is no longer visible on the page; it is visible to the operator, within five minutes, by IDs.
- The request still waits for the provider's answer before it answers (after-commit work is awaited), though no
  transaction and no row is held while it does.
- A web task stopped between the commit and the call writes no line and asks the provider nothing: the membership and
  sessions are ended, the sign-out is not sent, and nothing pages. Option Y closes this, since the outbox row is
  written in the transaction itself.
- Key removal stays on the founder's break-glass (the incident runbook's hardware-key section, unchanged).

## Alternatives considered

- **A no-migration job sent by the web** carrying the provider subject in its payload (Z): a new class of web-sent
  platform job, and an identifier in a job payload. Not taken.
- **Keep the call inside the transaction and catch its error:** the provider's slowness would still hold the
  transaction and its row locks.
- **Disable the account at the provider on End membership:** a person may hold memberships in other organizations, and
  the application role does not hold that action and should not.

## Revisit when

Queues item 37 lands (the retry, the mark and key removal): this record's "left open" section and the runbook's
break-glass lines for a failed sign-out are then amended.
