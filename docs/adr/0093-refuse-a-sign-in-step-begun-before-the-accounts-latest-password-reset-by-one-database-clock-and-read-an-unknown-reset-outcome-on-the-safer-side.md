# 0093. Refuse a sign-in step begun before the account's latest password reset, by one database clock, and read an unknown reset outcome on the safer side

- **Status:** proposed (`LANES.md` Queues item 28, `co-001/step-before-reset`, the schema pull request after
  [0091](0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md)'s;
  migration `20261112090000_sign_in_not_before.sql`). The founder's approval of the regenerated domain model (CO-02)
  accepts it. **Required before launch**, together with
  [0088](0088-a-confidential-cognito-client-and-second-factor-enrolment-only-inside-a-live-invitation.md)'s second
  release (the confidential client): see "What the rule does not cover". Closes ADR 0091 D10's two open cases and the
  lost-answer reset of its D15, and the reset item of
  [0081](0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md)'s
  forgotten-password amendment, "Not covered"; each carries a dated amendment.
- **Date:** 2026-11-11
- **Deciders:** the founder, under the standing rule of 2026-10-18, by approving the domain model (CO-02); Lane A's
  schema session (W8), 2026-11-11, under the co-founder's standing instruction, for the design and the rulings on its
  two reviews; Lane A's orchestrator, 2026-11-11, for taking the lost-answer reset into this item (D9). Each
  reversible by the founder
- **PRD sections:** 6 (Identity and sessions; the audit log; observability), 7 (Sign-in and MFA), 16 (Authentication;
  logging discipline: IDs and codes); `docs/product/sessions.md`; test matrix SGN-17 and SGN-18 (and SGN-16, whose two
  open cases close); ADRs [0009](0009-database-roles-and-forward-only-migrations.md), 0016, 0049, 0081,
  [0083](0083-read-a-months-triage-and-audit-report-in-batches-look-each-line-up-through-an-index-and-hold-only-a-small-measured-share-of-heap-per-line.md),
  0088 and 0091

## Context

A password reset ends every session of the account and signs the user out at the provider. It did not end a sign-in
that was under way. ADR 0091's security review reproduced two cases on the local provider twin (its SEC-01), and the
design of this change found two more on the base:

- **A code step.** A step that proved the old password before a reset opened a session when its code was answered
  after it. A new sign-in with the old password was refused, so only a step already past the password could do it.
- **A key-registration step.** A step that proved the password and the code before a reset, and stopped at registering
  a hardware key, held the provider's grant. When the provider's sign-out had no effect, the grant registered a key
  after the reset, and that key then signed in. A reset removes no key (ADR 0081 A5).
- **A sign-in racing the reset.** A session whose transaction committed while the reset's ran was missed by the
  revoke's snapshot and survived it.
- **A lost answer.** The Cognito client repeats a call by default. A `ConfirmForgotPassword` whose answer was lost was
  sent again, met its own used code and was answered as a refused code: the password changed, the person read "That
  did not match", no session ended and nothing was recorded. This one is not proven without a user pool; it is closed
  by construction (D9).

Nothing in the application tied a sign-in step to the account's latest reset.

## Decision

**The rule.** No sign-in attempt the application carries, begun at or before the account's latest recorded password
reset, opens a session, registers a key, enrols a factor or replaces a temporary password for that account
afterwards. "Begun" is read on the database's clock before the attempt's first provider call and carried, sealed,
through every later step of the attempt. The reset moves the account's mark on the same clock, in the transaction
that records it.

The rule needs no fact about Cognito's `auth_time`. It rests on one provider fact, not verified here: the provider
refuses the old password from the moment its confirm has answered (Not verified here).

**What the rule does not cover, and what does.** A call made at Cognito directly, with the pool's public client,
never passes the application. Someone holding the old password and the authenticator can open a challenge there
before the reset, answer it after, and register a passkey with the token. Only ADR 0088's second release (the
confidential client) closes that. So "required before launch" needs both: this rule, and the confidential client.

- **D1. The mark: `"user".sign_in_not_before`** (`timestamptz`, nullable; NULL means never reset). A new AFTER INSERT
  trigger on `audit_event`, `audit_event_sign_in_not_before`, moves it. Its guard is the password notice's (ADR 0091
  D3: the actor is a person and the object is that person's own account), for two actions:
  `password_reset_completed` and `password_reset_outcome_unknown` (D9). A test pins the guard equal to the notice
  trigger's, and the migration refuses to apply if the notice trigger's guard is not the one it read. The function
  is SECURITY DEFINER, owned by `tp_owner`, with its `search_path` pinned, and granted to no role. It:
  1. refuses to run outside READ COMMITTED (`0A000`): at REPEATABLE READ the sweep would read an old snapshot and
     could leave a session live while the mark moved. No caller does that today; the guard keeps it so;
  2. sets the mark to the later of itself and the clock (`GREATEST`, `clock_timestamp()`), which takes the account's
     row lock and never moves the mark back;
  3. ends every open session of the account (`revoked`), in a new statement and so on a new snapshot.

  So "the reset is recorded" implies "every session ended" in the database, whatever a caller did first. That is
  what ADR 0091 D10's line "Every session of this account has ended." rests on. It is a trigger of its own, not a
  branch of the notice's function: the notice's function stays the notice's, and no applied migration is edited.
- **D2. One lock order: the account's row first.** `sign_in_lock_account()` (SECURITY DEFINER; EXECUTE to `tp_app`)
  takes `FOR NO KEY UPDATE` on the acting account's own row. It takes no argument, so it can name no other account;
  no row is `42501`. `openSession` calls it first, before its device statements. The reset's transaction calls it
  first, before it revokes the sessions. Then every transaction that takes the account's row takes it before a
  device or a session row, the triggers' own lock is already held, and the sweep finds nothing a later statement
  opened. The first design took the account's row after a device row and closed a cycle with `resolve_session()`
  (session, then device): three connections deadlocked (`40P01`). With the two calls that cycle is gone; the one
  left is on the base already (Not covered). `FOR NO KEY UPDATE`, not `FOR SHARE`: the same transaction updates the
  row later, and two sign-ins of one account that each upgraded a shared lock would deadlock. It does not block
  foreign-key checks.
- **D3. The attempt's start: `sign_in_step_began()`.** The database's clock in whole milliseconds (volatile, SECURITY
  INVOKER, EXECUTE to `tp_app`). The flow calls it first when a sign-in starts (before the account read and the
  provider's sign-in) and when a hardware-key sign-in starts (before the provider's challenge). Whole milliseconds,
  so the value survives the driver's `Date` both ways exactly; truncation only moves a start earlier, the refusing
  side. The flow's pending step gains `began` (epoch ms) on `new_password`, `mfa_setup`, `mfa`, `key` and
  `register_key`. Every step built from another carries the same value, so an attempt has one start however many
  steps it takes, and no step is stamped again after its proof. It is not the web layer's `startedAt` (the web
  server's clock, per step, for the step's limit; ADR 0081 D2): two clocks cannot be compared safely.

  Why it is enough: a step that proved the old password asked the provider before the provider took the reset, which
  answered before the reset's transaction read the clock. Between the two readings lie at least the request leg of
  the sign-in's call, the answer leg of the confirm's call and the reset's own database statements: about one
  provider round trip, in the order of 10 ms.
- **D4. The database refuses a stale session: `user_session.sign_in_began_at`** (`timestamptz`, nullable).
  `openSession` writes it from the step (`tp_app` gains INSERT on that one column). A BEFORE INSERT trigger,
  `user_session_sign_in_not_before` (SECURITY DEFINER: an invoker's trigger would read through the caller's policies
  and skip a row the caller cannot see), for a row that carries a start, reads the mark under the account's row lock
  and refuses a start at or before it, by a constraint of that name (`check_violation`). Under the lock either order
  is right: the session's transaction first, and the reset waits for its commit and ends it; the reset first, and
  the insert waits, reads the moved mark and is refused. A start ahead of the clock is refused too: `'infinity'`, a
  value from the wrong clock or a units slip would otherwise pass for good, silently. A row with no start is neither
  checked nor locked: it is the previous image's insert (a rollback, and the minutes of a rolling deploy; ADR 0009,
  ADR 0049), which this schema must keep working. Locking it would be worse than not: it would then always land
  after the reset and never be swept. The gap stays open for that image alone.
- **D5. The flow refuses the steps, and the database records each refusal.**
  `sign_in_step_refused(target_user, began, step, request)` (volatile, SECURITY DEFINER, EXECUTE to `tp_app`; READ
  COMMITTED only; `step` from a closed list) is true when the account does not exist, there is no start, the start
  is ahead of the clock, or the start is at or before the mark. In the last case, the one that is evidence, it
  writes a `security_event` audit row for the account (the actor `system`; the purpose names the step:
  `step_before_reset_mfa`, `_key`, `_register_key`, `_new_password`, `_mfa_setup`, and
  `key_registered_across_reset`; the request ID), as `sign_in_failed()` writes its own. Checking and recording are
  one function, so no call site can refuse without the record. It counts no failure: a count would let a stale step
  lock the account.

  | Where | Account judged | Then |
  | --- | --- | --- |
  | The code step, before the provider is asked | the typed address's, if it names one | The step is closed. A stale code step counts no failure and uses up no code after the reset |
  | The hardware-key sign-in step | none here | The key step is sealed for any typed address with no proof; a refusal before a valid assertion would tell an outsider that the address has an account reset inside the step's life. Decided once the provider has accepted the assertion |
  | After the provider proved the person, once the account is found, not disabled and not locked; before the key check, the release and the session | the provider's subject's, and the typed address's when that is another account | The grant is released and the step is closed. The session insert carries the start (D4), and D4's refusal is recorded and answered the same way |
  | Key registration, at its options and at its verify, before the provider call | the step's account, and the typed address's account sealed beside it when it differs | The grant is released and the step is closed |
  | Key registration, again after the provider registered the key | the same | D6 |
  | A new password, and enrolment's two calls, after ADR 0088's own checks and before the provider call | the email's | The step is closed |

  **Both accounts.** The reset marks the account its typed address names; a sign-in opens a session for the account
  the provider's subject names. In a sound database they are one. Where they are not (a crossed state, reached only
  by an out-of-band change), judging both refuses the stale step without assuming which mapping is right, and
  refuses nothing for a sound account.

  Not checked: the reset step. It holds no proof (ADR 0081 A1): the mailed code is the authorization and its life is
  the provider's; a fresh step takes the same code.

  Each refusal also logs `security event: sign-in step refused after a password reset` (warn; `user_id`,
  `request_id`, and the step in `error_code`). It is counted on the web log group as `SignInStepRefusedAfterReset`
  (at least 1 in 300 s, to the operator topic) for every step but `key`: no password was proved there, and a new
  attempt succeeds. Why it pages: a reset requested in the same browser replaces that browser's pending step, so a
  stale step is another browser or device. At the code step it means the old password was proved around the reset;
  the operator tells the person their second factor may be known too, which the reset does not change
  (`docs/runbooks/incident-response.md`, "A sign-in step refused after a password reset").
- **D6. A key whose registration returns after the reset was recorded is removed or reported.** D5's check before
  the provider call reads the committed mark, so a registration already at the provider when the reset commits still
  registers; and the provider's sign-out is sent after the commit, so it cannot stop that call. After the provider
  answers that the key is registered, the flow asks `sign_in_step_refused` once more (step `key_registered`). If it
  is refused:
  - the provider is asked to remove the key (`removeHardwareKey`: Cognito's `DeleteWebAuthnCredential` with the same
    access token; the local provider drops it from its record), best effort;
  - `security event: hardware key registered across a password reset` is logged (error; `user_id`, `request_id`,
    `error_code` `removed` or `not_removed`) and counted as `HardwareKeyRegisteredAcrossReset` (at least 1 in 300 s),
    with a runbook step: not removed goes to the founder's break-glass, until `LANES.md` Queues item 29 gives the
    operator an action;
  - `hardware_key_registered` is audited only if the key is still there; the grant is released; the step is closed.

  Holding the account's lock across the provider's call would make this exact, and is rejected: the reset would wait
  on a provider call, and it buys nothing against someone who could have registered a moment earlier. A key
  registered before the reset is not this rule's: removing a member's keys is Queues item 29.
- **D7. What the person sees: nothing new.** A refused step clears the step and goes to the sign-in page with the
  closed-step words ("That sign-in step closed. Start again from your email and password.", or the key surface's
  line). True here, and it tells the holder nothing they do not learn from the old password's own refusal. An
  unknown outcome (D9) answers the existing "Sign-in could not continue. Start again.". No new words.
- **D8. A step sealed by the release before** carries no start. The web treats a step other than the reset step with
  no start as no step (start again), as ADR 0088 D3 did for a step with no subject; `sign_in_step_refused` is true
  for no start. While both images serve, an attempt an old task seals and a new task reads starts again, and may
  again; a step a new task seals and an old task finishes is not checked. Both end with the deploy. Deploy
  off-hours, as ADR 0088's cutover does.
- **D9. A reset whose outcome at the provider is unknown** (SGN-18; the orchestrator's ruling of 2026-11-11).
  - **One attempt.** `ConfirmForgotPassword` goes through a second Cognito client built with one attempt. It is a
    required option of the provider, so a composition cannot leave the default; a test reads the client's setting.
  - **Three kinds of answer.** The provider reset it. The provider answered and changed nothing: the code's refusals
    (one refusal, as before), the policy's, a refused credential, and any other client fault not named for a Lambda
    trigger (the platform's failure, as before). Anything else is an unknown outcome: no answer, a server fault, a
    trigger's failure.
  - **The safer reading of unknown.** The person is not told the code was wrong: the route answers "Sign-in could
    not continue. Start again." and ends the step. If the address names an account, one transaction as that account
    (retried once, as a reset's) takes its lock, ends its sessions and records `password_reset_outcome_unknown`
    (purpose `unverified_code`), on which D1's trigger moves the mark and sweeps; then the provider signs the user
    out, as after a reset. No password-changed email is queued: its words would claim a change nobody has proved.
    Instead `security event: password reset outcome unknown` (error; `user_id` or null, `request_id`, the provider
    error's name) is counted as `PasswordResetOutcomeUnknown` (at least 1 in 300 s), with a runbook step: the
    operator finds out whether the password changed and tells the person another way, as ADR 0091 D15 does for its
    line.
  - **What it costs.** Someone without the code can make the application end an account's sessions only when the
    provider's answer to their confirm is lost, which they cannot cause, inside the `sign_in` rate limit for that
    address; each time pages. The other reading leaves a reset that may have happened with its sessions live,
    unrecorded and unpaged.
  - Other provider calls keep the SDK's retries: a repeat of theirs is a refusal the person can retry.
- **D10. The migration** adds two nullable columns with no default (catalog-only: no rewrite, no scan), five
  functions, two triggers and one column grant. It takes `"user"` and `user_session` in ACCESS EXCLUSIVE (the
  columns) and `audit_event` in SHARE ROW EXCLUSIVE (the trigger), together, `NOWAIT` in one subtransaction, once a
  second, up to 300 tries (ADR 0083's loop). **What refuses a try** differs from the notice's migration, which took
  `"user"` in a mode readers do not refuse: here it is any open transaction that has touched `"user"` in any way, a
  read or a foreign-key check included, or `user_session`, or written `audit_event`; and a vacuum of the three.
  Every job and request reads `"user"`, and one reconcile pass (about 600 s at 2,000 lines) outlasts the five
  minutes. So: deploy with no reconcile queued or running, off-hours; a refused loop fails before any service moves
  and changes nothing; run it again (`docs/runbooks/deploy-and-rollback.md`). Safe with the previous image: every
  object is added; its inserts carry no start and are not checked; its reset still moves the mark and sweeps, since
  both are the database's. Rollback floor: none of its own.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Cognito's `auth_time` against a reset time (the schema plan's SEC-N5; ADR 0081's note) | Rests on a provider fact not verified; the tokens exist only once the step has finished |
| The web's `startedAt` against a database time | Two clocks: a web server ahead of the database lets a step begun just before the reset through |
| A per-account reset counter sealed at the start, equality at the end | Exact, but the start knows only the typed address and the end the provider's subject; binding them refuses any account whose two differ, for good |
| A global sequence as a logical clock | Exact on one primary and needs no clock; but one that restarts lower after a cut-over that did not carry it refuses every later sign-in of a reset account until it catches up, silently. A clock does not restart lower |
| A one-row counter table the reset bumps and the start reads | Exact, carried by a dump and by replication; but every reset on the platform then waits on one row for its transaction's life, and a table and its policies exist for one number. The clock is already what session limits trust |
| Transaction IDs | Reset by a dump and restore: the same lock-out as the sequence |
| A table of open steps the reset deletes | State for anonymous traffic and an expiry job, and the flow stops being stateless, for the same guarantee |
| Holding the account's lock across the key-registration call | D6 |
| Checking the mark in `resolve_session()` on every request | A second enforcement on the hot path; D1's sweep under the account's lock already ends what the reset must end |
| `revoke_user_sessions()` taking the account's lock first | Membership end would then hold the member's row across its provider call; D2 does it in the two transactions that need it |
| A table of its own for the mark | It would avoid the deploy's lock on `"user"`, at the cost of a join on every check, for good, to ease one deploy |
| Refusing a start older than any attempt can be | A second clock rule tied to the step limits, closing nothing: an old start is at or before any recent mark already |
| Reading an unknown reset outcome as a refused code | It leaves a reset that may have happened with its sessions live, unrecorded and unpaged (D9) |

## Consequences

- A reset ends what was under way as well as what was open: a stale step is refused, recorded and, where a password
  was proved, paged.
- "Every session of this account has ended." (ADR 0091 D10) is the database's own fact wherever the reset is
  recorded.
- A person whose own second tab held a step across their own reset starts again. They read words they already know.
- A fresh sign-in in the same millisecond as the reset's mark is refused and starts again. The comparison is never
  loosened; tests wait past the mark's millisecond.
- Three more pages for the operator, each with a runbook step. `SignInStepRefusedAfterReset` can page for a person's
  own second device; the operator asks.
- The deploy needs a quiet moment on `"user"` (D10).
- An unknown outcome ends an account's sessions on an unproved code (D9, What it costs).

## Known limits

- **A direct call to Cognito** while the client is public (What the rule does not cover).
- **The clock.** The database's clock is trusted not to step back by more than about one provider round trip inside
  an attempt's life (up to 6 minutes to a session, 21 to a key). Slewing never does; a failover lasts longer than
  any skew; nobody outside can cause one; session limits already trust it. A start ahead of the clock is refused
  (D4). A mark ahead of the clock (the clock stepped forward at a reset, then was corrected) refuses that account's
  sign-ins until the clock passes it: a runbook line, the owner's SQL.
- **A crossed state** (the typed address's account is not the subject's): the reset ends, marks and signs out the
  address's account, as before; D5 judges both, so the stale step is refused, but the subject's account keeps its
  sessions.
- **Completed resets nothing records**, so nothing is marked: one made at Cognito directly; one for an address with
  no account (SGN-16's stray case); the web's process ending between the provider's answer and the commit; the
  transaction failing twice (ADR 0091 D15 pages).
- **The previous image** opens sessions unchecked (D4, D8).
- **A registration already at the provider** when the reset commits is removed or reported, not prevented (D6). A
  factor enrolled across a reset would stay at the provider with the account not enrolled; no path reaches it (a
  code is sent only to an enrolled account) but a code taken from Cognito directly.
- **A second reset with an older code**, if Cognito keeps one valid after a later one completed, is not this
  rule's.
- **Other provider calls' repeats** (a code answer, a key registration) stay the SDK's.

## Not verified here

No user pool in this lane. These join ADR 0081's staging checks (its amendment of 2026-11-11), with a synthetic
account:

- the old password is refused at once after the confirm answers (a tight loop of sign-ins across one);
- the public client's token registers a passkey, and the confidential client refuses a direct `InitiateAuth` without
  the secret hash;
- what a repeated confirm answers;
- `DeleteWebAuthnCredential` with the app's token and the registration's credential ID;
- two codes, the first tried after the second completed.

## Not covered, and handed on

None blocks this decision. Each is for the orchestrator's queue.

1. The reset resolves its account by the typed address. Resolve it by the provider's subject, or detect a crossed
   state and page (Schema PR 6, sign-in identity).
2. `resolve_session()` and `revokeDevice` deadlock two ways on the base. One statement closes it: the device touch
   skips a locked row.
3. Once no image before this release can run: a migration that refuses a session with no start.
4. The other provider calls the SDK repeats.
5. An operator's own way to remove a member's keys: `LANES.md` Queues item 29. Until then a key not removed (D6)
   goes to the founder's break-glass.

## Revisit when

- ADR 0088's second release reaches production: the rule then holds for a call made at Cognito directly as well.
- The staging checks report: a provider fact that differs changes D9's classification or D6's removal.
- Queues item 29 lands: D6's `not_removed` gets an operator action, and the runbook step changes.
- No image before this release can run: handed-on item 3.
- `SignInStepRefusedAfterReset` pages mostly for people's own second devices: weigh the page against the signal.
