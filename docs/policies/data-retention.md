---
policy: data-retention
title: Data retention
version: 0.1
status: draft, awaiting the security official's approval and counsel's review of the periods
owner: security official
review: yearly, and when a customer's BAA sets different periods
---

# Data retention policy

## Purpose and scope

How long each kind of data is kept, how it is protected while kept, and how it is destroyed. The periods are the
plan's defaults (PRD 20: "contract term plus six years; packets and audit seven years"), to be settled with counsel
and the first BAAs; a BAA that sets a different period governs for that customer.

## Schedule

| Data | Kept for | Then |
| --- | --- | --- |
| Remittances, claims, lines and ledger entries | The customer's contract term plus six years | Deleted under this policy |
| Dispute packets and the audit log | Seven years, written once (S3 Object Lock for packets and the nightly audit copies) | Aged out by the lock's period |
| Source documents (uploaded files) | With the records they produced | Deleted with them |
| Model-call logs | With the records; inputs kept as hashes only | Deleted with them |
| Agreements and terms acceptances | The customer relationship plus six years | Deleted |
| Billing records | As tax and accounting law requires (no PHI) | Deleted |
| Backups (RDS snapshots and point-in-time recovery) | 35 days | Age out on their own schedule |
| Mail records (`mail_send`: one row per message, its SES message ID, stream, kind, subject and delivery state; no address and no hash of one) | 30 days from sending on the screening stream; 90 days on the transactional and notices streams | Deleted by the nightly `mail_expiry` job |
| Notice outboxes (`support_grant_notice`, `support_grant_notice_recipient`, `dunning_notice_recipient`: who a break-glass or dunning notice went to and its delivery) | With the support grant or the invoice they belong to | Kept as the grant and the invoice are kept |
| The screening's refusal list (`screening_mail_refusal`: a keyed hash, never the address, of a screening address that bounced permanently or was reported as spam on the screening stream) | 365 days from its latest bounce or report, used only to refuse a new screening to that address (the founder's Q11 (b), 2026-10-21) | Deleted by the nightly `mail_expiry` job. The screening's pages may not call it deleted with the screening |
| The screening's bounce marks (`screening_bounce_mark`: the rate limiter's keyed subjects of the client address and of the email account of a run whose email bounced permanently) | 7 days (the founder's Q10 (a), 2026-10-21) | Deleted by the nightly `mail_expiry` job, or with the mail record they name |
| A screening run's keyed client subject (`screening_run.client_subject`) | With the run: 30 days, or until a later screening of the same practice or address replaces it | Deleted with the run |
| An invitation's undelivered flag (`invitation.undelivered_at`, `undelivered_reason`) | With the invitation | Kept as the invitation is kept |
| SES events in the mail-events queue (each names its recipient's address) | 4 days in the queue, 14 days in its dead-letter queue; no EventBridge archive is kept | Expire in SQS on their own schedule |
| AWS's record of each screening address SES validated (CloudTrail's event history in the environment's address-validation account, an AWS account that holds nothing else: the request, which names the address unless CloudTrail withholds it) | 90 days, AWS's own period, which cannot be shortened or turned off; that account's trail records writes alone, so no trail keeps it (docs/adr/0065) | Expires in AWS on its own schedule |

The mail path keeps no copy of a screening address but those above: the screening's SES configuration set uses no
suppression list, so SES adds no screening address to the account's list; the mail record holds none; and SES's
validation of an address runs in the address-validation account, so the environment's own trail never holds it
(docs/adr/0065). A customer's address stays on the account's suppression list after a bounce or complaint until an
operator removes it once the person confirms the mailbox works (docs/runbooks/deliverability.md).

## Protection while kept

TLS 1.2 or later in transit; RDS encryption at rest; every stored object sealed with its practice's data key under a
customer-managed KMS key, rotated yearly; S3 versioning; a monthly restore drill on staging that records its row
counts and the catalog test on the copy.

## Export and deletion

- A practice administrator may request a full export at any time (JSON and CSV per table, documents and packets, as
  an encrypted archive with a schema readme).
- At offboarding a practice administrator may request deletion. Deletion checks for a legal hold (set only by a
  platform administrator, which pauses deletion with a notice), delivers the export the customer chose first,
  schedules destruction under this schedule, destroys the practice's data key at the end of the retention window, and
  records a certificate of destruction.
- Backups are not edited; they age out within 35 days of deletion, and this policy and the terms state so.
- The export and deletion workflows are milestone 12's; until they ship, a request is taken by the security official
  and handled by the same rules by hand, with the steps recorded.
