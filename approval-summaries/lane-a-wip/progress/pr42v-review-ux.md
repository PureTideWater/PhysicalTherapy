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
## Shots setup (21:xx)
- /home/user/screens = clone of review-ux (DELETE at end); setup.sh run with TOUR_REF=13f59b1, TOUR_DIR=scratchpad/pr42v/screens-before
- local supplement spec: scratchpad/pr42v/pr42-capture/pr42.spec.ts (tour helpers + 3 tests: screening states, console mail default/paused, users undelivered); runner run-pr42.sh
- ids: screening.default, screening.sent-sent, screening-result.not-found, screening.error-budget, screening.paused, screening.error-paused, screening-result.default, console.mail.default, console.mail.paused, settings.users.undelivered (x 1280, 390, 1280-dark)
- before build started in background (bt6tv6cc8), capture waiting (bnertlyim)
- AFTER: TOUR_DIR=scratchpad/pr42v/screens-after, TOUR_REF=c37fa7cc, setup.sh then cp pr42.spec.ts, same commands
- CLEANUP: touch $TOUR_DIR/stop; drop tp_e2e_screens; rm -rf /tmp/tp-e2e-tp_e2e_screens-*; rm -rf /home/user/screens; rm clone
## Findings so far (code)
- F-users-complained: users page complained row says 'one sent again will not reach them' but row still offers 'Send again'; Cognito RESEND issues a NEW temp password (cognito-provider.ts:346-350, dev-provider.ts:304-313) -> pressing voids the spam-folder email's password AND is suppressed; no 'contact PaidWhole support' path (runbook 3.4 says operator can lift suppression). should_fix
- F-users-suppressed: 'Not delivered: check the address, then invite again' for undelivered_reason 'suppressed' (account suppression list; M1 now routes complaint-suppressed there) -> re-send suppressed again; dead end. should_fix
- before: 30 shots 0 skipped (22:05-22:06), server stopped, port free
- before tiled: 108 tiles (screens-before/tiles). before users.390 = 667 px wide (baseline overflow, pre-existing); console window before 'Since 2026-10-17' (M8 bug shown)
- after: setup done (c37fa7cc), build+serve bg b1cs33kh4, capture bg bpd8xt2sm
- lint:copy at c37fa7cc: pass (523 files)
- LEAD legal sign-off: LANES.md:291 founder keeps 'sign-off of legal text before it goes to counsel'; PR body Open items 'The founder' does not list the changed legal sentences -> blocking-until-signed (PR-body fix)
- LEAD complained date: invitation.undelivered_at = held.sent_at (migration ~1063) -> 'Reported as spam {send date}' nit
