# PR 6b, Track C: email streams, delivery recording and the screening cut-off (audit #76)

Design contract, 2026-10-21, against `claude/build-platform` at 8e33cb3. Revised the same day after one independent
review (section 15).

Audit #76 (combined-report.md:877-885) lands in PR 6b, and the screening does not go public before it lands. The
pricing engine is unchanged, so this track adds nothing to the `packages/pricing/src` freeze check
(reconciliation-001.md:428). This is a schema change, so it needs the founder's SHA-256 approval of the regenerated
domain model. Q6 and Q7 change what the screening's pages say is kept, so counsel confirms their wording with the
other screening wording (HANDOFF.md:36-40).

---

## 1. What the code does today (cited)

### Every sender of mail

| # | Message | Sent by | Today |
|---|---|---|---|
| 1 | Cognito invitation, with its temporary password | `AdminCreateUserCommand` with `DesiredDeliveryMediums: ['EMAIL']` (apps/web/src/lib/auth/cognito-provider.ts:316-345). The resend is the same command with `MessageAction: 'RESEND'` (:347-357) | Cognito sends through SES as `DEVELOPER`, from MailFromAddress, under `identity/<domain>`, with **no `ConfigurationSet`** (infra/lib/constructs/identity.ts:89-95) |
| 2 | Cognito verification and recovery codes | Cognito itself: `autoVerify: email` (identity.ts:69) and `AccountRecovery.EMAIL_ONLY` (:84) | Same as #1 |
| 3 | Monthly digest | Practice job (apps/worker/src/digest/job.ts:98-101), one message per address | `SesMailSender` |
| 4 | Support-grant (break-glass) opening and closing notices | Platform job every minute (apps/worker/src/platform/support-notices.ts:97-111) | **One message with every administrator in `To`** (:105, :109), sent **inside** the transaction that records the notice (:99-110, through `asOperator` :80-94) |
| 5 | Dunning notices | Platform job as tp_billing (apps/worker/src/billing/dunning.ts:125-150) | **One message to every billing owner** (:143-146), sent inside the `withBilling` transaction that moves the stage (:125-148) |
| 6 | Screening result link | Screening sweep, inside the transaction that completes the run (apps/worker/src/screening/job.ts:284-295) | `SesMailSender` |
| 7 | Screening failure notice | `failScreeningRun` (job.ts:147-158). A refusal is logged as `SCREENING_NOTICE_UNDELIVERABLE` (:156) | `SesMailSender` |
| 8 | Screening reminders (PR 6e) | Not built. Schema only: `operator_screening_reminders_due` and `operator_screening_reminder_sent` (migrations/20261104090000_free_screening.sql:1915, :1925) | n/a |

How it is sent:
- **SES API v2 `SendEmail`, one sender, no configuration set, no message tags.** `SesMailSender.send` returns `void` and throws away SES's `MessageId` (apps/worker/src/mail/mail.ts:64-82). The comment at :63 says "the configuration set and identity arrive with milestone 11".
- `sesMailSender(from, staticOrigin)` uses one `MAIL_FROM` for everything (mail.ts:84-86; platform/wiring.ts:45-46).
- `MailMessage.to` is an array (mail.ts:22-34). Two readers parse the local outbox's `to` as an array and call `.includes(email)`: apps/web/e2e/outbox.ts:8, :27 and tools/screening-capacity/run.ts:256, :472.

### SES and Cognito setup in infra

- The SES identity is **verified by hand, outside the stack**. MailFromAddress's domain "is a verified SES identity in this region before the deploy" (infra/lib/deploy-parameters.ts:35-36, :92-98). `mailFromDomain` is split out at :51-52. Cognito's `sourceArn` points at that identity (identity.ts:91-95).
- The send permissions are `ses:SendEmail` on `identity/*`:
  - OperatorRole, statement `SupportNotices` (infra/lib/constructs/operator-role.ts:159-163);
  - ApplicationRole, statement `DigestEmail` (application-role.ts:49-51, :107-111).
- The only SES resources in the stack are inbound: the support receipt rule set and its bucket (infra/lib/constructs/support-mail.ts).
- Interface endpoints include `SesApi` but no SQS endpoint (infra/lib/constructs/network.ts:16-26). The VPC uses 2 AZs (network.ts:57).
- No load-balancer access log and no WAF log is configured anywhere in infra/lib (no `logAccessLogs` or WAF `LoggingConfiguration`), so no record holds a screening submitter's client address.

### Launch switch and gates

- The governance "launch" is step 8 of docs/runbooks/github-governance.md:504-545: the merge of the build branch into `main`.
- The screening's public gate is `screeningOpen()` (apps/web/src/lib/screening/routes.ts:317-335). It requires the legal surfaces (apps/web/src/lib/legal-surfaces.ts:20-27, :38-46), a release in force and an approved split. Nothing in that gate knows about mail.
- The screening rate limit is 10 submissions an hour per client address and 20 a day per account, where the account is the email's domain for a business address and the mailbox for a free-mail one (apps/web/src/lib/http/rate-limit.ts:46-50; src/lib/screening/rate.ts:114-119). Subjects are stored only as HMACs (rate-limit.ts:65-67; table `rate_limit_counter`, 20261030090000_customer_sign_in_and_readiness.sql:418-428, bucket names open to any `^[a-z][a-z0-9_]{0,31}$`).
- `submit_screening` refuses by raising `check_violation` with a named constraint, which the web maps to a sentence (free_screening.sql:1047-1051; the pattern at :253, :445).

### Alarms and observability

- Operator alerts go to an SNS topic with an email subscription and an optional SMS one (infra/lib/constructs/monitoring.ts:89-123). SNS email does not go through our SES account, so a paused SES account does not silence alarms. This design keeps that.
- Existing alarms (monitoring.ts:150-265): heartbeats, last-attempt job failures, engine errors, sign-in bursts, model budget. **None covers mail.**
- `NOTICE_UNDELIVERABLE` is logged as an error (apps/worker/src/jobs/platform.ts:183, :234), but **no metric filter reads it**, so it raises no alarm.

### Runbooks

docs/runbooks/ holds billing, deploy-and-rollback, github-governance, incident-response, key-rotation, restore-drill, screening-capacity and support-mail. There is **no deliverability runbook**.

### How prospects, grants and notifications are stored

- `screening_prospect` holds `contact_email` in clear for 30 days (free_screening.sql:263-306). The row is **immutable** (`screening_prospect_fixed`, :568); a BEFORE DELETE guard keeps it until expiry or replacement (`screening_prospect_kept_until_expiry`, :570). It has no practice_id, owner-only RLS (:905), and is reached through definer functions only (grants :1964-2002). A later screening of the same practice, or from the same address, replaces it (`screening_replaced`, :343-355).
- The pages promise that, at 30 days or on replacement, "we delete the result: its rows and figures, and the practice name, ZIP code and email address you gave" (apps/web/src/lib/screening/retention.ts:23; also :34, :37, :43).
- `support_grant` is practice-scoped (packages/db/src/schema/tenancy.ts:176-192). Its only notice state is `notified_at`.
- `operator_record_support_notice` writes the system's `notice_sent` event (and `notified_at` for a closing notice) **before** anyone reads the recipient list (tenancy_hardening.sql:539-578, the insert at :572-573; recipients read after, support-notices.ts:104). `operator_due_support_notices` treats a `notice_sent` event as "opening handled" (:510-522).
- The application role may insert any audit action except `notice_sent`, `security_event`, `sign_in_failed` and `data_key_destroyed` (tenancy_hardening.sql:432-439; test hardening.db.test.ts:335-344).
- `notification` is unique on `(user_id, kind, subject_id)` (20261020090000_monitoring_digests_notifications.sql:279); `counts` and `totals_cents` are NOT NULL and may hold only keys in `monitoring_figure_codes()` (:274-275; key check 20261022090000_….sql:132-141). `{}` passes. The renderer's last branch is the digest (apps/web/src/components/monitoring/display.tsx:62-69); the query joins per kind (apps/web/src/lib/monitoring/queries.ts:55-61; kind type :18). The schema constant `NOTIFICATION_KINDS` (packages/db/src/schema/operations.ts:63) lacks `follow_up`, which the CHECK has (20261027090000_packet_and_ledger_review.sql:416-418).
- `invitation` is organization-scoped (packages/db/src/schema/onboarding.ts:118-146). Both the invite and the resend set `sent_at = now()`, the start of the request's transaction (the invite uses a savepoint, settings.ts:678-681, so it runs inside one), and the Cognito call comes after that start (invite: first query :670, `ensureUser` :674; resend: `resend_invitation` 20261030090000:203 at settings.ts:781, then the Cognito call :784).

### Honesty defects this track fixes

**(a) A notice is recorded as sent before it is sent, even when nobody can receive it.**
- `notice_sent` and `notified_at` are written first (above).
- If the practice has no administrator, the job returns `undeliverable` and the transaction commits (support-notices.ts:105-108). The grant then reads "Expiry notice sent", and the audit trail holds a `notice_sent` for a notice handed to no one.
- A send that SES accepts but suppresses also reads as sent forever.

**(b) Where it reads that way:**
- "Expiry notice sent: <time>" on the practice's support-access page (apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx:33);
- the console's support table (apps/web/src/app/console/support/page.tsx:96);
- both fed by `notified_at` (apps/web/src/lib/routes/practice.ts:54; console.ts:548-563 through `console_support_grants()`).

**(c) One failed send re-sends to everyone.** Because the send sits inside the recording transaction, a throw rolls the record back and the next run sends again; with one message per recipient (D3) that would duplicate a HIPAA notice to every administrator who already got it. D10 fixes this with a per-recipient outbox.

---

## 2. Decisions

D1. **Three SES configuration sets, one per stream.** Every message goes through exactly one.

| Stream | Set name | Carries |
|---|---|---|
| `transactional` | `tp-<env>-transactional` | Cognito (invitations, verification and recovery codes), digests |
| `notices` | `tp-<env>-notices` | Support-grant opening and closing notices, dunning |
| `screening` | `tp-<env>-screening` | Screening results and failure notices; PR 6e's reminders and withdrawal confirmations |

Every set has:
- reputation metrics on;
- TLS `REQUIRE`. Cognito's temporary passwords and codes and the screening's bearer link never go over plain SMTP. A server without TLS bounces the message, and that bounce is now visible;
- **no open or click tracking**: no `TrackingOptions`, and `vdmOptions: { engagementMetrics: false }`. Without the second, a set inherits the account's VDM engagement setting (aws-cdk-lib 2.273.0, aws-ses/lib/configuration-set.d.ts:106-112, :125-131), and engagement tracking rewrites links, the screening's token link and Cognito's included. No `AWS::SES::VdmAttributes` with engagement on is ever created;
- **Auto Validation off** (`disableAutoValidation: true`, configuration-set.d.ts:93). One rule decides deliverability before a screening send: the submit-time check (D9), which tells the prospect. Auto Validation at send would silently drop a result the page already said was sent, and a HIPAA notice is never dropped by a heuristic.

Suppression differs by stream:
- `transactional` and `notices`: the account-level suppression list, reasons `BOUNCE` and `COMPLAINT` (`suppressionReasons: BOUNCES_AND_COMPLAINTS`).
- `screening`: **no SES suppression at all** (`disableSuppressionList: true`, configuration-set.d.ts:61-67, which renders `SuppressedReasons: []`; "email sent with this configuration set will not use any suppression settings at all"). SES therefore never adds a prospect's address to the account list, keeps no copy of it past the pages' deletion promise, and never lets a screening outcome silence a customer's invitations or break-glass notices. The screening's only suppression is the database's screening refusal list (D9, D13). This rule is stated in ADR 0064.

`SendingEnabled` is **left out of the template**. D5's reconcile is what keeps a deploy from re-enabling a paused set (its drift test is the proof, section 10).

D2. **The stack owns two SES domain identities, rolled out in two phases.**
- The **MailFromAddress domain** (default set `transactional`).
- A new **screening subdomain** from a new parameter `ScreeningMailFromAddress` (default set `screening`). A CloudFormation rule refuses it when its domain equals MailFromAddress's domain.

Each identity gets Easy DKIM RSA 2048 and custom MAIL FROM `bounce.<domain>` with `USE_DEFAULT_VALUE` on MX failure. DKIM is aligned either way, so DMARC still passes. The stack outputs every DNS record (section 7).

Cognito's `DEVELOPER` mode needs a verified identity in `SourceArn`, and a stack-created identity verifies only after the founder sets the DNS records from that deploy's outputs. So a new parameter **`MailIdentitiesVerified`** (`false` default, or `true`) gates what depends on verification:
- **Phase 1 (`false`)**: the identities, sets, event path, queue and alarms are created; the user pool keeps Cognito's default sender (`EmailConfiguration` omitted with `Fn::If` → `AWS::NoValue`); the platform task gets `MAIL_IDENTITIES_VERIFIED=false`, so no probe is sent and the screening stays closed (D8). No customer exists before launch, so nothing else is mailed.
- **Phase 2 (`true`)**, after both identities read `VerifiedForSendingStatus: true` and DKIM `SUCCESS` (`aws sesv2 get-email-identity`): the user pool sends as `DEVELOPER` through the transactional set, and probes start.
- An environment that already has a hand-verified identity for the domain `cdk import`s it in phase 1 instead of creating it (creating would fail as a duplicate; deleting it first would change its DKIM tokens and stop mail until re-verified).

D3. **Each message has one recipient and carries its identity as SES tags, never an address.**

`MailMessage` becomes `{ to: string; stream; kind; subject?; practice?; recipientUser?; ... }`. `SesMailSender` sets `ConfigurationSetName`, the stream's From, Reply-To on the screening stream (Q5), and `EmailTags`:
- `tp_kind`;
- `tp_subject` (the notice record, digest, invoice, screening run or lead UUID);
- `tp_practice` (support notices only);
- `tp_recipient` (the user UUID, customer streams only).

It returns `{ messageId }`. A tag value that fails `^[A-Za-z0-9_-]{1,64}$` throws before sending. The local sender keeps writing `to` as a **one-element array** in its JSON file, so the outbox readers (e2e/outbox.ts:27, screening-capacity/run.ts:472) keep exact matching; a test pins the shape.

D4. **Event path.**
1. Each set has an event destination to the account's **default EventBridge bus**, for `SEND, REJECT, BOUNCE, COMPLAINT, DELIVERY, DELIVERY_DELAY, RENDERING_FAILURE`.
2. Rule `mail-events`: `source: aws.ses`, `detail.mail.tags.ses:configuration-set` in the three names. Rule `mail-account-alarms`: `source: aws.cloudwatch`, `detail-type: CloudWatch Alarm State Change`, `resources` = the two account warning alarms (section 10), `detail.state.value: ALARM`. Both target SQS `tp-<env>-mail-events`, each with a target DLQ.
3. The queue:
   - is encrypted with the environment key, holds messages 4 days, has a 60 s visibility timeout and redrives to `tp-<env>-mail-events-dlq` after 5 receives;
   - its DLQ holds messages 14 days (SQS counts from the original enqueue time);
   - its policy admits only `events.amazonaws.com` with `aws:SourceArn` in the two rule ARNs, and denies requests without TLS.
4. **No EventBridge archive** is created: an archive would keep addresses past every promise. The DLQ is the replay path.

Why EventBridge over SNS: no topic to secure; the rule filters by set; the target has its own retries (24 h) and DLQ; the same queue takes the alarm signal.

The tasks reach SQS through a new **SQS interface endpoint** (PRD 16 and network.ts:8-10 send AWS traffic through endpoints wherever one exists; its policy limits it to this account's queues). The founder's choice is Q1(a).

D5. **One platform job, `mail_events`, runs every minute on the platform task as tp_operator.** Each run does, in order:

1. **Reconcile.**
   - `GetAccount`: `EnforcementStatus` other than `HEALTHY` (`PROBATION` or `SHUTDOWN`, client-sesv2 models_0.d.ts:4271-4295) calls `operator_mail_account_signal('enforcement_not_healthy')` (D6).
   - Make the screening set's `SendingEnabled` match `operator_mail_streams()` (`GetConfigurationSet` / `PutConfigurationSetSendingOptions`). After `GetConfigurationSet` reads enabled while the database is open, `operator_mail_stream_confirmed('screening')` sets `ses_enabled_confirmed_at`; reading disabled clears it. Claims need it (D7).
2. **Probes** (skipped while `MAIL_IDENTITIES_VERIFIED=false` or a stream is paused or unconfirmed). Once a day per stream, and at once after a resume: send to `success@` and `bounce@simulator.amazonses.com`, tagged `tp_kind=probe`. This proves the whole event path every day.
3. **Drain the queue.** Receive up to 10 messages a call, at most 1,000 or 50 s a run. For each message:
   - parse it (zod: only the fields used; `diagnosticCode` is never read). An alarm state change calls `operator_mail_account_signal('bounce_rate_alarm' | 'complaint_rate_alarm')`; an SES event goes on;
   - open one transaction, scoped to `tp_practice` when the tag is present, otherwise to no practice;
   - call `operator_record_mail_event(...)`;
   - commit, then `DeleteMessage`.

   A message that will not parse is logged by its SQS message ID with `MAIL_EVENT_UNREADABLE` and left for the DLQ.

   Processing is idempotent by `ses_message_id` and event type: a repeat changes nothing and returns `recorded = false`. Events out of order resolve by state precedence (section 3).
4. **Act on what the functions return.**
   - `MAIL_STREAM_PAUSED` (error, with the reason): disable the screening set in SES at once.
   - `NOTICE_UNDELIVERED` (error, with `support_grant_id` or `invoice_id`).
   - `INVITATION_UNDELIVERED` (warn, with `invitation_id`).
   - `MAIL_PROBE_MISSED` (error, with the stream) when a probe has not come back in 26 h.

   Logs carry IDs and codes only. The address appears in no log line, payload, audit event or error message. Outside SES, its only copy is the SQS message, encrypted, for at most 4 days (14 in the DLQ).

A nightly `mail_expiry` job (03:50 UTC) deletes expired `mail_send`, `screening_mail_refusal` and (Q7) `screening_bounce_mark` rows.

D6. **The cut-off pauses the screening stream, and only that stream. Three triggers.**

(a) **The screening's own rates.** After a screening event that records a permanent bounce or a complaint, the database computes over the **window**, which starts at `greatest(now() - 7 days, mail_stream.window_starts_at)` (`window_starts_at` is the last resume):
- `sends`: screening messages sent in the window, probes excluded, and excluding state `suppressed` and `rejected` (never handed to a mailbox);
- `bounces`: among them, `state = 'bounced' AND bounce_kind = 'permanent'`. Every suppression subtype maps to state `suppressed` and never counts; transient and undetermined bounces never count;
- `complaints`: among them, `state = 'complained'` with `complaint_type <> 'not_spam'`.

It pauses when:
```
bounces * 10000 > 300 * greatest(sends, 200)        -- above 3%, floor 200 sends
OR complaints * 100000 > 80 * greatest(sends, 2500) -- above 0.08%, floor 2,500 sends
```
So, below the floors, 7 hard bounces or 3 complaints in a week pause the stream. Integer arithmetic only. Reason `bounce_rate` or `complaint_rate`.

(b) **The account's rates, which SES acts on.** The account warning alarms (`Reputation.BounceRate` ≥ 0.025, `Reputation.ComplaintRate` ≥ 0.0005; half of SES's review levels) reach the queue through `mail-account-alarms` (D4). Either one pauses screening with reason `account_rate`, whatever stream caused it: the free funnel is the stream the account can most afford to shed.

(c) **SES's own enforcement.** `GetAccount.EnforcementStatus` other than `HEALTHY` pauses screening with reason `account_review`.

A pause:
- sets `mail_stream.paused_at`, `paused_reason`, the window counts, and clears `ses_enabled_confirmed_at`;
- writes the system audit event `mail_stream_paused` (purpose = the reason);
- makes the job disable the SES set and log `MAIL_STREAM_PAUSED`, whose alarm goes to the operator topic (SMS when configured).

The `transactional` and `notices` streams are never paused: a CHECK forbids it. They alarm instead.

**Resume** is a platform administrator's deliberate act, `console_resume_mail_stream('screening', reason)`, reasons `cause_fixed` or `false_alarm`. It writes `mail_stream_resumed`, resets the window, sets `resumed_at`, clears `probe_sent_at` (probes due at once), and leaves `ses_enabled_confirmed_at` empty until the reconcile confirms SES is sending. The operator can also pause by hand (`console_pause_mail_stream`, reason `operator`). Thresholds, floors and manual resume are Q2.

D7. **While the screening stream is not sending** (`screening_mail_sending()` = not paused **and** SES confirmed since the last pause):
- `screeningOpen()` returns `{ open: false, reason: 'mail_paused' }` when paused (and `not_ready` while unconfirmed, D8).
- The page says (draft; the founder may edit):

  > **New screenings are paused.** Too many of our recent result emails could not be delivered, so we have stopped sending them while we fix it. Screenings uploaded before the pause are kept and will be emailed when we resume, if that is within 30 days of the upload. Result links already sent still work.

- The database refuses, through **triggers**, so no function body owned by Track A or Track B is copied (section 3, migration order):
  - a BEFORE INSERT trigger on `screening_prospect` raises the coded refusal `screening_paused` while paused;
  - a BEFORE UPDATE trigger on `screening_run` raises `screening_mail_paused` on a claim (`queued`/`pricing` → `pricing`), a completion (`pricing` → `complete`) or a failure (→ `failed`, whose notice is mail too) while not sending.
- The screening job reads `screening_mail_sending()` first and sweeps nothing while it is false, so it neither claims nor burns attempts. A run whose completion raced the pause rolls back and logs `screening run waits: email paused`; Track B's stale rule claims it again after the resume, using one attempt (an accepted, tested edge). `SendingPausedException` at send is handled the same way.
- On completion, the job logs `held_by_mail_pause: true` when the run was created before `mail_stream.resumed_at`; Track B's time-to-email metric filter excludes those lines.
- Reminders (PR 6e) must check the same function (open item 4).

D8. **In production and staging, the screening opens only when its mail path is proven.**
- `screening_mail_status().ready` requires `screening_mail_sending()` and a delivered **and** a bounced probe for the `screening` stream within the last 48 h.
- `screeningOpen()` requires `ready` (dev ignores readiness but honours a pause).
- After a resume, probes go at once, so the screening reopens a few minutes after the reconcile confirms.

This turns "the screening does not go public before #76 lands" into a runtime check. If bounce capture breaks, the cut-off cannot work, so the screening closes.

D9. **Address checks before a screening send**, at submit, in this order:

0. The server's existing upload checks (rows, the 11-line floor) and the rate limit pass first. Nothing below runs, or costs, for an upload that fails them.
1. **Typo suggestions**, in the browser and again on the server (`apps/web/src/lib/screening/address.ts`). Soft: the prospect can keep the address as typed.
   - a domain within Damerau-Levenshtein distance 2 of a short list of mail providers (gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, aol.com, comcast.net, msn.com, live.com, att.net, verizon.net, me.com, and others), and not on it: "Did you mean …@gmail.com?";
   - a TLD not in a committed IANA snapshot (`tlds.ts`, with its version line): a warning.
2. **DNS, on the server only**, through the VPC resolver (`node:dns` `Resolver`, timeout 2 s, one try). NXDOMAIN, a null MX (RFC 7505), or no MX and no A or AAAA refuse. A timeout or SERVFAIL accepts and logs `MAIL_DOMAIN_CHECK_UNAVAILABLE`, with no domain in the log. This reveals the domain only, to DNS, which SES looks up seconds later anyway.
3. **SES's validation of the address** (`GetEmailAddressInsights`, IAM action `ses:GetEmailAddressInsights`; $0.01 each; Q1(c)). The response is a `ConfidenceVerdict` of `LOW`, `MEDIUM` or `HIGH` for `IsValid` and each evaluation (client-sesv2 3.1152.0, GetEmailAddressInsightsCommand.d.ts):

   | Verdict | Action |
   |---|---|
   | `IsValid`, `HasValidSyntax`, `HasValidDnsRecords` or `MailboxExists` is `LOW` | refuse |
   | otherwise `IsValid` or `MailboxExists` is `MEDIUM` | warn ("We could not confirm this mailbox exists"); the prospect may keep it |
   | otherwise | accept |
   | `IsRoleAddress`, `IsDisposable`, `IsRandomInput` | not used: they say nothing about delivery, and a practice's `billing@` is a role address |
   | timeout (2 s) or error | accept, log `MAIL_VALIDATION_UNAVAILABLE` |
   | past the day's cap (Q1(c); rate-limit bucket `screening_validation` with one fixed subject) | skip the call (steps 1-2 still ran), log `MAIL_VALIDATION_CAP_REACHED` |

   This goes to the sender we already use, under its BAA. It is no new party.
4. **In the database** (`submit_screening`, through the BEFORE INSERT trigger on `screening_prospect`):
   - the screening stream is paused: `screening_paused`;
   - the address's keyed hash is on the **screening refusal list** (D13): `screening_contact_undeliverable`;
   - (Q7) the submitter's client address or email account has had 3 or more permanent screening bounces in 7 days: `screening_bounce_budget`.

**One wording for every address refusal** (DNS, validation `LOW`, the refusal list), so the form reveals nothing about any earlier screening:

> We cannot send email to this address. Check it, or use another address.

The refusal list holds **screening-stream outcomes only**. No customer stream's bounce, suppression or complaint is ever read, so the public form reveals nothing about a customer's mail.

No third-party verification service and no SMTP probing is used: both would hand the address to a new party or harm our reputation.

D10. **Notices are sent one recipient at a time from a recorded outbox, and undelivered ones are flagged in three places.**

**Break-glass (support grants).**
1. *Open the notice* (one transaction, scoped to the practice): `operator_open_support_notice(grant, notice, request)` reads the practice's current administrators and inserts the `support_grant_notice` row and one `support_grant_notice_recipient` row per administrator (`state = 'pending'`, no message ID). A closing notice also sets `notified_at`, which keeps its meaning "the closing notice was handled".
   - With **no administrator**, it records `recipients = 0`, writes the system event `notice_undelivered` (purpose = the notice), and writes **no** `notice_sent`. The job logs `NOTICE_UNDELIVERABLE`, as today.
2. *Send each recipient* (one transaction per recipient): `operator_support_notice_claim(notice, user)` locks a pending row (`FOR UPDATE SKIP LOCKED`, `next_attempt_at <= now()`) and returns the address; the job sends one message; `operator_support_notice_sent(notice, user, message_id, request)` stores the message ID and commits. The first accepted send writes the system's `notice_sent` event (purpose = the notice): "handed to the mail service" stays true.
   - If the send throws, the transaction rolls back, and a new one calls `operator_support_notice_failed(notice, user, error_name, permanent, request)`: attempts + 1, the next try after 1, 5, 15 and 60 minutes; after the fifth, or at once for a permanent SES error (`MessageRejected`, `AccountSuspendedException`, `MailFromDomainNotVerifiedException`), the row is `failed`.
   - A retry sends only to rows still pending. No administrator gets the notice twice, except in one residual case: SES accepted the message and the commit then failed. That sends one extra copy to that one person, which is the only alternative to recording a send that may not have happened.
3. *Delivery state* is mirrored onto the recipient row by message ID, from both sides, with the precedence in section 3: `operator_record_mail_event` updates the row whose `ses_message_id` matches, and `operator_support_notice_sent` copies a `mail_send` state that arrived first. An event for a message whose ID was never recorded (the residual case) changes no count. Counts are counted from the rows, so they can never exceed the recipients.
4. *The first undelivered recipient* of a notice (`bounced`, `suppressed`, `rejected` or `failed`), once per notice (`undelivered_reported_at`):
   - writes the system audit event `notice_undelivered` (purpose = the notice);
   - creates one in-app notification `support_notice_undelivered`, subject = the `support_grant_notice` row's `id` (so the opening and closing notices of one grant never collide on `notification_once`), with `counts = {}` and `totals_cents = {}`, for each current practice administrator. In-app is the fallback channel the practice still sees;
   - raises `NOTICE_UNDELIVERED` for the operator, whose runbook says to reach the practice another way.
5. `operator_due_support_notices` treats an opening as handled when its `support_grant_notice` row exists, or (for grants noticed before this migration) a system `notice_sent` event exists. Closings stay on `notified_at`.

**Dunning**, the same outbox, as tp_billing:
- the stage transaction (dunning.ts:125-148) calls `billing_open_dunning_notice(invoice, stage, request)`, which inserts one `dunning_notice_recipient` row per billing owner; with none, it writes `notice_undelivered` on the invoice (purpose = the stage) and the job logs `NOTICE_UNDELIVERABLE`, as today;
- then one transaction per owner: `billing_dunning_notice_claim`, send, `billing_dunning_notice_sent` / `billing_dunning_notice_failed`;
- the first undelivered owner writes `notice_undelivered` on the invoice (purpose = the stage) once, and raises `NOTICE_UNDELIVERED` with `invoice_id`.
- **No change to when an organization is suspended.** That is Q4, for the billing PR.

**Invitations**: a bounce, suppression, rejection or complaint on the transactional stream, to the address of a user with a pending invitation, sets `invitation.undelivered_at` to the **message's** send time (`mail.timestamp`) and `undelivered_reason`, but only when that time is at or after `invitation.sent_at - interval '5 seconds'`. `sent_at` is the request transaction's start, before the Cognito call (section 1), so a late bounce of the message a resend replaced never flags the new invitation; the 5 s covers clock skew between SES and the database. It raises `INVITATION_UNDELIVERED`. The users page shows it while `undelivered_at >= sent_at - 5 s`.

D11. **Delivery state on screening prospects is the prospect's mail record.**
- Each screening `mail_send` row carries `screening_prospect_id` (`ON DELETE SET NULL`), resolved from the `tp_subject` run. The prospect's state is its latest row.
- **No read function in PR 6b**: nothing in PR 6b shows a prospect's mail state. PR 7, which owns the console's lead list and its read functions (reconciliation-001.md:519; HANDOFF.md:29), adds `screening_prospect_mail_state()`.
- No column is added to `screening_prospect` for it: its row is immutable by design (free_screening.sql:568), and a second copy could disagree. Q3.

D12. **No address is stored by the mail record.** `mail_send` holds no address and no hash of one (the earlier draft's `recipient_sha256` column is gone): the cut-off, the notice states and the invitation flag need only the message ID, the user and the subject. The only address-derived value kept is the screening refusal list's keyed hash (D13):
- `mail_recipient_sha256(address)` = SHA-256 of a 32-byte random pepper followed by `lower(btrim(address))`;
- the pepper is generated at migration from two `gen_random_uuid()` values (the repo has no pgcrypto; builtin `sha256()` is already used, free_screening.sql:1098) and lives in the owner-only `mail_recipient_key`, so a copy of the list alone cannot be matched against a list of addresses;
- the function is definer-only and executable by no login role.

D13. **Screening refusal list and retention (Q6, founder and counsel).**
- A screening-stream **permanent bounce** (state `bounced`) or a **complaint** other than `not_spam` adds the address's keyed hash to `screening_mail_refusal`. Nothing else does.
- How long it is kept is Q6. Recommended: 12 months, only to refuse sending to it again, with the screening's pages, terms and data-retention.md saying so. Alternative: no longer than the prospect (its 30 days, or its replacement), deleted by the prospect's delete trigger.
- Every other screening mail record holds no address-derived value and loses its prospect link when the prospect is deleted.

---

## 3. Schema (one migration, `<ts>_mail_streams.sql`, ordered after Track A's `20261105090000_pricing_location_and_zip_plus_four.sql` and Track B's migration)

All new global tables:
- `ENABLE` and `FORCE ROW LEVEL SECURITY`;
- `REVOKE ALL FROM PUBLIC`;
- an owner policy `FOR ALL TO tp_owner USING (true) WITH CHECK (true)`, as with `support_mail_receipt` (20261101120000_support_mail.sql:41-53).

The exceptions are the two support-notice tables (tenant tables) and `dunning_notice_recipient` (billing).

### `mail_recipient_key` (global, owner-only, one row)
```sql
CREATE TABLE mail_recipient_key (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  pepper bytea NOT NULL CHECK (octet_length(pepper) = 32)
);
-- seeded once: decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex')
-- no grant to any role; read only by mail_recipient_sha256() (SECURITY DEFINER, EXECUTE revoked from PUBLIC,
-- granted to no login role; called only inside other definer functions and triggers)
```

### `mail_stream` (global, owner-only, three seeded rows)
```sql
CREATE TABLE mail_stream (
  stream text PRIMARY KEY CHECK (stream IN ('transactional', 'notices', 'screening')),
  paused_at timestamptz,
  paused_reason text CHECK (paused_reason IN ('bounce_rate', 'complaint_rate', 'account_rate', 'account_review', 'operator')),
  paused_by uuid REFERENCES "user" (id),
  pause_sends integer CHECK (pause_sends >= 0),
  pause_bounces integer CHECK (pause_bounces >= 0),
  pause_complaints integer CHECK (pause_complaints >= 0),
  window_starts_at timestamptz NOT NULL DEFAULT now(),
  resumed_at timestamptz,
  ses_enabled_confirmed_at timestamptz,
  probe_sent_at timestamptz,
  probe_delivered_at timestamptz,
  probe_bounced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_stream_only_screening_pauses CHECK (stream = 'screening' OR paused_at IS NULL),
  CONSTRAINT mail_stream_pause_reason CHECK ((paused_at IS NULL) = (paused_reason IS NULL)),
  CONSTRAINT mail_stream_pause_by CHECK (paused_at IS NULL OR (paused_reason = 'operator') = (paused_by IS NOT NULL)),
  CONSTRAINT mail_stream_pause_counts CHECK ((paused_at IS NULL) = (pause_sends IS NULL)
     AND (pause_sends IS NULL) = (pause_bounces IS NULL) AND (pause_sends IS NULL) = (pause_complaints IS NULL)),
  CONSTRAINT mail_stream_paused_unconfirmed CHECK (paused_at IS NULL OR ses_enabled_confirmed_at IS NULL)
);
```

### `mail_send` (global, owner-only; one row per message, each message has one recipient)
```sql
CREATE TABLE mail_send (
  ses_message_id text PRIMARY KEY CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  stream text NOT NULL REFERENCES mail_stream (stream),
  kind text NOT NULL CHECK (kind IN ('cognito', 'digest', 'dunning', 'support_grant_opened', 'support_grant_closed',
    'screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')),
  subject_id uuid,                                    -- notice row, digest, invoice, screening run or lead; null for cognito/probe
  recipient_user_id uuid REFERENCES "user" (id),      -- customer streams; resolved by address for cognito
  screening_prospect_id uuid REFERENCES screening_prospect (id) ON DELETE SET NULL,
  state text NOT NULL CHECK (state IN ('sent', 'delayed', 'delivered', 'bounced', 'suppressed', 'rejected', 'complained')),
  bounce_kind text CHECK (bounce_kind IN ('permanent', 'transient', 'undetermined')),
  bounce_subtype text CHECK (bounce_subtype IN ('general', 'no_email', 'suppressed', 'on_account_suppression_list',
    'on_configuration_set_suppression_list', 'mailbox_full', 'message_too_large', 'content_rejected',
    'attachment_rejected', 'other')),
  complaint_type text CHECK (complaint_type IN ('abuse', 'auth_failure', 'fraud', 'not_spam', 'virus', 'other', 'unspecified')),
  sent_at timestamptz NOT NULL,                        -- SES mail.timestamp
  delivered_at timestamptz, undelivered_at timestamptz, complained_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT mail_send_stream_kind CHECK (
       (stream = 'transactional' AND kind IN ('cognito', 'digest', 'probe'))
    OR (stream = 'notices' AND kind IN ('support_grant_opened', 'support_grant_closed', 'dunning', 'probe'))
    OR (stream = 'screening' AND kind IN ('screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe'))),
  CONSTRAINT mail_send_subject CHECK ((kind IN ('cognito', 'probe')) = (subject_id IS NULL)),
  CONSTRAINT mail_send_screening_names_no_user CHECK (stream <> 'screening' OR recipient_user_id IS NULL),
  CONSTRAINT mail_send_prospect_on_screening CHECK (stream = 'screening' OR screening_prospect_id IS NULL),
  CONSTRAINT mail_send_bounce CHECK ((state IN ('bounced', 'suppressed')) = (bounce_kind IS NOT NULL)
     AND (bounce_kind IS NULL) = (bounce_subtype IS NULL)),
  CONSTRAINT mail_send_complaint CHECK ((state = 'complained') = (complaint_type IS NOT NULL)),
  CONSTRAINT mail_send_expiry CHECK (expires_at > sent_at AND expires_at <= sent_at + interval '91 days')
);
CREATE INDEX mail_send_by_stream ON mail_send (stream, sent_at);
CREATE INDEX mail_send_by_subject ON mail_send (kind, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX mail_send_by_prospect ON mail_send (screening_prospect_id) WHERE screening_prospect_id IS NOT NULL;
CREATE INDEX mail_send_undelivered ON mail_send (stream, undelivered_at) WHERE undelivered_at IS NOT NULL;
CREATE INDEX mail_send_by_expiry ON mail_send (expires_at);
```

**State precedence.** `sent` < `delayed` < `delivered` < {`bounced`, `suppressed`, `rejected`} (terminal). `complained` may follow `delivered`. A lower-ranked event never overwrites a higher one. The first event seen for a message creates its row, with `sent_at` from the event's `mail.timestamp`, so a bounce that arrives before its Send event still counts.

Mapping: `suppressed` = bounce subtype `OnAccountSuppressionList`, `Suppressed` or `OnConfigurationSetSuppressionList`. An unknown subtype maps to `other` and the row is `bounced`.

**Retention** (`expires_at`, set by the trigger `mail_send_expiry()`): screening stream 30 days after `sent_at` (and its prospect link goes when the prospect goes); transactional and notices 90 days. The durable record of a notice's delivery is the mirrored state on its recipient row, which follows the grant or invoice.

### `screening_mail_refusal` (global, owner-only)
```sql
CREATE TABLE screening_mail_refusal (
  recipient_sha256 text PRIMARY KEY CHECK (recipient_sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (reason IN ('bounced', 'complained')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT screening_mail_refusal_expiry CHECK (expires_at > recorded_at AND expires_at <= recorded_at + interval '366 days')
);
CREATE INDEX screening_mail_refusal_by_expiry ON screening_mail_refusal (expires_at);
```
- Written only by `operator_record_mail_event` for a screening-stream permanent bounce or a complaint other than `not_spam`. A repeat moves `expires_at` forward.
- `expires_at` = `recorded_at + MAIL_REFUSAL_DAYS` (365 under Q6's recommendation). Under Q6's alternative, `MAIL_REFUSAL_DAYS` = 30 and the trigger below also deletes the prospect's row.
- A BEFORE DELETE trigger `screening_prospect_mail_forget` on `screening_prospect` (it fires after `screening_prospect_kept_until_expiry`, by name) deletes the refusal row for `mail_recipient_sha256(OLD.contact_email)` **only under Q6's alternative**; under the recommendation it does nothing and is not created.

### `screening_bounce_mark` (global, owner-only; only if Q7 is yes)
```sql
CREATE TABLE screening_bounce_mark (
  subject text NOT NULL CHECK (subject ~ '^[0-9a-f]{64}$'),
  subject_kind text NOT NULL CHECK (subject_kind IN ('client', 'account')),
  ses_message_id text NOT NULL REFERENCES mail_send (ses_message_id) ON DELETE CASCADE,
  bounced_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at = bounced_at + interval '7 days'),
  PRIMARY KEY (subject_kind, subject, ses_message_id)
);
CREATE INDEX screening_bounce_mark_by_expiry ON screening_bounce_mark (expires_at);
```
- `screening_prospect` gains two insert-time columns, `client_subject` and `account_subject` (`text`, nullable, `CHECK (… ~ '^[0-9a-f]{64}$')`): the same HMACs the screening rate limit already stores (rate-limit.ts:65-67, bucket `screening`). They are immutable with the row and deleted with it.
- On a screening permanent bounce, `operator_record_mail_event` reads the run's prospect and inserts one mark per non-null subject. The marks name no address and expire in 7 days.

### `support_grant_notice` and `support_grant_notice_recipient` (practice-scoped; both registered)
```sql
CREATE TABLE support_grant_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_grant_id uuid NOT NULL REFERENCES support_grant (id),
  practice_id uuid NOT NULL REFERENCES practice (id),
  notice text NOT NULL CHECK (notice IN ('support_grant_opened', 'support_grant_closed')),
  recipients smallint NOT NULL CHECK (recipients BETWEEN 0 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  undelivered_reported_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_grant_notice_once UNIQUE (support_grant_id, notice),
  CONSTRAINT support_grant_notice_practice UNIQUE (id, practice_id)
);
CREATE INDEX support_grant_notice_by_practice ON support_grant_notice (practice_id, support_grant_id);

CREATE TABLE support_grant_notice_recipient (
  notice_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES "user" (id),
  ses_message_id text UNIQUE CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sent', 'delayed', 'delivered', 'complained',
    'bounced', 'suppressed', 'rejected', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (failure_code ~ '^[A-Za-z]{1,64}$'),   -- the SES error's name, never its message
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_id),
  FOREIGN KEY (notice_id, practice_id) REFERENCES support_grant_notice (id, practice_id),
  CONSTRAINT support_grant_notice_recipient_sent CHECK ((ses_message_id IS NULL) = (state IN ('pending', 'failed'))
     AND (ses_message_id IS NULL) = (sent_at IS NULL)),
  CONSTRAINT support_grant_notice_recipient_failed CHECK ((state = 'failed') = (failure_code IS NOT NULL))
);
CREATE INDEX support_grant_notice_recipient_by_practice ON support_grant_notice_recipient (practice_id, notice_id);
CREATE INDEX support_grant_notice_recipient_pending ON support_grant_notice_recipient (next_attempt_at) WHERE state = 'pending';
```
For each of the two tables:
- FORCE RLS; registered policy `<table>_tenant`: permissive, ALL commands, all roles, USING and WITH CHECK exactly `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])`;
- the owner policy for the definer functions, as the other tenant tables; `GRANT SELECT TO tp_app`; no write grant to any login role;
- `INSERT INTO phi_table_registry (table_name, registered_by, policy_name)`.

Neither is PHI. They are registered because catalog.ts:11-12 requires every table with a NOT NULL `practice_id` to be. The definers copy the grant's own `practice_id` and assert the transaction's scope with `operator_assert_scope` (tenancy_hardening.sql:524-532). Retention follows the grant (grants are not deleted today).

### `dunning_notice_recipient` (billing; organization-scoped, no practice)
```sql
CREATE TABLE dunning_notice_recipient (
  invoice_id uuid NOT NULL REFERENCES invoice (id),
  stage text NOT NULL CHECK (stage IN ('payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated')),
  organization_id uuid NOT NULL REFERENCES organization (id),
  user_id uuid NOT NULL REFERENCES "user" (id),
  -- ses_message_id, state, attempts, next_attempt_at, failure_code, sent_at, updated_at:
  -- exactly as support_grant_notice_recipient, with the same two CHECKs
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, stage, user_id)
);
CREATE INDEX dunning_notice_recipient_by_organization ON dunning_notice_recipient (organization_id, invoice_id);
CREATE INDEX dunning_notice_recipient_pending ON dunning_notice_recipient (next_attempt_at) WHERE state = 'pending';
-- FORCE RLS; owner policy FOR ALL; no policy or grant for tp_app, tp_operator or tp_billing: every write and read is
-- through the billing definers below (the stages are invoice.dunning_stage's list less 'resolved',
-- 20261029150000_billing.sql:98). Retention follows the invoice, which is never deleted (invoice_rules, :161-181).
```

### Changed tables and policies
- `invitation`: adds `undelivered_at timestamptz` (the undelivered message's send time) and `undelivered_reason text CHECK (undelivered_reason IN ('bounced','suppressed','rejected','complained'))`, with `CHECK ((undelivered_at IS NULL) = (undelivered_reason IS NULL))`. Only the definer writes them; the app role gets no column grant.
- `notification`: `notification_kind_check` gains `'support_notice_undelivered'` (latest form 20261027090000_packet_and_ledger_review.sql:416-418; drop and add, as before). Its rows use `counts = '{}'` and `totals_cents = '{}'`, so `monitoring_figure_codes()` is unchanged.
- `audit_event_record` policy: DROP and CREATE as at tenancy_hardening.sql:432-439, with `notice_undelivered`, `mail_stream_paused` and `mail_stream_resumed` added to the reserved list, so the application role cannot forge them.
- (Q7) `screening_prospect`: `client_subject`, `account_subject`.

### Triggers
| Trigger | On | Does |
|---|---|---|
| `mail_send_expiry` | `mail_send` BEFORE INSERT | Sets `expires_at` by stream |
| `screening_prospect_mail_gate` | `screening_prospect` BEFORE INSERT | Raises `screening_paused`, `screening_contact_undeliverable` or (Q7) `screening_bounce_budget` as coded refusals (`check_violation` with that constraint name) |
| `screening_run_mail_gate` | `screening_run` BEFORE UPDATE OF status | Raises `screening_mail_paused` on a claim, completion or failure while `screening_mail_sending()` is false |
| `screening_prospect_mail_forget` | `screening_prospect` BEFORE DELETE | Only under Q6's alternative (D13) |

### Functions (all `SECURITY DEFINER`, `SET search_path = pg_catalog, public, pg_temp`, `REVOKE ... FROM PUBLIC`)

| Function | Grant | Does |
|---|---|---|
| `mail_recipient_sha256(text)` | none | Keyed hash. Never raises with its input |
| `screening_mail_sending()` returns boolean | tp_operator, Track B's screening login, tp_app | Not paused and SES confirmed |
| `screening_mail_status()` returns `(paused boolean, ready boolean)` | tp_app | For `screeningOpen()` |
| `operator_record_mail_event(message_id text, stream text, event text, mail_at timestamptz, event_at timestamptz, recipient text, kind text, subject uuid, recipient_user uuid, practice uuid, bounce_kind text, bounce_subtype text, complaint_type text, request text)` returns `(recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text)` | tp_operator | Upserts `mail_send` and moves its state. Notices: asserts scope; mirrors the state onto the recipient row with that message ID; the first-undelivered actions (D10). Transactional: the invitation flag (D10). Screening: the prospect link, the refusal list (D13), (Q7) the marks, the cut-off (D6 a). Probe: the probe columns. `recipient` is used only to resolve a Cognito user and to hash a refused screening address; it is never stored |
| `operator_mail_account_signal(signal text, request text)` returns `paused boolean` | tp_operator | `bounce_rate_alarm`, `complaint_rate_alarm` → `account_rate`; `enforcement_not_healthy` → `account_review` (D6 b, c) |
| `operator_mail_streams()` returns `(stream, paused, confirmed, probe_due, probe_missed)` | tp_operator | For the reconcile and the probes |
| `operator_mail_stream_confirmed(stream text, enabled boolean)` | tp_operator | Sets or clears `ses_enabled_confirmed_at` |
| `operator_mail_probe_sent(stream text)` | tp_operator | Sets `probe_sent_at` |
| `operator_mail_expire(at_most integer)` returns integer | tp_operator | Nightly deletion of the three expiring tables |
| `operator_open_support_notice(grant uuid, notice text, request text)` returns `(notice_id uuid, recipients integer, opened boolean)` | tp_operator | D10 step 1. **Replaces** `operator_record_support_notice` (DROP) |
| `operator_support_notices_pending(at_most integer)` returns `(notice_id, practice_id, user_id, support_grant_id, notice)` | tp_operator | Pending rows due, openings first |
| `operator_support_notice_claim(notice uuid, recipient uuid)` returns `(email text, reads bigint)` | tp_operator | D10 step 2; scope asserted |
| `operator_support_notice_sent(notice uuid, recipient uuid, message_id text, request text)` returns `notice_undelivered boolean` | tp_operator | D10 steps 2-4 |
| `operator_support_notice_failed(notice uuid, recipient uuid, error_name text, permanent boolean, request text)` returns `notice_undelivered boolean` | tp_operator | D10 step 2 |
| `operator_due_support_notices(integer)` | tp_operator | **Changed body**, same signature (D10 step 5) |
| `operator_practice_administrator_emails(uuid)` | — | **Dropped**: its only caller (support-notices.ts:104) now uses the claim |
| `billing_open_dunning_notice`, `billing_dunning_notices_pending`, `billing_dunning_notice_claim`, `billing_dunning_notice_sent`, `billing_dunning_notice_failed` | tp_billing | D10, dunning; the same shapes keyed by `(invoice, stage, user)` |
| `billing_owner_emails(uuid)` | — | **Dropped**: its only caller (dunning.ts:143) now uses the claim |
| `console_mail_streams()` | tp_app (`feature_flag.manage` inside, as `console_model_spend`) | Stream state, window counts, last probes, confirmation |
| `console_pause_mail_stream(stream, reason)`, `console_resume_mail_stream(stream, reason)` | tp_app (same permission) | Write `mail_stream_paused` / `mail_stream_resumed` as the user. The console route declares no audit action of its own with those names (they are reserved) |
| `console_mail_undelivered(since timestamptz)` | tp_app (same permission) | Recent undelivered customer messages by kind, user and practice, for the runbook. Screening rows are counted, never listed |
| `console_support_grants()` | tp_app | **Changed** (DROP and CREATE, new return columns): both notices' recipients, delivered, undelivered, pending |
| `submit_screening(...)` | tp_app | **Unchanged** unless Q7 is yes; then DROP and CREATE with `client_subject text, account_subject text` added, body copied from Track A's migration |

`operator_screening_due`, `_claim`, `_complete`, `_fail` and `operator_screening_reminders_due` are **not redefined**: the triggers and the job's `screening_mail_sending()` check carry the pause. PR 6e applies the pause and the refusal list to reminders (open item 4).

No function sets `app.practice_ids`, so `REVIEWED_SCOPE_FUNCTIONS` is unchanged.

**Catalog lists (packages/db/src/catalog.ts): no list changes.**
- The global mail tables and `dunning_notice_recipient` have no `practice_id`, the same shape as the screening and billing tables.
- The two support-notice tables pass as registered tenant tables.
- No new platform policy (the console reads through definer functions). `NOT_FOR_THE_APPLICATION` (catalog.ts:302-308) lists only the e-signature recorder; the new operator and billing functions are covered by a direct db test instead (section 10).

**Domain model.**
- Add `mail_stream`, `mail_send`, `mail_recipient_key`, `screening_mail_refusal` (and, with Q7, `screening_bounce_mark`) to `operations`; `support_grant_notice` and `support_grant_notice_recipient` to `tenancy`; `dunning_notice_recipient` to `billing`, in packages/db/domain-model/areas.json.
- Add rows to docs/product/data-dictionary.md.
- Regenerate docs/product/domain-model.md with `pnpm db:domain-model`, read its Cross-checks block, and ask the founder for the SHA-256 approval.

**Retention policy.** docs/policies/data-retention.md gains: `mail_send` (30 or 90 days, no address); the recipient rows (with the grant or invoice); the refusal list (Q6); the marks and prospect subjects (Q7); the SQS copies (4 days, DLQ 14). The screening's retention wording (retention.ts) changes only as Q6 and Q7 rule, with counsel.

---

## 4. Where delivery state shows, and what changes

| Surface | Today | After |
|---|---|---|
| Practice support-access page (`…/support-access/[supportGrantId]/page.tsx:33`) | "Expiry notice sent: <time>" from `notified_at` | One line per notice: "Sending", "Sent <time>; delivery not yet confirmed", "Delivered to 2 of 2 administrators", "Not delivered to 1 of 2 administrators. PaidWhole has been told." or "Not sent: the practice had no administrator". Source: the two notice tables joined in `SUPPORT_GRANT_COLUMNS` (apps/web/src/lib/routes/practice.ts:54) |
| Console support table (`apps/web/src/app/console/support/page.tsx:96`) | `utc(notifiedAt)` | A "Notices" column with the same states, from the changed `console_support_grants()` |
| Practice notifications | none | `support_notice_undelivered`: "A support-access opening (or closing) notice did not reach every administrator. Check your administrators' email addresses." linking to `/p/<practiceId>/support-access/<grantId>`. New branch in display.tsx, a join in queries.ts:55-61 (`support_grant_notice` by `subject_id`), the kind in queries.ts:18 and `NOTIFICATION_KINDS` (operations.ts:63, adding the missing `follow_up` too) |
| Users page invitations (`apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx:113-135`; query settings.ts:623) | "open until <date>" | "Not delivered <date>: check the address, then invite again" (D10) |
| Console, new page `apps/web/src/app/console/mail/page.tsx` | none | Stream state (paused or open, reason, window counts, confirmation, last probes), Pause/Resume with reason, recent undelivered customer messages, (Q7) active bounce marks by kind (counts only) |
| Screening page (`apps/web/src/app/screening/page.tsx:54-56`) | "Screening is not open yet" | The paused wording (D7) when the reason is `mail_paused`; the refusal sentences (D9) |
| Audit trail | `notice_sent`, written before sending | `notice_sent` = the first recipient's message handed to SES; `notice_undelivered`, `mail_stream_paused` and `mail_stream_resumed` added, all reserved from the application role |

`notified_at` keeps its meaning for the due-notice logic (tenancy_hardening.sql:510-522) and is no longer shown as delivery.

---

## 5. Exact files to change

**packages/db**
- `migrations/<ts>_mail_streams.sql`: new (section 3).
- `src/schema/operations.ts`: `mailStream`, `mailSend`, `mailRecipientKey`, `screeningMailRefusal` (Q7: `screeningBounceMark`); constants `MAIL_STREAMS`, `MAIL_KINDS`, `MAIL_STATES`, `MAIL_BOUNCE_SUBTYPES`, `MAIL_COMPLAINT_TYPES`, `MAIL_PAUSE_REASONS`, `MAIL_CUTOFF` (`{ windowDays: 7, bounceBasisPoints: 300, bounceFloor: 200, complaintPer100k: 80, complaintFloor: 2500 }`), `MAIL_REFUSAL_DAYS`, `NOTICE_RETRY_MINUTES` (`[1, 5, 15, 60]`); `NOTIFICATION_KINDS` gains `follow_up` and `support_notice_undelivered`.
- `src/schema/tenancy.ts`: `supportGrantNotice`, `supportGrantNoticeRecipient`.
- `src/schema/billing.ts` (or wherever `invoice` is declared): `dunningNoticeRecipient`.
- `src/schema/onboarding.ts`: invitation columns. (Q7) the screening schema file: prospect columns.
- `src/schema/index.ts`: exports.
- `src/hardening.db.test.ts:341`: the reserved list.
- `domain-model/areas.json`, `docs/product/data-dictionary.md`, `docs/product/domain-model.md` (regenerated).

**apps/worker**
- `src/mail/streams.ts` (new): stream, kind and tag constants; `configurationSetName(prefix, stream)`; simulator addresses.
- `src/mail/mail.ts`: `MailMessage` (D3); `send()` returns `{ messageId }`; the set, tags, From and Reply-To. `LocalMailSender` writes `to` as a one-element array, and simulator-shaped events to `MAIL_EVENTS_DIR`, mapping the local part before any `+` (`bounce+e2e7@…` is a bounce): Send and Delivery normally; Bounce for `bounce`; Complaint for `complaint`; a suppression bounce for `suppressionlist`.
- `src/mail/events.ts` (new): the SES event and the alarm state-change schemas and their mapping.
- `src/platform/mail-events.ts` (new): the job, with `MailEventSource` (SQS and local directory) and an SES control client (`GetAccount`, `GetConfigurationSet`, `PutConfigurationSetSendingOptions`).
- `src/platform/support-notices.ts`: the outbox (D10).
- `src/billing/dunning.ts`: the outbox (D10).
- `src/digest/job.ts`: tags.
- `src/screening/job.ts`: stream `screening`; read `screening_mail_sending()` first; handle `screening_mail_paused` and `SendingPausedException` (leave the run, log by run ID); `held_by_mail_pause`.
- `src/jobs/platform.ts`: `mail_events` (`* * * * *`) and `mail_expiry` (`50 3 * * *`), payloads `{}`, handlers; the notice handlers log `NOTICE_UNDELIVERED`.
- `src/config.ts`: `MAIL_EVENTS_QUEUE_URL` (required in production), `MAIL_STREAM_PREFIX` (`tp-<env>`), `SCREENING_MAIL_FROM`, `SCREENING_REPLY_TO`, `MAIL_IDENTITIES_VERIFIED`, `MAIL_EVENTS_DIR` (local); `src/platform/wiring.ts` uses them.
- `src/runtime.ts`: exports for the e2e harness.

**apps/web**
- `src/lib/screening/address.ts`, `tlds.ts` and `validation.ts` (new), plus the client form. `package.json` gains `@aws-sdk/client-sesv2` at the worker's locked version (3.1152.0).
- `src/lib/screening/routes.ts`: `screeningOpen()` reads `screening_mail_status()`; the submit runs D9 in order and maps the new refusals; DNS and SES validation are injected through services. (Q7) passes the two subjects.
- `src/lib/http/rate-limit.ts`: bucket `screening_validation` with a `global` subject kind.
- `src/app/screening/page.tsx`: the paused state and refusal sentences.
- `src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx` and `src/lib/routes/practice.ts`: notice states.
- `src/components/monitoring/display.tsx` and `src/lib/monitoring/queries.ts`: the new notification kind.
- `src/app/console/support/page.tsx` and `src/lib/routes/console.ts`: notice states; a new mail route and page under `src/app/console/mail/`.
- `src/app/settings/organizations/[organizationId]/users/page.tsx` and `src/lib/routes/settings.ts`: invitation state.
- The route registry and persona matrix gain the console mail route (ADR 0017's registry).
- `e2e/outbox.ts`: unchanged (the file keeps an array); listed so the reviewer checks it.

**tools**
- `tools/screening-capacity/run.ts`: unchanged reader (:256, :472); its seed makes the screening stream sending and ready.

**infra**
- `lib/mail.ts` (new): stream names, event types, alarm thresholds, error codes (held equal to the worker by tests, as `SUPPORT_MAIL_PREFIX` is in infra/test/support-mail.test.ts:24).
- `lib/constructs/mail-streams.ts` (new): identities, sets, event destinations, the two rules, queues, KMS statement, reputation and queue alarms, DNS outputs, the phase condition.
- `lib/constructs/identity.ts`: `emailConfiguration` under the phase condition, with `configurationSet`.
- `lib/deploy-parameters.ts`: `ScreeningMailFromAddress`, `MailIdentitiesVerified`, and the rule.
- `lib/constructs/operator-role.ts`, `lib/constructs/application-role.ts`: narrowed SES statements (section 6). Track B's screening role gets the screening statement.
- `lib/constructs/network.ts`: `['Sqs', SQS]` with an endpoint policy (this account's queues only).
- `lib/constructs/monitoring.ts`: the metric filters and alarms of section 10.
- `lib/constructs/compute.ts`: environment for the platform, worker, web and screening tasks.
- `lib/platform-stack.ts`: wiring and outputs.

**docs**
- `docs/runbooks/deliverability.md` (new, section 14);
- `docs/runbooks/deploy-and-rollback.md`: the two phases, `cdk import` of an existing identity, DNS from outputs, SES production access;
- `docs/policies/data-retention.md`;
- the ADRs in section 9;
- reconciliation-001's PR 6b entry.

---

## 6. IAM, least privilege

- **OperatorRole** (platform task):
  - `ses:SendEmail` on `identity/<MailFromDomain>` plus `configuration-set/tp-<env>-notices` and `…-transactional`, with condition `ses:FromAddress` = MailFromAddress;
  - **probes**: `ses:SendEmail` on both identities and all three sets, with `ForAllValues:StringEquals ses:Recipients` = the two simulator addresses and `ses:FromAddress` in the two senders;
  - `ses:GetConfigurationSet` and `ses:PutConfigurationSetSendingOptions` on `configuration-set/tp-<env>-screening` **only**;
  - `ses:GetAccount` (resource `*`, as that action requires) and `ses:GetEmailIdentity` on both identities;
  - `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility` and `sqs:GetQueueAttributes` on the events queue ARN only;
  - `kms:Decrypt` on the environment key with `kms:ViaService = sqs.<region>.amazonaws.com`.
  - The `identity/*` statement (operator-role.ts:159-163) goes.
- **ApplicationRole**: `DigestEmail` becomes `identity/<MailFromDomain>` plus `configuration-set/tp-<env>-transactional`, with `ses:FromAddress` (application-role.ts:107-111). The web task gets `ses:GetEmailAddressInsights`, resource `*` (Q1(c)).
- **Track B's screening role**: `ses:SendEmail` on `identity/<ScreeningDomain>` plus `configuration-set/tp-<env>-screening`, with `ses:FromAddress` = ScreeningMailFromAddress. No SQS or SES control.
- **EventBridge**: the queue policy and a key policy statement for `events.amazonaws.com` (`kms:GenerateDataKey`, `kms:Decrypt`), each with `aws:SourceArn` in the two rule ARNs.
- **Cognito** (phase 2): uses the transactional set. Whether it also needs a sending-authorization policy on the stack-owned identity is checked on staging (open item 1).

---

## 7. DNS (what the founder sets at the registrar; the zone is not in Route 53 today)

The stack outputs the exact values in phase 1. `<s>` is the screening subdomain (recommended `screening.<domain>`); `<r>` is the region.

| Name | Type | Value |
|---|---|---|
| `<tokenN>._domainkey.<s>` (×3) | CNAME | `<tokenN>.dkim.amazonses.com` |
| `bounce.<s>` | MX | `10 feedback-smtp.<r>.amazonses.com` |
| `bounce.<s>` | TXT | `v=spf1 include:amazonses.com -all` |
| `_dmarc.<s>` | TXT | `v=DMARC1; p=reject; adkim=s; aspf=r; rua=mailto:<reports mailbox at <domain>>` |
| `<tokenN>._domainkey.<domain>` (×3) | CNAME | as above, for the main identity |
| `bounce.<domain>` | MX and TXT | as above |
| `_dmarc.<domain>` | TXT | `v=DMARC1; p=none; rua=mailto:<reports mailbox>`, moved to `p=quarantine` once two weeks of reports show only SES and the founder's own mail provider passing |

- `p=reject` is safe on the new subdomain because only SES sends from it, and its DKIM is aligned.
- The parent domain starts at `p=none` so that the founder's other mail is not broken.
- `<s>` has no inbound MX; replies go to the Reply-To (Q5).

---

## 8. Monthly cost (new running costs; per environment unless stated)

Price sources, read 2026-10-21 through WebSearch result summaries (WebFetch of aws.amazon.com failed with `ENOTFOUND`; curl through the proxy was refused with 403). The founder should confirm each figure on the live page.

| Item | Price | Source (URL, read 2026-10-21) | Month |
|---|---|---|---|
| SQS interface endpoint, 2 AZs | $0.01 per AZ-hour + $0.01/GB (first PB) | https://aws.amazon.com/privatelink/pricing/ (per-GB tiers); hourly rate from https://us.fitgap.com/products/aws-privatelink | **$14.60** |
| CloudWatch alarms, 15 standard | $0.10 per alarm metric; 10 free per account | https://aws.amazon.com/cloudwatch/pricing/ (free tier); $0.10 from https://www.cloudzero.com/blog/cloudwatch-pricing | $1.50 |
| CloudWatch custom metrics from 6 log filters | $0.30 per metric, first 10,000 | https://aws.amazon.com/cloudwatch/pricing/ (worked example) | $1.80 |
| SES configuration sets, event publishing, reputation metrics, `GetAccount` and `GetConfigurationSet` calls | no line item found | https://aws.amazon.com/ses/pricing/ | $0 |
| SES mailbox simulator probes, about 180 messages | Essentials $0.16 per 1,000 | https://aws.amazon.com/ses/pricing/ | $0.03 |
| SES Auto Validation | not used (D1) | — | $0 |
| SES email validation at submit (production, Q1(c)) | $0.01 each; an add-on on Essentials | https://aws.amazon.com/ses/pricing/ | $5 per 500 screenings; at most $10 a day at the recommended cap |
| EventBridge (SES events and alarm state changes on the default bus) | AWS service events free; $1.00 per million if billed as custom | https://aws.amazon.com/eventbridge/pricing/ (not re-read today; search returned nothing) | $0-0.05 |
| SQS requests, about 100-150k | first 1M free, then $0.40 per million | https://cloudburn.io/tools/amazon-sqs-pricing-calculator; https://hevodata.com/learn/comprehensive-guide-on-aws-sqs-pricing/ | $0-0.06 |
| KMS requests on the existing key | $0.03 per 10,000 | https://aws.amazon.com/kms/pricing/ (not re-read today) | ≤ $0.06 |
| Route 53, dedicated IPs, Pro or Enterprise plans | not used | — | $0 |

**Total, staging plus production: about $36 a month, plus $0.01 per screening in production for submit-time validation (capped at $10 a day).** About $29 of that is the SQS endpoint in two environments.

SES moved accounts with no SES activity since 2025-06-01 onto the **Essentials plan** from 2026-07-21 (https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-ses-pricing-plans/). On it, sending costs $0.16 per 1,000 instead of $0.10 à la carte, and VDM is included. At launch volume the difference is under $1 a month (Q1(b)).

---

## 9. ADRs to add or amend

- **New ADR 0064** (or the next free number at build): "Send mail in three SES streams, record each send's delivery by message ID, send notices one recipient at a time from a recorded outbox, and pause the screening stream alone on its own or the account's rates". Covers D1-D13; states that **the screening set uses no SES suppression list and writes nothing to the account's**, and that no set tracks opens or clicks; the alternatives (SNS, NAT, SES tenants, a column on the prospect, third-party verification, Auto Validation); the cost; Revisit-when (SES tenants with configurable thresholds at a sane price: SES tenants (2025-08) auto-pause on SES's own findings with Standard/Strict/None policies, not at 3%/0.08%, and their price was unconfirmed).
- **Amend ADR 0062**: the screening's sender subdomain; D7-D9; readiness (D8); the delivery state as the mail record (D11, Q3); the refusal list and its retention (Q6); the bounce budget (Q7); "Revisit when" gains "the screening stream is paused".
- **Amend ADR 0049**: the SQS endpoint and its policy; the event queue and the two rules; the narrowed SES grants; SES identities owned by the stack, in two phases.
- **Amend ADR 0019** (platform jobs as the operator role) and **ADR 0014** (platform jobs list): `mail_events` and `mail_expiry`; the support-notice outbox replaces `operator_record_support_notice`.
- **Amend ADR 0050**: dunning one message per owner from a recorded outbox, delivery recorded, `notice_undelivered`. **No suspension change** (Q4 is for the billing PR).
- **Amend ADR 0055**: Cognito's mail goes through the transactional set from phase 2.
- **ADR 0039** (digests): tags only. A one-line note.

---

## 10. Tests that prove each rule

**infra (CDK assertions)**: new `infra/test/mail-streams.test.ts`; also the identity, operator-role, application-role, network and monitoring tests.
- Exactly three `AWS::SES::ConfigurationSet`, named `tp-<env>-{transactional,notices,screening}`, each with:
  - `ReputationMetricsEnabled: true`; `TlsPolicy: REQUIRE`;
  - no `TrackingOptions`; `VdmOptions.DashboardOptions.EngagementMetrics: DISABLED`;
  - Auto Validation disabled;
  - no `SendingOptions` (a supporting check; the proof that a deploy cannot re-enable a paused set is the worker's reconcile drift test);
  - `SuppressionOptions.SuppressedReasons`: `[BOUNCE, COMPLAINT]` on transactional and notices, **`[]` on screening**.
- No `AWS::SES::VdmAttributes` with engagement metrics enabled anywhere in the template.
- Each set has one event destination to the default bus with exactly the seven event types: no OPEN, CLICK or SUBSCRIPTION.
- Two `AWS::SES::EmailIdentity`, each with DKIM RSA_2048, `bounce.` MAIL FROM, `USE_DEFAULT_VALUE`, and the right default set. The CFN rule refuses equal domains.
- **Both phases**: with `MailIdentitiesVerified=false`, the user pool has no `EmailConfiguration` and the platform task gets `MAIL_IDENTITIES_VERIFIED=false`; with `true`, `EmailConfiguration` is `DEVELOPER` with `ConfigurationSet` = the transactional set.
- `mail-events` names the three sets; `mail-account-alarms` names exactly the two account warning alarms and state `ALARM`; both target the queue.
- The queue has the environment key, 4-day retention, a redrive of 5 to the DLQ and 14 days there; its policy admits only the two rule ARNs and denies requests without TLS; the key statement for `events.amazonaws.com` is conditioned on them.
- **The cut-off can pause only screening**: the only `ses:PutConfigurationSetSendingOptions` statement names only the screening set; no role has it on the other sets; no `identity/*` SES resource remains.
- The probe statement's `ses:Recipients` holds only the two simulator addresses. The screening role sends only through the screening identity and set. The web task has `ses:GetEmailAddressInsights`.
- The SQS endpoint exists, and its policy is limited to the account.
- **15 alarms**, exact metric, threshold and action (the operator topic):
  1. account `Reputation.BounceRate` ≥ 0.025 (warning; also the `account_rate` signal);
  2. account `Reputation.BounceRate` ≥ 0.04;
  3. account `Reputation.ComplaintRate` ≥ 0.0005 (warning; also the signal);
  4. account `Reputation.ComplaintRate` ≥ 0.0008;
  5. screening set bounce ≥ 0.03;
  6. screening set complaint ≥ 0.0008;
  7. transactional set bounce ≥ 0.02;
  8. DLQ visible messages ≥ 1;
  9. queue oldest message ≥ 900 s;
  10-14. platform log codes `MAIL_STREAM_PAUSED`, `NOTICE_UNDELIVERED`, `NOTICE_UNDELIVERABLE`, `INVITATION_UNDELIVERED`, `MAIL_PROBE_MISSED` (≥ 1 in 5 minutes);
  15. web log code `MAIL_VALIDATION_CAP_REACHED` (≥ 1 in a day).
  Six metric filters exactly (10-15). `MAIL_EVENT_UNREADABLE` is covered by the DLQ alarm; `MAIL_DOMAIN_CHECK_UNAVAILABLE` and `MAIL_VALIDATION_UNAVAILABLE` are warnings with no alarm.
- Error codes equal the worker's and the web's source.
- Outputs carry the DKIM tokens and the MAIL FROM records.

**db** (`packages/db/src/mail.db.test.ts`, plus `catalog.db.test.ts`, `screening.db.test.ts`, `hardening.db.test.ts`, the generated cross-tenant tests)
- Tables and grants:
  - RLS is forced; the mail tables' policies are owner-only; no login role has a grant on `mail_*`, `screening_mail_refusal`, `screening_bounce_mark` or `dunning_notice_recipient`;
  - no new `operator_*`, `billing_*` or `mail_*` function is executable by tp_app; `mail_recipient_sha256` by no login role;
  - the two support-notice tables are registered, have the tenant policy and an app SELECT only; the cross-tenant tests cover them (practice B cannot read A's rows).
- Closed lists equal the constants (the `constraintLiterals` pattern, screening.db.test.ts:1351), `NOTIFICATION_KINDS` included.
- **Reserved audit actions**: tp_app inserting `notice_undelivered`, `mail_stream_paused` or `mail_stream_resumed` as a user gets 42501 (extends hardening.db.test.ts:335-344).
- **The keyed hash**: a refused address's `recipient_sha256` differs from `encode(sha256(convert_to(lower(address), 'UTF8')), 'hex')`, and changes when the pepper row is replaced. After a full scenario, no table but `screening_mail_refusal` holds `mail_recipient_sha256()` of any address used, and it holds only the bounced and complaining screening ones. No function error text contains an address.
- Idempotence and ordering: the same event twice gives one row and `recorded = false`; Bounce before Send gives `bounced`, `sent_at` from the event; DeliveryDelay after Delivery and Delivery after Complaint are ignored.
- **The cut-off, at its edges**, pinned to `MAIL_CUTOFF`:

  | Sends | Event count | Result |
  |---|---|---|
  | 150 | 6 hard bounces | open |
  | 150 | 7 hard bounces | paused |
  | 1,000 | 30 hard bounces | open |
  | 1,000 | 31 hard bounces | paused |
  | low volume | 2 complaints | open |
  | low volume | 3 complaints | paused |
  | 10,000 | 8 complaints | open |
  | 10,000 | 9 complaints | paused |

  **One case per bounce subtype**: `general`, `no_email`, `other` permanent → counted; `suppressed`, `on_account_suppression_list`, `on_configuration_set_suppression_list` → state `suppressed`, not counted and not in `sends`; `mailbox_full`, `message_too_large`, `content_rejected`, `attachment_rejected` with kind `transient` or `undetermined` → not counted. Also not counted: `not_spam` complaints, probes, sends before `window_starts_at`.
- **Account signals**: `operator_mail_account_signal` with each signal pauses screening only, with `account_rate` or `account_review`, writes one `mail_stream_paused`, and a repeat changes nothing.
- **Only screening pauses**: 100% hard bounces on transactional and on notices leave `paused_at` null; `UPDATE mail_stream SET paused_at = now()` for those two fails its CHECK; while screening is paused, `operator_due_support_notices` and the support and dunning outboxes still work, `submit_screening` refuses `screening_paused`, and a claim, completion or failure of a screening run refuses `screening_mail_paused`.
- **Resume and confirmation**: resume requires the permission, writes `mail_stream_resumed`, resets the window and makes probes due; **resumed but unconfirmed: a claim refuses and `screening_mail_sending()` is false; after `operator_mail_stream_confirmed('screening', true)` the run is claimed and completes on its next attempt**.
- **Refusal list**: a screening permanent bounce and a screening `abuse` complaint each make `submit_screening` refuse `screening_contact_undeliverable` (case-insensitive, trimmed); a transient bounce, a `suppressed` subtype and a `not_spam` complaint do not; **a customer-stream complaint or bounce to the same address does not**; after `MAIL_REFUSAL_DAYS` it does not; (Q6 alternative) deleting the prospect deletes its row.
- **Screening rows and the prospect**: deleting the prospect nulls `screening_prospect_id`; the rows hold no address-derived value; `mail_expiry` deletes them after 30 days.
- **(Q7) Bounce budget**: three permanent bounces from one `client_subject` refuse its fourth screening with `screening_bounce_budget` and leave the stream open; the same for one `account_subject`; marks expire after 7 days; seven bounces spread over three clients and three accounts pause the stream (the trade-off Q2 states).
- **Support notices**:
  - two administrators, one delivered and one suppressed → 1 delivered, 1 undelivered, 2 recipients; `notice_undelivered` and the notifications once, even when the event repeats;
  - an event recorded **before** `operator_support_notice_sent` stores the message ID → the row's state is right after the call;
  - opening and closing notices of one grant both undelivered → two notifications per administrator, distinct subjects, no conflict;
  - **no administrator → no `notice_sent` event, exactly one `notice_undelivered`, and `operator_due_support_notices` no longer returns it**;
  - `operator_support_notice_failed` five times, or once with `permanent` → `failed`, undelivered;
  - a recipient row cannot be counted twice (primary key) and `recipients` equals its row count.
- **Dunning**: the same cases keyed by invoice and stage; no owner → `notice_undelivered` on the invoice.
- **Invitations**: a bounce to a pending invitee sets the flag with the message's time; an accepted invitation is untouched; **a resend, then a late bounce of the old message (its `mail.timestamp` before the new `sent_at`), leaves the new invitation unflagged**; a bounce of the new message flags it.
- Expiry: `operator_mail_expire` deletes by the rules.
- Readiness: `screening_mail_status().ready` is false without both probes within 48 h or without confirmation.
- `console_support_grants()` returns the notice columns.

**worker**
- `mail.test.ts`: SES gets the set, From, Reply-To (screening) and the exact tags for each kind; one recipient; `messageId` returned; a tag value with `@` throws before sending; the local file's `to` is a one-element array; `bounce+e2e7@simulator.amazonses.com` writes a Bounce event.
- `events.test.ts`: synthetic EventBridge envelopes for each SES event type and subtype, and an alarm state change; unknown maps to `other`; a malformed one is refused; `diagnosticCode` never comes out.
- `platform/mail-events.db.test.ts`:
  - an in-memory queue of 500 events with duplicates is recorded once;
  - a message is deleted only after commit; an unreadable one is not deleted;
  - **a pause sends `PutConfigurationSetSendingOptions` for the screening set only**;
  - **reconcile drift**: SES enabled while paused is disabled again (the proof that nothing, a deploy included, keeps a paused set sending); resume enables it and then confirms;
  - **an alarm state-change event pauses only screening**, reason `account_rate`; `GetAccount` returning `PROBATION` pauses with `account_review`;
  - probes go only to the simulator, go at once after a resume, and are skipped while paused, unconfirmed or in phase 1;
  - `MAIL_PROBE_MISSED` after 26 h;
  - the log sink contains no `@`.
- `support-notices.db.test.ts`:
  - one message per administrator, no message with two recipients;
  - **the second of three sends throws: the run records it failed, the next run sends only to that administrator, and no administrator gets two messages**;
  - no administrator: nothing sent, `NOTICE_UNDELIVERABLE` logged (the existing assertion at :254 holds), no `notice_sent`.
- Dunning: one message per owner; the same partial-failure case.
- Screening job: `screening_mail_sending()` false means nothing is claimed; `screening_mail_paused` or `SendingPausedException` at completion rolls back and leaves the run; after resume and confirmation it is claimed and completes; `held_by_mail_pause` is logged for a held run.

**web**
- `address.test.ts`: suggestions (`gmial.com`, `yaho.com`, `outlok.com`, `hotmal.com`); none for listed or distant custom domains; an unknown TLD warns; a fake resolver: NXDOMAIN, null MX and no-MX/no-A refuse; A-only and timeout accept; no domain in any log line.
- `validation.test.ts`: each row of D9's table, verdict by verdict; a timeout accepts; past the cap the call is not made and `MAIL_VALIDATION_CAP_REACHED` is logged; **the validation client is never called for an upload that fails the row checks or the rate limit**.
- `routes.db.test.ts`: paused gives `open: false, reason: 'mail_paused'` and the submit is refused; the refusal list, DNS and validation refusals give **the same sentence**; not ready in staging means closed; the existing scan of logs, jobs, emails, refusals and audit finds no address.
- `display.test.tsx` (or the existing notifications test): the `support_notice_undelivered` text and its link to the grant.

**e2e** (local senders and the event directory)
1. A practice whose administrator is `suppressionlist@simulator.amazonses.com` gets a support grant; the support-access page reads "Not delivered to 1 of 1 administrator"; the administrator's notifications show "A support-access opening notice did not reach every administrator", and its link opens that grant.
2. The cut-off: six bounced screening sends are seeded through the owner connection (as from different clients, so Q7's budget does not stop the journey); the seventh screening goes through the page to `bounce+e2e7@simulator.amazonses.com` with its own practice name and ZIP (a screening from the same address or practice would replace an earlier one, retention.ts:23); the stream pauses; the screening page shows the paused wording; the console resumes it; after the local reconcile confirms and the probes return, the screening opens.

**golden, oracle and capacity**
- Golden and oracle are unchanged (no engine change).
- Track B's capacity harness seeds a sending, confirmed, ready screening stream, so its timing is unaffected. One harness assertion: a paused stream claims nothing.

---

## 11. Founder questions (recommended answer first)

**Q1. Running costs, about $36 a month for staging plus production, and the SES plan.**
- **(a) The SQS interface endpoint, about $29.20 of that.** Recommended: accept. The alternative is NAT (about $0.01 a month). It gives up keeping queue traffic, which carries recipient addresses, off the internet path; the endpoint policy that stops a compromised task reaching another account's queue; and the platform's rule of an endpoint wherever one exists.
- **(b) SES plan.** Recommended: stay on Essentials, the default for a new account since 2026-07-21. VDM's deliverability dashboard and advisor come with it for well under $1 a month at launch volume, with engagement tracking kept off (D1). The alternative is à la carte ($0.10 instead of $0.16 per 1,000), which gives up VDM. Pro or Enterprise are not recommended at this volume.
- **(c) SES email validation at submit, $0.01 a screening, with a daily cap.** Recommended: yes, with a cap of 1,000 calls a day in production (at most $10 a day, about $300 in a month only under sustained abuse) and 50 in staging; above the cap the typo and DNS checks still run. It catches mailbox-level mistakes on practices' own domains that DNS cannot see, tells the prospect before they leave, and is the first defence against Q2's denial of service.
  - Without it: those addresses are caught only after the send, when the prospect has gone, and each counts toward the cut-off.
  - A higher cap gives up a tighter bound on abuse spend; a lower one gives up validation on a busy launch day.

**Q2. The cut-off's window, floors, account triggers and resume.**
- Recommended:
  - a rolling 7 days since the last resume;
  - floors of 200 sends for bounces and 2,500 for complaints: at launch volume, 7 hard bounces or 3 complaints in a week pause the screening;
  - also pause the screening when the account's own rates reach half of SES's review levels (bounce 2.5%, complaint 0.05%), or SES puts the account under review (D6 b, c);
  - resume only by a platform administrator, with a reason.
- What the floors allow against SES's own levels (review at 5% bounces and 0.1% complaints; pause at 10% and 0.5%): below 2,500 screening sends, 2 complaints in a week never trip the screening's own rule, and 2 in 500 sends is 0.4%. When the screening is most of the account's mail, the account trigger catches that, at 0.05%. Below 200 sends, 6 hard bounces (3% of 200) never trip it; SES reviews at 5%.
- **The denial-of-service trade-off.** Anyone who can make 7 validated-looking addresses bounce in a week closes the public screening until an administrator resumes it. Today one client address and one business domain are enough (10 an hour, 20 a day per domain, rate-limit.ts:50), using a domain they control whose server accepts at validation and bounces later. Q1(c) and Q7 raise the cost; the pause pages the operator. Protecting customers' invitations and HIPAA notices is worth more than the funnel's availability for a few hours.
- Option: resume automatically once the window clears. Gives up making sure the cause (for example a bot) is fixed before mail flows again.
- Option: higher floors (for example 15 bounces). Gives up early protection at tiny volume, in exchange for a costlier denial of service.
- Option: no account trigger. Gives up acting on the rate SES actually reviews.

**Q3. The audit's "delivery state on screening prospects."**
- Recommended: as the prospect's mail record (`mail_send` keyed to the prospect); PR 7 adds its read function with the lead list.
- Option: a column on `screening_prospect`. That needs the prospect's immutability guard loosened, and keeps a second copy that can disagree.

**Q4. Dunning and suspension (ADR 0050), for the billing PR, not PR 6b.**
- Audit #76 asks for delivery to be recorded and flagged, which PR 6b does. It does not change when an organization is suspended.
- Recommended, in the billing PR: suspension 30 days after a failed payment waits until at least one dunning notice was delivered to an owner, or until the operator records another contact (phone or post), with its own refusal code, tests and ADR 0050 amendment.
- Option: suspend as now. Gives up the guarantee that no organization is suspended without having been told.
- If the founder wants it in PR 6b instead, this design gains a section specifying it in full before any builder starts.

**Q5. The screening sender, replies and the paused page.**
- Recommended:
  - `ScreeningMailFromAddress` = `results@screening.<your domain>`, display name "PaidWhole";
  - **Reply-To = SupportEmail** on screening mail, so a prospect's reply reaches the support desk (which records it as `unknown_sender`, support-mail.md:34) instead of going nowhere (`<s>` has no MX);
  - a DMARC reports mailbox at the main domain;
  - the paused wording in D7, and the refusal sentence in D9.
- Option: no Reply-To. Gives up hearing from prospects who reply, the funnel's most willing leads.
- Option: a separate sales mailbox. Gives up the support desk's ticket trail, and needs another mailbox watched.
- The founder sets the DNS records in section 7 at the registrar, then switches `MailIdentitiesVerified` to `true`.

**Q6. Keep a coded form of a screening address that bounced or complained? (Founder and counsel: it changes what the pages promise.)**
- Today the pages say that at 30 days, or on replacement, "we delete … the email address you gave" (retention.ts:23).
- Recommended: keep a keyed hash of a screening address that **hard-bounced or was reported as spam**, for **12 months**, used only to refuse sending to it again. Amend retention.ts (:23, :34, :37, :43), the screening terms and data-retention.md, for example: "If our email to this address bounces or is reported as spam, we keep a coded form of it for 12 months, only so that we never email it again." Counsel confirms the wording before the screening opens. Only these addresses are kept; every other screening's mail record keeps nothing derived from its address.
  - It protects the person whose address someone else typed, keeps a known-bad address from counting against the cut-off again, and keeps SES's account list free of prospects.
  - It is pseudonymised, not anonymous: the key sits in the same database, so the page must not call it deleted.
- Option: keep it no longer than the prospect (30 days, or until replaced). Keeps today's wording, and gives up refusing a known-bad or complaining address after that, so someone can resubmit it and it bounces, or is mailed, again.

**Q7. A bounce budget per client and per email domain? (Founder and counsel: it keeps two more coded values with the screening.)**
- Recommended: yes. Store with the prospect, for its 30 days, the same HMACs of the client address and the email's account that the rate limit already stores for an hour or a day. On a screening hard bounce, keep a 7-day mark for each. Refuse a new screening from a client or business domain with 3 or more marks in 7 days (`screening_bounce_budget`): "Several recent result emails for screenings from here could not be delivered, so we are not taking more for a few days." The pages and data-retention.md say so, with counsel.
  - One client or one domain can then no longer close the funnel for everyone (Q2): it takes at least three of each.
  - Nothing today can find such a client: no load-balancer or WAF log is kept (section 1), and the rate-limit table holds only window counts.
- Option: no budget. Keeps the pages as they are, and gives up any defence against one client closing the public screening, beyond the validation cap and a person resuming it.

---

## 12. Open items

1. On staging (phase 2): whether Cognito's `DEVELOPER` sending through a stack-owned identity and a configuration set needs a sending-authorization policy; that an empty `SuppressedReasons` on the screening set both stops additions to the account list and stops account-list checks (the runbook's staging check, section 14); whether the account reputation metrics are published at launch volume (the `account_review` signal does not depend on them).
2. Migration order and Tracks A and B. Track C's migration runs after Track A's `20261105090000_pricing_location_and_zip_plus_four.sql` and Track B's. It redefines none of their screening functions: the pause is carried by triggers and `screening_mail_sending()`. Only under Q7 does it DROP and CREATE `submit_screening`, copying the body exactly as Track A's migration leaves it (a db test diffs the bodies modulo the two parameters). The builder runs Track A's ZIP+4 db tests and Track B's claim and grant tests after Track C's migration, before review.
3. Track B's role names, `compute.screening` and its stale-claim rule (2 minutes on `progress_at`) are inputs to D7.
4. PR 6e must: send reminders and withdrawal confirmations on the `screening` stream; check `screening_mail_sending()` and the refusal list in `operator_screening_reminders_due`; add `List-Unsubscribe` and `List-Unsubscribe-Post` (one-click, through the withdrawal link) to reminders.
5. RDS parameter `log_parameter_max_length_on_error` must stay 0, so a failed definer call never logs an address. Verify it in the database construct.
6. Refresh the IANA TLD snapshot quarterly (runbook).
7. Registering the domains with Google Postmaster Tools and Microsoft SNDS (free) is a founder action in the runbook.
8. `NOTIFICATION_KINDS` (operations.ts:63) lacks `follow_up` today; this track adds it with its own kind, and the closed-list test now covers the constant.

## 13. Out of scope

- Dedicated IPs; SES tenants; parsing DMARC aggregate reports; BIMI; moving DNS to Route 53.
- Any change to when an organization is suspended (Q4, the billing PR).
- PR 7's prospect mail-state read function and lead-list display (D11).
- Reminder sending and its function changes (PR 6e, open item 4).
- In-app notifications at the organization level. Invitations rely on the users page and the operator alert.
- A user-level "your email is bouncing" banner.
- Track B's consumer sizing; the ZIP+4 lookup; any change under `packages/pricing/src`.

## 14. The runbook (`docs/runbooks/deliverability.md`), outline

1. **What is set up:** the streams, identities, event path, cut-off and its three triggers, outboxes, probes and alarms.
2. **Before launch, once:**
   - phase 1 deploy (`MailIdentitiesVerified=false`); `cdk import` an existing hand-verified identity first if one exists;
   - the DNS records from the stack outputs; both identities read verified with DKIM `SUCCESS`;
   - phase 2 deploy (`true`); the console mail page shows the screening confirmed and "ready";
   - **staging check**: send a simulator complaint (`complaint@simulator.amazonses.com`) through the screening set, then confirm `aws sesv2 get-suppressed-destination` finds no entry and a notices-set probe to the same simulator address is not suppressed;
   - SES production access (the use-case text: transactional only, bounces and complaints recorded by message ID, automatic pause of the screening stream);
   - DMARC `p=none` on the parent domain, moving to `quarantine`; Postmaster Tools and SNDS.
   - Rollback: phase 2 back to phase 1 returns Cognito to its default sender; nothing else is lost.
3. **One playbook per alarm:**
   - screening paused: read the reason and counts on the console; for `bounce_rate`, the subtypes and (Q7) the marks by kind; fix; resume with a reason;
   - account rate high or account under review: find the stream by its set metrics; answer the SES review; the screening is already paused;
   - notice undelivered: reach the practice another way and record it; remove an address from the SES suppression list (`aws sesv2 delete-suppressed-destination`) only after the person confirms the mailbox works;
   - invitation undelivered: tell the inviting administrator;
   - validation cap reached: check the submissions for abuse; raise the cap only with the founder (Q1(c));
   - DLQ or queue age: check the job; redrive with `aws sqs start-message-move-task`;
   - probe missed: check the identity, event destination, rule and queue.
4. **Rules:** never resume without a cause; never disable suppression on the transactional or notices sets; never give the screening set a suppression list (ADR 0064); never enable open, click or VDM engagement tracking on any set or the account; never create an EventBridge archive of mail events.
5. **Quarterly:** the TLD snapshot, the typo list, the DMARC reports, the plan and prices.

---

## 15. Review (one independent reviewer, 2026-10-21)

Each finding was checked against the code at 8e33cb3 and the documents.

| # | Finding | Verdict | What changed, and why |
|---|---|---|---|
| 1 | Screening addresses kept past the promised deletion (SES account list; 365-day hash) with no founder or counsel question | **Real, blocking.** retention.ts:23 promises deletion; a set's suppressed reasons add to the account list (CDK configuration-set.d.ts:55-60) | The screening set has **no SES suppression** (D1), through the L2's own `disableSuppressionList: true` (configuration-set.d.ts:61-67; it renders `SuppressedReasons: []`), so no escape hatch is needed. `mail_send` now stores **no address hash at all** (D12). The only kept value is the refusal list's keyed hash of bounced or complaining screening addresses, and how long is **Q6** for the founder and counsel. Tests: the infra `[]` assertion; the db "no table but the refusal list holds a derived value" test; the Q6-alternative deletion test |
| 2 | N sends in one rolled-back transaction plus a recount from `mail_send`: duplicate HIPAA notices and a CHECK that strands events | **Real, blocking** (support-notices.ts:97-111; dunning.ts:125-148) | Per-recipient outbox (D10): recipient rows recorded first, one transaction per recipient, message ID committed after each send, retries only to pending rows, state mirrored by message ID from both sides, counts counted from rows (no counts CHECK to fail). The same for dunning. Tests: second-send failure, event-before-ID, counts never above recipients. The one residual duplicate (SES accepted, commit failed) is stated |
| 3 | The shared account suppression list lets a screening complaint silence break-glass notices | **Real** | Resolved by #1: the screening set writes nothing to the account list. The rule is in ADR 0064; the runbook's staging check proves it |
| 4 | VDM engagement tracking can rewrite the screening's bearer link | **Real** (configuration-set.d.ts:106-112) | `vdmOptions: { engagementMetrics: false }` on all three sets; infra assertions (`EngagementMetrics: DISABLED`; no `VdmAttributes` with engagement on); runbook rule |
| 5 | Auto Validation contradicts "you may keep it"; verdicts misnamed; cut-off subtype undefined | **Real** (GetEmailAddressInsightsCommand.d.ts: `LOW`/`MEDIUM`/`HIGH`) | Auto Validation off on all sets; D9's exact verdict table; IAM action `ses:GetEmailAddressInsights` named; the cut-off counts `state = 'bounced' AND bounce_kind = 'permanent'`, every suppression subtype excluded; a db case per subtype. I also refuse on `HasValidSyntax` and `HasValidDnsRecords` `LOW`, which say the same thing as our DNS check |
| 6 | The cut-off never watches the rate SES acts on | **Real** | Two automatic triggers added (D6 b, c): the account warning alarms through an EventBridge rule (`account_rate`), and `GetAccount.EnforcementStatus` (`account_review`, models_0.d.ts:4271-4295). Infra and worker tests; Q2 now states what the floors allow against SES's levels |
| 7 | Seven bad addresses from one client close the funnel; validation spend uncapped | **Real** (rate-limit.ts:50) | `MailboxExists LOW` refuses; validation runs only after row checks and the rate limit; a daily cap through the existing rate-limit table (no schema); `MAIL_STREAM_PAUSED` alarms to the operator topic; the trade-off is in Q2. "The runbook shows how to find the client" is not possible: no load-balancer or WAF log exists in infra/lib. So **Q7** offers a per-client and per-domain bounce budget instead, with its tests |
| 8 | New system audit events forgeable by tp_app | **Real** (tenancy_hardening.sql:432-439) | The policy is re-created with the three actions reserved; hardening test extended |
| 9 | `support_notice_undelivered` collides, renders as a digest, fails the figure CHECKs | **Real** (notification_once :279; display.tsx:62-69; figure keys checked) | Subject = the notice row's own `id`; `counts = {}` (passes, no new codes); display branch, query join, both kind lists; e2e journey 1 asserts the text and link; files listed |
| 10 | A notice with no recipient is still `notice_sent` in the audit trail | **Real** (tenancy_hardening.sql:572-573 before support-notices.ts:104) | Recipients are read first; none gives `notice_undelivered` and no `notice_sent`; the due function treats the notice row as handled; db test |
| 11 | The public form reveals customers' complaint and bounce history | **Real** | The refusal list holds screening-stream outcomes only, not even customer `no_email` bounces; one wording for every address refusal; db test that a customer-stream complaint does not refuse |
| 12 | E2E journey 2 cannot send seven screenings to one simulator address | **Real** (D9 refusal; replacement, free_screening.sql:343-355) | Labelled simulator addresses mapped by the local part before `+`; six bounces seeded, the seventh through the page with its own address, practice name and ZIP |
| 13 | First deploy fails: Cognito needs a verified identity | **Real** (identity.ts:91-95) | Two phases behind `MailIdentitiesVerified` (D2), infra test of both, runbook steps with `cdk import` for an existing identity (old open item 2 folded in) |
| 14 | Q4 (dunning suspension) is outside #76 | **Real** | PR 6b keeps #76's part only; Q4 is now a question for the billing PR; ADR 0050's amendment says "no suspension change" |
| 15 | After a resume, claims open before SES re-enables the set | **Real** | `ses_enabled_confirmed_at`, set only by the reconcile after `GetConfigurationSet` reads enabled; claims, completions and failures need it; resume makes probes due at once; db and worker tests. The pause guards moved into triggers, so no Track A or B function body is copied |
| 16 | Alarm and code counts do not add up | **Real** | Every code listed: six metric filters (five platform, one web), 15 alarms, section 8 recounted ($1.50 and $1.80) |
| 17 | Changing `MailMessage.to` misses the outbox readers | **Real** (outbox.ts:8, :27; run.ts:256, :472) | The local file keeps a one-element array; a worker test pins it; both files listed in section 5 |
| 18 | `screening_prospect_mail_state()` has no consumer in PR 6b | **Real** (PR 7's read functions: reconciliation-001.md:519, not :527) | Removed; PR 7 adds it (D11, out of scope) |
| 19 | An invitation can be flagged by the bounce of an earlier send | **Real** (resend sets `sent_at`, 20261030090000:203) | `undelivered_at` is the message's `mail.timestamp`, flagged only at or after `sent_at - 5 s` (`sent_at` precedes the Cognito call in both handlers); db test for the late bounce |
| 20 | Reply-To left open | **Real** | Recommended Reply-To = SupportEmail in Q5, with what the alternatives give up |
| 21 | Two tests prove nothing | **Real** | The "no `@`" test is replaced by the keyed-hash test (differs from a plain SHA-256; changes with the pepper), now on the refusal list since `mail_send` has no hash; the reconcile drift test is named as the proof, the template check as supporting |
| 22 | Cost sources lack URLs; migration order only an open item | **Real** | Each price has its URL and read date; the two not re-read are marked. Open item 2 states the order, that only Q7 copies a Track A body, and that Track A's and B's tests run after Track C's migration |

Also found while revising: `NOTIFICATION_KINDS` lacks `follow_up` (open item 8); the alarm rule needs the same queue and key permissions (D4); an EventBridge archive would keep addresses, so none is created (D4).
