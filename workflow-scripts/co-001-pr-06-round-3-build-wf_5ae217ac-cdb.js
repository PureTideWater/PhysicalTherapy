export const meta = {
  name: 'co-001-pr-06-round-3-build',
  description: 'PR 6 round 3 build: merge the build branch, then audit #57 schema and day-one writes and #53 capacity test and release cache, to the reviewed design and the founder rulings of 2026-10-20',
  phases: [
    { title: 'Merge' },
    { title: 'Build' },
  ],
}

const WT = '/home/user/pr6'
const BR = 'co-001/pr-06-free-screening'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const DESIGN = `${SP}/design/pr6-53-57-screening.md`
const DECISIONS = `${SP}/design/decisions-2026-10-20.md`
const ENV = `Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. gitleaks is /tmp/claude-0/gitleaks/gitleaks; actionlint 1.7.7 is ${SP}/gov-r2/actionlint. Postgres 18 is postgres://postgres:test@localhost:5433/postgres and Postgres 16 is on 5432 (never stop either). Scratch databases are named tp_pr6r3_<role>_<n> and dropped after use. Logs go in ${SP}/pr6-r3/<role>/.`
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head 3c1b289 (verified: the 11-claim-line floor, the rows hash, one screening a practice). Its migration 20261104090000_free_screening.sql is unmerged and awaits the founder's approval, so this round's schema goes into that same migration. PR 5 merges first; PR 6 regenerates its domain model again after that.

This round builds two audit items the founder folded into PR 6 on 2026-10-20, exactly to the reviewed and revised design in ${DESIGN}. The founder accepted the recommended answer to every question in it (decisions 7 to 19 in ${DECISIONS}); build to those answers and record each ruling, dated 2026-10-20, in ADR 0062 and reconciliation-001 the way earlier rulings are recorded. Read the design in full before writing code; where the code disagrees with the design, follow the code's facts and say so in your summary.

Rules that bind: CLAUDE.md's four rules and its Never list; screening data holds no PHI and none may enter it; the catalog and cross-tenant tests must pass; no change under packages/pricing/src, fixtures/golden, content/releases or the ledger; never write the domain model's approval line or touch approvers.json; no pull request is opened in this step; main is never touched.

Process the founder ruled on 2026-10-20: builders run the whole-repository 'pnpm typecheck', plus lint and the tests of the packages they changed (unit and db tests of those packages, and the e2e spec they change). The full suite runs later in the fix round and in GitHub CI. Keep your returned summary short: what you built, every check with its result, every open item; full logs on disk.`

const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'checks'],
}

phase('Merge')
const merge = await agent(`${CONTEXT}

${ENV}

Your task: merge origin/claude/build-platform (262d37d, the #24 runner pin) into ${BR} with a merge commit (never rebase, amend or force-push). It is expected to merge cleanly. Run pnpm install --frozen-lockfile, pnpm typecheck and the workflows test (pnpm exec vitest run --project unit tools/test/workflows.test.ts). ${ATTR} Push with git push -u origin ${BR}, retrying after 2, 4, 8 and 16 s on network failure. Do nothing else. Return the summary, the pushed head and the checks.`, { label: 'merge build branch', phase: 'Merge', schema: RESULT })
if (!merge) throw new Error('merge failed')

phase('Build')
const SHARED = `You and one other builder share ${WT} (head ${merge.head}). Stage only your own paths and commit with 'git commit -m ... -- <paths>'; retry if the index is locked; push after each commit with the 2/4/8/16 s retry (if rejected because the other builder pushed first, 'git pull --no-rebase origin ${BR}' and push again; never force). Failures in the other builder's files are reported, not fixed. Commit messages follow the repository's style (lowercase area prefix, one sentence saying what changes and why, naming the audit item and the founder's ruling of 2026-10-20). ${ATTR}`
const builds = await parallel([
  () => agent(`${CONTEXT}

${ENV}

${SHARED}

Your part: audit #57, the schema and the day-one writes (design sections for #57), plus the #51 column (screening_terms_sha256) the founder approved for this migration. You are the ONLY editor of packages/db/migrations/20261104090000_free_screening.sql in this round (if a protect-content hook refuses the edit, create ${WT}/.claude/.allow-protected-edit for the edit, remove it in a shell trap, and never commit it). Build: every column, table, CHECK, grant, function and registry decision the design lists; Drizzle; the row factory; the writes PR 6 makes from day one (source, campaign codes from the first-party attribution cookie, referring firm on the screening and audit request forms, the counts-only outcome row kept past expiry and replacement without allowing two outcomes to be subtracted into a small cell, lost reasons on decline, 'result opened' recorded by a signal after the page renders); the reworded surfaces (decision 7: the plain list of what is kept, on every surface the design names); proxy.ts and ADR 0062 for the attribution cookie (decision 11). Consent capture is PR 6e and the console funnel PR 7: do not build them. Tests: db tests for every CHECK, function, grant and retention rule (including that no outcome names a person, email or ZIP, that outcomes survive replacement and expiry, and that a pair of outcomes cannot reveal a small cell), the catalog and cross-tenant tests, unit tests for the cookie and the source list, and the screening e2e updated. Regenerate nothing in docs/product/domain-model.md in this step (the fix round does it last). Return the summary, your last pushed head, every check and the open items.`, { label: 'build: #57 schema and writes', phase: 'Build', schema: RESULT }),
  () => agent(`${CONTEXT}

${ENV}

${SHARED}

Your part: audit #53 parts 1 and 2 (design sections for #53). Do NOT edit the migration; if you need a SQL change, write it exactly in your summary for the other builder. Build: the production-shaped synthetic release in packages/synth (never real content; counts following CMS public files as the design says), the capacity test (three 50,000-row uploads at once, a small one behind them, a cold cache, under the production task limits the design specifies), its verdict logic (fail at 48 s on the runner until staging measures the runner-to-Fargate factor, then 60 s scaled by it; timing reported as 'open, PR 6b' until environments.ts declares the screening consumer, switched in tested code: decisions 13 to 16), the scheduled workflow pinned to ubuntu-24.04 with push and pull-request triggers as the design says (the workflows test must pass; run actionlint), and the release cache held once per release instead of once per ZIP, proven equal in output to the old path on the same inputs. Tests: unit tests of the verdict logic and the cache, the capacity test itself run once locally with its measured times reported (load on this 4-CPU machine is shared; report the load average beside the times). Return the summary, your last pushed head, every check and the open items.`, { label: 'build: #53 capacity test and cache', phase: 'Build', schema: RESULT }),
])
return { merge, builds }
