# Mail deliverability

Trigger: an environment's first deploy (its two mail phases), a mail alarm on the operator topic, the screening stream
paused, or the quarter's review. What is built and why is docs/adr/0065 (audit #76; the founder's rulings of
2026-10-21, Q1, Q9, Q10 (a), Q11 (b) and Q12); the deploy steps are docs/runbooks/deploy-and-rollback.md's. Nothing
here needs, or may use, a customer's or a prospect's address: every check below sends to SES's mailbox simulator or to
a synthetic mailbox you control, and reads IDs and counts.

## 1. What is set up

- **Three streams**, one SES configuration set each (`<p>` is `tp-<env>`):
  - `<p>-transactional`: Cognito's invitations and codes (from phase 2), and the digests;
  - `<p>-notices`: the support-access (break-glass) notices and dunning;
  - `<p>-screening`: the screening's results and failure notices (PR 6e adds its reminders and withdrawal
    confirmations).

  Every set publishes reputation metrics, requires TLS, tracks no opens or clicks (no tracking options; VDM's engagement
  metrics off) and leaves SES's Auto Validation off. Transactional and notices use the account's suppression list for
  bounces and complaints. **The screening set uses no suppression list at all**: SES never keeps a prospect's address,
  and no screening outcome ever silences a customer's invitation or notice. The screening's only suppression is the
  database's refusal list, a keyed hash of a screening address that bounced permanently or was reported as spam, kept
  365 days.
- **Two identities**, both owned by the stack: MailFromAddress's domain (`MailIdentityDomain`; default set transactional)
  and its subdomain `screening.<domain>` (`ScreeningMailIdentityDomain`; default set screening). The screening sends as
  `results@screening.<domain>` (`ScreeningMailFromAddress`), display name "PaidWhole", Reply-To the support address, so a
  prospect's reply reaches the support desk (it records it as `unknown_sender`; docs/runbooks/support-mail.md). Each
  identity signs with Easy DKIM (RSA 2048) and bounces to `bounce.<its domain>` (falling back to SES's own MAIL FROM if
  that MX fails; DKIM stays aligned, so DMARC still passes).
- **The event path.** Each set sends its events (send, reject, bounce, complaint, delivery, delivery delay, rendering
  failure) to the account's default event bus. Rule `<p>-mail-events` takes the three sets' events, and rule
  `<p>-mail-account-alarms` the two account warnings' ALARM state changes, into the queue `<p>-mail-events` (encrypted
  under the environment key, kept 4 days, five reads then `<p>-mail-events-dlq`, kept 14 days). The platform's
  `mail_events` job reads it every minute through the SQS endpoint, records each event once by its message ID, and
  deletes it only after its record commits. There is no EventBridge archive, and there must never be one: it would keep
  addresses past every promise.
- **The cut-off** (the founder's Q9), for the screening stream alone, in a 7-day window since its last resume:
  1. its own rates: permanent bounces above 3% of its sends (floor 200 sends: 7 bounces pause it below that), or
     complaints other than `not_spam` above 0.08% (floor 2,500: 3 complaints pause it below that); suppressions,
     transient bounces and probes never count;
  2. the account's rates (`account_rate`): the account's bounce rate at 2.5% or its complaint rate at 0.05%, half of
     SES's review levels (the two warning alarms, through the second rule);
  3. SES's review (`account_review`): the account's enforcement status anything but healthy.

  A pause disables the screening's SES set at once and keeps it disabled whatever re-enables it (a deploy included).
  The page says new screenings are paused; uploads already made are kept and emailed after the resume (within their 30
  days). Transactional and notices never pause: the database refuses it.
- **The bounce budget** (Q10 (a)): a client or an email account with 3 screening permanent bounces in 7 days cannot
  start another screening for up to 7 days, and the stream stays open.
- **The address checks** (Q1 (g)): the form's typo hint and unknown-ending warning; then, after the upload's own checks
  and the rate limit, DNS (the domain takes mail) and SES's validation (the mailbox), together, at most 2 seconds;
  SES's at most 1,000 a day in production and 50 in staging, then DNS alone.
- **The outboxes.** A support-access notice and a dunning notice go one message per recipient, each recorded before it
  is sent and retried only to recipients still pending (after 1, 5, 15 and 60 minutes; failed after the fifth). A notice
  not delivered to every administrator is reported once: the grant's page and the console's support list say "Not
  delivered to n of m administrators", each administrator gets a notification linked to the grant, and the operator is
  paged (`NOTICE_UNDELIVERED`). A practice with no administrator gets no message (`NOTICE_UNDELIVERABLE`).
- **Probes.** Once the identities are verified (phase 2), the platform sends each stream a message to SES's simulator
  (`success@` and `bounce@simulator.amazonses.com`) daily, and at once after a resume. Staging and production open the
  screening only while its delivered and bounced probes came back within 48 hours and since the last resume.
- **The console** (`/console/mail`, a platform administrator): each stream's state (sending, paused with its reason and
  the counts that paused it, or resumed and not yet confirmed), the window's sends, bounces and complaints, the last
  probes, whether the screening is ready to open, its bounce marks, and the last 7 days' undelivered customer messages
  (the screening's counted, never listed). It pauses the screening by hand and resumes it with a reason.
- **Alarms**, all to the operator topic (15):

  | Alarm | Fires at | Section |
  | --- | --- | --- |
  | `AccountBounceWarning` | the account's bounce rate at 2.5% (pauses the screening) | 3.2 |
  | `AccountBounceHigh` | the account's bounce rate at 4% | 3.2 |
  | `AccountComplaintWarning` | the account's complaint rate at 0.05% (pauses the screening) | 3.2 |
  | `AccountComplaintHigh` | the account's complaint rate at 0.08% | 3.2 |
  | `ScreeningSetBounce` | the screening set's bounce rate at 3% | 3.1 |
  | `ScreeningSetComplaint` | the screening set's complaint rate at 0.08% | 3.1 |
  | `TransactionalSetBounce` | the transactional set's bounce rate at 2% | 3.4 |
  | `EventsDeadLetter` | a message in `<p>-mail-events-dlq` | 3.6 |
  | `EventsQueueAge` | the queue's oldest event older than 15 minutes | 3.6 |
  | `MAIL_STREAM_PAUSED` | the screening stream paused (platform log) | 3.1 |
  | `NOTICE_UNDELIVERED` | a notice not delivered to every recipient (platform log) | 3.3 |
  | `NOTICE_UNDELIVERABLE` | a notice with no recipient (platform log) | 3.3 |
  | `INVITATION_UNDELIVERED` | an invitation's email undelivered (platform log) | 3.4 |
  | `MAIL_PROBE_MISSED` | a probe not back in 26 hours (platform log) | 3.7 |
  | `MAIL_VALIDATION_CAP_REACHED` | the day's validation cap reached (web log) | 3.5 |

  `MAIL_EVENT_UNREADABLE` (an event the platform cannot read) is covered by the dead-letter alarm;
  `MAIL_DOMAIN_CHECK_UNAVAILABLE` and `MAIL_VALIDATION_UNAVAILABLE` (the address checks timed out; the upload was
  accepted) are warnings in the web's log with no alarm.

## 2. Before launch, once per environment

1. **Phase 1.** Deploy with `MailIdentitiesVerified=false` (the default), as docs/runbooks/deploy-and-rollback.md says,
   with `ImageTag=none` on a first deploy, so nothing sends yet. Cognito keeps its own default sender; the platform
   sends no probe. If SES already holds an identity for either domain (one verified by hand under the earlier runbook),
   the deploy runbook says what to do first.
2. **The DNS records.** From the stack's outputs, set at the registrar, for each identity (`Mail…` and
   `ScreeningMail…`): the three DKIM CNAMEs (`…DkimRecord1` to `3`), the MAIL FROM MX and SPF (`…MailFromMxRecord`,
   `…MailFromSpfRecord`) and the DMARC record (`…DmarcRecord`). Each output is `<name> <type> <value>`. Add to the
   parent domain's DMARC record a reports mailbox you read (`rua=mailto:…`), at the parent domain (the screening
   subdomain inherits it). The screening subdomain's DMARC is `p=reject` from the start (only SES sends from it,
   aligned); the parent's is `p=none` (the founder's own mail provider sends from it too). Then wait until both read
   verified:

   ```
   aws sesv2 get-email-identity --email-identity <domain> \
     --query '{verified: VerifiedForSendingStatus, dkim: DkimAttributes.Status, mailFrom: MailFromAttributes.MailFromDomainStatus}'
   aws sesv2 get-email-identity --email-identity screening.<domain> --query '{verified: VerifiedForSendingStatus, dkim: DkimAttributes.Status, mailFrom: MailFromAttributes.MailFromDomainStatus}'
   ```

   Each must read `true`, `SUCCESS` and `SUCCESS`. DKIM can take up to 72 hours.
3. **Phase 2.** Deploy again with `MailIdentitiesVerified=true`. Cognito now sends from MailFromAddress through the
   transactional set, and the platform sends its probes. Within a few minutes of the platform task's start, the
   console's mail page shows the screening stream "Sending", a time beside "SES confirmed sending", both probes back
   and "Ready to open" yes.
4. **Staging checks (open item O11), once, in staging after its phase 2**, with a synthetic mailbox you control
   (`<you+tp-check>@…`, never a customer's). Tag each message you send by hand `tp_kind=probe`, so the platform records
   it as a probe and counts it toward nothing (an untagged message's events cannot be read and go to the dead-letter
   queue):
   - **Cognito sends through the stack's identity.** Invite the synthetic mailbox from the console; the invitation
     arrives from MailFromAddress, and `aws sesv2 get-configuration-set --configuration-set-name tp-staging-transactional`
     exists with its sends counted in CloudWatch (`AWS/SES`, `Send`, by `ses:configuration-set`). If Cognito refuses
     (the user pool's update or the invitation fails as not authorized to send), the identity needs a sending
     authorization policy for Cognito: stop and raise it as a change to `infra/lib/constructs/mail-streams.ts`.
   - **The screening set checks nothing against the account's list, and adds nothing to it.** Put the synthetic
     mailbox on the account's list, send to it through each set, and read each message's event in the platform's log
     (or the console's undelivered list): through screening it is delivered, through notices it is suppressed. Then
     take it off:

     ```
     aws sesv2 put-suppressed-destination --email-address <you+tp-check>@… --reason BOUNCE
     aws sesv2 send-email --from-email-address results@screening.<domain> --configuration-set-name tp-staging-screening \
       --email-tags Name=tp_kind,Value=probe --destination ToAddresses=<you+tp-check>@… \
       --content 'Simple={Subject={Data=SYNTHETIC CHECK},Body={Text={Data=SYNTHETIC CHECK}}}'
     aws sesv2 send-email --from-email-address <MailFromAddress> --configuration-set-name tp-staging-notices \
       --email-tags Name=tp_kind,Value=probe --destination ToAddresses=<you+tp-check>@… \
       --content 'Simple={Subject={Data=SYNTHETIC CHECK},Body={Text={Data=SYNTHETIC CHECK}}}'
     aws sesv2 delete-suppressed-destination --email-address <you+tp-check>@…
     ```

     Then send through the screening set, the same way, to a mailbox that does not exist on a domain you control (a hard
     bounce), and confirm `aws sesv2 get-suppressed-destination --email-address <that address>` answers
     `NotFoundException`. Never send that bounce through transactional or notices: they would add it to the list.
   - **The account's reputation metrics publish.** After a day of staging mail, `AWS/SES` `Reputation.BounceRate` with
     no dimension has data points. If it has none at launch volume, the two account warnings never fire (missing data is
     not a breach); the `account_review` trigger, which reads SES's enforcement status, still works. Record what you see.
   - **The database logs no bind value.** `aws rds describe-db-parameters --db-parameter-group-name <the instance's group>
     --query "Parameters[?starts_with(ParameterName, 'log_parameter_max_length')].[ParameterName,ParameterValue]"`
     reads `0` for both (the stack sets them; a failed call never writes its arguments, an address among them, to the
     log).

   Record each result in the release's pull request.
5. **SES production access** (per account and region, before any customer mail): in the SES console, Account
   dashboard, Request production access, mail type Transactional, with this use case: "Transactional mail only, to our
   customers' staff and to prospects who request a screening result: account invitations and sign-in codes, security
   notices to practice administrators, billing notices, digests, and screening results. No marketing, no purchased or
   rented lists, no open or click tracking. Every message goes through a configuration set by stream; bounces and
   complaints are recorded per message from SES's events, customer streams use the account suppression list, and our
   public screening stream pauses itself automatically at a 3% bounce or 0.08% complaint rate, or when the account's
   rates reach half of SES's review levels." The account stays on SES's Essentials plan (the founder's Q1 (f)).
6. **The founder's own steps (open item O14):** register both domains with Google Postmaster Tools and Microsoft SNDS
   (free; they show how the large providers see the mail), and read the DMARC reports for two weeks; when only SES and
   the founder's own provider pass, move the parent's DMARC to `p=quarantine`.

**Rollback.** Phase 2 back to phase 1 (`MailIdentitiesVerified=false`) returns Cognito to its default sender and stops
the probes; nothing else is lost. With the probes stopped, staging and production close the screening within 48 hours
(readiness), which is the point: without the event path proven, no prospect is mailed.

## 3. One playbook per alarm

### 3.1 The screening stream paused (`MAIL_STREAM_PAUSED`; `ScreeningSetBounce`, `ScreeningSetComplaint`)

1. Open `/console/mail`. Read the reason (its bounce rate, its complaint rate, the account's rate, SES's review, or a
   person) and the counts that paused it.
2. For `bounce_rate`: the console's bounce marks show whether the bounces come from few clients or email accounts (the
   budget then holds them) or are spread out, and the undelivered list counts the screening's bounces by kind and state
   (never an address). Look for one cause: a bot, a typo pattern the hint misses, a domain whose server accepts at
   validation and bounces later, or a template problem.
3. For `complaint_rate`: complaints mean people did not expect the mail. Check the result email's subject and sender,
   and the volume against the page's traffic.
4. Fix the cause. Then resume on the console, choosing "The cause is fixed", or "It was a false alarm" when nothing was
   wrong. The stream reads "Waiting for SES to confirm" until the platform reads the screening set sending again
   (within a minute or two), then "Sending", and the probes go at once; once they are back, the screening opens by
   itself. Uploads made before the pause are emailed once the stream is sending.
5. Never resume without a cause found. If the floors or the budget look wrong for real traffic, take it to the founder
   (ADR 0065, Revisit when).

### 3.2 The account's rate high, or the account under review (`AccountBounce…`, `AccountComplaint…`)

The screening is already paused (`account_rate` or `account_review`). Find the stream behind the rate by the sets'
metrics (`AWS/SES`, `Reputation.BounceRate` and `Reputation.ComplaintRate` by `ses:configuration-set`). Under review,
answer SES's notice in the console's Account dashboard with what this runbook records: the streams, the cut-off and
what was fixed. Resume the screening only once the account's rates are back under the warnings and SES's review is
closed.

### 3.3 A notice undelivered (`NOTICE_UNDELIVERED`, `NOTICE_UNDELIVERABLE`)

A practice's administrators did not all receive a support-access notice (the platform's log names the grant's ID; the
console's support list says which notice and how many), or a dunning notice did not reach every owner (the invoice's
ID). Reach the practice another way (its phone, the account contact) and record that you did in the support ticket.
For `NOTICE_UNDELIVERABLE`, the practice has no administrator: tell its organization. Take an address off SES's
suppression list (`aws sesv2 delete-suppressed-destination --email-address …`) only after the person confirms their
mailbox works.

### 3.4 An invitation undelivered (`INVITATION_UNDELIVERED`; `TransactionalSetBounce`)

The users page shows the invitation "Not delivered" with its date. Tell the administrator who invited the person to
check the address, then invite again. A transactional bounce rate at 2% means invitations are going to bad addresses
at volume: look for one organization's import.

### 3.5 The validation cap reached (`MAIL_VALIDATION_CAP_REACHED`)

The day's SES validations are spent (1,000 in production); the rest of the day's uploads get the DNS check alone.
Check the day's submissions for abuse (the rate limiter's counts, the screening's waiting tier). Raise the cap
(`MAIL_VALIDATION_DAILY_CAP` in `infra/lib/mail.ts`, a deploy) only with the founder (Q1 (g): at most $10 a day).

### 3.6 The dead-letter queue, or the queue's age (`EventsDeadLetter`, `EventsQueueAge`)

The platform's `mail_events` job is not running or cannot record an event. Check the platform task and its log
(`MAIL_EVENT_UNREADABLE` names the queue message's ID). Once fixed, move the dead letters back:

```
aws sqs start-message-move-task --source-arn <the dead-letter queue's ARN> --destination-arn <the queue's ARN>
```

A message older than the queue's 4 days is gone; its message's state stays as last recorded.

### 3.7 A probe missed (`MAIL_PROBE_MISSED`)

A probe went and its event did not come back in 26 hours: the event path is broken somewhere. Check, in order, the
identity (still verified), the set's event destination, rule `<p>-mail-events` (its invocations and failed
invocations), the queue and the job. Until a probe comes back, staging and production keep the screening closed.

## 4. Rules

- Never resume the screening without a cause found and a reason given.
- Never disable suppression on the transactional or notices sets, and never give the screening set a suppression list
  (ADR 0065): the first would mail known-bad addresses of customers, the second would keep prospects' addresses at SES.
- Never enable open, click or VDM engagement tracking on any set or on the account: it would rewrite the screening's
  result link and Cognito's codes, and record who read what.
- Never create an EventBridge archive or replay of mail events.
- Never send to a real person to test: use SES's simulator or a synthetic mailbox you control.
- Never write an address into a ticket, log, alarm note or pull request; use the IDs the platform logs.

## 5. Quarterly

- **The top-level domain list (open item O15).** Refresh `apps/web/src/lib/screening/tlds.ts` from IANA's list
  (https://data.iana.org/TLD/tlds-alpha-by-domain.txt, lower-cased, the `xn--` names kept) and set
  `TLD_SNAPSHOT_VERSION` to its date; the first snapshot was taken from the public suffix list's ICANN section, since
  IANA could not be reached from the build.
- **The typo list.** Check `MAIL_PROVIDER_DOMAINS` in `apps/web/src/lib/screening/address.ts` against the providers the
  practices' administrators use.
- **DMARC reports, Postmaster Tools and SNDS**: anything failing alignment, and the domains' reputation.
- **The plan and the prices**: SES's plan and per-message prices, the validation price and the endpoint's (open item
  O12), against docs/adr/0065's costs.
