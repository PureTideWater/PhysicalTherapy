export const meta = {
  name: 'pr6b2-merge-base',
  description: 'PR 6b-2 (#36): merge 6b-1 fix head 3e6f4b9, resolve the four conflicts keeping both sides, apply the four items 6b-1 fix round left for 6b-2, targeted checks, one push',
  phases: [{ title: 'Merge', detail: 'one agent in /home/user/pr6b2' }],
}

const WT = '/home/user/pr6b2'
const BR = 'co-001/pr-06b-pricing-location'
const BASE = 'co-001/pr-06b-zip4-engine'
const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const FIXLOG = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/tasks/waif4wfvu.output'
const BUILDLOG = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/tasks/wazgrgdht.output'

const RESULT = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' },
  domain_model_sha256: { type: 'string', description: 'the regenerated document hash, or "unchanged: <hash>"' },
  resolutions: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, how: { type: 'string' } }, required: ['file', 'how'] } },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'domain_model_sha256', 'resolutions', 'checks', 'open_items'] }

phase('Merge')
const r = await agent(`Repository PureTideWater/PhysicalTherapy (PaidWhole). PR 6b-2 is draft #36, branch ${BR} in worktree ${WT}, head 7c7b078, stacked on ${BASE} (PR 6b-1, draft #35), whose review round just pushed its fix head 3e6f4b9 (from 210a043). #36 now conflicts with its base in four files: docs/adr/0064-*.md, docs/product/test-matrix.md, packages/synth/src/cases/registry.ts and tools/engine-freeze/exception.json. 6b-1's fix round report is in ${FIXLOG} (JSON, key fix: its dispositions and open items); 6b-2's build report is in ${BUILDLOG} (JSON, keys l1, l2, l3, pr). Read the relevant parts, not the whole files.

Your job, and nothing more (the full review round of #36 comes later):
1. In ${WT}: git fetch origin ${BASE}; git merge --no-ff origin/${BASE} (a merge commit; never rebase, amend or force-push). Resolve each conflict keeping BOTH sides' intent: ADR 0064 keeps 6b-1's fix-round changes (the new ENGINE_ERROR detail no_locality_plus_four, plus_four_unlisted in the trace, the freeze tool's rules) and 6b-2's amendment sections; test-matrix.md and registry.ts keep 6b-1's wording of PRC-21 and PRC-22 and 6b-2's PRC-23, PRC-24, SCR-15, SCR-16 and PRC-21's location test; then regenerate what is generated from them with the repository's tools (pnpm synth --all; packages/synth/src/cases/matrix.ts by its own generator or rule), never by hand.
2. The four items 6b-1's fix round left for 6b-2 (its open item 3):
 (1) The engine now stops a flagged ZIP whose locality_map_plus_four record is not in force on the date with ENGINE_ERROR detail no_locality_plus_four (a content gap), and keeps zip_plus_four_not_in_locality_map for a ZIP+4 no range lists. Make 6b-2 treat no_locality_plus_four as the content gap it is everywhere it classifies a stop or a status: the worker's location handling (locality_not_loaded: waiting on content, the operator told, never blamed on the customer and never asking the practice to change its ZIP), the re-run diff and cause labels, the web's status words, and the screening (its refusal or label for that detail; DETAIL_LABELS; if the labels change, keep the labels version consistent with the migration). Tests that fail before and pass after.
 (2) tools/engine-freeze/exception.json for #36 in 6b-1's new format: pull_request 36, no engine files, no golden entries, and exactly one rule_table_ddl entry naming this PR's migration statement (the rule_record CHECK) as check.ts prints it (unused entries are now problems).
 (3) Regenerate tools/engine-freeze/rule-tables.catalog.json for the widened CHECK with the repository's own update path (6b-1's note: pnpm test:db -u tools/engine-freeze/rule-tables.db.test.ts on a freshly migrated PostgreSQL 18 database), and make sure the freeze check accepts that change only because of #36's exception.
 (4) Confirm the CHECK widening and the closed-list test (RULE_RECORD_TYPES equals the CHECK's values) still hold after the merge.
 If any of this needs a change to this PR's own unmerged migration 20261105090000_pricing_location_and_zip_plus_four.sql, use the marker route .claude/skills/new-migration/SKILL.md documents (the marker created by a shell command for the edit and removed in a trap; never committed; never for an applied migration), then regenerate docs/product/domain-model.md on a fresh PG 18 database (pnpm db:domain-model --out --strict) and read its Cross-checks block. Never write the approval line or approvers.json.
3. Checks on the final tree, each with its command and result: pnpm typecheck; pnpm lint; pnpm lint:copy; PR_NUMBER=36 pnpm -s exec tsx tools/engine-freeze/check.ts $(git merge-base origin/${BASE} HEAD); CI=true ENGINE_FREEZE_BASE=$(git merge-base origin/claude/build-platform HEAD) pnpm exec vitest run tools/engine-freeze; the synth fixtures test; the unit and db tests of every file you changed (on fresh PostgreSQL 18 databases), including tools/engine-freeze/rule-tables.db.test.ts, packages/db location and screening, the worker's price and screening tests and the web's screening and pricing-location tests; pnpm -s db:domain-model --check (only --require-approval may fail, until the founder signs). Use databases tp_pr6b2_merge_<n> on port 5433 (postgres:test, socket /tmp) and drop them; never touch /home/user/pr6b1 or databases tp_pr6b1_*.
4. Commit in the repository's style (lowercase area prefix; one sentence of what and why). End each commit message with, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH
Push ONCE: git push -u origin ${BR} (retry after 2, 4, 8, 16 s on a network error; never force, never --no-verify; a refused push is fixed by rewriting only unpushed commits). Then update #36's body with the GitHub MCP tool update_pull_request (ToolSearch "select:mcp__github__update_pull_request") where it states the exception, the domain model's SHA-256, the ENGINE_ERROR details or the merge; keep it a draft and keep its ending lines.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. CLAUDE.md binds; the edit hooks are live and never bypassed; never skip or loosen a test. Logs under ${SP}/pr6b2-merge/. Report briefly: the head you pushed, the domain model's SHA-256 (or unchanged), each resolution, each check, the open items.`, { label: 'merge: 6b-1 fix head into 6b-2', phase: 'Merge', schema: RESULT })
if (!r) throw new Error('the merge agent returned nothing')
return r
