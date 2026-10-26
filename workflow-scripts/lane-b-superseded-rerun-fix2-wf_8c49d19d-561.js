export const meta = {
  name: 'lane-b-superseded-rerun-fix2',
  description: 'PR #50 second fix round: the 390 px button, nits, the held-by cap; merge the base; checks',
  phases: [{ title: 'Fix' }, { title: 'Merge base' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/superseded-rerun'
const J = '/root/.claude/projects/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/subagents/workflows/wf_f83c3757-009/journal.jsonl'
const COMMON = `Lane B PR #50 (PureTideWater/PhysicalTherapy, "A superseded re-run cannot be accepted", combined audit #10), worktree ${WT}, branch co-001/superseded-rerun at a3c583d (CI all green there). Records: /home/user/ops/designs/lane-b-superseded-rerun.md, /home/user/ops/approval-summaries/lane-b-superseded-rerun-fix-round.md. Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; heavy commands one at a time under flock /tmp/laneb-heavy.lock. PostgreSQL may still be starting after a container restart: wait until pg_isready -h localhost -p 5433 answers (poll in a background loop or with the Monitor tool; never a foreground sleep). Do not push. No migration, nothing under packages/db/migrations or packages/pricing, no file of PR #42 (/tmp/claude-0/pr42-files.txt) except docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts. No model identifier anywhere. Match the code's idiom. Commits end, after a blank line, with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CwzySVsjqgoXijLDMKj7VG`

phase('Fix')
const fix = await agent(`${COMMON}

Fix these findings from the verification stage (full text in ${J}: the 'rereview-fix-delta' result's N1 and the 'ux-recheck' result's N1..N6; screenshots in ${SP}/screens-after2/png, view with Read):
- UX N1 (should-fix): at 390 px (and 320 px, WCAG 1.4.10) the new "Re-run the run in effect under release N" button does not wrap and runs out of its card (Button base is whitespace-nowrap). Take the best option (a wrapping button where long labels occur, via a prop on ActionForm or the page, or a shorter label tied to the naming sentence by aria-describedby); check every other new long button label the PR added for the same problem.
- UX N2..N6 (nits, carried because this push changes these files): the acceptance diff summary wording (one clear sentence; only the no-changes line when nothing changes), the diff tables at small widths (an overflow-x-auto labelled region if the best option), runs that look alike on the runs list and compare header (runName / priced time to the second), the small wording issues (N5, with a full stop at the end of the service message), and the releases page focus hand-off (N6).
- Re-review N1: past 200 held-by runs a re-run can never be accepted and the refusal shows a raw key. Take the best option (e.g. no cap but a sane bound consistent with the service, or a page state instead of an Accept form that cannot succeed) and add a label for heldByIds on both Accept forms.
Update every affected test (display.test.tsx, diff.test.tsx, action-form.test.tsx, reruns-routes.db.test.ts, rerun.db.test.ts if messages change, e2e/pricing.spec.ts), the ADR 0037 amendment and the design's §8.2 wording (/home/user/ops/designs/lane-b-superseded-rerun.md, outside the repo) if wording changes; test-matrix and synth mirror identical if a row changes (regenerate expected.json with pnpm synth --case <id>).
Run under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; the unit tests of apps/web/src/components and apps/worker/src/price; vitest packages/synth; the db tests rerun.db.test.ts and reruns-routes.db.test.ts (after pnpm db:migrate on the test database as the suite does); the e2e pricing spec (local build). Then commit locally: "Second fix round: the 390 px Re-run button, the verification nits, the held-by bound" with a body listing each finding fixed.
${SAVE('fix2.md', 'each finding, the change, each check with its result')}
Return: each finding's disposition, files changed, checks with counts, the commit SHA.`, { label: 'fix2', phase: 'Fix' })

phase('Merge base')
const merge = await agent(`${COMMON}

The second fix round is committed (its result: ${typeof fix === 'string' ? fix : JSON.stringify(fix)}).
Now merge the latest claude/build-platform into the branch, per LANES.md rule 6 and /home/user/ops/lanes/lane-b.md "Merging": git -C ${WT} fetch origin claude/build-platform; git merge --no-ff origin/claude/build-platform (a merge commit; never rebase). If the shared documents conflict (test-matrix.md, synth matrix.ts, registry.ts, an ADR, reconciliation-001), keep both lanes' changes. If pnpm-lock.yaml conflicts, never hand-merge it: take the base's and re-resolve with pnpm install. Commit the merge with a message in the style of the branch's earlier merge commit ("Merge claude/build-platform (<sha>: PR #NN <title>) into co-001/superseded-rerun: <clean|resolved ...>, both sides kept (LANES.md rule 6)") and the two trailer lines.
Then re-check what the merge touched: list the files the base changed since 4d99df8 (git diff --name-only 4d99df8 origin/claude/build-platform) and intersect with this PR's files and with code this PR's code calls or is called by (pricing runs, in-effect, triage, coverage, the report, packets, diff, the pricing pages). Run under the lock: pnpm install --frozen-lockfile (or pnpm install if the lockfile changed), pnpm typecheck, pnpm lint, pnpm vitest run packages/synth, pnpm check:fixtures, the unit tests of the packages the base changed, and the db tests of the files the base changed plus rerun.db.test.ts, reruns-routes.db.test.ts, triage.db.test.ts, report.db.test.ts and coverage tests; and the mutation shards the base change and this PR affect together (tools/stryker/affected.ts --event pull_request --base <merge base with origin/claude/build-platform>; run the affected shards and the gate as lane-b.md says, or record that none is affected). Fix anything this PR's code needs after the merge (commit it).
${SAVE('merge-base2.md', 'the merge, each check, its result')}
Return: the merge commit SHA, what the base changed and how it touches this PR, each check with counts, any fix commits, and the final HEAD SHA.`, { label: 'merge-base2', phase: 'Merge base' })

return { fix, merge }
