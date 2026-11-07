export const meta = {
  name: 'interest-126-review-3',
  description: 'Acting Lane A on #126: the second adversarial review round with default agents (the custom reviewer types never return): prove or refute candidate F1 (cross-pass interest overstatement), two lenses, skeptics, completeness critic, loop until dry; fix confirmed findings; UX re-shots; body; verification',
  phases: [
    { title: 'Reviews', detail: 'F1 prover; payment-engine and db/security lenses; skeptic per finding; critic; loop until dry' },
    { title: 'Fix', detail: 'confirmed findings fixed failing-first; touched checks; Stryker affected; one push' },
    { title: 'After', detail: 'UX-INT-1 re-shots; PR body' },
    { title: 'Verify', detail: 'fresh-clone verification reading CI on the final head' },
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
const SAVE = (f, what) => `Save as you go in ${SP}/progress/${f} (${what}); if it exists when you start, continue from it. IMPORTANT: when done, you MUST call the StructuredOutput tool with your result; that call is your only way to return. Budget your work so you always reach it.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Acting Lane A on PR #${PR}, the interest fix (interest credited once; ADR 0084; LED-23 to LED-25; migration 20261110090000_ledger_interest_once.sql, unmerged; design ${DESIGN}; first-round findings ${IPR}/findings-table.md). Branch ${BR} at ${HEAD0} (= c49367c5 + the fix round for LED-R1, LED-R2, LED-R3, UX-INT-1, INT-REL-1, INT-REL-2, INT-REL-3 + base merges + d2fdd106). Full local suite ran once on this tree (green after d2fdd106). CAS-42.5 passed on ${HEAD0} (run 42307508461). Worktree ${WT} at ${HEAD0}.
The founder granted the ledger freeze exception: ${GRANT}; stay within section 10.1's text (fixing interest so it is credited once IS within it; principal amounts, stages, recovered, parser and loader, LED-01..18 amounts stay frozen).
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); if down: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". Heavy commands under flock /tmp/laneb-heavy.lock. Long commands: run_in_background and wait. Databases tp_i126c_<role>_<n>, dropped when done.
Marker route only for 20261110090000 via .claude/skills/new-migration/SKILL.md (shell-created, trap-removed, never committed). If refused, stop and report.
Rules: CLAUDE.md in full. NEVER write the approval line or approvers.json; NEVER approve or request changes; never write files through the GitHub connector; never rebase/force/--no-verify; no .gitleaksignore. Generated files regenerated with the tools only. Never skip or loosen a test. No model identifier in files, commits or PR text. ${ATTR}`
const DIFF = `the delta ${PRB}..${HEAD0}, first-parent only (git log --first-parent ${PRB}..${HEAD0}; exclude the base merges' own content and regenerated files)`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const FINDINGS = { type: 'object', properties: { covered: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'title', 'severity', 'evidence'] } } }, required: ['covered', 'findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }
const CLONE = (k) => `Work in your own clone: git clone /home/user/PhysicalTherapy ${SP}/rv3-${k}; cd there; git remote set-url origin https://github.com/PureTideWater/PhysicalTherapy.git; git fetch origin ${BR}; git checkout ${HEAD0}; pnpm install --frozen-lockfile under the lock. Write nothing in any shared worktree; remove the clone when done.`

phase('Reviews')
const F1 = `Candidate F1 (from the cut-off money reviewer, notes ${SP}/progress/i126b-rv-money-1.md): LED-R2's fix orders take-backs and payments only WITHIN one interestWrites call. With an out-of-order upload (the loader's adoptOrphanReversals, apps/worker/src/... loader.ts:561), reconcile pass 1 sees a take-back that holds nothing while the payment is written on lines L1/L2; pass 2 credits chain a on L1/L2 and A's take-back is blocked (already reached), giving 11.40 of interest where 6.00 was paid: an overstatement, contradicting ADR 0084's "never an overstatement".`
const LENSES = [
  { key: 'f1', prompt: `You are the F1 prover. ${F1} Prove or refute it with a real test: a two-pass reconcile db test (apps/worker/src/reconcile/interest.db.test.ts style, synthetic data only) that uploads the remittances in the order the candidate describes and asserts the interest held on the lines never exceeds what the PLB L6 paid net of take-backs. Run it on ${HEAD0}. If it fails: it is a finding (blocking, money) — give the exact test, the observed and expected cents, and the minimal fix within 10.1 (where the take-back must be applied: deferred, re-evaluated on the next pass, or capped at write). If it passes, explain why the candidate's path cannot occur (cite code). Also check the database reviewer's note: 20261110090000's lock loop takes ACCESS EXCLUSIVE (any reader blocks a try) where 20261109090000's took SHARE/SHARE ROW EXCLUSIVE — is the deploy runbook (docs/runbooks/deploy-and-rollback.md or the migration header) accurate about it, and can the loop starve or hold readers too long?` },
  { key: 'money', prompt: `You are the payment-engine reviewer: read .claude/agents/payment-engine-reviewer.md and apply its checklist. Lens: can interest be credited twice or exceed what the PLB L6 pays after these fixes (including across reconcile passes, resends, corrections and out-of-order uploads); integer cents; rounding; principal amounts, stages and recovered unchanged; the take-back caps; LED-R1/R2/R3 fixes correct and tested; INT-REL-2's refactor keeps every written row identical (already checked equivalent twice: ${SP}/progress/i126b-rv-money-3.md); anything beyond 10.1.` },
  { key: 'db', prompt: `You are the database, concurrency and security reviewer: read .claude/agents/security-reviewer.md and apply its checklist. Lens: INT-REL-3's lock loop in 20261110090000 (lock modes, order, 55P03 handling, deploy safety with the previous image; notes ${SP}/progress/i126b-rv-db-1.md); RLS/FORCE/policies/grants/search_path of every changed function; tenant scope of the reconcile change; INT-REL-1's interest-manager persona; PHI in logs/errors.` },
]
const seen = new Set()
const confirmed = [], refuted = []
let round = 0, extra = ''
while (round < 3) {
  round++
  const lenses = round === 1 ? LENSES : LENSES.filter(l => l.key !== 'f1')
  const res = await pipeline(lenses,
    l => agent(`${COMMON}

${l.prompt}
Review ${DIFF}. ${CLONE(`${l.key}-${round}`)} Do not repeat first-round findings (${IPR}/findings-table.md) or these already raised: ${JSON.stringify([...seen]).slice(0, 3000)}. ${extra}
Report only real defects with file:line evidence; list in "covered" every area you checked. ${SAVE(`i126c-${l.key}-${round}.md`, 'checked and found')}`, { label: `${l.key} r${round}`, phase: 'Reviews', schema: FINDINGS }),
    (r, l) => r ? parallel((r.findings || []).filter(f => !seen.has(f.title)).map(f => () => agent(`${COMMON}

You are a skeptic. Try to REFUTE this ${l.key} finding on PR #${PR} at ${HEAD0}: ${JSON.stringify(f)}. Re-run any test it cites (${CLONE(`sk-${l.key}-${f.id}`)}). Real only if it is a defect this PR introduces or leaves in its own change, reproducible. Default real=false if the evidence does not hold. ${SAVE(`i126c-sk-${l.key}-${f.id}.md`, 'verdict')}`, { label: `skeptic ${l.key} ${f.id}`, phase: 'Reviews', schema: VERDICT }).then(v => ({ ...f, review: l.key, verdict: v })))).then(xs => ({ covered: r.covered || [], xs })) : null)
  const got = res.filter(Boolean)
  if (got.length < lenses.length) log(`round ${round}: ${lenses.length - got.length} reviewer(s) returned nothing`)
  const fresh = got.flatMap(g => g.xs).filter(Boolean)
  fresh.forEach(f => { seen.add(f.title); (f.verdict && f.verdict.real ? confirmed : refuted).push(f) })
  const crit = await agent(`${COMMON}

You are the completeness critic for this review round of PR #${PR}. Reviewers covered: ${JSON.stringify(got.flatMap(g => g.covered)).slice(0, 6000)}. Findings so far: ${JSON.stringify([...seen]).slice(0, 3000)}. ${got.length < lenses.length ? 'Some reviewers returned nothing this round: treat their lens as uncovered.' : ''} Read ${DIFF} (in ${WT}, read-only) and name every changed area or risk NOT covered, with why it matters. Empty list if coverage is complete. ${SAVE(`i126c-critic-${round}.md`, 'gaps')}`, { label: `critic r${round}`, phase: 'Reviews', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'string' } } }, required: ['gaps'] } })
  const gaps = (crit && crit.gaps) || []
  log(`round ${round}: ${fresh.length} new findings (${fresh.filter(f => f.verdict && f.verdict.real).length} confirmed); ${gaps.length} gaps`)
  if (!fresh.length && !gaps.length && got.length === lenses.length) break
  extra = gaps.length ? `The completeness critic found these uncovered areas; cover them: ${JSON.stringify(gaps).slice(0, 5000)}` : ''
}

let head = HEAD0, fix = null
if (confirmed.length) {
  phase('Fix')
  fix = await agent(`${COMMON}

Fix every confirmed finding in ${WT} (git status clean, HEAD ${HEAD0}) with a failing-first test each (keep the prover's test if there is one): ${JSON.stringify(confirmed).slice(0, 14000)}
Then: the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth diff), every unit and db test of the touched files plus the ledger oracle and interest/chain db tests, the Stryker shards tools/stryker/affected.ts picks for the changed files and the gate over them (interest.ts must stay at 100%), and pnpm -s db:domain-model --check (if the migration changed: regenerate with the tools on a fresh database; record SHA-256 and approval line). Update ADR 0084 (and the design's text is outside your write scope: report what it should say). One push (fast-forward through the hook) and fast-forward co-001/wip-interest-fix. ${SAVE('i126c-fix.md', 'each fix red/green, checks, push')}`, { label: '#126: fixes', phase: 'Fix', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, fixed: { type: 'array', items: { type: 'string' } }, checks: CHECKS, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'fixed', 'checks'] } })
  if (!fix || !fix.pushed) return { error: 'fix did not push', confirmed, refuted, fix }
  head = fix.head
}

phase('After')
const shots = await agent(`${COMMON}

Read .claude/agents/ux-brand-reviewer.md and apply it. Re-shoot UX-INT-1's screens for PR #${PR} at ${head}: p.reconciliation.int-paid and p.reconciliation.int-reported-only at 1280 px and 390 px light and 1280 px dark, through the screen tour (tools/lane-b-screen-tour/README.md "From another lane"; an earlier attempt's notes and copied scripts: ${SP}/progress/i126b-shots.md, ${SP}/i126b-shots). ${CLONE('shots')} Ports 4986-4989, database tp_i126c_shots_1. Check each shot against UX-INT-1's fix (${IPR}/findings-table.md) and .claude/rules/brand.md. Keep shots under ${SP}/i126c-shots/; report each path and verdict. ${SAVE('i126c-shots.md', 'shots and verdicts')}`, { label: '#126: UX re-shots', phase: 'After', schema: { type: 'object', properties: { holds: { type: 'boolean' }, shots: { type: 'array', items: { type: 'string' } }, problems: { type: 'array', items: { type: 'string' } } }, required: ['holds', 'shots', 'problems'] } })
const body = await agent(`${COMMON}

Update PR #${PR}'s description (read it first with mcp github pull_request_read; 53,566 characters for ${HEAD0}). If the head changed (now ${head}), regenerate the summary block whole with 'pnpm -s db:domain-model --summary-since origin/${BASEBR} --function-diffs list' in ${WT} and put it at the top. Second-round findings table: replace any earlier "second round" line with the results: confirmed ${JSON.stringify(confirmed.map(f => ({ id: f.id, review: f.review, title: f.title }))).slice(0, 3000)}, fixes ${JSON.stringify(fix && fix.fixed || []).slice(0, 2500)}, refuted with reasons ${JSON.stringify(refuted.map(f => ({ id: f.id, review: f.review, title: f.title, reason: f.verdict && f.verdict.reason }))).slice(0, 4000)}; reviews run: F1 prover, payment-engine, database/concurrency/security, completeness critic (${round} rounds). Checks: CAS-42.5 passed on ${HEAD0} (run 42307508461: 22 jobs on attempt 1, working set 668.3 of 921.6 MiB, F's reconcile 603.0 s of 900 s, at most 22 advisory locks per backend)${head !== HEAD0 ? ' (re-run needed on the new head: say so)' : ''}; the re-shots (${JSON.stringify(shots).slice(0, 1500)}). Domain model: SHA-256 and approval line at ${head}. Under 65,536 characters; update_pull_request; read back. ${SAVE('i126c-body.md', 'length, sha')}`, { label: '#126: description', phase: 'After', schema: { type: 'object', properties: { body_chars: { type: 'number' }, readback_matches: { type: 'boolean' } }, required: ['body_chars', 'readback_matches'] } })
return { rounds: round, confirmed, refuted, fix, head, shots, body }
