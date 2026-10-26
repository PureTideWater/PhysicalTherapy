export const meta = {
  name: 'lane-b-pr15b-fix3',
  description: 'Lane B PR 15b (#51) fix round, third iteration: RR1/RR2 (engine) and RX2-1..4 (words) in parallel, the affected suites, one combined re-check',
  phases: [
    { title: 'Fix', detail: 'engine and words in parallel, separate files' },
    { title: 'Suite', detail: 'the affected suites' },
    { title: 'Recheck', detail: 'one combined adversarial re-check' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const R = SP + '/pr15b-review'
const WT = '/home/user/pr15b'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise (check git log in ${WT}), and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief). The account's weekly usage is near its limit: work efficiently, read only what you need, but never cut a check.
- PaidWhole (CLAUDE.md is in your context). PR #51, "PR 15b: ledger amounts in payment terms (combined audit #12)", worktree ${WT}, branch co-001/pr-15b-ledger-payment-terms (pushed head 9b0bcd2; base 6ddd587). Design: /home/user/ops/designs/lane-b-pr15b.md; ADR 0067 in the worktree. The second re-checks' full findings and probes: ${SP}/progress/recheck2-engine.md and recheck2-ux.md (probes under ${R}).
- RULES: integer cents only; one rounding per amount with the exact fraction kept; LED-01..13 tests and amounts unchanged; ledger.db.test.ts byte-identical; oracle's six cases unchanged; packages/ledger/src: only payment.ts, payment.test.ts, index.ts's one export line differ from base; new arithmetic in payment.ts at 100% under mutation; nothing under packages/pricing, migrations, domain-model.md, fixtures/golden, content/releases; no #42 file beyond the shared docs and generated watched-paths.txt; fixtures only via pnpm synth; synthetic data only; no model identifier; never weaken a test.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 localhost:5433 (postgres:test). EVERY heavy command under flock /tmp/laneb-heavy.lock.
- Git: commit under flock /tmp/pr15b-git.lock, only your files by path; subject "PR 15b, fix round: ..." naming the ids; body; end with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Rv82bANhoRiK91FKEN7Pff
  Never push, amend, rebase or post to GitHub.`

const FIX = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'string' } },
    dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'not_a_defect', 'deferred'] }, how: { type: 'string' }, test: { type: 'string' }, commit: { type: 'string' } }, required: ['id', 'disposition', 'how', 'test', 'commit'] } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    wording: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' } },
  },
  required: ['commits', 'dispositions', 'checks', 'wording', 'open'],
}

phase('Fix')
const fixes = await parallel([
  () => agent(`${CTX}

You are the ENGINE FIXER (third iteration). ${SAVE('fix3-engine.md', 'each finding, the change, its test, the commit')}
Your files only: packages/ledger/src/payment.ts and payment.test.ts, apps/worker/src/reconcile/{remittances,postings,patient-share}.ts, apps/worker/src/reconcile/payment-terms.db.test.ts, packages/synth/src/cases/workflow.ts + fixtures via pnpm synth, docs/adr/0067-*.md. Do NOT touch apps/web or apps/worker/src/report (the words fixer's).
- RR1 (blocking): on a multi-line claim, a claim-level CAS change must not move onto lines whose own split inputs did not change. Fix as recommended in recheck2-engine.md: a line whose split inputs (allowed weight, SVC03, own CAS) are unchanged from the claim line it replaces (its paired line in the claim it corrects) keeps its previous claim-level part; the rest of the new claim-level total is split by weight over the lines that changed (all lines when none is paired, or when none changed: then today's split). Keep it pure in payment.ts, one rounding, exact fraction kept, parts summing to CLP04. Expected per the re-check: E11 2400/0/0, N1 2400, N2 2800, N6 0, N3/N5 unchanged. Add the backstop the re-check proposes only if it is needed for a case the first rule does not cover — prefer the rule that makes the backstop unreachable, and if you add it, make it a refusal or a cap stated in ADR 0067. Tests: unit cases and a property in payment.test.ts; db tests for N1/N2/N6 on pnpm synth fixture variants; the existing E9/E11 still pass. Update ADR 0067's paragraph and remove its "open item" wording.
- RR2: make postings' in-pass order deterministic: ORDER BY in settleMatches' case_line query (claim, line_no, service_line_id), and a db test (N8: a short check across two approved lines proves line 1 first, run twice).
Then under the lock: packages/ledger unit; money-ledger mutation shard + gate (payment.ts 100%); apps/worker/src/reconcile db; report db; typecheck ledger/worker/web/synth; eslint changed files; synth tests + synth --all clean. Commit.`, { label: 'fix3:engine', phase: 'Fix', schema: FIX }),
  () => agent(`${CTX}

You are the WORDS FIXER (third iteration). ${SAVE('fix3-ux.md', 'each finding, the change, its test, the commit')}
Your files only: apps/web/src/components/reconciliation/display.tsx and display.test.tsx (and, only if a finding truly needs it, apps/web/src/lib/reconciliation/queries.ts). Do NOT touch the worker or packages/ledger (the engine fixer's).
Fix RX2-1, RX2-2, RX2-3 and RX2-4 from ${SP}/progress/recheck2-ux.md as recommended there: every correction sentence's amounts add up (allowed increase = pays + patient's share + other reductions, with signed words "fell by" for a negative part, the '−' sign as Signed uses), the scope is named when the figures are cumulative across corrections ("Across its corrections the payer raised the allowed amount by $A, pays $P of it (already in the ledger), …; this correction writes no ledger entry"), "balance is the patient's" and the bill-the-patient next step show only when billableCents > 0, and no "of the rest" when nothing is left. Within .claude/rules/brand.md, docs/brand/BRAND.md and CO-11; keep the PHI gate. A display.test.tsx case for each, including a sum check on the rendered amounts. Then under the lock: typecheck apps/web; eslint changed files; pnpm lint:copy; display unit tests; reconciliation-routes db test. Commit.`, { label: 'fix3:words', phase: 'Fix', schema: FIX }),
])
const engine = fixes[0], words = fixes[1]
if (!engine || !words) throw new Error('A fixer returned nothing.')

phase('Suite')
const suite = await agent(`${CTX}

You run THE AFFECTED SUITES on the new head. ${SAVE('fix3-suite.md', 'each command and its counts as it finishes')}
Fixers: ${JSON.stringify({ engine: engine.commits, words: words.commits })}. Method: ${SP}/progress/fix2-suite.md. One at a time under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (whole); pnpm test:golden; pnpm synth --all (clean); engine-freeze check; watched-paths check; pnpm test:db's four shards; build + stamp + e2e ledger-patient-share, packets, reconciliation specs with E2E_PREBUILT=1 --workers=2; tools/stryker/affected.ts then the affected shards and the gate (--expected all six as before); the invariant diffs. Fix only small breaks this PR caused (commit); else open with exact output.`, { label: 'fix3:suite', phase: 'Suite', schema: FIX })
if (!suite) throw new Error('The suite runner returned nothing.')

phase('Recheck')
const recheck = await agent(`${CTX}

You RE-CHECK the third iteration adversarially (you wrote none of it). ${SAVE('recheck3.md', 'each check')}
Findings fixed: RR1, RR2 (${SP}/progress/recheck2-engine.md), RX2-1..4 (${SP}/progress/recheck2-ux.md). Fixers: ${JSON.stringify({ engine: engine.dispositions, words: words.dispositions })}. Suite: ${JSON.stringify(suite.checks)}. Diff: git -C ${WT} diff 9b0bcd2..HEAD.
In a detached worktree of the local branch (git -C /home/user/PhysicalTherapy worktree add --detach ${R}/recheck3-wt co-001/pr-15b-ledger-payment-terms; remove after): re-run the re-checker's probes (N1..N8, E9, E11) and add two multi-line claim-level cases of your own (a deductible change on one line while another line's allowed also changes; a reversal of a claim whose claim-level part moved). Confirm: no approval above what its claim's payment increase can prove; unchanged lines keep their cash; parts sum to CLP04; billable + other reductions reconcile; shares deterministic; LED-01..13 unchanged. For the words, read the diff and tests and check each sentence's amounts add up and the brand rules hold. Verdict pass only if all hold; any new defect is a finding with evidence.`, { label: 'recheck3', phase: 'Recheck', schema: { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fix'] }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'findings', 'checked'] } })
return { engine, words, suite, recheck }
