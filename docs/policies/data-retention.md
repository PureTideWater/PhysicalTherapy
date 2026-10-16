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
