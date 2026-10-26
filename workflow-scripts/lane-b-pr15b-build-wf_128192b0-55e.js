export const meta = {
  name: 'lane-b-pr15b-build',
  description: 'Lane B PR 15b build (ledger amounts in payment terms): ledger core and fixtures in parallel, then the worker, then the screens, then an integration check',
  phases: [
    { title: 'Core and records', detail: 'builder 1 (packages/ledger payment.ts) and builder 2 (synth, fixtures, docs, ADR 0067) in parallel' },
    { title: 'Worker', detail: 'builder 3: reconcile in payment terms, db tests, oracle cases' },
    { title: 'Screens', detail: 'builder 4: web, report, triage headline, e2e' },
    { title: 'Integrate', detail: 'whole-branch checks and small integration fixes' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const WT = '/home/user/pr15b'
const DESIGN = '/home/user/ops/designs/lane-b-pr15b.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise (check git log in the worktree for your commits), and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole (CLAUDE.md is in your context). You build part of PR 15b, "ledger amounts in payment terms" (combined audit #12), in the worktree ${WT} on branch co-001/pr-15b-ledger-payment-terms (cut from claude/build-platform 6ddd587; packages installed). The design contract is ${DESIGN}: read it whole first — sections 0.5 (the rulings on Q1 and Q2), 1 (semantics and formulas), 2 (billable to the patient, the patient-balance outcome), 3 (records, exact texts, fixtures, tests), 4 (files), 5 (screens and words), 6 (checks), 8 (build plan) and 9 (the design review's 22 findings, all applied — where section 9 corrects an earlier section, section 9 wins). Build exactly the design; where the code shows the design is wrong or incomplete, do the best option inside the ruling and record it in your report (an engineering choice inside the ruled design is pre-approved; wording a person sees takes the recommended option and is listed).
- RULES THAT NEVER BEND HERE: money is integer cents (bigint), never a float; LED-01 to LED-13's tests and expected amounts do not change, apps/worker/src/reconcile/ledger.db.test.ts stays byte-identical (LED-06's "not resolved" check at :221 included); the ledger oracle's six existing cases and harness are unchanged (append only); packages/ledger/src changes are the new payment.ts (+ test) and one export line in index.ts only; no non-test change under packages/pricing; fixtures/golden and content/releases untouched; no migration, no change under packages/db/migrations, no domain-model change; a new ledger source file gets its stryker/shards.json entry; synthetic data only (packages/synth); no PHI-shaped values in logs, URLs, errors; no model name or identifier in any file or commit. Do not touch any file PR #42 changes (/tmp/claude-0/pr42-files.txt) except the shared docs/product/test-matrix.md, docs/product/reconciliation-001.md, packages/synth/src/cases/registry.ts and matrix.ts (append only, after LED-13).
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. PG18 at localhost:5433 (postgres:test); see how the repo's db tests find their database (vitest config / packages/db test support) and use a database name of your own (e.g. suffix _pr15b_<you>) if the suite allows it. Wrap EVERY heavy command (any vitest run, pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm synth, stryker, next build, playwright) in flock /tmp/laneb-heavy.lock <command>; keep each held run as short as you can (run the files you changed, not the whole repo, until the integration stage).
- Git: other builders commit in the same worktree. Stage only your own files by path (never git add -A or .), and commit under flock /tmp/pr15b-git.lock, e.g. flock /tmp/pr15b-git.lock git -C ${WT} commit -m "..." -- <your paths>. Commit messages: a clear subject naming PR 15b and the part, a body, and end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Rv82bANhoRiK91FKEN7Pff
  Never push, never amend another builder's commit, never rebase. No GitHub posts.
- Improve as you go: an improvement inside your files goes in (list it); one outside goes in your report as a proposal.
- Match the surrounding code's style, comment density and naming (read neighbouring files).`

const BUILD = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'string' }, description: 'sha and subject of each commit you made' },
    files: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    deviations: { type: 'array', items: { type: 'string' }, description: 'where you departed from the design, and why' },
    wording: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    proposals: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' }, description: 'anything unfinished or failing' },
    api: { type: 'string', description: 'the exported signatures later builders use' },
  },
  required: ['commits', 'files', 'checks', 'deviations', 'wording', 'improvements', 'proposals', 'open', 'api'],
}

phase('Core and records')
const coreP = agent(`${CTX}

You are BUILDER 1, the ledger core. ${SAVE('build-b1.md', 'files written, tests passing, mutation results, commits')}
Files: packages/ledger/src/payment.ts (new), packages/ledger/src/payment.test.ts (new; design 3.6 A, including the property test that paymentOutcome equals reprocessing()'s amounts on share-free inputs and every clamp-killing case of section 9), packages/ledger/src/index.ts (one export line), stryker/shards.json (payment.ts in money-ledger's ledger list, sorted). The API exactly as the design gives it (section 1 as corrected by section 9: paymentChain keeping both A_b and P_b, paymentOutcome, reversalTakeBack, patientShareChange, and their types). Pure: no database, clock or model; LedgerError on bad input as matching.ts does.
Then run: the ledger unit tests; typecheck of packages/ledger; lint of your files; and the money-ledger mutation shard and the gate the way CI does it (read .github/workflows/mutation.yml, stryker/, tools/stryker and package.json scripts; run under the lock). Every survivor in payment.ts is killed with a test; record an equivalent only if no input can tell it apart, and say so in your report (a separate reviewer will judge it). Report the shard's score. Commit when green.`, { label: 'build:core', phase: 'Core and records', schema: BUILD })

const recordsP = agent(`${CTX}

You are BUILDER 2, fixtures and records. ${SAVE('build-b2.md', 'files written, fixtures generated, checks, commits')}
Files: packages/synth/src/cases/workflow.ts (led14..led18 as design 3.5 and section 9 S9/S12 give them: coinsurance, deductible all/part/payment-lowered (Q2), copay, N-5 two approvals in its variants, payer response accepted before payment with the ROI statement, the shared-check partial posting and the two-line claim with interest and a WO wherever the design places them), packages/synth/src/cases/registry.ts and matrix.ts (five entries after LED-13; matrix.ts word for word with test-matrix.md; read packages/synth/src/fixtures.test.ts), fixtures/synthetic/LED-14..LED-18/** generated by pnpm synth (never hand-written; the synth-fixture skill describes the machinery), docs/product/test-matrix.md (rows LED-14..LED-18 and the paragraph, exact text from design 3.4), docs/product/reconciliation-001.md (item 15b, the two check amendments, item 15's boundary sentence; design 3.3; record Q1/Q2 per 0.5 and N-5 case (a) per section 9 S10), docs/product/PRD.md (design 3.1: section 13's three places and section 12's parenthetical), docs/adr/0067-<slug>.md (design 3.2; follow the style of docs/adr/0064 and 0066: title, status, context, decision, consequences, the rulings with who and when — the founder's adoption of the combined audit on 2026-10-20 ~15:10 UTC, and the co-founder's standing ruling of 2026-10-26 ~00:20 UTC under which Q1 and Q2 were taken — and the stored case close handed to Lane A). Hand-check every fixture amount against design section 9's arithmetic (each line's charge = CO-45 + PR + paid; BPR totals) and write each case's expected.json the way existing LED cases do.
Then run: pnpm synth --all under the lock and show git diff is clean outside LED-14..18 (and only adds them); the fixtures test (packages/synth/src/fixtures.test.ts) and the synth package's tests; pnpm verify-content if docs changes touch it; markdown/lint checks the repo runs on docs (look at package.json). Commit when green.`, { label: 'build:records', phase: 'Core and records', schema: BUILD })

const core = await coreP
if (!core) throw new Error('Builder 1 returned nothing.')

phase('Worker')
const worker = await agent(`${CTX}

You are BUILDER 3, the worker. ${SAVE('build-b3.md', 'files written, tests passing, commits')}
Builder 1 committed the ledger core: ${JSON.stringify({ commits: core.commits, api: core.api, deviations: core.deviations })}
Builder 2 (fixtures LED-14..18) may still be running; if its fixtures are not committed yet when you need them, build your db tests against the design's case shapes and wait for its commit (check git log) before the final run — do not write fixtures yourself.
Files: apps/worker/src/reconcile/remittances.ts, postings.ts, manual.ts, shortfalls.ts, responses.ts (docblock), patient-share.ts (new: lineCorrections, the claim-level PR allocation with its exact fraction), public.ts (exports), payment-terms.db.test.ts (new: design 3.6 B, including one-pass tests, the N-5 variants, Q2, B2, the shared-check partial posting, the two-line claim with interest and WO), ledger-oracle.db.test.ts (append four CASES entries only). Design sections 1, 2, 9 (B1, B2, S2, S3, S9, S13).
Then run, under the lock, each separately: apps/worker/src/reconcile/payment-terms.db.test.ts; ledger.db.test.ts (must pass byte-identical — confirm git diff empty for it); chain.db.test.ts, lines.db.test.ts, exports.db.test.ts, vendor-exports.db.test.ts, settings.db.test.ts, ledger-oracle.db.test.ts; the worker's unit tests for reconcile; typecheck of apps/worker; lint of your files. Kill these mutants by hand to prove the tests bite (apply, run, revert, record): m7 (reversal takes the line's whole remaining), the gross line-level posting share, approved written in allowed terms. Commit when green.`, { label: 'build:worker', phase: 'Worker', schema: BUILD })
if (!worker) throw new Error('Builder 3 returned nothing.')

phase('Screens')
const screens = await agent(`${CTX}

You are BUILDER 4, the screens. ${SAVE('build-b4.md', 'files written, tests passing, commits')}
Builder 3 committed the worker: ${JSON.stringify({ commits: worker.commits, api: worker.api, deviations: worker.deviations })}
Files (design sections 2, 4, 5, 9 S4-S8, S11, S13): apps/web/src/lib/reconciliation/queries.ts, apps/web/src/app/p/[practiceId]/reconciliation/page.tsx, apps/web/src/components/reconciliation/display.tsx and a new display.test.tsx beside it, apps/web/src/lib/routes/triage.ts, apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx, .../cases/[caseId]/submissions/page.tsx, apps/web/src/app/p/[practiceId]/page.tsx, apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx, apps/web/src/components/reports/display.tsx and display.test.tsx, apps/worker/src/report/html.ts, content.ts, report.test.ts, report-ledger.db.test.ts, packages/triage/src/headline.ts and headline.test.ts, apps/web/src/lib/routes/reconciliation-routes.db.test.ts, apps/web/e2e/ledger-patient-share.spec.ts (new), apps/web/e2e/ledger.ts, apps/web/e2e/packets.spec.ts (label and listing words). The words exactly as design 5.3 and section 9 give them; follow .claude/rules/brand.md, docs/brand/BRAND.md, CO-11 (docs/product/change-order-001.md) and the copy lint; "billable to the patient" is never counted in any total; recovered always carries its proof level (recoveredLabel); status as text on tint (ADR 0056); every figure that shows a patient-share reason gates PHI the way the page already gates it. Never edit lib/dashboard/queries.ts, lib/routes/practice.ts, lib/monitoring/queries.ts or any other #42 file.
Then run, under the lock, each separately: typecheck of apps/web, apps/worker and packages/triage; lint and pnpm lint:copy; the unit tests of the files you changed; reconciliation-routes.db.test.ts and report-ledger.db.test.ts; and the e2e spec ledger-patient-share.spec.ts plus packets.spec.ts and reconciliation.spec.ts (read apps/web/playwright.config.ts and lane-b.md's note: build, stamp, then E2E_PREBUILT=1 with --workers=2; use the repo's e2e database setup; hold the lock for the build and the run). Commit when green.`, { label: 'build:screens', phase: 'Screens', schema: BUILD })
if (!screens) throw new Error('Builder 4 returned nothing.')

const records = await recordsP
if (!records) throw new Error('Builder 2 returned nothing.')

phase('Integrate')
const integ = await agent(`${CTX}

You are the INTEGRATION builder. ${SAVE('build-integrate.md', 'each check and its result, each fix and its commit')}
The four builders' reports: ${JSON.stringify({ core, records, worker, screens })}
1. git -C ${WT} log --oneline origin/claude/build-platform..HEAD and git status: every builder's work is committed, nothing stray (no scratch files, no untracked fixtures outside LED-14..18).
2. The invariants, each shown by command: git diff --exit-code origin/claude/build-platform -- packages/ledger/src ':!packages/ledger/src/payment*.ts' ':!packages/ledger/src/index.ts' (and index.ts only adds one export); git diff --stat origin/claude/build-platform -- packages/pricing (empty apart from tests: none expected), fixtures/golden, content/releases, packages/db/migrations, docs/product/domain-model.md (all empty); apps/worker/src/reconcile/ledger.db.test.ts unchanged; the oracle's six existing cases unchanged; no file of /tmp/claude-0/pr42-files.txt changed except the four shared ones (and those append-only after LED-13 where rows are concerned); stryker/shards.json lists payment.ts and patient-share.ts if the worker shard config covers worker files (check what the shards cover and whether any new source file under a mutated path needs an entry); tools/engine-freeze check passes (run it as CI does).
3. Whole-branch checks under the lock, one at a time: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (unit + property); pnpm test:golden; pnpm verify-content; pnpm synth --all with a clean diff.
Fix only small integration breaks (a type, an import, a lint rule) in the files of this PR, committing each fix; anything larger goes in "open" with the exact failure. Do not run test:db or e2e whole (the fix round does). Report every command's result with counts.`, { label: 'build:integrate', phase: 'Integrate', schema: BUILD })

return { core, records, worker, screens, integ }
