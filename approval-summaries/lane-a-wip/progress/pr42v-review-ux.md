# pr42v review-ux progress (UX/brand lens, PR #42 at c37fa7cc)
Started 2026-10-27. Clone: /tmp/claude-0/-home-user-PhysicalTherapy/e99dbc78-96e5-5013-a491-2b14e5309bfe/scratchpad/pr42v/review-ux
## Status
- [x] clone + install (review-ux at c37fa7cc, install ok)
- [x] read ux-brand-reviewer.md, brand.md, findings, integrate report, PR body (saved scratchpad/pr42v/pr42-body-ux.md)
- [ ] shots before (13f59b1) / after (c37fa7cc)
- [ ] word-for-word copy review
- [ ] a11y review
- [ ] original findings check
## Leads
- Fix-round visible diff (first-parent non-merge 13f59b1..c37fa7cc): console/mail/page.tsx (cut-off sentence, marks 'domains or mailboxes', resume-review sentence), console_mail_streams w.starts_at (M8), users page (complained sentence), messages.ts SCREENING_PAUSED text/refusal + SCREENING_BOUNCE_BUDGET, retention.ts REFUSED_ADDRESS_KEPT, routes.ts precheck screening_submit_mail_refusal (S1/S4) -> submitIssue
- Tour spec (ops claude/build-ops 701b76a) has NO console.mail, paused screening, refusal, undelivered invitation captures -> need local supplementary spec in TOUR_DIR (not pushed)
- LEAD: users page 'Not delivered: check the address, then invite again' for suppressed (incl M1's OnAccountSuppressionList) -> re-invite suppressed again? dead end
- LEAD: users page complained sentence 'one sent again will not reach them' while Resend button still offered?
- LEAD: refusal 'request an audit' without link?; bounce budget sentence grammar 'take another screening from them'
- LEAD: legal surfaces changed (screening-mail-paused, -address, -kept-*): founder sign-off in PR? body lists under Q12 founder then counsel (open item)
- LEAD: cut-off sentence figures not mono (brand.md:36), pre-existing class

## Findings
## Shots
