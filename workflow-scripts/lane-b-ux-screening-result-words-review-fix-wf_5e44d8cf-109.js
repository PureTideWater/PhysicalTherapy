export const meta = {
  name: 'lane-b-ux-screening-result-words-review-fix',
  description: 'UX PR 4b (#131): before/after shots, the one UX and brand review, each finding put to three skeptics, the fix round, the full local suite once',
  phases: [
    { title: 'Shots', detail: 'before at the base, after at the head' },
    { title: 'Review', detail: 'the UX and brand reviewer, words and tones lens' },
    { title: 'Verify', detail: 'three skeptics per finding' },
    { title: 'Fix', detail: 'confirmed findings, re-shot what changes' },
    { title: 'Suite', detail: 'the full local suite once on the final tree' },
  ],
}
const SP = args.SP
const WT = '/home/user/ux-screening-result-words'
const OPS = '/home/user/ops'
const BASE = '31a7345fe07f0f8e5eb03084ad644db79f5c219a'
const HEAD = args.HEAD
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const TRAILER = `Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKRDfoFAeXZK4Thp8M8`
const CTX = `UX PR 4b, pull request #131 (PureTideWater/PhysicalTherapy, branch co-001/ux-screening-result-words, worktree ${WT}, base ${BASE}, head ${HEAD}): the screening result's words and tones. Its description: gh api repos/PureTideWater/PhysicalTherapy/pulls/131 --jq .body. Spec: ${OPS}/designs/lane-b-ux-screening-result-tables.md section 11 (with 3.4, 3.9, 7.1, 7.2 and 12). The build's plan and notes: ${SP}/progress/4b-plan.md, 4b-build.md, 4b-check.md.`
const RULES = `Rules:
- Never touch /home/user/PhysicalTherapy or ${OPS} files (read only); never push; never rebase, reset, amend, stash or force. Synthetic data only; PNGs and tiles never go on a branch. No model name or identifier in any file or commit. A gitleaks refusal is fixed by rewriting the flagged text, never a .gitleaksignore entry.
- No migration; nothing under packages/db, pricing, ledger, money. Shared files (test-matrix, synth matrix and registry): TBL-08 only. Generated files only by their generators.
- Words within .claude/rules/brand.md, BRAND.md, CO-11 and the screening's copy rules (never owed, underpaid or recovered; no finding about a payer). Tokens only; money figures in mono with tabular numerals.
- Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Every heavy command only under flock /tmp/laneb-heavy.lock. Long commands with run_in_background and Monitor, never a foreground sleep. If PostgreSQL on 5433 is down, bash /tmp/setup-container.sh.`
const RESULT = { type: 'object', properties: { head: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } }, checks: { type: 'array', items: { type: 'string' } }, problems: { type: 'array', items: { type: 'string' } }, proposals: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['head', 'commits', 'checks', 'problems', 'proposals', 'summary'] }
const FINDINGS = { type: 'object', properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, shots: { type: 'array', items: { type: 'string' } }, claim: { type: 'string' }, scenario: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'shots', 'claim', 'scenario', 'fix'] } }, calls: { type: 'array', items: { type: 'string' }, description: 'the description\'s "calls for the UX and brand review to confirm": each confirmed or overruled, with the words to use' }, checked: { type: 'array', items: { type: 'string' } }, notSeen: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['verdict', 'findings', 'calls', 'checked', 'notSeen', 'summary'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }

phase('Shots')
const shots = await agent(`You take PR #131's before and after shots. ${CTX}
${RULES}
${SAVE('4b-shots.md', 'each run and step done, shot ids taken')}
1. Read ${OPS}/tools/lane-b-screen-tour/README.md ("From another lane", "Set-up and a run"). Two runs, one after the other under the lock: before (TOUR_DIR=${SP}/4b-shots-before, TOUR_REF=${BASE}) and after (TOUR_DIR=${SP}/4b-shots-after, TOUR_REF=${HEAD}; a pushed commit). TOUR_ONLY='screening-result.*,screening.*'.
2. The capture spec and harness from #83 are archived at ${OPS}/approval-summaries/lane-b-ux-screening-result-tables-wip/capture/ (lane-b-ux-screening-result-tables-capture.spec.ts, screening-result-harness.mts): copy them to ${SP}/4b-capture/ and extend them to the states the description's "Reviewer agents' findings" list names: one anomaly at 1280, 390, 1280-dark and 390-dark; no anomaly at 1280 and 390; the several-anomalies harness page at 1280, 390, 1280-dark; the others harness page (later page, the last entry) and the one-other harness page at 390 and 1280; band.820; top-rows-scrolled.390 and top-rows-tab-focus.1280; the summary card (an element shot) at 1280 and 390; /screening at 1280 and 390 (tour). Run the same spec on both sides (the harness renders each ref's own components). Element shots of a chip with its $5 at 2x device scale on both sides (for the mono face). Synthetic data only.
3. Each run: check the lock and the server ended together; clean up the tour database. Tile both: /usr/bin/python3 -I ${OPS}/tools/lane-b-screen-tour/tile.py <TOUR_DIR> screening-result screening.
4. Write ${SP}/4b-shots-index.md: each shot id, both sides, what it shows. Return in checks the shot ids per side, problems for anything not taken (and why).`, { label: '4b-shots', phase: 'Shots', schema: RESULT })

phase('Review')
const review = await agent(`You are the one adversarial review of PR #131: the UX and brand review. Act exactly as .claude/agents/ux-brand-reviewer.md (read it in ${WT}) says, with design 7.2's lens narrowed to the words and tones (read 7.1 and 7.2), plus: Lane A's three conditions of design 12.1 and the labels re-pin (the VERSIONS comment's exact rule words; every changed string named); the description's "Departures and calls for the UX and brand review to confirm" — rule on each (confirm, or overrule with the words to use); whether the PR description's claims match the screen. Read-only: change no file. ${CTX}
${RULES}
${SAVE('4b-review.md', 'each check and finding as you go')}
The shots: ${SP}/4b-shots-index.md, tiles under ${SP}/4b-shots-before/tiles and ${SP}/4b-shots-after/tiles (index.json each). Shots result: ${JSON.stringify(shots && { checks: shots.checks, problems: shots.problems })}.
Review the diff git -C ${WT} diff ${BASE}...${HEAD} (only what this PR changes; #83 already passed a UX review, so do not re-review what it did). Report each finding with severity, file:line, the shot ids that show it, a concrete scenario and a fix. Return none rather than a speculative one.`, { label: '4b-review', phase: 'Review', schema: FINDINGS, agentType: 'ux-brand-reviewer' })
if (!review) return { shots, stopped: 'review failed' }

phase('Verify')
const LENS = ['Does it actually show on the screen or in the code as written (cite the shot tile or file:line)?', 'Is it a real defect under .claude/rules/brand.md, BRAND.md, CO-11, WCAG 2.2 AA or the design, rather than a recorded decision (design section 12, the PR description) or a preference?', 'Is the proposed fix right, small, and safe for the pins (result.test.tsx, the specs, labels.test.ts) and the rules (no migration, shared files TBL-08 only)?']
const verified = await Promise.all(review.findings.map(f => Promise.all(LENS.map((lens, i) => agent(`Adversarially check one finding of PR #131's UX and brand review. Try to REFUTE it; default to real=false if you cannot show it holds. Read-only. ${CTX}
Shots index: ${SP}/4b-shots-index.md (tiles under ${SP}/4b-shots-before/tiles and ${SP}/4b-shots-after/tiles). Lens: ${lens}
Finding: ${JSON.stringify(f)}`, { label: `4b-verify:${f.id}:${i}`, phase: 'Verify', schema: VERDICT })))
  .then(vs => ({ ...f, votes: vs.filter(Boolean), confirmed: vs.filter(Boolean).filter(v => v.real).length >= 2 }))))
const confirmed = verified.filter(f => f.confirmed)
log(`review findings ${review.findings.length}; confirmed ${confirmed.length}; calls ${review.calls.length}`)

phase('Fix')
let fix = null
if (confirmed.length || review.calls.some(c => /overrul/i.test(c))) {
  fix = await agent(`You run PR #131's fix round in ${WT} (head ${HEAD}). ${CTX}
${RULES}
${SAVE('4b-fix.md', 'each item done and checks re-run')}
Fix each confirmed finding at its root, smallest correct change, with its test first where behaviour or words change:
${confirmed.map((f, i) => `${i + 1}. ${f.id} (${f.severity}) ${f.file}:${f.line}: ${f.claim} Fix: ${f.fix}`).join('\n')}
Apply the reviewer's rulings on the description's calls where it overruled one: ${JSON.stringify(review.calls)}
If a label string changes, re-pin labels.test.ts's hash under screening-labels/2026-11-05 and keep the VERSIONS comment naming every changed string; TBL-08, matrix.ts and the synth fixture follow (pnpm synth --all). Then, under the lock, the fast checks on what you touched: typecheck, lint on changed files, lint:copy, the affected unit files; watched.ts --write if imports changed. Re-take, with ${SP}/4b-capture's spec, the after shots whose state a fix changes (into ${SP}/4b-shots-after, ids suffixed .fix), tile them, and state per finding whether the shot shows it fixed (shot ids) in ${SP}/4b-shots-index.md. Commit by theme naming the ids. git status --porcelain empty at the end. ${TRAILER}`, { label: '4b-fix', phase: 'Fix', schema: RESULT })
}

phase('Suite')
const suite = await agent(`You run the full local suite ONCE on PR #131's final tree (worktree ${WT}; git rev-parse HEAD). ${CTX}
${RULES}
${SAVE('4b-suite.md', 'each command, its result and counts')}
Each command under flock /tmp/laneb-heavy.lock, in the order and with the commands of ${OPS}/approval-summaries/lane-b-ux-screening-result-tables-finish-suite.md (read it): install --frozen-lockfile; check:fixtures; typecheck; lint; lint:copy; lint:logs; verify-content; the engine-freeze check against ${BASE}; synth --all then git diff --exit-code and an empty porcelain; pnpm test (files, passed, skipped); test:golden; test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3); db:migrate on a fresh database (drop it after); test:db in 4 shards one after another (file total equal to vitest list --project db); build; build-stamp --write on the head; e2e with E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_4b E2E_PORT=3185 in two shards (known flake: screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87, re-run that spec once and record both); tools/stryker/affected.ts --event pull_request --base ${BASE} then the gate. A seed-dependent failure in packages/model-gateway's redaction property tests (MOD-13, MOD-16) is a known base defect when the diff does not touch model-gateway: record its seed and test, re-run that file once, and do not count it as this PR's. Fix any failure the diff causes at its root in a new commit (${TRAILER}) and re-run what it touches. Write ${SP}/4b-suite.md as a table (command, result, counts, time) with the head. Drop the e2e databases you made.`, { label: '4b-suite', phase: 'Suite', schema: RESULT })
return { shots: shots && { checks: shots.checks, problems: shots.problems }, review: { verdict: review.verdict, calls: review.calls, notSeen: review.notSeen, summary: review.summary }, verified, fix, suite }