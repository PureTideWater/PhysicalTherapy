export const meta = {
  name: 'interest-126-round-4',
  description: 'Acting Lane A on #126: adjudicate the contested LED-R1 finding, fix the remaining confirmed findings, review the F1 fix and every new change (two lenses, skeptics, completeness critic, loop until dry), full local suite once on the final tree, push, CAS-42.5 on the final head, body, fresh-clone verification reading CI',
  phases: [
    { title: 'Adjudicate', detail: 'F-M2-1 vs DB2-1: three independent judges' },
    { title: 'Fix', detail: 'remaining confirmed findings, failing-first; design-text patch for build-ops' },
    { title: 'Review', detail: 'delta d2fdd106..head: payment-engine and database lenses; skeptics; critic; loop until dry, fixing as found' },
    { title: 'Suite', detail: 'base merge once; full local suite once; push' },
    { title: 'After', detail: 'CAS-42.5 on the final head; the PR body' },
    { title: 'Verify', detail: 'fresh-clone verification reading CI' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const D = `${SP}/i126d`
const WT = '/home/user/interest', BR = 'co-001/ledger-interest-once', PRB = 'c49367c5', REV2 = 'd2fdd1060c9b23e7e5bf5d2560db99f8a7826d46', HEAD0 = '9824f4e98938e27d8006f79811197cac6316939e', PR = 126
const BASEBR = 'claude/build-platform'
const IPR = '/home/user/ops/approval-summaries/lane-a-wip/interest-pr'
const DESIGN = '/home/user/ops/designs/ledger-interest-once.md'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW`
const GRANT = `"Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." (the founder, Tyler Williams, relayed by the co-founder, 2026-10-27 20:49 UTC)`
const SAVE = (f, what) => `Save as you go in ${SP}/progress/${f} (${what}); continue from it if it exists. When done you MUST call the StructuredOutput tool with your result: it is your only way to return; budget your work so you reach it.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Acting Lane A on PR #${PR}, the interest fix (interest credited once; ADR 0084; LED-23 to LED-25; migration 20261110090000, unmerged; design ${DESIGN}; first-round findings ${IPR}/findings-table.md). Branch ${BR} at ${HEAD0}: c49367c5 + the first fix round (LED-R1, LED-R2, LED-R3, UX-INT-1, INT-REL-1/2/3) + base merges + d2fdd106 (mutant-killing test) + 8ea33e13 (F1 fix: interestWrites holds a PLB L6's payments while a take-back of a chain that may still hold interest is not written in full; mayYetHold; unlinkedReversals; caseLineChains; LED-23 renumbered reversal now adds no interest) + 9824f4e9 (F2: deploy runbook section and a guard test). The second review round's material is in ${D}/ (todo-findings.json: confirmed and NOT yet fixed; contested.json; last-gaps.json; fix-round.json; i126c-refuted.json). Read files, never rely on truncated text. Worktree ${WT}.
The founder granted the ledger freeze exception: ${GRANT}; stay within section 10.1's text.
Speed rules: CI is the full suite of record; the full local suite runs once on the final tree before the push; the base is merged once right before that push; records short.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); if down: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". PG_BIN_DIR=/opt/pg18/bin. Heavy commands one at a time under flock /tmp/laneb-heavy.lock (shared with another workflow). Long commands: run_in_background and wait. Databases tp_i126d_<role>_<n>, dropped when done. E2e ports 4981-4989.
Marker route only for 20261110090000 via .claude/skills/new-migration/SKILL.md (shell-created, trap-removed, never committed). If refused, stop and report.
Rules: CLAUDE.md in full. NEVER write the approval line or approvers.json; never approve or request changes; never write files through the GitHub connector; never rebase/force/--no-verify; no .gitleaksignore. Generated files regenerated with the tools only. Never skip or loosen a test. No model identifier in files, commits or PR text. ${ATTR}`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const FINDINGS = { type: 'object', properties: { covered: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'title', 'severity', 'evidence'] } } }, required: ['covered', 'findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }
const CLONE = (k) => `Work in your own clone: git clone /home/user/PhysicalTherapy ${SP}/r4-${k}; cd there; git remote set-url origin https://github.com/PureTideWater/PhysicalTherapy.git; git fetch origin ${BR}; git checkout origin/${BR}; pnpm install --frozen-lockfile under the lock. Write nothing in shared worktrees; remove the clone when done.`
const FIXREC = { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, fixed: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, checks: CHECKS, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'fixed', 'checks'] }

phase('Adjudicate')
const judges = await parallel([0, 1, 2].map(i => () => agent(`${COMMON}

You are judge ${i + 1} of 3 on a contested money finding. Read ${D}/contested.json: F-M2-1 (confirmed by its skeptic) and DB2-1 (the same issue from the database lens, refuted by its skeptic). Both claim LED-R1's widening (commit 84534029, apps/worker/src/reconcile/interest-chains.ts, ATTRIBUTION_CLAIMS) changes the case that was already right: a PLB L6 that names the correct (latest) correction now also credits/splits across other claims of the chain. ${CLONE(`judge${i}`)} Write and run your own test on ${HEAD0} (synthetic fixtures only) that shows exactly where the interest lands for a PLB L6 naming the latest correction, against what design ${DESIGN} sections 4 and 4.1 and ADR 0084 say it should be, and against c49367c5's behaviour. Decide: is it a defect in this PR's change (real) or the intended, documented behaviour? Give the exact test, observed and expected cents, and if real the minimal fix within 10.1. ${SAVE(`i126d-judge-${i}.md`, 'test and verdict')}`, { label: `judge ${i + 1}`, phase: 'Adjudicate', schema: { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, test: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'reason'] } })))
const J = judges.filter(Boolean)
const upheld = J.filter(j => j.real).length >= 2
log(`F-M2-1: ${J.filter(j => j.real).length}/${J.length} judges say real -> ${upheld ? 'fix' : 'refuted'}`)

phase('Fix')
const fix1 = await agent(`${COMMON}

You fix the remaining confirmed second-round findings in ${WT} (git status clean; HEAD ${HEAD0}; git pull --no-rebase origin ${BR}). Read ${D}/todo-findings.json whole. Fix each with a failing-first test where a test can show it: DB-C1 (the migration header's wording on readers during the hold phase: a header comment change in 20261110090000 via the marker route only), F-M2-2 (heldInterest rebuilt per line: index it once per pass; prove rows identical and time down on CAS-42.3's shape), DB2-4 (ADR 0084's 'At size' sentence matches the code), ${upheld ? `F-M2-1 (UPHELD by ${J.filter(j => j.real).length} of 3 judges; their tests and fixes: ${JSON.stringify(J).slice(0, 6000)} -- implement the minimal fix within 10.1 with the judges' test as the failing-first test)` : `F-M2-1 is REFUTED by the judges (${JSON.stringify(J.map(j => j.reason)).slice(0, 3000)}): do not change behaviour; make ADR 0084 state the behaviour exactly`}. F-M2-3 and DB2-3 (the PR description) are fixed later by the body step: skip them here. Also check the last critic's gaps (${D}/last-gaps.json): the test matrix rows for the new behaviour (LED-23/24 text), and add a test or note where a gap is real. Write the design-text updates the fix round listed (${D}/fix-round.json open_items[0]) plus yours as a patch file for /home/user/ops/designs/ledger-interest-once.md at ${D}/design.patch (do not write /home/user/ops). Checks: fast checks; unit and db tests of touched files plus the ledger oracle, interest, chain and chain.large db tests; the money-ledger Stryker shard and its gate (interest.ts 100%); pnpm -s db:domain-model --check (if the migration changed: regenerate on a fresh database; record the SHA-256). Commit; push once (fast-forward; also fast-forward co-001/wip-interest-fix). ${SAVE('i126d-fix.md', 'each finding: fixed or rejected, red/green, checks')}`, { label: '#126: remaining fixes', phase: 'Fix', schema: FIXREC })
if (!fix1 || !fix1.pushed) return { error: 'fix did not push', J, fix1 }

phase('Review')
let head = fix1.head
const seen = new Set(), confirmed = [], refuted = []
let round = 0, extra = ''
const LENSES = [
  { key: 'money', p: `Read .claude/agents/payment-engine-reviewer.md and apply its checklist. Lens: the F1 fix (8ea33e13) and every change since ${REV2}: can interest still be credited above the cash (any upload order, resend, correction chain, one PLB L6 netting several claims, a reversal never linked); can a payment wait forever where it should be credited, and is that recorded and shown; mayYetHold's two conditions complete and correct; integer cents; principal amounts, stages and recovered unchanged; LED-01..18 amounts unchanged; the order-independence property's generators adequate; Stryker survivors; anything beyond 10.1.` },
  { key: 'db', p: `Read .claude/agents/security-reviewer.md and apply its checklist. Lens: database, performance and security of every change since ${REV2}: ATTRIBUTION_CLAIMS' root_reversal and the caseLineChains query (tenant scope, RLS, plans at size: CAS-42.3's shape and a take-back-heavy shape), F-M2-2's index, the migration header change, the runbook section and its guard test, PHI in logs or errors.` },
]
while (round < 3) {
  round++
  const res = await pipeline(LENSES,
    l => agent(`${COMMON}

You review PR #${PR}'s changes since ${REV2} (git log --first-parent ${REV2}..origin/${BR}; round ${round}). ${l.p} ${CLONE(`${l.key}-${round}`)} Already raised (do not repeat): ${JSON.stringify([...seen]).slice(0, 3000)}. ${extra} Report only real defects with file:line evidence; list every area covered. ${SAVE(`i126d-rv-${l.key}-${round}.md`, 'checked and found')}`, { label: `review ${l.key} r${round}`, phase: 'Review', schema: FINDINGS }),
    (r, l) => r ? parallel((r.findings || []).filter(f => !seen.has(f.title)).map(f => () => agent(`${COMMON}\n\nYou are a skeptic. Try to REFUTE this ${l.key} finding on PR #${PR} (branch head, origin/${BR}): ${JSON.stringify(f)}. Re-run any test it cites (${CLONE(`sk-${l.key}-${f.id}`)}). Real only if it is a defect in this PR's own change, reproducible. Default real=false if the evidence does not hold. ${SAVE(`i126d-sk-${l.key}-${f.id}.md`, 'verdict')}`, { label: `skeptic ${l.key} ${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, review: l.key, verdict: v })))).then(xs => ({ covered: r.covered || [], xs })) : null)
  const got = res.filter(Boolean)
  const fresh = got.flatMap(g => g.xs).filter(Boolean)
  fresh.forEach(f => { seen.add(f.title); (f.verdict && f.verdict.real ? confirmed : refuted).push(f) })
  const crit = await agent(`${COMMON}\n\nCompleteness critic for review round ${round} of PR #${PR}'s changes since ${REV2}. Covered: ${JSON.stringify(got.flatMap(g => g.covered)).slice(0, 6000)}. ${got.length < LENSES.length ? 'Some reviewers returned nothing: their lens is uncovered.' : ''} Findings: ${JSON.stringify([...seen]).slice(0, 3000)}. Read the changes (${WT}, read-only, after git fetch) and name every changed area or risk not covered. Empty if complete.`, { label: `critic r${round}`, phase: 'Review', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'string' } } }, required: ['gaps'] } })
  const gaps = (crit && crit.gaps) || []
  const newConf = fresh.filter(f => f.verdict && f.verdict.real)
  log(`round ${round}: ${fresh.length} new (${newConf.length} confirmed), ${gaps.length} gaps`)
  if (newConf.length) {
    const p = `${D}/round${round}-confirmed.json`
    const fx = await agent(`${COMMON}\n\nFirst write this JSON to ${p} exactly as given, then read it back and fix every finding in it with a failing-first test each, in ${WT} (git pull --no-rebase origin ${BR}): ${JSON.stringify(newConf)}\nChecks: fast checks; touched unit/db tests; ledger oracle, interest, chain db tests; money-ledger Stryker shard and gate if packages/ledger changed; db:domain-model --check. Commit; push once (fast-forward; also co-001/wip-interest-fix). ${SAVE(`i126d-fix-r${round}.md`, 'each fix, checks')}`, { label: `fix r${round}`, phase: 'Review', schema: FIXREC })
    if (fx && fx.pushed) head = fx.head
  }
  if (!fresh.length && !gaps.length && got.length === LENSES.length) break
  extra = gaps.length ? `Cover these gaps the critic found: ${JSON.stringify(gaps).slice(0, 5000)}` : ''
}

phase('Suite')
const suite = await agent(`${COMMON}

The final round for PR #${PR}. In ${WT}: git pull --no-rebase origin ${BR} (head should be ${head}); clean; no marker.
1. Merge the base once: git fetch origin ${BASEBR}; git merge --no-ff origin/${BASEBR} ("Merge claude/build-platform (<sha>) into the interest fix: ..."); keep both sides; regenerate with the tools on a fresh database.
2. The full local suite once on this tree with ${IPR}/suite.sh (copy suite.sh and common.sh to ${SP}/i126d-suite/, set L to ${SP}/i126d-suite/logs; keep every step): fast checks; unit and property; infra; golden; oracle and ledger oracle; test:db 4 shards on fresh databases; build, stamp, the whole e2e suite (ports 4981-4989); every Stryker shard tools/stryker/affected.ts picks against origin/${BASEBR}, then the gate over all of them on this one commit (if the 2-hour background limit cuts it, resume the remaining shards on the same commit); verify-content; synth diff; check:fixtures; actions:check; toolchain:check; engine-freeze; pnpm -s db:domain-model --check and --check --strict (record SHA-256 and approval line). A failure: root-cause, fix with a test, re-run the affected part; a flake: re-run alone once, report with evidence.
3. Push once (fast-forward through the hook; also co-001/wip-interest-fix). ${SAVE('i126d-suite.md', 'steps, suite parts with totals, push')}`, { label: '#126: base merge + full suite + push', phase: 'Suite', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, base: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, suite: CHECKS, fixes: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'suite', 'domain_model_sha256'] } })
if (!suite || !suite.pushed) return { error: 'suite stage did not push', J, fix1, confirmed, refuted, suite }

phase('After')
const cap = await agent(`${COMMON}

You run CAS-42.5 for PR #${PR}'s head ${suite.head} (required: the reconcile and interest code changed since run 42307508461 on d2fdd106). Check public visibility (gh api repos/PureTideWater/PhysicalTherapy --jq .visibility). Dispatch release-capacity.yml on ${BR} with the MCP tool mcp__github__actions_run_trigger (method run_workflow, workflow_id release-capacity.yml, ref ${BR}) — load it with ToolSearch. Find the run whose headSha is ${suite.head} (mcp github actions_list or gh api reads), wait (poll every 5 min up to 3 h with a background loop), read the capacity job's log (the artifact download is refused by the proxy; summary.md is printed in the log): verdict, runner, jobs on attempt 1, advisory locks, working set against 921.6 MiB, F's reconcile time against 900 s and against the previous 603.0 s. Report the run id and a summary to paste into the PR. ${SAVE('i126d-cap.md', 'run id, verdict')}`, { label: '#126: CAS-42.5', phase: 'After', schema: { type: 'object', properties: { run_id: { type: 'string' }, passed: { type: 'boolean' }, summary: { type: 'string' }, cause: { type: 'string' } }, required: ['passed', 'summary'] } })
const body = await agent(`${COMMON}

Rewrite PR #${PR}'s description for head ${suite.head} (read the current body first with mcp github pull_request_read). Build it with ${IPR}/body-build.py where it helps (copy to ${SP}/i126d-body/; read it first). Opens with 'pnpm -s db:domain-model --summary-since origin/${BASEBR} --function-diffs list' run in ${WT} at ${suite.head} (fresh database if needed), whole; then every section of .github/pull_request_template.md. Findings table: the first round (${IPR}/findings-table.md, correcting any line the later rounds proved wrong: LED-R1, LED-R2's 'never above the cash'); the second round (F1 and MONEY-R2-1 one defect fixed in 8ea33e13; F2/DB-C2 in 9824f4e9; ${D}/todo-findings.json and how each was resolved per ${SP}/progress/i126d-fix.md; F-M2-1's adjudication: ${JSON.stringify(J.map(j => ({ real: j.real, reason: j.reason.slice(0, 300) })))}; refuted ones from ${D}/i126c-refuted.json with reasons); the third round (confirmed ${JSON.stringify(confirmed.map(f => ({ id: f.id, review: f.review, title: f.title })))}; refuted ${JSON.stringify(refuted.map(f => ({ id: f.id, title: f.title, reason: (f.verdict && f.verdict.reason || '').slice(0, 200) })))}). The trade-off for the founder in plain words: a payment netted against a take-back of a reversal whose claim is never uploaded is never credited (low by up to that payment, never above the cash). Checks: the suite's totals ${JSON.stringify(suite.suite).slice(0, 5000)}; CAS-42.5 ${JSON.stringify(cap).slice(0, 2500)}; the UX-INT-1 re-shots held (${SP}/i126c-shots/png). Domain model: SHA-256 ${suite.domain_model_sha256}, line ${suite.approval_line_number}, hazards named. Freeze exception: the grant word for word. Under 65,536 characters; update_pull_request; read back; confirm length and SHA-256. End with:\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW\n${SAVE('i126d-body.md', 'length, sha')}`, { label: '#126: description', phase: 'After', schema: { type: 'object', properties: { body_chars: { type: 'number' }, readback_matches: { type: 'boolean' } }, required: ['body_chars', 'readback_matches'] } })

phase('Verify')
const ver = await agent(`${COMMON}

You are #${PR}'s fresh-clone verifier at head ${suite.head}. READ-ONLY on every worktree and on GitHub. Clone into ${SP}/i126d-fv; check out ${suite.head}; pnpm install --frozen-lockfile under the lock.
1. CI on ${suite.head}: wait until every check run completes (poll every 5 min up to 2.5 h). Every required check green except "domain model" (log names ONLY the blank approval line) and "all green" (follows it). Any other red job: read its log, report the exact cause, and whether it is red on the base too.
2. Locally: pnpm typecheck; interest, chain, ledger-oracle and reconciliation-routes db tests on a fresh database; pnpm -s db:domain-model --check on a fresh database (SHA-256 must be ${suite.domain_model_sha256}); 'pnpm -s db:domain-model --check --require-approval': record exactly the line number and full hash it expects, and the line's text at the head.
3. Regenerated function files committed (regenerate; git status clean); no marker, approval text or approvers.json change against origin/${BASEBR}; origin/${BASEBR} is an ancestor of ${suite.head}.
4. PR body < 65,536 and its summary block matches a fresh run.
Remove the clone after. ${SAVE('i126d-verify.md', 'CI per check, local checks, approval line')}`, { label: '#126: fresh-clone verification', phase: 'Verify', schema: { type: 'object', properties: { passed: { type: 'boolean' }, ci: CHECKS, local: CHECKS, approval_line_number: { type: 'number' }, domain_model_sha256: { type: 'string' }, base_is_ancestor: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['passed', 'ci', 'local', 'problems'] } })
return { judges: J, upheld, fix1, rounds: round, confirmed, refuted, suite, cap, body, ver }
