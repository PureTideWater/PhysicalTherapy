# PR #49: UX and brand review (head 94b5f218, base c355633b; 2026-10-26 ~14:20 UTC)

The repository's rule since #55 (`.github/pull_request_template.md`; `.claude/agents/ux-brand-reviewer.md`): a PR that changes what a person sees takes the UX and brand review with before and after shots. Shots (tools/lane-b-screen-tour, 1280/390 light and 1280 dark): 35 ids each side (console Rule releases, practice Coverage, practice Releases, with their states); scratchpad `ux49/` (not kept after the session). The synthetic seed holds no failed run, no NO_PFS_VALUE line and only release 900001, so the new Coverage card, the fee-schedule sentence, the failure texts and the report wording were judged from the code ("not seen").

No blocker. 2 major, 9 minor, 4 nits:
- Major: (1) the console's Content due items showed only titles: no explanation or next step (PRD.md:256); (2) dates broke mid-value at 390 px.
- Minor: (3) two remedies for the same Coverage lines (NO_PFS_VALUE row vs the not-loaded sentence); (4) the content table's shape differs from the location card; (5) three elements share one accessible name; (6) "Waiting on" heads rows no longer waiting; (7) console and practice page name one state two ways; (8) the practice is not told what ended or partly loaded content means; (9) waiting-on-content failures drawn in danger red; (10) the report reason uses abbreviations and names no next step; (11) the commands blocks are not keyboard-reachable.
- Nits: (12) titles not headings, family cells not row headers; (13) an ambiguous phrase; (14) "operator" and "—" in customer text; (15) help text (a #42 file, so it waits) and quarter labels "2026-Q4" vs "Q4 2026".
- Open baseline findings on these screens (not caused, not made worse): UX-011, UX-010, UX-065, UX-149, UX-100, UX-110, UX-139.
- Not checked: screen reader use, keyboard order, contrast measured, refresh/Back, roles other than the first persona, PDF layout.

Fix round 2 (all findings except the help text, a #42 file) follows; its dispositions go into the PR description.
