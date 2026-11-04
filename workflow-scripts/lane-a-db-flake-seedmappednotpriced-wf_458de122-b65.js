export const meta = {
  name: 'acting-s4-db-flake-seedMappedNotPriced',
  description: 'Root-cause the db (2/4) failure on #117 (route-tests.8.db.test.ts practice.reports.documents.pdf, PricingRunInputError in seedMappedNotPriced): whose, why intermittent, the fix; skeptic',
  phases: [
    { title: 'Investigate', detail: 'log, code, reproduction' },
    { title: 'Skeptic', detail: 'refute the conclusion' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dbflake'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. PR #117 (co-001/test-flakes-5, head bb01093d, base 00fd2906 merged; tests only: e2e/a11y.ts and two e2e specs, CI-19's matrix row and fixture, synth's matrix.ts and registry.ts) got a red db (2/4) job in ci run 41914482949: apps/web/src/lib/routes/route-tests.8.db.test.ts (or similar) > practice.reports.documents.pdf failed with a PricingRunInputError thrown by seedMappedNotPriced. CI on the base (00fd2906, 30871f72) was green, and the same file passed 3 of 3 locally at the head. Worktree at the head: /home/user/test-flakes-5. Rules: read only. GitHub reads through the mcp__github__ tools (ToolSearch "select:mcp__github__get_job_logs,mcp__github__actions_list"); gh only for search. Heavy commands (db tests) under flock /tmp/laneb-heavy.lock, with export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH and DATABASE_URL pointed at the local test Postgres the repo's db tests use (read package.json and the db test setup). No model identifier in any file. Scratch under ${SP}. docs/runbooks/ci.md: a test that passes on a re-run is a flaky test and gets fixed (quote it).`
const SAVE = (f) => `Save as you go in ${SP}/progress/${f}; continue from it if it exists.`

phase('Investigate')
const inv = await agent(`${COMMON}

INVESTIGATE: (1) Get the db (2/4) job's log for run 41914482949 (list_workflow_jobs, then get_job_logs with return_content and enough tail_lines): quote the failure and the stack, with the start time of the run (UTC). (2) Read seedMappedNotPriced, the test, and the PricingRunInputError path in packages/pricing. What input makes it throw, and is it date-dependent (service dates, windows computed from now, the remittance date, the month boundary, UTC midnight, a timezone), random (unseeded data, ordering, a uuid), or shared state between tests in the same shard (route-tests are sharded; which other tests share its database, and whether a previous test can leave rows that change the seed's inputs)? (3) Reproduce it: run the file under a faked clock at the CI run's time and around date boundaries if it is date-dependent, or with the same shard's neighbours in the CI order if it is state-dependent, or with seeds varied if it is random. (4) Does #117's diff touch any of this? Is it on the base too: does the same test exist unchanged at 30871f72, and has it failed in other recent ci runs (search a few db (2/4) job logs, actions_list list_workflow_runs)? (5) Recommend the fix at the root: a test-only fix (deterministic dates or isolation) or a product bug in pricing (then say so plainly, since money code needs two reviews), and who owns it.
Write ${SP}/report.md and return it.
${SAVE('inv.md')}`, { label: 'investigate', phase: 'Investigate' })

phase('Skeptic')
const sk = await agent(`${COMMON}

SKEPTIC. The investigation:
${inv}
Try to refute it against the log and the code. Is the cause shown or inferred? Did the reproduction actually fail for the stated reason? Is "not #117's" demonstrated? Is the fix at the root, and is its scope right (test-only vs pricing)?
${SAVE('skeptic.md')}
Return UPHELD or REFUTED with the corrected summary: the cause, whose it is, the fix, the owner, and whether the base is affected.`, { label: 'skeptic', phase: 'Skeptic' })
return { inv, sk }
