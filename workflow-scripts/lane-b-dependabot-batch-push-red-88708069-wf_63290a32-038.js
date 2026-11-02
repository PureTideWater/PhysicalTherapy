export const meta = {
  name: 'lane-b-dependabot-batch-push-red-88708069',
  description: 'Root-cause the red unit job of the push run on 88708069 (#90 merge): FRM-01 browser test timed out; investigator, then a skeptic',
  phases: [
    { title: 'Investigate', detail: 'history, tree identity, test code, runbook rule' },
    { title: 'Challenge', detail: 'a skeptic tries to refute the conclusion' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Lane B's item "dependabot-batch" merged PR #90 (head cf124313, @anthropic-ai/sdk 1.3.0 in packages/model-gateway; it changes no file under apps/web) into claude/build-platform as merge commit 88708069 at about 03:52Z on 2026-11-02. #90's own PR CI on cf124313 passed every job, unit included (unit: 416 files, 7,013 passed, 1 skipped). The push run of 88708069 (ci run 41386010790) failed in the unit job (job 125086906641): one test, apps/web/src/components/action-form.browser.test.tsx > "a refused form in the browser" > "FRM-01: a page out of date whose refresh shows another person clears the form, says so, and invites no press; the new person's press sends their own key (S-SEC-2)", "Test timed out in 30000ms" at :366; 415 files passed, 7,012 tests passed, 1 skipped; duration 249 s. The "all green" job failed because unit did.
Rules: READ ONLY. Never push, comment, review, re-run, cancel or merge on GitHub. Use gh api (this repository only) and the GitHub MCP read tools (get_job_logs with return_content and a large tail_lines, actions_list/actions_get). Work under ${SP} (a blobless clone if you need one: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-<you>); every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock. Cite run/job ids, file:line and UTC times. No model name in anything you write.`

phase('Investigate')
const inv = await agent(`${COMMON}

Your task: ROOT-CAUSE the failure and say exactly what should happen.
1. Tree identity: is 88708069's tree identical to cf124313's tree and to the merge ref #90's PR CI tested (git rev-parse <sha>^{tree})? If identical, the code that failed is the code that passed.
2. History of this test: list the last ~40 ci runs on claude/build-platform (push) and on open PRs (pull_request), and for each failed unit job read the log for FRM-01 or any action-form.browser.test.tsx failure or any "Test timed out" in a browser test. Also read the passing runs' timing for this test if the log shows it (vitest prints slow tests' ms). How often has it timed out, on which runners, and how long does it usually take?
3. The test itself: read apps/web/src/components/action-form.browser.test.tsx around :300-:420 and its harness; what does FRM-01 do that can take 30 s (a page refresh, a second browser context, waits)? What is its timeout, the unit project's testTimeout, and the browser setup (Chromium launch per file?). Is there a known flake record (docs/runbooks/ci.md, approval-summaries, LANES.md, lanes/lane-b.md on claude/build-ops: git fetch origin claude/build-ops and grep for FRM-01, action-form, "timed out")?
4. The runner: the job's runner image and labels, and whether the run shows signs of slowness (duration vs #90's PR run, other slow tests' ms in the same log vs the PR run's log).
5. The rule: read docs/runbooks/ci.md (around line 150 and "Reading a red gate" or the flaky-test section) and say whether this failure qualifies for a re-run under it, and who may re-run (the session that merged, the orchestrator, a person).
6. Conclude: (a) is it caused by #90's change (yes/no, evidence); (b) the root cause in one paragraph; (c) the recommended action now (re-run the failed job once under the runbook, or not, and why); (d) a durable fix if the test is fragile (where, what, which item it belongs to), as a proposal.
Write ${SP}/investigation.md and return it.`, { label: 'investigate', phase: 'Investigate' })

phase('Challenge')
const chk = await agent(`${COMMON}

Your task: try to REFUTE this investigation. Check its claims yourself (tree identity, the history count, the runbook rule, the root cause). Say what is wrong or unproven, and whether its recommended action is right.
=== INVESTIGATION ===
${inv}
Write ${SP}/challenge.md and return a verdict line "HOLDS" or "DOES NOT HOLD: <why>" followed by your evidence.`, { label: 'challenge', phase: 'Challenge' })
return { inv, chk }