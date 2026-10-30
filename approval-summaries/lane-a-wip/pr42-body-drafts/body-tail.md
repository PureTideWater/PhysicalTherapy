## Freeze exception

No: it changes none of them (no engine arithmetic, ledger semantics, content pipeline or milestone gate; the security changes are the audit's own, under the founder's rulings of 2026-10-21 and the co-founder's standing direction of 2026-10-27).

## Domain model

The summary at the top is `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`: the last approved document (`6d7a143d…`, approved by Tyler Williams on 2026-10-23) and the new one, SHA-256 `b23fed0e…`, awaiting approval, its approval line at line 7334, blank. It changed in this round (it was `b12150bb…a04e` at 6f23c42, then `8ea57066…894f` with the M3 follow-up) because the verification round changed the migration: `mail_stream.first_probe_sent_at`, `mail_recipient_canonical(text, boolean)` and `mail_recipient_sha256(text, boolean)`, `screening_submit_mail_refusal(text, text)`, and the bodies of `screening_contact_refused`, `operator_record_mail_event`, `operator_mail_streams`, `operator_mail_probe_sent` and `console_resume_mail_stream`. It was regenerated after the last schema commit on a PostgreSQL 18 database migrated from empty (`pnpm db:domain-model --out --strict`: 98 tables, 1 view, 47 registered, 226 divergence rows with 23 to approve, 0 explanation problems; Cross-checks: 97 Drizzle tables and 97 migrated, no column difference, catalogProblems 0), and `--check` regenerates the committed text exactly on another (Checks). **The founder's approval of `b23fed0e…2518` is asked for now.**

## Open items

None of these blocks the approval of the domain model.

- **The founder:** the domain model's SHA-256 approval; the sign-off of the legal text (action 8); the address-validation accounts; the actions above; the consumer's size (issue #41, O9).
- **Counsel (O4), after the founder's sign-off:** the paused page, the refused-address and 90-day address-check sentences, the bounce budget's refusal, the known item (b) inference (one refusal sentence for every refused address), and S3's 90 days in AWS's event history.
- **Staging after phase 2 (O11):** Cognito's sending authorization; the screening set's empty suppression list; the account's reputation metrics at launch volume; the RDS parameters; which event a complaint-reason suppression raises; which subtype a global-list bounce carries on the screening set; that `OnConfigurationSetSuppressionList` counts toward neither rate; that CloudTrail reads the validation as a read, in the validation account alone; and that SES refuses a send through a disabled set with `SendingPausedException`.
- **O12:** re-read the AWS prices on AWS's pages before the first deploy.
- **PR 6e (O13):** reminders and withdrawal confirmations on the screening stream must read the gate and the refusal list.
- **Quarterly (O15):** refresh the IANA TLD snapshot and the typo list.
- **Q13 (billing PR):** suspension waits for a delivered dunning notice.
- **The base:** merge claude/build-platform at 165c5993 (#74) or later into this branch before the founder's approving review (rule 6; a new commit dismisses a review), with the suite again.
- **The capacity harness (tools):** a reused `--out` directory makes the harness read the earlier run's outbox as this run's (`tools/screening-capacity/run.ts` makes `<out>/data/mail` without emptying it), so a local rerun into the same directory reports negative times and dead links; CI and the release always start empty. Proposed for the harness's next change: refuse a non-empty `--out`, or empty its data directory first.
- **After-fix shots:** the next tour of this branch shoots `settings.users.undelivered`, `screening.error-paused`, `screening.error-budget` and `console.mail.default` at 1280, 390 and 1280 dark, for the gallery beside the review's before and after.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01TrKDxeLbxVo7t7zwRXFzrg
