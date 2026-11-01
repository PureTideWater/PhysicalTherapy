export const meta = {
  name: 'lane-b-ux-screening-result-tables-finish',
  description: 'PR #83 finish: base merge with generators, then the full suite, the #42 cross-check, a review of the unreviewed fix-round delta, and after-only shots of what the fixes changed; then fixes',
  phases: [
    { title: 'Merge', detail: 'merge claude/build-platform, keep both sides, generators, quick checks' },
    { title: 'Check', detail: 'suite, #42 cross-check, fix-delta review + adversarial verify, targeted shots + UX verdict' },
    { title: 'Fix', detail: 'only if something confirmed; re-run what it touches' },
  ],
}
const SP = args.SP
const WT = '/home/user/ux-screening-result-tables'
const OPS = '/home/user/ops'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const TRAILER = `Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKRDfoFAeXZK4Thp8M8`
const RULES = `Context: PaidWhole pull request #83 (PureTideWater/PhysicalTherapy, branch co-001/ux-screening-result-tables, worktree ${WT}): the public screening result reads on a phone, and its rows say what they are. The PR on origin is at f4a97668; the worktree holds the fix round on top (f5e0ceba: c0a8fe0b merges #81; d0152f43 UXR-01; e901e477 UXR-05; 857ca333 P4-RC-01, -04, -06, UXR-02, -03, -04; f5e0ceba P4-RC-02, -03, -05, UXR-06), never checked until now. The design: ${OPS}/designs/lane-b-ux-screening-result-tables.md (section 12 wins). Every review finding, with file:line, scenario and fix: ${SP}/findings.json (.correctness.findings P4-RC-01..06, .ux_and_brand.findings UXR-01..08; .shots describes the 2026-10-28 shots, whose files are lost). The fix decisions the old fix round implemented are in ${OPS}/workflow-scripts/lane-b-ux-screening-result-tables-fix-wf_4147d4ff-acd.js step 2.
Rules:
- Never touch /home/user/PhysicalTherapy or ${OPS} files (read only); never push; never rebase, reset, stash, amend or force.
- Never edit a file in PR #42's list (${SP}/pr42-files.txt, at be63bdc2) or LANES.md's "Not while #42 is open" list (apps/web/src/lib/screening/* among them), except rows in docs/product/test-matrix.md and packages/synth/src/cases/{matrix,registry}.ts, and tools/screening-capacity/watched-paths.txt written only by its generator. components/screening/result.test.tsx, lib/screening/labels.ts, e2e/screening.ts and e2e/screening.spec.ts stay untouched, and every pin in result.test.tsx must keep passing.
- No migration; nothing under packages/db, pricing, ledger or money. Synthetic data only. No model name or identifier in any file or commit.
- Words within .claude/rules/brand.md, CO-11 and the screening's copy rules (never owed, underpaid or recovered; no finding about a payer).
- Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Every heavy command (install, typecheck, lint, test runs, build, e2e, tour build/serve) only under flock /tmp/laneb-heavy.lock, one at a time; other agents share the lock. Long commands with run_in_background and Monitor, never a foreground sleep.
- If PostgreSQL on 5433 is down, bash /tmp/setup-container.sh.`
const RESULT = { type: 'object', properties: { head: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } }, checks: { type: 'array', items: { type: 'string' }, description: 'command: result, counts' }, problems: { type: 'array', items: { type: 'string' } }, proposals: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['head', 'commits', 'checks', 'problems', 'proposals', 'summary'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, claim: { type: 'string' }, scenario: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'claim', 'scenario', 'fix'] } }, perFinding: { type: 'array', items: { type: 'string' }, description: 'for each original finding id this lens covers: fixed / partly / not, with file:line' }, summary: { type: 'string' } }, required: ['findings', 'perFinding', 'summary'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }

phase('Merge')
const merge = await agent(`You run PR #83's base merge. ${RULES}
${SAVE('p4-finish-merge.md', 'each step done, conflicts and how resolved, check results')}
1. In ${WT}: confirm HEAD is f5e0ceba2a5213ef8f206bcfef0e142da3a61a3e (or a descendant your earlier interrupted run made; then continue). git fetch -q origin claude/build-platform (bce57f16 or later: it now holds #78 83d71fd6 and #82). git merge --no-ff origin/claude/build-platform -m "Merge claude/build-platform (#78, #82) into co-001/ux-screening-result-tables" plus the trailer (name the PRs the merge actually brings in, from git log --merges --first-parent of the base since the merge base).
2. Conflicts (expected: docs/product/test-matrix.md and packages/synth/src/cases/registry.ts; maybe matrix.ts, watched-paths.txt, pnpm-lock.yaml): keep BOTH sides' rows (LANES.md rule 6), in each file's order; this PR's TBL-05..08 and its rewording of TBL-01, -03, -04 stay; the base's new rows stay. matrix.ts must match the test matrix byte for byte as tools require. Generated files are never hand-merged: take the base's version, then regenerate.
3. Generators under the lock: pnpm install --frozen-lockfile; pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm synth --all. Commit their output in the merge commit if still merging, otherwise a follow-up commit named for the generator. git status --porcelain must be empty.
4. Quick checks under the lock (the full suite runs after you, so do only these): pnpm typecheck; pnpm lint:copy; the web unit files result.test.tsx (unedited vs origin/claude/build-platform and passing), result-tables.test.tsx, stacked-rows.test.tsx, words.test.ts, tables.test.ts; tools/screening-capacity watched.test.ts; pnpm verify-content. Fix a failure the merge causes at its root in a new commit. ${TRAILER}
Return head (full sha), commits, checks with counts.`, { label: 'p4-merge', phase: 'Merge', schema: RESULT })
if (!merge || !merge.head) return { merge, stopped: 'merge failed' }
const HEAD = merge.head
log(`merged head ${HEAD.slice(0, 8)}`)

phase('Check')
const suiteP = agent(`You run the full local suite once on PR #83's merged head ${HEAD} (worktree ${WT}). ${RULES}
${SAVE('p4-finish-suite.md', 'each command, its result and counts')}
Each command under flock /tmp/laneb-heavy.lock, in the order and with the exact commands of ${OPS}/approval-summaries/lane-b-ux-table-scroll-fix-suite.md (read it), except: test:db in 4 shards (--shard=i/4), one after another on PG18 at 5433, and check the file total against \`pnpm exec vitest list --project db\` (files); e2e with E2E_DATABASE=tp_e2e_pr83 E2E_PORT=3183 (other agents use other ports). Steps: install --frozen-lockfile (if tools/test/workflows.test.ts later fails only on an old playwright-core in node_modules/.pnpm, pnpm install --frozen-lockfile --config.modules-cache-max-age=0); check:fixtures; typecheck; lint; lint:copy; lint:logs; verify-content; the engine-freeze check against the merge base with origin/claude/build-platform; synth --all then git diff --exit-code and an empty porcelain; pnpm test (files, passed, skipped); test:golden; test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3); db:migrate on a fresh database (drop it after); test:db shards; build; build-stamp --write on the head; e2e with E2E_PREBUILT=1 in two shards (a failure only in screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87 is the known flake: re-run that spec once and record both); tools/stryker/affected.ts --event pull_request --base <merge base> then the gate. Fix any failure the diff causes at its root in a new commit and re-run what it touches (if you commit, the stamp and what it covers re-run). ${TRAILER}
Write ${SP}/p4-finish-suite.md in the form of that earlier suite file (head, a table: command, result, counts, time). Drop the e2e databases you made.`, { label: 'p4-suite', phase: 'Check', schema: RESULT })

const crossP = agent(`You run the #42 cross-check for PR #83, READ-ONLY: nothing you do is committed to ${WT} or pushed. ${RULES}
${SAVE('p4-finish-cross42.md', 'each step and result')}
1. git -C ${WT} worktree add --detach ${SP}/cross42 ${HEAD}; in it: git fetch -q origin co-001/pr-06b-mail-streams; git merge --no-edit FETCH_HEAD (be63bdc2 or later; record the sha). If it conflicts, record the files and stop (that is the result).
2. Under the lock: pnpm install --frozen-lockfile (#42 changes the lockfile); the whole web unit project (pnpm exec vitest run --project web, or as apps/web's config names it; files, passed, failed). UXR-05 changed counted(), which every screen uses: any failure is a #42 pin this PR breaks — name the test, file:line, expected vs received, and which #83 commit causes it.
3. Under the lock: build the web app, then run apps/web e2e screening.spec.ts and screening-phone.spec.ts with E2E_DATABASE=tp_e2e_cross42 E2E_PORT=3283 (with E2E_ADMIN_URL on 5433, as the suite file ${OPS}/approval-summaries/lane-b-ux-table-scroll-fix-suite.md does). Known flake rule: screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87, re-run once.
4. Drop tp_e2e_cross42; git -C ${WT} worktree remove --force ${SP}/cross42.
Return: head = the merged sha you tested; problems = every #42 pin this PR breaks (empty if none); checks with counts.`, { label: 'p4-cross42', phase: 'Check', schema: RESULT })

const LENSES = [
  { key: 'correctness', text: 'correctness and tests: does each fix do what its finding asked, completely, with a test that would fail without it; any regression it introduces (other branches of the same sentence, other callers of changed helpers such as counted()/Counted, e2e locators, the copies-agree property, focus and keyboard for the new top link); spec steps that would be flaky' },
  { key: 'words-scope', text: 'words, accessibility and scope: every new or changed visible string against .claude/rules/brand.md, CO-11, the screening copy rules and lib/copy/words.ts conventions (one name for one thing, counts with agreeing nouns, no vacuous fact); the new link\'s role, name, target and focus landing; WCAG 2.2 AA on what changed; and that nothing in #42\'s list or the "Not while #42 is open" list changed beyond allowed rows; ADR 0078 amendment and TBL rows say only what the code proves' },
]
const reviewP = Promise.all(LENSES.map(l => agent(`You review ONLY the fix round of PR #83, which no one has reviewed yet: the commits d0152f43, e901e477, 857ca333 and f5e0ceba (git -C ${WT} show <sha>; and the conflict resolutions in merge ${HEAD} if any touch these files). The rest of the PR already passed two reviews (findings in ${SP}/findings.json): do not re-review it. Read-only: change no file. ${RULES}
Your lens: ${l.text}.
For each original finding your lens covers, say in perFinding whether the code fixes it (fixed / partly / not, file:line). Report as findings only NEW real defects in the fix-round delta, each with a concrete scenario and a fix; id them P4-FX-${l.key}-1, -2, ... Return no finding rather than a speculative one.`, { label: `p4-review:${l.key}`, phase: 'Check', schema: FINDINGS })
  .then(r => r && Promise.all(r.findings.map(f => Promise.all([0, 1, 2].map(i => agent(`Adversarially check a claimed defect in PR #83's fix round (worktree ${WT}, head ${HEAD}; read-only). Try to REFUTE it: read the code at the cited place and around it, and the tests. Default to real=false if you cannot show the scenario actually happens. ${i === 0 ? 'Lens: does the scenario reproduce in the code as written?' : i === 1 ? 'Lens: is it within this PR\'s scope and rules, and is it actually a defect rather than a deliberate decision recorded in the design or findings?' : 'Lens: would the proposed fix be right and not break a #42 pin or another caller?'}
Claim: ${JSON.stringify(f)}`, { label: `p4-verify:${f.id}:${i}`, phase: 'Check', schema: VERDICT })))
    .then(vs => ({ ...f, votes: vs.filter(Boolean), confirmed: vs.filter(Boolean).filter(v => v.real).length >= 2 }))))
    .then(fs => ({ lens: l.key, perFinding: r.perFinding, summary: r.summary, findings: fs })))))

const shotsP = agent(`You take AFTER-ONLY shots of PR #83 at ${HEAD}, of only the states the fix round changed, and get one targeted UX verdict. The person ruled (2026-11-01): no redundant UX check of what already passed one — so no before run, no whole tour, no re-review of the rest of the PR; the before state is described in ${SP}/findings.json (.ux_and_brand.findings scenarios and .shots). ${RULES}
${SAVE('p4-finish-shots.md', 'each step done, shot ids taken')}
1. Read ${OPS}/tools/lane-b-screen-tour/README.md ("From another lane" and "Set-up and a run"). One run: TOUR_DIR=${SP}/p4-shots-after, TOUR_REF=${HEAD} (a local commit; reachable from the tour's worktree via ${WT}'s object store — if setup.sh cannot see it, read setup.sh and point it at ${WT}), TOUR_ONLY='screening-result.default.*' (comma-separated if more).
2. Rebuild the capture spec and the static harness (both lost) from findings.json .shots.sample's descriptions, but take ONLY these states: screening-result.default.390 and .1280 (UXR-01: the top audit link in view on load; UXR-03/P4-RC-04: coverage items with no empty Reason), screening-result.default.1280-dark (the new link's tokens), screening-result.top-audit-link-focus.390 and .1280 (after activating the top link: focus on the form's heading, the form in view), screening-result.band.820 (viewport 820x1180, no mobile emulation: UXR-04's term spacing), harness one-other.390 and .1280 (the database's real one-other shape: P4-RC-01/UXR-02's sentence), harness several.390 (a could-not-price row and a rates-change row in coverage: P4-RC-04's sentence and fields). Save the spec and harness under ${SP}/capture/ as lane-b-ux-screening-result-tables-capture.spec.ts and screening-result-harness.mts. Synthetic data only.
3. Check the lock and the server ended together (touch $TOUR_DIR/stop); clean up the tour database. Tile: /usr/bin/python3 -I ${OPS}/tools/lane-b-screen-tour/tile.py ${SP}/p4-shots-after screening-result.
4. Build a private gallery per ${OPS}/tools/lane-b-screen-gallery/README.md into ${SP}/p4-gallery/ (do not publish it; return its path). PNGs and tiles never go on a branch.
5. Spawn nothing; instead read ${WT}/.claude/agents/ux-brand-reviewer.md and act as that reviewer for these shots only: for each of UXR-01, -02, -03, -04 and P4-RC-01, -04, give fixed / partly / not with shot ids; UXR-05 and -06 and P4-RC-03 are not visual (say "not visual; code only"). Report any NEW defect the fixes introduced in what the shots show, with the shot id and a fix; do not report anything else.
Write ${SP}/p4-shots-index.md (shot ids, what each shows, the verdicts). Return in checks the verdicts (one line per id), in problems only new defects, in proposals the gallery path.`, { label: 'p4-shots', phase: 'Check', schema: RESULT })

const [suite, cross, reviews, shots] = await Promise.all([suiteP, crossP, reviewP, shotsP])
const confirmed = (reviews || []).filter(Boolean).flatMap(r => r.findings || []).filter(f => f.confirmed)
const todo = [
  ...confirmed.map(f => `${f.id} (${f.severity}) ${f.file}:${f.line}: ${f.claim} Fix: ${f.fix}`),
  ...((cross && cross.problems) || []).map(p => `#42 cross-check: ${p}`),
  ...((shots && shots.problems) || []).map(p => `shots: ${p}`),
  ...((suite && suite.problems) || []).map(p => `suite: ${p}`),
]
log(`confirmed review findings ${confirmed.length}; to do ${todo.length}`)

let fix = null
if (todo.length) {
  phase('Fix')
  fix = await agent(`You fix what PR #83's checks confirmed, in ${WT} (head now: git rev-parse HEAD; started from ${HEAD}). ${RULES}
${SAVE('p4-finish-fix.md', 'each item done and checks re-run')}
Items (fix each at its root, smallest correct change; if an item is a #42 pin this PR breaks, prefer the change that keeps #42's assertion true without editing #42's files, e.g. keep groupedCount local per the old fix round's rule, and record why; if an item is not real once you read the code, say so with evidence and leave it):
${todo.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Then re-run under the lock what the fixes touch: typecheck, lint on changed files, lint:copy, the affected unit files, watched.ts --write if imports changed, synth --all if matrix rows changed, and any affected e2e spec after a build (E2E_DATABASE=tp_e2e_pr83fix E2E_PORT=3184; drop it after). If a fix changes what a shot shows, re-take that shot with ${SP}/capture's spec into ${SP}/p4-shots-after and note it in ${SP}/p4-shots-index.md. Commit by theme naming the ids. git status --porcelain empty at the end. ${TRAILER}`, { label: 'p4-fix', phase: 'Fix', schema: RESULT })
}
return { merge, suite, cross, reviews, shots, confirmed, fix }