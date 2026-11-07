export const meta = {
  name: 'lane-b-ux-screening-result-words-build',
  description: 'UX PR 4b: re-pin design §11 against the current tree, critic the plan, build it, run the fast checks and touched tests',
  phases: [
    { title: 'Plan', detail: 'scout re-pins §11; completeness critic' },
    { title: 'Build', detail: 'one builder, red-first, commits by theme' },
    { title: 'Check', detail: 'fast checks, touched unit tests, the screening e2e specs' },
  ],
}
const SP = args.SP
const WT = '/home/user/ux-screening-result-words'
const OPS = '/home/user/ops'
const DESIGN = `${OPS}/designs/lane-b-ux-screening-result-tables.md`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const TRAILER = `Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKRDfoFAeXZK4Thp8M8`
const SCOPE = `UX PR 4b (branch co-001/ux-screening-result-words, worktree ${WT}, cut at 31a7345f; #42 merged as 22789493 and #83 as 43565235 are in it). The spec: ${DESIGN} section 11 (with 3.4 and 3.9 it cites, and section 12, which wins, including 12.1's three Lane A conditions); the status file ${OPS}/approval-summaries/lane-b-ux-screening-result-words-status.md "Scope"; and the old status file's "For UX PR 4b" proposals (${OPS}/approval-summaries/lane-b-ux-screening-result-tables-status.md, "Proposals"), including #121's P1 (the anomaly label's "$5" in mono with tabular numerals; one unpriced tone in both copies). Also UXR-08 and P4-RC-01: "the last entry" for "the table’s last row", including the one-other branch ("…; the last entry is the one other group, its rows summed, and the next page lists it."). #83's PR description (gh api repos/PureTideWater/PhysicalTherapy/pulls/83 --jq .body, section "Waits for #42") lists the same items.`
const RULES = `Rules:
- Work only in ${WT}. Never touch /home/user/PhysicalTherapy or ${OPS} (read only); never push; never rebase, reset, amend, stash or force.
- No migration and nothing under packages/db, pricing, ledger, money; the labels re-pin keeps the name screening-labels/2026-11-05 (12.1, Q1 yes). If anything shows the re-pin would need a migration or a new version name, or a release tag exists (git ls-remote --tags origin), STOP that part and report it.
- Synthetic data only. No model name or identifier in any file or commit. A gitleaks refusal is fixed by rewriting the flagged text, never a .gitleaksignore entry.
- Words within .claude/rules/brand.md, BRAND.md, CO-11 and the screening's copy rules (never owed, underpaid or recovered; no finding about a payer). Tokens only, no style attribute; money figures in mono with tabular numerals.
- Shared files (docs/product/test-matrix.md, packages/synth/src/cases/{matrix,registry}.ts): change only TBL-08's row. Generated files only by their generators (pnpm synth --all; pnpm exec tsx tools/screening-capacity/watched.ts --write).
- Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Every heavy command only under flock /tmp/laneb-heavy.lock. Long commands with run_in_background and Monitor, never a foreground sleep. If PostgreSQL on 5433 is down, bash /tmp/setup-container.sh.`
const PLAN = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, what: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
    currentText: { type: 'string', description: 'the exact current code/text at file:line in the tree today' },
    change: { type: 'string', description: 'the exact new words/code' }, tests: { type: 'string' }, source: { type: 'string' } },
    required: ['id', 'what', 'files', 'currentText', 'change', 'tests', 'source'] } },
  stale: { type: 'array', items: { type: 'string' }, description: 'design pins or assumptions that no longer hold on the current tree, and the correction' },
  risks: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } },
  required: ['items', 'stale', 'risks', 'summary'] }
const GAPS = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['item', 'problem', 'fix'] } }, summary: { type: 'string' } }, required: ['gaps', 'summary'] }
const RESULT = { type: 'object', properties: { head: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } }, done: { type: 'array', items: { type: 'string' } }, notDone: { type: 'array', items: { type: 'string' } }, checks: { type: 'array', items: { type: 'string' } }, problems: { type: 'array', items: { type: 'string' } }, proposals: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['head', 'commits', 'done', 'notDone', 'checks', 'problems', 'proposals', 'summary'] }

phase('Plan')
const plan = await agent(`You turn UX PR 4b's spec into an exact build plan against the CURRENT tree. Read-only: change no file. ${SCOPE}
${RULES}
${SAVE('4b-plan.md', 'each spec item located in the code, the plan so far')}
The design was written at a6e754fc; its file:line pins (sections 3.4, 3.9, 11.2 to 11.6) predate #42's merge and later PRs (#121 brand-settle changed --pw-unpriced and ADR 0056; check git log on each file since a6e754fc). For every spec item: find the code today (file:line and the exact current text), say the exact change (words verbatim from the design where it gives them), the tests that pin it (result.test.tsx, result-tables.test.tsx, labels.test.ts, e2e/screening.spec.ts, e2e/screening-phone.spec.ts, stacked-rows, anything else that asserts the old words or tones: grep the whole repo, apps and packages and tools, for each old string), and the source (design section / finding id). Also check and plan:
- labels.ts today: the current version name and hash map in labels.test.ts; whether screening-labels/2026-11-05 is still the version every caller and SQL function uses (grep packages/db functions and migrations for the version string: if the hash or the words are stored or checked in SQL, the re-pin may need a migration — report it as a risk with evidence); Lane A's condition 1 comment, its exact words;
- whether #42 already rescoped screening.spec.ts's data-slot locator (#42 :517 in its numbering) and whether screening-phone.spec.ts still takes pg_advisory_lock_shared(760065) itself or can now use #42's holdScreeningStream('shared') (design 12, P4-DR-01: the PR merged second may swap it; plan the swap if the helper exists);
- every remaining "short" or "whole" tone use in components/screening (TBL-08: none), and where the anomaly chip's words are built (standingWords, GroupStatus) for #121's P1 mono figure;
- GroupStatus's "its" for one row; "Expected under Medicare, …" becoming "Medicare figure, …" (design P5 in section 10): find it and its pins;
- TBL-08's full text per 11.5, adjusted for what this PR actually ships, and matrix.ts byte-equal; synth's TBL-08 fixture by pnpm synth.
- the stacked anomaly item showing its standing chip with its heading (old status proposal "Stacked items"): plan it only if it is a small, clearly-right change in anomalies.tsx; otherwise list it as a proposal.
Return items (one per change), stale (design pins that moved and their correction), risks.`, { label: '4b-plan', phase: 'Plan', schema: PLAN })
if (!plan) throw new Error('plan failed')

const critic = await agent(`You are the completeness critic of UX PR 4b's build plan. Read-only. ${SCOPE}
${RULES}
The plan:
${JSON.stringify(plan)}
Find what is missing, wrong or stale: a spec item with no plan item; a plan item whose currentText does not match the tree (check each file:line yourself); a change whose words differ from the design without a reason; a pin or test that asserts an old string or tone and is not in the plan (grep the whole repo); a change that would break a rule (no migration; shared files TBL-08 only; brand words; mono figures); Lane A's three conditions not covered; anything in #83's description "Waits for #42" list missing. Return each gap with the fix. Return none rather than a speculative one.`, { label: '4b-critic', phase: 'Plan', schema: GAPS })
log(`plan items ${plan.items.length}; critic gaps ${critic ? critic.gaps.length : 'n/a'}`)

phase('Build')
const build = await agent(`You build UX PR 4b. ${SCOPE}
${RULES}
${SAVE('4b-build.md', 'each plan item done, test written red first, commit ids, what remains')}
The plan (scout) and the critic's gaps — apply every gap that holds when you check it against the code; reject with a reason any that does not:
PLAN: ${JSON.stringify(plan)}
GAPS: ${JSON.stringify(critic && critic.gaps)}
How:
- For each behaviour or word change, update or add the test first and see it fail, then change the code. Tests live where the plan says (result-tables.test.tsx for the new cases per design 11.6; result.test.tsx and e2e/screening.spec.ts pins updated, now that #42 has merged and its files are free; labels.test.ts re-pinned with Lane A's condition-1 comment in its exact words).
- If the plan's risk shows the labels re-pin needs a migration or a new name, do NOT do the labels part: build the rest and report it in notDone with the evidence.
- Commit by theme (e.g. tones and the "$5" figure; the count sentence and "the last entry"; the labels and their re-pin; the pins and specs; TBL-08 with synth and watched-paths by their generators), each message naming its finding ids / design sections. ${TRAILER}
- Before you finish, under the lock: pnpm typecheck; pnpm lint:copy; vitest --project unit on every unit file you touched plus apps/web/src/components/screening and lib/screening; git status --porcelain empty.
Return head (full sha), commits, done/notDone per plan item id, checks, problems, proposals.`, { label: '4b-build', phase: 'Build', schema: RESULT })
if (!build || !build.head) return { plan, critic, build, stopped: 'build failed' }

phase('Check')
const check = await agent(`You check UX PR 4b's build at ${build.head} (worktree ${WT}). ${RULES}
${SAVE('4b-check.md', 'each command, result and counts')}
The fast checks (speed rule 1) under the lock, one at a time: pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; pnpm synth --all then git diff --exit-code; pnpm exec tsx tools/screening-capacity/watched.ts --write then git diff --exit-code; the unit tests the change touches (every file under apps/web/src/components/screening, apps/web/src/lib/screening, apps/web/src/lib/copy, tools/screening-capacity, and any other file whose assertions the diff git diff 31a7345f..HEAD touches); then pnpm build and the e2e specs e2e/screening.spec.ts and e2e/screening-phone.spec.ts with E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_4b E2E_PORT=3185 (and E2E_ADMIN_URL on 5433 as ${OPS}/approval-summaries/lane-b-ux-table-scroll-fix-suite.md does; build-stamp first). Known flake: screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87, re-run once. Also: git ls-remote --tags origin (count); grep the diff for "short" and "whole" tones in components/screening (none expected), for "owed|underpaid|recovered" in new strings, for any model identifier.
Fix a failure the diff causes at its root in a new commit (${TRAILER}) and re-run what it touches. Drop tp_e2e_4b after. git status --porcelain empty at the end. Return head, commits (new ones only), checks with counts, problems.`, { label: '4b-check', phase: 'Check', schema: RESULT })
return { plan: { n: plan.items.length, stale: plan.stale, risks: plan.risks, summary: plan.summary }, critic, build, check }