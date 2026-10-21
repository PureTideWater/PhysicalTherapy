export const meta = {
  name: 'pr6b1-review-fix',
  description: 'PR 6b-1 (#35, ZIP+4 in the engine): two independent adversarial reviews (engine and money; freeze, rules and CI), then one fix round with the full local suite and one push',
  phases: [
    { title: 'Review', detail: 'two default workflow agents with the repository checklists, each in a fresh clone' },
    { title: 'Fix', detail: 'verify each finding, fix at the root, full local suite once, push, PR body' },
  ],
}

const WT = '/home/user/pr6b1'
const BR = 'co-001/pr-06b-zip4-engine'
const HEAD = '210a043072adae325bc03240c679ffacebd11f0e'
const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const DESIGN = '/home/user/ops/designs/pr6b-zip4-settings.md'
const PLAN = '/home/user/ops/designs/pr6b-plan.md'
const BUILDLOG = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/tasks/wyh0d12o2.output'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH`

const CONTEXT = `Repository PureTideWater/PhysicalTherapy (PaidWhole). PR 6b-1 is draft pull request #35 into claude/build-platform, branch ${BR}, head ${HEAD} (base 8e33cb3): the ZIP+4 locality lookup in the engine, the one engine change the founder's ruling of 2026-10-18 11:47 UTC allows (docs/product/reconciliation-001.md:428, :499), with the founder's answers of 2026-10-21 to PR 6b's Q3 (a) (record type locality_map_plus_four; its rule_record CHECK widening is 6b-2's) and Q4 (a) (golden G196-G199 under synthetic release 900006, every existing golden file byte-identical) granted as exceptions. No migration. The PR carries the label "money", so CI's mutation job (Stryker) runs on its next push.
Sources (read sections, not whole documents): the plan ${PLAN} lines 88-125, 233-240, 453-545, 614-650; the design ${DESIGN} sections 3.1-3.8 (lines 132-393), the 6b-1 rows of section 8 (966-1103), section 9, section 14; the builders' full reports in ${BUILDLOG} (JSON; keys e1, e2, golden, pr).
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); name databases tp_pr6b1_<role>_<n> and drop them when done. Another workflow is building PR 6b-2 in /home/user/pr6b2 at the same time (databases tp_pr6b2_*, e2e ports 49xx): never touch it. Your e2e ports are 4801-4809.
Rules: CLAUDE.md; the engine freeze (only types.ts, reasons.ts, trace.ts, engine.ts and recompute.ts change under packages/pricing/src, and only for the lookup); fixtures/golden existing files, releases 900001-900005, content/releases/**, tools/verify-content, migrations, approvers.json and the domain model untouched; never skip, disable or loosen a test; never force-push, never --no-verify. The edit hooks in .claude/settings.json are live; never bypass one.`

const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', properties: {
    title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
    file_line: { type: 'string' }, failure_path: { type: 'string', description: 'a concrete input or sequence that produces the wrong result' },
    evidence: { type: 'string', description: 'the command you ran or the code you read that shows it' }, fix: { type: 'string' } },
    required: ['title', 'severity', 'file_line', 'failure_path', 'evidence', 'fix'] } },
  checked: { type: 'array', items: { type: 'string' }, description: 'what you checked and found sound' },
}, required: ['verdict', 'findings', 'checked'] }
const FIX = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' },
  dispositions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, real: { type: 'boolean' }, action: { type: 'string' }, commit: { type: 'string' } }, required: ['title', 'real', 'action'] } },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'dispositions', 'checks', 'open_items'] }

const LENSES = [
  { key: 'engine', checklist: '.claude/agents/payment-engine-reviewer.md and .claude/rules/money-and-contracts.md (if present; read .claude/rules/ for the money rules)', text: `Lens: the engine and the money. Attack the five-file change and the golden claims:
- The lookup: only a flagged ZIP with a ZIP+4 reads locality_map_plus_four; the record in force on the service date (both the ZIP5 and the plus-four records, and what happens when their windows differ or one is missing for that date); range edges (0000, 9999, the first and last code of each range, a gap between ranges, a code in no range); a ZIP+4 given for an unflagged ZIP; malformed values; the carrier and locality chosen and the GPCI read for them; no fallback anywhere that could price at a guessed locality (CLAUDE.md: never a guessed price).
- Five-digit inputs: byte-identical results and traces (apart from the engine version) - check the property test and the differential test really prove it, and look for any input whose path changed.
- ENGINE_VERSION phase-two/2: what reads the engine version (stored runs, re-run diffs and PRC-19, caches, screening results, reports, recompute of traces written under phase-two/1, AUDIT-01). Prove a stored line priced under phase-two/1 still recomputes (PRC-16) and that a re-run of an unchanged month does not list every line as changed because the version string moved. Run the tests that prove it.
- recompute(): every new check fails on the tampering it targets; nothing passes a trace the engine would not write.
- G196-G199: recompute each expected amount by hand from 900006's records (show the arithmetic); confirm the oracle's ZIP9 step is independent of the engine's code (git log and diff of tools/golden-worksheet against packages/pricing and packages/rules), and that the oracle and the engine read the same CMS layout for the right reasons.
- Money rules: integer cents, one rounding per line under the contract's rule with the unrounded value kept, no float on an amount; the Medicare flags' defaults unchanged; UNPRICED_REASONS unchanged.` },
  { key: 'freeze', checklist: '.claude/agents/edi-reviewer.md for the parser method, and .claude/agents/security-reviewer.md for the CI and supply-chain method', text: `Lens: the freeze tool, the rules package, release 900006 and CI. Try to get something past them:
- tools/engine-freeze: craft (in your clone, on throwaway local branches never pushed) a later PR that changes a non-test engine file, edits or deletes an existing golden file, changes a release 900001-900005, or adds DDL or a write on rule_release, rule_record or rule_release_withdrawal (including through a function body, DO block, dynamic SQL, a foreign key, ALTER ... RENAME, COMMENT ON, GRANT, a trigger, a partition or an inherited table); and one that edits exception.json to let itself through. Run check.ts against each and report any that passes. Check the exception applies only in the PR that adds or edits it, as the design's section 3.8 intends, and what stops a PR from widening it (CODEOWNERS, review): say whether that is enough while APPROVAL_REVIEW_REQUIRED is unset.
- differential.test.ts: does it truly run the base engine (not the head twice), fail in CI when it cannot, and compare everything that matters? Do its 20,000 generated claims exercise the flagged-ZIP path (they should not change it) and the paths the change touched?
- ci.yml: the step's merge-base computation on a pull_request event (shallow checkout depth, fork PRs), ENGINE_FREEZE_BASE reaching the unit job, every job on ubuntu-24.04, actionlint, the mutation job's trigger.
- The ZIP9 parser and the record schema against the CMS layout the design cites (positions, the flag, quarter fields, a state mismatch, duplicates, folding codes into ranges, the 10,000-range cap) and tools/release's completeness check; release 900006 assembled by the repository's own tools and equal to its committed files; 900001-900005 and content/releases untouched; the fixture guard pin of GPCI_SYNTHETIC_900006.csv and the synthetic markers on every new fixture; nothing real committed.
- The builder's finding that PR 5's merged migration 20261103090000_deadline_verification_and_export_attestation.sql creates a trigger ON rule_release_withdrawal: verify it, and say what it does to the table.` },
]

phase('Review')
const reviews = await parallel(LENSES.map(l => () => agent(`${CONTEXT}

You are an independent adversarial reviewer of PR #35 at ${HEAD}. Clone it fresh: git clone -q -b ${BR} /home/user/PhysicalTherapy ${SP}/pr6b1/review-${l.key} (then check git rev-parse HEAD equals ${HEAD}; if the local branch moved, git checkout ${HEAD}), and pnpm install --frozen-lockfile there. Change nothing in ${WT} and push nothing. Use ${l.checklist} as your review method.

${l.text}

Report only findings with a concrete failing path, each with its evidence (a command you ran, or file:line you read) and the fix; list what you checked and found sound. Severity: blocking, should_fix or nit. Finish every lead you open, call StructuredOutput with your findings (an empty list if there are none) before you stop, and delete your clone and databases at the end.`, { label: `review: ${l.key}`, phase: 'Review', schema: REVIEW })))
if (reviews.filter(r => r && Array.isArray(r.findings)).length < LENSES.length) {
  log('A review returned nothing; refusing to go on unreviewed.')
  return { error: 'a review returned nothing', reviews }
}
const findings = reviews.flatMap((r, i) => r.findings.map(f => ({ ...f, lens: LENSES[i].key })))
log(`${findings.length} findings from two reviews`)

phase('Fix')
const fix = await agent(`${CONTEXT}

You run PR 6b-1's fix round in ${WT} (branch ${BR}, head ${HEAD}). git pull --no-rebase origin ${BR} first.
1. The two reviews' findings are below. Each is a claim to verify yourself against the code, not an order. Fix every real one at its root, with a test that fails before the fix where a test can show it; say why for any that is not real.
Findings: ${JSON.stringify(findings, null, 1).slice(0, 40000)}
2. Also, from the builders' open items:
- docs/product/reconciliation-001.md: record the founder's answers of 2026-10-21 to PR 6b's Q3 (a) and Q4 (a) as granted exceptions to the checks at lines 429 and 445, in the Approval section's style (a "Ruled by the founder, Tyler Williams, on October 21, 2026, on PR 6b" block), and amend the engine-freeze check at line 428 to name tools/engine-freeze as the machine that checks it. Record the reviewers' verified finding about PR 5's trigger ON rule_release_withdrawal factually, as a departure from line 445 found by this PR's check and put to the founder, NOT as a granted exception (the founder has not ruled on it).
- The root README.md's golden count (about line 675: "326 lines in 150 claims") becomes 330 lines in 154 claims.
3. Then run the full local suite ONCE on the final tree and record each command and result: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; CI=true ENGINE_FREEZE_BASE=$(git merge-base origin/claude/build-platform HEAD) pnpm test (the differential test must run, not skip); pnpm test:golden; pnpm test:oracle with TP_ORACLE_PYTHON=/opt/py312-ci/bin/python; pnpm verify-content; the freeze check (pnpm -s exec tsx tools/engine-freeze/check.ts <merge-base>); a fresh PostgreSQL 18 database migrated from empty, then pnpm test:db against it (find the environment variables the db project reads); pnpm test:e2e on ports 4801-4809 (find how the e2e config takes its port and database); pnpm build; actionlint; and Stryker on the pricing config (npx stryker run stryker.config.mjs; report the score against its break threshold). A failure is fixed at its root and the affected checks rerun; never skip or loosen a test.
4. Commit in the repository's style (lowercase area prefix, one sentence saying what changes and why). ${ATTR} Push ONCE at the end (ci.yml cancels an in-progress run on each push): git push -u origin ${BR}, retrying after 2, 4, 8 and 16 s on a network error; never force, never --no-verify; a refused push is fixed with a new commit (unpushed commits may be rewritten, as the hook says).
5. Update PR #35's body with the GitHub MCP tool update_pull_request (load it with ToolSearch "select:mcp__github__update_pull_request"): keep the template's sections, add a "Review round" table (every finding, real or not, and what was done, with its commit) and the full suite's results, and keep the ending lines. Keep the PR a draft.
Return the head you pushed, every disposition, every check, and the open items.`, { label: 'fix: 6b-1 review round', phase: 'Fix', schema: FIX })
return { reviews, findings, fix }
