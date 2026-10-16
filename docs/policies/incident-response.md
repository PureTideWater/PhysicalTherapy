---
policy: incident-response
title: Incident response
version: 0.1
status: draft, awaiting the security official's approval
owner: security official
review: yearly, after every incident, and after the yearly tabletop
---

# Incident response policy

## Purpose and scope

How the company detects, contains, investigates and reports a security incident, including a suspected breach of
unsecured PHI. The steps are in the [incident-response runbook](../runbooks/incident-response.md); this policy sets
who decides and which clocks apply.

## Roles

- **Incident lead:** the security official, or the person on call until the security official takes over.
- **Operator:** whoever holds the operator role on call; contains and preserves evidence under the lead's direction.
- **Counsel:** consulted before any notification is sent and for every decision whether an event is a breach.

## Rules

1. Anyone who suspects an incident reports it at once to the security official and the on-call operator; nobody
   investigates PHI alone or outside the break-glass path.
2. The lead opens an incident record within one hour of the report, with its time of discovery. The discovery time
   starts every notification clock.
3. Containment comes before diagnosis: revoke sessions and grants, rotate credentials and keys, isolate the affected
   component, turn on the maintenance flag when customers must be kept out.
4. Evidence is preserved before anything is changed that would destroy it: the audit log and its Object Lock copies,
   CloudTrail, load balancer and WAF logs, the affected images and task definitions.
5. Scope is assessed from the audit log (which users read which objects, in which practices, through which grant).
6. **Notification clocks.** The HIPAA Breach Notification Rule requires a business associate to notify the covered
   entity without unreasonable delay and no later than 60 calendar days after discovery. Each customer's BAA may set
   a shorter period; the shortest period that applies governs, and the incident record lists each affected
   customer's clock. The covered entity (the practice) decides on notice to individuals and regulators; the company
   gives it what it needs to do so.
7. Customer communication uses the runbook's templates, goes from the security official, and carries no PHI in the
   body of an email.
8. The public status page shows a security incident's effect on service without detail that would help an attacker
   or identify a patient.
9. Every incident ends with a post-incident review within ten business days: timeline, cause, what is changed, and
   the risk analysis updated.

## Exercise

A tabletop exercise runs yearly on a synthetic scenario; it is recorded in the console (Compliance, kind "tabletop
exercise") with its findings, and this policy and the runbook are revised from it.
