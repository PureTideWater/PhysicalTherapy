export const meta = {
  name: 'lane-b-suite-cap-3-fix',
  description: 'SUITE-CAP-3 PR #134 fix round: the surviving review findings and CAS-49.2 (red-first, skeptic-verified), a delta review, the base merged once, the full local suite once, one push, the PR description updated',
  phases: [
    { title: 'Fix', detail: 'findings 2.1, CAS-49.2, 2.2, 1.2, 1.3 plus the approved Known gap words; each skeptic-verified and committed' },
    { title: 'Delta review', detail: 'two lenses on the fix delta, three skeptics per finding; survivors applied' },
    { title: 'Merge base', detail: 'merge claude/build-platform once with a merge commit; shared docs keep both sides; generators re-run' },
    { title: 'Suite', detail: 'the full local suite once on the final tree' },
    { title: 'Push', detail: 'one push through the hook; the PR description updated and read back' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad'
const WT = '/home/user/suite-cap-3-reconcile'
const DESIGN = '/home/user/ops/designs/lane-b-suite-cap-3-reconcile.md'
const REC = `${SP}/pr134-review-findings.md`
const WORDS = `${SP}/known-gap-words.md`
const RULES = `Context: SUITE-CAP-3, "reconcile at real size", draft PR #134 (PureTideWater/PhysicalTherapy, co-001/suite-cap-3-reconcile -> claude/build-platform), head ee1dbb7d (base 31a7345f + 6 slice commits). Worktree ${WT}. Design ${DESIGN} (sections 4, 5, 7, 11, 18). The review record: ${REC}. The orchestrator's approved Known gap words: ${WORDS}.
Binding (the four rules that never bend): code computes every number; integer cents; matching rules, every amount, every write and its observable order and the recovered total EXACTLY unchanged (the ledger oracle and LED-01 to LED-18 byte for byte); nothing under packages/ledger/src, packages/db or packages/pricing changes; no migration; queries practice-scoped; no identifier in logs, errors or output; synthetic data only. Reserved numbers only (ADR 0087; CAS-49 to CAS-51; synth module 5).
Rules: every command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, typecheck, lint, any vitest, build, e2e, Stryker, probes) only under flock /tmp/laneb-heavy.lock; never start a database server inside the lock. DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PG 18); if 5433/5432 die with "Permission denied", chmod 755 /root then bash /tmp/setup-container.sh co-001/suite-cap-3-reconcile:/home/user/suite-cap-3-reconcile (outside the lock). Long commands run_in_background and wait. RED FIRST for every test change (show it fails on the unfixed code or that a mutant is caught). Never --no-verify, never force, never rebase. No model name or identifier in any file. Commits end, after a blank line, with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKP4ekrT97eyDtLe4Rd
Finish by calling StructuredOutput with what you have, even if partial.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const RESULT = { type: 'object', properties: { done: { type: 'boolean' }, summary: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['done', 'summary', 'commits', 'notes'] }
const VERIFY = { type: 'object', properties: { pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' }, detail: { type: 'string' } }, required: ['severity', 'title', 'detail'] } } }, required: ['pass', 'issues'] }
const ITEMS = [
  { id: '2.1', text: `review finding 2.1 (should-fix) exactly as ${REC} describes: multi-line claims and case lines of different claims sharing a patient control number, code and date with a third claim of that patient in one line's remittance only and another loaded between the two lines' loads, a person's unmatch and a standing match on one sibling line; (b)-only mutants on PATIENT_PAIRS for own-remittance and created_at (each with a differs predicate; equivalent ones documented in the test comment); expectWorldShapes asserts a shared patient control number across two searched lines and that (b) dropped at least one pair.` },
  { id: '49.2', text: `CAS-49.2 (design section 7 item 2): the old-against-new comparison on the worlds of LED-01 to LED-18 (their LedgerWorld), after each reconcile the LED test runs, with encrypted text compared by decrypted hash, reusing pass-compare's runSide machinery; the matrix row, registry text and ADR 0087 already claim it, so make them true (adjust their words only if the built scope differs, and say so).` },
  { id: '2.2', text: `review finding 2.2 (nit): the four mutants (r.status = 'loaded' -> TRUE and c.claim_status_code <> '22' -> TRUE, in CONTROL_SEARCH alone and in PATIENT_CLAIMS alone, each with a differs predicate), a held 835 claim that carries a known line's payer claim control number loaded after the history so the control search reaches it in the pass, and guard refusals recorded as asserted "threw" outcomes (or shapes the comparison catches).` },
  { id: 'docs', text: `review findings 1.2 and 1.3 and the Known gap words: (1.2) qualify the D2 comment at remittances.ts:851-853 ("equal to a fresh read: a claim's lines depend only on its own correction chain, which the loader never makes a loop") and add the optional subset-equality test in line-chain-index.test.ts for a chain with no loop; (1.3 + the orchestrator's words) set KNOWN_GAP_FIGURE and KNOWN_GAP_REVISIT in tools/release-capacity/checks.ts to the approved strings in ${WORDS}, with one precision edit that the orchestrator's rule allows ("fix it within these facts"): "A's full month was last measured at 30,795 lines" becomes "A's full month (its 30,795 actionable lines) was last measured" so the count is not read as the month's 100,000 lines; update the tests that pin the old strings (checks.test.ts:480 and any other); if brand-copy (pnpm lint:copy) flags a wording rule, fix within the same facts. Code comments may keep "Lane A".` },
]
phase('Fix')
const fixes = []
for (const it of ITEMS) {
  let r = await agent(`${RULES}
Your task: in ${WT}, ${it.text} Check against the code first. Run the tests it touches under the lock. Commit when green with message "SUITE-CAP-3 review fix ${it.id}: <one line>" plus a short body (what, red-first evidence). Do not push. ${SAVE(`fix134-${it.id}.md`, 'red-first evidence, files, results')}`, { label: `fix:${it.id}`, phase: 'Fix', schema: RESULT })
  if (!r) { log(`fix ${it.id}: agent returned nothing; stopping`); fixes.push({ id: it.id, r: null }); break }
  let v = null
  for (let a = 0; a < 2; a++) {
    v = await agent(`${RULES}
SKEPTIC VERIFIER for fix ${it.id}: ${it.text}
The fixer reports: ${JSON.stringify(r)}. Check the commit(s) in ${WT} (git log -3, git show): does it do what the finding asks; is red-first real (re-run the tests under the lock; confirm the new mutants are caught and that a mutant marked equivalent truly is); the freeze holds; no identifier logged. Default to pass=false on doubt. ${SAVE(`verify134-${it.id}-${a}.md`, 'checks and results')}`, { label: `verify:${it.id}:${a}`, phase: 'Fix', schema: VERIFY })
    if (v && v.pass && !v.issues.some(i => i.severity !== 'nit')) break
    if (a === 1) break
    r = await agent(`${RULES}
Fix ${it.id} again after its verifier: ${JSON.stringify(v)}. Check each issue, fix the real ones (red-first), commit as "SUITE-CAP-3 review fix ${it.id} (verifier): <one line>". Do not push. ${SAVE(`fix134-${it.id}-v.md`, 'issues handled')}`, { label: `refix:${it.id}`, phase: 'Fix', schema: RESULT })
    if (!r) break
  }
  fixes.push({ id: it.id, r, v })
}
const stopped = fixes.some(f => !f.r)

phase('Delta review')
let delta = null
if (!stopped) {
  const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { rating: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } }, required: ['rating', 'title', 'detail', 'fix'] } } }, required: ['findings'] }
  const lenses = [['payment-engine', '.claude/agents/payment-engine-reviewer.md'], ['security', '.claude/agents/security-reviewer.md and .claude/rules/privacy-and-tenant.md']]
  const found = (await parallel(lenses.map(([k, f]) => () => agent(`${RULES}
Round 3 (delta review, speed rule 3): review ONLY the fix-round commits (git -C ${WT} log ee1dbb7d..HEAD; diff ee1dbb7d..HEAD) through the ${k} checklist (${f}, applied by you), plus anything the earlier rounds missed that the delta touches. Earlier findings (do not repeat): ${REC}. An empty list is valid.`, { label: `delta:${k}`, phase: 'Delta review', schema: FIND }).then(x => x ? x.findings.map(y => ({ ...y, lens: k })) : [])))).flat()
  const judged = await parallel(found.map((f, i) => () => parallel([0, 1, 2].map(j => () => agent(`${RULES}
SKEPTIC ${j + 1}: try to REFUTE this delta-review finding against the code in ${WT} (and a short run if needed). Default to refuted=true when the evidence does not hold. Finding: ${JSON.stringify(f)}`, { label: `dskeptic:${i}:${j}`, phase: 'Delta review', schema: { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] } }))).then(vs => ({ ...f, upheld: vs.filter(Boolean).filter(x => !x.refuted).length, survives: vs.filter(Boolean).filter(x => !x.refuted).length >= 2 }))))
  const surv = judged.filter(f => f.survives)
  const applied = surv.length ? await agent(`${RULES}
Apply these surviving delta-review findings in ${WT}, each checked first, red-first where a test changes; commit as "SUITE-CAP-3 review fix (delta): <one line>". Do not push. ${JSON.stringify(surv)} ${SAVE('fix134-delta.md', 'findings applied')}`, { label: 'delta:apply', phase: 'Delta review', schema: RESULT }) : null
  delta = { judged: judged.map(f => ({ lens: f.lens, rating: f.rating, title: f.title, upheld: f.upheld, survives: f.survives })), applied }
}

phase('Merge base')
const merged = stopped ? null : await agent(`${RULES}
Your task: merge the latest claude/build-platform into ${WT} ONCE, with a merge commit (never rebase): git -C ${WT} fetch -q origin claude/build-platform && git -C ${WT} merge --no-ff origin/claude/build-platform. The known conflicts are the shared documents docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts (LANES.md rule 6: keep BOTH sides' rows in their order; matrix.ts repeats the matrix word for word); resolve any other conflict keeping both sides' behaviour. Then regenerate, never hand-merge: pnpm install --frozen-lockfile (or pnpm install if the lockfile conflicted), pnpm synth --all (commit what it writes in fixtures/synthetic), and if a worker import changed, pnpm exec tsx tools/screening-capacity/watched.ts --write. Commit the merge with message "Merge claude/build-platform <short sha> into co-001/suite-cap-3-reconcile" and the attribution lines. Run the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, the synth check) under the lock. Do not push. ${SAVE('merge134.md', 'conflicts and resolutions')}`, { label: 'merge-base', phase: 'Merge base', schema: RESULT })

phase('Suite')
const suite = (stopped || !merged) ? null : await agent(`${RULES}
Run the FULL local suite ONCE on the final tree in ${WT} (lanes/lane-b.md "How Lane B runs" and the item prompt /home/user/ops/lanes/lane-b-item-prompts-2026-11-01/suite-cap-3.md step 5's list; read package.json scripts and .github/workflows/ci.yml for the exact commands): pnpm lint, pnpm typecheck, pnpm lint:logs, pnpm lint:copy, pnpm check:fixtures; unit (pnpm test) and golden (pnpm test:golden); the ledger oracle and LED-01 to LED-18 byte for byte; CAS-49 to CAS-51 and CAS-41; test:db in its 4 shards one after another, each on a fresh PG18 database (port 5433), as CI shards it; pnpm build, the stamp step, then e2e with E2E_PREBUILT=1 (--workers=2); the affected Stryker shards (tools/stryker/affected.ts) then the gate; pnpm verify-content and the synth check; pnpm actions:check and toolchain:check only if a workflow, manifest or lockfile changed (say whether). Each under the lock, one at a time. Record CAS-49's and CAS-51's wall times and which db shard each lands in (the 20-minute CI shard timeout risk). If something fails: decide whether it is this PR's (re-run that part once on the base in a scratch clone if needed); fix what is this PR's (red-first, commit "SUITE-CAP-3 suite fix: <one line>") and re-run only the affected part; report the rest with evidence. Known: MOD-16 may fail until co-001/redact-range-glued merges (not this PR's). ${SAVE('suite134.md', 'every command, result and counts')}
Return a table of every command, result and counts in summary.`, { label: 'suite', phase: 'Suite', schema: RESULT })

phase('Push')
const push = (stopped || !suite || !suite.done) ? null : await agent(`${RULES}
Your task: (1) git -C ${WT} push origin co-001/suite-cap-3-reconcile (one push, through the pre-push hook; never --no-verify or force; if the hook refuses a file in an unpushed commit, rewrite only unpushed commits to remove it and push again). (2) Update PR #134's description: load mcp__github__pull_request_read and mcp__github__update_pull_request with ToolSearch; read the current body (gh api repos/PureTideWater/PhysicalTherapy/pulls/134 --jq .body); update its "Checks" table with the full suite's results (${JSON.stringify(suite && suite.summary)}), its "Reviewer agents' findings" table with every finding of rounds 1-2 (${REC}) and the delta round (${JSON.stringify(delta)}) and each resolution with its commit, the "Open items" (CAS-49.2 now built; the Known gap words as approved with the precision edit; CI shard times), keeping every template section and the footer; keep it under 65,536 characters; write it with update_pull_request, then read it back with gh api and compare byte for byte (fix and compare again if different); save the final body to ${SP}/pr-body-v2.md. Never approve, review or comment. Return the pushed head sha and whether the body matched.`, { label: 'push', phase: 'Push', schema: { type: 'object', properties: { head: { type: 'string' }, matched: { type: 'boolean' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['head', 'matched', 'notes'] } })
return { fixes: fixes.map(f => ({ id: f.id, summary: f.r && f.r.summary, commits: f.r && f.r.commits, verify: f.v })), delta, merged, suite, push, stopped }