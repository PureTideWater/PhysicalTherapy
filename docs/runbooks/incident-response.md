# Incident response: a security event or a suspected breach

The steps the [incident response policy](../policies/incident-response.md) sets (PRD 19: "Contain (revoke, rotate,
isolate); preserve evidence; assess scope from the audit log; notify under the BAA clocks and the HIPAA rule; customer
communication; post-incident review"). A draft for the security official's approval with the policy. Never paste PHI,
a real file, a key or a token into the incident record, a ticket, a chat or a session: name objects by their IDs.

## 0. Triggers

A security event alarm (failed-MFA burst, sign-in burst, WAF block surge, GuardDuty finding, a bulk export, a grant
change or role escalation outside a ticket), a customer's or a vendor's report, a lost device, a leaked credential, or
anything that suggests PHI reached someone it should not.

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
logs `job heap` as it ends, completed or failed, with `job_id`, `job_type`, `heap_live_peak_mib` (the heap in use just
after the largest major collection while it ran) and `heap_limit_mib`; the alarm takes the largest peak. It is the line
the weekly real-size run fails at (docs/runbooks/ci.md, `release-capacity`). Nothing has failed yet: it says a month, or
several practices' large jobs at once, came near the margin that keeps the worker's process from running out of heap,
which would fail every practice's jobs in flight. It is not a security event: open no incident record unless something
else here applies.

1. In the worker's log group, find the `job heap` lines of the period above 420 and read their `job_id` and `job_type`.
   Then read that job's other lines by its ID (its start, its outcome, any error code) and which other jobs ran at the
   same time; the process is shared, so their heaps add up. Never copy a log line with anything but IDs and numbers into
   a ticket.
2. Read the weekly run's last summary (the `release-capacity` report, its "Live heap" column and each phase's peak): a
   month near the same size passing there points at the reader that holds a month's lines; a pass there points at size
   or overlap in production.
3. If jobs are failing too (a heap out-of-memory ends the worker's process, and pg-boss retries what was in flight;
   the job-failure alarm fires on a job's last failed attempt), record the job IDs. Then fix forward: the bound goes
   back to the reader that outgrew it (ADR 0083: no job holds a month's lines beyond a small, measured per-line holder),
   never a larger heap alone.

## The yearly tabletop

Run this runbook on a synthetic scenario (for example, a support grant left open past its ticket, or a leaked
access key) with everyone on the on-call rota; record it in the console (Compliance → Record evidence, kind
"tabletop exercise") with the document's reference and hash, and revise this runbook and the policy from what it
found.
