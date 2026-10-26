export const meta = {
  name: 'lane-b-pr15b-fix',
  description: 'Lane B PR 15b (#51) fix round: engine fixes (B1, S1-S3), UX fixes (UX-1..10), the full local suite once, a re-capture at the fixed head and independent re-checks',
  phases: [
    { title: 'Fix', detail: 'engine fixer, then UX fixer, in /home/user/pr15b' },
    { title: 'Suite', detail: 'the full local suite once, one heavy command at a time' },
    { title: 'Recheck', detail: 'after-shots at the fixed head; engine and UX re-checks of each fix' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const R = SP + '/pr15b-review'
const WT = '/home/user/pr15b'
const DESIGN = '/home/user/ops/designs/lane-b-pr15b.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise (check git log in ${WT}), and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole (CLAUDE.md is in your context). PR #51, "PR 15b: ledger amounts in payment terms (combined audit #12)", worktree ${WT}, branch co-001/pr-15b-ledger-payment-terms (pushed head 0e086ed; base claude/build-platform 6ddd587). Design: ${DESIGN}. The reviews: ${R}/engine.md (payment-engine) and ${R}/ux.md (UX and brand), with probes in ${R}/engine-probes and the before/after tour in ${R}/tour (manifest.json) and ${R}/tour-before, ${R}/tour-after; the tour's specs in /home/user/ops/designs/lane-b-pr15b-tour/.
- RULES: integer cents only; any division rounds once with the exact fraction kept beside it; LED-01..LED-13 tests and expected amounts unchanged; apps/worker/src/reconcile/ledger.db.test.ts byte-identical; the oracle's six cases and harness unchanged (append only); packages/ledger/src: only payment.ts, payment.test.ts and index.ts's one export line may differ from the base; nothing under packages/pricing, packages/db/migrations, docs/product/domain-model.md, fixtures/golden, content/releases; no file of /tmp/claude-0/pr42-files.txt beyond the shared docs (test-matrix.md, reconciliation-001.md, synth registry.ts and matrix.ts) and the generated tools/screening-capacity/watched-paths.txt (regenerate it with pnpm exec tsx tools/screening-capacity/watched.ts --write if a new source file is added; never hand-edit); synthetic data only; fixtures only through pnpm synth; no model identifier anywhere; never weaken or skip a test.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. PG18 localhost:5433 (postgres:test). EVERY heavy command (vitest, typecheck, lint, lint:copy, synth, stryker, build, playwright, the tour's build/serve) under flock /tmp/laneb-heavy.lock, one at a time.
- Git: commit under flock /tmp/pr15b-git.lock, staging only your files by path. Messages: a subject "PR 15b, fix round: ..." naming the finding ids, a body, ending with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Rv82bANhoRiK91FKEN7Pff
  Never push, amend, rebase or post to GitHub.
- Wording a person sees takes the reviewer's recommended text (the co-founder's ruling of 2026-10-25 ~21:34 UTC); list every changed sentence. Improvements found inside the PR's files go in; record each.`

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

// RESUMED 2026-10-26 ~09:05 UTC: the session limit stopped fix:suite at its step 22b (all passing so far); the
// machine restarted and setup-container.sh restarted both clusters. The suite continues from progress/fix-suite.md.
// Lock rule unchanged: every heavy command under flock /tmp/laneb-heavy.lock.
phase('Fix')
const engine = await agent(`${CTX}

You are the ENGINE FIXER. ${SAVE('fix-engine.md', 'each finding, the change, its test, the commit')}
Fix, in order, with a test that fails before and passes after for each (show both runs):
- B1 (blocking): a line's cash is its share of CLP04, not SVC03 alone: SVC03 less its allocation of the claim-level CAS (all groups, signed) when the claim carries claim-level adjustments, allocated so the parts sum to CLP04 exactly. Use the parser's own rule for consistency (packages/edi835 balance.ts allocateProRata, by charge, as the loader does for claim-level PR) or @tp/ledger allocateByWeight — choose the best, state why; round once and keep the exact fraction beside the rounded cents. Apply it everywhere the chain reads paid(n), the posting/deposit shares, and patientShareChange/lineCorrections (the claim-level PR is then the patient's share and must not be double-shown as other reductions). Keep any new arithmetic pure and mutation-tested: put it in packages/ledger/src/payment.ts with unit tests if it is arithmetic; the worker only reads rows. Add a claim-level-PR variant to a fixture (pnpm synth; update that case's expected.json through the generator, and its test-matrix/registry text only if the row's words must change — they should not), a db test with probe E8's numbers (approved 24.00, deposited 24.00, payerApproved 24.00, billable 6.00, other reductions 0), and state the rule in ADR 0067 and design-matching docblocks. Confirm LED-01..13 and the oracle unchanged (share-free lines have no claim-level CAS).
- S1: run the candidate closure to a fixpoint first, then process every candidate in the chain's claim order (bpr16_date, created_at, id) so the pass writes what the stored chain later reads; test with probe F1.
- S2: add db tests that kill M4, M7, M5 and M2 (engine.md lists them and their probes: E1, M4P, a PLB WO plus a correction in one reconcile, a reversal then no-change then lower-allowed); apply each mutant, show it is killed, revert.
- S3: one exported casePatientBalance in apps/worker/src/reconcile/patient-share.ts (through public.ts), used by apps/web/src/lib/reconciliation/queries.ts and apps/worker/src/report/content.ts instead of their copies; their tests pass.
Then run under the lock: packages/ledger unit tests; the money-ledger mutation shard and the gate (payment.ts must stay at 100% or every survivor killed/explained); apps/worker/src/reconcile db tests (all files); report db tests; reconciliation-routes.db.test.ts; typecheck of the touched projects; lint of your files. Commit per finding or in one commit per area.`, { label: 'fix:engine', phase: 'Fix', schema: FIX })
if (!engine) throw new Error('The engine fixer returned nothing.')

const ux = await agent(`${CTX}

You are the UX FIXER. ${SAVE('fix-ux.md', 'each finding, the change, its test, the commit')}
The engine fixer's result: ${JSON.stringify(engine)}
Fix UX-1 to UX-10 from ${R}/ux.md, each with the reviewer's recommended text (read each finding's full fix in ux.md): UX-1 (blocking: the patient-balance paragraph leads with the billable figure and says "took all of it" only when billable equals the allowed increase and other reductions are zero, else names the other reductions), UX-2 (print the actual other reductions), UX-3 (the next step on a patient-balance line and the case's Packet card: bill the balance to the patient in the practice-management system; a packet would ask the payer for what it has already paid — word it within brand.md), UX-4 (the response form label), UX-5 (the Billable Fact only when there is something to show), UX-6 (sign inside the mono Money span; non-breaking space between reason and amount), UX-7 (one wording for the no-approval headline on the Reports screen and the PDF), UX-8 (an empty-state row for a line with no entries), UX-9 (shorten the LedgerTotals approved tile note; move the reversal detail into the screen's help, wherever the page keeps its help text — not a #42 file), UX-10 (the allocation sentence). Follow .claude/rules/brand.md, docs/brand/BRAND.md and CO-11; keep the PHI gate. Add or update a unit test for each visible change (display.test.tsx etc.) and the e2e assertions in apps/web/e2e/ledger-patient-share.spec.ts and packets.spec.ts where the words changed.
Then run under the lock: typecheck (apps/web, apps/worker, packages/triage); pnpm lint; pnpm lint:copy; the unit tests of the changed files; reconciliation-routes.db.test.ts and the report db tests. Commit.`, { label: 'fix:ux', phase: 'Fix', schema: FIX })
if (!ux) throw new Error('The UX fixer returned nothing.')

phase('Suite')
const suite = await agent(`${CTX}

You run THE FULL LOCAL SUITE once on the fixed head. ${SAVE('fix-suite.md', 'each command, its exact result and counts, as it finishes')}
Read how Lane B ran it last time: /home/user/ops/approval-summaries/lane-b-pr15-fix-suite.md (the commands, the db shard method, the e2e build/stamp/E2E_PREBUILT=1 --workers=2 method, the mutation shards and the gate), and /home/user/ops/lanes/lane-b.md "One heavy command at a time". Run, one at a time under the lock, recording each command and its counts: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (unit + property); pnpm test:golden; the parser oracle and the ledger oracle as the suite does; pnpm verify-content; pnpm synth --all (diff clean); tools/engine-freeze check against the merge base; pnpm test:db in its shards one after another (as ci.yml's db shards split it); the build, the stamp, then the whole e2e suite with E2E_PREBUILT=1 --workers=2; the mutation shards the change affects (money-ledger at least; read stryker/shards.json and the diff) and then the gate. Also the invariant diffs: packages/ledger/src additions only; ledger.db.test.ts byte-identical; LED-01..13 fixtures and expected.json unchanged; no #42 file beyond the allowed ones. If something fails because of this PR, fix it if small (commit) and re-run that command; anything else goes in open with the exact output. Return every command with its counts in checks.`, { label: 'fix:suite', phase: 'Suite', schema: FIX })
if (!suite) throw new Error('The suite runner returned nothing.')

phase('Recheck')
const tour = await agent(`${CTX}

You RE-CAPTURE the after-shots at the fixed head for the UX re-check. ${SAVE('fix-tour.md', 'each step, run and shot set')}
Use /home/user/ops/tools/lane-b-screen-tour (README) and the PR's own tour specs in /home/user/ops/designs/lane-b-pr15b-tour/ (capture.spec.ts, ledger-tour.spec.ts, pr15b.config.ts, run-pr15b.sh, copy-in.sh; read ${SP}/progress/review-tour.md for how they were run and the pitfalls hit: TOTP collisions, the stale ready file, the attest checkbox loop). TOUR_DIR=${R}/tour-fixed, TOUR_REF=co-001/pr-15b-ledger-payment-terms (the local branch, at its current head), TOUR_MINUTES=45, from a fresh prepare. Shoot the same 69 shots with the same names, plus the reconciliation and case pages of the LED-15 practice's patient-balance line and the submissions form. You may update the specs in /home/user/ops/designs/lane-b-pr15b-tour/ (do not commit). Clean up as the README says (server stopped, fuser 3297/tcp empty, database dropped, temp dirs removed, /home/user/screens removed). Write ${R}/tour/manifest-fixed.json pairing each fixed shot with its before and after (from manifest.json). Return { manifest_path, shots, notes } as JSON text.`, { label: 'fix:tour', phase: 'Recheck' })

const rechecks = await parallel([
  () => agent(`${CTX}

You RE-CHECK the engine fixes adversarially (you did not write them). ${SAVE('recheck-engine.md', 'each finding re-checked')}
The engine fixer's result: ${JSON.stringify(engine)}. The suite's result: ${JSON.stringify(suite)}.
For B1, S1, S2, S3: read the diff (git -C ${WT} diff 0e086ed..HEAD), re-run the original probes from ${R}/engine-probes in your own detached worktree of the local branch head (git -C /home/user/PhysicalTherapy worktree add --detach ${R}/recheck-wt co-001/pr-15b-ledger-payment-terms; remove it after), and confirm each is fixed with the numbers engine.md expected; look for any regression the fixes introduce (rounding of the claim-level allocation — do the parts sum to CLP04, is the fraction kept; does a share-free line change; is LED-01..13 and the oracle unchanged; is the in-pass order deterministic). Return verdict pass only if every fix holds; any new defect is a finding.`, { label: 'recheck:engine', phase: 'Recheck', schema: { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fix'] }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'findings', 'checked'] } }),
  () => agent(`${CTX}

You RE-CHECK the UX fixes adversarially (you did not write them). ${SAVE('recheck-ux.md', 'each finding re-checked, each shot looked at')}
The UX fixer's result: ${JSON.stringify(ux)}. The re-capture: ${typeof tour === 'string' ? tour : JSON.stringify(tour)}. Read ${R}/tour/manifest-fixed.json and LOOK at the fixed shots beside their before/after (Read shows images), at 1280 and 390 px. For UX-1..UX-10 confirm each is fixed as ${R}/ux.md asked, against .claude/rules/brand.md, docs/brand/BRAND.md and CO-11, and that nothing else on those screens regressed. Judge the states the tour does not reach from the diff (git -C ${WT} diff 0e086ed..HEAD) and the unit tests. Return verdict pass only if every fix holds.`, { label: 'recheck:ux', phase: 'Recheck', schema: { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fix'] }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'findings', 'checked'] } }),
])

return { engine, ux, suite, tour, recheckEngine: rechecks[0], recheckUx: rechecks[1] }
