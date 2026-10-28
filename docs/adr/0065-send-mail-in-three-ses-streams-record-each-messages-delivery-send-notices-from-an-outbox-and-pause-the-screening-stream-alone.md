# 0065. Send mail in three SES streams, record each message's delivery, send notices from an outbox, and pause the screening stream alone

- **Status:** accepted (PR 6b-4 of Change Order 001's PR 6b: audit #76; the database's part is migration
  `20261107090000_mail_streams.sql`; the worker's, the stack's and the pages' parts are recorded in ADRs 0014, 0019,
  0049, 0050, 0055 and 0062 as PR 6b-4 amends them)
- **Date:** 2026-10-21 (the founder's rulings); built 2026-10-23
- **Deciders:** the founder, Tyler Williams, on 2026-10-21 at about 22:30 UTC: "Do all the recommended options for these
  questions as long as it optimizes the app" (every recommended answer of `designs/pr6b-plan.md` section 3 accepted, of
  which this decision records Q1's mail costs, Q9, Q10 (a), Q11 (b) and Q12); counsel confirms the screening's wording
  before the screening opens; the build (PR 6b-4)
- **PRD sections:** 8 (notifications and digests), 16 (security: least privilege, no PHI or address in logs), 19
  (monitoring and costs), 20 (retention); Change Order 001 and reconciliation-001; test matrix SCR-21, SCR-22, SEC-18,
  SEC-19 and JOB-05; ADRs 0014, 0019, 0049, 0050, 0055, 0062 and 0064

## Context

Audit #76 found the mail path unfit for a public screening and for HIPAA notices:

- One SES sender, no configuration set and no message tags: nothing recorded whether a message was delivered,
  bounced or reported, so nothing could stop a run of bad addresses from costing the account its sending.
- A break-glass notice went in one message to every administrator, inside the transaction that recorded it, and the
  record (`notice_sent`, `notified_at`) was written before anyone read the recipients: a practice with no administrator
  read "Expiry notice sent", and a failed send rolled back and later re-sent to everyone. Dunning was built the same
  way.
- An invitation that never arrived looked open until it expired.
- The free screening sends a result link to an address a stranger typed. Without a cut-off, a run of bounces or
  complaints on it reaches the rates at which SES reviews or suspends the account, and with the account go
  invitations, recovery codes and break-glass notices.

The screening is closed in production until release 1, counsel's review and the launch checks (ADR 0062); this
decision is one of the four conditions the plan sets before it opens ("the mail path is proven ready").

## Decision

**The founder's rulings this pull request builds, recorded 2026-10-21.**

- **Q1, the mail costs:** three SES streams with the SQS interface endpoint (about $18 a month per environment: the
  endpoint $14.60, 15 alarms $1.50, 6 log metrics $1.80, simulator probes $0.03, requests $0.17 at most), SES's
  Essentials plan ($0.16 per 1,000 sends, VDM's dashboard and engagement tracking off), and SES's validation of a
  screening address at submit, $0.01 a screening, capped at 1,000 a day in production and 50 in staging. The prices
  were read from search results; open item O12 stays: re-read them on AWS's pages before the first deploy.
- **Q9, the screening's cut-off:** a 7-day window since the last resume; pause when permanent bounces exceed 3% of its
  sends with a floor of 200 sends, or complaints other than not_spam exceed 0.08% with a floor of 2,500; also pause when
  the account reaches half of SES's review levels (its bounce rate at 2.5%, its complaint rate at 0.05%) or SES puts the
  account under review; only a platform administrator resumes it, with a reason (a cause fixed, or a false alarm).
  Below the floors, 7 permanent bounces or 3 complaints in a week pause it.
- **Q10 (a), a bounce budget per client and per email account:** each run keeps, for its 30 days, the rate limiter's
  keyed hash of the client address (`client_subject`, new) and of the email account (`rate_subject`, PR 6b-3); a
  screening permanent bounce leaves a 7-day mark on each, and a subject with 3 live marks is refused a new screening.
- **Q11 (b), what the screening keeps of a refused address:** a keyed hash of a screening address that bounced
  permanently or was reported as spam, kept 12 months (365 days from its latest such outcome), used only to refuse a new
  screening to it. `retention.ts`, the screening terms and `docs/policies/data-retention.md` say so, and the pages
  never call it deleted.
- **Q12, the screening's sender and wording:** `results@screening.<domain>`, display name "PaidWhole", Reply-To the
  support address; the recommended paused-page wording and one sentence for every refused address, each shown word for
  word in the pull request for the founder, then counsel, before the screening opens.

**The streams (D1 to D4).** Every message goes through exactly one SES configuration set, `tp-<env>-transactional`
(Cognito's mail and the digests), `tp-<env>-notices` (break-glass and dunning notices) or `tp-<env>-screening` (the
screening's results and failure notices; PR 6e's reminders and withdrawal confirmations), each with reputation metrics,
TLS required, no open or click tracking and no Auto Validation. The screening's set uses no suppression list at all, so
SES never keeps a prospect's address past the screening's own deletion and no screening outcome ever silences a
customer's invitation or notice; its only suppression is the database's refusal list. Each message has one recipient
and carries its kind, its subject and (customer streams) its user as SES tags, never an address. Each set's events
reach the platform through EventBridge and an encrypted SQS queue (4 days, a dead-letter queue of 14, no archive).

**What the database records (migration `20261107090000_mail_streams.sql`).**

- `mail_stream`: the three streams, one row each. Only the screening's pauses (a CHECK), with its reason, the window's
  counts and who paused it by hand; a pause clears `ses_enabled_confirmed_at`, which only the platform's reconcile
  sets again once it reads the screening's set enabled. Each row is seeded confirmed (no stream has been paused; the
  reconcile clears the confirmation should SES read the set disabled).
- `mail_send`: one row per message, keyed by SES's message ID, with its stream, kind, subject, user (customer streams;
  for Cognito's, the user with the address), the screening's prospect (set null when the prospect goes) and its state.
  States move one way (sent, delayed, delivered, then bounced, suppressed, rejected or complained, the last four
  terminal and equal), so events land in any order and once, and the first event seen creates the row with SES's own
  send time. A message SES accepted and never sent because the address is on the account's own suppression list is
  `suppressed`: a bounce of subtype `OnAccountSuppressionList` or `OnConfigurationSetSuppressionList`, and a Complaint
  whose `complaintSubType` is `OnAccountSuppressionList` (the address listed for an earlier complaint; the job reads it
  as that suppression, never as a complaint, which would count as delivered: review M1). It is undelivered for a notice
  and an invitation, and counts toward nothing, as SES counts it toward neither rate. A bounce from SES's global
  suppression list (`Permanent`/`Suppressed`: the address bounced recently for any sender) is `bounced`, because SES
  counts it toward the account's bounce rate as any hard bounce (review M2): the window, the refusal list and the bounce
  marks count it. A complaint subtype SES gives no meaning for is left for the dead-letter queue. An unknown bounce
  subtype is `other`; SES's `Undetermined` is kept as named. No address and no hash of one; kept 30 days on the
  screening stream and 90 on the others. (Sources, AWS's own: the SES v2 API's Complaint.ComplaintSubType, as the SDK
  3.1152.0 model carries it, and the developer guide's event contents and suppression-list pages, which state that the
  global list's bounces count toward the bounce rate and the account list's do not. `OnConfigurationSetSuppressionList`
  is newer than the guide read and is held to the account list's rule; staging confirms both, O11.)
- `mail_recipient_key` and `mail_recipient_sha256()`: the SHA-256 of a pepper made at the migration (64 hex characters
  from two random UUIDs, 244 random bits) and the mailbox the address reaches, `mail_recipient_canonical()` (review
  S2): ASCII white space and case, the domain's trailing dots, googlemail.com read as gmail.com and me.com and mac.com
  as icloud.com, a +tag dropped at every domain, and Gmail's dots dropped at gmail.com alone. Every spelling of one
  inbox keys alike, so a mailbox that bounced or reported a screening is refused under its other spellings too. The
  web's rate account, which the bounce budget keys, reads the same rule from `canonicalMailbox()` (@tp/db), and a db
  test holds the SQL and TypeScript forms equal on a table of spellings and on every Unicode code point, at an
  address's edges and in each of its parts. An address with any character outside ASCII stands as read (ASCII white
  space at its ends dropped and its ASCII letters in lower case): the screening's form takes only ASCII, so such an
  address is never stored or mailed, and no Unicode table decides a key. As first built, both rules applied NFKC, and
  Node's (Unicode 17) and PostgreSQL 18's (Unicode 16) differed on U+A7F1, a gap each Node or ICU upgrade ahead of the
  server would widen with no test failing (the review of 2026-10-27). Case is folded for ASCII letters alone, so the
  key never depends on a database's locale. Gmail's dot rule is Google's for gmail.com alone (it does not hold for
  Google Workspace). Apple's three domains reach one account's mailbox, its name reserved across all three, so no two
  people share a key (the review of 2026-10-27: a complainer at me.com was mailed again at icloud.com). The +tag is
  dropped everywhere because the sub-address reaches the base mailbox at the providers most practices use, so a
  complaint from any spelling refuses the mailbox. A permanent bounce is keyed with its +tag kept
  (`mail_recipient_sha256(address, true)`, gmail.com's still dropped, since Gmail delivers every +tag): a +tag spelling
  bounces where the server has no sub-addressing (cPanel, DirectAdmin and older SmarterMail hosting), which says
  nothing of the base mailbox, and as first built such a bounce refused the base mailbox for 365 days, which anyone
  could cause on purpose (the review of 2026-10-27). `screening_contact_refused()` refuses an address whose mailbox
  matches any row, or whose tag-kept spelling matches a bounce's: a bounce of the base address, whose tag-kept key is
  its mailbox's, still refuses every +tag of it. The canonical form is a lookup key only: the address stored and mailed
  is the one typed. Its only use is `screening_mail_refusal` (Q11 (b)). No role may call it.
- `screening_bounce_mark` (Q10 (a)) and `screening_run.client_subject`.
- `support_grant_notice` and `support_grant_notice_recipient`: registered tenant tables (they carry `practice_id`; no
  PHI), read by the application role under its scope as `support_grant` is (the owning group, or a platform
  administrator), written only by the operator's functions. `dunning_notice_recipient`: billing's, no role's.
- `invitation.undelivered_at` and `undelivered_reason`; the notification kind `support_notice_undelivered`; and the
  audit actions `notice_undelivered`, `mail_stream_paused` and `mail_stream_resumed`, which the application role may
  not write.

**The refusals, by triggers (section 5, D2).** No function body of PR 6b-2 or PR 6b-3 is copied but
`submit_screening()`'s, recreated with one parameter more (`client_subject text DEFAULT NULL`, after `request`; a db
test diffs the two bodies). An accepted upload is refused while the screening stream is paused (`screening_paused`); a
run is refused for its submitter's bounce budget (`screening_bounce_budget`) and then for an address on the refusal list
(`screening_contact_undeliverable`); and a run's claim, completion or failure (each ends in an email) is refused while
the screening's mail is not sending (`screening_mail_paused`), so it waits and is priced after the resume. In
`submit_screening()` the order is: closed; the ZIP statuses, the rows and `screening_band_outside_content`;
`screening_paused`; `screening_bounce_budget`; `screening_contact_undeliverable` (pinned in `screening.db.test.ts`).
The budget comes before the address (review S1, 2026-10-27): with the list first, a client or an account past its
budget learned, from which of the two refusals it got, whether any address it named had bounced or complained in the
last 12 months, with nothing recorded and nothing sent. Now it gets the budget's sentence whatever the address. The
plan's D2 had put the list first; that order was the plan's own resolution, not one of the founder's rulings (which are
Q1, Q9, Q10 (a), Q11 (b) and Q12 above), and the safer order is taken under the co-founder's standing direction of
2026-10-27. Before it asks DNS or SES's validation about an address, the web asks `screening_submit_mail_refusal()` for
the refusal `submit_screening()` would give for its submitter, in the same order (closed, paused, the budget), writing
nothing (review S4): none of the day's validations is spent on an upload the database refuses for its submitter. That
check takes no address and never reads the refusal list (the review of 2026-10-27). As first built for S4 it read the
list too, before the address checks and before `submit_screening()`'s ZIP checks, which reopened S1's oracle wider: any
client, with no budget spent, could name any address with a ZIP the release cannot price (or one SES rates MEDIUM) and
learn from which refusal it drew (the list's sentence or the ZIP's, the list's or the question to keep the address)
whether that person had reported a screening as spam or their mailbox had bounced in the last 12 months, with nothing
recorded and nothing sent. Now the list answers only from the run's trigger, after the address checks and
`submit_screening()`'s ZIP, row and band checks, so every path that ends without an email answers a listed address as
any other. The price: a listed address spends one validation, within the rate limit, and SES's check of it is recorded
in the validation account's 90-day event history, as it was at its first screening (residual 1). An AWS-internal record
no one reads is the safer side of that trade than an open oracle. The typo hint comes before both checks: it reads the
address alone and costs nothing, so a mistyped address is told its likely fix alike whether or not it is on the list.
The triggers stay the backstop. A ZIP the database refuses is not in the submitter's check (it would copy PR 6b-2's
location rule into a second function): such an upload spends one validation, within the rate limit.
The consumer reads `screening_mail_gate()` (tp_screening) before it claims; the web reads `screening_mail_status()`
(tp_app): paused, and ready only with a delivered and a bounced probe of the screening stream within 48 hours and since
the last resume.

**The outboxes (D10).** A break-glass notice is opened in its practice's scope with one pending row per current
practice administrator; each is sent in its own transaction (claim, send one message, record its message ID); the
first accepted send writes `notice_sent`; a send that threw is retried after 1, 5, 15 and 60 minutes and fails after
the fifth, or at once for a permanent SES error; the first undelivered recipient writes `notice_undelivered` once and
notifies each current administrator in the app; a notice with no administrator writes `notice_undelivered` and never
`notice_sent`. Delivery is mirrored onto the recipient row by message ID from both sides. Dunning goes the same way as
tp_billing, its undelivered stage reported once on the invoice. No change to when an organization is suspended (Q13
is the billing PR's).

**Invitations.** A Cognito message to an invited user that bounces, is suppressed, rejected or reported flags the
invitation with the message's own send time, only when it was sent at or after the invitation's latest send less 5
seconds, so the late bounce of a message a resend replaced flags nothing. The users page words each reason with the
step that can work (the review of 2026-10-27): a bounce or a rejection, check the address and invite again; one SES
held back with the account's suppression list (an earlier bounce or spam report, which M1 now reaches) and one reported
as spam offer no "Send again", and their resend is refused, since SES would hold the new email back too and Cognito's
resend replaces the temporary password of the one the person may still find in their spam folder. The page names
PaidWhole's support, who releases the address once the person confirms the mailbox and sends the invitation again
from the console (docs/runbooks/deliverability.md, 3.4). The console's resend stays open, since it is that step. The
in-app notice of an undelivered support-access notice says the same of a right address.

**Who calls what.** tp_operator: `operator_record_mail_event`, `operator_mail_account_signal`, `operator_mail_cutoff`
(the cut-off on the window as it stands, once each `mail_events` run, so a window that shrinks past the line as sends
leave it pauses the stream without a new event: review M9; the rule is written once, in `mail_stream_cutoff()`, which an
event's record reads too), `operator_mail_streams`, `operator_mail_stream_confirmed`, `operator_mail_probe_sent`,
`operator_mail_expire` and the five support-notice functions with `operator_due_support_notices`; tp_billing: the five
dunning functions; tp_app: `screening_mail_status`, `screening_submit_mail_refusal`, `console_mail_streams` (its window
start is where the counts start, the later of 7 days ago and the last resume: review M8), `console_pause_mail_stream`,
`console_resume_mail_stream`, `console_mail_undelivered` (each checking `feature_flag.manage`), `console_support_grants`
and `submit_screening`; tp_screening: `screening_mail_gate` alone. `screening_mail_sending()`,
`mail_recipient_canonical()`, the keyed hash, `mail_stream_cutoff()`, `screening_bounce_budget_spent()`,
`screening_contact_refused()` and every trigger function are granted to no role. No function sets `app.practice_ids`.
`operator_record_support_notice()`, `operator_practice_administrator_emails()` and `billing_owner_emails()` are dropped.

**When a stream's probes are missed (review M3, its follow-up and the review of 2026-10-27).**
`operator_mail_streams().probe_missed` reads the stream's proofs since the last resume, as readiness counts them, never
its last send, while the stream is open and confirmed. With both its delivered and its bounced probe back since then,
it is missed once the older is 26 hours old, whether a probe went since or not: the daily probe goes 24 hours after the
last came back, so one sent and lost pages 2 hours after it went, 22 hours before readiness lapses at 48 (as first
built, missed was read 26 hours after the lost probe's own send, about 50 hours after the last proof and 2 hours after
the screening had closed in silence), and one that cannot be sent pages within 15 minutes (`MAIL_PROBE_UNSENT`) and as
missed 26 hours after the last proof. With one not back since the resume, it is missed an hour after the first probe
sent since then (`mail_stream.first_probe_sent_at`, set by the first send after a resume and cleared by the resume,
which a re-send never moves); the screening is closed until both are back, so an hour is long enough for SES's events
and short enough not to leave it closed in silence. As the follow-up first built it, such a proof counted from the
probe last sent, so the re-send at 26 hours cleared the alarm within five minutes and raised it again 26 hours later,
while the screening stayed closed (the review of 2026-10-27). With none sent since the resume, nothing is missed, so a
resume after a long pause, or phase 2's first probes, pages no one while its probes are on their way. The platform logs
`MAIL_PROBE_MISSED` on every `mail_events` run while it holds, due or not, so its alarm stays raised until both come
back. A probe is due at once after a resume, daily once the last came back, and hourly while the stream is missed, so
once the event path is fixed the screening reopens within the hour rather than at the unanswered probe's next send, up
to 26 hours later (the first unanswered send is now kept beside the last, which the Revisit list had named).

**Address validation in its own account (review S3; the safer option, taken on the co-founder's standing direction of
2026-10-27).** SES's validation of a screening address (`GetEmailAddressInsights`, Q1 (g)) names the address in its
request, and AWS records API calls. What AWS's own documentation says, re-checked on 2026-10-27 (its documentation hosts
cannot be reached from the build, so from AWS's API models and its reference text as the SDKs ship them: CloudTrail's
`LookupEvents` in botocore 1.43.119, the trail's field selectors in the CloudFormation reference aws-cdk-lib 2.275.0
carries, SESv2's model in @aws-sdk/client-sesv2 3.1157.0 and botocore, and AWS's pages on CloudTrail Lake's availability
and on SES's CloudTrail logging, read through search):

- Every account keeps the last 90 days of its management events, reads and writes, in CloudTrail's event history, in
  each region, whatever its trails do; nothing turns it off, shortens it or deletes from it.
- SESv2 marks this request's `EmailAddress` as a plain string, not sensitive (the other insights calls'
  `InsightsEmailAddress` is sensitive), so CloudTrail is expected to record the address as typed in `requestParameters`.
- SES's sends are CloudTrail data events, off unless a trail asks for them and never in event history; this call is
  not among them, so it is a management event.
- A trail's selectors filter management events only by read or write, and leave out only KMS's or RDS Data's events.
  Filtering them by event name is for CloudTrail Lake's event data stores, which AWS closed to new customers on
  2026-05-31. So the environment's trail cannot leave out this one call except by dropping every read it records
  (secrets, keys, IAM's reads), and as built it kept every validated address in its bucket, which has no expiry.

So the call is made in an account of its own, one per environment, that holds nothing else: the stack
`tp-<env>-address-validation` (`infra/lib/address-validation-stack.ts`) has one role, which only the environment's
application role may assume (its account's root narrowed by `aws:PrincipalArn`, and never a principal of the account
itself) and which may call `ses:GetEmailAddressInsights` and nothing else, and one trail of the write management events
alone (every region and the global services, validated, under that account's own key). In the environment's account
the application role is refused the call (`NoAddressValidationHere`) and the assuming of any role of its own account
(`NoRoleOfThisAccount`), so `MailValidationRoleArn` cannot point the call back there; it may assume the validation role
only once that parameter names it, and the rule `ReleaseNeedsAddressValidationRole` refuses a release before. Its trail
still records every management event, read and write. The web assumes the role for 15 minutes at a time (STS's least),
renewed 5 minutes early; the call, credentials included, stays inside its 2-second bound; and when AWS refuses the role
or the call (`MAIL_VALIDATION_REFUSED`), which would leave every address to DNS alone, the operator is paged at once.

**What remains (the residual).**

1. The validation account's event history keeps each validation's request, with the address in it unless CloudTrail
   redacts it, for 90 days. Nobody can shorten or turn that off. Only a principal of that account allowed
   `cloudtrail:LookupEvents` can read it, and nobody works in that account: its root user under MFA and CDK's bootstrap
   roles, used only to deploy. Ninety days is longer than the screening's 30 and outside Q11 (b)'s keyed-hash-only
   rule. The screening's pages and its result email, which say the email address is deleted with the result, also say
   that the mail service keeps its record of the check 90 days (`ADDRESS_CHECK_KEPT`,
   `apps/worker/src/screening/wording.ts`; the review of 2026-10-27). The founder signs the words off and counsel sees
   them before the screening opens (O4).
2. The validation account's trail never holds a validation only while CloudTrail reads the call as a read. Staging's
   check (O11; docs/runbooks/deliverability.md, section 2) confirms that it does, with a mailbox the team controls. If it
   reads as a write, the screening stays closed until that trail changes (the fallback: no trail there, its changes
   then kept for event history's 90 days alone).
3. A trail added to that account later that records reads, data or network activity events, a CloudWatch Logs copy, or
   an AWS Organizations trail that records reads across the account, would keep the addresses again; the runbook's
   rules forbid each.
4. SES processes each address it validates, as it does each address it mails, under AWS's business associate
   agreement; the main account's trail records the web's `AssumeRole`, which names the role and the session
   (`tp-web-address-validation`), never an address.

It costs about $1.40 a month per environment: the validation account's key ($1; its trail is that account's first copy
of management events, which CloudTrail does not charge) and the refused validation's alarm and log metric ($0.40).

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| SNS topics for SES events | A topic to secure and no filter by set; EventBridge filters by set, retries for 24 hours into a dead-letter queue, and carries the account alarms' state changes on the same path |
| A NAT gateway for the queue (about $0.01 a month) | Queue traffic carrying recipient addresses would leave over the internet path, and the endpoint's policy (this account's queues only) would be lost |
| SES tenants, with their own automatic pause | They pause on SES's own findings (Standard, Strict or None), not at the founder's 3% and 0.08%, and their price was not confirmed. Revisit when they offer configurable thresholds at a known price |
| A delivery-state column on `screening_prospect` | The prospect is immutable by design, and a second copy could disagree with the mail record; PR 7 reads the record (`screening_prospect_mail_state()`) |
| A third-party address verification service, or SMTP probing | A new party receives the address, or our reputation suffers; SES's own validation goes to the sender we already use, under its BAA |
| SES's validation from the environment's own account (as first built) | Its trail, which records every read, kept each validated address in a bucket with no expiry (review S3) |
| The environment's trail records writes alone | It would give up the account's record of every read (secrets, keys, IAM's reads) to leave out one call |
| A CloudTrail Lake event data store that leaves out `GetEmailAddressInsights` by name | Closed to new customers since 2026-05-31; a trail cannot filter management events by name |
| No trail in the validation account | Its changes would be kept for event history's 90 days alone; the fallback should staging show CloudTrail reads the validation as a write |
| No SES validation at all (DNS alone) | Nothing would be recorded anywhere, but it reverses the founder's Q1 (g): the founder's to decide should counsel find event history's 90 days unacceptable |
| SES Auto Validation at send | It would silently drop a result the page already said was sent, and would drop a HIPAA notice on a heuristic |
| No bounce budget (Q10) | One client could close the public screening for everyone with seven bad addresses in a week |
| Keep a refused address's hash only as long as the prospect (Q11 (b)) | Keeps today's wording, but a known-bad or complaining address could be screened again after 30 days |
| The refusal gate on `screening_prospect` (the design's `screening_prospect_mail_gate`) | `reject_screening_upload()` writes a prospect too; a refused upload is never emailed and must still be recorded with its reasons (D9: nothing about the address runs for an upload that fails the row checks). The gate is on an accepted upload (`screening_upload_mail_gate`), which comes before the run in `submit_screening()`, so the order holds |
| The refusal list read before the bounce budget (the plan's D2 order) | A client or an account past its budget could test any address against the list with nothing recorded or sent (review S1): the submitter is refused first |
| The refusal list keyed by the address as typed, or a +tag dropped only at free-mail domains | Another spelling of an inbox that bounced or reported a screening (a +tag, Gmail's dots, googlemail.com) was mailed again (review S2); a business domain's mailbox takes +tags as Gmail's does |
| Give an attempt a pause stopped back to the run (attempts less one) | It hands out an attempt number the fence already gave, so a slow earlier attempt could pass it again; a queued run must have no attempt (`screening_run_started`); and it needs PR 6b-3's `screening_run_rules` body copied. Instead the sweep completes a run out of attempts whose rows are all priced (review M7) |
| The web's check before the address covering the ZIP statuses too | It would copy PR 6b-2's location rule into a second function to keep in step; a ZIP refusal spends one validation, within the rate limit. Revisit if the validation cap is reached on a real day |
| The web's check before the address reading the refusal list (as first built for S4) | Read before the address checks and the ZIP checks, it told any client whether an address was listed, by which refusal a ZIP the release cannot price or a MEDIUM mailbox drew, with nothing recorded or sent (the review of 2026-10-27); the run's trigger reads the list after them all |
| A permanent bounce keyed by the mailbox, its +tag dropped (as first built for S2) | A bounce of a +tag spelling a server without sub-addressing does not deliver refused the base mailbox for 365 days, and anyone could cause it (the review of 2026-10-27); a complaint still keys the mailbox |
| NFKC in both canonical rules (as first built for S2) | Node's and PostgreSQL's Unicode versions differ (U+A7F1 today), and every upgrade of either moves the key with no test failing; the form takes only ASCII, so an address outside it stands as read |
| A stream missed 26 hours after its last probe's send (as first built) | A daily probe sent and lost paged about 50 hours after the last proof, 2 hours after readiness had lapsed and the screening closed, and a probe never sent never paged as missed (review M3) |
| Missed from the last proof, counting a proof from before the last resume | A resume after a pause longer than 26 hours would page on every run until its first probes came back |
| A proof not back since the resume counted from the probe last sent (the follow-up as first built) | Each re-send moved it, so the alarm cleared within five minutes and came back 26 hours later while the screening stayed closed (the review of 2026-10-27) |
| A probe not back sent again only after 26 hours | A fixed event path left the screening closed until that send; hourly while missed costs a few simulator sends |
| `client_subject` before `request`, as PR 6b-3 placed its parameters | The previous web's submissions would fail during the deploy window; last, with a default of null, they still work, their runs held to the account's budget alone (a run with no proxy-named client address is the same) |

## Consequences

- A screening send whose bounce capture is broken cannot count toward the cut-off, so the screening closes: readiness
  needs the day's probes back (D8).
- Neither a lost probe nor an unsendable one closes the screening in silence (review M3): one sent and lost pages 2
  hours after it went (`MAIL_PROBE_MISSED`, from the stream's last proof), 22 hours before the stream's readiness
  lapses, and one the platform cannot send pages within 15 minutes (`MAIL_PROBE_UNSENT` in each of three five-minute
  periods), about a day before. A resumed stream whose probes do not come back pages an hour after they went, and stays
  raised, however often they go again. The unsent alarm adds one alarm and one log metric to Q1's figure (about $0.40 a
  month per environment); the missed one costs nothing more, its line logged on each minute's run only while a stream
  is missed. While missed, the probes go hourly (two sends to SES's simulator an hour, a stream), so after a fix the
  screening reopens within the hour, its readiness lapsed or not. Each probe event recorded is logged by its message
  ID and codes alone, which the staging checks read.
- Each environment needs a second AWS account, created by a person, bootstrapped for CDK and holding
  `tp-<env>-address-validation`, before its first release; a release cannot run without it (the rule), and an
  application role ever replaced must be named to that stack again, or every validation is refused and pages
  (`MAIL_VALIDATION_REFUSED`).
- After a pause, the runs already queued wait, not fail; a run whose completion raced the pause rolls back and is
  claimed again by the stale rule after the resume, spending one attempt, and a run whose last attempt it was is
  completed by the sweep on that attempt, its rows all priced, instead of failed for its attempts (review M7). A
  failure and its notice go in one transaction, as a completion and its link do: a notice SES refuses because the set
  is disabled rolls the failure back, and the run is failed and told after the resume (review M6).
- A pause does not stop a message already on its way, and the bound is accepted (the review of 2026-10-23, known item
  (a)): the run's gate reads `screening_mail_sending()` in the completion's or the failure's own statement, without a
  lock on `mail_stream`, so a completion or failure past that statement when a pause commits still sends through the
  set, which a cut-off pause disables at once and a console pause at the next `mail_events` run. Only those already in
  flight can, at most one for each consumer thread and one for the sweep's main thread, which completes or fails a run
  out of attempts (`finishOrFail`, since M7), so four for each consumer task (the review of 2026-10-27), each a result
  or notice owed to an upload accepted before the pause; every claim, completion and failure after the pause commits
  is refused. Whether SES refuses a send through a disabled set with `SendingPausedException`, which M6's and M7's
  rollbacks read, is a staging check (O11; docs/runbooks/deliverability.md, section 2). Locking `mail_stream` in the gate
  would hold the lock across SES's call and spare no reputation. Likewise accepted: the consumer's "emailed after
  waiting" reads the web's `received_at` against the database's `resumed_at` (known item (e)); `submit_screening()`
  holds `received_at` to the database's own time, and in staging and production the screening opens only once both
  probes are back after a resume, at least about a minute, so no skew AWS's time sync allows can misfile a run.
- The refusal list and the bounce marks are the only values derived from a screening address the database keeps
  beyond the prospect's 30 days, and only as keyed hashes: a copy of the table cannot be matched against a list of
  addresses without the pepper, which no role reads. `mail.db.test.ts` scans every text column after its scenarios and
  finds a keyed hash of an address only on the refusal list, and only of the refused screening addresses.
- The deploy window: the previous platform task's support-access notices and dunning fail at the dropped functions and
  roll back, so they wait for the new task (none is lost or sent twice); the previous web keeps submitting.
- What proves it: `packages/db/src/mail.db.test.ts` (the tables, grants by exact name, the keyed hash, the events'
  order, the cut-off at its edges and its subtypes, the account signals, the resume and its confirmation, readiness and
  probes, the outboxes, dunning, invitations, the console reads, expiry, the canonical rule against TypeScript's on
  every code point), `screening.db.test.ts` (the refusal order, the refusal list end to end, its +tag and iCloud keys,
  the budget, the run's gate, D7's body diff), the web's `screening/routes.db.test.ts` (one answer for a listed and an
  unlisted address on every path that ends without an email) and `routes/mail-routes.db.test.ts` (no resend of a held
  invitation), the worker's `mail-events.db.test.ts` (missed on every run, re-sent or not; the probe events' log
  lines), `hardening.db.test.ts` (the reserved actions), and the catalog and cross-tenant tests over the two notice
  tables.

## Revisit when

SES offers tenants with configurable pause thresholds at a confirmed price; staging shows which subtype a bounce from
SES's global suppression list carries on the screening set, whose suppression is overridden to none (O11); the screening
stream is paused in production (read the reason and the counts before resuming, and whether the floors or the budget
need the founder's ruling again); staging, after phase 2, shows whether Cognito needs a sending-authorization policy,
that the screening set's empty suppression list both adds nothing to and checks nothing against the account's list,
whether the account's reputation metrics publish at launch volume, whether CloudTrail reads SES's address validation
as a read, in the address-validation account alone, and whether SES refuses a send through a disabled set with
`SendingPausedException` (open item O11); the validation cap is reached on a real day; PR 6e adds
reminders on the screening stream (they must read the gate and the refusal list, O13); counsel answers on the
refusal-hash and bounce-budget wording (O4); or the capacity measurement is revisited. The address checks this pull
request adds (DNS and SES validation, run together after the row checks, at most one 2-second timeout) fall inside the
60-second promise, and the harness charges them (section 5, G1). How that promise is measured, the free runner with a
pull request's time advisory and a release's binding, is a decision the founder took on 2026-10-23 to save cost, not as
the best option; it is to be revisited before the screening opens and once production has traffic, by measuring on AWS
staging or on an organization's 8-core runner, and then the sizing question O9 (GitHub issue #41; ADR 0062).
