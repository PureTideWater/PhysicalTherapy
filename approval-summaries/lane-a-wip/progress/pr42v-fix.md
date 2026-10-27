# PR 42 (6b-4) verification fix round (progress)
- Start 2026-10-27 ~22:2x UTC: /home/user/pr6b4 clean at c37fa7cc (local, unpushed; 9 commits over 6f23c42b). No earlier run of this file.
- Note: origin/claude/build-platform moved to ecebdc90 (#77 co-001/ci-browser) after 085299b; decide whether to merge.
## Findings (18): disposition / fix / test / commit
- [x] 0. merged origin/claude/build-platform ecebdc90 (#77) -> 9664763b: ADR 0062 conflict (both amendments appended at the end) resolved keeping both (base's ADR 0066 Part 3 first, then 6b-4's); pnpm install lockfile unchanged (sha ba976a82), watched.ts --write unchanged (541 entries), synth --all 0 written. Why: without it the PR conflicts with its base and pull_request workflows do not run (rule 6).
## Plan (19 findings: sec 1-5, mail 6-10, ux 11-19)
- F1 sec blocking oracle: drop list from screening_submit_mail_refusal (signature -> (rate_account_subject, client_subject)); routes.ts; routes.db tests ZIP 00099/00012 + MEDIUM same answer; ADR S4 para + header
- F2 sec +tag: mail_recipient_canonical_tagged (SQL) + TS twin; bounce keyed tagged, complaint canonical; lookup canonical-any OR tagged-bounce; db tests both ways
- F3 sec iCloud: me.com/mac.com -> icloud.com both rules + MAILBOX_SPELLINGS
- F4 sec U+A7F1: drop NFKC both; ASCII trim+lower; non-ASCII returned as is; whole-code-point agreement test (digest)
- F5 sec 90-day wording: upload hint + result page sentence; legal-surfaces.md
- F6 mail probe flap: new column first_probe_sent_at (first probe since resume; reset by resume); missed = older proof since resume >=26h OR (a proof not back since resume AND first probe since >=1h); worker test runs twice; ADR, runbook 3.7, infra hours
- F7 mail staging checks: info log line per probe-kind event (message id, stream, event, state, subtype); runbook rewrite
- F8+F12+F17 invitations: suppressed own reason+sentence; no Send again for complained/suppressed (page + both resend actions refuse); undelivered_at = event time (migration); runbook 3.4
- F9 ADR bound four; F10 runbook O11 SendingPaused check; F11 PR body founder action 8
- F13 upload-form: input-only issues -> no 'Check the fields' + no 'Form:'; linked request-audit; component test
- F14 users page 390: stack below sm, nowrap dates
- F15 console cut-off words + mono; F16 resume note; F18 notification text; F19 result email REFUSED_ADDRESS_KEPT
- [x] tests written first (uncommitted): mailbox-spellings.ts (+tagged table, iCloud, non-ASCII as read), mail-address.test.ts, mail.db.test.ts (privileges, tagged agreement, code-point sweep, probe tables), screening.db.test.ts (precheck no list, +tag, iCloud), web routes.db.test.ts (ZIP/MEDIUM same answer; calls spent for listed), worker mail-events.db.test.ts (flap twice-run, first activation, probe log line), events.test.ts (sesEventType)
- failing-first run started (scratchpad/pr42vf/ff.sh -> ff-unit.log, ff-db.log, ff-status.txt) on tp_pr6b4v_ff_1 (dropped by the script)
- marker .claude/.allow-protected-edit is SET (untracked; never add it); remove after migration edits
- [x] FAILING-FIRST done on unfixed tree (9664763b + tests): unit 5 failed/14 (mail-address 3, events 2); db 73 failed/166 (routes.db 4: '00099 target.listed... expected contactEmail to equal zip' = the oracle, listed typo calls [] vs [listed], spellings calls [] vs 2, budget calls; mail.db 14 (column first_probe_sent_at missing, mail_recipient_canonical(text, unknown) missing, privileges); screening.db 42 (precheck (unknown, unknown) missing aborts setup -> cascade 'closed'); mail-events 14 (column missing)). Logs scratchpad/pr42vf/ff-unit.log, ff-db.log
- Design decision F6 (extended): first_probe_sent_at (first probe since last resume; resume clears); missed = both back since resume & older >=26h, else first >=1h; probe_due adds 'missed and last send >=1h' (hourly re-send while missed; replaces 'outstanding & 26h', a subset), so a fix reopens the screening within an hour (ADR 0065 Revisit item had named it)
