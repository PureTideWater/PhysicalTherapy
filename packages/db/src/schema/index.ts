/**
 * The Drizzle schema, one file per area, alongside the hand-written SQL in packages/db/migrations.
 * Milestone 1 adds tenancy.ts (practice, organization, membership, grant, agreement) here.
 */
export { type RuleRecordRow, type RuleReleaseRow, ruleRecord, ruleRelease } from './rules';
