export const meta = {
  name: 'lane-b-db-function-diffs-review',
  description: 'Two adversarial reviews of PR #46 (db/migration tooling correctness; security reviewer)',
  phases: [{ title: 'Review', detail: 'two independent adversarial reviewers in fresh clones' }],
}
const SP = args.sp
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const FINDINGS = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', description: 'blocking | should | nit' },
      file: { type: 'string' }, line: { type: 'number' },
      problem: { type: 'string' }, evidence: { type: 'string', description: 'command output or code path proving it; a failing input where possible' },
      fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'problem', 'evidence', 'fix'] } },
  },
  required: ['summary', 'findings'],
}
const COMMON = (name) => `You are an adversarial reviewer of GitHub PR PureTideWater/PhysicalTherapy#46 (branch co-001/db-function-diffs, head ${args.head}, base claude/build-platform 6ddd587): combined audit #111, readable database-function diffs. Default to finding problems; every claim must carry evidence.

Set up your own fresh clone (do not use /home/user/db-function-diffs, and never push or commit): git clone -q --no-tags -b co-001/db-function-diffs https://github.com/PureTideWater/PhysicalTherapy ${SP}/review-${name} ; cd there; git fetch -q origin claude/build-platform; export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile. Wrap every install, typecheck, lint, test run in flock /tmp/laneb-heavy.lock (one heavy command at a time on this machine). Database: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18.4; create scratch databases named tp_rev_${name}_* and drop them when done). Run only the tests you need, never the full test:db or e2e.

Read: the design /home/user/ops/designs/lane-b-db-function-diffs.md (§7 wins), the PR description (gh api repos/PureTideWater/PhysicalTherapy/pulls/46 --jq .body), the full diff vs origin/claude/build-platform (the 337 packages/db/functions/*.sql are generated; sample them and verify generation rather than reading all), ADR 0068, CLAUDE.md's rules. The PR must touch no file of open PR #42 (/tmp/claude-0/pr42-files.txt) except docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts; no migration; docs/product/domain-model.md unchanged; tools/test/workflows.test.ts unchanged.

${SAVE('review-' + name + '.md', 'each finding as confirmed, with evidence')}
Report every finding, nits included, with a concrete fix. Also report improvements worth making.`

phase('Review')
const [tooling, security] = await parallel([
  () => agent(`${COMMON('tooling')}

YOUR LENS: database and migration tooling correctness. Attack: determinism of the generated files (settings, order, PostgreSQL output, the 'C' collation sorts, trailing newlines, SQL-standard bodies, procedures); whether --out/--check/--functions/--summary-since behave as documented in every combination (custom --out FILE, --check FILE, INIT_CWD, relative paths, missing directory, README handling, symlinks, ignored files, a non-git checkout, a shallow clone in CI with fetch-depth 0 vs 1); the summary section's git usage (refs, temp dirs cleanup, large diffs, fences containing backticks, a file renamed/overloaded); the provenance pathspec; whether the drift checks really fail a migration merged without regenerated files (try it: add a probe migration in a temp copy and run --check and the db test logic); concurrency/ordering of writes; error handling (exit codes 1 vs 2); the existing summary output unchanged (run the existing summary tests and compare --summary-since output on the base); tests that are weak, tautological or would pass on a broken implementation (mutate the code mentally or actually in your clone and see which tests catch it); the synth entries and fixtures; README/ADR/test-matrix accuracy versus the code.`, { label: 'review-tooling', phase: 'Review', schema: FINDINGS }),
  () => agent(`${COMMON('security')}

YOUR LENS: .claude/agents/security-reviewer.md (read it) applied to this PR, which reads packages/db and runs in CI, plus the governance angle. Attack: can the generated files mislead the founder or a reviewer into approving a schema change (file vs catalog vs approved document; the body-hash label; a change that lands in the catalog but not the files or the summary; GitHub collapsing or hiding the diffs; a hand-edited file that passes); is any privilege state (PUBLIC, grantor, grant option, owner, SECURITY DEFINER, search_path, LEAKPROOF) rendered ambiguously or omitted; path traversal or symlink attacks in the writer and comparer; command injection or option injection in the git calls (refs, file names); temp-file safety; PHI or secrets risk (no PHI; gitleaks patterns; log output); CODEOWNERS and .gitattributes correctness and their tests; whether the reviewer checklist added to security-reviewer.md and the new-migration skill is right and complete for tenant isolation (RLS helpers, app.practice_ids, definers); the CI angle (does the domain model job or db job now run anything untrusted from a PR; does --summary-since on a PR's base ref read only safe content). Check the read-only catalog transaction is still READ ONLY and rolled back.`, { label: 'review-security', phase: 'Review', schema: FINDINGS }),
])
return { tooling, security }