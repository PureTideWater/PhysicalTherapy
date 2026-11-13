# 0095. Remove a member's hardware keys in the app's own registry, by two platform administrators; queue every provider sign-out in the database; move the mark when a membership ends

- **Status:** proposed (`LANES.md` Queues item 37, Lane A's schema chain; two migrations,
  `20261116090000_key_registry.sql` and `20261116091000_key_registry_validate.sql`); accepted when the founder approves
  its pull request (docs/adr/0063). Closes Queues item 29's Part A, the retry and the mark, which
  [0094](0094-end-a-membership-in-the-app-whatever-the-provider-answers-ask-the-provider-to-sign-out-only-after-the-commit-and-page-on-its-failure.md)
  handed on. Amends 0094 (D2 to D7, "left open", "Revisit when") and
  [0093](0093-refuse-a-sign-in-step-begun-before-the-accounts-latest-password-reset-by-one-database-clock-and-read-an-unknown-reset-outcome-on-the-safer-side.md)
  (D4, D6, "Not covered" 5); each carries a dated amendment that points here. Follows
  [0091](0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md)
  (the notice's shape), 0083 (the lock loop), 0049 (the platform jobs) and 0009 (add only).
- **Date:** 2026-11-12
- **Deciders:** the build (Lane A), on its design note and that note's two reviews and fix round of 2026-11-12; the
  orchestrator, who ruled on 2026-11-12 (R1 to R11 below, and the absence alarm of D16); the founder, on the pull
  request's review. Every option is judged under the founder's standing rule of 2026-10-18.
- **PRD sections:** 3 (Lifecycle events), 6 (Identity and sessions; the audit log; observability), 16 (Authentication;
  logging discipline: IDs and codes), 19 (monitoring and alerts); CLAUDE.md's conventions for every mutation; test
  matrix SGN-19 to SGN-27, SEC-25 to SEC-27, JOB-06 to JOB-08.

## Context

Until this record a member's hardware key lived only at the identity provider. Three things followed.

1. **Nobody but the founder could remove one.** A lost or stolen key, or a key that ADR 0093 D6 could not remove,
   went to the founder's break-glass at the provider, by one person, with no second check and no audit row of the
   app's.
2. **The provider's sign-out was sent by the web, once.** After a reset or an ended membership the web asked the
   provider to end the person's tokens after its commit (0091 D10, 0094 D2). A failure paged; nothing sent it again
   (0094 D5), and a web task that died between its commit and its call sent nothing and wrote no line.
3. **An ended membership left sign-in steps in flight.** A step begun before the membership ended could still open a
   session or register a key afterwards (0094, "left open"): the account's mark moved only at a reset.

## Decision

### The registry

- **D1. The app keeps its own registry of hardware keys, and the provider is not the source.** `hardware_key` holds one
  row a registered key: the SHA-256 of its credential ID and its public key. The provider cannot be the source because
  removal must be the app's act, under the app's two-person rule and audit log, and because whether a session may open
  must be decided where sessions are: in Postgres, under the account's row lock. The provider still holds the
  credential and still proves the assertion first (0093 D5).
- **D2. One live key an account (ruling R1).** A second key beside the first would be a silent second way in: nothing
  told the member or an administrator that it existed. A registration is refused while the account holds a live key. A
  credential once removed is never registered again, on any account.
- **D3. Two checks when a key session opens, and the app verifies the assertion itself.** After the provider has
  verified the assertion, the web reads the account's keys, refuses an unknown or a removed credential in the words of
  a wrong credential, and verifies the assertion against the registered public key itself, since the provider matched
  a credential by its own reading of the response and removal must not rest on an unread detail of that matching. No
  sign counter is stored or compared (see Alternatives). Then the trigger `user_session_hardware_key`, on every session
  insert and under the account's row lock, lets a key session open only with the digest of a live key of that account.
  There is no per-request read: the invariant is held by the lock at session open and by the removal ending the
  account's sessions under the same lock, and it is tested.
- **D4. The cleaning, by the member's own grant.** After an unknown or removed key is tried, the web deletes at the
  provider, with that member's own access token and never an administrator's credential, each credential whose digest
  is a removed key and each the registry does not know that the provider registered more than fifteen minutes before
  the attempt began. Never a live key, and never a young unknown one (it may be a key being registered in another
  tab). Best effort; its line carries a count and a code.

### Removal

- **D5. Two platform administrators, neither the account (the two-person rule, in Postgres).** One requests
  (`hardware_key_removal_request`), another confirms within 24 hours (`hardware_key_removal_confirm`); a request not
  confirmed by then expires. Each must, at the moment they act and the requester again at the confirmation: be an
  active account with a second factor, hold a live `platform_admin` membership of an internal organization that
  permits `organization.manage`, **more than seven days old with no role change recorded in the last seven days**
  (`account_removes_keys`: a role can be changed in place, so the membership's age alone does not measure time in the
  role); and act from **their own session, opened with a live registered key in the last fifteen minutes**
  (`actor_key_session`, ruling R9: the acting session, not any session of the account; a key registered within 24
  hours of that administrator's own removal does not act). The requester cannot confirm their own request. The account
  cannot request, confirm or cancel its own removal. Why seven days: an account raised to administrator minutes ago,
  by one person, would otherwise be the second person.
  **What the rule cannot prove:** that the two accounts are two people, or that they spoke. The runbook asks the
  confirmer to check with the requester by voice and both to reach the member on a channel PaidWhole already holds.
- **D6. All keys, never one.** A removal removes every key of the account. An administrator cannot tell a member's keys
  apart, and a removal that left one behind would leave the lost one as often as not. A removal is allowed for an
  account with no recorded key (a key from before the registry; ADR 0093 D6's hold).
- **D7. The account under an open request changes no internal membership (ruling R8).**
  `membership_removal_target_holds` refuses it, so the account cannot remove a confirmer or raise an ally while its
  own removal waits.
- **D8. A confirmed removal** marks every key removed, ends every session of the account, moves the account's mark
  (`sign_in_not_before`, as a reset does), records ADR 0093 D6's hold as cleared (`key_across_reset_cleared`: the
  console's Unlock, refused until then, works again), queues the provider's sign-out (D12), queues the
  member's notice (D11) and writes its audit rows, in one transaction.

### Registration after a removal

- **D9. Closed until an administrator opens it, with a one-time code read to the member (rulings Q3, R2, R3).** After
  a confirmed removal the account can register no key and, by the trigger of D3, **can open no session at all, by key
  or by code (R4)**: it is refused in Postgres, by name, so lowering `hardware_key_required` on the row opens nothing.
  An eligible administrator who is not the account (D5's test) opens registration in the console
  (`hardware_key_registration_open`): the database stores the SHA-256 of a one-time code, the console shows the code
  once, and the administrator reads it to the member by phone. The opening lasts one hour and five tries. The member
  signs in with password and authenticator code, types the registration code, and registers one key; that consumes the
  opening. A later confirmation, End membership or reset kills an opening. Why a code: an opening without a secret is
  an opening for whoever holds the stolen password and authenticator code, who need only poll for it (R3). The code is
  40 bits; the hour and the five tries bound guessing.
- **D10. The code is judged in the database before the provider is asked for anything.**
  `hardware_key_registration_judge` counts a try and answers; the web calls it first and passes the digest on to
  `hardware_key_record` only after `open`. `hardware_key_record` judges again under the lock and raises on a wrong
  code, so it counts no try itself (the migration's decision 7 below). Nothing trusts the sealed step's copy of the
  code.
- **D11. The member is told, from an outbox the database writes** (`hardware_key_notice`, ADR 0091's shape): `removed`,
  `registration_opened` and `registered_after_removal`. Each says to write to support at once if it was not expected.
  A notice not sent within 24 hours is never sent, and pages (`KEY_NOTICE_UNDELIVERED`).

### The provider's sign-out

- **D12. Every provider sign-out is a row the database writes in the cause's own transaction.** The trigger
  `audit_event_provider_sign_out`, on the audit event each act already writes (`membership_ended`,
  `password_reset_completed`, `password_reset_outcome_unknown`, a confirmed removal), inserts one `provider_sign_out`
  row. A committed act has its row; a rolled-back act has none. `membership_ended` is recorded only for a membership
  that transaction ended and did not create, so no caller forges a sign-out or a mark for another account. The row is
  on `audit_event` and not on `membership` because a reset and a removal owe a sign-out too. The outbox is its own
  table, apart from the mail outbox.
- **D13. The platform job `provider_sign_outs` sends it; the web never.** Every minute the job runs four steps:
  `sign_outs` (claim, ask the provider, mark done or failed), `overdue` (mark and report late and given-up rows),
  `removals_expire` (expire a removal request past its 24 hours) and `sign_outs_expire` (delete rows 90 days done). A
  failed try waits 1, 5, 15, then 60 minutes. The web holds no call, method or mention of the provider's sign-out
  (`AuthProvider.globalSignOut` is gone; `no-provider-sign-out.test.ts` scans for it). Why not both senders: two
  senders mean a paging line for a failure the job already retries, and a web task still dies between its commit and
  its call. **What the minute leaves:** the app's own sessions end and the mark moves at the commit; until the job's
  next run, at most about a minute, only the provider's own tokens still stand, and they open nothing in the app.
- **D14. Two pages, not one a failure.** `security event: provider sign-out not delivered` is written at error with
  `error_code` `LATE` (five tries, or four with no running lease: about 21 minutes) and `GAVE_UP` (30 tries, or 24
  hours and four tries), each at least once, with the sign-out's ID, the user's ID and the cause's request ID only.
  `ProviderSignOutNotDelivered` alarms on the platform log group at one. A retry that is working is not an incident; a
  sign-out 20 minutes late is. A row never tried is never given up: after a long outage it is claimed. It replaces
  `PasswordResetProviderSignOutFailed` and `MembershipEndProviderSignOutFailed`, whose lines the web no longer writes.
- **D15. The mark moves when a membership ends, on `membership`.** `membership_end_marks_account` moves
  `sign_in_not_before` and ends the account's sessions whoever ends the membership, whichever image. On `membership`
  and not on the audit row, so every writer is covered and the lock order (account, then membership) is kept. This
  closes ADR 0094's two in-flight cases: SGN-19's tests now assert SGN-17's refusals.
- **D16. Silence of the job pages (the orchestrator's ruling of 2026-11-12 on the build's open point).** The platform
  heartbeat says the process is alive and `JobFailedOnLastAttempt` says a run failed; neither hears a schedule that
  stops firing this one job, and then no sign-out is ever sent and no row is ever late (late needs tries). The job
  writes `provider sign-outs run` once a run, with counts only, and `ProviderSignOutsNotRunning` alarms on the
  platform log group when ten minutes hold no such line, missing data breaching.

### Housekeeping the design fixed

- **D17. Platform scope for the four tables.** `hardware_key`, `hardware_key_removal`, `hardware_key_notice` and
  `provider_sign_out` describe an account, not a practice: no `practice_id`, no PHI and no contact detail (the removal
  holds a digest of the address, never the address), FORCE ROW LEVEL SECURITY, one policy for the owner, and no
  privilege for either runtime role. Everything reaches them through SECURITY DEFINER functions with a fixed search
  path, granted by name to `tp_app` or `tp_operator` and revoked from PUBLIC.
- **D18. The names `step_before_reset_*` are kept** though a membership's end and a removal now move the same mark:
  renaming a constraint and a counted log line across a rolling deploy buys nothing a reader needs.
- **D19. `hardware_key_registered` is reserved later, not now:** the previous image writes it during the deploy, and
  reserving it now would break that image. The contract migration reserves it and makes the no-digest branch of the
  session trigger refuse always, once this release is the rollback floor.
- **D20. The constraint scans run in a second file** (`..._key_registry_validate.sql`) under SHARE UPDATE EXCLUSIVE,
  which blocks no read and no write, after the first file's exclusive locks are released.

## Decisions the migration took beyond the design note

1. `hardware_key_removal.address_sha256` (SHA-256 of the removal's ID, a colon, the lower-cased address at the
   request). `"user".updated_at` moves with every sign-in and with the confirmation itself, so it cannot say whether
   the address changed. The notice's claim compares the digest and fails the notice as `AddressChanged`; the job logs
   it and commits.
2. `hardware_key_notice.event_at`, not `removed_at`: two of the three kinds are not removals.
3. `operator_mail_expire` is replaced in place so key notices expire with the password notices.
4. `hardware_key_removals()` asks `organization.manage`, not the seven days: a new administrator sees the list and
   cannot act on it.
5. Two more helpers granted to no role: `hardware_key_opening_usable(uuid, timestamptz)` and
   `hardware_key_notice_report_undelivered(uuid, text)`. Code digests are compared after a second SHA-256 each side.
6. `operator_record_mail_event` keeps its seven columns: an undelivered key notice is on the audit log
   (`hardware_key_notice_undelivered`), not in a result column, so the previous platform image's select still works.
7. `hardware_key_record` raises on a wrong code, so it counts no try; only `judge` counts. The flow calls `judge`
   first (D10).
8. `provider_signed_out` does not record which outcome (`signed_out` or `no_such_user`); the job's log line does
   (`outcome_code`).

## Decisions the reviews added (2026-11-13, before the migration merged)

The reviews of the build and the orchestrator's rulings on them changed the two unmerged migrations and the code
around them. Each is tested by the row named (docs/product/test-matrix.md).

1. **The one-time code's digest is keyed.** The web stores and compares HMAC-SHA-256 of the normalized code under a
   32-byte key of its own (`registrationCodeDigest`), not a bare SHA-256; the database still holds only a digest and
   compares after a second SHA-256 each side.
2. **ES256 and RS256 only.** Registration offers the intersection of `KEY_REGISTRATION_ALGORITHMS` (-7, -257) with the
   provider's list, refuses an empty one (`KEY_ALGORITHMS_NOT_OFFERED`) and verifies with the same list. The public
   key's 1,024-byte cap stays; a post-quantum algorithm needs a verifier and a wider CHECK, and is queued.
3. **Four metric filters and alarms:** `ProviderSignOutAttemptsFailing`, `ProviderSignOutNoSuchUser`,
   `RelyingPartyMismatch`, `KeyAlgorithmsNotOffered`, each with its paragraph in docs/runbooks/incident-response.md.
4. **The sign-out run** holds a connection only for each short transaction, never across the provider's call, and a
   try the provider did not answer in time is the run's last.
5. **A reset the application could not record still signs the account out (SGN-28).**
   `provider_sign_out_unrecorded_reset(text)` writes the reserved action `password_reset_unrecorded` and the trigger
   queues the row (reason `password_reset_unrecorded`); `operator_provider_sign_out_request(uuid, text)` is the
   operator's way to queue one. A waiting row covers a later call only if it was never tried. Both store no request
   ID rather than fail on one outside the CHECK's pattern. The reset's paging line carries `outcome_code`.
6. **Late and given up (JOB-09).** A row is late by age: undone and queued over 15 minutes, whatever its tries or
   lease. It is given up at 30 tries, or at 24 hours only once one try was answered as failed (`last_error_code IS
   NOT NULL`), never under a running lease; a row never tried is never given up. A waiting row is paged late again
   every day: the sweep clears `late_reported_at` 24 hours after the acknowledgement. The claim returns the cause's
   request ID. The worker's step-failed line carries a new reviewed log field, `sqlstate_code`.
7. **No security event for a step judged with no beginning (SGN-29);** and **a wrong code at `hardware_key_record`
   is a counted guess (SGN-30):** it counts a try, records the refusal once an hour and returns no row, so the count
   commits; the web treats no row as the refusal. No code or no opening still raises.
8. **A refused act on a key removal leaves a trace that survives (SEC-28).** A refusal rolls its transaction back, so
   the routes' wrapper calls `hardware_key_removal_refused(text, text)` afterwards, bounded, as the acting account:
   one security event an hour for an account and a reason, from a closed list of eight (`not_permitted`,
   `two_people`, `not_own_account`, `requester_left`, `one_administrator_request`, `asked_again_too_soon`,
   `target_asks`, `no_third_administrator`). The web also writes one line for every refused act (`a refused act on a
   key removal`, by IDs and the reason's code); the lines are the count.
9. **The target of a request is bound, and only while the request can be confirmed (SGN-31).** A second trigger,
   `user_removal_target_holds` on `"user"`, stops the target changing any other account's status or hardware-key
   rule, as `membership_removal_target_holds` stops it changing an internal membership (otherwise a compromised
   target disables its requester and voids the request). Both bind under the same conditions, by the clock and not
   by the expiry job's mark: the request is not decided, is not past its 24 hours, its requester still passes
   `account_removes_keys`, it is that requester's earliest such request against an account that is a platform
   administrator now, and some account other than requester and target could still confirm it. A request that can
   no longer be confirmed protects no one, so it binds no one. The owner, acting as no account, is never bound: that
   is the way out the runbook names.
10. **What a request may hold is bounded, in `hardware_key_removal_request`.** Against a platform administrator: one
    request of a requester that can still be confirmed (`hardware_key_removal_one_administrator_request`); not again
    against the same administrator for seven days after its request there expired or was cancelled
    (`hardware_key_removal_asked_again_too_soon`); and none at all unless a third account passes
    `account_removes_keys` (`hardware_key_removal_no_third_administrator`), which writes no row and starts no wait.
    An account that is itself the target of a request that can still be confirmed requests no removal
    (`hardware_key_removal_target_asks`). All 23514. The function takes two transaction advisory locks first, on
    requester and target in the order of their IDs, before any row lock, so two requests of one requester cannot both
    pass the count and two accounts asking against each other at once are taken one after the other, the second
    refused. Requests against other accounts, and a request after a confirmed removal, are not limited.
11. **The product keeps at least three eligible platform administrators from launch.** With two, neither can request
    the other's removal (10), and the two-person rule has no second person for an administrator's own keys. With
    three, a compromised administrator can bind one colleague for one request's 24 hours, once in seven days, while
    the third can still disable it; if it removes the third first the binding ends with the third (9).

## Deploy and rollback

- **Staff register their keys once, at the deploy.** A key registered before this release has no registry row: the new
  image refuses and cleans it, and the person registers again. From the deploy until each staff account has done so,
  that account rests on its password and code, with no second person involved. Before launch that is staff and test
  accounts only. The runbook bounds it: staff register in the deploy's own session, and the operator compares the
  registry's count of live keys with the list of staff accounts before the deploy is called done.
- **A rollback of this release means no staff sign-in until roll-forward.** The schema needs no rollback, but under the
  previous image no account that has a registry row can sign in: that image's key session carries no digest and is
  refused, and its password-and-code path sees the provider's key and answers that a key is required. Customers who
  sign in with a code are not affected. It fails closed, which is the right side. Rolling back is therefore a decision
  to go without staff sign-in, and the way out is forward.
- **Either image may end a membership or record a reset during the deploy:** the row is queued by the database. The
  previous web also calls the provider itself, a second and harmless sign-out. The worker deploys with or before the
  web: a new web with no job asks the provider nothing until the job exists, and from this release
  `ProviderSignOutsNotRunning` says so.

## Amendments to earlier records

- **ADR 0093, D4.** D4 left a session insert that carries no start unlocked on purpose, for the previous image. Every
  session insert now takes the account's row lock, the previous image's included (`user_session_hardware_key` reads
  the registry under it). **D6:** the hold on an account whose key could not be removed is cleared by a confirmed
  removal (an administrator then unlocks the account), and the operator's step is the console, not break-glass. **"Not covered" 5** is closed by this record.
- **ADR 0094.** D2, D5, D6 and D7 (the web's call after the commit, no resend, the call after a lost commit, its ten
  seconds) are superseded by D12 to D14. **D3 is moot:** the Settings route no longer reads the provider subject at
  all; the trigger reads the account. D4's line and alarm are gone. "Left open" is closed by D15. The wrapper's
  `whenCommitUnknown` is removed with its one use: after a commit with no answer no handler work runs, and any later
  route that wants work for that case writes a row.

## Open, said plainly

- **A reset that recorded nothing queues no sign-out.** When both tries of a reset's transaction fail, or the database
  goes away after the provider took the new password, no cause committed, so no row exists and nothing asks the
  provider. The password is changed at the provider and the app's sessions stand. The one signal is
  `PasswordResetSessionsNotEnded`, and the runbook's step. The previous web did ask the provider in this case; the
  provider's sign-out never ended the app's sessions. Closing it needs a way to queue a sign-out without the reset's
  event: a function and a grant, so a migration. It goes to the security review, which says whether the runbook's step
  is enough before launch.
- **The web's task role can still send the sign-out.** The web and the worker share one task role, which holds
  `cognito-idp:AdminUserGlobalSignOut`. No code of the web sends it, and a test holds that. Splitting the role is
  queued as its own item before launch.

## Residuals

- A refused removal's security event is written after the rollback by the routes' wrapper, bounded: if that call
  fails the refusal stands and only the web's line remains. `hardware_key_removal_target_acts` (the trigger's own
  refusal) has no words in the console's list and no reason in the closed list.
- A bound target cannot end or change its own internal membership either (`membership_removal_target_holds` has no
  exemption for its own row, as the account trigger has), so it cannot step down while bound.
- While one request against an administrator stands, neither its requester nor its target can request against a
  third account; any other administrator can, or the requester cancels and takes the seven-day wait.
- The third is counted when the request is made and read again by the triggers, but an administrator six days in
  the role does not count though it could confirm tomorrow. A request not yet committed when its target's statement
  takes its snapshot does not bind that statement. `account_removes_keys` reads the transaction's start, the triggers
  the clock. Two accounts whose advisory keys collide (2^-64) could deadlock; one is ended, nothing written.
- The job reads the provider's "no such user" as done. A pool ID naming the wrong pool would turn every row into that
  answer; nothing checks the pool at start.
- `hardware_key_registration_judge` asked with no code counts a try, and the free "closed?" helper is granted to no
  role. A removal confirmed for an account that never had a key row spends one of the five tries on the member's first
  visit. For the contract migration.
- The cleaning skips a provider credential whose ID is not canonical base64url of 16 to 1,023 bytes; that the
  provider's credential ID is exactly the browser's is not verified against the provider; if it is not, the cleaning
  deletes nothing. It also compares the database's clock with the provider's for its fifteen minutes.
- One administrator can hold a closed account closed an hour at a time by opening registration and discarding the
  code; each opening is audited and sends the member a notice. The lost code has no early end.
- The console lists removals beside an organization's members; an account with no membership row has no row to act
  on. `organizationId` in the key routes' inputs serves the redirect only.
- The registration code crosses the server-action response to the administrator's browser and lives in page state
  until the page goes.
- The run's eight seconds are counted from the first claim and each provider call
  may take ten more; the job holds one of the operator pool's two connections for the run.
- `GAVE_UP` has no operator resend: the one manual sign-out left is the founder's break-glass, until an operator
  function exists.
- The e2e journey (request, confirm, open, the code typed, the new key registered) is not written.

## Consequences

- Key removal leaves the founder's break-glass, which stays only for the case with fewer than two eligible
  administrators who are not the account.
- A provider sign-out is retried until delivered or paged, whatever task dies.
- Two new tables' worth of functions are SECURITY DEFINER, and every session insert takes one more row lock.
- An account whose keys were removed cannot sign in until an administrator opens registration and the member registers.
  That is the price of R4 and is what the notice tells the member.
- Staff register their keys again at this deploy, and a rollback is a decision to go without staff sign-in.

## Alternatives considered

- **A per-request registry read in `resolve_session`:** redundant with the sweep under the lock, and on the path
  Queues item 36 is shrinking.
- **Trusting the provider's match alone:** removal would rest on a detail of the provider's matching nobody here has
  read.
- **Removing one key at a time:** D6.
- **A sign counter for clone detection:** many authenticators report zero, a false refusal locks a person out, and the
  provider may check it already. Recorded for the queue.
- **The web keeping its immediate call beside the outbox:** D13.
- **An opening without a code, or by the member alone:** D9.
- **Reserving `hardware_key_registered` now:** D19.

## Revisit when

- The contract migration lands (D19; the judge's free question).
- The task role is split, or the security review rules on the reset that recorded nothing.
- An operator function to resend a given-up sign-out exists: `GAVE_UP` leaves break-glass.
- The staging checks report on the provider's credential ID and its sign counter.
