export const meta = {
  name: 'lane-b-pr15b-review',
  description: 'Lane B PR 15b (#51) two adversarial reviews: payment-engine, and UX and brand with a before/after screen tour at 1280 and 390 px',
  phases: [
    { title: 'Review', detail: 'payment-engine reviewer; tour capture (base, then head) then the UX and brand reviewer' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const OUT = SP + '/pr15b-review'
const WT = '/home/user/pr15b'
const DESIGN = '/home/user/ops/designs/lane-b-pr15b.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole (CLAUDE.md is in your context). PR #51 (https://github.com/PureTideWater/PhysicalTherapy/pull/51), "PR 15b: ledger amounts in payment terms (combined audit #12)", branch co-001/pr-15b-ledger-payment-terms, worktree ${WT} (head 0e086ed; base claude/build-platform 6ddd587). Its design contract: ${DESIGN} (sections 0.5 rulings, 1 semantics, 2 billable/patient balance, 3 records, 4 files, 5 screens and words, 9 the design review). The PR description: gh api repos/PureTideWater/PhysicalTherapy/pulls/51 --jq .body. The diff: git -C ${WT} diff origin/claude/build-platform...HEAD. The builders' reports: /root/.claude/projects/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/subagents/workflows/wf_128192b0-55e/journal.jsonl (type result lines) and ${SP}/progress/build-*.md.
- The rulings: the founder adopted combined audit #12's best option with its ledger freeze exception (2026-10-20 ~15:10 UTC); Q1 and Q2 taken as recommended under the co-founder's standing ruling of 2026-10-26 ~00:20 UTC. Unchanged by rule: LED-01..LED-13 and their expected amounts; ledger.db.test.ts byte-identical (LED-06's "not resolved" check at :221); the oracle's six cases; packages/ledger additions only beyond the exception; no change under packages/pricing; a new ledger source file in stryker/shards.json; mutation gate above 85% with no unexplained survivor; no migration; no PHI; no model identifier in any artifact; no #42 file beyond the shared documents (/tmp/claude-0/pr42-files.txt).
- You are an ADVERSARIAL reviewer: assume the PR is wrong somewhere, and prove each finding by evidence (a failing probe, a worked example, file:line). Do not edit the worktree ${WT}: probes go in your own detached worktree (git -C /home/user/PhysicalTherapy worktree add --detach ${OUT}/<you>-wt origin/co-001/pr-15b-ledger-payment-terms; pnpm install --frozen-lockfile --prefer-offline; remove it with git worktree remove --force when done). No commit, push or GitHub post. Severity: blocking (a wrong number, a broken rule, a failing check), should_fix, nit. Improvements you find are findings too (kind improvement).
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 at localhost:5433 (postgres:test). Wrap every heavy command (vitest, typecheck, lint, stryker, next build, playwright, the tour's build/serve) in flock /tmp/laneb-heavy.lock; at most two heavy things at once across the machine, so keep each held run short.`

const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fix'] },
    report_path: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, kind: { type: 'string', enum: ['defect', 'improvement'] },
      where: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'kind', 'where', 'issue', 'evidence', 'fix'] } },
    checks_done: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'report_path', 'findings', 'checks_done'],
}

phase('Review')
const engineP = agent(`${CTX}

You are the PAYMENT-ENGINE reviewer: apply .claude/agents/payment-engine-reviewer.md's checklist in full (arithmetic, rounding, signs, caps, windows, trace) to every money change: packages/ledger/src/payment.ts and its test, apps/worker/src/reconcile/{remittances,postings,manual,shortfalls,responses,patient-share}.ts, the web/report figures that read them, the fixtures LED-14..18 and their expected.json, and the records (ADR 0067, PRD 13, reconciliation-001 15b, test-matrix rows). ${SAVE('review-engine.md', 'each check and finding as you go')}
At least: re-derive every LED-14..18 expected amount by hand from the 835s; worked examples beyond the fixtures (coinsurance with a later PLB WO after the proof; a deductible absorbing part then a reversal; two partial check-level postings in one reconcile; interest split across a patient-balance line and a paid line; a payer response typed as the allowed amount; a reversal of a confirmed match; Q2 with nothing remaining; a line whose claim-level PR is allocated); can recovered ever count the patient's share or money never paid, exceed what was approved, go negative, or double count; can any line stay approved-but-not-proved forever on share lines; is "billable to the patient" counted in any total anywhere (grep every sum); do the new matchClaims behaviours beyond the design (re-querying candidates within a pass, the chain's own ordering query, reversalRule's "as of the recoupment") change any LED-01..13 outcome or the oracle, or introduce nondeterminism; is everything inside #12's exception; the additions-only check for packages/ledger/src; LED-01..13 unchanged (git diff of their tests, fixtures and expected.json empty); apply at least four of your own mutants to the worker code (which is not mutation-tested in CI) and show each is killed or a finding; run the money-ledger mutation shard and the gate yourself and confirm the scores; also judge the builders' noted proposals (the interest double count AMT I + PLB L6 in remittances.ts; ledger_match matched_at ordering within one reconcile; the duplicated casePatientBalance in web queries.ts and report content.ts) — whether each belongs in this PR (it touches files this PR already changes) or outside it. Write ${OUT}/engine.md and return the structured result.`, { label: 'review:payment-engine', phase: 'Review', schema: FINDINGS })

const tourP = agent(`${CTX}

You are the SCREEN TOUR capturer for PR 15b's UX review. ${SAVE('review-tour.md', 'each step, each run, each shot set and where it is')}
Read /home/user/ops/tools/lane-b-screen-tour/README.md whole, and design section 5.1 (the routes and the populate plan). You may NOT edit anything under /home/user/ops except new files under /home/user/ops/designs/lane-b-pr15b-tour/ (your capture and populate specs, the manifest) — do not commit them; the lead does.
Goal: before and after shots of the changed screens, at 1280 px and 390 px, on the same synthetic data:
- TOUR_DIR=${OUT}/tour-before with TOUR_REF=6ddd587 (the base), then TOUR_DIR=${OUT}/tour-after with TOUR_REF=origin/co-001/pr-15b-ledger-payment-terms (0e086ed). setup.sh puts the worktree at /home/user/screens; run the two one after the other (the second setup replaces the worktree), each from a fresh prepare.
- Populate: the head's apps/web/e2e/ledger-patient-share.spec.ts and apps/web/e2e/ledger.ts load LED-14, LED-15 and LED-18 (and the fixtures/synthetic/LED-14..18 files they read) through the product. For the BEFORE run, copy those two e2e files and the five fixture directories from the head into the base worktree (/home/user/screens) after setup.sh, so the base build loads the same 835s and exports; if the spec asserts head-only figures, write a populate-only copy in your designs/lane-b-pr15b-tour/ that performs the same uploads and reconciles without the assertions, and use it for BOTH runs. Also run the tour's usual populate journeys (reconciliation, packets) so the dashboard and ROI have data, and generate an ROI statement on demand if the routes allow.
- Capture: a capture spec of your own (copy capture/tour.spec.ts's sign-in and shots.json pattern into designs/lane-b-pr15b-tour/capture.spec.ts) that shoots, for the LED-14, LED-15 and LED-18 practices: /p/[practiceId] (dashboard), /p/[practiceId]/reconciliation (whole page, and ?case=[caseId]), /p/[practiceId]/cases/[caseId], /p/[practiceId]/cases/[caseId]/submissions, /p/[practiceId]/reports/roi and a statement, /p/[practiceId]/abstraction/ledger, /p/[practiceId]/reports, and the audit report PDF's first pages if the tour can render it (see README on PDF pages). Each at 1280 and 390 px, light theme, full page. Give the files the same names in both runs so they pair.
- TOUR_MINUTES=45 for each run. Hold flock /tmp/laneb-heavy.lock for build.sh as the README says. After each run, touch stop, check build.log says "server stopped" and fuser 3297/tcp prints nothing; then drop tp_e2e_screens and rm -rf /tmp/tp-e2e-tp_e2e_screens-*. Remove /home/user/screens at the end (git -C /home/user/PhysicalTherapy worktree remove --force /home/user/screens).
- Write ${OUT}/tour/manifest.json: one entry per pair {name, route, practice, width, before, after} with absolute PNG paths, and note any screen you could not capture and why (never fake one).
Return { manifest_path, pairs, missing, notes } as JSON text.`, { label: 'review:tour', phase: 'Review' })

const tour = await tourP
const ux = await agent(`${CTX}

You are the UX AND BRAND reviewer of PR 15b's changed screens. ${SAVE('review-ux.md', 'each screen judged and each finding as you go')}
The before/after screenshots (base 6ddd587, head 0e086ed; 1280 and 390 px; same synthetic data): the tour capturer's result: ${typeof tour === 'string' ? tour : JSON.stringify(tour)}. Read its manifest (${OUT}/tour/manifest.json) and LOOK at every pair with the Read tool (it shows images).
Review against: .claude/rules/brand.md; docs/brand/BRAND.md; CO-11 in docs/product/change-order-001.md; /home/user/ops/designs/lane-b-ux-review-brief.md (its lenses and what it asks a reviewer to check); design section 5 (the words chosen) and the PR description's "Words a person sees". Check: every new figure is understandable to a billing manager at a glance (is "billable to the patient" clearly not part of any total; is "Payer corrected; balance is the patient's" clear and not alarming; do approved, recovered and their notes read consistently across dashboard, Reconciliation, case page, Reports, the audit report); recovered always carries its proof level; status is text on tint (ADR 0056), never colour alone; numbers align, wrap and do not overflow at 390 px; hierarchy and spacing match the surrounding page; the words against the brand's voice and banned words (also run pnpm lint:copy in a detached worktree); accessibility (labels, aria-describedby on the response form hint, headings order, contrast of any new chip); the PHI gate on reason words (a reader without PHI access sees "the patient's share"); and anything the before/after comparison shows changed that should not have. Also read the changed .tsx and copy in the diff for states the tour did not reach (empty, other-reductions, allocated-from-claim, Q2 words) and judge them from the code. Write ${OUT}/ux.md (cite each screenshot by its path) and return the structured result.`, { label: 'review:ux-brand', phase: 'Review', schema: FINDINGS })

const engine = await engineP
return { engine, tour, ux }
