export const meta = {
  name: 'lane-b-superseded-rerun-verify2',
  description: 'PR #50 final: fresh-clone verification reading CI on ed85bcf; screens at 390/320 px with a UX confirm',
  phases: [{ title: 'Verify' }, { title: 'Screens' }, { title: 'UX confirm' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const HEAD = 'ed85bcf3df838e88561500446855d3f15ca5f83b'
const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    ci: { type: 'string', description: 'each CI check and its conclusion, and the runner totals of unit, db and e2e jobs' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      file: { type: 'string' }, title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'title', 'evidence', 'fix'] } },
  },
  required: ['verdict', 'summary', 'findings'],
}
const COMMON = `Lane B PR #50, PureTideWater/PhysicalTherapy, "A superseded re-run cannot be accepted (combined audit #10)", branch co-001/superseded-rerun, head ${HEAD} (the second fix round 170e8be plus a clean merge of claude/build-platform 7ef421b). Earlier commits: 961783a (build), 81b7b0c (fix round), a3c583d and ed85bcf (base merges). Records on claude/build-ops (/home/user/ops): designs/lane-b-superseded-rerun.md, approval-summaries/lane-b-superseded-rerun-{review-findings,fix-round,status}.md; the second fix round's notes ${SP}/progress/fix2.md and merge notes ${SP}/progress/merge-base2.md. Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; heavy commands one at a time under flock /tmp/laneb-heavy.lock; change nothing in /home/user/superseded-rerun; commit and push nothing; synthetic data only; never a foreground sleep (wait with a background loop or the Monitor tool).`

phase('Verify')
const freshP = agent(`${COMMON}

YOU ARE THE FRESH-CLONE VERIFICATION (lane-b.md "Merging" step 4: one agent in a fresh clone, reading CI). An earlier attempt was stopped by the account limit; if ${SP}/progress/verify-fresh.md or ${SP}/verify-clone exist from it, they were for a3c583d: start over for ${HEAD} (remove ${SP}/verify-clone and clone again).
1. git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/verify-clone2 && git -C ${SP}/verify-clone2 checkout ${HEAD}. Under the lock: pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm vitest run packages/synth; vitest --project unit on apps/worker/src/price and apps/web/src/components; and on a fresh database of your own on PG18 port 5433 (pnpm db:migrate as the db project expects; drop it after): apps/worker/src/price/rerun.db.test.ts, apps/web/src/lib/routes/reruns-routes.db.test.ts. The engine freeze: git diff --stat 7ef421b ${HEAD} -- packages/pricing/src ':!**/*.test.ts' empty. This PR's own changes (git diff --name-only 7ef421b ${HEAD}): nothing under packages/db/migrations; no file of PR #42 (/tmp/claude-0/pr42-files.txt) except docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts; no model identifier (grep -iE 'claude|opus|sonnet|haiku|anthropic' over git diff 7ef421b ${HEAD}, judging each hit).
2. Records against code: spot-check every disposition in the fix-round summary and fix2.md at ${HEAD}; PRC-25..PRC-28 identical in test-matrix.md and matrix.ts, and each row's assertedBy files assert it; ADR 0037's amendment matches the code (reason codes, messages, lock, rule, held-by bound).
3. CI on ${HEAD}: wait until every check run completes (gh api repos/PureTideWater/PhysicalTherapy/commits/${HEAD}/check-runs?per_page=100), report each conclusion; read runner totals of unit, db (1/4..4/4) and e2e (1/2, 2/2) with the GitHub MCP get_job_logs (ToolSearch "select:mcp__github__get_job_logs"; return_content true; large tail_lines). If a check fails, root-cause it; if it is the known screening e2e flake (/home/user/ops/LANES.md "Handed to Lane A"), say so with evidence.
${SAVE('verify-fresh2.md', 'each step, its result and counts, each CI check as it completes')}
Return verdict pass only if every local check passes, the records match, and CI on ${HEAD} is all green.`, { label: 'verify-fresh-clone2', phase: 'Verify', schema: FINDINGS })

phase('Screens')
const screens = await agent(`${COMMON}

Re-take the AFTER screenshots on ${HEAD} as ${SP}/progress/screens-after2.md did (same tool /home/user/ops/tools/lane-b-screen-tour, same spec /home/user/ops/designs/lane-b-superseded-rerun/capture/superseded.spec.ts with the changes recorded in ${SP}/screens-after2/spec-changes.diff; heavy lock for build and serve; stop file; server-stopped check; cleanup), TOUR_DIR=${SP}/screens-after3, TOUR_REF=${HEAD}. Add, in your copy of the spec only (and record it in ${SP}/screens-after3/spec-changes.diff; then copy the final spec to /home/user/ops/designs/lane-b-superseded-rerun/capture/superseded.spec.ts so later tours reuse it, keeping it runnable on the base): (a) a 320 px shot of each state that shows the "Re-run the run in effect under release N" button (shots 21-22, 33-34, 35-36 states); (b) if reachable through the product, a state whose acceptance diff has at least one changed line (e.g. a mapping correction after the re-run's original was priced, then a new re-run accepted against it — read the spec and pricing.spec.ts for how), at 1280, 390 and 320 px. Write shots.json with the same names as screens-after2 plus the new ones.
${SAVE('screens-after3.md', 'each step, each run with its result, the lock and server state')}
Return the shot list and any problem.`, { label: 'screens-after3', phase: 'Screens' })

phase('UX confirm')
const ux = await agent(`${COMMON}

YOU CONFIRM THE SECOND FIX ROUND'S UX CHANGES. The UX re-check's findings N1 (should-fix: the Re-run button overflowing at 390 px) and N2..N6 (nits) are in the 'ux-recheck' result of /root/.claude/projects/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/subagents/workflows/wf_f83c3757-009/journal.jsonl; the fixer's dispositions are in ${SP}/progress/fix2.md. Screens: previous ${SP}/screens-after2/png; new ${SP}/screens-after3/png (shots.json; the capture agent reported: ${typeof screens === 'string' ? screens : JSON.stringify(screens)}). View them with Read. For each of N1..N6: fixed or not, with the shot names (N1 at 390 and 320 px; N2 and N3 on a changed-line diff if captured, else from the code and unit tests). Then a fresh look at the new screens against .claude/rules/brand.md, the copy rules and WCAG 2.1 AA (reflow at 320 px, focus, names): anything new that is wrong.
${SAVE('ux-confirm.md', 'each finding checked and each new one, with shot names')}
Return verdict pass if nothing blocking or should-fix remains.`, { label: 'ux-confirm', phase: 'UX confirm', schema: FINDINGS })

const fresh = await freshP
return { fresh, screens, ux }
