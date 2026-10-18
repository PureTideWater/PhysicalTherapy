# Support mail: receiving the support address's mail, and a message that opened no ticket

Mail to the support address opens a ticket (PRD 19, Support; ADR 0055). Amazon SES receives it under the stack's receipt
rule (`SupportMail` in `infra/lib/constructs/support-mail.ts`), scans it and writes it to the support inbox bucket under
`inbound/`; the platform service's `support_mail` job reads the inbox every five minutes and opens a ticket in the name of
the account whose address sent it. A message stays in the inbox for a week and then expires. Nothing in this runbook
needs a message's contents: work from the job's codes and the ticket numbers, never by opening a message.

## Before launch (once per environment)

1. **Receiving region.** SES receives mail only in some regions; deploy the environment in one of them (check the SES
   "email receiving endpoints" list for the stack's region).
2. **Verify the domain.** In SES, verify the domain of the `SupportEmail` parameter as an identity (DNS records the
   console shows), if the mail-from domain's identity does not already cover it.
3. **MX record.** Point the support domain's MX record at `inbound-smtp.<region>.amazonaws.com` (priority 10). If the
   domain already receives other mail elsewhere, use a subdomain for the support address instead; an MX record moves all
   of a domain's mail.
4. **Activate the rule set.** A region has one active receipt rule set, so the stack does not take it over. If none is
   active: `aws ses set-active-receipt-rule-set --rule-set-name <SupportMailRuleSet output>`. If another one is active in
   the account and region, copy its rules into the stack's rule set first, or add this stack's rule to it; never
   activate over another team's rules.
5. **Check.** From an address of a synthetic test account (never a customer's), send a short message with no patient
   information to the support address. Within ten minutes the platform log group shows `support mail opened tickets`,
   and the ticket appears on `/console/tickets` with screen `email`. If it does not, see below. Record the result in the
   pull request: the stack's KMS and bucket permissions for SES are unproven until this first delivery.

## A message that opened no ticket

The job logs `SUPPORT_MAIL_REFUSED` when a run read a message that opened no ticket, and records each message once in
`support_mail_receipt` with its outcome (no address, subject or text is kept there):

- `unknown_sender`: the From address is not an account's, or the account is disabled. Ask the person to write from the
  address they sign in with, or to use the in-app form.
- `unverified_sender`: SES did not verify the sender (no passing DMARC for the From domain, no DKIM signature aligned
  with it, or a failed virus scan). Anyone can write any From address, so such mail never opens a ticket. If a real
  customer's domain has no DKIM or DMARC, ask them to use the in-app form.
- `unreadable`: too large (over 1 MB), no From address, or no text the reader can take (an attachment alone, an image).

`SUPPORT_MAIL_WITHHELD` means a message looked like it held patient information. Its ticket says only that it came and
asks the desk to have the requester write again through the form; do not open the message in the bucket to read it.

## Nothing arrives at all

Check, in order: the MX record resolves to SES's inbound endpoint; the stack's rule set is the active one; the receipt
rule's recipient is the published support address; objects appear under `inbound/` in the `SupportMailBucket` output
(their count, not their contents); the platform service is running and its log group shows the job each five minutes.
SES writes `inbound/AMAZON_SES_SETUP_NOTIFICATION` once when the rule is created; the job skips it.
