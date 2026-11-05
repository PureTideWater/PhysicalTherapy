# Incident response: a security event or a suspected breach

The steps the [incident response policy](../policies/incident-response.md) sets (PRD 19: "Contain (revoke, rotate,
isolate); preserve evidence; assess scope from the audit log; notify under the BAA clocks and the HIPAA rule; customer
communication; post-incident review"). A draft for the security official's approval with the policy. Never paste PHI,
a real file, a key or a token into the incident record, a ticket, a chat or a session: name objects by their IDs.

## 0. Triggers

A security event alarm (failed-MFA burst, sign-in burst, WAF block surge, GuardDuty finding, a bulk export, a grant
change or role escalation outside a ticket, a refused second-factor enrolment, a refused client credential, one
account's reset requests reaching five in an hour), a finding of the weekly sign-in review below, a customer's or a
vendor's report, a lost device, a leaked credential, or anything that suggests PHI reached someone it should not.

## 1. Open the record (within one hour)

1. Write the **time of discovery** (UTC). It starts every notification clock.
2. Name the incident lead (the security official, or the on-call operator until they take over) and the scribe.
3. Keep a timeline from here on: who did what, when, and why.

## 2. Contain

Pick what fits; do the cheapest effective step first.

- **A user or session:** disable the user in the identity provider and end their sessions (Console → Users, or the
  `user_disabled` path); revoke their devices.
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
   `ClientCredentialRefused`, `ClientCredentialProbeRefused`): each one raised that no ticket or incident record already explains gets one.
5. Record the review in its ticket: the date, the environment, the number of rows, and the user IDs, never an address
   or a name.

## The yearly tabletop

Run this runbook on a synthetic scenario (for example, a support grant left open past its ticket, or a leaked
access key) with everyone on the on-call rota; record it in the console (Compliance → Record evidence, kind
"tabletop exercise") with the document's reference and hash, and revise this runbook and the policy from what it
found.
