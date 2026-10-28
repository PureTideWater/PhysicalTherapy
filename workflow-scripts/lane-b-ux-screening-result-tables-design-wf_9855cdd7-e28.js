export const meta = {
  name: 'lane-b-ux-screening-result-tables-design',
  description: 'Design UX PR 4 (ux-screening-result-tables): three scouts, one author, one adversarial design reviewer',
  phases: [
    { title: 'Scout', detail: 'the result screen, the findings, tests and #42 constraints' },
    { title: 'Design', detail: 'one author writes designs/lane-b-ux-screening-result-tables.md' },
    { title: 'Review', detail: 'one adversarial design reviewer' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/13d6f1ba-32aa-5d43-bbf7-78e9ac9db9c8/scratchpad'
const WT = '/home/user/ux-screening-result-tables'
const RULES = `Rules for you:
- Read-only on code: the worktree ${WT} (branch co-001/ux-screening-result-tables at claude/build-platform a6e754fc, which holds UX PR 3, #79: ScrollTable, ScrollBox, StackedRows, ADR 0078, TBL-01 to TBL-04) and /home/user/ops (claude/build-ops). Write only the files your task names (and your progress file). Never run git add, commit, push, checkout, reset or stash anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Heavy commands only under flock /tmp/laneb-heavy.lock <command>; prefer reading over running.
- Synthetic data only. No model name or identifier in any file you write.
- PR #42's files (${SP}/pr42-files.txt, at 6f23c42b) and LANES.md's "Not while #42 is open" list (/home/user/ops/LANES.md: among them apps/web/src/lib/screening/*, components/screening/upload-form.tsx, the screening pages) are not to be changed by this PR, except the shared documents (test-matrix, ADRs, the synth registry and matrix). Note: apps/web/src/components/screening/result.test.tsx is now a #42 file, and apps/web/src/lib/screening/labels.ts is in lib/screening/*; e2e/screening.ts and e2e/screening.spec.ts are #42's.
- The source: /home/user/ops/designs/lane-b-ux-review.md §3 "UX PR 4" (line ~217) and the findings "### UX-005 (C-008)", "### UX-040 (C-107)", "### UX-042 (C-118)", "### UX-043 (C-119)", "### UX-132 (C-061)", "### UX-206 (C-203)"; /home/user/ops/designs/lane-b-ux-review/synthesis/prs.json order 4. Their evidence was at 4d99df8; the base is now a6e754fc, so re-check every cited line. PR 3's design (/home/user/ops/designs/lane-b-ux-table-scroll.md, section 12 wins), its ADR (${WT}/docs/adr/0078-*.md) and its status file's proposals (/home/user/ops/approval-summaries/lane-b-ux-table-scroll-status.md, "Proposals", and lane-b-ux-screening-result-tables-status.md "Carried from PR 3").
- The screening's copy rules: no "owed", "underpaid" or "recovered"; the screening makes no finding about a payer (find the rule in .claude/rules/brand.md, docs/product, apps/web/src/lib/copy and tools/brand-copy).
- Improve as you go: in scope goes into your output; outside goes in your notes as a proposal.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`

phase('Scout')
const scouts = await parallel([
  () => agent(`You are scout 1 of 3 for the design of UX PR 4 of the PaidWhole build: "The screening result reads on a phone, and its rows say what they are".
${RULES}
${SAVE('p4-scout-screen.md', 'what is mapped so far')}
Task: map the public screening result page at ${WT}, each with file:line: the route (/screening/results/[resultId]) and its page file (#42's?), every component it renders (components/screening/anomalies.tsx, coverage.tsx, result-summary.tsx and any other), each of the three tables (columns, headers, cells, figures and their formatting, statuses and their tones, data-* hooks, how each is wrapped since PR 3), the lede and the count sentences, the labels each uses and where they come from (lib/screening/labels.ts and others; which of those files are #42's or in LANES.md's list), and who imports labels.ts. For each of the six findings, the current state at a6e754fc: still present, changed, or partly fixed by PR 3 (cite lines), and exactly what the fix needs. Write ${SP}/p4/screen.md and return a summary.`, { label: 'p4-scout-screen', phase: 'Scout' }),
  () => agent(`You are scout 2 of 3 for the design of UX PR 4 of the PaidWhole build: "The screening result reads on a phone, and its rows say what they are".
${RULES}
${SAVE('p4-scout-tests.md', 'what is mapped so far')}
Task, at ${WT}, each with file:line: (1) how an e2e spec can reach a populated screening result at 390 and 1280 without editing any #42 file: what apps/web/e2e/screening.ts exports (and what #42's head changes in it: git -C ${WT} fetch -q origin co-001/pr-06b-mail-streams; git diff origin/claude/build-platform origin/co-001/pr-06b-mail-streams -- apps/web/e2e/screening.ts), how screening.spec.ts sets up a result (the specialist's split approval, the upload, the consumer, the emailed link), whether the seed or prepare.ts already leaves a result, and the known flake at screening.spec.ts:339 and helpers.ts:87 (LANES.md "Handed to Lane A") so the new spec avoids its race; (2) whether screening.spec.ts (a #42 file) has locators that PR 4's StackedRows pairing would make ambiguous or wrong at its widths (for example screening.spec.ts:469 \`[data-section="anomalies"] [data-slot="status-chip"]\` .first()), and what the PR merged second must do; (3) unit test placement: result.test.tsx is #42's, so where new unit tests go and how they render (renderToStaticMarkup), and what result.test.tsx pins that PR 4's markup changes would break (those pins must then be updated by whichever PR merges second; list them); (4) the test-matrix and synth conventions for TBL-05 to TBL-08 (module 17, no-file entries), and the rewording of TBL-01, TBL-03 and TBL-04 the PR 3 status file proposes (draft all seven rows); (5) axe at 1280 and 390 on the result route. Write ${SP}/p4/tests.md and return a summary.`, { label: 'p4-scout-tests', phase: 'Scout' }),
  () => agent(`You are scout 3 of 3 for the design of UX PR 4 of the PaidWhole build: "The screening result reads on a phone, and its rows say what they are".
${RULES}
${SAVE('p4-scout-words.md', 'what is mapped so far')}
Task, at ${WT}, each with file:line: the words and tones. (1) UX-040: which tone the screening uses for an anomaly (the short or whole tone) and what the brand allows for an investigatory finding on a page that makes no finding about a payer: the status tokens (packages/brand, apps/web/src/app/brand.css .pw-status-*), StatusChip's tones (packages/ui or components), the brand rules (.claude/rules/brand.md, docs/brand/BRAND.md), CO-11 (docs/product/change-order-001.md) and the screening's own copy rules; recommend the tone. (2) UX-042: how the Difference columns' sign runs and how to say which way (words a prospect reads; compare the product's own variance words). (3) UX-043: the top-rows table's "Claims" heading over a claim-line count, and the right noun. (4) UX-132 and UX-206: read their findings and map their words. (5) Where each new or changed string should live, given lib/screening/labels.ts is #42-locked: a new module beside the components (components/screening/*), or the component itself; check tools/brand-copy's COPY_ROOTS reach it, and that the screening-capacity closure (tools/screening-capacity/watched.ts, watched-paths.txt is #42's generated file) would not gain a new file (a new module imported by the screening page joins the closure: say whether that is allowed or how to avoid it, as PR 3 did by keeping functions in an existing file). (6) The brand's expected, paid, short order applied to the screening's figures (Medicare figure, reduced figure, allowed in your file, difference) and DR-08's rule that the table's column order equals the stacked fields' order. Write ${SP}/p4/words.md and return a summary with recommendations.`, { label: 'p4-scout-words', phase: 'Scout' }),
])
log('scouts: ' + scouts.map(s => (s ? 'ok' : 'null')).join(', '))

phase('Design')
const design = await agent(`You are the design author for UX PR 4 of the PaidWhole build, branch co-001/ux-screening-result-tables: "The screening result reads on a phone, and its rows say what they are" (UX-005, UX-040, UX-042, UX-043, UX-132, UX-206).
${RULES}
${SAVE('p4-design-author.md', 'the sections written so far')}
Read first: ${SP}/p4/screen.md, ${SP}/p4/tests.md, ${SP}/p4/words.md; the review's six findings and §3 "UX PR 4"; PR 3's design section 3 (StackedRows), section 12, and ADR 0078; the code at ${WT}. Match the form of /home/user/ops/designs/lane-b-ux-table-scroll.md.
Write /home/user/ops/designs/lane-b-ux-screening-result-tables.md (the only file you write besides progress). The founder's standing rule: the best option, never weighted by build effort. Take the recommended option on every choice and record its reasons; wording and visible changes within .claude/rules/brand.md, CO-11 and the screening's copy rules (no asking).
Cover, concretely enough that builders work from it alone:
1. Scope: what closes, finding by finding, with the exact change and file:line; what is left "after #42" (anything that needs a #42 file or lib/screening/*), recorded with the PR that takes it.
2. The three tables on StackedRows: each table's COLUMNS constant in the brand's order (DR-08), the stacked fields, heading, hooks (never the table's), the stackBelow threshold (one of 32/36/40/48/54rem, equal to the table's min-w), and the call shape.
3. The words: every changed string (tone, sign, nouns, the count sentence for 0, 1 and 2 anomalies), where each lives (not lib/screening/*), and the copy rules checked.
4. The tests: the new unit test file (not result.test.tsx) with what it asserts (no screening component uses the short or whole tone; stacked rows hold every column; brandOrderProblems empty and header order equal to fields' order; repeatedIds empty; the count sentence); the result.test.tsx pins this PR's markup moves (for the PR merged second to update; if a pin breaks now, the test still runs in CI: decide how to keep CI green without editing a #42 file, e.g. keep the markup a pin reads, and say so); screening-phone.spec.ts (new; it calls e2e/screening.ts unchanged; how it reaches a result without the flake's race; at 390 every cell of the three tables is in view, no page wider than 390; axe at 1280 and 390); TBL-05 to TBL-08 rows and the rewording of TBL-01, TBL-03, TBL-04 (with matrix.ts byte-equal and the fixtures regenerated); synth registry entries.
5. ADR 0078: whether a dated amendment is needed (first user of StackedRows), and its text.
6. No migration (confirm). Overlaps with #42 and what the PR merged second must do (screening.ts, screening.spec.ts locators, result.test.tsx pins).
7. Screenshots for the UX and brand review (the result page at 1280 light, 390 light, 1280 dark; states with 0, 1 and several anomalies if reachable) and the second adversarial review's lens (recommend).
8. Build slices that do not collide, and their order.
9. Risks and open points, each with the recommended answer.
Return a summary of the design and its key decisions.`, { label: 'p4-design-author', phase: 'Design' })

phase('Review')
const SCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['build as designed', 'build with changes', 'redesign'] }, needsMigration: { type: 'boolean' }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, area: { type: 'string' }, claim: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'area', 'claim', 'fix'] } }, summary: { type: 'string' } }, required: ['verdict', 'needsMigration', 'findings', 'summary'] }
const review = await agent(`You are the one adversarial design reviewer for UX PR 4 of the PaidWhole build (co-001/ux-screening-result-tables). Read-only: write nothing but your progress file.
${RULES}
${SAVE('p4-design-review.md', 'the findings so far')}
The design: /home/user/ops/designs/lane-b-ux-screening-result-tables.md. Its scouts' notes: ${SP}/p4/*.md. The code: ${WT} at a6e754fc. The reviewer checklist that will judge the built PR: ${WT}/.claude/agents/ux-brand-reviewer.md.
Try to break it, citing file:line:
1. Does each of the six findings close on the screen a prospect sees, at 1280 and 390, and is anything the review asked for missing or wrongly deferred?
2. Is any #42 file or lib/screening/* file edited, or would the change break a #42 test (result.test.tsx pins, screening.spec.ts locators) on CI while #42 is open? If it would, the design must keep CI green without editing those files.
3. The words: true to what the screening computes (read the code that makes each figure and status), within the screening's copy rules (no owed, underpaid, recovered; no finding about a payer), the brand and CO-11; the sign of the Difference stated plainly; nouns agree with counts.
4. StackedRows: the brand order (DR-08), no repeated id or hook (repeatedIds), headings at the right level under the section headings, data-slot locators scoped, the stackBelow threshold equal to the min-w.
5. The tests: real, populated, free of the known screening race; the new spec reaches a result without editing #42 files; the matrix rows and synth entries follow the conventions; the TBL-01/03/04 rewording is byte-equal in matrix.ts and the fixtures regenerate.
6. The screening-capacity closure: does any new file join it (watched-paths.txt is #42's generated file)?
7. Is any part a migration, frozen code or a founder matter (legal text, held sentences: the review's F4 and F5 to the founder concern the screening's kept-data notices and sentences held for counsel)?
Return the verdict, whether a migration is needed, and findings with exact design fixes.`, { label: 'p4-design-review', phase: 'Review', schema: SCHEMA })
return { scouts, design, review }