export const meta = {
  name: 'pr6b1-build',
  description: 'PR 6b-1 (ZIP+4 localities in the engine, under the 2026-10-18 freeze exception): two builders in parallel (engine and rules; oracle and freeze tool), then the golden claims, then the draft PR',
  phases: [
    { title: 'Build', detail: 'E1 engine and rules, E2 oracle and freeze tool, in parallel' },
    { title: 'Golden', detail: 'G196-G199 under 900006, priced by the engine and the oracle; freeze check' },
    { title: 'Draft PR', detail: 'scope check, template body, money label' },
  ],
}

const WT = '/home/user/pr6b1'
const BR = 'co-001/pr-06b-zip4-engine'
const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const DESIGN = '/home/user/ops/designs/pr6b-zip4-settings.md'
const PLAN = '/home/user/ops/designs/pr6b-plan.md'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH`

const CONTEXT = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Worktree ${WT}, branch ${BR}, cut from claude/build-platform at 8e33cb3; pnpm install is done there. This is PR 6b-1 of four (designs/pr6b-plan.md): the ZIP+4 locality lookup in the engine, the one engine change the founder's ruling of 2026-10-18 11:47 UTC allows (docs/product/reconciliation-001.md:428 and :499). No migration, no domain model, nothing in apps/ passes a ZIP+4 yet (6b-2 does that).
The founder ruled on 2026-10-21 (~22:30 UTC; /home/user/ops/HANDOFF.md, section "Founder rulings of 2026-10-21 ~22:30 UTC: PR 6b's 13 questions"): every recommended answer accepted. For this PR: Q3 (a) the new rule record type locality_map_plus_four (its rule_record CHECK widening lands in 6b-2's migration, not here), and Q4 (a) golden claims G196-G199 under synthetic release 900006 with every existing golden file byte-identical, both granted as exceptions to the change order's checks. Record the rulings this PR builds in the ADRs you write, dated 2026-10-21.
Read these sections, not whole documents: the plan ${PLAN} lines 88-125 (6b-1's contents), 233-240 (builders), 453-470 and 469-485 (acceptance), 614-650 (G2, the rule-table DDL check; G6, the money label); the design ${DESIGN} sections 3.1 to 3.8 (lines 132-393), the 6b-1 rows of section 8 (lines 966-1103), section 9 (PRC-21, PRC-22) and the engine part of section 10. Where the design and the code disagree, the code at 8e33cb3 is the fact; follow the design's intent and report the difference.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on port 5433 (postgres:test, socket /tmp): name scratch databases tp_pr6b1_<role>_<n> and drop them when done. Logs go under ${SP}/pr6b1/.
Rules that bind this run:
- CLAUDE.md. The engine freeze: the only non-test files you may change under packages/pricing/src are types.ts, reasons.ts, trace.ts, engine.ts and recompute.ts, and only for the ZIP+4 lookup. fixtures/synthetic/rules/release-synth-900001 to 900005 and every existing file under fixtures/golden stay byte-identical. docs/product/unpriced-reasons.md and UNPRICED_REASONS stay unchanged. Never edit content/releases/**, tools/verify-content, any migration, approvers.json or docs/product/domain-model.md.
- The repository's edit hooks are live (.claude/settings.json: protect-content, fixture-guard, protect-approval, typecheck). Never bypass one. If a hook refuses an edit this PR legitimately needs, stop that edit and report it.
- You share ${WT} with another builder. Stage only your own paths and commit with 'git commit -m "..." -- <paths>'; retry if the index is locked. Push after each commit with 'git push -u origin ${BR}', retrying after 2, 4, 8 and 16 s on a network error; if it is rejected because the other builder pushed first, run 'git pull --no-rebase origin ${BR}' and push again. Never force, never --no-verify, never rebase or amend a pushed commit. The pre-push hook runs the fixture check and gitleaks; fix a refused commit with a new commit.
- Commit messages follow the repository's style (lowercase area prefix, one sentence saying what changes and why, naming the founder's ruling). ${ATTR}
- Never skip, disable, quarantine or loosen a test. Failures in the other builder's files are reported, not fixed.
- Report briefly: every check with its command and result, every open item.`

const BUILD = { type: 'object', properties: {
  summary: { type: 'string' },
  head: { type: 'string', description: 'the commit you last pushed' },
  files: { type: 'array', items: { type: 'string' } },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'files', 'checks', 'open_items'] }
const PR = { type: 'object', properties: {
  pr_number: { type: 'number' }, head: { type: 'string' }, url: { type: 'string' },
  scope_ok: { type: 'boolean' }, freeze_diff: { type: 'string' },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['pr_number', 'head', 'scope_ok', 'freeze_diff', 'checks', 'open_items'] }

phase('Build')
const [e1, e2] = await parallel([
  () => agent(`${CONTEXT}

You are builder E1, engine and rules. You own: packages/pricing/src/** (the five files and their tests), packages/rules/src/**, tools/release/{assemble,synthetic}.ts (and their tests), fixtures/synthetic/cms/**, fixtures/synthetic/rules/release-synth-900006/**, packages/synth/src/cases/{registry,pricing}.ts, docs/product/test-matrix.md, and the ADRs below. Do not touch fixtures/golden/**, tools/golden-worksheet/**, tools/engine-freeze/**, ci.yml or the lint and test configs: builder E2 owns them.
1. Open item O1 first: confirm the ZIP9 (ZIP+4) record layout from CMS's own published layout document for the "ZIP Code to Carrier Locality" files (one plus-four at fixed positions, or a low/high range pair), with WebSearch or WebFetch. If the network refuses, say so, use the layout the design cites (section 3.2) and record it as unconfirmed in ADR 0064. Never download or commit real CMS content: synthetic files only, carrying the repository's synthetic markers.
2. Build the design's sections 3.3, 3.4 and 3.7: the record type locality_map_plus_four keyed by the five-digit ZIP, its value sorted non-overlapping ranges each with a carrier and locality; the ZIP9 parser and the schema checks; the ZIP9 completeness check in tools/release; synthetic release 900006 and its fixtures (fixtures/synthetic/cms/*900006*, ZIP9_SYNTHETIC.txt, README), generated with the repository's own release tooling; and the engine change in exactly the five files (types.ts, reasons.ts, trace.ts with ENGINE_VERSION phase-two/2 and the two optional trace keys, engine.ts with the PLUS_FOUR check and the range lookup used only when the ZIP's locality_map record is flagged and a ZIP+4 is given, recompute.ts with the ZIP+4 checks). Every five-digit input keeps today's path exactly.
3. Tests (design section 8, the engine and rules rows): unit cases (a) to (i), the recompute tampering cases, a property test that every five-digit ZIP prices identically with and without the change, the parser and schema tests, 900006 rendered equal to its committed files, and 900001-900005 rendered unchanged. Test-matrix rows PRC-21 and PRC-22 in docs/product/test-matrix.md and packages/synth/src/cases/registry.ts (with pricing.ts if the registry needs it); keep packages/synth's fixtures test (matrix.ts word for word) passing.
4. Docs: new ADR 0064 (the engine part: the lookup, the version bump, what a re-run shows, the founder's ruling and the granted Q3 and Q4 exceptions); amend ADRs 0029, 0033 and 0034 where they describe the locality lookup.
5. Checks before your last push: pnpm typecheck; pnpm lint; pnpm exec vitest run for @tp/pricing, @tp/rules, tools/release and packages/synth's fixtures test; pnpm verify-content; git diff --stat origin/claude/build-platform -- packages/pricing/src ':!**/*.test.ts' lists only the five files. Return your report.`, { label: 'build: E1 engine and rules', phase: 'Build', schema: BUILD }),
  () => agent(`${CONTEXT}

You are builder E2, oracle and freeze tool. You own: fixtures/golden/**, tools/golden-worksheet/**, tools/engine-freeze/**, .github/workflows/ci.yml, .gitignore, vitest.config.ts, eslint.config.js, .github/CODEOWNERS and tools/test/codeowners.test.ts. Do not touch packages/pricing, packages/rules, tools/release or fixtures/synthetic: builder E1 owns them and is working now.
INDEPENDENCE: the golden worksheet is the engine's independent oracle. Write its ZIP9 step in tools/golden-worksheet/golden_worksheet.py from the CMS ZIP9 layout (the design's section 3.2; confirm the layout yourself with WebSearch or WebFetch if you can) and the founder's rule, NOT from E1's code: do not read E1's uncommitted or committed engine and rules changes while you write it.
1. The oracle's ZIP9 step and its Python tests (run with /opt/py312-ci/bin/python, as CI does). Do not add golden claims yet; a later step adds G196-G199 once E1 has pushed release 900006.
2. tools/engine-freeze, as the design's section 3.8 and the plan's G2 say: exception.json naming exactly the five engine files of the 2026-10-18 ruling, which applies only in the pull request that adds or edits it (so a base merge or a later PR needs no hand edit and runs with no exception); check.ts (the engine-file check against ENGINE_FREEZE_BASE, plus the new check that reads every migration a PR adds and refuses DDL on rule_release, rule_record or rule_release_withdrawal unless exception.json names that migration's statement, for 6b-2's one CHECK); check.test.ts covering every case including the rule-table DDL cases; differential.test.ts, which extracts the base engine at the merge base and runs it against the head engine on all 150 golden claims (326 lines) and 20,000 generated five-digit claims, and FAILS in CI (never skips) when it cannot run. Exclude the extracted base engine from test runs and lint (.gitignore, vitest.config.ts, eslint.config.js). One ci.yml step and ENGINE_FREEZE_BASE for the unit job; keep every job pinned to ubuntu-24.04 (tools/test/workflows.test.ts) and run actionlint. CODEOWNERS for tools/engine-freeze, with tools/test/codeowners.test.ts passing.
3. Checks before your last push: pnpm typecheck; pnpm lint; the worksheet's Python tests; pnpm exec vitest run tools/engine-freeze with ENGINE_FREEZE_BASE set to the merge base (the differential test may wait for E1's engine: run it against whatever head exists and report); pnpm exec vitest run tools/test; actionlint. Return your report.`, { label: 'build: E2 oracle and freeze', phase: 'Build', schema: BUILD }),
])
if (!e1 || !e2) return { error: 'a builder returned nothing', e1, e2 }

phase('Golden')
const golden = await agent(`${CONTEXT}

You are builder E2 again, now that both builders have pushed. E1's report: ${JSON.stringify(e1).slice(0, 6000)}
Your earlier report: ${JSON.stringify(e2).slice(0, 4000)}
1. git pull --no-rebase origin ${BR} in ${WT}.
2. Add golden claims G196-G199 under synthetic release 900006, as the design's section 8 golden rows say (a flagged ZIP with a ZIP+4 in each kind of range the design names), each priced by the engine and by the independent Python oracle; every existing file under fixtures/golden stays byte-identical (git diff --diff-filter=MDRT origin/claude/build-platform -- fixtures/golden is empty). Amend fixtures/golden/QUESTIONS.md Q37 and README.md (lines 31-35 and 260) as the design says. The set becomes 154 claims and 330 lines.
3. Run: pnpm test:golden (engine equals oracle on every claim); the worksheet's Python tests; pnpm exec vitest run tools/engine-freeze with ENGINE_FREEZE_BASE set to the merge base, where differential.test.ts must run (not skip) and report its case counts; the freeze check over the branch (only the five engine files; exception applied because this PR adds exception.json); pnpm typecheck; pnpm lint. If the engine and the oracle disagree, find which is wrong against the CMS layout and the ruling: fix your own files, and report E1's as an open item with the failing claim (do not edit E1's files).
Commit, push and return your report.`, { label: 'golden: G196-G199 and the freeze check', phase: 'Golden', schema: BUILD })
if (!golden) return { error: 'the golden step returned nothing', e1, e2 }

phase('Draft PR')
const pr = await agent(`${CONTEXT}

Open PR 6b-1 as a DRAFT so GitHub CI runs while the reviewers work. Builders' reports: E1 ${JSON.stringify(e1).slice(0, 3000)} E2 ${JSON.stringify(e2).slice(0, 2000)} golden ${JSON.stringify(golden).slice(0, 3000)}
1. In ${WT}: git pull --no-rebase origin ${BR}; git status is clean; the branch is pushed.
2. Scope: git diff --name-only $(git merge-base origin/claude/build-platform HEAD) lists only files the two builders own (as listed in the plan's lines 233-240); git diff --stat <merge-base> -- packages/pricing/src ':!**/*.test.ts' holds exactly the five engine files; no migration; fixtures/golden has additions and the two edited docs only; 900001-900005 unchanged. Run pnpm typecheck and pnpm lint once on the head.
3. Create the draft pull request into claude/build-platform with the GitHub MCP tool create_pull_request (load it with ToolSearch "select:mcp__github__create_pull_request,mcp__github__issue_write,mcp__github__get_label"). Title: "PR 6b-1: ZIP+4 localities in the engine, under the founder's 2026-10-18 freeze exception (ADR 0064)". Fill the body from .github/pull_request_template.md on origin/main (git show origin/main:.github/pull_request_template.md), answering every section from the builders' reports: what changes and why; the freeze exception (exactly the five files, the ruling of 2026-10-18 11:47 UTC; the granted exceptions Q3 (a) and Q4 (a) of 2026-10-21); no schema change and no domain-model approval; the checks run and their results; what the reviewers should look at; the open items. End the body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH
4. Add the label "money" to the pull request (the plan's G6: .github/workflows/ci.yml runs Stryker on it) with mcp__github__issue_write (method update, labels ["money"]). If the label does not exist, say so as an open item; do not create labels.
Return the PR number, head, URL, the scope result and the freeze diff.`, { label: 'draft PR 6b-1', phase: 'Draft PR', schema: PR })
return { e1, e2, golden, pr }
