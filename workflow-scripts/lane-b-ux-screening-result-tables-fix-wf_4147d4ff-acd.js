export const meta = {
  name: 'lane-b-ux-screening-result-tables-fix',
  description: 'Fix round for PR #83: base merge (#81), every review finding, the full local suite once, the shots re-taken where the fixes show',
  phases: [
    { title: 'Fix', detail: 'base merge, then one fixer' },
    { title: 'Suite', detail: 'the full local suite once on the final head' },
    { title: 'Recheck', detail: 'after shots re-taken where the fixes show' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/13d6f1ba-32aa-5d43-bbf7-78e9ac9db9c8/scratchpad'
const WT = '/home/user/ux-screening-result-tables'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const TRAILER = `Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D`
const RULES = `Context: PaidWhole pull request #83 (branch co-001/ux-screening-result-tables, head f4a97668, worktree ${WT}): the public screening result reads on a phone, and its rows say what they are. The design: /home/user/ops/designs/lane-b-ux-screening-result-tables.md (section 12 wins). The two reviews, every finding with file:line, scenario and fix: ${SP}/p4-reviews.json (reviews[0] correctness: P4-RC-01 to -06; reviews[1] UX and brand: UXR-01 to -08); the UX reviewer's progress ${SP}/progress/p4-review-ux.md; the shots index ${SP}/p4-screens-index.md.
Rules:
- Work only in ${WT}. Never touch /home/user/PhysicalTherapy; never push; never rebase, reset, stash or force.
- Never edit a file in PR #42's list (${SP}/pr42-files.txt, at 46974a25) or LANES.md's "Not while #42 is open" list (apps/web/src/lib/screening/* among them), except the TBL rows in docs/product/test-matrix.md and packages/synth/src/cases/{matrix,registry}.ts, and tools/screening-capacity/watched-paths.txt written only by its generator. components/screening/result.test.tsx, lib/screening/labels.ts, e2e/screening.ts and e2e/screening.spec.ts stay untouched, and every pin in result.test.tsx must keep passing.
- No migration; nothing under packages/db, pricing, ledger or money. Synthetic data only. No model name or identifier in any file.
- Words within .claude/rules/brand.md, CO-11 and the screening's copy rules (never owed, underpaid or recovered; no finding about a payer); no style attribute; tokens only; match the surrounding idiom.
- Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Every heavy command only under flock /tmp/laneb-heavy.lock, one at a time. Long commands with run_in_background.
- If PostgreSQL is down, bash /tmp/setup-container.sh.
- Improve as you go inside these files; report anything larger as a proposal.`
const RESULT = { type: 'object', properties: { commits: { type: 'array', items: { type: 'string' } }, fixed: { type: 'array', items: { type: 'string' } }, notFixed: { type: 'array', items: { type: 'string' } }, checks: { type: 'array', items: { type: 'string' } }, handovers: { type: 'array', items: { type: 'string' } }, proposals: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['commits', 'fixed', 'notFixed', 'checks', 'handovers', 'proposals', 'summary'] }

phase('Fix')
const fix = await agent(`You run PR #83's base merge and fix round. ${RULES}
${SAVE('p4-fix.md', 'each step and finding done, and what remains')}
1. THE BASE MERGE: git -C ${WT} fetch -q origin claude/build-platform (now 56ed6279: #81 SUITE-CAP-1a merged); git merge --no-ff origin/claude/build-platform -m "Merge claude/build-platform (#81) into co-001/ux-screening-result-tables" with the trailer. Shared files (test-matrix, matrix.ts, registry.ts): keep both sides' rows (LANES.md rule 6). watched-paths.txt: both sides changed it; never hand-merge: pnpm install under the lock, then pnpm exec tsx tools/screening-capacity/watched.ts --write on the merged tree, and commit its output in the merge (or a follow-up commit named for the generator). pnpm synth --all if fixtures are affected.
2. THE FINDINGS (the orchestrator's decisions, under the founder's standing rule and the co-founder's wording rulings), each fixed in this PR:
- UXR-01 (should fix): directly after ScreeningHeading in result-view.tsx, a primary-button link "Ask for an audit of the rows a contract prices" to #screening-convert (confirm the convert card's id and that its own heading and button words agree with the link's; make the words match the convert form's call to action if they differ, one name for one thing); keyboard and focus land on the form's heading; no legal or kept-data paragraph moves (the founder's matters, F4 and F5 in the review). Add a unit case and a step in screening-phone.spec.ts (the link is in view at 390 on load and moves focus to the form).
- P4-RC-01 and UXR-02: anomaliesDescription's page sentence for others.groups === 1 reads as UXR-02's fix says ("…; the table’s last row is the one other group, its rows summed, and the next page lists it."), only that branch (the 20,457 case #42 pins keeps its words); a unit case with the database's real one-other shape (P4-RC-06 (a)); TBL-08's clause stays true.
- P4-RC-02 and UXR-06: the ADR amendment and every claim say the synthetic result's anomalies fit, and wider figures scroll in the region with the cue.
- P4-RC-03: screening-phone.spec.ts step 7 derives its viewport from the measured scrollbar width ("where the cards' content is exactly 54rem"); TBL-06 and the ADR say so (994 px without a classic scrollbar).
- P4-RC-04 and UXR-03: in the rows copy, coverage items drop the Reason field when the row has no reason; the could-not-price card's sentence reads "Medicare rows PaidWhole could not price, or whose rates change within the quarter. Coverage, below, gives each outcome, and the reason for a row PaidWhole could not price." (unless a #42 pin reads the old words: then keep them and record it); TBL-05's wording and the unit case follow.
- P4-RC-05: the spec queries screening_result_groups with the route's page size (import SCREENING_GROUPS_PER_PAGE, or read page_size), never a literal 100.
- P4-RC-06 (b): one unit case per card that each stacked value equals its table cell under the same header (by data-group, data-row-no, data-coverage).
- UXR-04: the stacked dl gains @min-[24rem]:gap-y-2; its pin in stacked-rows.test.tsx follows.
- UXR-05: counted() in lib/copy/words.ts groups its digits ("12,345 rows"), Counted (components/remittances/display.tsx) slices by the grouped string's length, groupedCount goes and the screening uses counted; add the words.test.ts case. First grep every test and spec (unit and e2e, #42's included) for an ungrouped count of 1,000 or more that counted() or Counted renders: if one would break a #42 file's assertion, keep groupedCount instead and record why; otherwise update the non-#42 assertions. Re-run watched.ts --write if the closure changes.
- UXR-07 and UXR-08: no code (the orchestrator puts them in the PR description and status file); just confirm the facts.
3. Fast checks under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; the web unit project (result.test.tsx unedited and passing; result-tables.test.tsx; stacked-rows.test.tsx; words.test.ts; tables.test.ts); watched.test.ts; screening-phone.spec.ts and screening.spec.ts after a build. Commit in a few commits by theme, each naming its finding ids. ${TRAILER}`, { label: 'p4-fix', phase: 'Fix', schema: RESULT })

phase('Suite')
const suite = await agent(`You run the full local suite once on PR #83's final head (worktree ${WT}). ${RULES}
${SAVE('p4-fix-suite.md', 'each command, its result and counts')}
The fixer's result: ${JSON.stringify(fix && { commits: fix.commits, notFixed: fix.notFixed })}.
Each command under flock /tmp/laneb-heavy.lock, in the order and with the exact commands of /home/user/ops/approval-summaries/lane-b-ux-table-scroll-fix-suite.md (read it; e2e used E2E_ADMIN_URL on 5433): install --frozen-lockfile (if tools/test/workflows.test.ts later fails only on an old playwright-core in node_modules/.pnpm, run pnpm install --frozen-lockfile --config.modules-cache-max-age=0, the runbook's remedy); check:fixtures; typecheck; lint; lint:copy; lint:logs; verify-content; the engine-freeze check against the merge base; synth --all then git diff --exit-code; pnpm test (files, passed, skipped); test:golden; test:oracle; db:migrate on a fresh database then test:db in shards one after another (counts); build, stamp, e2e with E2E_PREBUILT=1 in two shards (counts; a failure only in screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87 is the known flake: re-run that spec once and record both); tools/stryker/affected.ts then the gate. Fix any failure the diff causes at its root in a new commit and re-run what it touches. ${TRAILER}
Write ${SP}/p4-fix-suite.md in the form of the earlier suite file (a table: command, result, counts, time), with the head commit.`, { label: 'p4-fix-suite', phase: 'Suite', schema: RESULT })

phase('Recheck')
const recheck = await agent(`You re-take PR #83's after shots where the fix round shows, and re-check the UX findings. ${RULES}
${SAVE('p4-fix-recheck.md', 'each step done')}
How: /home/user/ops/tools/lane-b-screen-tour/README.md "Set-up and a run", with TOUR_DIR=${SP}/p4-screens-after2 and TOUR_REF set to git -C ${WT} rev-parse HEAD (a local commit is reachable from the tour worktree). TOUR_ONLY: the sample ids of ${SP}/p4-screens-index.md, and the capture spec ${SP}/capture/lane-b-ux-screening-result-tables-capture.spec.ts again (with ${SP}/capture/screening-result-harness.mts; add a state for the one-other-group page sentence and for the new audit link at the top at 390 and 1280). Check the lock and the server ended together; clean up the tour database. Tile it. Compare with the first after run (${SP}/p4-screens-after) and the before run (${SP}/p4-screens-before): for each of UXR-01 to -06 and P4-RC-01, -03, -04 say whether the shots show it fixed (cite shot ids), and note any new defect the fixes caused (fix it in a commit if small and plainly right; ${TRAILER}). Write ${SP}/p4-screens-index-after2.md with the verdicts.`, { label: 'p4-fix-recheck', phase: 'Recheck', schema: RESULT })
return { fix, suite, recheck }