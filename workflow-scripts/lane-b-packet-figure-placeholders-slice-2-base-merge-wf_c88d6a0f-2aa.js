export const meta = {
  name: 'lane-b-packet-figure-placeholders-slice-2-base-merge',
  description: 'PR #133: merge claude/build-platform ce95546d (#132) into the branch (rule 6), fast checks and touched tests, skeptic check, one push',
  phases: [{ title: 'Merge' }, { title: 'Check' }, { title: 'Push' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/c2e93384-1207-544a-bf87-57602f4a49c5/scratchpad'
const WT = '/home/user/pfp2'
const SESSION = 'https://claude.ai/code/session_01FcouKPkXdRW5ntz6ye92pL'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const BR = 'co-001/packet-figure-placeholders-2'
const WIP = 'co-001/wip-packet-figure-placeholders-2'
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; heavy commands under \`flock /tmp/laneb-heavy.lock\`; logs in ${SP}/pfp2/ (read tails). Never skip or weaken a test. No model name or identifier anywhere. Never force, never --no-verify; a gitleaks refusal is fixed by rewriting text, never .gitleaksignore. You MUST return the structured result.`
const CTX = `PaidWhole PR #133, worktree ${WT} on branch ${BR} at 7984faa8 (local; origin's branch is a851850d, the WIP ref 7984faa8). claude/build-platform moved from 8a722f80 to ce95546d (#132, co-001/ux-forms-after-42: web forms and screening wording). Overlapping files: apps/web/src/lib/packets/view.ts and view.test.ts (this branch adds mismatch cases for free_figure, number_word, unknown_fact, fact_not_canonical, fact_contradicted, fact_not_separated and FIGURE_KIND_TEXT 'fact'), docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts (this branch adds CAS-52..54).`
const merge = await agent(`${CTX}
In ${WT}: \`git fetch origin claude/build-platform\` and merge it with a merge commit (rule 6: keep both lanes' changes; never drop either side's wording, rows or cases; if #132 reworded a neighbouring mismatch text, keep its wording and add ours in the same voice). Then \`pnpm install --frozen-lockfile\`, regenerate derived files with the repo's tools (tsx tools/screening-capacity/watched.ts --write, pnpm synth --all) and commit any change. Fast checks: typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content, synth --all with no diff. Tests the merge touches: apps/web/src/lib/packets (vitest), packages/packets and packages/synth unit, tools/stryker unit; and, because #132 changed web files near this branch's, the web unit tests for apps/web/src/lib and components/packets. If a merged file is in a mutation shard this branch's mutation scope covers (view.ts is not packets), say so. Commit message for the merge: "Merge claude/build-platform (ce95546d: #132) into ${BR}", a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}". Do NOT push.
Keep ${SP}/progress/pfp2-basemerge.md up to date.
${RULES}`, { label: 'merge', phase: 'Merge', schema: { type: 'object', required: ['head', 'conflicts', 'checks'], properties: { head: { type: 'string' }, conflicts: { type: 'string' }, checks: { type: 'string' } } } })
const check = await agent(`${CTX}
Skeptic, read-only, in ${SP}/pfp2-basemerge-check (\`git clone -q ${WT} ...\` or fetch ${WT} ${BR}; check out ${merge?.head}). Merger's report: ${JSON.stringify(merge)}. Refute: is ce95546d a parent; does every overlapping file hold both parents' changes (diff each against both parents; every #132 change present, every branch change present); generated files equal their tools' output; no unrelated change slipped in; run the apps/web/src/lib/packets tests and the packets unit tests yourself. Return ok and problems.
Keep ${SP}/progress/pfp2-basemerge-check.md up to date.
${RULES}`, { label: 'merge-check', phase: 'Check', schema: { type: 'object', required: ['ok', 'problems'], properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } } } })
let push = null
if (check?.ok) push = await agent(`In ${WT}, check that origin/claude/build-platform (fetch it) is still an ancestor of HEAD (${merge?.head}); if it moved again, stop and return pushed=false with the new sha. Otherwise push: \`${GL} git -C ${WT} push -u origin ${BR}\` and \`${GL} git -C ${WT} push origin HEAD:refs/heads/${WIP}\` (fast-forward). Return the pushed sha.
${RULES}`, { label: 'push', phase: 'Push', schema: { type: 'object', required: ['pushed', 'sha', 'detail'], properties: { pushed: { type: 'boolean' }, sha: { type: 'string' }, detail: { type: 'string' } } } })
return { merge, check, push }
