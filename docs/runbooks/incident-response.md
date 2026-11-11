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
   `PasswordResetSessionsNotEnded`, `PasswordResetProviderSignOutFailed`): each one raised that no ticket or incident
   record already explains gets one. For each `PasswordResetProviderSignOutFailed` of the week, run its section's step 3
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
