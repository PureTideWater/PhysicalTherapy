export const meta = {
  name: 'lane-b-ux-forms-fix-3',
  description: '#74: the three polish problems the UX re-check found in the fix round (support rule repeated, hash in sans on the chosen line, Already sent in the failure colour), one local commit, then an independent check',
  phases: [{ title: 'Fix' }, { title: 'Verify' }],
}
// RESUMED 2026-10-28 00:20 UTC: the 5-hour limit stopped the fix agent (code and docs done, e2e mid-run) and the
// worker restarted; PostgreSQL restarted by the setup script. The agent continues from progress/fix3.md; the stale
// tp_e2e_fix3 database and /tmp/tp-e2e-tp_e2e_fix3-* are its own (drop and recreate them). Heavy commands under the lock.
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/ux-forms'
const COMMON = `Context: PaidWhole monorepo (CLAUDE.md applies). PR #74, branch co-001/ux-forms, worktree ${WT}, local head a57fbf5 (not pushed). "Forms keep what the person typed and name the refused field" (ADR 0077); design /home/user/ops/designs/lane-b-ux-forms.md. The UX re-check of the fix round (its full result: ${SP}/fix2-result.json, key ux.recheck.newProblems; the shots in ${SP}/screens-fixed/tiles, ${SP}/screens-after/tiles, ${SP}/screens-before/tiles) found three polish problems the fix round introduced.
Machine rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Heavy commands under "flock /tmp/laneb-heavy.lock <cmd>", one at a time. Never a foreground sleep. Pinned Chromium 1194 in /opt/pw-browsers; PostgreSQL 18 on 5433. Synthetic data only. No model identifier in any file. No #42 file. Wording within .claude/rules/brand.md, docs/brand/BRAND.md and CO-11. Never push, never force, never reset or stash.`

phase('Fix')
const fix = await agent(`${COMMON}

Fix the three problems, each the best way within the brand and ADR 0077:
1. /support repeats the no-patient-information rule three times (five when refused): the card's restored mail sentence, the Subject hint and the Message hint. Keep the rule reaching both the form and the mail route, said once where each reader meets it (for example: the card says it once for both, and the fields keep a short pointer or none; or the hints keep it and the card's mail sentence says it once for mail only, without "either" pointing at text that follows). Check the summary and inline error words on a refusal do not then say it a fourth time. Keep the mailto link's aria-describedby truthful. Update the e2e assertions in forms-keep-input.spec.ts that read these words, and design 10.2's /support rows and ADR 0077 if they quote them.
2. The chosen-text line under a select (field.tsx, showChosen) shows a SHA-256 prefix in sans where the page sets hashes in Plex Mono (p.submissions.error.390). Make the line set such text as the page does (for example let the caller pass the line's text pieces or a font class, or have the submissions page's Document options carry what the line needs), without guessing from the text.
3. "Already sent" (the duplicate state) uses the destructive Alert, its title in the failure colour, although an earlier press saved. Give it the notice kind the brand uses for a neutral or informational message (read BRAND.md's status and notice rules and packages/ui's Alert variants), in form-issues.tsx, export-status.tsx and action-form.tsx's RefusalFallback alike; keep role and focus behaviour as the design says for a refusal summary.
Add or update a test for each (browser harness, fields.test, e2e as fits). Then under the lock: pnpm typecheck, pnpm lint, pnpm lint:copy, the unit and browser tests touched, and forms-keep-input.spec.ts and packets.spec.ts (your own database name and port; the tree is dirty so the server builds itself; clean up). When everything passes, make ONE local commit in ${WT} (git status must show only your changes) with the message "Forms: the UX re-check's three polish fixes\\n\\n<one line each>\\n\\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\\nClaude-Session: https://claude.ai/code/session_01TAgFZo3SGSTBEfKRjX1jeG". ${SAVE('fix3.md', 'each problem, the fix, tests, the commit')}
Return: each problem's fix (file:line), the tests and checks with results, and the new head's short hash.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const verify = await agent(`${COMMON}

You are an independent verifier (edit nothing). The fixer's result:\n${fix}\nRead the new local commit (git -C ${WT} show HEAD) and check each of the three problems is fixed the way a person sees it (render the pages in the browser harness or read the markup the components produce; the e2e and unit results the fixer reports), with no regression: the /support page still tells both the form's reader and the mail's reader not to send patient information; the chosen-text line is still aria-hidden, below md only, and right after a refusal; "Already sent" still takes focus as the design says and is still announced. Run any targeted test under the lock if it settles a question.`, { label: 'verify', phase: 'Verify', schema: { type: 'object', properties: { ok: { type: 'boolean' }, items: { type: 'array', items: { type: 'object', properties: { problem: { type: 'string' }, fixed: { type: 'boolean' }, note: { type: 'string' } }, required: ['problem', 'fixed', 'note'] } }, regressions: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'items', 'regressions'] } })
return { fix, verify }
