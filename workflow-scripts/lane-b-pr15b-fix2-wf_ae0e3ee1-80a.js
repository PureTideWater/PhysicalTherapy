export const meta = {
  name: 'lane-b-pr15b-fix2',
  description: 'Lane B PR 15b (#51) fix round, second iteration: the re-checks findings (R1-R3 engine, RX-1/RX-2 UX), the affected suites, fresh re-checks',
  phases: [
    { title: 'Fix', detail: 'engine (R1-R3) then UX (RX-1, RX-2)' },
    { title: 'Suite', detail: 'the suites the change affects' },
    { title: 'Recheck', detail: 'fresh adversarial re-checks of every fix of the round' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const R = SP + '/pr15b-review'
const WT = '/home/user/pr15b'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise (check git log in ${WT}), and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole (CLAUDE.md is in your context). PR #51, "PR 15b: ledger amounts in payment terms (combined audit #12)", worktree ${WT}, branch co-001/pr-15b-ledger-payment-terms (local head 3513760, five fix-round commits above the pushed 0e086ed; base 6ddd587). Design: /home/user/ops/designs/lane-b-pr15b.md. Reviews: ${R}/engine.md, ${R}/ux.md. Fix round so far: ${SP}/progress/fix-engine.md, fix-ux.md, fix-suite.md (the full local suite passed on 3513760), recheck-engine.md, recheck-ux.md (their findings below), and the shots ${R}/tour/manifest-fixed.json.
- RULES: integer cents only; one rounding per amount with the exact fraction kept beside it; LED-01..13 tests and expected amounts unchanged; ledger.db.test.ts byte-identical; the oracle's six cases and harness unchanged; packages/ledger/src: only payment.ts, payment.test.ts and index.ts's one export line differ from the base, and new arithmetic goes in payment.ts at 100% under mutation; nothing under packages/pricing, migrations, domain-model.md, fixtures/golden, content/releases; no #42 file beyond the shared docs and the generated watched-paths.txt; fixtures only via pnpm synth; synthetic data only; no model identifier; never weaken a test.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 localhost:5433 (postgres:test). EVERY heavy command under flock /tmp/laneb-heavy.lock, one at a time.
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
const RECHECK = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fix'] }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'findings', 'checked'] }

phase('Fix')
const engine = await agent(`${CTX}

You are the ENGINE FIXER (second iteration). ${SAVE('fix2-engine.md', 'each finding, the change, its test, the commit')}
The re-check (${SP}/progress/recheck-engine.md has the full text and probes E9, E11 etc.) found:
- R1 (blocking): claimLinePayments splits the claim-level adjustment D by charge, so on a multi-line claim a claim-level coinsurance/deductible that grew because one line's allowed rose is spread over unchanged lines; the case line's approval then exceeds the claim's payment increase and can never be proved. Fix as recommended: weight D by each taking line's allowed before the claim-level adjustments, |SVC03 + its own PR CAS| (equivalently |SVC02 - its own non-PR CAS|), falling back to charge when that sum is zero; keep truncate-once, the leftover-cent rule and the exact fraction. Coinsurance is proportional to allowed, so this attributes it exactly; state in ADR 0067 that for a deductible or copay reported only at claim level the split by allowed is the best the 835 allows, and that the parts sum to CLP04 exactly. Test with the re-check's E11 (lines' approvals never exceed the claim's payment increase; the case line provable to recovered) as a db test on a pnpm synth fixture variant, plus payment.test.ts unit cases and the property that parts sum to CLP04.
- R2: the display's share split (patient-share.ts lineShares, the parser's rule) must use the same taking lines and weights as the cash (claimLinePayments), so billable + other reductions reconcile with the cash; test E9.
- R3: with several claim-level PR reasons, compute the line's reasons from its single rounded part (split by the same rule) so no false cent of other reductions shows; unit test.
Also consider the fixer's recorded edge (PR at both claim and line level shown as other reductions): with R2's shared rule, make the claim-level PR show as the patient's share there too if it falls out naturally; else record it.
Then run under the lock: packages/ledger unit; the money-ledger mutation shard and the gate (payment.ts 100%, every survivor killed or a recorded equivalent with reason); apps/worker/src/reconcile db tests; report db; reconciliation-routes db; typecheck (ledger, worker, web, synth); eslint on changed files; packages/synth tests and pnpm synth --all (diff clean). Commit.`, { label: 'fix2:engine', phase: 'Fix', schema: FIX })
if (!engine) throw new Error('The engine fixer returned nothing.')

const ux = await agent(`${CTX}

You are the UX FIXER (second iteration). ${SAVE('fix2-ux.md', 'each finding, the change, its test, the commit')}
The re-check (${SP}/progress/recheck-ux.md) found:
- RX-1 (should_fix): at 390 px the UX-8 empty-state sentence inside the entries table is clipped. Fix: when entries.length === 0 and an empty text is given, EntryTable renders <p data-entries="none" className="text-sm text-muted-foreground">{empty}</p> in place of the table, outside the overflow-x-auto wrapper (match the surrounding component's classes); keep the e2e locator working.
- RX-2 (nit): the other_reductions branch must name what the payer paid when an earlier correction paid part (reuse <Pays> as the patient_balance branch does) so the amounts add up; add a display.test.tsx case with paymentIncreaseCents '1000', otherReductionCents '2000'.
The engine fixer's result (its changes to the figures may touch the words): ${JSON.stringify(engine)}
Then run under the lock: typecheck apps/web; eslint on changed files; pnpm lint:copy; the display unit tests; reconciliation-routes db test. Commit.`, { label: 'fix2:ux', phase: 'Fix', schema: FIX })
if (!ux) throw new Error('The UX fixer returned nothing.')

phase('Suite')
const suite = await agent(`${CTX}

You run THE AFFECTED SUITES on the new head. ${SAVE('fix2-suite.md', 'each command and its counts as it finishes')}
The fixers' results: ${JSON.stringify({ engine: engine.commits, ux: ux.commits })}. Follow ${SP}/progress/fix-suite.md's method. Run, one at a time under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (unit + property, whole); pnpm test:golden; pnpm verify-content; pnpm synth --all (diff clean); tools/engine-freeze check; the watched-paths check (tsx tools/screening-capacity/watched.ts | diff - tools/screening-capacity/watched-paths.txt); pnpm test:db's four shards one after another (all must pass; a full db run, since the reconcile, report and routes files changed); the build, the stamp, then e2e: ledger-patient-share.spec.ts, packets.spec.ts and reconciliation.spec.ts with E2E_PREBUILT=1 --workers=2; the money-ledger mutation shard and the gate; the invariant diffs (packages/ledger/src additions only; ledger.db.test.ts identical; LED-01..13 fixtures and expected.json unchanged; no #42 file beyond the allowed). Fix only small breaks this PR caused (commit); anything else goes in open with the exact output.`, { label: 'fix2:suite', phase: 'Suite', schema: FIX })
if (!suite) throw new Error('The suite runner returned nothing.')

phase('Recheck')
const rechecks = await parallel([
  () => agent(`${CTX}

You RE-CHECK the engine fixes of this whole fix round adversarially (you wrote none of them, and you are not the earlier re-checker). ${SAVE('recheck2-engine.md', 'each check')}
Diff: git -C ${WT} diff 0e086ed..HEAD. The findings fixed: B1, S1, S2, S3 (${R}/engine.md) and R1, R2, R3 (${SP}/progress/recheck-engine.md). Fixers: ${JSON.stringify(engine.dispositions)}. Suite: ${JSON.stringify(suite.checks)}.
In your own detached worktree of the local branch (git -C /home/user/PhysicalTherapy worktree add --detach ${R}/recheck2-wt co-001/pr-15b-ledger-payment-terms; remove after), re-run the probes in ${R}/engine-probes and the re-checker's E9/E11, and build at least three new adversarial cases of your own on multi-line claims with claim-level CAS (coinsurance, a deductible, a copay; a reversal of such a claim; a two-line claim where both lines changed). Check: recovered never counts the patient's share or money never paid; no line's approval exceeds what its claim's payment increase can prove; parts sum to CLP04; billable + other reductions reconcile with the cash; share-free lines and LED-01..13 unchanged; the in-pass order deterministic. Verdict pass only if all hold.`, { label: 'recheck2:engine', phase: 'Recheck', schema: RECHECK }),
  () => agent(`${CTX}

You RE-CHECK the UX fixes adversarially (you wrote none of them). ${SAVE('recheck2-ux.md', 'each check')}
Fixed: UX-1..UX-10 (${R}/ux.md), RX-1 and RX-2 (${SP}/progress/recheck-ux.md). UX fixer: ${JSON.stringify(ux.dispositions)}. Read the diff (git -C ${WT} diff 0e086ed..HEAD -- apps/web apps/worker/src/report packages/triage), the fixed shots (${R}/tour/manifest-fixed.json; LOOK at the 390 px ones of the LED-15 practice and the entries tables), the unit tests. RX-1 changed the empty state after the shots: judge it from the code and, if you can cheaply, render the component in a unit test at a narrow container. Check every sentence against .claude/rules/brand.md, docs/brand/BRAND.md and CO-11, and that the amounts in each sentence add up. Verdict pass only if all hold.`, { label: 'recheck2:ux', phase: 'Recheck', schema: RECHECK }),
])
return { engine, ux, suite, recheckEngine: rechecks[0], recheckUx: rechecks[1] }
