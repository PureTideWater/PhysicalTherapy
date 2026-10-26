export const meta = {
  name: 'lane-b-superseded-rerun-fix3',
  description: 'PR #50 third fix round: ScrollTable containment, unpriced lines in the diff summary, two nits; screens confirm',
  phases: [{ title: 'Fix' }, { title: 'Confirm' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/superseded-rerun'
const J = '/root/.claude/projects/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/subagents/workflows/wf_6b60ea5d-f8c/journal.jsonl'
const COMMON = `Lane B PR #50 (PureTideWater/PhysicalTherapy, "A superseded re-run cannot be accepted"), worktree ${WT}, branch co-001/superseded-rerun at ed85bcf. Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; heavy commands one at a time under flock /tmp/laneb-heavy.lock; never a foreground sleep. Do not push. No migration, nothing under packages/db/migrations or packages/pricing, no file of PR #42 (/tmp/claude-0/pr42-files.txt) except the three shared documents. No model identifier anywhere. Match the code's idiom. Money is integer cents; code computes every number. Commits end, after a blank line, with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CwzySVsjqgoXijLDMKj7VG`

phase('Fix')
const fix = await agent(`${COMMON}

Fix the UX confirm's findings (full text in the 'ux-confirm' result in ${J}; the shots in ${SP}/screens-after3/png; its probe notes in ${SP}/progress/ux-confirm.md):
- NEW-A (should-fix): apps/web/src/components/scroll-table.tsx: the scroller is not position:relative, so absolutely positioned sr-only header cells escape it and widen run pages at 390/320 px (WCAG 1.4.10). Add the containment; check every ScrollTable user still renders right (grep its users; run their tests). Also wrap the run page's PatternTable (Variance by payer pattern) and, if on a page this PR changes, the Coverage reasons table in a ScrollTable. Verify with a Playwright probe like ${SP}/uxc/probe/p.mjs (or the screen tour) that the document width equals the viewport at 390 and 320 px on the run page.
- NEW-B (should-fix, money display): apps/worker/src/price/diff.ts summaryOf (and the acceptance summary built on it) counts lines with a priced_line row on both sides as "priced" whatever their unpriced_reason, and sums expected_allowed_cents with NULLs as 0, so unpriced lines read as priced at $0.00. Count and total only lines priced on both sides (unpriced_reason IS NULL on both); have DiffSummaryText use that count and drop the totals sentence when it is 0; count and word lines that go from priced to unpriced or back (e.g. "3 no longer priced once accepted"), naming unpriced reasons only by their closed-list codes as the app already does. Tests in diff.test.ts / rerun.db.test.ts (a re-run where priced lines become NO_AGREEMENT) and the component test.
- N2-residual (nit): when the diff has no changed lines and no one-side-only lines, skip the summary paragraph in the non-accepting mode too.
- N3-cue (nit): a visible cue that a table scrolls sideways at small widths, if it fits the app's existing patterns (check other ScrollTable uses; take the best option consistent with the design system; if none exists, a short visible hint below 640 px).
Update the e2e pricing spec if wording it asserts changes; the ADR 0037 amendment and the design's §8.2 (/home/user/ops/designs/lane-b-superseded-rerun.md) if wording changes.
Run under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; unit tests of apps/web/src/components and apps/worker/src/price; the db tests rerun.db.test.ts, reruns-routes.db.test.ts and every other db test that reads compareRuns or the diff summary (grep), on a fresh migrated database you drop after; the e2e pricing spec (local build). Commit locally: "Third fix round: tables contained at small widths, unpriced lines kept out of the diff's priced totals" with a body listing each finding.
${SAVE('fix3.md', 'each finding, the change, each check with its result')}
Return: dispositions, files changed, checks with counts, the commit SHA.`, { label: 'fix3', phase: 'Fix' })

phase('Confirm')
const confirm = await agent(`${COMMON}

The third fix round is committed locally (result: ${typeof fix === 'string' ? fix : JSON.stringify(fix)}). Confirm it on screens: re-take the shots with the screen tour as ${SP}/progress/screens-after3.md did (TOUR_DIR=${SP}/screens-after4, TOUR_REF = the local HEAD of ${WT}: the tool's setup makes a detached worktree of TOUR_REF, and a local commit is reachable from the same repository; if setup.sh fetches from origin only, point it at the commit SHA and check it resolves; same spec /home/user/ops/designs/lane-b-superseded-rerun/capture/superseded.spec.ts; heavy lock; stop; cleanup). Then check, viewing with Read and measuring with a probe as ${SP}/progress/ux-confirm.md did: the run page's document width equals the viewport at 390 and 320 px (NEW-A); shots 41-46 no longer call unpriced lines priced nor show $0.00 for them (NEW-B); the summary is not repeated (N2); the scroll cue (N3). Report anything still wrong, or new.
${SAVE('fix3-confirm.md', 'each step and each check with shot names')}
Return verdict pass/fail with evidence (shot names, measured widths).`, { label: 'fix3-confirm', phase: 'Confirm' })

return { fix, confirm }
