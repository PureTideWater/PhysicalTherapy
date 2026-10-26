export const meta = {
  name: 'lane-b-release-content-checks-design',
  description: 'Design for release content checks (#7, #30, #31, #59): five scouts, an author, one adversarial reviewer, a revision',
  phases: [
    { title: 'Scout', detail: 'five read-only scouts map the code each item touches, at claude/build-platform 6ddd587' },
    { title: 'Author', detail: 'writes designs/lane-b-release-content-checks.md, the build contract' },
    { title: 'Review', detail: 'one adversarial reviewer: content integrity, fail-closed, freezes, #42 files, security, no migration' },
    { title: 'Revise', detail: 'the author answers every finding in the design' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6dcacc47-f55b-5ed0-ab9e-d8b495c8bdd9/scratchpad'
const DD = '/home/user/ops/designs/lane-b-release-content-checks'
const DESIGN = '/home/user/ops/designs/lane-b-release-content-checks.md'

const RULES = `Context: you work for Lane B of the PaidWhole build (CLAUDE.md is in your context; lane rules /home/user/ops/LANES.md rules 1-12 and queue item 14; Lane B conventions in /home/user/ops/lanes/lane-b.md, sections "How Lane B runs: conventions and pitfalls" and "Rulings and decisions of record"). The item: the release content checks, combined audit items #7, #30, #31 and #59 (read them in /home/user/ops/audits/combined/combined-report.md: #7 at line ~254, #30 ~463, #31 ~472, #59 ~724; #8 at ~265 stays in Lane A and is context only). It is ONE pull request into claude/build-platform, branch co-001/release-content-checks, and it must need NO migration (Lane B never opens a schema PR; any part needing DDL or a domain-model change is handed to Lane A, not built).
Code: /home/user/PhysicalTherapy on claude/build-platform at 6ddd587. Read-only for you: never edit, add, commit, push, checkout, reset or stash in it.
Hard constraints the design must hold (reconciliation-001 "What must not change, as checks", docs/product/reconciliation-001.md:440-486):
- Engine freeze: no non-test change under packages/pricing/src (tools/engine-freeze checks it; the differential test compares base and head engines). Golden fixtures and fixtures/synthetic/rules/release-synth-900001..900004 unchanged; a new fixture release takes a new number.
- docs/product/unpriced-reasons.md and the engine's unpriced reason list unchanged.
- Content pipeline: tools/verify-content, .claude/hooks/protect-content.sh and .github/workflows/publish-content.yml unchanged, except #30's exception, granted by the founder's adoption of the combined audit (HANDOFF.md, "Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)": the 19 freeze exceptions are granted). #30's exception covers "Content checker and importer: added refusals only". publish-content.yml is further held by the founder's F4 ruling (it may change only its uses: refs and version comments, and once its runs-on and a timeout-minutes, held to a frozen copy by test); a parallel session (ci-deps) changes its pins. Any change there beyond F4 must be argued as inside #30's exception, exactly. #7 allows README procedure text only. No DDL on rule_release, rule_record or rule_release_withdrawal. pnpm verify-content passes.
- Ledger: untouched. pnpm test:db (catalog and cross-tenant) passes.
- Not while PR #42 is open: never touch a file PR #42 changes. The list is ${DD}/pr42-files.txt (it includes apps/worker/src/{jobs/platform,runtime,config,platform/wiring}.ts, apps/web/src/lib/routes/{console,practice,settings,index}.ts, apps/web/src/lib/screening/*, infra/lib/constructs/{monitoring,compute,...}.ts, packages/observability/src/fields.ts, apps/web/package.json, apps/worker/package.json, pnpm-lock.yaml, docs/runbooks/deploy-and-rollback.md). Exception: shared documents follow LANES rule 6 (reconciliation-001, test-matrix.md, ADRs, packages/synth/src/cases/registry.ts and matrix.ts): they may be edited, the PR merged second resolves the conflict. Parts that need a #42 file split into a later PR after #42 merges.
- Money is integer cents, never floats; code computes every number; no model call; no PHI anywhere; log IDs only; every mutation has a Zod schema, a role check, a practice-scoped transaction and an audit event; wording follows .claude/rules/brand.md and CO-11 (lint:copy).
- Reserved numbers: ADR 0071 (if needed); test-matrix rows RCC-01 to RCC-08 (a new series); packages/synth cases RCC-01 to RCC-08. Only these. A new fixture release number must be checked free against claude/build-platform and the open branches (git -C /home/user/PhysicalTherapy ls-remote origin 'co-001/*'; fetch to read).
- Parallel Lane B sessions are building at the same time: co-001/pr-15b-ledger-payment-terms (ledger), co-001/db-function-diffs (tooling over migrations), co-001/superseded-rerun (pricing-run acceptance service), co-001/model-eval-gate (model gateway), co-001/ci-deps (CI and publish-content.yml pins). Name any overlap.
Shell: every command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, build, typecheck, tests, any probe that runs code at size) only under flock /tmp/laneb-heavy.lock <command>, one at a time; run long ones with run_in_background and wait for the notification. Write scratch files only under ${SP}.
No model name or identifier in any file you write.
Improve as you go (the co-founder's standing direction, 2026-10-25): an improvement you find inside this item's scope goes into the design; one outside goes into your result's notes as a proposal.
The founder's standing rule: recommend and build only the best option, never weighted by build effort, never sacrificing quality.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`

const SCOUTS = [
  { key: 'pipeline', title: 'the content pipeline and #30 (and #7\'s README part)', brief: `Map the content pipeline: tools/verify-content/{check,index}.ts and its tests, packages/rules/src (schema.ts record types and their key shapes and windows, records.ts findOverlaps, import.ts, cli/import.ts, parsers/* especially which types are quarterly and how a window is typed or defaulted (ImportWindow, cmsQuarterOf, zipFileQuarter), manifest.ts, content.ts readRelease, loader.ts), tools/publish-content.sh, tools/content-files.ts, tools/check-releases-immutable.sh, tools/verify-release-manifest.sh, content/{drafts,outgoing,sources}/README.md, .claude/skills/load-release and new-rule-record, .claude/hooks/protect-content.sh, .github/workflows/publish-content.yml, and how a release is assembled from drafts (who builds content/outgoing/<n>; is there an assembler command?). Answer for #30: exactly where each new refusal goes (quarter typed from the file, cross-checked against what the file declares, windowed to that quarter; release-vs-previous coverage regression check with a stated look-back listed automatically and a signed coverage-withdrawn note (where it lives, its schema, who signs, how the checker verifies it); gaps inside a type), and whether each is purely an added refusal (the exception's scope). Find what "previous release" means for drafts, outgoing and published sets, and for fixture releases. Quote the README lines #7 and #30 say are wrong (the NCCI draft deletion that removes MUE history). Say what in publish-content.yml or protect-content.sh, if anything, would need to change, and why or why not.` },
  { key: 'engine', title: 'how releases are read for pricing, and #31 (memory)', brief: `Map every place rule records are read into memory: the pricing engine's rules interface in packages/pricing/src (what it asks for: by type, key, date; how "not found" is treated for MPPR, MUE, NCCI and fee schedules), and every caller that builds that interface from the database: the worker's price job, triage, reports, release-note / release-impact checks in the web (pricing a run twice in a request), screening (apps/worker/src/screening and apps/web/src/lib/screening; note which are #42 files), and the queries in packages/db or elsewhere (the rule_record_identity index and others; read the migrations' rule_record indexes). For #31's best option (fetch only the keys a run's lines can look up through the existing index; small types whole; a reader that throws if the engine asks for something not fetched, never a silent not-found; triage and reports load only the two types they read; an explicit heap limit; a weekly test under production task limits with a generated real-size synthetic release incl. a full NCCI pair table through a price job, triage, a report and five 50,000-row screenings): say exactly which files change, whether every change can stay outside packages/pricing/src (the engine freeze) with the engine's interface unchanged, how the key set is computed from a run's lines (codes, same-claim pairs, the practice ZIP/locality), what the screening cache already does after PR 6b (ADR 0062; did 6b take #31's screening part?), where a heap limit is set (task definitions are in infra/lib/constructs/compute.ts, a #42 file; Dockerfiles; NODE_OPTIONS), and what synthetic generator exists for real-size releases (packages/synth, tools/screening-capacity). If you can, measure today's in-memory size per record cheaply (under the lock). Name any part that would need DDL (an index) and so goes to Lane A.` },
  { key: 'missing', title: 'missing content in pricing, triage, coverage and screening, #7', brief: `Map #7: where a pricing run for a month is planned and refused today (the run-planning code, its refusal codes and how a refusal is shown with dollars, how a month is planned again; the monitor), the triage stage that could hold a priced line whose trace shows a flag on (apply_mppr, apply_ncci/MUE) with no content for its date (packages/triage; its reasons list; is it closed like the unpriced reasons?), the trace shape in packages/pricing (what a trace records of MPPR/MUE lookups), Coverage's wording for a fee-schedule gap ("check the code and year") and where a content alert could be raised once per run, and the screening's out-of-span refusal (did PR 6b build it? see HANDOFF.md's PR 6b scope and ADR 0062). Design input needed: how to compute, outside the engine, each silently-read type's loaded span (per-code MPPR, general MPPR, MUE as the NCCI quarter's stand-in) from a release; the fixed refusal code 'waiting on content' named by type and quarter (is it a run refusal code, not an unpriced reason? confirm that adding it changes neither unpriced-reasons.md nor the engine list, and whether run refusal codes live in a DB CHECK (then it is DDL and Lane A's!) or in code); that a commercial fixed-fee month still prices; re-planning when a covering release is in force. List every file each part touches and flag every #42 file and every DB CHECK or enum the codes would need.` },
  { key: 'alarms', title: 'content calendar, staleness alarms and notices, #59', brief: `Map #59: what exists for platform jobs (apps/worker/src/jobs/platform.ts, platform/wiring.ts, runtime.ts, all #42 files; pg-boss schedules; how a daily job is registered; ADR 0014, 0019, 0039), the console (apps/web/src/app/console, routes/console.ts is #42), the customer surfaces where a content family's loaded-through date could show (coverage, releases pages, banners), alarms (infra/lib/constructs/monitoring.ts, #42), log fields (packages/observability/src/fields.ts, #42; lint:logs), GitHub workflows (.github/workflows; tools/required-checks.ts; actionlint; the policy on permissions and pinned actions; a scheduled workflow with no secrets that opens an issue with the exact import commands when a due date passes with no draft, or when a source page's file list changes: what token permission it needs (issues: write), how it is tested), runbooks (docs/runbooks; deploy-and-rollback.md is #42). Design input needed: the reviewed content calendar's form and location (per record type: source page, cadence, usual publication date), the pure function that computes from the calendar and a release what is due or running out (45 and 14 days before the loaded fee-schedule content ends; open-ended types older than their expected publication), which parts can be built now without any #42 file and which must split into the later PR (job wiring, alarms, log fields, console route), and how the split stays coherent (e.g. the pure computation, the calendar, the GitHub workflow, the customer loaded-through display and the runbook now; the job and alarms later).` },
  { key: 'tests', title: 'tests, fixtures, CI gates and records', brief: `Map what this PR must satisfy and where its tests go: docs/product/test-matrix.md (its row format, how a series is added, the RCC-01..08 reservation), packages/synth (cases registry.ts and matrix.ts, the synth-fixture skill, how fixture releases like fixtures/synthetic/rules/release-synth-90000N are generated, the next free fixture release number across claude/build-platform and open co-001/* branches), the fixture check and gitleaks (tools/fixture-check, pre-push), tools/engine-freeze (what it checks, exception.json), the mutation gate (stryker/shards.json: do new files in packages/rules or tools need shards? which packages are money packages), lint:logs, lint:copy, required checks (tools/required-checks.ts), ci.yml's jobs and how a new scheduled or weekly workflow is held by policy tests, the ADR format (docs/adr, the next ADR 0071), reconciliation-001's item list (where release-operations sits, how an exception is recorded, e.g. the PR 5 trigger exception text), and docs/product files that describe content operations (PRD section 9, PRD 18 Releases, unpriced-reasons). Also check how other Lane B designs were written (/home/user/ops/designs/lane-b-ci.md, lane-b-pr15-ledger-tests.md) for the expected design structure. Report the exact commands of the full local suite (lane-b.md) and which apply to this PR.` },
]

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'string', description: 'markdown: the map, every claim cited file:line at 6ddd587' },
    filesToChange: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, why: { type: 'string' }, pr42: { type: 'boolean' }, frozen: { type: 'string', description: 'which freeze or check covers it, or none' } }, required: ['file', 'why', 'pr42', 'frozen'] } },
    migrationNeeded: { type: 'string', description: 'none, or exactly what would need DDL and why' },
    risks: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'proposals outside scope, open questions' },
  },
  required: ['findings', 'filesToChange', 'migrationNeeded', 'risks', 'notes'],
}

phase('Scout')
const scouts = await parallel(SCOUTS.map(s => () => agent(`${RULES}

Task (design scout, read-only): ${s.title}.
${s.brief}
${SAVE('scout-' + s.key + '.md', 'your findings so far, in markdown')}
When done, also write your findings markdown to ${DD}/scout-${s.key}.md (that file only, in /home/user/ops). Cite file:line for every claim. Be exact; the design author builds the contract from your map.`, { label: `scout:${s.key}`, phase: 'Scout', schema: SCOUT_SCHEMA })))

const got = scouts.filter(Boolean)
log(`scouts returned: ${got.length} of ${SCOUTS.length}`)
const scoutText = SCOUTS.map((s, i) => scouts[i] ? `### Scout ${s.key}\nFiles: ${JSON.stringify(scouts[i].filesToChange)}\nMigration: ${scouts[i].migrationNeeded}\nRisks: ${scouts[i].risks.join(' | ')}\nNotes: ${scouts[i].notes}\n(full map in ${DD}/scout-${s.key}.md)` : `### Scout ${s.key}: MISSING (it failed; read the code yourself for this area)`).join('\n\n')

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    designPath: { type: 'string' },
    migrationNeeded: { type: 'boolean' },
    migrationDetail: { type: 'string' },
    splitToLaterPR: { type: 'array', items: { type: 'string' } },
    handedToLaneA: { type: 'array', items: { type: 'string' } },
    questionsForCofounder: { type: 'array', items: { type: 'string' }, description: 'only cost or security trade-offs, each with the recommended option' },
    founderKept: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['designPath', 'migrationNeeded', 'migrationDetail', 'splitToLaterPR', 'handedToLaneA', 'questionsForCofounder', 'founderKept', 'summary'],
}

phase('Author')
const design = await agent(`${RULES}

Task: write the design, the build contract builders will implement without re-deciding anything, to ${DESIGN} (that file, and files under ${DD}/ only).
Inputs: the five scouts' maps (summaries below; full maps in ${DD}/scout-*.md). Verify against the code whatever you rely on.
${scoutText}

The design must contain, in order:
1. Status, base (6ddd587), branch, worktree /home/user/release-content-checks, sources cited file:line.
2. Scope per item (#7, #30, #31, #59): the audit's best option, then exactly what this PR builds, what splits into the later PR after #42 merges (and why each part needs a #42 file), and what stays with Lane A (#8, any DDL). For each, the best option per the founder's standing rule; when the audit's option can be bettered, say how and why.
3. "No migration": the confirmation, part by part (refusal codes in code, not a DB CHECK; no index; no table). If any part does need DDL, say so plainly: that part goes to Lane A.
4. Freezes and exceptions: engine freeze (no non-test file under packages/pricing/src), unpriced reasons, golden and fixture releases unchanged, content pipeline: #30's granted exception stated exactly (which files of tools/verify-content and packages/rules import change, each as an added refusal only), the README text #7 changes, publish-content.yml and protect-content.sh (unchanged, or exactly what change under which ruling), the text to add to reconciliation-001 and to ADR 0071 recording the exception (draft the wording).
5. Interfaces and algorithms: types, function signatures, file paths; each refusal's exact message pattern and code; fail-closed behaviour for every check (what happens on unreadable input, missing previous release, empty type, clock or calendar error); the span computation; the key-scoped reader (and its throw on an unfetched lookup); the coverage regression check with look-back and the signed coverage-withdrawn note's schema and verification; quarter typing and cross-check; gap detection; the content calendar's file and schema; the staleness computation; the GitHub workflow (permissions, pins, no secrets, inputs, how it is tested by policy and actionlint); the customer- and operator-visible wording (follow .claude/rules/brand.md; you choose the recommended wording; list every new visible string).
6. Tests: RCC-01 to RCC-08 rows for docs/product/test-matrix.md (draft each row: ID, what it proves, the file); unit, property and db tests per part; the synthetic releases needed (new fixture numbers, checked free) and packages/synth cases RCC-01..08; the real-size memory test (how it runs weekly, its limits, what it fails on); mutation shards if any new money-package source file.
7. Files: every file the PR changes or adds, each with its reason, its freeze, and a "#42 file? no" check against ${DD}/pr42-files.txt; and the files of the later PR.
8. Overlaps with the parallel Lane B sessions and Lane A, and how rule 6 resolves each.
9. Builder plan: independent work packages for parallel builders (disjoint files), their order and dependencies, and the full local suite for the fix round.
10. Open questions: cost or security trade-offs for the co-founder (each with the recommended option and why); founder-kept matters (domain model, release tags, owner-admin settings, legal text, reversing a ruling) if any; wording decisions taken (reported, not asked).
${SAVE('author.md', 'the outline, decisions taken and sections written')}
Write the design in plain, exact English (short sentences, lists). Then return the schema.`, { label: 'author', phase: 'Author', schema: DESIGN_SCHEMA })

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, section: { type: 'string' }, problem: { type: 'string' }, evidence: { type: 'string', description: 'file:line or design line' }, fix: { type: 'string' } }, required: ['id', 'severity', 'section', 'problem', 'evidence', 'fix'] } },
    migrationVerdict: { type: 'string' },
    verdict: { type: 'string' },
  },
  required: ['findings', 'migrationVerdict', 'verdict'],
}

phase('Review')
const review = await agent(`${RULES}

Task: adversarially review the design at ${DESIGN} (the author's summary: ${JSON.stringify(design)}). Read the code it relies on; refute what you can. Default to finding problems; a finding needs evidence.
Review lenses, all of them:
- Release and content integrity: what each check refuses, that it fails closed on every bad or missing input (unreadable files, no previous release, an empty type, a calendar error, a fetch the reader never made), and that no content can load, publish or price unchecked by some path (drafts, outgoing, publish-content.yml, the loader, fixtures, the engine's silent not-found). Can any check be bypassed or silently pass?
- Correctness of the algorithms: quarter windows and calendar dates (UTC, inclusive or exclusive ends as the schema defines), gaps, coverage regression with the look-back, span computation for MPPR (per-code and general) and MUE, the key set a run's lines need (missing a key = a silent not-found = overstated money), that a commercial fixed-fee month still prices, re-planning.
- Freezes: no non-test change under packages/pricing/src; unpriced reasons unchanged; golden/fixture releases unchanged; #30's exception used only for added refusals; publish-content.yml under F4; protect-content.sh; ledger untouched; no DDL (verify every code it adds is not a DB CHECK or enum; read the migrations).
- #42 files: check every file the design changes against ${DD}/pr42-files.txt.
- Security (.claude/agents/security-reviewer.md): jobs, logs (IDs only, lint:logs), the content publisher's boundary, the GitHub workflow's permissions and supply chain (pinned actions, no secrets, injection from fetched pages into issue text or shell), tenant isolation of any query, PHI never in logs, URLs or issue text.
- Tests: do RCC-01..08 prove each refusal and each fail-closed path; is the real-size test real; mutation shards.
- Completeness: anything of #7, #30, #31, #59's best option silently dropped (not built, not split, not handed over).
${SAVE('review.md', 'findings so far')}
Also write your findings as markdown to ${DD}/review.md.`, { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA })

phase('Revise')
const revised = await agent(`${RULES}

Task: you wrote the design at ${DESIGN}. The adversarial review found these (also in ${DD}/review.md):
${JSON.stringify(review)}
Answer every finding: fix the design where the finding holds (verify against the code first), or rebut it with evidence. Add an appendix "Design review and dispositions" listing each finding ID, its severity, and its disposition (fixed in section N, or rebutted: why). Keep the rest of the design consistent with each fix.
${SAVE('revise.md', 'dispositions so far')}
Return the schema for the revised design.`, { label: 'revise', phase: 'Revise', schema: DESIGN_SCHEMA })

return { design, review, revised }
