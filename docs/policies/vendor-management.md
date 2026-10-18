---
policy: vendor-management
title: Vendor management
version: 0.1
status: draft, awaiting the security official's approval
owner: security official
review: the inventory and the data-flow map quarterly; the policy yearly
---

# Vendor management policy

## Purpose and scope

Which outside services may receive what, under which agreement. A vendor that creates, receives, maintains or
transmits PHI for the product is a subprocessor and must sign a business associate agreement before it receives any.

## Rules

1. A new vendor, or a new use of an existing one, is approved by the security official before any data reaches it,
   after a review of its security report (SOC 2 or equivalent) and, for PHI, a signed BAA.
2. The inventory below and the data-flow map are reviewed quarterly against the code (the services behind each
   interface in `apps/web/src/lib/server/services.ts` and the infrastructure stacks); the review is recorded in the
   console (Compliance, kind "vendor review").
3. A vendor that receives no PHI is kept that way by design: what is sent to it is fixed by code and tested.
4. A vendor that is offboarded has its credentials revoked and its data returned or destroyed, with confirmation kept.

## Subprocessor inventory

| Vendor | Purpose | PHI | Agreement |
| --- | --- | --- | --- |
| Amazon Web Services | Hosting: compute, Postgres (RDS), object storage (S3), keys (KMS), identity (Cognito), email (SES), document text (Textract), the model (Bedrock), malware scanning (GuardDuty), logs and backups | Yes | AWS BAA, HIPAA-eligible services only |
| The e-signature vendor (to be chosen) | Signing the BAA, engagement letter, terms and data-rights addendum; its webhook tells the product an agreement is complete | No PHI by design (agreements name organizations and signers) | BAA required by the plan |
| The compliance platform (to be chosen) | Collects configuration and CI evidence from AWS and GitHub, and the checklist export | No PHI | BAA required by the plan |
| Stripe | Subscription billing: customers, invoices, ACH and card payment methods | No PHI: only organization IDs, plan, amounts and billing contact | Stripe's terms; no BAA because no PHI is sent |
| GitHub | Source code, pull requests and CI | No PHI: synthetic data only | GitHub's terms |

## Data-flow map

- **PHI** (835 remittances, contracts, posting and bank exports, and everything derived) flows only between the
  customer's browser, the application (web and worker) and AWS services inside the company's account: uploads go to
  S3 under the practice's data key; the worker reads them and writes Postgres; Textract and Bedrock are reached
  through VPC endpoints; email from SES carries links, never PHI.
- **Agreements** flow from the e-signature vendor to the application (signed webhook, then the signed document,
  stored by reference and SHA-256), or are uploaded by a platform administrator.
- **Billing** flows between the application and Stripe: organization IDs and amounts out, subscription and invoice
  events in through a signed webhook; no practice data.
- **Evidence** flows to the compliance platform: CI results and configuration from GitHub and AWS, and the
  checklist's JSON export (controls, statuses, dates and hashes; no PHI, no names).
