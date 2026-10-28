export const meta = {
  name: 'lane-b-ci-pin-age-verify',
  description: 'PR #82 fresh-clone verification (one agent reading CI on 96758e44), then the description brought up to date and read back',
  phases: [
    { title: 'Verify', detail: 'one agent in a fresh clone, read-only on GitHub' },
    { title: 'Describe', detail: 'apply the verification\'s description corrections and the head\'s CI; read back' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const OUT = SP + '/p1verify'
const R = '/home/user/ops/approval-summaries'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Pull request #82 (draft), "CI follow-up P1, ci-pin-age: action pins and image digests held to the three-day floor (ADR 0066 Part 5)", branch co-001/ci-pin-age, head 96758e442dd01e2fb393ff6e9cac6f07e58a78c2. History: the build (b574d4e8; ${R}/lane-b-ci-pin-age-build-summary.md), two adversarial reviews (${R}/lane-b-ci-pin-age-review-ci-infra.md, ${R}/lane-b-ci-pin-age-review-security-supply.md), the fix round (03e18576, pushed once; ${R}/lane-b-ci-pin-age-fix-round.md; the full local suite ran there), then CI's unit job on 03e18576 failed one case (CI-S3's revert-path history test: CI's git 2.55 prints %cI's UTC as Z, the local git 2.43 as +00:00), fixed by 96758e44 (tree.ts reads %ct epoch seconds and writes toISOString(); red first locally, logs in ${SP}/p1fix/logs/ci-git-time-{red,green}.log). Every check on 96758e44 is green (run 40649212144 ci, 40649212134 screening-capacity, 40649212125 mutation, 40649212209 release-dry-run, 40649212149 approval-of-record). The design: /home/user/ops/designs/lane-b-ci/follow-up-p1-pin-age.md (sections 14 to 16 govern). The base claude/build-platform has moved since the last merge-in (56ed6279); a merge hold (until #75 merges or 11:00 UTC) keeps #82 from merging for now, so the base is merged in at merge time, not now.

Rules: synthetic data only; every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands only under flock /tmp/laneb-heavy.lock; no model name in any file; never commit, push, comment, review, approve or merge (the description update below is the one write to GitHub, and only by the agent whose task says so); GitHub reads through the GitHub MCP read tools (ToolSearch "select:mcp__github__pull_request_read,mcp__github__get_job_logs,mcp__github__actions_list"). Long commands in the background; no long foreground sleep.`
const SAVE = (file, what) => `Save as you go: keep ${OUT}/progress/${file} up to date (${what}). If it exists when you start, you were interrupted: read it and continue.`

phase('Verify')
const verify = await agent(`${COMMON}

You are the FRESH-CLONE VERIFIER. git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/verify-p1 && checkout 96758e44 (detached); flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile.
Verify, with evidence for each:
1. The code against the design (sections 14 to 16) and the reviews' findings: each finding's fix is present and tested (spot-check the riskiest: the BuildKit reader and its fail-closed scan, the revert path's first-parent rule and its new time handling, the push-run warnings, the token's single step and its asserts, the exclude kinds), and nothing outside P1's scope changed (git diff --stat against the merge base with claude/build-platform; no migration, no manifest or lockfile, no product code; of #42's files only the rule-6 shared documents).
2. Local runs at 96758e44 under the lock: pnpm exec vitest run --project unit tools/check-action-pins tools/check-toolchain tools/test (expect 32 files, 451 tests), pnpm typecheck, pnpm lint, pnpm actions:check --offline, BASE=origin/claude/build-platform pnpm actions:check, BASE=origin/claude/build-platform pnpm toolchain:check, actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml, pnpm synth --all then git status (clean).
3. CI on 96758e44: every check run (names, conclusions); the unit job's counts (files, passed, skipped) against the base it ran on (the pull_request merge ref: read the base sha from the checkout step's log and that base's own latest unit count if you can, then base + P1's 3 files and 93 tests = 62 + 31); static's "Action pins" (the bootstrapping note, every pin's age block: on default branch, tag names pin, verified_at with reason, published_at, immutable, the youngest signal, the arrival read) and "Toolchain" lines; images, capacity and the dry run green.
4. The description (pull_request_read get) against the code and CI: every claim and number; list each mismatch with the corrected text. In particular it must record the 96758e44 fix (the git time) and 96758e44's CI; the counts; the reviewer table complete (every finding of both reviews with its resolution); the template's sections and markers; the footer.
Write ${R}/lane-b-ci-pin-age-verify-summary.md (not committed): verdict per item (PASS/FAIL with evidence), and a final "Description corrections" list (each: the current text, the corrected text). Remove the clone when done.
${SAVE('verify.progress.md', 'each item and its verdict')}
Return the summary's text.`, { label: 'verify', phase: 'Verify' })

phase('Describe')
const describe = await agent(`${COMMON}

You bring #82's description up to date. The verification's report:
${verify}
Read the current description (pull_request_read get) to ${OUT}/body-before.md. Write ${OUT}/body-v3.md: the same text with every "Description corrections" item applied exactly, plus, if not already there, the 96758e44 fix in "What changes" or the fix-round list (one bullet: why CI's unit failed on 03e18576 and what 96758e44 changes) and "What CI showed on 96758e44" (every check green; the unit counts; the pins table unchanged unless CI's reading changed; the run ids above), with the earlier head's run recorded as what it was (unit red on one case, everything else green, capacity cancelled by the push). Keep the template's sections, markers and the footer exactly. Apply with update_pull_request (body only; never the draft flag; load it with ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"), read back to ${OUT}/body-v3-readback.md and cmp (identical, else fix and read back again). Report the cmp result, both SHA-256s and byte counts.
${SAVE('describe.progress.md', 'what is applied and the read-back result')}
Return: each change made, and the read-back result.`, { label: 'describe', phase: 'Describe' })

return { verify, describe }
