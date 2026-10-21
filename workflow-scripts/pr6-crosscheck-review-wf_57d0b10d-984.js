export const meta = {
  name: 'pr6-crosscheck-review',
  description: 'Two adversarial reviews of the PR 6 cross-check type-map fix (26de663..6a4ec80)',
  phases: [{ title: 'Review', detail: 'two independent reviewers' }],
}
const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', properties: {
    title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
    file_line: { type: 'string' }, failure_path: { type: 'string' }, fix: { type: 'string' } },
    required: ['title', 'severity', 'file_line', 'failure_path', 'fix'] } },
}, required: ['verdict', 'findings'] }
const CTX = `Repository puretidewater/physicaltherapy, branch co-001/pr-06-free-screening (draft PR #31). Review only the change 26de663..6a4ec80 (two commits: e297346 and 6a4ec80), in a fresh clone under /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-cc/<your lens>. Change nothing in /home/user/pr6.
The change: packages/db/src/domain-model/cross-check.ts kept its own Drizzle-to-information_schema type map without PgSmallInt, so the domain model's Cross-checks block reported four false column differences on screening_outcome.*_share_pct. The map is now one exported POSTGRES_TYPES with PgSmallInt. migrate.db.test.ts reads it instead of its own copy, a new unit test cross-check.test.ts holds it to every Drizzle column type, and docs/product/domain-model.md was regenerated (new approval hash a17f33aa3b3ace6efcf11171789b6cfbdb0193f0dc76be5b28cdd47840deebfe, approval line blank for the founder).
Environment: Node 24 at /opt/node24/bin first on PATH; PostgreSQL 18 on port 5433, postgres:test, socket /tmp. Name scratch databases tp_pr6cc_<lens>_<n> and drop them, and delete your clone at the end. Report only findings with a concrete failing path; severity blocking, should_fix or nit; call StructuredOutput (an empty list if none) before you stop.`
const lenses = [
  { key: 'generator', text: 'Lens: the generator and the gate. Regenerate the document from a fresh PG 18 migration and confirm it is byte-identical to the committed one apart from the provenance line, that --check --strict passes, and that --require-approval refuses only the blank approval line with hash a17f33aa.... Confirm the diff 26de663..6a4ec80 in domain-model.md is only the cross-check lines, the provenance line and the hash. Check that the hash the founder signs excludes exactly what the generator says it excludes.' },
  { key: 'tests', text: 'Lens: the tests. Confirm migrate.db.test.ts still compares every column (run its "the Drizzle schema" tests on PG 18), that moving the map loses no type it had, that cross-check.test.ts fails without PgSmallInt and passes with it, that importing cross-check.ts from migrate.db.test.ts pulls in nothing that breaks the db project or the unit project (vitest projects in vitest.config.ts), and that typecheck and eslint pass on the three changed files.' },
]
const reviews = await parallel(lenses.map(l => () => agent(`You are an independent adversarial reviewer. ${CTX}\n\n${l.text}`, { label: `review: ${l.key}`, phase: 'Review', schema: REVIEW, effort: 'medium' })))
return { reviews }