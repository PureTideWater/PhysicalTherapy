export const meta = {
  name: 'lane-b-release-content-checks-fix',
  description: 'Fix round for PR #49: every review finding in three disjoint file groups, then the full local suite once',
  phases: [
    { title: 'Fix', detail: 'pipeline, money and app, calendar and docs; each commits its own files' },
    { title: 'Suite', detail: 'the full local suite once, one heavy step at a time, fixing what breaks' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6dcacc47-f55b-5ed0-ab9e-d8b495c8bdd9/scratchpad'
const WT = '/home/user/release-content-checks'
const DESIGN = '/home/user/ops/designs/lane-b-release-content-checks.md'
const FINDINGS = '/home/user/ops/approval-summaries/lane-b-release-content-checks-review-findings.json'

const RULES = `Context: Lane B of the PaidWhole build (CLAUDE.md is in your context; conventions in /home/user/ops/lanes/lane-b.md). PR #49, branch co-001/release-content-checks, worktree ${WT}, head ac162d6c (the build merged with the latest claude/build-platform; CI is green on it). The design is ${DESIGN}. The two adversarial reviews' findings, each verified by a skeptic, are in ${FINDINGS} (JSON: per area, findings with id, severity, file, line, problem, evidence, fix, and verdict {real, severity, reason, betterFix}; nits; improvements). Probes the reviewers wrote are in ${SP}/review-probes.
This is the fix round: fix every finding of your group whose verdict is real, at the best fix (verdict.betterFix when it is better than fix), with a test that fails before and passes after; take the nits and the improvements of your group too unless one is clearly out of proportion (then say why). A finding whose verdict is not real: check it yourself; fix it if it is real after all, else record why not.
Hard rules: no migration; nothing under packages/pricing/**, packages/ledger/**, packages/db/**, packages/observability/**, .claude/**, content/releases/**, tools/engine-freeze/**, tools/screening-capacity/watched-paths.txt, publish-content.yml, pnpm-lock.yaml, apps/*/package.json; no file of /home/user/ops/designs/lane-b-release-content-checks/pr42-files.txt except the four shared documents; #30's exception means checker and importer changes stay added refusals only (no existing problem removed or reworded; nothing refused today passes). Integer cents; IDs only in logs (lint:logs); wording per .claude/rules/brand.md (lint:copy); match the surrounding style. Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock, one at a time, long ones with run_in_background. DATABASE_URL=postgres://postgres:test@localhost:5433/postgres for db tests.
Git: touch only your group's files; commit with git add <your paths> under flock /tmp/rcc-git.lock (another fixer shares the index; never git add -A, reset, stash, checkout or push). Commit subjects name the finding IDs ("Fix round: INT-PIPE-1 ..."). End every commit message with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W9rDrzhJaxXahvsufd7yC4
No model name or identifier in any file. Improve as you go: improvements inside your files go in, and are listed.
Before your last commit: typecheck the packages you changed, eslint your files, your tests and the tests of the code you changed, and pnpm exec tsx tools/screening-capacity/watched.ts equal to the committed list.`

const SAVE = (f) => `Save as you go: keep ${SP}/progress/fix-${f}.md current (each finding: status, commit, test), so an interruption loses nothing. If it exists when you start, continue from it.`

const RESULT = {
  type: 'object',
  properties: {
    dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'not a defect', 'deferred'] }, commit: { type: 'string' }, what: { type: 'string', description: 'what changed, or why not, in one or two sentences' }, test: { type: 'string' } }, required: ['id', 'disposition', 'commit', 'what', 'test'] } },
    docNotes: { type: 'array', items: { type: 'string' }, description: 'changes the docs owner must make to ADR 0071, the test matrix, runbooks or the design so they match your fixes' },
    tests: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['dispositions', 'docNotes', 'tests', 'notes'],
}

const GROUPS = {
  pipeline: `Group "pipeline": area int-pipeline (INT-PIPE-1 to INT-PIPE-6, its nits and improvements: an exhaustive classification of every RuleRecordType in one table with satisfies; readBaseline verifying the previous release's manifest; refuse duplicate withdrawn entries in the note schema; closed-by-source tightened if proportionate). Your files: packages/rules/src/** (not calendar.ts), tools/verify-content/**, tools/release/{assemble,impact,synthetic}.ts and their tests, fixtures/synthetic/rules/release-synth-900007 (regenerate only through the generator if a change requires it), content/{sources,drafts,outgoing}/README.md. Also: move lossText and lossIdentity, defined in both check.ts and assemble.ts, into one exported copy in packages/rules/src/records.ts (re-exported from index.ts). For INT-PIPE-1: key C16 on source.path, refuse in the importer to overwrite an existing draft file of another window (an added refusal), README row 2 renames the GPCI file per quarter, with a two-quarters-of-identical-bytes test.`,
  money: `Group "money and app": areas int-money (M-1 to M-3 and its nits and improvements), sec-app (SEC-APP-1, SEC-APP-2 and its improvements), and from int-surfaces S1 and S7. Your files: apps/worker/src/** , apps/web/src/** (only files this PR already changes, plus test files), packages/triage/src/** (incl. patterns.test.ts), tools/golden-worksheet/triage.golden.test.ts, tools/release/database-runs.ts and dry-run.db.test.ts, apps/worker/src/price/rerun.db.test.ts and rerun-window.db.test.ts. Also: make TriageFacts.contentNotLoaded required (M-2; add contentNotLoaded: false where tests build TriageFacts), and narrow runReleaseImpact's parameter to ReleaseSource (pass memoryReleaseSource or storedReleaseSource in the rerun db tests). For SEC-APP-1: the customer-visible text must be true today: either a real operator signal is logged now (with its alarm in the later PR, as for CONTENT_NOT_LOADED) and the text says what is true, or the text drops the claim; choose the safer, truer option (a logged operator line the later PR alarms on, and words that do not promise more than that). For SEC-APP-2: keep the alarm in the later PR (monitoring.ts is #42's) but make sure each refusal logs its fixed line now and say so truthfully in docNotes for the ADR and runbook.`,
  surfaces: `Group "calendar, workflows and docs": areas sec-boundary (SB-1 to SB-5, its nits and improvements) and int-surfaces (S2 to S6, its nits and improvements; S1 and S7 belong to the money group). Your files: packages/rules/src/calendar.ts and calendar.test.ts, tools/content-calendar/**, .github/workflows/content-calendar.yml and release-capacity.yml, tools/release-capacity/**, tools/test/workflows.test.ts, tools/brand-copy/scan.ts and scan.test.ts (pin the two new COPY_FILES entries), docs/** (ADR 0071, test-matrix RCC rows, reconciliation-001 changes, PRD lines, runbooks content-updates.md and ci.md), packages/synth/src/cases/{registry,matrix}.ts. SB-1 must fail closed: a new file whose name is not plain is a finding (counted and named safely), never silently skipped. SB-3: follow redirects only to the allowed hosts over https. SB-4: cap the response size. You run after the other two groups: read their results below and their commits (git log), and make the docs (ADR 0071, test matrix rows, runbooks, the design's later-PR list if needed) match every fix, including their docNotes. Also update ${DESIGN}'s Appendix with a short "Fix round" note only if a fix departs from the design (you may edit that one file in /home/user/ops, nothing else there).`,
}

phase('Fix')
const fixPipeline = agent(`${RULES}\n\n${GROUPS.pipeline}\n${SAVE('pipeline')}`, { label: 'fix:pipeline', phase: 'Fix', schema: RESULT })
const fixMoney = agent(`${RULES}\n\n${GROUPS.money}\n${SAVE('money')}`, { label: 'fix:money', phase: 'Fix', schema: RESULT })
const [rp, rm] = await Promise.all([fixPipeline, fixMoney])
const rs = await agent(`${RULES}\n\n${GROUPS.surfaces}\nThe other groups' results: ${JSON.stringify({ pipeline: rp, money: rm })}\n${SAVE('surfaces')}`, { label: 'fix:surfaces', phase: 'Fix', schema: RESULT })

phase('Suite')
const suite = await agent(`${RULES}

Task: the fix round's full local suite, once, on the branch after all three fix groups (their results: ${JSON.stringify({ pipeline: rp, money: rm, surfaces: rs })}). Run each step under flock /tmp/laneb-heavy.lock, one at a time, long ones in the background; if a step fails, fix the cause in the right file (you may touch any file the PR already changes, under the hard rules), commit as "Fix round suite: ...", and re-run that step. The steps (lane-b.md "How Lane B runs"; design 9.3):
1 pnpm install --frozen-lockfile; 2 pnpm check:fixtures; 3 pnpm typecheck; 4 pnpm lint; 5 pnpm lint:logs; 6 pnpm lint:copy; 7 pnpm verify-content and pnpm verify-content on each fixtures/synthetic/rules/release-synth-90000{1..7}; 8 tools/check-releases-immutable.sh "$(git merge-base HEAD origin/claude/build-platform)"; 9 env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts "$(git merge-base HEAD origin/claude/build-platform)" clean; 10 pnpm synth --all, then no diff and no untracked file under fixtures/synthetic; 11 pnpm synth --large; 12 watched.ts equal to the committed list; 13 pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base "$(git merge-base HEAD origin/claude/build-platform)"; 14 ENGINE_FREEZE_BASE=<merge base> CI=true pnpm test; 15 pnpm test:golden; 16 pnpm test:oracle; 17 pnpm licenses:check; 18 actionlint .github/workflows/*.yml; 19 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm db:migrate on a fresh database if the scripts need it, then pnpm test:db in its shards one after another (see package.json for the shard flag; 6 shards locally); 20 pnpm db:domain-model --check --strict --require-approval (unchanged, no drift); 21 pnpm build, then pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)", then E2E_PREBUILT=1 pnpm test:e2e --workers=2; 22 the mutation canary, the shards tools/stryker/affected.ts names, then tools/stryker/gate.ts reports/mutation (read tools/stryker and docs/runbooks/ci.md for the exact commands); 23 the weekly real-size harness once (tsx tools/release-capacity/run.ts, as its README or the workflow runs it), in the background; if it needs Docker or resources this machine lacks, say exactly what ran and what could not.
Look up the exact commands in package.json and the runbooks; where a command differs, use the repository's. Count tests from the runners' own totals.
${SAVE('suite')}
Return wp-style results: dispositions may be empty; tests must list every step with its result and counts; notes list anything that did not pass or could not run, with why.`, { label: 'suite', phase: 'Suite', schema: RESULT })

return { pipeline: rp, money: rm, surfaces: rs, suite }
