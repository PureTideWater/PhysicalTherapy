# check-K-CE-2

Started 2026-11-07. Clone /home/user/ux42-K-CE-2 at 09377f21. CI-30 allocated (status file). Next: read design, install.
- Installed (lock). Read diffs of C/E files, ADR 0077/0037, BRAND, matrix rows. CI-30 word for word in md/matrix.ts/fixture; no FRM-<1> left.
- Candidate finding: BRAND.md line excepts only legal surface + step refusal, but SCREENING_ZIP_MESSAGES (field 'zip', routes.ts:803-818, not a legal surface) are two-sentence field refusals -> BRAND claim inaccurate (ADR item 1/5 and FRM-04 do except it).
- Nit: Ticket hint "as Tickets shows it" vs screen "Support tickets" (still open, left to brand reviewer).
- Next: run tables/form-hints/synth tests, base red for tables, skip-link e2e.
- Guards green at head (logs/K-CE-2/web-guards.log 65, synth-fixtures.log 23); red with base users/support pages (guards-red-base-pages.log). No randomUUID().slice left in e2e.
- Running skip-link e2e + scratch probe (not obscured, 320px) -> logs/K-CE-2/skiplink-and-probe.log.
- Reported (forced to report before the e2e finished): 1 should (BRAND line omits SCREENING_ZIP_MESSAGES), 2 nits. The clone /home/user/ux42-K-CE-2 is still there (holds the uncommitted scratch probe zz-kce2-probe.spec.ts). Remove it after the e2e ends.
