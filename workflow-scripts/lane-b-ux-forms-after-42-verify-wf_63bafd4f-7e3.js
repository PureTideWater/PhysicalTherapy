export const meta = {
  name: 'lane-b-ux-forms-after-42-verify',
  description: 'PR #132 fresh-clone verification reading CI on bceda579, with a completeness critic',
  phases: [{ title: 'Verify' }, { title: 'Critic' }],
}
const HEAD = 'bceda5792ca5331ce2eb4eec8bf972c39e95205b'
const PROG = '/home/user/ops/approval-summaries/lane-b-ux-forms-after-42-wip/progress'
const COMMON = `Context: PaidWhole build, PureTideWater/PhysicalTherapy. PR #132 (draft, co-001/ux-forms-after-42 -> claude/build-platform at 8a722f80), head ${HEAD}: the screening upload form on the shared form core (method=post, no value in a URL, stale origin lead, noscript notice), the #42 pages' fields and words (ZIP, console, settings, correspondence), one separator rule for every refusal message with a guard test, users-page tables in ScrollTable with row controls naming their member, the shell's skip link (CI-30), ADR 0077 amended, BRAND.md line. Records: design /home/user/ops/designs/lane-b-ux-forms-after-42.md, status /home/user/ops/approval-summaries/lane-b-ux-forms-after-42-status.md, progress ${PROG}/ (review-*.md, fix-round.md, fix-check.md, fix-repair.md, shots.md). Budget is tight: read CI and the diff; re-run only what CI does not cover or what you doubt. Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH first; heavy commands under flock /tmp/laneb-heavy.lock; READ ONLY on the repository and GitHub (never push, comment, review, edit the PR, mark ready or merge; never write through the GitHub connector). CI: gh api repos/PureTideWater/PhysicalTherapy/commits/${HEAD}/check-runs, actions jobs and logs (gh api .../actions/jobs/<id>/logs). PR body: gh api repos/PureTideWater/PhysicalTherapy/pulls/132 --jq .body.`
const VER = { type: 'object', properties: { pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] }, fix: { type: 'string' } }, required: ['what', 'evidence', 'severity', 'fix'] } }, summary: { type: 'string' } }, required: ['pass', 'issues', 'summary'] }
phase('Verify')
const v = await agent(`${COMMON}

FRESH-CLONE VERIFICATION before merge; assume something is wrong until shown otherwise. Keep ${PROG}/verify.md up to date (continue from it if present).
1. git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/vx-ufa42; fetch co-001/ux-forms-after-42; head is ${HEAD}; origin/claude/build-platform is an ancestor.
2. CI on ${HEAD}: every check run success or skipped by design (say which and why); the required ones (all green, mutation, screening-capacity gate, approval-of-record) on this sha; read unit, db shards, e2e, mutation/gate and capacity logs; compare totals with the PR description and fix-round.md; any test skipped in CI but not locally; any warning hiding a failure.
3. The diff (git diff origin/claude/build-platform...${HEAD}): spot-check the PR description's claims and the changed-strings table against the code; no migration, no lockfile change, no PHI or real data, no model identifier, no .gitleaksignore; legal-surface words unchanged (docs/product/legal-surfaces.md markers); CI-30 consistent in test-matrix.md, matrix.ts, registry.ts, skip-link.spec.ts; nothing from the screening RESULT screens changed beyond the merged #131.
4. Independently, under the lock after pnpm install --frozen-lockfile: typecheck; vitest for apps/web components/screening, components/form-issues, lib/routes/messages.test.ts and the users-page row test; one probe of your own: render the upload form, refuse it, confirm typed values kept and focus on the summary or field, and confirm no field value in any URL (a quick browser-harness or unit run).
5. Remove the clone. pass = no blocking and no should.`, { label: 'verify', phase: 'Verify', schema: VER })
if (!v) throw new Error('verifier returned nothing; resume')
phase('Critic')
const c = await agent(`${COMMON}

COMPLETENESS CRITIC of this verification: what did it not check that the merge depends on (a required check, a log, a claim taken on trust, the up-to-date rule, open review threads, conflicts with open PRs #126 and #129, the brand reviewer's read of the fix round's new "JavaScript is off" title and the bceda579 wording)? Check each gap yourself, read only (fresh clone /home/user/cx-ufa42 if needed, removed after). Keep ${PROG}/verify-critic.md. Verification: ${JSON.stringify(v)}`, { label: 'critic', phase: 'Critic', schema: VER })
return { v, c }
