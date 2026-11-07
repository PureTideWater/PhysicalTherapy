# scout-console progress

Started 2026-11-07. Tree: /home/user/ux-forms-after-42 at 31a7345f.

- [ ] read design 7.8 etc
- [x] read 7.8, 3.4-3.8, 5.4, 10.3, 11.2, status "Left for others"
- findings so far:
  - support/page.tsx Ticket now :57 (7.8 said :56), no hint; allowlist form-hints.test.ts:20-23. Server msg console.ts:975 'the ticket number (letters, digits and hyphens)'
  - console.ts email msg now :724 (7.8 said :517). Other email msgs :721,:727,:754
  - bare punctuation: console.ts:835 documentRef 'the e-signature reference (letters, digits and : / . _ -)' (polish called it :615)
  - opaque ID: apps/worker/src/support/support-mail.ts:57 WITHHELD_MESSAGE (worker, not #42)
  - users page raw checkbox :85-87 (7.8 said :85; unchanged), label text-xs 12px; server msg settings.ts:1082 'confirm that this person loses access now'
  - console.ts inviteMember :690-765; ANOTHER_IDENTITY :684; role msg :705 shows raw kind ('a role a group organization holds'); same in settings.ts:1002,:1055
  - baseline raw-findings.md:2561 words-other-01 recommended email: 'Email: PaidWhole staff cannot join a customer’s organization. To give support access, open a support grant from the ticket under Support.'
  - 4b branches origin/co-001/{,wip-}ux-screening-result-tables: ancestors of base (no own diff). #126: no file of mine. #129: http.test.ts only (not mine).
- [ ] sweep other #42 tsx: console/mail/page.tsx, support-access page, invitations.tsx, monitoring/display.tsx, shell.tsx
- [x] sweep done: console/mail/page.tsx:136-146 resume paragraph not tied to select (recommend describedBy); shell.tsx:112 raw <form> sign-out (no fields; leave); support-access page, invitations.tsx, monitoring/display.tsx, screening/page.tsx: no controls
- extra: support/page.tsx:39 "company staff" vs "PaidWhole staff" (sign-in/notice.tsx:204, terms/page.tsx:46); straight apostrophes in visible copy support:39, users:31,:39
- console.ts other msgs: :116,:117,:496,:497,:705 (+settings.ts:1002,:1055),:721,:727,:831; console endMembership :775 has no confirm (settings :1082 has) -> proposal
- STATUS: report drafted, returned to caller (2026-11-07)
