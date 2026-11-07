export const meta = {
  name: 'interest-126-finish-2',
  description: 'Acting Lane A on #126: redo the second adversarial review round on c49367c5..d2fdd106 (two lenses, skeptics, completeness critic, loop until dry), fix any confirmed finding, then CAS-42.5, UX re-shots, body update and fresh-clone verification reading CI',
  phases: [
    { title: 'Reviews', detail: 'payment-engine and db/concurrency/security on the delta; skeptic per finding; completeness critic; loop until dry' },
    { title: 'Fix', detail: 'only if a finding is confirmed: failing-first fixes, touched checks, one push' },
    { title: 'After', detail: 'CAS-42.5 on the final head; UX-INT-1 re-shots; PR body findings and checks' },
    { title: 'Verify', detail: 'fresh-clone verification reading CI; the approval line' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const WT = '/home/user/interest', BR = 'co-001/ledger-interest-once', PRB = 'c49367c5', HEAD0 = 'd2fdd1060c9b23e7e5bf5d2560db99f8a7826d46', PR = 126
const BASEBR = 'claude/build-platform'
const IPR = '/home/user/ops/approval-summaries/lane-a-wip/interest-pr'
const DESIGN = '/home/user/ops/designs/ledger-interest-once.md'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW`
const GRANT = `"Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." (the founder, Tyler Williams, relayed by the co-founder, 2026-10-27 20:49 UTC)`
const SAVE = (f, what) => `Save as you go in ${SP}/progress/${f} (${what}); if it exists when you start, continue from it. Finish by calling StructuredOutput with your result; never end without it.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Acting Lane A (Lane B's account, GitHub login PureTideWater) on PR #${PR}, the interest fix (interest credited once; ADR 0084; LED-23 to LED-25; migration 20261110090000_ledger_interest_once.sql, unmerged; design ${DESIGN}; first-round findings and resolutions ${IPR}/findings-table.md). Branch ${BR} is at ${HEAD0} (= c49367c5 + the fix round's 16 commits for LED-R1, LED-R2, LED-R3, UX-INT-1, INT-REL-1, INT-REL-2, INT-REL-3 + base merges #125, #127, #128 (e81cd5af) + d2fdd106, a test killing two interest.ts:353 survivors). The full local suite already ran once on the final tree (green; only the mutation gate needed d2fdd106). Worktree ${WT} is at ${HEAD0}.
The founder granted the ledger freeze exception: ${GRANT}; stay within section 10.1's text.
Speed rules (lanes/acting-lane-b-2026-11-04.md): CI is the full suite of record; a review round already done stands, only the delta is reviewed; the base is merged once right before the merge (NOT now).
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); if down: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". PG_BIN_DIR=/opt/pg18/bin. Heavy commands one at a time under flock /tmp/laneb-heavy.lock. Long commands: run_in_background and wait. Databases tp_i126b_<role>_<n>, dropped when done.
Marker route only for 20261110090000 via .claude/skills/new-migration/SKILL.md (shell-created, trap-removed, never committed). If refused, stop and report.
Rules: CLAUDE.md in full. NEVER write the approval line or approvers.json; NEVER approve or request changes; post no approval suggestion; never write files through the GitHub connector; never rebase/force/--no-verify; no .gitleaksignore. Generated files regenerated with the tools only. Never skip or loosen a test. No model identifier in files, commits, PR text or comments. ${ATTR}`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const FINDINGS = { type: 'object', properties: { covered: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'title', 'severity', 'evidence'] } } }, required: ['covered', 'findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }
const LENSES = {
  money: { agentType: 'payment-engine-reviewer', lens: 'payment-engine: can interest be credited twice or exceed what the PLB L6 pays after these fixes; integer cents only; rounding; any principal amount, stage or recovered changed; the take-back caps (line-whole and chain); LED-R1/R2/R3 fixes correct and fully tested; INT-REL-2 reconcile refactor keeps every written row identical; d2fdd106\'s test; anything beyond 10.1', prior: 'i126-rv-money.md' },
  db: { agentType: 'security-reviewer', lens: 'database, concurrency and security: INT-REL-3 changed 20261110090000 (the NOWAIT lock loop): lock order, 55P03 handling, deploy-window safety with the previous image; RLS/FORCE/policies/grants/search_path of every changed function; tenant scope of the reconcile change; INT-REL-1\'s interest-manager persona adds no cross-tenant access; PHI in logs/errors', prior: 'i126-rv-db.md' },
}
const DIFF = `the delta ${PRB}..${HEAD0}, first-parent only (git log --first-parent ${PRB}..${HEAD0}; git diff per own commit; exclude the base merges' own content, docs/product/domain-model.md provenance and regenerated files)`

phase('Reviews')
const seen = new Set()
const confirmed = [], refuted = []
let round = 0, extra = ''
while (round < 3) {
  round++
  const keys = Object.keys(LENSES)
  const res = await pipeline(keys,
    k => agent(`${COMMON}

You are the second-round adversarial reviewer (${k}) of PR #${PR}, round ${round}. Review ${DIFF}, in your own clone (git clone /home/user/PhysicalTherapy ${SP}/rv2-${k}-${round}; origin to the real remote; fetch ${BR}; check out ${HEAD0}; pnpm install --frozen-lockfile under the lock). Lens: ${LENSES[k].lens}. An earlier attempt of this review was cut off; its notes are in ${SP}/progress/${LENSES[k].prior} (trust them unless the code says otherwise, and finish what they left). Do not repeat first-round findings (${IPR}/findings-table.md); check their fixes hold. Already raised this round set (do not repeat): ${JSON.stringify([...seen]).slice(0, 3000)}. ${extra}
Run narrow tests to prove a finding. Report only real defects with file:line evidence, and list in "covered" every area you checked. Write nothing in any worktree; remove the clone after. ${SAVE(`i126b-rv-${k}-${round}.md`, 'checked and found')}`, { label: `review ${k} r${round}`, phase: 'Reviews', schema: FINDINGS, agentType: LENSES[k].agentType }),
    (r, k) => r ? parallel((r.findings || []).filter(f => !seen.has(f.title)).map(f => () => agent(`${COMMON}

You are a skeptic. Try to REFUTE this ${k} finding on PR #${PR} at ${HEAD0} (read ${WT} read-only; a scratch clone under ${SP}/sk2-${k}-${f.id} only if a test must run): ${JSON.stringify(f)}. Real only if it is a defect this PR introduces or leaves in its own change, reproducible from the code. Default real=false if the evidence does not hold. ${SAVE(`i126b-sk-${k}-${f.id}.md`, 'verdict')}`, { label: `skeptic ${k} ${f.id}`, phase: 'Reviews', schema: VERDICT }).then(v => ({ ...f, review: k, verdict: v })))).then(xs => ({ covered: r.covered, xs })) : null)
  const got = res.filter(Boolean)
  const fresh = got.flatMap(g => g.xs).filter(Boolean)
  fresh.forEach(f => { seen.add(f.title); (f.verdict && f.verdict.real ? confirmed : refuted).push(f) })
  const covered = got.flatMap(g => g.covered || [])
  const crit = await agent(`${COMMON}

You are the completeness critic for the second review round of PR #${PR}. Reviewers covered: ${JSON.stringify(covered).slice(0, 6000)}. Findings so far: ${JSON.stringify([...seen]).slice(0, 3000)}. Read ${DIFF} yourself (${WT}, read-only) and name every changed area or risk NEITHER reviewer covered (a changed file, function, test, migration clause, word a person reads, or failure mode), with why it matters. Return an empty list if coverage is complete.`, { label: `critic r${round}`, phase: 'Reviews', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'string' } } }, required: ['gaps'] } })
  const gaps = (crit && crit.gaps) || []
  log(`round ${round}: ${fresh.length} new findings (${fresh.filter(f => f.verdict && f.verdict.real).length} confirmed); ${gaps.length} coverage gaps`)
  if (!fresh.length && !gaps.length) break
  extra = gaps.length ? `The completeness critic found these uncovered areas; cover them now: ${JSON.stringify(gaps).slice(0, 5000)}` : ''
}

let head = HEAD0, fix = null
if (confirmed.length) {
  phase('Fix')
  fix = await agent(`${COMMON}

Fix every confirmed second-round finding in ${WT} (git status clean, HEAD ${HEAD0}; git pull --no-rebase origin ${BR} first) with a failing-first test each: ${JSON.stringify(confirmed).slice(0, 12000)}
Then: the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth diff), the unit and db tests the fixes touch, the Stryker shard(s) tools/stryker/affected.ts picks for the changed files plus the gate for them, and pnpm -s db:domain-model --check (record SHA-256 and approval line; if the migration changed, regenerate with the tools on a fresh database). One push (fast-forward), and also fast-forward co-001/wip-interest-fix. ${SAVE('i126b-fix.md', 'each fix with red/green, checks, push')}`, { label: '#126: second-round fixes', phase: 'Fix', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, fixed: { type: 'array', items: { type: 'string' } }, checks: CHECKS }, required: ['head', 'pushed', 'fixed', 'checks'] } })
  if (!fix || !fix.pushed) return { error: 'fix did not push', confirmed, refuted, fix }
  head = fix.head
}

phase('After')
const [cap, shots] = await parallel([
  () => agent(`${COMMON}

You run CAS-42.5 for PR #${PR}'s head ${head} (required: INT-REL-2 changed the reconcile). First check whether a release-capacity run already exists for ${head} (gh run list --repo PureTideWater/PhysicalTherapy --workflow release-capacity.yml --branch ${BR} --json databaseId,headSha,status,conclusion); reuse it if so. Else: gh api repos/PureTideWater/PhysicalTherapy --jq .visibility must print public; dispatch: gh workflow run release-capacity.yml --repo PureTideWater/PhysicalTherapy --ref ${BR}. Find the run (headSha must equal ${head}), wait for it (poll every 5 min up to 3 h with a background loop), download the release-capacity artifact into ${SP}/i126b-cap/ and read summary.md and release-capacity.json: verdict, runner line, every job on attempt 1, advisory locks, working set against 921.6 MiB, the reconcile step's time. A failure: read the log, report the exact cause. ${SAVE('i126b-cap.md', 'run id, verdict')}`, { label: '#126: CAS-42.5', phase: 'After', schema: { type: 'object', properties: { run_id: { type: 'string' }, passed: { type: 'boolean' }, summary: { type: 'string' }, cause: { type: 'string' } }, required: ['passed', 'summary'] } }),
  () => agent(`${COMMON}

You re-shoot UX-INT-1's screens for PR #${PR} at ${head}: p.reconciliation.int-paid and p.reconciliation.int-reported-only at 1280 px and 390 px light and 1280 px dark, through the screen tour (tools/lane-b-screen-tour/README.md "From another lane", on the base or /home/user/ops; read-only), in your own clone under ${SP}/i126b-shots-clone, ports 4986-4989, database tp_i126b_shots_1. Check each shot against UX-INT-1's fix (${IPR}/findings-table.md) and .claude/rules/brand.md: the words, 390 px layout, dark contrast, focus. Keep shots under ${SP}/i126b-shots/; report each path and verdict. Remove the clone after. ${SAVE('i126b-shots.md', 'shots and verdicts')}`, { label: '#126: UX re-shots', phase: 'After', agentType: 'ux-brand-reviewer', schema: { type: 'object', properties: { holds: { type: 'boolean' }, shots: { type: 'array', items: { type: 'string' } }, problems: { type: 'array', items: { type: 'string' } } }, required: ['holds', 'shots', 'problems'] } }),
])
const body = await agent(`${COMMON}

Update PR #${PR}'s description (read it first with mcp github pull_request_read; it was refreshed for ${HEAD0}, 51,089 characters). Keep the summary block at the top; regenerate it whole with 'pnpm -s db:domain-model --summary-since origin/${BASEBR} --function-diffs list' only if the head changed from ${HEAD0} (head now ${head}). In the findings table add the second round: confirmed ${JSON.stringify(confirmed.map(f => ({ id: f.id, review: f.review, title: f.title }))).slice(0, 3000)} with fixes ${JSON.stringify(fix && fix.fixed || []).slice(0, 2000)}; refuted with the skeptic's reason ${JSON.stringify(refuted.map(f => ({ id: f.id, review: f.review, title: f.title, reason: f.verdict && f.verdict.reason }))).slice(0, 4000)}; if none, one line saying the second round (payment-engine; database, concurrency and security; completeness critic) found no defects. Checks: add CAS-42.5 (${JSON.stringify(cap).slice(0, 2500)}) and the UX re-shots (${JSON.stringify(shots).slice(0, 1500)}). Domain model: SHA-256 and approval line as at ${head}. Under 65,536 characters; update_pull_request; read back; confirm length and SHA-256. ${SAVE('i126b-body.md', 'length, sha')}`, { label: '#126: description', phase: 'After', schema: { type: 'object', properties: { body_chars: { type: 'number' }, readback_matches: { type: 'boolean' } }, required: ['body_chars', 'readback_matches'] } })

phase('Verify')
const ver = await agent(`${COMMON}

You are #${PR}'s fresh-clone verifier at head ${head}. READ-ONLY on every worktree and on GitHub. Clone into ${SP}/i126b-fv; check out ${head}; pnpm install --frozen-lockfile under the lock.
1. CI on ${head}: wait until every check run completes (poll every 5 min up to 2.5 h). Every required check green except "domain model" (its log must name ONLY the blank approval line) and "all green" (which follows it). Read any other red job's log and report its exact cause; re-read a flaky failure's history (is it red on the base too?).
2. Locally: pnpm typecheck; the interest, chain, ledger-oracle and reconciliation-routes db tests on a fresh database; pnpm -s db:domain-model --check on a fresh database (record SHA-256); then 'pnpm -s db:domain-model --check --require-approval' and record exactly the line number and full hash it expects, and the line's current text at the head.
3. Regenerated function files committed (regenerate in the clone; git status clean); no marker, no approval text, no approvers.json change against origin/${BASEBR}; whether origin/${BASEBR} is an ancestor of ${head} (the up-to-date rule).
4. PR body < 65,536 characters and its summary block matches a fresh run.
Remove the clone after. ${SAVE('i126b-verify.md', 'CI per check, local checks, approval line')}`, { label: '#126: fresh-clone verification', phase: 'Verify', schema: { type: 'object', properties: { passed: { type: 'boolean' }, ci: CHECKS, local: CHECKS, approval_line_number: { type: 'number' }, domain_model_sha256: { type: 'string' }, base_is_ancestor: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['passed', 'ci', 'local', 'problems'] } })
return { rounds: round, confirmed, refuted, fix, head, cap, shots, body, ver }
