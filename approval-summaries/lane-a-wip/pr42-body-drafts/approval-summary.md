## PR 6b-4 (#42): mail streams, delivery records and the screening's cut-off

**What it changes**
- **For a prospect (the free screening):** the result email comes from its own sender (`results@screening.<domain>`, shown as "PaidWhole"). Before anything is checked against outside services, the form suggests a fix for a likely typo, and the database refuses an upload it would refuse for the person submitting it anyway (screening closed or paused, or too many recent undelivered results from this connection or email account). Only then does it ask DNS and Amazon SES whether the mailbox exists (at most one 2-second wait). An address that recently bounced or reported a screening as spam is refused only after every other check, so a refusal never reveals whether an address is on that list. If too many screening emails bounce or are reported as spam, new screenings pause and the page says so, with a link to request an audit; uploads already made are kept and emailed after the resume. Every page that says the address is deleted, and now the result email too, also says a coded form of a refused address is kept 12 months and that the mail service keeps its record of the address check 90 days (wording awaiting your sign-off).
- **For a customer (practice administrators):** each support-access (break-glass) and dunning notice goes to each administrator as a separate message and is tracked. The grant page and the console show "Delivered to n of n" or "Not delivered to k of n", and an in-app notice appears when one did not arrive, now telling them to ask PaidWhole support to release an address that is right. On the users page, an invitation that bounced says to check the address and invite again; one reported as spam, or held back by Amazon's suppression list, says to ask PaidWhole support and no longer offers "Send again" (which would have voided the email the person could still find). The page no longer scrolls sideways on a phone.
- **For operations:** a console mail page (`/console/mail`) shows each stream's counts, its pause and resume history, and bounce marks. Only a platform administrator can resume a paused stream, and must give a reason. There are 17 mail alarms, probes to SES's simulator (daily, and hourly while a stream's probes are missing), a deliverability runbook, and a second AWS account per environment that runs address validation, so the main account's trail never records an address. A missing probe now pages within 2 hours (or 1 hour after a resume) and the alarm stays raised until the probes come back.

**The schema in plain words:** one new migration with 8 new tables, all with forced row-level security (90 such tables in all): notice recipients for support access and dunning, the mail streams, one row per message sent (`mail_send`, no address stored), the keyed-hash pepper, the screening refusal list (a keyed hash of the mailbox, kept 365 days; a hard bounce keyed by the exact +tag spelling) and 7-day bounce marks. Database functions run the cut-off, the refusals and the console. No role can read an address from the mail record, and no login role holds a grant on the mail tables. This round added one column (`mail_stream.first_probe_sent_at`) and changed six functions.

**What proves it** (local, on the final tree @@HEAD@@):
@@PROOF@@

**What changed in this round (the verification round, 2026-10-27):** three adversarial reviews (security, mail, UX and brand) re-checked the first round and found 19 issues; all were real and all are fixed.
- Blocking (security): the check added for S4 let anyone test whether an address was on the refusal list, by naming an unpriceable ZIP code. Fixed: the list is consulted only after every other check.
- Blocking (UX): the changed legal wording had no sign-off from you in the PR. Now action 8, with every sentence before and after.
- A bounce from a "+tag" address no longer blocks the person's real mailbox; Apple's me.com, mac.com and icloud.com count as one mailbox; the address rule no longer depends on Unicode tables that differ between Node and PostgreSQL.
- The missing-probe alarm no longer clears itself every 26 hours while the screening stays closed; probes are logged so staging checks can be read.
- Invitations held back by the suppression list get their own wording and no resend; the paused and budget refusals read clearly with a working link; the console's cut-off sentence is unambiguous.
- The pages and the result email now state the 90-day record of the address check.

**The round before (2026-10-23):** 17 findings from the security and mail reviews (M1 blocking: a notice SES never sent read "Delivered"), 16 fixed and M5 reported; plus the separate address-validation account (S3).

**Capacity (decide before launch, issue #41):** CI is the measurement of record; nothing is resized here. CI's last measurement on this PR (6f23c42) put the middle S4 run at 27.8 s, under the 48-s line; earlier runs measured 47.7 to 54.1 s on slower runners.

**You are asked to approve** the domain model, SHA-256 `b23fed0e…`. Its approval line is at line 7334 of `docs/product/domain-model.md` and is blank. Your approval is your GitHub review of the latest commit.

**Open items for later (none blocks the approval)**
- Sign off the legal wording (action 8 in the PR), then counsel's review (O4).
- Create the address-validation AWS account for each environment, before the first release.
- The consumer's size (issue #41).
- Staging checks after phase 2 (O11), now including how SES refuses a send through a paused stream.
- After-fix screenshots of the four changed screens at the next tour.
