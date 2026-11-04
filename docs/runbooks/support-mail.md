# Support mail: receiving the support address's mail, a message that opened no ticket, and sign-in help tickets

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

## Sign-in help tickets

The sign-in page, the code and key steps and the locked words tell a person who cannot sign in to write to the support
address from the address they sign in with (docs/adr/0081, the forgotten password, A7), so these tickets open in that
account's name. Work from the ticket ID and the user ID only, never the message's text, and answer through the ticket.

- **Locked** (ten failed attempts). Check with the organization's administrator that the request is genuine, then press
  Unlock beside the user on the organization's console page (`/console/organizations/<id>`), which writes its own audit
  event. A password reset never lifts the lock: the person may already have reset their password and still be locked.
- **Lost authenticator app.** No second-factor reset exists yet. Tell the person it is not yet possible from the console
  and that we will write when it is; promise no date. Record the ticket ID, so that UX PR 65, which adds the console
  reset, can work through those tickets.
- **Lost hardware key, with no second key.** There is no administrator path (Cognito passkeys), and a new invitation is
  refused for an invitation already accepted (`resend_invitation`, from Settings or the console), so do not describe or attempt it as a re-invitation. Escalate the ticket
  ID to the founder.
- **Mail from an address that is not the account's own.** Never act on it. The job already refuses it as
  `unknown_sender` (above); ask the person to write from the address they sign in with.
- **A password set, but no second factor ever enrolled, and the reset sends nothing.** A code goes only to an account
  with an enrolled second factor, so this person cannot reset, and a second factor is set up only inside a live
  invitation (docs/adr/0088 D3). Check with the organization's administrator that the request is genuine. If the person
  still knows the password they chose, the administrator sends the invitation again (Settings, or the console): that
  opens seven new days and mails nothing, since the person has a password of their own; they sign in with it and set up
  the authenticator app. If they do not know it, escalate the ticket ID to the founder. Do not delete their Cognito user
  and invite them again: the account keeps the deleted user's subject, so the new invitation is refused (from Settings
  as an address in use; from the console as "another identity", after Cognito has already mailed a temporary password
  to a new user), and moving an account to a new subject needs a database change that does not exist yet
  (docs/adr/0088, Revisit when).
- **An invitation answered "this email belongs to another identity; ask an engineer to reconcile it".** Only the
  console says this; Settings answers "this address cannot be invited from here", as for any address in use, so an
  administrator who reports that answer for a person with no account here is asked to have a platform administrator add
  them, and the console then shows this answer if it applies. If the address
  already has an account here, its Cognito subject no longer matches: escalate the ticket ID to the founder (the
  previous item's database change). If it has none, a Cognito user for the address exists and has signed in, so an
  invitation is never linked to it (docs/adr/0088 D4): whoever holds its password would take the invitation. Check with
  the organization's administrator that the person is genuine; then, in the founder's break-glass session (the operator
  role holds no Cognito action and is not widened for this), find the Cognito username with `aws cognito-idp list-users
  --user-pool-id <UserPoolId output> --filter 'email = "<address>"' --query 'Users[].Username'` (the address typed in
  that session only, never pasted into the ticket or a log), confirm exactly one is listed, delete it with `aws
  cognito-idp admin-delete-user --user-pool-id <UserPoolId output> --username <that username>`, and ask the
  administrator to invite the person again (a new Cognito user and a new temporary password). Record the ticket ID, the
  Cognito username and the time in the ticket, never the address.

## Nothing arrives at all

Check, in order: the MX record resolves to SES's inbound endpoint; the stack's rule set is the active one; the receipt
rule's recipient is the published support address; objects appear under `inbound/` in the `SupportMailBucket` output
(their count, not their contents); the platform service is running and its log group shows the job each five minutes.
SES writes `inbound/AMAZON_SES_SETUP_NOTIFICATION` once when the rule is created; the job skips it.
