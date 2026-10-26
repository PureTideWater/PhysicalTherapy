export const meta = {
  name: 'lane-b-release-content-checks-build',
  description: 'Build release content checks (#7, #30, #31, #59) in ten work packages by the design, then an integration check',
  phases: [
    { title: 'Build', detail: 'ten work packages in dependency order, each committing only its own files' },
    { title: 'Integrate', detail: 'typecheck, lint, unit tests, content and fixture checks across the whole branch; fix what breaks' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6dcacc47-f55b-5ed0-ab9e-d8b495c8bdd9/scratchpad'
const WT = '/home/user/release-content-checks'
const DESIGN = '/home/user/ops/designs/lane-b-release-content-checks.md'

const RULES = `Context: you are a builder for Lane B of the PaidWhole build (CLAUDE.md is in your context; Lane B conventions in /home/user/ops/lanes/lane-b.md, "How Lane B runs"). The build contract is ${DESIGN} (reviewed; Appendix A lists the review's fixes, which are already in the sections). Implement it exactly; do not re-decide. When the design and the code at the base disagree, the code is the fact: make the smallest change that keeps the design's intent, and report it as a deviation.
Worktree: ${WT}, branch co-001/release-content-checks (from claude/build-platform 6ddd587). Work only there.
Hard rules:
- Touch ONLY the files your work package owns (design 9.1 and 7.1). Never touch packages/pricing/**, packages/ledger/**, packages/db/**, packages/observability/**, .claude/**, content/releases/**, tools/engine-freeze/**, tools/screening-capacity/watched-paths.txt, pnpm-lock.yaml, any package.json except those the design names, .github/workflows/publish-content.yml, or any file in /home/user/ops/designs/lane-b-release-content-checks/pr42-files.txt other than the four shared documents (test-matrix.md, reconciliation-001.md, packages/synth/src/cases/registry.ts and matrix.ts). If you need a file you do not own, stop and say so in your result.
- No migration, ever. Money in integer cents (bigint); no float on an amount. Synthetic data only. Log IDs and counts only (lint:logs). No model calls. Wording per .claude/rules/brand.md (lint:copy). Match the surrounding code's style, comment density and naming.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
- Heavy commands (pnpm install, typecheck, lint, any test run, build, synth generation) run only under: flock /tmp/laneb-heavy.lock <command>, one at a time; other workflows share this 4-CPU machine. Run long ones with run_in_background and wait for the notification. Database tests: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18; see how the repository's test:db scripts find their database and follow that). Prefer running only your own test files (pnpm exec vitest run <files> in the package).
- Git: commit only your own files, with git -C ${WT} add <your paths> and a commit made under flock /tmp/rcc-git.lock (other builders share this worktree's index: never git add -A, never commit others' files, never reset, stash, checkout, rebase or push). Commit message: a clear subject naming the work package, a short body, then exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W9rDrzhJaxXahvsufd7yC4
- No model name or identifier in any file (the trailer above is the only exception, in the commit message only).
- Improve as you go (the co-founder's standing direction): an improvement inside your files goes in, and you list it; one outside goes in your result's notes.
- Handover check before your final commit (design 9.1): typecheck of the packages you changed, lint on your files, your tests passing, and pnpm exec tsx tools/screening-capacity/watched.ts printing exactly the committed tools/screening-capacity/watched-paths.txt (no new file joins the closure; design 5.0).`

const SAVE = (file) => `Save as you go: keep ${SP}/progress/build-${file}.md up to date (files done, tests status, commits made, deviations), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, check git log and the files, and continue from where it stopped.`

const RESULT = {
  type: 'object',
  properties: {
    wp: { type: 'string' },
    done: { type: 'boolean', description: 'every item of the work package built and its handover check passed' },
    commits: { type: 'array', items: { type: 'string' }, description: 'short SHA and subject' },
    files: { type: 'array', items: { type: 'string' } },
    tests: { type: 'string', description: 'which tests ran and their pass counts' },
    deviations: { type: 'array', items: { type: 'string' }, description: 'every departure from the design, with why' },
    notMine: { type: 'array', items: { type: 'string' }, description: 'files outside your package you needed, and why' },
    notes: { type: 'string', description: 'improvements made, proposals outside scope, risks for the integration and the reviews' },
  },
  required: ['wp', 'done', 'commits', 'files', 'tests', 'deviations', 'notMine', 'notes'],
}

const WPS = {
  WP1: 'WP1 rules core: design 5.1 (shared pure helpers in packages/rules: quarter helpers and type lists in schema.ts, ranges/contents/gaps/coverage maps and the COVERAGE schemas in records.ts, previousReleaseNumber and releaseDirOf in content.ts with ENOENT-only catch per m3), with their tests (schema.test.ts, records.test.ts, content.test.ts, coverage.test.ts incl. the heap-bound test of m8).',
  WP2: 'WP2 importer: design 5.2 (I1 to I8, statedQuarter incl. the --url file name and Eff MM-DD-YYYY patterns, the ZIP5 parser Z1/Z2 in parsers/locality.ts, review-question wording in pprrvu.ts and ncci.ts per 5.2.4), with import.test.ts and parsers/parsers.test.ts. Existing tests whose inputs a new refusal now refuses get a quarter window, assertions unchanged.',
  WP3: 'WP3 checker: design 5.3, 5.4, 5.5 checker parts (C1 to C16, D1, D2: per-record quarter rules, gaps, COVERAGE.md checks for numbered sets, COVERAGE-WITHDRAWN.md on drafts), in tools/verify-content/check.ts and check.test.ts. Added refusals only: no existing problem removed or reworded; tools/verify-content/index.ts unchanged. Update check.ts\'s module comment list.',
  WP4: 'WP4 assembler and fixture 900007: design 5.5 assembler parts (R3, R4, COVERAGE.md, the RELEASE.md section, the withdrawal note move) in tools/release/{assemble,impact,synthetic}.ts with release.test.ts and workspace.test.ts; generate fixtures/synthetic/rules/release-synth-900007 with the repository\'s generator (design 2.1 item 7, 6.4), and confirm 900001-900006 and 900100 render unchanged.',
  WP5: 'WP5 worker pricing: design 5.6 (the run refusal: content reads from traces, spans, the three waiting_on_content codes and release_read_outside_fetch, precedence after the loop per m1, the CONTENT_NOT_LOADED log per M4 and 5.12) and 5.7 (the key-scoped reader with the per-run cache, ReleaseSource, the throw on an unfetched lookup, the typed reader, diff.ts identity joins, impact.ts per batch), in apps/worker/src/price/{release,keyed-release,execute,impact,diff,public}.ts, test-support/pricing-world.ts, the new tests content.test.ts, content.db.test.ts, release-source.db.test.ts (incl. the oracle test: the keyed reader returns exactly what the whole-release index returns), keyed-release.test.ts, price.db.test.ts, and tools/release/{database-runs.ts,dry-run.db.test.ts}. Run the worker\'s existing price db tests too.',
  WP6: 'WP6 monitor, triage, report: design 5.6.3, 5.6.4 and the triage/report parts (the monitor wait and its replanning incl. m2\'s terms change, the WAITING_ON_CONTENT log, CONTENT_NOT_LOADED in NOT_ACTIONABLE_REASONS, BEHAVIOR_RECORD_TYPES, triage and report reading only their types through typedRelease, the report words), in apps/worker/src/monitor/{plan,job}.ts with monitor.db.test.ts and job.test.ts, apps/worker/src/triage/execute.ts with triage.db.test.ts, apps/worker/src/report/{content,html}.ts with report.test.ts, packages/triage/src/{actionable,behavior}.ts with actionable.test.ts and index.test.ts.',
  WP7: 'WP7 web: design 5.6.6, 5.9, 5.11 (FAILURE_TEXT, MonthsWaitingOnContent, the Coverage card and the fee-schedule sentence via feeSchedulePeriodsNotLoaded, the Releases page loaded-through dates with content-through.ts, the console Rule releases page "Content due" section), in the files WP7 owns in design 9.1, with their db tests. Every query is practice-scoped where it reads practice data, with the handler\'s role check; console reads keep the console\'s existing checks. Every new string passes lint:copy.',
  WP8: 'WP8 calendar, CLI, workflow, runbook: design 5.8 (packages/rules/src/calendar.ts with its Zod schema and contentDue(), the ./calendar export in packages/rules/package.json, tools/content-calendar/** with its tests incl. the hostile-href test of m6 and the drafts summary of m8, the ./content-calendar export in tools/package.json, .github/workflows/content-calendar.yml (read-only check job; notify job with issues: write, no checkout, no secrets; actions pinned like the other workflows), docs/runbooks/content-updates.md and its runbook.test.ts). Run actionlint on the new workflow.',
  WP9: 'WP9 weekly capacity and infra: design 5.10 and 5.7.3 (tools/release-capacity/** harness and tests, the quarterly scale shape 900110 as an option of the existing generator per Appendix A, tools/screening-capacity/{containers,env}.ts gaining only the worker name and production\'s worker command with no import (B1), .github/workflows/release-capacity.yml, infra/lib/heap.ts with infra/test/heap.test.ts, infra/lib/jobs.ts and infra/test/content-alert.test.ts). Do NOT run the full real-size harness now (the fix round runs it once); run its unit tests and a tiny smoke configuration if the design gives one. Run actionlint on the new workflow.',
  WP10: 'WP10 records and docs: design 4.4 (content/{sources,drafts,outgoing}/README.md procedure text), 4.5 (the reconciliation-001 bullet and the proposed-PR paragraph; ADR 0071 in full, at the file name given), 6.1 (RCC-01 to RCC-08 in docs/product/test-matrix.md), 6.2 (packages/synth registry.ts, matrix.ts, cases/common.ts RCC: 14, expected/types.ts, fixtures/synthetic/RCC-0*/expected.json generated by pnpm synth), docs/product/PRD.md\'s lines, docs/runbooks/ci.md, tools/brand-copy/scan.ts COPY_FILES, tools/test/workflows.test.ts for the two new workflows. Every assertedBy path must exist; packages/synth/src/fixtures.test.ts must pass. The ADR and the PR text record: the #30 exception and its grant; Q1 and Q2 taken as recommended under the co-founder\'s ruling of 2026-10-26 ~00:20 UTC ("Don\'t ask for approvals anymore just build and optimize"); the split into the later PR; Lane A\'s operator_content_coverage(). Read the other builders\' commits (git log) so the records match what was built.',
}

// RESUMED 2026-10-26 ~03:55 UTC: the session limit stopped WP4 to WP10 and integration at ~02:40 UTC; WP1 to WP3
// were done (cached). The resumed agents get this note; WP1 to WP3's prompts are unchanged so they replay.
const RESUMED = `RESUMED after a stop (the account's session limit, ~02:40 UTC): your earlier run may have left uncommitted work in the worktree and notes in your progress file; check both (git status, git diff) and continue. Uncommitted files of other packages may also be present: never touch or commit them.
Correction: packages/rules/src/index.ts is NOT a #42 file (WP1 was wrong). Commit 42b14150 re-exports WP1's schema and records helpers from '@tp/rules' and moves the checker's imports there. Import them from '@tp/rules' (or '@tp/rules/content' for the content helpers), never by a relative path into packages/rules/src; replace any such relative import you wrote. If you need another export added to index.ts, add it (only additions) and commit index.ts with your files.`
const build = (key) => agent(`${RULES}
${['WP1', 'WP2', 'WP3'].includes(key) ? '' : '\n' + RESUMED + '\n'}
Your work package: ${WPS[key]}
Read the whole design once (sections 1-4 for constraints, your sections in full, 9.1 and 9.2), then the code you change. Then build, test, commit.
${SAVE(key)}`, { label: `build:${key}`, phase: 'Build', schema: RESULT })

phase('Build')
const results = {}
const run = (key, deps) => Promise.all(deps).then(() => build(key)).then(r => { results[key] = r; log(`${key}: ${r ? (r.done ? 'done' : 'NOT done') : 'failed'}`); return r })

const p1 = run('WP1', [])
const p2 = run('WP2', [p1])
const p3 = run('WP3', [p1])
const p5 = run('WP5', [p1])
const p8 = run('WP8', [p1])
const p4 = run('WP4', [p3])
const p6 = run('WP6', [p5])
const p9 = run('WP9', [p5])
const p7 = run('WP7', [p5, p8])
await Promise.all([p2, p4, p6, p7, p9])
const p10 = await run('WP10', [])

phase('Integrate')
const integ = await agent(`${RULES}

Task: the integration check of the whole branch after all ten work packages. Their results: ${JSON.stringify(results)}
You may now touch any file the design's 7.1 lists (still never the forbidden ones). For each step, run it under the lock, fix what breaks (in the owning file, keeping the design), and commit the fixes as "Integration: ...":
1. pnpm typecheck; 2. pnpm lint; 3. pnpm lint:logs; 4. pnpm lint:copy; 5. pnpm verify-content, and pnpm verify-content on each fixtures/synthetic/rules/release-synth-90000{1..7}; 6. pnpm check:fixtures; 7. pnpm synth --all, then git diff --exit-code -- fixtures/synthetic and no untracked files there; 8. pnpm exec tsx tools/screening-capacity/watched.ts equal to the committed list; 9. env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts "$(git merge-base HEAD origin/claude/build-platform)" clean with no exception; 10. ENGINE_FREEZE_BASE=<merge base> CI=true pnpm test; 11. pnpm test:golden; 12. actionlint .github/workflows/*.yml; 13. the db tests the packages changed (the worker's price, monitor, triage, report db tests; the web's new db tests; tools/release dry-run), not the whole test:db.
Also: (a) tools/stryker/affected.ts refuses packages/rules/src/content.ts's new content/releases and content/outgoing reads in the pricing and packets closures (CI's changes job and tools/stryker/affected.test.ts failed on 38088c68): account for them in affected.ts the way its DIRECTORY_READS / DATA_FILES entries account for content.ts's existing reads, with a test, and run pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base "$(git merge-base HEAD origin/claude/build-platform)" until it passes; affected.ts is yours for this. (b) No import anywhere may reach into another package's src by a relative path (grep for 'packages/rules/src' and '../../../../packages'); use the package entry points.
Also check each work package's deviations and notMine against the design, and complete anything a package left undone. Then re-read the whole diff (git diff origin/claude/build-platform...HEAD) against the design's sections once, adversarially: list anything missing or wrong, fix it.
${SAVE('integrate')}
Return the schema with wp "integration"; in tests give each step's result and counts.`, { label: 'integrate', phase: 'Integrate', schema: RESULT })

return { results, integ }
