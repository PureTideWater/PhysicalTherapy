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
  send time. A suppression subtype is `suppressed` and never counts; an unknown subtype is `other`. No address and no
  hash of one; kept 30 days on the screening stream and 90 on the others.
- `mail_recipient_key` and `mail_recipient_sha256()`: the SHA-256 of a 32-byte pepper made at the migration and the
  trimmed, lower-cased address. Its only use is `screening_mail_refusal` (Q11 (b)). No role may call it.
- `screening_bounce_mark` (Q10 (a)) and `screening_run.client_subject`.
- `support_grant_notice` and `support_grant_notice_recipient`: registered tenant tables (they carry `practice_id`; no
  PHI), read by the application role under its scope as `support_grant` is (the owning group, or a platform
  administrator), written only by the operator's functions. `dunning_notice_recipient`: billing's, no role's.
- `invitation.undelivered_at` and `undelivered_reason`; the notification kind `support_notice_undelivered`; and the
  audit actions `notice_undelivered`, `mail_stream_paused` and `mail_stream_resumed`, which the application role may
  not write.

**The refusals, by triggers (section 5, D2).** No function body of PR 6b-2 or PR 6b-3 is copied but
`submit_screening()`'s, recreated with one parameter more (`client_subject text DEFAULT NULL`, after `request`; a db
test diffs the two bodies). An accepted upload is refused while the screening stream is paused (`screening_paused`)
and for an address on the refusal list (`screening_contact_undeliverable`); a run is refused for the budget
(`screening_bounce_budget`); and a run's claim, completion or failure (each ends in an email) is refused while the
screening's mail is not sending (`screening_mail_paused`), so it waits and is priced after the resume. In
`submit_screening()` the order is: closed; the ZIP statuses, the rows and `screening_band_outside_content`;
`screening_paused`; `screening_contact_undeliverable`; `screening_bounce_budget` (pinned in `screening.db.test.ts`).
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
seconds, so the late bounce of a message a resend replaced flags nothing.

**Who calls what.** tp_operator: `operator_record_mail_event`, `operator_mail_account_signal`,
`operator_mail_streams`, `operator_mail_stream_confirmed`, `operator_mail_probe_sent`, `operator_mail_expire` and the
five support-notice functions with `operator_due_support_notices`; tp_billing: the five dunning functions; tp_app:
`screening_mail_status`, `console_mail_streams`, `console_pause_mail_stream`, `console_resume_mail_stream`,
`console_mail_undelivered` (each checking `feature_flag.manage`), `console_support_grants` and `submit_screening`;
tp_screening: `screening_mail_gate` alone. `screening_mail_sending()`, the keyed hash and every trigger function are
granted to no role. No function sets `app.practice_ids`. `operator_record_support_notice()`,
`operator_practice_administrator_emails()` and `billing_owner_emails()` are dropped.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| SNS topics for SES events | A topic to secure and no filter by set; EventBridge filters by set, retries for 24 hours into a dead-letter queue, and carries the account alarms' state changes on the same path |
| A NAT gateway for the queue (about $0.01 a month) | Queue traffic carrying recipient addresses would leave over the internet path, and the endpoint's policy (this account's queues only) would be lost |
| SES tenants, with their own automatic pause | They pause on SES's own findings (Standard, Strict or None), not at the founder's 3% and 0.08%, and their price was not confirmed. Revisit when they offer configurable thresholds at a known price |
| A delivery-state column on `screening_prospect` | The prospect is immutable by design, and a second copy could disagree with the mail record; PR 7 reads the record (`screening_prospect_mail_state()`) |
| A third-party address verification service, or SMTP probing | A new party receives the address, or our reputation suffers; SES's own validation goes to the sender we already use, under its BAA |
| SES Auto Validation at send | It would silently drop a result the page already said was sent, and would drop a HIPAA notice on a heuristic |
| No bounce budget (Q10) | One client could close the public screening for everyone with seven bad addresses in a week |
| Keep a refused address's hash only as long as the prospect (Q11 (b)) | Keeps today's wording, but a known-bad or complaining address could be screened again after 30 days |
| The refusal gate on `screening_prospect` (the design's `screening_prospect_mail_gate`) | `reject_screening_upload()` writes a prospect too; a refused upload is never emailed and must still be recorded with its reasons (D9: nothing about the address runs for an upload that fails the row checks). The gate is on an accepted upload (`screening_upload_mail_gate`), which comes before the run in `submit_screening()`, so the order holds |
| `client_subject` before `request`, as PR 6b-3 placed its parameters | The previous web's submissions would fail during the deploy window; last, with a default of null, they still work, their runs held to the account's budget alone (a run with no proxy-named client address is the same) |

## Consequences

- A screening send whose bounce capture is broken cannot count toward the cut-off, so the screening closes: readiness
  needs the day's probes back (D8).
- After a pause, the runs already queued wait, not fail; a run whose completion raced the pause rolls back and is
  claimed again by the stale rule after the resume, spending one attempt (an accepted edge).
- The refusal list and the bounce marks are the only values derived from a screening address the database keeps
  beyond the prospect's 30 days, and only as keyed hashes: a copy of the table cannot be matched against a list of
  addresses without the pepper, which no role reads. `mail.db.test.ts` scans every text column after its scenarios and
  finds a keyed hash of an address only on the refusal list, and only of the refused screening addresses.
- The deploy window: the previous platform task's support-access notices and dunning fail at the dropped functions and
  roll back, so they wait for the new task (none is lost or sent twice); the previous web keeps submitting.
- What proves it: `packages/db/src/mail.db.test.ts` (the tables, grants by exact name, the keyed hash, the events'
  order, the cut-off at its edges and its subtypes, the account signals, the resume and its confirmation, readiness and
  probes, the outboxes, dunning, invitations, the console reads, expiry), `screening.db.test.ts` (the refusal order,
  the refusal list end to end, the budget, the run's gate, D7's body diff), `hardening.db.test.ts` (the reserved
  actions), and the catalog and cross-tenant tests over the two notice tables.

## Revisit when

SES offers tenants with configurable pause thresholds at a confirmed price; the screening stream is paused in
production (read the reason and the counts before resuming, and whether the floors or the budget need the founder's
ruling again); staging, after phase 2, shows whether Cognito needs a sending-authorization policy, that the screening
set's empty suppression list both adds nothing to and checks nothing against the account's list, and whether the
account's reputation metrics publish at launch volume (open item O11); the validation cap is reached on a real day; PR
6e adds reminders on the screening stream (they must read the gate and the refusal list, O13); counsel answers on the
refusal-hash and bounce-budget wording (O4); or the capacity measurement is revisited. The address checks this pull
request adds (DNS and SES validation, run together after the row checks, at most one 2-second timeout) fall inside the
60-second promise, and the harness charges them (section 5, G1). How that promise is measured, the free runner with a
pull request's time advisory and a release's binding, is a decision the founder took on 2026-10-23 to save cost, not as
the best option; it is to be revisited before the screening opens and once production has traffic, by measuring on AWS
staging or on an organization's 8-core runner, and then the sizing question O9 (GitHub issue #41; ADR 0062).
