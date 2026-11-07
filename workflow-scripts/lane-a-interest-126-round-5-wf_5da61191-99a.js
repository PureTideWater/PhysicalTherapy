export const meta = {
  name: 'interest-126-round-5',
  description: 'Acting Lane A on #126: close the per-reconcile interest overshoot (re-walk until no write), pin the matrix rows and the widened lookup at size, review every change since 9c68a4be until dry (two lenses, skeptics, critic, fixes by file), base merge once, full suite once, push, CAS-42.5, body, fresh-clone verification',
  phases: [
    { title: 'Fix', detail: 'per-reconcile bound: re-walk the interest path until no write; failing-first property and db tests; cost measured; matrix rows; widened lookup plan at size' },
    { title: 'Review', detail: 'money and database lenses on 9c68a4be..head; skeptic per finding; critic; fix as found; loop until dry' },
    { title: 'Suite', detail: 'base merge once; full local suite once; push' },
    { title: 'After', detail: 'CAS-42.5; PR body' },
    { title: 'Verify', detail: 'fresh-clone verification reading CI' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const D = `${SP}/i126e`
const WT = '/home/user/interest', BR = 'co-001/ledger-interest-once', HEAD0 = '75cb2b70f0ef403ca1b968951d560f012a839fec', REVBASE = '9c68a4be06a93055b55964b8a2c5027fa630716c', PR = 126
const BASEBR = 'claude/build-platform'
const IPR = '/home/user/ops/approval-summaries/lane-a-wip/interest-pr'
const DESIGN = '/home/user/ops/designs/ledger-interest-once.md'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW`
const GRANT = `"Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." (the founder, Tyler Williams, relayed by the co-founder, 2026-10-27 20:49 UTC)`
const SAVE = (f, what) => `Save as you go in ${SP}/progress/${f} (${what}); continue from it if it exists. When done you MUST call the StructuredOutput tool: it is your only way to return; budget your work to reach it.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Acting Lane A on PR #${PR}, the interest fix (interest credited once; ADR 0084; LED-23 to LED-25; migration 20261110090000, unmerged; design ${DESIGN}; earlier findings ${IPR}/findings-table.md and ${IPR}/round-2/; round 4's material ${SP}/i126d/ (round3-confirmed.json, critic-r3-gaps.json, last-gaps.json, design.patch) and progress ${SP}/progress/i126d-*.md). Branch ${BR} at ${HEAD0}. Earlier rounds fixed F1 (out-of-order uploads), F-M2-1, MONEY-R4-1, R2M2-1 (partly written take-backs: interestUnplaced, unplacedCents), RVM3-2/3 and more. Read files; never rely on truncated text. Worktree ${WT}.
The founder granted the ledger freeze exception: ${GRANT}; stay within section 10.1's text (its DDL, files and behaviours). Any change beyond it (e.g. a new index on a ledger table not in 10.1's DDL) is NOT made: stop that part and report it for the founder.
Speed rules: CI is the full suite of record; the full local suite runs once on the final tree before the push; the base is merged once right before that push.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); if down: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". PG_BIN_DIR=/opt/pg18/bin. Heavy commands one at a time under flock /tmp/laneb-heavy.lock. Long commands: run_in_background and wait. Databases tp_i126e_<role>_<n>, dropped when done. E2e ports 4981-4989.
Marker route only for 20261110090000 via .claude/skills/new-migration/SKILL.md (shell-created, trap-removed, never committed). If refused, stop and report.
Rules: CLAUDE.md in full (integer cents; never a float on an amount). NEVER write the approval line or approvers.json; never approve or request changes; never write files through the GitHub connector; never rebase/force/--no-verify; no .gitleaksignore. Generated files regenerated with the tools only. Never skip or loosen a test. No model identifier in files, commits or PR text. ${ATTR}`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const FINDINGS = { type: 'object', properties: { covered: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'title', 'severity', 'evidence'] } } }, required: ['covered', 'findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }
const FIXREC = { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, fixed: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, checks: CHECKS, for_founder: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'fixed', 'checks'] }
const CLONE = (k) => `Work in your own clone: git clone /home/user/PhysicalTherapy ${SP}/r5-${k}; cd there; git remote set-url origin https://github.com/PureTideWater/PhysicalTherapy.git; git fetch origin ${BR}; git checkout origin/${BR}; pnpm install --frozen-lockfile under the lock. Write nothing in shared worktrees; remove the clone when done.`

phase('Fix')
const fx = await agent(`${COMMON}

In ${WT} (git status clean; HEAD ${HEAD0}; git pull --no-rebase origin ${BR}):
1. **The per-reconcile overshoot** (found by round 4's fix agent, open_items in ${SP}/progress/i126d-fix-r3.md and its logs ${SP}/i126d-fix-r3/logs, e.g. proto-own.log): with two take-backs of one chain and a payment of that chain dated after both, take-back X1 counts as whole using interest only X2 kept off the lines; X2 completes, its lines open, the later-dated payment lands there after X1 was walked; for one reconcile the interest figure is above the cash (counterexamples: payments [1,167], take-backs [1,84], lines L1/L2 42/42, dated Y1,X2,X1,Y2, uploaded together: 169 vs 168; and payments [1,5], take-backs [1,3], dated X2,X1,Y1,Y2, in date order: 7 vs 6). DECISION (acting Lane A; money: the safer and more accurate option): option (1), re-walk the interest path within the reconcile until a walk writes nothing, so no reconcile ever ends above the cash and today's settled outcomes are kept; option (2) (count only the lines the judged take-back keeps off) is rejected because it understates stable cases. Implement it within 10.1's files (recordInterest's walk in apps/worker/src/reconcile/remittances.ts and/or interestWrites in packages/ledger/src/interest.ts), with a bound on the number of walks and a proof it terminates. Failing-first: strengthen the committed property to assert the bound after EVERY reconcile (it must fail on ${HEAD0} with the counterexamples above) plus db tests for both counterexamples. Measure the cost: CAS-42.3's shape and a take-back-heavy shape (time and walks per reconcile, before and after).
2. **The critic's gaps** (${SP}/i126d/critic-r3-gaps.json and ${SP}/i126d/last-gaps.json): make the LED-23 and LED-24 rows in docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts say exactly what the code now does (conditions included; no unconditional order-independence claim); measure ATTRIBUTION_CLAIMS' widened branch (LED-R1, interest-chains.ts) at size with EXPLAIN (ANALYZE) on a 50,000-claim shape with named PLB L6s and take-backs; if it needs an index on ledger_match that 10.1 does not grant, do NOT add it: report it in for_founder with the measurement.
3. Update ADR 0084 (D5, the at-size bullet, consequences) and write an updated design-text patch for ${DESIGN} at ${D}/design.patch (start from ${SP}/i126d/design.patch; do not write /home/user/ops).
Checks: fast checks; the unit and db tests of touched files; ledger oracle, interest, chain, chain.large db tests; the money-ledger Stryker shard and gate (interest.ts 100%); pnpm -s db:domain-model --check. Commit; push once (fast-forward; also co-001/wip-interest-fix). ${SAVE('i126e-fix.md', 'decision, red/green, measurements, checks')}`, { label: '#126: overshoot fix + gaps', phase: 'Fix', schema: FIXREC })
if (!fx || !fx.pushed) return { error: 'fix did not push', fx }

phase('Review')
let head = fx.head
const seen = new Set(), confirmed = [], refuted = []
let round = 0, extra = ''
const LENSES = [
  { key: 'money', p: `Read .claude/agents/payment-engine-reviewer.md and apply its checklist. Lens: every change since ${REVBASE} (the R2M2-1 interestUnplaced/unplacedCents rule, RVM3-2/3, the re-walk fix): can interest be above the cash after ANY reconcile (not only settled) in any upload order, resend, correction chain, two or more take-backs of one chain, a person's later match, a reversal never linked; can the re-walk loop fail to terminate or exceed its bound; integer cents; principal amounts, stages and recovered unchanged; LED-01..18 unchanged; property generators adequate (they must include multiple take-backs, later-dated payments, manual matches); anything beyond 10.1.` },
  { key: 'db', p: `Read .claude/agents/security-reviewer.md and apply its checklist. Lens: every change since ${REVBASE}: the re-walk's cost at size and its queries' plans (tenant scope, RLS, indexes), the widened ATTRIBUTION_CLAIMS measurement, the migration header and runbook text, generated files, the matrix rows against the code, PHI in logs or errors.` },
]
while (round < 4) {
  round++
  const res = await pipeline(LENSES,
    l => agent(`${COMMON}

You review PR #${PR}'s changes since ${REVBASE} (git log --first-parent ${REVBASE}..origin/${BR}; round ${round}). ${l.p} ${CLONE(`${l.key}-${round}`)} Already raised (do not repeat): ${JSON.stringify([...seen]).slice(0, 3000)}. ${extra} Report only real defects with file:line evidence and a reproducing test where possible; list every area covered. ${SAVE(`i126e-rv-${l.key}-${round}.md`, 'checked and found')}`, { label: `review ${l.key} r${round}`, phase: 'Review', schema: FINDINGS }),
    (r, l) => r ? parallel((r.findings || []).filter(f => !seen.has(f.title)).map(f => () => agent(`${COMMON}\n\nYou are a skeptic. Try to REFUTE this ${l.key} finding on PR #${PR} (origin/${BR}): ${JSON.stringify(f)}. Re-run any test it cites (${CLONE(`sk-${l.key}-${f.id}`)}). Real only if it is a defect in this PR's own change, reproducible. Default real=false if the evidence does not hold. ${SAVE(`i126e-sk-${l.key}-${f.id}.md`, 'verdict')}`, { label: `skeptic ${l.key} ${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, review: l.key, verdict: v })))).then(xs => ({ covered: r.covered || [], xs })) : null)
  const got = res.filter(Boolean)
  const fresh = got.flatMap(g => g.xs).filter(Boolean)
  fresh.forEach(f => { seen.add(f.title); (f.verdict && f.verdict.real ? confirmed : refuted).push(f) })
  const crit = await agent(`${COMMON}\n\nCompleteness critic for review round ${round} of PR #${PR}'s changes since ${REVBASE}. Covered: ${JSON.stringify(got.flatMap(g => g.covered)).slice(0, 6000)}. ${got.length < LENSES.length ? 'Some reviewers returned nothing: their lens is uncovered.' : ''} Findings: ${JSON.stringify([...seen]).slice(0, 3000)}. Read the changes (${WT} read-only after git fetch) and name every changed area or risk not covered. Empty if complete.`, { label: `critic r${round}`, phase: 'Review', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'string' } } }, required: ['gaps'] } })
  const gaps = (crit && crit.gaps) || []
  const newConf = fresh.filter(f => f.verdict && f.verdict.real)
  log(`round ${round}: ${fresh.length} new (${newConf.length} confirmed), ${gaps.length} gaps`)
  if (newConf.length) {
    const p = `${D}/r5-round${round}-confirmed.json`
    const fr = await agent(`${COMMON}\n\nFirst write this JSON exactly to ${p} (mkdir -p ${D}), then read it back and fix every finding in it with a failing-first test each in ${WT} (git pull --no-rebase origin ${BR}). A finding whose fix would go beyond 10.1: do not make it; put it in for_founder. Report anything new you discover in open_items. Checks: fast checks; touched unit/db tests; ledger oracle, interest, chain db tests; money-ledger Stryker shard and gate if packages/ledger changed; db:domain-model --check. Commit; push once (fast-forward; also co-001/wip-interest-fix). JSON: ${JSON.stringify(newConf)} ${SAVE(`i126e-fix-r${round}.md`, 'each fix, checks')}`, { label: `fix r${round}`, phase: 'Review', schema: FIXREC })
    if (fr && fr.pushed) head = fr.head
    if (fr && (fr.open_items || []).length) extra = `The last fix agent reported these new issues; review them: ${JSON.stringify(fr.open_items).slice(0, 4000)}. `
  } else extra = ''
  if (!newConf.length && !gaps.length && got.length === LENSES.length) break
  if (gaps.length) extra += `Cover these gaps the critic found: ${JSON.stringify(gaps).slice(0, 5000)}`
}
const dry = round < 4 || (confirmed.length === 0)

phase('Suite')
const suite = await agent(`${COMMON}

Final round for PR #${PR}. In ${WT}: git pull --no-rebase origin ${BR} (head should be ${head}); clean; no marker.
1. Merge the base once: git fetch origin ${BASEBR}; git merge --no-ff origin/${BASEBR} ("Merge claude/build-platform (<sha>) into the interest fix: ..."); keep both sides; regenerate with the tools on a fresh database.
2. The full local suite once on this tree with ${IPR}/suite.sh (copy suite.sh and common.sh to ${SP}/i126e-suite/, set L to ${SP}/i126e-suite/logs; keep every step; Stryker shards resumed on the same commit if the 2-hour background limit cuts them; the gate over all of them on this commit). Known base failure: packages/model-gateway/src/redact.property.test.ts (MOD-16) fails on the base since #133 (d4f52071), not this PR's: confirm it fails identically on origin/${BASEBR} and record it; do not change it here unless a fix already exists on the base.
3. pnpm -s db:domain-model --check and --check --strict (record SHA-256 and approval line).
4. Push once (fast-forward through the hook; also co-001/wip-interest-fix). ${SAVE('i126e-suite.md', 'steps, suite parts with totals, push')}`, { label: '#126: base merge + full suite + push', phase: 'Suite', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, base: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, suite: CHECKS, fixes: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'suite', 'domain_model_sha256'] } })
if (!suite || !suite.pushed) return { error: 'suite stage did not push', fx, confirmed, refuted, suite }

phase('After')
const [cap, body] = await parallel([
  () => agent(`${COMMON}

Run CAS-42.5 for PR #${PR}'s head ${suite.head} (the interest code changed since run 42307508461). Check visibility public; dispatch release-capacity.yml on ${BR} with mcp__github__actions_run_trigger (method run_workflow, workflow_id release-capacity.yml, ref ${BR}; load it with ToolSearch). Find the run whose headSha is ${suite.head}, wait (poll every 5 min up to 3 h, background loop), read the capacity job's log (summary.md is printed there; the artifact download is refused by the proxy): verdict, runner, jobs on attempt 1, advisory locks, working set vs 921.6 MiB, F's reconcile vs 900 s and vs 603.0 s before. ${SAVE('i126e-cap.md', 'run id, verdict')}`, { label: '#126: CAS-42.5', phase: 'After', schema: { type: 'object', properties: { run_id: { type: 'string' }, passed: { type: 'boolean' }, summary: { type: 'string' }, cause: { type: 'string' } }, required: ['passed', 'summary'] } }),
  () => agent(`${COMMON}

Rewrite PR #${PR}'s description for head ${suite.head} (read the current body first with mcp github pull_request_read; use ${IPR}/body-build.py where it helps, copied to ${SP}/i126e-body/). Opens with 'pnpm -s db:domain-model --summary-since origin/${BASEBR} --function-diffs list' run at ${suite.head}, whole; then every section of .github/pull_request_template.md. Findings: one table per round (first round ${IPR}/findings-table.md, corrected where later rounds proved a line wrong; second round ${IPR}/round-2/ and ${SP}/progress/i126c-*.md; third/fourth rounds ${SP}/i126d/ and ${SP}/progress/i126d-*.md; this round ${D}/ and ${SP}/progress/i126e-*.md: confirmed ${JSON.stringify(confirmed.map(f => ({ id: f.id, title: f.title })))}; refuted with reasons ${JSON.stringify(refuted.map(f => ({ id: f.id, title: f.title, reason: (f.verdict && f.verdict.reason || '').slice(0, 160) })))}), each with its resolution and commit; short rows. The founder's trade-offs in plain words (payments that wait for good; anything in for_founder: ${JSON.stringify(fx.for_founder || [])}). Checks: ${JSON.stringify(suite.suite).slice(0, 5000)}; CAS-42.5: say it runs on this head (result added when known). Domain model: SHA-256 ${suite.domain_model_sha256}, line ${suite.approval_line_number}. Freeze exception: the grant word for word. Under 65,536 characters (move long tables to a linked approval-summaries file if needed: write it under ${SP}/i126e-body/ and say so; the session commits it). update_pull_request; read back; confirm length and SHA-256. End with:\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW\n${SAVE('i126e-body.md', 'length, sha')}`, { label: '#126: description', phase: 'After', schema: { type: 'object', properties: { body_chars: { type: 'number' }, readback_matches: { type: 'boolean' }, extra_files: { type: 'array', items: { type: 'string' } } }, required: ['body_chars', 'readback_matches'] } }),
])

phase('Verify')
const ver = await agent(`${COMMON}

You are #${PR}'s fresh-clone verifier at head ${suite.head}. READ-ONLY. Clone into ${SP}/i126e-fv; check out ${suite.head}; pnpm install --frozen-lockfile under the lock.
1. CI on ${suite.head}: wait until every check run completes (poll every 5 min up to 2.5 h). Report each required check. Expected red: "domain model" (log names ONLY the blank approval line) and "all green" (follows it). The base's MOD-16 property failure may turn "unit" red: say whether the failing test is exactly packages/model-gateway/src/redact.property.test.ts and whether it fails identically on the base's latest push run. Any other red: read the log; exact cause.
2. Locally: pnpm typecheck; interest, chain, ledger-oracle, reconciliation-routes db tests on a fresh database; pnpm -s db:domain-model --check (SHA-256 must be ${suite.domain_model_sha256}); 'pnpm -s db:domain-model --check --require-approval': the exact line number and full hash it expects, and the line's text at the head.
3. Function files committed (regenerate; git status clean); no marker/approval text/approvers.json change vs origin/${BASEBR}; origin/${BASEBR} an ancestor of ${suite.head}.
4. PR body < 65,536 and its summary block matches a fresh run.
Remove the clone after. ${SAVE('i126e-verify.md', 'CI per check, local checks, approval line')}`, { label: '#126: fresh-clone verification', phase: 'Verify', schema: { type: 'object', properties: { passed: { type: 'boolean' }, ci: CHECKS, local: CHECKS, approval_line_number: { type: 'number' }, domain_model_sha256: { type: 'string' }, base_is_ancestor: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['passed', 'ci', 'local', 'problems'] } })
return { fx, rounds: round, dry, confirmed, refuted, suite, cap, body, ver }
