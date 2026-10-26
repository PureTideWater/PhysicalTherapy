export const meta = {
  name: 'lane-b-db-function-diffs-design-review',
  description: 'One adversarial review of the db-function-diffs design (audit #111)',
  phases: [{ title: 'Review', detail: 'one adversarial design reviewer' }],
}
const SP = args.sp
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'sound | sound-with-changes | unsound' },
    needsMigration: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', description: 'blocking | should | nit' },
          section: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string', description: 'file:line or command output proving it' },
          fix: { type: 'string', description: 'the concrete change to the design' },
        },
        required: ['id', 'severity', 'problem', 'evidence', 'fix'],
      },
    },
    improvements: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'needsMigration', 'findings'],
}
phase('Review')
const r = await agent(`You are the one adversarial reviewer of a design for the PaidWhole monorepo (Lane B, combined audit #111: "Show database function changes as readable diffs"). Your job is to find what is wrong, missing, or not the best option in the design, judged on correctness, security, reliability, determinism, reviewer experience and maintainability. Never weighted by build effort.

${SAVE('design-review.md', 'each finding as you confirm it, with evidence')}

Read:
- The design: /home/user/ops/designs/lane-b-db-function-diffs.md
- The audit item: /home/user/ops/audits/combined/combined-report.md section "### 111."
- The code it extends, in /home/user/PhysicalTherapy (claude/build-platform, read-only for you): packages/db/src/domain-model/*.ts (generate.ts, catalog-reads.ts, model.ts, render.ts, migration-text.ts, summary.ts, approval.ts, sources.ts, domain-model.db.test.ts, domain-model-drift.db.test.ts, summary.test.ts), packages/db/src/cli/domain-model.ts, .github/workflows/ci.yml (jobs db and domain-model), tools/test/workflows.test.ts, tools/test/codeowners.test.ts, .github/CODEOWNERS, .claude/skills/new-migration/SKILL.md, .claude/agents/security-reviewer.md, docs/runbooks/github-governance.md (the domain-model approval steps), docs/adr/0063 and docs/adr/0066, the pre-push hook's fixture guard (packages/synth/src/guard and .githooks or tools that the hook calls), package.json scripts, any lint/format config that would read .sql files.
- A migrated scratch database you may query read-only: postgres://postgres:test@localhost:5433/tp_dbf_probe (PostgreSQL 18.4, all migrations applied). psql is on PATH. Use it to check claims, e.g. pg_get_functiondef output, determinism under the generator's pinned GUCs, what PostgreSQL prints for ACLs, prokind, overloads, whether pg_get_functiondef depends on search_path. Never write to it; do not create other databases.
- The open PR #42's file list: /tmp/claude-0/pr42-files.txt (this work must touch none of those files, except the shared docs/product/test-matrix.md).

Attack in particular:
1. Does it truly need no migration, and does the domain model's text and hash stay unchanged?
2. Determinism: is pg_get_functiondef output stable across the generator's pinned settings, PostgreSQL 18 minor versions and CI (postgres:18 image) vs local 18.4? Anything depending on OIDs, locale, search_path?
3. Is the file layout (one file per name, overloads together, packages/db/functions/) the best for review and git history? Filename safety.
4. Drift-check placement: will CI actually fail a migration merged without regenerated files, in both the db job and the domain model job, with no workflow change? Is the "uncommitted inputs" exclusion right? Do other tools (fixture guard, gitleaks, lint, verify-content, codeowners test, workflows test) react to new .sql files under packages/db?
5. Security: can the generated files ever mislead the founder (e.g. drift between file and approved doc)? Is the body-hash binding correct (compare with how model.ts computes bodySha256 and what render.ts prints)? Any PHI risk? Should CODEOWNERS name the directory?
6. Effects on Lane A's open #42 and every future migration PR.
7. Missing tests, missing docs, missing reviewer guidance; is ADR 0068 warranted.
8. Anything better that the design rejected or missed.

Report every finding with evidence (file:line or command output), and a concrete fix to the design. Include nits. Also list improvements worth making.`, { label: 'design-reviewer', phase: 'Review', schema: FINDINGS })
return r