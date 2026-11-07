export const meta = {
  name: 'lane-b-ux-forms-after-42-build',
  description: 'ux-forms-after-42: design re-check, tour states and base shots, slices U/C/W1/W2 in parallel worktrees, E, integration with checks, adversarial slice checks with repair, head shots',
  phases: [
    { title: 'Recheck', detail: 'light design re-review and brand pre-check of the new words, skeptics, apply' },
    { title: 'Build', detail: 'U, C, W1, W2 in parallel worktrees; tour states and base shots alongside' },
    { title: 'Integrate', detail: 'merge slices, slice E, the scoped suite, WIP push' },
    { title: 'Check', detail: 'adversarial checkers per area plus a whole-diff adversary; repair loop' },
    { title: 'Shots', detail: 'head shots and galleries' },
  ],
}
const OPS = '/home/user/ops'
const WT = '/home/user/ux-forms-after-42'
const D = `${OPS}/designs/lane-b-ux-forms-after-42.md`
const PROG = `${OPS}/approval-summaries/lane-b-ux-forms-after-42-wip/progress`
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/ufa42'
const BASE = '31a7345fe07f0f8e5eb03084ad644db79f5c219a'
const WIP = 'co-001/wip-ux-forms-after-42'
const SESSION = 'https://claude.ai/code/session_01FcouKQJppM8BdCui7NVQUa'
const SAVE = f => `SAVE rule: keep ${PROG}/${f} up to date as you go (what is done, commits, evidence); if it exists when you start, an earlier run was interrupted: read it, check git status/log, and continue from it.`
const COMMON = `Context: PaidWhole build (CLAUDE.md is in your context). Lane B item ux-forms-after-42 (session S3). The design is ${D} (read it whole; section 6 slices, 2.x per file, 3 decisions, 5 rows and docs, 7 shots, 8 conflicts, 10 dispositions); the original design ${OPS}/designs/lane-b-ux-forms.md for the shared form core's rules. Base claude/build-platform ${BASE}. Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, builds, test:db, e2e, synth, the tour) ONLY under flock /tmp/laneb-heavy.lock, one hold per batch, long ones with run_in_background and polling. PostgreSQL 18 on 5433. Synthetic data only; no PHI or document text anywhere; never a value in a URL, log or error. Brand: .claude/rules/brand.md, docs/brand/BRAND.md, CO-11. Legal surfaces (docs/product/legal-surfaces.md) keep their words exactly. The test-matrix row for the skip link is the placeholder FRM-<1> until the orchestrator allocates it (check ${OPS}/approval-summaries/lane-b-ux-forms-after-42-status.md and LANES.md after git -C ${OPS} pull; if allocated, use it). Do not touch screening RESULT screen files (another session's 4b). No migration, no new dependency. Never force, never --no-verify, never amend or rebase a pushed commit, never a .gitleaksignore entry (rewrite flagged text); never write through the GitHub connector; never open, comment on, review, edit or merge a PR. No model name or identifier in any file or commit. Generated files only by their generators; the lockfile only by pnpm install. Tests fail first where behaviour changes (log red and green under ${SP}/logs/). Improve as you go inside the files you own; report anything else.`
const TAIL = `Commits: one concern each, in the repository's style, each message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['id', 'what', 'where', 'evidence', 'fix', 'severity'] } } }, required: ['findings'] }
const VERD = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, refinedFix: { type: 'string' } }, required: ['refuted', 'reason', 'refinedFix'] }
const skeptics = (f, ctx) => parallel([0, 1].map(k => () => agent(`${COMMON}

SKEPTIC ${k + 1} of 2: try to REFUTE this finding against the tree and the design; default refuted=true if it does not hold up. ${ctx}
Finding: ${JSON.stringify(f)}`, { label: `skeptic:${f.id}:${k}`, phase: 'Check', schema: VERD }))).then(vs => ({ f, vs: vs.filter(Boolean), keep: vs.filter(Boolean).some(v => !v.refuted) }))

phase('Recheck')
const rc = await agent(`${COMMON}

LIGHT RE-REVIEW of the applied design ${D} (sections changed by the apply step: compare with ${PROG}/apply.md), in the role of .claude/agents/ux-brand-reviewer.md for the new words: the screening's origin ("stale") lead, the read-failure line, the <noscript> line, screeningReasonMessage's clauses, and every exact new string in section 2. Also any inconsistency the apply step introduced. Read only. ${SAVE('recheck.md')}`, { label: 'recheck', phase: 'Recheck', schema: FIND })
const rcj = await parallel((rc?.findings || []).map(f => () => parallel([0, 1].map(k => () => agent(`${COMMON}

SKEPTIC ${k + 1} of 2 (design re-check): try to REFUTE; default refuted=true if unsure. Finding: ${JSON.stringify(f)}`, { label: `rc-skeptic:${f.id}:${k}`, phase: 'Recheck', schema: VERD }))).then(vs => ({ f, vs: vs.filter(Boolean), keep: vs.filter(Boolean).some(v => !v.refuted) }))))
const rkept = rcj.filter(j => j.keep)
if (rkept.length) await agent(`${COMMON}

Apply these confirmed re-check findings to ${D} (refined fixes included) and add them to section 10: ${JSON.stringify(rkept.map(k => ({ f: k.f, refined: k.vs.map(v => v.refinedFix) })))}. Refuted: ${JSON.stringify(rcj.filter(j => !j.keep).map(j => j.f.id))}. ${SAVE('recheck-apply.md')}`, { label: 'recheck-apply', phase: 'Recheck' })

phase('Build')
const SLICES = ['U', 'C', 'W1', 'W2']
const tour = agent(`${COMMON}

TOUR AND BASE SHOTS. (1) In ${OPS} (claude/build-ops; git pull --no-rebase origin claude/build-ops first) add the design section 7's new tour states to tools/lane-b-screen-tour/capture/tour.spec.ts (screening.loading's busy pattern, screening.error-unconfirmed, screening.no-javascript, screening-result.error-name.1280-dark, p.correspondence.error, console.mail default and resume, interaction:skip-link-focused on the three pages) following the file's conventions and README; states that only exist at the head must skip cleanly at the base. Commit and push claude/build-ops with: GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops (pull first; retry on a lock race; never force). (2) Take the BASE shots: tools/lane-b-screen-tour/README.md "From another lane": TOUR_REF=${BASE}, TOUR_DIR=${SP}/tour-base, TOUR_ONLY = section 7's ids, 1280 and 390 light, 1280 dark; then tile.py. Record each id captured or why not. Do not publish galleries. ${SAVE('tour-base.md')}
Return: the tour commit, the shot directory, ids captured and missing.`, { label: 'tour-base', phase: 'Build' })
const built = await parallel(SLICES.map(s => () => agent(`${COMMON}

BUILDER, slice ${s} (design section 6 and every section 2.x row marked ${s}). Own ONLY that slice's files. Work in your own worktree: git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform; git -C /home/user/PhysicalTherapy worktree add -b co-001/wip-ux-forms-after-42-${s.toLowerCase()} /home/user/ufa42-${s.toLowerCase()} ${BASE} (if it exists, continue in it); pnpm install --frozen-lockfile under the lock. Tests first (red at base, then green). ${s === 'W2' ? 'W2: write the guard test lib/routes/messages.test.ts against the base first (it fails listing every hit), make your edits; the guard will be finished after W1 lands (in integration), so leave it covering your files and note what W1 must satisfy.' : ''} After each commit run, under the lock, typecheck and the vitest projects/files you touched (db tests with the repo's db test command on 5433 where you changed a route). Push your branch to origin as co-001/wip-ux-forms-after-42-${s.toLowerCase()} (fast-forward only; the hook). ${SAVE('build-' + s + '.md')}
${TAIL}
Return: branch head sha, commits, tests red/green, anything you could not do and why, every string you changed (old -> new).`, { label: `build:${s}`, phase: 'Build' })))
if (built.some(b => !b)) throw new Error('a builder returned nothing; resume')

phase('Integrate')
const integ = await agent(`${COMMON}

INTEGRATOR. In ${WT} (branch co-001/ux-forms-after-42 at ${BASE}; clean): git fetch origin 'co-001/wip-ux-forms-after-42-*'; merge each slice branch u, c, w1, w2 with --no-ff (they are file-disjoint; resolve any overlap by the design). Then finish W2's guard test against W1's words (design 2.7), and build slice E (design section 6 E: e2e helpers, the specs, skip-link.spec.ts, test-matrix.md + matrix.ts + registry.ts word for word, ADR 0077 amendment, BRAND.md line; FRM-<1> or the allocated id). Then under the lock: typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all (0 written, git diff clean), verify-content, pnpm --filter @tp/synth test, tools/test/legal-surfaces.test.ts, pnpm test (full unit), pnpm test:db (four shards one after another, as lanes/lane-b.md says), the browser harness, then pnpm build, the stamp, and e2e with E2E_PREBUILT=1 --workers=2 for the specs section 6 step 3 names (and the whole e2e suite if time allows: say which). Also the design 8 re-send check (a db test: a second identical screening send after a dropped first creates one result and one result mail; if two mails, report it as a finding). Fix what fails (tests first). Push: git push origin HEAD:refs/heads/${WIP} (new ref; fast-forward afterwards). Do not push co-001/ux-forms-after-42. ${SAVE('integrate.md')}
${TAIL}
Slice reports: ${JSON.stringify(built)}
Return: WIP head sha, every check with totals and log path, findings.`, { label: 'integrate', phase: 'Integrate' })
if (!integ) throw new Error('integrator returned nothing; resume')

phase('Check')
const AREAS = [
  { id: 'K-U', what: 'slice U: the upload form on the shared core (method=post with no action, nothing in a URL, the file in memory only, focus and announcements, stale lead, read failure, no-JS, legal-surface marker word for word, the keep box, renderMessage), its tests failing first.' },
  { id: 'K-W', what: 'slices W1 and W2: every changed message (old vs new) against brand rules and the separator rule, nothing reworded that is a legal surface, the no-patient-information detector and its call sites unchanged, sign-in words only (no step, lock or outcome change), every test that pinned an old literal updated, the guard test real (fails on a violating string).' },
  { id: 'K-CE', what: 'slices C and E: Ticket hint and allowlist, users-page tables in ScrollTable and tables.test.ts, mail page select description, the skip link (first focusable, target, visible on focus, every shell page), e2e specs, test-matrix/matrix/registry word for word, ADR 0077 amendment and BRAND.md accuracy.' },
]
let report = String(integ)
let confirmed = []
for (let round = 1; round <= 2; round++) {
  const found = (await parallel(AREAS.map(a => () => agent(`${COMMON}

ADVERSARIAL CHECKER round ${round}, ${a.id}: ${a.what} Assume it is wrong until proved right. Work read-only in a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/ux42-${a.id}-${round}; fetch ${WIP}; its head; install under the lock; prove each finding with a command or a test. Remove the clone. Integration report: ${report} ${SAVE('check-' + a.id + '-' + round + '.md')}`, { label: `check:${a.id}:${round}`, phase: 'Check', schema: FIND })).concat([() => agent(`${COMMON}

WHOLE-DIFF ADVERSARY round ${round}: read git diff ${BASE}..origin/${WIP} whole (fresh read-only clone /home/user/ux42-whole-${round}, removed after). Hunt regressions, a form that loses typed input, a broken no-JS post, focus traps, a value reaching a URL/log, flaky tests, docs disagreeing with code, a file of another session's 4b touched. Integration report: ${report} ${SAVE('check-whole-' + round + '.md')}`, { label: `check:whole:${round}`, phase: 'Check', schema: FIND })]))).filter(Boolean).flatMap(r => r.findings)
  const judged = await parallel(found.map(f => () => skeptics(f, 'Branch ' + WIP + '.')))
  const real = judged.filter(j => j.keep)
  log(`check round ${round}: ${real.length} of ${found.length} survive`)
  confirmed.push(...real.map(j => j.f.id))
  if (!real.length) break
  report = await agent(`${COMMON}

REPAIR round ${round} in ${WT} at the WIP head (equal to origin/${WIP}): fix each confirmed finding (test first where behaviour), one commit per concern; re-run the affected checks under the lock; push fast-forward to ${WIP}. Findings with skeptics' refined fixes: ${JSON.stringify(real.map(j => ({ f: j.f, refined: j.vs.map(v => v.refinedFix) })))}. Refuted (leave): ${JSON.stringify(judged.filter(j => !j.keep).map(j => j.f.id))}. ${SAVE('repair-' + round + '.md')}
${TAIL}
Return: new WIP head, per finding the commit and evidence.`, { label: `repair:${round}`, phase: 'Check' })
}

phase('Shots')
const tb = await tour
const shots = await agent(`${COMMON}

HEAD SHOTS: the tour (README "From another lane") with TOUR_REF = the current head of origin/${WIP}, TOUR_DIR=${SP}/tour-head, the same TOUR_ONLY ids as the base run (${PROG}/tour-base.md; base dir ${SP}/tour-base), 1280 and 390 light, 1280 dark; tile.py. Then compare base vs head per id and write ${PROG}/shots.md: each id, base and head file paths, what visibly changed, anything unexpected (an unintended visual change is a finding: describe it). Base run report: ${JSON.stringify(tb)} ${SAVE('shots.md')}
Return: the head dir, ids captured, unexpected changes.`, { label: 'shots-head', phase: 'Shots' })
return { built, integ: String(integ).slice(0, 6000), confirmed, lastReport: String(report).slice(0, 4000), tour: tb, shots }
