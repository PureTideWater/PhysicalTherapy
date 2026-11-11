# Incident response: a security event or a suspected breach

The steps the [incident response policy](../policies/incident-response.md) sets (PRD 19: "Contain (revoke, rotate,
isolate); preserve evidence; assess scope from the audit log; notify under the BAA clocks and the HIPAA rule; customer
communication; post-incident review"). A draft for the security official's approval with the policy. Never paste PHI,
a real file, a key or a token into the incident record, a ticket, a chat or a session: name objects by their IDs.

## 0. Triggers

A security event alarm (failed-MFA burst, sign-in burst, WAF block surge, GuardDuty finding, a bulk export, a grant
change or role escalation outside a ticket, a refused second-factor enrolment, a refused client credential, one
account's reset requests reaching five in an hour, a password reset whose sessions were not ended, a password reset
whose provider sign-out failed), a finding of the weekly sign-in review below, a customer's or a
vendor's report, a lost device, a leaked credential, or anything that suggests PHI reached someone it should not.

## 1. Open the record (within one hour)

1. Write the **time of discovery** (UTC). It starts every notification clock.
2. Name the incident lead (the security official, or the on-call operator until they take over) and the scribe.
3. Keep a timeline from here on: who did what, when, and why.

## 2. Contain

Pick what fits; do the cheapest effective step first.

- **A user or session:** press End membership beside the person on their organization's console page (Console →
  Organizations → the organization). It ends every session of the user, signs them out at the identity provider and ends
  their role in that organization at once, in one step: if the provider refuses the sign-out, the page shows an error
  and nothing was ended. It does not disable the account or change its password, and the database refuses it for an
  organization's only practice administrator. The page lists members by their sign-in email and shows no user ID, so it
  needs the person, not only an ID. When the membership must stay, when the account must be disabled at the identity
  provider, or when only a user ID is known, give the user ID to the founder, whose break-glass session ends the
  sessions by user ID and disables the account at the identity provider. A disable at the provider ends no session of
  the app, and for an organization's only practice administrator the database refuses to disable the account's row as it
  refuses End membership: for that account the sessions are ended directly. Where the account's own row is disabled, its
  sessions end at their next request (`user_disabled`). A device is revoked by the person themself, on
  `/account/devices`.
- **A grant:** revoke it (Settings → Grants for the practice administrator; the console for a support grant). The next
  request is denied.
- **A credential or key:** rotate it in Secrets Manager and force a new deployment of the web and worker services
  (see [billing.md](billing.md) for Stripe's keys); for the KMS customer-managed key, follow the key-rotation runbook.
- **The whole service:** turn on maintenance (Console → Status → Maintenance). Customers see the maintenance page;
  the console stays reachable to platform administrators. Post a status incident (Console → Status) with the
  customer-visible effect only.
- **A component:** scale the affected service to zero, or block an address range in the WAF.

## 3. Preserve evidence

Before changing anything that would destroy it, keep:

- the audit log for the window (the nightly Object Lock copies hold earlier days, written once for seven years);
- CloudTrail, the load balancer's and the WAF's logs, the web and worker log groups for the window;
- the task definitions and image digests that were running;
- for a host-level finding, a snapshot of the affected volume.

Record where each copy is and its SHA-256 in the incident record.

## 4. Assess scope

From the audit log: which users read or changed which objects, in which practices, through which grant, between the
first and last suspect event (`audit_event` by actor, by object, or the practice's access log in Settings). List every
affected practice and, for each, whether unsecured PHI may have been acquired, accessed, used or disclosed. Counsel
decides, with the security official, whether the event is a breach under the HIPAA rule.

## 5. Notify

- **Clocks.** For each affected practice, the deadline is the shorter of the HIPAA Breach Notification Rule's 60
  calendar days after discovery and the period that practice's BAA sets. Write each deadline in the record and send
  well before it.
- **Who.** The practice (the covered entity) is notified by the security official. The practice decides on notice to
  patients, the Secretary and the media; the company provides what it needs (the scope from step 4, what was done).
- **How.** By the contact named in the agreement chain, from the template below, with no PHI in the email body; the
  detail goes in a document shared through a link that requires sign-in.

### Template: first notice to a practice

> Subject: Security incident affecting your workspace
>
> On [date of discovery, UTC] we discovered [one sentence: what happened, without identifiers]. We [contained it by
> ...] on [date]. Our assessment so far: [the practice's records that may be involved, by kind and count, not by
> patient]. We will send our full assessment by [date]. Your BAA's notice period is [days]; this notice is sent under
> it. Your contact for this incident is [name, role, phone].

### Template: status page update

> We are investigating [the customer-visible effect, e.g. sign-in is unavailable]. Data is [not / possibly] affected;
> customers who are affected are being contacted directly. Next update by [time, UTC].

## 6. Recover

Restore service only after containment is confirmed: redeploy a known-good image, re-enable users, re-issue grants
the practice approves again, turn maintenance off, and resolve the status incident.

## 7. Review (within ten business days)

Write the post-incident review: timeline, cause, what was affected, what is changed (code, configuration, policy), and
who owns each change. Update the risk analysis. If a control failed, add the test that would have caught it.

## An operational alarm, not a security event: a worker job's live heap (ADR 0083)

The alarm `JobHeapLivePeak` (on the operator topic, with the worker's other alarms) fires when a worker job's live heap
passed 75% of the worker's heap limit (420 of 560 MiB, `infra/lib/heap.ts`) in a five-minute period. Each job attempt
logs `job heap` as it ends, completed or failed, with `job_id`, `job_type`, `heap_live_peak_mib` (the largest heap in
use just after a major collection while it ran) and `heap_limit_mib`; the alarm takes the largest peak. It is the line
the weekly real-size run fails at (docs/runbooks/ci.md, `release-capacity`). The alarm alone does not mean a job
failed: it says the worker's live heap passed 420 MiB, so a month, or several practices' large jobs at once, used up
most of the margin that keeps the process from running out of heap. Running out would end every job then in flight;
step 3 checks whether any did. It is not a security event: open no incident record unless something else here applies.

1. In the worker's log group, find the `job heap` lines of the period above 420 and read their `job_id` and `job_type`.
   Then read that job's other lines by its ID (its outcome, any error code) and which other jobs ended in the same
   minutes. `heap_live_peak_mib` is the whole worker process's live heap, so every job running then logs the same peak:
   the job named saw the peak but did not necessarily cause it. Never add peaks together. Never copy a log line with
   anything but IDs and numbers into a ticket.
2. Read the weekly run's last summary (the `release-capacity` report, its "Live heap" column and each phase's peak): a
   month of about the same size that fails there, or passes close to 420 MiB, points at a reader that holds a month's
   lines; a clear pass points at size or overlap in production.
3. A heap out-of-memory ends the worker's process before it can log anything. The jobs that were running log neither
   `job heap` nor `job failed on its last attempt`, so the job-failure alarm stays quiet for them, and pg-boss retries
   them, under the same job IDs, once they expire. Look for the crash itself: a new `worker started` line in the
   worker's log group, and the stopped worker task's exit code and reason in the ECS service's events. Record those job
   IDs.
4. Whether or not jobs failed, open a ticket with the job IDs, types and peaks (IDs and numbers only), and fix forward:
   the bound goes back to the reader that outgrew it (ADR 0083: no job holds a month's lines beyond a small, measured
   per-line holder), never a larger heap alone.

## An operational alarm, not a security event: the database's connections (ADR 0083)

The alarm `DatabaseConnections` (on the operator topic) fires when the database held 316 or more connections at any
moment of a five-minute period: 80% of the 394 `max_connections` the stack reads for db.t4g.medium, production's and
staging's class (in dev, 135 of the 168 it reads for db.t4g.small; `infra/lib/connections.ts`). Each stack's synthesis
checks that every task's pools, all of them full at once while a deploy runs old and new tasks side by side (dev's
worker stops first, so it counts once), plus a reserve of 10, stay under what the budget estimates the application
logins can open: 389 on db.t4g.medium (394 less the 5 RDS keeps for superusers) and 163 on db.t4g.small. The worst case
is 207 in production, 165 in staging and 140 in dev. So the alarm means connections the budget does not count: more
tasks than the settings, a pool larger than its code says, connections that are never given back, or a client outside
the tasks. The alarm alone does not mean anything failed. 389 is the budget's lower bound, not the instance's limit: the
budget assumes RDS keeps more of the class's memory than it was measured to (a 4 GiB instance on PostgreSQL 17 gave
402), so the instance most likely refuses later. Its own limit is `SHOW max_connections` (or the parameter group's value, where
it sets one) less those 5, read in a session as the operator; until staging's measured figure replaces the estimate in
`infra/lib/connections.ts` (ADR 0083's revisit list), compare the console's count with that, never with 389. Past it
the database refuses new connections: the request or job that wanted one fails, and a job's attempt logs `job attempt
failed` with `error_code` `DB_53300` (too many connections). It is not a security event unless step 3 finds a client
nobody can name: then open the record (section 1).

1. In the RDS console, read the instance's `DatabaseConnections` over the last day. A rise during a deploy that falls
   back once the old tasks stop is the deploy; a level that stays up, or keeps climbing between deploys, is not.
2. In ECS, compare each service's running tasks with its desired count (production: web 2, worker 1, platform 1,
   screening 1 once launched; dev and staging: one of each). More tasks than that, a deploy stuck with old and new tasks
   both running, or a task someone started by hand, explains most of it. In the worker's, the platform's and the
   screening consumer's log groups, look for `job attempt failed` with `DB_POOL_TIMEOUT` (a pool was full) or
   `DB_53300` in the same minutes, and record the job IDs.
3. If steps 1 and 2 do not explain the count, the connections come from outside the tasks: a person's session, a tool,
   or a client that should not connect. Any client you cannot name is a security event: section 1.
4. Open a ticket with the counts, the task counts and the times (IDs and numbers only, never a query's text), and fix
   forward in code: a pool, a task count or the database's class changes in the repository, and the stack's synthesis
   checks the budget again. Never raise `max_connections` in the console or by hand: the parameter group is code, and a
   value the budget does not know leaves the alarm and the check measuring the wrong limit.

## A password reset whose sessions were not ended (`PasswordResetSessionsNotEnded`; docs/adr/0091, D15)

A security event alarm, unlike the two sections before it. It fires (on the operator topic, at one in five minutes) on
the web's line `security event: password reset sessions not ended`.

1. **What it means.** A reset was completed with the code sent to the account's mailbox, so Cognito holds the new
   password; but the transaction that ends the app's sessions of that account and records the reset failed twice, so
   those sessions were not ended, the reset was not recorded (no `password_reset_completed`), and no password-changed
   email was queued (docs/adr/0091). The person was answered "could not continue". An enrolled second factor still
   guards the account (docs/adr/0081 A5).
2. **Read the line**; the alarm names no user, and it pages when it goes into ALARM, not once a line. In Logs Insights
   on `/tp/<env>/web`, from five minutes before the alarm was raised until it is back at OK:

   ```
   fields @timestamp, user_id, request_id
   | filter msg = "security event: password reset sessions not ended"
   ```

   Keep the user IDs and request IDs only.
3. **Contain at once** (section 2, "A user or session"): end the user's sessions, which is what the failed transaction
   did not do. Find the person's own organization from the user ID (docs/runbooks/deliverability.md, 3.10, "In every
   case", step 1: its statement lists practices of the user's own organization only, never one the user reached by a
   grant) and press End membership beside them. Where the statement returns no row, where the page does not make plain
   which member the user ID is, or where the membership must stay, give the user ID to the founder, whose break-glass
   session ends the sessions by user ID and disables the account at the identity provider (section 2 says what a disable
   there does not end, and what the database refuses for an organization's only practice administrator).

   **Move the account's mark as well** (docs/adr/0093): the failed transaction did not record the reset, so the
   mark that refuses sign-in steps begun before it did not move, and a step that proved the old password before the
   reset can still open a session until it does. Nothing retries it. Give the user ID to the founder, whose
   break-glass session runs, as the owner, the two statements the reset's trigger runs (the account's row first):

   ```sql
   BEGIN;
   UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp())
    WHERE id = '<user_id>' RETURNING id, sign_in_not_before;
   UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked'
    WHERE user_id = '<user_id>' AND ended_at IS NULL RETURNING id;
   COMMIT;
   ```

   One row from the first statement, then the sessions it ended. Do not insert a `password_reset_completed` event
   in its place: that would queue a password-changed email dated at the repair, not at the change, and step 4 tells
   the person instead.
4. **Tell the person another way**, through their own organization's administrator or the account contact (step 3's
   organization; with no row there, through the founder), working by user ID: their password was changed at the line's
   time. If it was not them, open the record (section 1) and follow docs/runbooks/support-mail.md's "Password changed,
   not by me". If it was, once the administrator confirms it, a platform administrator adds the person back with Send
   invitation on the organization's console page, the same address and role (or the founder re-enables an account the
   break-glass session disabled), and the person signs in with the new password.
5. **Find the cause.** The line carries no error code (the flow's retry drops it), so read the web's and the database's
   errors and alarms in the same minutes (the database's connections, above, for example).
6. **Record it** in a ticket by user ID and request ID, never an address or a name.

## A password reset whose provider sign-out failed (`PasswordResetProviderSignOutFailed`; docs/adr/0091, D10)

A security event alarm as well. It fires (on the operator topic, at one in five minutes) on the web's line `security
event: password reset provider sign-out failed`.

1. **What it means.** A reset was completed, and the sign-out at Cognito that follows every completed reset failed.
   Unless `PasswordResetSessionsNotEnded` is raised for the same request, the app's sessions of the account ended and
   the reset was recorded as usual, and its password-changed email is queued. What the failed sign-out leaves open is a
   sign-in step begun before the reset that had passed the password and the code and stopped at registering a hardware
   key: its grant from Cognito still works for up to 15 minutes, so a key can be registered after the reset, and that
   key then signs in without the password (docs/adr/0091, D10). Only an account that must sign in with a hardware key
   and has none can be in that step: one of PaidWhole's own platform administrators, contract specialists, reimbursement
   reviewers or support engineers, never a customer's account.
2. **Read the line**; the alarm names no user, and it pages when it goes into ALARM, not once a line. In Logs Insights
   on `/tp/<env>/web`, from five minutes before the alarm was raised until it is back at OK:

   ```
   fields @timestamp, user_id, request_id, error_code
   | filter msg = "security event: password reset provider sign-out failed"
   ```

   Keep the user IDs, the request IDs and each line's time only. `error_code` is the name of the provider's error.
3. **Look for a key registered since the reset**, in a session as the operator role (`tp_operator`), with the line's
   user ID and request ID:

   ```sql
   SELECT action, purpose, at, request_id FROM audit_event
   WHERE actor_id = '<user_id>' AND action IN ('hardware_key_registered', 'sign_in')
     AND at >= (SELECT min(at) FROM audit_event
                WHERE action = 'password_reset_completed' AND request_id = '<request_id>')
   ORDER BY at;
   ```

   It starts from the reset's own row, which carries the line's request ID: the line's time is the web task's clock,
   written after the sign-out had failed. If `PasswordResetSessionsNotEnded` is raised for the same request, the reset
   has no row and this returns nothing: follow that section, which contains first. Run it again when 15 minutes have
   passed since the line.
4. **Read each row.**
   - A `hardware_key_registered` row is what the failed sign-out makes possible: treat it as a takeover until the
     person says otherwise. Open the record (section 1) and contain (section 2, "A user or session"). If End
     membership answers with an error, the provider is still refusing the sign-out and nothing was ended: give the
     user ID to the founder. The key is one that neither a reset nor End membership removes, and that signs in without
     the password: tell the founder of it in every case, and do not add the person back until the founder has dealt
     with that key. The account is one of PaidWhole's own (step 1), so the person is told, and asked whether the key
     was theirs, through the founder, never through a customer's organization.
   - A `sign_in` of purpose `webauthn` by a user with no `sign_in` of that purpose before the reset is treated the
     same. How many the audit log holds from before it:

     ```sql
     SELECT count(*) FROM audit_event
     WHERE actor_id = '<user_id>' AND action = 'sign_in' AND purpose = 'webauthn'
       AND at < (SELECT min(at) FROM audit_event
                 WHERE action = 'password_reset_completed' AND request_id = '<request_id>');
     ```

   - A `sign_in` of purpose `totp` is not a sign of it: it is what a person does after their own reset, and an
     account that signs in with an authenticator code is never in a key-registration step. End no membership for it;
     record and close.
5. **If there is no such row after 15 minutes**, record it and close: a ticket by user ID and request ID, never an
   address or a name. Until the client is confidential (ADR 0088's release N+1) a token taken at Cognito directly
   outlives the 15 minutes: ask the founder to make the sign-out again for that user, and read `sign_in` rows of
   purpose `webauthn` for that user in the week's review (step 3's statement, run again there).
6. **Find the cause** from the line's `error_code` and Cognito's service health in the same minutes: a throttle, an
   outage at Cognito, or the application role without `cognito-idp:AdminUserGlobalSignOut`
   (`infra/lib/constructs/application-role.ts`).

## A sign-in step refused after a password reset (`SignInStepRefusedAfterReset`; docs/adr/0093, D5)

A security event alarm as well. It fires (on the operator topic, at one in five minutes) on the web's line `security
event: sign-in step refused after a password reset`, for every step but the hardware-key sign-in step (`key`), which
is logged and not counted.

1. **What it means.** Someone began a sign-in before the account's latest password reset, got past the password, and
   answered a later step after the reset. The step was refused: no session opened, no key was registered, and nothing
   was counted against the account. A reset asked for in one browser replaces that browser's own pending step, so
   the stale step came from another browser or device. It can be the person's own second tab, phone or laptop. It
   can also be someone who held the old password.
2. **Read the line**; the alarm names no user, and it pages when it goes into ALARM, not once a line. In Logs Insights
   on `/tp/<env>/web`, from five minutes before the alarm was raised until it is back at OK:

   ```
   fields @timestamp, user_id, request_id, error_code
   | filter msg = "security event: sign-in step refused after a password reset"
   ```

   Keep the user IDs, the request IDs, each line's time and its `error_code`, which is the step: `mfa` (the code
   step), `register_key` and `key_registered` (registering a hardware key), `new_password` and `mfa_setup` (an
   invited person's first sign-in), `key` (a hardware-key sign-in). The audit log holds the same refusal as a
   `security_event` for the user, its purpose `step_before_reset_<step>`, once for a step and a reset: a step tried
   again writes the line each time and no second row. The line is written only for a step begun at or before the
   reset. A start ahead of the database's clock is refused too and logs `sign-in step start is ahead of the database
   clock` at error instead, which is a clock fault and raises no alarm of its own.
3. **Tell the person another way**, through their organization's administrator or the account contact, working by
   user ID: a sign-in begun before their password reset was tried after it, at the line's time, and was refused. Ask
   whether it was theirs.
4. **If it was not theirs, or they cannot say**, treat it as an attempted takeover: open the record (section 1). The
   reset already ended the sessions and changed the password. At the code step (`mfa`) the old password was proved
   around the reset and a code was about to be answered, so tell the person their second factor may be known too. A
   reset does not change a second factor; until a factor reset exists, the person's ticket follows
   docs/runbooks/support-mail.md, "Sign-in help tickets". At `register_key` or `key_registered` the other party had
   passed the code as well: tell the person the same, and look at the next section's alarm for the same user.
5. **If it was theirs**, record it and close.
6. **Record it** in a ticket by user ID and request ID, never an address or a name.

**A mark ahead of the clock.** If a person with the right password and factor is refused as a closed step on every
try, and this line is written for each, the account's mark may be ahead of the database's clock (the clock stepped
forward at a reset and was then corrected). The refusals stop by themselves once the clock passes the mark. To see
it, in a session as the operator role (`tp_operator`) where it can read the row, or else the founder's:

```sql
SELECT sign_in_not_before, sign_in_not_before > clock_timestamp() AS ahead FROM "user" WHERE id = '<user_id>';
```

If `ahead` is true and the wait is too long, give the user ID to the founder: only the owner's SQL moves a mark, and
only back to the clock, never before a real reset.

## A hardware key registered across a password reset (`HardwareKeyRegisteredAcrossReset`; docs/adr/0093, D6)

A security event alarm as well. It fires (on the operator topic, at one in five minutes) on the web's line `security
event: hardware key registered across a password reset`.

1. **What it means.** A key-registration step begun before a reset had its call at the provider when the reset was
   recorded, and the provider registered the key. The app saw that the step was stale once the provider answered,
   asked the provider to remove the key, and closed the step. The removal is expected to fail at Cognito, because
   the reset's own sign-out ends the token it uses. When it fails the app locks the account, as ten failed sign-ins
   do, so the key signs in to nothing. The line says which of the three happened.
2. **Read the line**, as above:

   ```
   fields @timestamp, user_id, request_id, error_code
   | filter msg = "security event: hardware key registered across a password reset"
   ```

   Keep the user IDs, the request IDs, each line's time and its `error_code`: `removed`, `not_removed` or
   `not_removed_not_locked`.
3. **`not_removed`: the key is still on the account, and the account is locked.** A locked account is refused before
   any credential is tried, so the key opens nothing while the lock stays. Open the record (section 1). Give the
   user ID to the founder: nothing an operator holds removes a key (not a reset, not End membership), so the
   founder's break-glass removes it, until `LANES.md` Queues item 29 gives the operator an action. The account
   cannot be unlocked meanwhile: the database holds it, and the console's Unlock answers "this account is locked
   because a hardware key was registered across its password reset; it stays locked until the key is removed and the
   removal is recorded (incident runbook, the hardware key section); then unlock it again". An unlock before the key is gone would hand the account to whoever holds the key. The audit
   log holds `hardware_key_registered` and a `security_event` with the purpose `account_locked_key_across_reset`
   for the user at the line's time. The person cannot sign in meanwhile; step 5 tells them why. Then, in order:
   1. The founder's break-glass removes the key at the provider and confirms that the user has no key left.
   2. Only then, the founder's break-glass session records the clear, as the owner (the application role cannot
      write this row), in one transaction that holds the account's row, so a lock for another key that is being
      recorded at that moment is waited for and is not cleared unseen. After the first statement, check at the
      provider once more that the user has no key, then record and commit:

      ```sql
      BEGIN;
      SELECT 1 FROM "user" WHERE id = '<user id>' FOR UPDATE;
      INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose)
      VALUES (clock_timestamp(), 'system', 'security_event', 'user', '<user id>', 'key_across_reset_cleared');
      COMMIT;
      ```

   3. A platform administrator unlocks the account in the console. If the account is locked for a key again
      later, the hold returns and this step is done again.
3a. **`not_removed_not_locked`: the key is still on the account and the lock failed too.** This is the urgent case:
   a hardware key signs in without the password. Contain at once (section 2, "A user or session"), give the user ID
   to the founder for the break-glass now, and do not add the person back until the founder has dealt with the key.
4. **`removed`: the key is gone.** Look in the audit log for a `sign_in` by that user after the line, in a session as
   the operator role:

   ```sql
   SELECT action, purpose, at, request_id FROM audit_event
   WHERE actor_id = '<user_id>' AND action IN ('hardware_key_registered', 'sign_in')
     AND at >= '<line time>'::timestamptz
   ORDER BY at;
   ```

   A row is treated as a takeover until the person says otherwise ("A password reset whose provider sign-out
   failed", step 4).
5. **Tell the person another way** in both cases, by user ID: a hardware key was registered on their account at the
   moment of their password reset, and was removed, or is being removed with their account locked until it is.
   Whoever registered it had passed the password and the code, so their second factor may be known too. Ask whether it was theirs; a person who wanted
   the key registers it again after signing in.
6. **Record it** in a ticket by user ID and request ID, never an address or a name.

## A sign-in refused for a crossed account (`SignInRefusedCrossedAccount`; docs/adr/0093, D5)

A security event alarm as well. It fires (on the operator topic, at one in five minutes) on the web's line `security
event: sign-in refused for a crossed account`.

1. **What it means.** A person passed the password and the second factor, and the address they typed names one
   account in the app while Cognito's subject for the person who signed in names another. A sound database never
   holds that: it comes from a change made outside the app (an address edited at Cognito or in the database, two
   users sharing one). The sign-in was refused outright: no session opened and no key step began, because a reset
   marks and ends one of the two accounts and a session would open for the other.
2. **Read the line**, as above:

   ```
   fields @timestamp, user_id, request_id
   | filter msg = "security event: sign-in refused for a crossed account"
   ```

   `user_id` is the account Cognito's subject names. Keep the user IDs and request IDs only.
3. **Compare the two sides by ID.** In a session as the operator role, read that user's row (its ID, status and
   Cognito subject, never copying the address into a ticket), then in the Cognito console read the user with that
   subject and the user with that address. Open the record (section 1) if anyone but the platform could have made
   the change.
4. **Let neither account sign in until they agree.** The refusal already holds for every try. Give both user IDs to
   the founder: repairing the mapping is the owner's, until Schema PR 6 (sign-in identity) gives it a path. End the
   sessions either account still has (section 2, "A user or session"): a reset in this state ended only the
   address's account's.
5. **Record it** in a ticket by user ID and request ID, never an address or a name.

## A password reset whose outcome is unknown (`PasswordResetOutcomeUnknown`; docs/adr/0093, D9)

A security event alarm as well. It fires (on the operator topic, at one in five minutes) on the web's line `security
event: password reset outcome unknown`.

1. **What it means.** A person confirmed a reset with a code, and Cognito did not say whether it changed the
   password: no answer after the request may have been sent, a server fault, or a trigger's failure. (A connection
   that never reached Cognito is not this: nothing changed, and the person saw the platform's failure.) The confirm
   is sent once and never repeated. The app
   took the safer reading: it ended the account's sessions, moved the account's mark so that sign-in steps begun
   before it are refused, recorded `password_reset_outcome_unknown`, and signed the user out at Cognito. It queued
   **no** password-changed email, since nobody has proved a change. The person was answered "Sign-in could not
   continue. Start again.", not that the code was wrong.
2. **Read the line**, as above:

   ```
   fields @timestamp, user_id, request_id, error_code
   | filter msg = "security event: password reset outcome unknown"
   ```

   Keep the user IDs, the request IDs and each line's time. `error_code` is the name of the provider's error. A null
   `user_id` is an address the app has no account for: nothing was ended or recorded; go to step 5.
3. **Find out whether the password changed.** In the Cognito console, or with `admin-get-user` for the user's
   subject, read the user's last-modified time: one at the line's time means the reset was applied. Where that does
   not settle it, ask the person (step 4): the password that signs them in tells which.
4. **Tell the person another way**, through their organization's administrator or the account contact, working by
   user ID, as ADR 0091 D15's section does: a reset of their password was tried at the line's time, it may have
   taken effect, and they were signed out everywhere. If the password changed and it was not them, open the record
   (section 1) and follow docs/runbooks/support-mail.md's "Password changed, not by me". If it was them, they sign in
   with whichever password works, or ask for a new code.
5. **Find the cause** from the line's `error_code` and Cognito's service health in the same minutes: an outage or a
   throttle at Cognito, a network fault between the web task and Cognito, or a failing Lambda trigger on the pool.
   If `PasswordResetSessionsNotEnded` is raised for the same request, the transaction that ends the sessions failed
   twice as well: follow that section's step 3.
6. **Record it** in a ticket by user ID and request ID, never an address or a name.

## Weekly sign-in review

The reset and enrolment alarms (docs/adr/0088, D7; test matrix SEC-23) tell the operator within the hour; this review
keeps the daily figure ADR 0081 A4 asked for, from the audit log, which records every reset request for an account
(`password_reset_requested`, the actor being the account named). Run it each Monday for each environment with
accounts, in a session as the operator role (`tp_operator`), which reads `audit_event` and can change nothing in it.

1. The accounts with more than ten reset requests in a day over the last seven days:

   ```sql
   SELECT object_id AS user_id, date_trunc('day', at) AS day, count(*)
   FROM audit_event WHERE action = 'password_reset_requested' AND at > now() - interval '7 days'
   GROUP BY 1, 2 HAVING count(*) > 10 ORDER BY 3 DESC;
   ```

2. For each row, read that account's other events in the window (`audit_event` by `object_id`: failed sign-ins, a lock,
   `password_changed`), and the per-user alarm's history. The alarm names no user; while it is raised, the rule's top
   contributors name them: `aws cloudwatch get-insight-rule-report --rule-name tp-<env>-password-reset-requests-per-user
   --start-time <start> --end-time <end> --period 3600 --metrics MaxContributorValue --max-contributor-count 10`.
3. Ask the organization's administrator whether the person asked for the codes. If not, or if the requests ended in a
   changed password nobody asked for, it is a security event: open the record (section 1) and contain the account
   (section 2).
4. Read the week's history of the other reset and enrolment alarms (`PasswordResetNotDeliveredConfig`,
   `PasswordResetNotDeliveredThrottled`, `PasswordResetRequestFailed`, `SecondFactorEnrolmentRefused`,
   `ClientCredentialRefused`, `ClientCredentialProbeRefused`, `PasswordResetRequestOverFloor`,
   `PasswordResetSessionsNotEnded`, `PasswordResetProviderSignOutFailed`, `SignInStepRefusedAfterReset`,
   `HardwareKeyRegisteredAcrossReset`, `PasswordResetOutcomeUnknown`, `SignInRefusedCrossedAccount`): each one raised
   that no ticket or incident record already explains gets one. For each `PasswordResetProviderSignOutFailed` of the week, run its section's step 3
   again for that user: a `sign_in` of purpose `webauthn` since the reset, by a user with none before it, is a finding,
   since a token taken at Cognito directly outlives that section's 15 minutes until the client is confidential.
5. Check that no undelivered password-changed email was missed (docs/adr/0091, D9). Its page is a log line, and
   several can share one page; the audit log keeps one `password_notice_undelivered` a notice whether or not its line
   was read:

   ```sql
   SELECT object_id AS user_id, at, request_id FROM audit_event
   WHERE action = 'password_notice_undelivered' AND at > now() - interval '7 days'
   ORDER BY at;
   ```

   Each row has a ticket (docs/runbooks/deliverability.md, 3.10); one that has none is worked now, by its user ID.
6. Record the review in its ticket: the date, the environment, the number of rows, and the user IDs, never an address
   or a name.

## The yearly tabletop

Run this runbook on a synthetic scenario (for example, a support grant left open past its ticket, or a leaked
access key) with everyone on the on-call rota; record it in the console (Compliance → Record evidence, kind
"tabletop exercise") with the document's reference and hash, and revise this runbook and the policy from what it
found.
