export const meta = {
  name: 'lane-b-ux-home-figures-fix',
  description: 'PR #93 fix round: the verified review findings, a fourth review round on the fixes, then the full local suite once and a commit',
  phases: [
    { title: 'Fix', detail: 'the money side and the screens side in parallel (disjoint files), then the records' },
    { title: 'Re-review', detail: 'one more adversarial round per lens on the fixes, each finding verified; real ones applied' },
    { title: 'Suite', detail: 're-read, the full local suite once, a commit (no push)' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e9e32b44-ea9a-56f5-83b4-9164e617462b/scratchpad'
const WT = '/home/user/ux-home-figures'
const HEAD = '87691be4'
const BASE = '43565235'
const SESSION = 'https://claude.ai/code/session_01FcouKPLmdYyBmbVaUjag2c'
const FINDINGS = `${SP}/hom-review-findings.json`
const COMMON = `You are a builder in the fix round of PR #93 of the PaidWhole build (PureTideWater/PhysicalTherapy): UX PR 9, co-001/ux-home-figures, "one actionable figure on the home and the ROI statement; the Recovered tile names its period" (UX-003, UX-015, UX-140; ADR 0082). Worktree ${WT}, head ${HEAD} (base ${BASE} merged in; CI green on every check). Work only there; do NOT commit or push unless your part says so.
The verified review findings are in ${FINDINGS}: each has id, severity, file, line, title, failure, fix, and verdict {real, severity, reasoning, fix}. Only findings with verdict.real true are to be fixed; where the verdict's fix differs from the reviewer's, the VERDICT's fix wins (it was checked against the code). The design is /home/user/ops/designs/lane-b-ux-home-figures.md (dispositions F1-F13 win); the ADR is docs/adr/0082-*.md.
The session's dispositions (follow them exactly):
- engine-r1-E1: the verdict's test (write off one case line and move one on inside the rolled-back counted() transaction; assert the check runs only for lines at actionable and not written off).
- engine-r1-E2: the verdict's fix (assert against practiceLedgerTotals itself or an independent oracle, as the verdict says).
- engine-r1-E3 with ux-r1-UX-R1-01 (one fix): Net expected value on the case page: on a resolved or closed case show "—" with the reason "the case is resolved or closed; nothing is left to pursue"; on a worked case whose figure has no line, no amount: "Not computed: no line is in the actionable figure now (<outOfFigureWords>)" or, when every line is written off, "Not computed: every line is written off"; otherwise the amount as now; null stays "—" (not estimated). Keep it in CaseSummary as the verdicts say (a state field), tests for each branch; one ADR sentence (docs part).
- engine-r1-E4: reconciliation-001.md is a #42 file: do NOT edit it. Put the sentence in ADR 0082 instead, and list the reconciliation-001 line as a follow-up after #42 (docs part).
- engine-r2-R1: the verdict's standing-entry rule for firstOn (never a reversed, adjusted or since-reversed entry), its oracle and property-test changes.
- engine-r2-R2 and the PR-body nits: the suite agent updates ${SP}/pr93-body.md (the watched-paths.txt overlap with #42); the session publishes it.
- engine-r3-R2 (nit): the verdict's ADR sentence and test comment only; the line's remaining ask is a Lane A follow-up named in the ADR.
- engine-r3-R3: the verdict's doc-comment fix.
- ux-r1-UX-R1-02 and ux-r3-ux-r3-02: the Payer approved notes say the figure is cumulative and keep "never the patient’s share" on both, by proof level, short enough that the tiles keep one height; words must pass pnpm lint:copy (its DENIED rule rejects "until it is"/"not yet" before deposited/posted).
- ux-r1-UX-R1-03: the verdict's fix: run HOM-04 twice under the lock first; if stable, pin '$0.00' and the exact note on the tile and '$0.00' on Cases, the case page and the statement; if unstable, root-cause the race and fix it, never loosen the assertion.
- ux-r1-UX-R1-04: keep the quarter key whole (the repo's WholeDates/whitespace-nowrap pattern, ADR 0078 Decision 1), test.
- ux-r1-UX-R1-05, -06, -07, ux-r2-ux-r2-01, -02, -03, -05, -06, ux-r3-ux-r3-01, -03: each verdict's fix.
- Refuted (verdict.real false: engine-r1-E5, engine-r3-R1, ux-r2-ux-r2-04): no change.
Rules: never edit a PR #42 file (${SP}/pr42-files.txt) except adding rows to docs/product/test-matrix.md and packages/synth/src/cases/{matrix,registry}.ts and tools/screening-capacity/watched-paths.txt as its generator writes it; no migration; nothing under packages/pricing, packages/ledger or packages/db; no new dependency; money in integer cents through the repo's helpers (parseCents, sumCents, centsToString), never Number on an amount; no model identifier in any file; synthetic data only. Write code that reads like the surrounding code (doc comments in the repo's voice); words follow .claude/rules/brand.md and pass pnpm lint:copy. export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command; every heavy command only under flock /tmp/laneb-heavy.lock, long ones with run_in_background and waited on by notification; db tests with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18; 5432 is 16). Run eslint, tsc and the tests of the files you touch. Improve as you go: inside your files, do it and report it; outside, list it in notes. Report every command and result honestly.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RESULT = { type: 'object', properties: { done: { type: 'array', items: { type: 'string' } }, filesChanged: { type: 'array', items: { type: 'string' } }, commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } }, notDone: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['done', 'filesChanged', 'commands', 'notDone', 'notes'] }
const FINDS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' }, failure: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'title', 'failure', 'fix'] } }, checkedSound: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['findings', 'checkedSound', 'summary'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit', 'not a defect'] }, reasoning: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'severity', 'reasoning', 'fix'] }

phase('Fix')
const parts = await parallel([
  () => agent(`${COMMON}
${SAVE('hom-fix-money.md', 'what is done, commands and results')}
Your part, the money side (only these files): engine-r1-E1 (home-figures.db.test.ts), engine-r1-E2 and engine-r2-R1 (reconcile/statements.ts recoveredPeriods, recovered-periods.test.ts, and any LED-06 assertion in reconciliation-routes.db.test.ts the standing rule changes), engine-r3-R2's test comment (reconciliation-routes.db.test.ts), engine-r3-R3 (lib/dashboard/queries.ts and actionable-now.ts doc comments). Write any ADR sentence your fixes need to ${SP}/progress/hom-fix-adr-notes.md for the docs part.`, { label: 'fix-money', phase: 'Fix', schema: RESULT }),
  () => agent(`${COMMON}
${SAVE('hom-fix-screens.md', 'what is done, commands and results')}
Your part, what a person sees (only these files and their tests): engine-r1-E3 with ux-r1-UX-R1-01 (lib/triage/queries.ts CaseSummary, cases/[caseId]/page.tsx), ux-r1-UX-R1-02 and ux-r3-ux-r3-02 (components/reconciliation/display.tsx), UX-R1-04, ux-r3-ux-r3-01 (components/dashboard/headline.tsx and test), UX-R1-05 and ux-r2-ux-r2-06 (components/triage/display.tsx and test), UX-R1-06, ux-r2-ux-r2-02 and -05 (cases/page.tsx), ux-r2-ux-r2-03 (case page), UX-R1-07 (report/recovered-words.ts), ux-r3-ux-r3-03 (reports/roi/[statementId]/page.tsx), UX-R1-03 and ux-r2-ux-r2-01 (e2e reconciliation.spec.ts; and any other spec whose words change: ledger-patient-share, monitoring, packets, triage). Run the changed e2e specs once after a build (E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres E2E_DATABASE=tp_e2e_homfix E2E_PORT=3192 --workers=2; drop the database after). Write any ADR sentence your fixes need to ${SP}/progress/hom-fix-adr-notes.md (append) for the docs part.`, { label: 'fix-screens', phase: 'Fix', schema: RESULT }),
])
const docs = await agent(`${COMMON}
${SAVE('hom-fix-docs.md', 'what is done')}
The two fix builders are done: ${JSON.stringify(parts).slice(0, 8000)}. Your part, the records: ADR 0082 (the sentences in ${SP}/progress/hom-fix-adr-notes.md; engine-r1-E3/UX-R1-01's Net expected value rule; engine-r1-E4's freeze-record sentence, with the reconciliation-001.md line named as a follow-up after #42; engine-r3-R2's remaining-ask sentence as a Lane A follow-up); docs/product/test-matrix.md HOM rows and packages/synth/src/cases/matrix.ts only if an assertion changed in substance (identical to each other; then pnpm synth --all under the lock, only HOM expected.json files may change). Keep the ADR's structure and voice.`, { label: 'fix-docs', phase: 'Fix', schema: RESULT })

phase('Re-review')
const lenses = [
  { key: 'engine', body: 'You are the payment-engine reviewer (.claude/agents/payment-engine-reviewer.md checklist, as a default agent): money arithmetic, cents, ledger reads, Recovered only from posted or deposited entries, firstOn, the predicate and its tests.' },
  { key: 'ux', body: 'You are the UX and brand reviewer (.claude/agents/ux-brand-reviewer.md checklist, as a default agent; no new screenshots: read the code, the unit renders and the e2e): every changed word against .claude/rules/brand.md and pnpm lint:copy, consistency of the notes across the home, Reconciliation, the case page, Cases and the ROI page and PDF, layout at 390 px (whole dates, no breaks), accessibility.' },
]
const reverify = (l, f) => agent(`${COMMON}
You are an independent skeptic. Try to REFUTE this ${l.key} finding on the fix round's uncommitted changes in ${WT} (read-only). Default to not real if it cannot be shown with a realistic input or state. If real, say whether the severity and fix are right, or give a better fix.
Finding: ${JSON.stringify(f)}`, { label: `reverify-${l.key}-${f.id}`, phase: 'Re-review', schema: VERDICT }).then((v) => ({ ...f, verdict: v }))
const rereviewOne = async (l) => {
  const r = await agent(`${COMMON}
${SAVE(`hom-rereview-${l.key}.md`, 'what you checked, findings so far')}
${l.body} This is the fourth review round, on the fix round's uncommitted changes (git -C ${WT} diff ${HEAD}; read-only: do not edit). The earlier rounds' findings are in ${FINDINGS}; do not repeat them. Attack the fixes: did each one fix its finding, and did any introduce a new defect? Each finding cites file:line, a concrete failure and the exact fix.`, { label: `rereview-${l.key}`, phase: 'Re-review', schema: FINDS })
  if (r === null) return { refused: 'the review returned nothing', findings: [] }
  const fs = await parallel((r.findings ?? []).map((f) => () => reverify(l, f)))
  return { ...r, findings: fs.filter(Boolean) }
}
const rereview = await parallel(lenses.map((l) => () => rereviewOne(l)))
const fresh = rereview.flatMap((r) => (r?.findings ?? []).filter((f) => f.verdict?.real))
log(`re-review: ${fresh.length} real finding(s) on the fixes`)
const applied = fresh.length === 0 ? null : await agent(`${COMMON}
${SAVE('hom-fix-rereview-apply.md', 'what is done')}
Apply these verified findings from the fourth review round (the verdict's fix wins), in the files they cite, with tests: ${JSON.stringify(fresh).slice(0, 12000)}`, { label: 'fix-rereview', phase: 'Re-review', schema: RESULT })

phase('Suite')
const suite = await agent(`${COMMON}
${SAVE('hom-fix-suite.md', 'each check and command, its result, each fix made, the commit')}
You are the fix round's re-read and full local suite, after the builders. Their results: ${JSON.stringify({ parts, docs, rereview, applied }).slice(0, 14000)}
1. Re-read each real finding in ${FINDINGS} and the fourth round's (above) against the code and the dispositions; say for each: fixed (where), or why no change, and whether it holds. Fix what does not hold (minimal). Check git diff --name-only ${BASE} against ${SP}/pr42-files.txt (only rows added to test-matrix.md, synth matrix.ts and registry.ts, and watched-paths.txt as its generator writes it); nothing under packages/pricing, packages/ledger or packages/db.
2. The full local suite ONCE, each command under the lock, Node 24, the way /home/user/ops/approval-summaries/lane-b-ux-suspended-standing-fix-suite.md ran it (and lanes/lane-b.md "One heavy command at a time"): pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm verify-content; the engine-freeze check against the merge base (tsx tools/engine-freeze/check.ts ${BASE}); pnpm exec tsx tools/screening-capacity/watched.ts --write then git diff --exit-code on watched-paths.txt (keep a regenerated file); pnpm synth --all then git diff --exit-code; pnpm test; pnpm test:golden; pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3); pnpm test:db in 4 fresh PostgreSQL 18 shards on port 5433, one after another; pnpm build, the build stamp, then pnpm test:e2e with E2E_PREBUILT=1 in two shards (--workers=2), its own database and port (drop it after); tsx tools/stryker/affected.ts --event pull_request --base ${BASE} and the shards it names, then the gate. Find the exact command forms in package.json, docs/runbooks/ci.md and the record. A failure is root-caused and fixed, then that command re-run; a flake gets one re-run and is reported as such.
3. When everything passes, commit the fix round in ${WT} on co-001/ux-home-figures as one commit (a subject naming what changed, a body listing the findings fixed by id), ending with a blank line then:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Do NOT push: the session pushes. Update ${SP}/pr93-body.md to the fix round (the reviews and their dispositions in the reviewer table, the changed words, the test counts from this suite, engine-r2-R2's watched-paths.txt overlap with #42, the follow-ups) but do not publish it. Write the suite's record to /home/user/ops/approval-summaries/lane-b-ux-home-figures-fix-suite.md in the record's format (commits, re-read, dispositions, suite table, proposals), shortening any 40- or 64-hex hash to 8 digits and an ellipsis; do not commit or push build-ops.
Return the commit SHA in done, the suite results in commands, anything failing in notDone.`, { label: 'fix-suite', phase: 'Suite', schema: RESULT })
return { parts, docs, rereview, applied, suite }
