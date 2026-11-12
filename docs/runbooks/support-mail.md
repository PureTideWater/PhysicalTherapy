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
A person who cannot sign in cannot use the form: see "Password changed, not by me".

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
- **Password changed, not by me.** The password-changed email (docs/adr/0091) tells an account's address that a reset
  changed its password. If it was not them, it asks the person to write to the support address from the address they
  sign in with, and to tell their organization's administrator, who may be the one who writes. The email goes with
  Reply-To the support address, so a plain reply to it comes here too. The operator also brings a person here after
  telling them another way (docs/runbooks/deliverability.md, 3.10; docs/runbooks/incident-response.md, "A password
  reset whose sessions were not ended" and "A password reset whose provider sign-out failed").

  What arrives is not always readable:

  - A reply that quotes the email, a forward of it, or a message that repeats the time it gave is withheld
    (`SUPPORT_MAIL_WITHHELD`; the ticket reads "Mail to support, withheld"): the email's own first line holds a date and
    its last an address, which the screen takes for patient information, as it takes a signature's phone number. So a
    withheld ticket may be this case. Answer it by email, never by sending the person to the in-app form, which needs
    the sign-in they may not have: ask whether their password was changed without them, and ask them to answer in a
    new message with no quoted text, no date and no phone number.
  - An automatic reply to the email (an out-of-office answer) opens a ticket the same way, readable or withheld. It is
    not a "not me": open no security record for it.
  - Mail from a sender SES could not verify, or from an address that is not the account's own, opens no ticket
    (`unverified_sender`, `unknown_sender`, above); that person's other route is their organization's administrator.

  Once a person, or their administrator, says the change was not theirs:

  1. Treat it as a mailbox compromise: someone read the code sent to that mailbox. A changed password nobody asked for
     is a security event: open the record (docs/runbooks/incident-response.md, section 1).
  2. With the organization's administrator, end the account's sessions: End membership beside the person, pressed by the
     administrator in Settings, Users, or by a platform administrator on the organization's console page
     (`/console/organizations/<id>`). It ends every session of the user and their role in that organization at once,
     and asks the identity provider to sign them out once that has committed; a failure there undoes nothing and pages
     the operator (docs/runbooks/incident-response.md, "An ended membership whose provider sign-out failed"). It does not disable the account or change its password, and the
     database refuses it for an organization's only practice administrator. When the membership must stay, or the
     account must be disabled, give the user ID to the founder, whose break-glass session ends the sessions by user ID
     and disables the account at the identity provider. A disable at the provider ends no session of the app, and for an
     organization's only practice administrator the database refuses to disable the account's row as it refuses End
     membership: for that account the sessions are ended directly (docs/runbooks/incident-response.md, section 2, "A
     user or session"). An enrolled second factor still guards the account meanwhile, because a reset never removes it
     (docs/adr/0081 A5).
  3. Ask the person to secure the mailbox, and go on by mail or through the administrator: after End membership the
     person's mail to the support address still opens tickets, but once the account's own row is disabled, mail from its
     address opens none (`unknown_sender`); a disable at the identity provider alone does not change that. Once the
     administrator confirms the mailbox is the person's alone again, the person resets the password again: an account
     whose membership ended can still reset, and one the founder disabled is re-enabled by the founder first (a disabled
     row is sent no reset code). Then a platform administrator adds the person back with Send invitation on the
     organization's console page, the same address and role (Settings refuses an address that already has an account):
     it restores the role at once and mails nothing, since the person has a password of their own.
  4. Work by the ticket ID and the user ID only. A ticket shows the requester's address, not their user ID: find the
     reset, and the user ID with it, by its time, in a session as the operator role (`tp_operator`):

     ```sql
     SELECT object_id AS user_id, at FROM audit_event
     WHERE action = 'password_reset_completed' AND at > now() - interval '2 days'
     ORDER BY at DESC;
     ```

     Never copy an address or a name into the ticket or the record.
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
