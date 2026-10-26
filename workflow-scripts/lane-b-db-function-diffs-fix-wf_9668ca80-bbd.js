export const meta = {
  name: 'lane-b-db-function-diffs-fix',
  description: 'Fix round for PR #46: every review finding, full local suite once, one push',
  phases: [
    { title: 'Fix', detail: 'code fixer and docs fixer on disjoint files' },
    { title: 'Suite', detail: 'adversarial re-read, full local suite once, one push' },
  ],
}
const SP = args.sp
const WT = '/home/user/db-function-diffs'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const COMMON = `You work on PR #46 (branch co-001/db-function-diffs) in the worktree ${WT}, head e1896d5. Read first: the dispositions ${SP}/dispositions.md (what to do; every item there is decided), the full findings ${SP}/pr-review-findings.json (evidence and repros), the design /home/user/ops/designs/lane-b-db-function-diffs.md (§7 wins), and the current code.
Rules:
- export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every shell command.
- Wrap every install, typecheck, lint, test, test:db, build, e2e in flock /tmp/laneb-heavy.lock (one heavy command at a time on this machine).
- DATABASE_URL=postgres://postgres:test@localhost:5433/postgres for db tests and scratch databases (name yours tp_fix_*, drop them).
- Failing-first: for each behaviour fix, write or extend the test, see it fail, then fix.
- Never touch: migrations, docs/product/domain-model.md (must stay byte-identical; restore the provenance line with git checkout after any --out), packages/db/domain-model/*.json, .github/workflows/*, tools/test/workflows.test.ts, CLAUDE.md, .claude/hooks/*, LANES.md/HANDOFF.md/lanes/*, and any file of open PR #42 (/tmp/claude-0/pr42-files.txt) other than docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts (whose DBF rows must stay word-for-word identical to the test-matrix rows; fixtures.test.ts checks it).
- Never write "#" followed by 3 or 6 hex-looking characters in any file (the brand colour scan reads it as a colour: say "item 111", not the hash form). No model name in any file. Synthetic data only.
- Do not commit or push unless your part says so. Improve as you go inside these files; report anything outside as a proposal.`

const code = () => agent(`${COMMON}

YOUR PART: the code and its tests, and the regenerated files. Files: packages/db/src/** (domain-model/*, cli/domain-model.ts), packages/db/functions/*.sql (regenerated only, by the generator), tools/test/function-files.test.ts and .gitattributes (T12/N6 belongs to you), and the synth matrix/registry/test-matrix DBF rows only if a row's wording must change (keep all three identical).
${SAVE('fix-code.md', 'each disposition item: done/next, its test, the check results')}
Do every code item of the dispositions: summary size and --function-diffs list|full with the prefix property and budget; the pinned settings; git env isolation and diff flags; .gitattributes text eol=lf and its test; executable bit and mode 100644; DomainModelError exit 2 everywhere in the function paths; custom FILE without --functions refused; --out validating before writing anything; readFunctionDirectory refusing symlinks and bad names; one line for a missing directory; ignored generated file category; CLI tests spawning the CLI against a scratch database; schemas other than public refused (check none exist today on a migrated database); banner-only stale removal and refusal; name validation everywhere; bootstrap line for an empty base; sensitive ranking per S5/T11; policy and event-trigger header lines (I1) then regenerate all 337 files on a freshly migrated scratch database; T16 probe additions and DBF-01 extension-member exclusion; T6 document-independence test; T17 merge-base for the function section.
Then: flock pnpm typecheck; flock pnpm lint; the unit tests of packages/db, packages/synth, tools/test, tools/brand-colors; DATABASE_URL=... flock pnpm vitest run --project db packages/db/src/domain-model; and pnpm db:domain-model --check --strict on a freshly migrated scratch database (document and directory both pass). Report every item with its test and every check with its result, plus test counts per file.`, { label: 'fix-code', phase: 'Fix' })

const docs = () => agent(`${COMMON}

YOUR PART: the documents. Files: docs/adr/0068-*.md, packages/db/functions/README.md, docs/product/test-matrix.md DBF rows only if wording must change (then ALSO the identical rows in packages/synth/src/cases/matrix.ts; coordinate by keeping them identical), .claude/agents/security-reviewer.md, .claude/skills/new-migration/SKILL.md, docs/runbooks/github-governance.md, docs/runbooks/ci.md, README.md, .github/pull_request_template.md, packages/compliance/src/controls.ts (CO-02 text only). Another agent is changing the code at the same time; do not touch packages/db/src or .gitattributes or tools/test.
${SAVE('fix-docs.md', 'each item done and each check run')}
Bring every document in line with the dispositions: the summary's three parts (the --check statement, the compact list, the Diffs with a budget) and the --function-diffs list form for the PR description vs the full form in CI's job summary (template, README, skill, runbook step 6: the founder compares the list in the description with the CI copy's list); the pinned settings and git isolation in ADR "Determinism"; text eol=lf in .gitattributes (ADR/README); exit codes; custom FILE needs --functions; banner-only removal; schemas other than public refused; the new header lines (Called by policy, Event trigger); the S6 checklist wording in security-reviewer.md, the skill and the README; I3 README "What is not here"; T15 wording; T6 test now exists (name it as the code builder names it: check ${WT} when you finish and align). Remove any claim the code does not make true. Then flock pnpm lint and pnpm lint:copy, and the unit tests of packages/compliance and tools/test. Report each file changed and each check result.`, { label: 'fix-docs', phase: 'Fix' })

phase('Fix')
const fixed = await parallel([code, docs])

phase('Suite')
const suite = await agent(`${COMMON}

YOUR PART: the suite runner. The two fixers reported:
--- code ---
${fixed[0] ?? '(none)'}
--- docs ---
${fixed[1] ?? '(none)'}
${SAVE('fix-suite.md', 'each step done, each command and its result, the commit and push')}
1. Adversarial re-read of the whole diff vs origin/claude/build-platform: every disposition item done (tick each against ${SP}/dispositions.md), docs consistent with code, nothing CI would reject (brand colour scan, fixture guard, gitleaks patterns, lint, copy lint, workflows.test.ts unchanged, codeowners test, synth fixtures test). Fix what you find.
2. The full local suite ONCE, each under flock, in this order (read /home/user/ops/lanes/lane-b.md "One heavy command at a time" and the package.json scripts for exact commands): pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm synth --all then git status clean for fixtures; pnpm test (unit, with coverage as CI runs it); pnpm test:golden; the oracle tests if a script exists; pnpm test:db with DATABASE_URL on 5433 (in shards one after another if the script supports it, else whole); pnpm db:domain-model --check --strict on a freshly migrated scratch database; pnpm build then the e2e suite with E2E_PREBUILT=1 if the machine supports it (read how CI and lane-b.md run it; Playwright 1.56.1 chromium-1194 is installed in /opt/pw-browsers); actionlint. packages/db is not a money package; confirm no mutation shard is affected (tools/stryker/shards.json) and say so. Record every command with its counts (files/tests passed/skipped/failed).
3. If anything fails, root-cause and fix it, then re-run that command.
4. Commit everything in logical commits (messages explaining what and why, each ending with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BcoCApZmuH8eWJEys32HQK
), then push once: git -C ${WT} push origin co-001/db-function-diffs (never --no-verify, never force; if the pre-push hook refuses, fix the commits not yet pushed and push again).
5. Report: the new head SHA, the commits, every command and its counts, each disposition item with its resolution and commit, and anything left.`, { label: 'fix-suite', phase: 'Suite' })
return { code: fixed[0], docs: fixed[1], suite }