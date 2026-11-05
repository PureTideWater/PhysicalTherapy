export const meta = {
  name: 'acting-s4-brand-settle',
  description: 'brand-settle: ADR 0056 amendment (rulings 1-4), BRAND.md section 4, --pw-unpriced darkened red first, unpriced text off Slate; shots, draft PR, one UX/brand review with skeptics, one fix round with the full suite, verification on CI',
  phases: [
    { title: 'Design', detail: 'measured token value and every Slate use' },
    { title: 'Build', detail: 'red first; docs; shots; draft PR' },
    { title: 'Review', detail: 'UX and brand; skeptics' },
    { title: 'Fix', detail: 'one fix round, full suite once, base merge, one push' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/brand'
const S7E = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7e'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/brand-settle'
const BR = 'co-001/brand-settle'
const DESIGN = '/home/user/ops/designs/lane-a-brand-settle.md'
const STATUS = '/home/user/ops/approval-summaries/lane-a-brand-settle-status.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}) on Lane A's account. Item: brand-settle. Branch ${BR} (local only so far), worktree ${WT} (base 370b8973, installed). Status and scope: ${STATUS} (read it first; it quotes the co-founder's four brand rulings of 2026-11-04 from /home/user/ops/approval-summaries/founder-asks-2026-10-27.md, "Brand rulings, 2026-11-04"; read that section too). Scope, exactly:
- ADR 0056 (docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md): replace its "Readings of the specification" paragraph with an amendment recording rulings 1 to 3 and ruling 4's ship rule (dark mode stays off until a dark-mode pass over every screen, PHI screens first; then it follows prefers-color-scheme with an override in settings; that pass is queued for Lane B, not built here). Cite the ruling's date and source. Follow the repo's ADR amendment convention (look at other ADRs with an amendment or "Amended" section).
- packages/brand BRAND.md section 4's wording: "Paper: report covers, print, and the light-theme sign-in", and fix any sentence in sections 3 and 7 that the amendment makes contradictory.
- --pw-unpriced (light: #7A8594 on --pw-unpriced-bg #F0F2F5, packages/brand/src/tokens.css, the single token source; check generated copies such as apps/web/src/app/brand.css or a tokens build and regenerate them only by their generator) darkened, same hue family, to AT LEAST 4.5:1 on --pw-unpriced-bg, with a small margin (target 4.6 to 5.0:1), while the unpriced chip's border stays distinct from the other status chips and from its own tint (at least 3:1 where the border is the only cue, otherwise visibly distinct; measure). Measure the dark-mode pair too and change it only if it fails. A contrast test that FAILS FIRST on the old value (reuse the repo's contrast tooling: search packages/brand, tools/brand-copy, apps/web e2e brand specs for an existing contrast or token-pair test, and extend it rather than add a new mechanism).
- The unpriced status TEXT takes --pw-unpriced instead of Slate wherever ADR 0056 (or the code's comments) chose Slate because of the low contrast. Find every such place (grep for unpriced in CSS, packages/ui/src, apps/web/src, apps/worker/src/report, and status chip components). Do not change any other status.
Read .claude/rules/brand.md and the ux-brand reviewer brief .claude/agents/ux-brand-reviewer.md. This is display only: no number, no stage, no PHI, no schema. The screen tour is /home/user/ops/tools/lane-b-screen-tour/README.md ("From another lane"); an earlier tour setup is in ${S7E}/tour-delta (reuse it). Screens to shoot: every screen that shows the unpriced status (the priced-lines list or run detail with unpriced lines, the chip legend, any report page that shows it) plus /sign-in, at 1280 and 390 light, and 1280 dark.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Database: postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18.4, as CI). Heavy commands (install, tests, e2e, the tour, build) under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators (brand baselines by their own update command). Never edit LANES.md, lanes/*.md or HANDOFF.md. No model identifier and no PHI in any text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__create_pull_request / update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it. Do not return until your task is complete; never return with a background job still running.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Design')
const design = await agent(`${COMMON}

DESIGN ${DESIGN} (new file; do not commit). 1) The candidate --pw-unpriced values: keep the hue and saturation of #7A8594 in HSL (or OKLCH) and lower lightness in steps; show the WCAG relative-luminance arithmetic for each against #F0F2F5 and against the white/Paper grounds the chip can sit on; pick the lightest that gives 4.6 to 5.0:1. 2) Check the chip border: what is it made of (border token, the text color, a mix?), its ratio against the tint and the page ground before and after, and its distinctness from the other status chips (list each status's text/tint/border and ratios). 3) The dark pair's ratio. 4) Every place the unpriced status text uses Slate (or another stand-in) because of the low contrast: file:line, with the ADR or comment that chose it. 5) The existing contrast tooling and exactly which test to extend so it fails on #7A8594. 6) The ADR amendment's and BRAND.md's exact new text (draft it here). 7) The shots list and the risks (brand baselines that will change and their update command).
${SAVE('design.progress.md', 'measurements and decision')}
Return the decision, the ratio tables, the drafted text and the plan.`, { label: 'design', phase: 'Design' })

phase('Build')
const build = await agent(`${COMMON}

BUILD from the design (${DESIGN}):
${design}
1. Take BEFORE shots on the base tree (a separate checkout at ${SP}/base, or ${WT} before your first commit) into ${SP}/shots-before/ with INDEX.md (state, width, theme, file).
2. Failing-first: commit the extended contrast test, run it red on the old value for the stated reason (log in ${SP}/logs/), then commit the token change and run it green. Then the Slate-to-unpriced text change (its own commit), then the ADR 0056 amendment and BRAND.md (their own commits).
3. Run under the lock: typecheck; lint; lint:copy; the brand tests and any token build check; verify-content; the e2e brand specs as CI runs them (regenerate brand baselines only by the repo's own command and only where the design says they change; commit them separately).
4. Take AFTER shots of the same states into ${SP}/shots-after/ with INDEX.md.
5. Push: git push -u origin ${BR}. Open a DRAFT PR, head ${BR}, base claude/build-platform, title "Brand: settle the sign-in ground, BRAND.md section 4 and the unpriced color (the co-founder's rulings of 2026-11-04)". Write the description from ${WT}/.github/pull_request_template.md, every section included: the rulings, the ratio tables, the red-then-green evidence, the files, the before and after shot indexes, and what is not changed (dark mode stays off; no other status; no numbers). Read it back and compare; restore the footer once if it was rewritten.
${SAVE('build.progress.md', 'each step, head and PR number')}
Return the PR number, the head, the red/green evidence, the checks and both shot indexes.`, { label: 'build', phase: 'Build' })

phase('Review')
const review = await agent(`${COMMON}

You are the UX AND BRAND ADVERSARIAL REVIEWER of the PR (${build}). First read ${WT}/.claude/agents/ux-brand-reviewer.md and follow it as your brief. Compare ${SP}/shots-before/ with ${SP}/shots-after/, screen by screen, LOOKING at each PNG (Read them). Read the diff (git -C ${WT} diff origin/claude/build-platform...HEAD), read only. Recompute the key ratios yourself. Check: the unpriced text and chip in every place it appears; that no other status moved; the chip border's distinctness; that the ADR amendment and BRAND.md say exactly what the rulings say (no more, no less) and are consistent with sections 3 and 7; ruling 4 is recorded as a ship rule only; brand.md. Findings B/S/N; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE('review.progress.md', 'findings')}`, { label: 'review:ux-brand', phase: 'Review', schema: FINDINGS })
const all = review ? review.findings : []
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this UX/brand finding on the PR (${build}). It is real only if you confirm it from the shots, the rulings and the code. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Fix')
const fix = review ? await agent(`${COMMON}

The FIX ROUND for the PR (${build}). Confirmed findings (nits included; apply each nit that is cheap and right, record the rest with a reason): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, why: f.verdict && f.verdict.reason })))}
1. Apply the confirmed findings in small commits, red then green where testable. Re-shoot any state that changed into ${SP}/shots-after/.
2. Merge the base ONCE: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines); skip it only when FETCH_HEAD is already contained in HEAD.
3. Run the FULL local suite once on that final tree, under the lock, with each step's result in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then the db project in 4 shards (pnpm exec vitest run --project db --shard=i/4); synth --all and tools/screening-capacity/watched.ts --write (tree clean after); actions:check; build and the stamp (apps/web scripts/build-stamp.ts --write <head>); test:e2e whole with E2E_PREBUILT=1 E2E_DATABASE=tp_brand_e2e E2E_PORT=3143 E2E_ADMIN_URL=<db url> --workers=2. A failure you can tie to this change: fix and re-run that step. A failure you cannot (a known flake): re-run that step once and record both.
4. Push once.
5. Update the description: the review's findings with dispositions, the suite results and the head. Read it back.
6. Write /home/user/ops/approval-summaries/lane-a-brand-settle-{review,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step')}
Return the head, the base merged, the dispositions, the suite results and the readback.`, { label: 'fix', phase: 'Fix' }) : 'review returned nothing: NOT RUN'

phase('Verify')
const ver = review ? await agent(`${COMMON}

VERIFIER of the PR. Fix round: ${fix}
1. git ls-remote: the head is as reported and the base tip is still the merged base (otherwise write "RE-MERGE NEEDED" and the new base).
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks, for up to 90 minutes. The required checks (all green, mutation, screening-capacity gate, approval-of-record) must all be success. List every run.
3. Fresh clone at the head into ${SP}/verify-clone: install under the lock; the brand and contrast tests; git diff --stat against the merge base (tokens, CSS, tests, docs and brand baselines only). Remove the clone afterwards.
4. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-brand-settle-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' }) : 'NOT RUN'
return { design, build, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fix, ver }
