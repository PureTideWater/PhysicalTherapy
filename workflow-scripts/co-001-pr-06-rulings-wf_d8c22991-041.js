export const meta = {
  name: 'co-001-pr-06-rulings',
  description: 'PR 6 owner rulings of 2026-10-18: price each reduction-affected screening row twice with the unchanged engine and flag an anomaly only below the fully reduced figure; compare against the engine figure before sequestration; keep refusing ZIP+4 localities; allow conversion of a withdrawn-release result with its notice; record the rulings; review and verify',
  phases: [
    { title: 'Build', detail: 'two engine figures, before sequestration, rulings recorded' },
    { title: 'Review', detail: 'engine correctness; guardrails and wording' },
    { title: 'Fix', detail: 'verify every finding, fix the real ones' },
    { title: 'Verify', detail: 'fresh clone, CI-equivalent' },
  ],
}

const WT = '/home/user/pr6'
const BR = 'co-001/pr-06-free-screening'
const COMMON = `
You are finishing PaidWhole Change Order 001 pull request 6 (CO-04 free screening; D11, D18 to D21) in the git worktree ${WT} on branch ${BR} (head 1de403e, built, reviewed and verified; not yet opened as a pull request). Run every command in ${WT}. Never edit, stage or commit in /home/user/PhysicalTherapy, /home/user/pr5 or /home/user/pw-brand. PR 5 is being finished at the same time in /home/user/pr5 and merges first; do not merge it here.
The founder, Tyler Williams, ruled on 2026-10-18 (read ADR 0062's open questions first):
1. Reduction across codes (D19): for a row whose code is in the multiple procedure reduction pool, the UNCHANGED engine prices the row twice: alone (the figure before the reduction across codes, as now) and as a subsequent procedure of a visit, so that the reduction applies to it (the fully reduced figure). Build the second pricing as an ordinary input to price() (for example a two-line synthetic claim whose first line is a higher-valued pool code, or whatever the engine's own inputs allow; read packages/pricing to find the input that makes the engine apply the reduction to the row, and never reimplement the reduction outside the engine). Both figures are engine outputs times the count, in bigint. A row is an anomaly only when its observed amount is more than the anomaly threshold (ADR 0038's $5 per line) below the fully reduced figure; a row between the two figures is labelled "within the range of the reduction across codes", never an anomaly. Show both figures, labelled. Rows outside the pool keep one figure.
2. Sequestration: compare against the engine's own figure before sequestration, read from the engine's trace (the step before sequestration in the calculation the engine already returns), because payer allowed amounts are normally reported before sequestration. Never recompute sequestration outside the engine; if the trace lacks a pre-sequestration amount, stop and say so in open_items instead of computing one. Record that the reimbursement specialist confirms this later (fixtures/golden/QUESTIONS.md Q21) without editing QUESTIONS.md's existing text (append a note only if the file's own conventions allow).
3. ZIP+4: keep refusing a ZIP whose locality needs ZIP+4, with the clear message; an engine change is revisited when release 1's real locality map loads. Record it.
4. Withdrawn release: a result priced under a later-withdrawn release keeps its notice and may still be converted to an audit request (the audit prices nothing from the screening). Record it.
Record all four rulings, dated 2026-10-18 and attributed to the founder, in ADR 0062 (an "Owner rulings" section; update its open questions) and in docs/product/reconciliation-001.md's Approval section if earlier rulings are recorded there (follow its form). Update the screening page copy (lint:copy: no owed, underpaid, recovered, no tagline) and SCR-02's tests for the two figures and the pre-sequestration comparison, with G01's codes (97110, 97140) as a SYNTHETIC case.
Hard rules: nothing under packages/pricing/src (non-test) changes; fixtures/golden and the releases unchanged; money is integer cents, never a float; code computes every number; no PHI anywhere; the 50,000-row result still returns in under 60 s (time it after the change; if pricing twice makes it slow, batch it, and report the time). If a column is added, change this PR's own unmerged migration 20261104090000 only, and regenerate the domain model, leaving it UNAPPROVED: NEVER write an "Approved by:" line or touch approvers.json.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; Postgres 18 at postgres://postgres:test@localhost:5433/postgres (superuser); Postgres 16 at 5432 is used by others, do not stop either. Databases tp_pr6r_<role>_<n> (drop when done); e2e E2E_DATABASE=tp_pr6r_e2e_<role>, E2E_PORT 4201 (build), 4221 (fix), 4231 (verify). PR 5's worktree runs its own tests on ports 4101 to 4131; never touch them. pnpm lint needs about 6 GiB of heap. Local gitleaks 8.24.3 is at /tmp/claude-0/gitleaks/gitleaks. Disk is limited: logs in scratchpad/pr6r-<role>/, delete scratch clones you made, never delete anything you did not create.
Commit in the repository's style (git log), each message ending with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
Push after each commit: git -C ${WT} push -q -u origin ${BR} (retry 4 times, 2/4/8/16 s). Stage only paths you changed; never git add -A, stash, reset --hard, clean, rebase or force-push.
`
const CHECKS = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks', 'open_items'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, issue: { type: 'string' }, reference: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'reference', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'checked'] }

phase('Build')
const build = await agent(`${COMMON}
Your role: build (port 4201). Implement the four rulings with tests that fail before and pass after: a pool code paid between the two figures is not an anomaly; one paid more than $5 below the fully reduced figure is; a non-pool code keeps one figure; the comparison uses the pre-sequestration figure from the trace (a row paid in full at the allowed amount shows no shortfall); a ZIP needing ZIP+4 is refused; a withdrawn-release result converts with its notice. Time the 50,000-row run. Record the rulings. Run typecheck, lint, lint:logs, lint:copy, test, test:golden, synth --all (clean), check:fixtures, test:db on Postgres 18 (report the one expected approval failure), and e2e/screening.spec.ts. Commit and push. Return what you built, the 50,000-row time, checks and open items.`, { label: 'two engine figures, before sequestration, rulings', phase: 'Build', schema: CHECKS })
if (!build) throw new Error('build failed')

phase('Review')
const REVIEW = `${COMMON}
You are a reviewer. Do not edit, commit or push in ${WT}; experiment only in a scratch clone (git clone ${WT} /tmp/claude-0/pr6r-review-<role>, deleted when you finish) with your own databases. The builder reported: ${build.summary}
Report only real problems, with evidence, the rule broken, severity (blocker: a figure not from the engine, a float on money, a hard rule broken, or a ruling not met; major; minor), and the fix.`
const reviews = await parallel([
  () => agent(`${REVIEW}
Your role: engine correctness (the payment-engine reviewer's brief). Confirm packages/pricing/src (non-test) is unchanged and test:golden passes. Check the second pricing makes the unchanged engine apply the reduction across codes to the row exactly as it would in a real visit (compare against golden G01's line-level figures for 97110 and 97140 run through the engine), that both figures are engine outputs times the count in bigint with no rounding after the multiplication, that the pre-sequestration figure is the engine's own trace value (not recomputed) and is the right step, that the anomaly rule uses the fully reduced figure and ADR 0038's threshold, that non-pool and non-Medicare rows are unaffected, and that the 50,000-row time is under 60 s on this machine.`, { label: 'review: engine and figures', phase: 'Review', schema: FINDINGS }),
  () => agent(`${REVIEW}
Your role: guardrails and wording. Check the diff since 1de403e against the hard rules; the four rulings recorded accurately, dated and attributed, in ADR 0062 and the reconciliation; the page and email copy pass lint:copy and say plainly what the two figures and the pre-sequestration comparison mean (no owed, underpaid or recovered, no tagline); brand.md (mono tabular figures, labels with every status color); if the schema changed, pnpm db:domain-model --check --strict passes on a fresh database and no approval line was written.`, { label: 'review: guardrails and wording', phase: 'Review', schema: FINDINGS }),
])
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, reviewer: ['engine', 'guardrails'][i] })))
log(`${findings.length} findings`)

phase('Fix')
const fix = findings.length ? await agent(`${COMMON}
Your role: fix (port 4221). Reviewers reported:
${JSON.stringify(findings, null, 1)}
Verify each first; fix the real ones minimally with tests; reject others with evidence. Run typecheck, lint, lint:logs, lint:copy, test, test:golden, test:db on Postgres 18, and e2e/screening.spec.ts. Commit and push. Summary: one line per finding.`, { label: 'fix review findings', phase: 'Fix', schema: CHECKS }) : null

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify (port 4231). Do not edit the worktree. git clone --branch ${BR} ${WT} /tmp/claude-0/pr6r-verify (remove it first only if you created it), set origin to https://github.com/PureTideWater/PhysicalTherapy and fetch claude/build-platform. With CI=true record each: install --frozen-lockfile; check:fixtures; typecheck; lint; lint:logs; lint:copy; gitleaks over the first-parent range from origin/claude/build-platform; verify-content; tools/check-releases-immutable.sh origin/claude/build-platform; synth --all then a clean tree; test; test:golden; test:oracle; a fresh Postgres 18 database, db:migrate, db:domain-model --check --strict; test:db (only the approval case fails); test:e2e; build; cdk:diff. Prove the rulings in a scratch copy (two figures for a pool code, anomaly only below the reduced one, pre-sequestration comparison, 50,000 rows timed under 60 s). Update /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-approval-summary.md with the rulings and anything they changed in the schema, noting that the document is regenerated again after PR 5 merges. Delete your clone. Commit nothing. Return every check and the head verified.`, { label: 'fresh-clone verification', phase: 'Verify', schema: CHECKS })

return { build, findings, fix, verify }
