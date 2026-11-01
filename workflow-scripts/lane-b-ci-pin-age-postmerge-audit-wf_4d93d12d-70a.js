export const meta = {
  name: 'lane-b-ci-pin-age-postmerge-audit',
  description: 'Adversarially verify the inline steps of #82: the base merge 9db52a2b, description v4 claims, and the merge bce57f16 with its push runs',
  phases: [
    { title: 'Verify', detail: 'three independent lenses try to refute the inline steps' },
    { title: 'Critic', detail: 'completeness critic over the three reports' },
  ],
}

const SP = '/home/user/laneb-sp/p1audit'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. A Lane B item session (session_01FcouKNP2XtaombFLueKLnu) just merged PR #82 (CI follow-up P1, ci-pin-age) into claude/build-platform as merge commit bce57f167bc2217dc25ebbc1cabceb10a195a0a0. It did three steps inline, without a workflow, and you audit them now:
(1) the base merge: commit 9db52a2b690fe9cdaa8270ad2458e5b84aabc687 merges claude/build-platform 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56 into the PR head 96758e442dd01e2fb393ff6e9cac6f07e58a78c2, claimed conflict-free with tree d72150bdbcc65c1de6b7265d8fa45a0b7a6a73b3, equal to GitHub's earlier merge ref b9669bbf's tree, and claimed that pnpm synth --all and tools/screening-capacity/watched.ts --write wrote nothing;
(2) the PR description v4, written with update_pull_request and read back (a copy is at /tmp/pa/body-v4.md; the previous v3 at /tmp/pa/body-v3.md; the live body via gh api repos/PureTideWater/PhysicalTherapy/pulls/82 --jq .body). The v4 changes are: a "9db52a2b merges claude/build-platform at 83d71fd6" bullet, "against base 83d71fd6" in the totals line, a new "CI on 9db52a2b" block, "96758e44 was the pushed head until 9db52a2b", the deviations bullet "merged in at 9db52a2b (2026-11-01), after the merge hold lapsed (2026-10-28 11:00 UTC)", and a second session link in the footer;
(3) the merge: ready_for_review, approval-of-record re-run, merge_pull_request with method merge and expectedHeadSha 9db52a2b; and the push runs on bce57f16.
The status file is /home/user/ops/approval-summaries/lane-b-ci-deps-status.md (its RESUME-BLOCK and the 2026-11-01 entries).

Rules: read only. Change no tracked file anywhere; never git commit, push, checkout, reset, merge or stash in /home/user/PhysicalTherapy, /home/user/ops or any worktree. Scratch clones go under ${SP}/tmp/ (remove when done). gh api reads repos, pulls, commits, Actions runs and job logs. Never comment, review or write on GitHub. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands (pnpm install, tests) only under flock /tmp/laneb-heavy.lock. No model name or identifier in anything you write. Cite a command and its output, or a file:line, for every verdict. Your job is to REFUTE: assume each claim is wrong until the evidence proves it right; say "not verified" where you could not check.
Save as you go in ${SP}/progress/<your label>.md; if it exists, continue from it.`
const V = { type: 'object', properties: { claims: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, verdict: { type: 'string', enum: ['holds', 'wrong', 'not verified'] }, evidence: { type: 'string' }, correction: { type: 'string' } }, required: ['claim', 'verdict', 'evidence'] } }, summary: { type: 'string' } }, required: ['claims', 'summary'] }

phase('Verify')
const lenses = [
  { label: 'git-merge', task: `Lens: GIT AND THE MERGE. In a fresh blobless clone under ${SP}/tmp (git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy), check: 9db52a2b's parents are exactly 96758e44 then 83d71fd6; its tree is d72150bd…; GitHub's refs/pull/82/merge commit b9669bbf (if still fetchable; else say so) has that tree; bce57f16's parents are 83d71fd6 and 9db52a2b and its tree equals 9db52a2b's (the base did not move); git diff --shortstat 83d71fd6 9db52a2b gives 55 files, +7,079 −280; 9db52a2b's message carries the two attribution lines and no model identifier; the merge commit bce57f16's title is in the house form "Merge pull request #82: …"; in a checkout of 9db52a2b, under the lock, pnpm install --frozen-lockfile, pnpm synth --all and pnpm exec tsx tools/screening-capacity/watched.ts --write leave git status --porcelain empty.` },
  { label: 'ci-runs', task: `Lens: CI. With gh api, read every workflow run on 9db52a2b (actions/runs?head_sha=9db52a2b690fe9cdaa8270ad2458e5b84aabc687) and on bce57f16 (head_sha=bce57f167bc2217dc25ebbc1cabceb10a195a0a0, the push runs; wait with run_in_background if any is still running, up to 40 minutes, and report what finished). Check each number and id the "CI on 9db52a2b" block states: ci 41329075340, screening-capacity 41329075376 (capacity 16:59:07Z to 17:16:49Z), mutation 41329075505 (stryker skipped, no money path), release-dry-run 41329075427, approval-of-record 41329075396; unit job 124915155926 with 404 files, 6,893 passed, 1 skipped; static job 124915155871 with the bootstrapping note, all 12 pins aged, the youngest login-action at 9.07 days from its immutable release 2026-10-23T15:22:45Z (check whether another pin is younger), and "no image is new against the base". Check the ready_for_review approval-of-record run 41330852178 succeeded and 41330843515 was cancelled by concurrency (not a failure). Check the branch-protection required checks were green on 9db52a2b at merge time. Report every push run on bce57f16 and its conclusion; any red one is a finding with its failing job and log lines.` },
  { label: 'description', task: `Lens: THE DESCRIPTION AND THE RECORDS. Compare the live body with /tmp/pa/body-v4.md byte for byte (SHA-256 c909ef21…, 31,190 characters). Diff v3 against v4 and check every changed or added line is true (cross-check against git and gh api), that no line elsewhere in the body became stale because of the merge (e.g. text that still calls 96758e44 the head, still says the merge is pending or the hold applies, or counts against 56ed6279 where 83d71fd6 is now meant), that the template's sections are all present (.github/pull_request_template.md on claude/build-platform), that it is under 65,536 characters, and that it holds no model identifier. Then check the status file's RESUME-BLOCK and 2026-11-01 entries against the same evidence (times, ids, counts, the claim that the subscription was refused, that #33 closed 2026-11-01T14:03:52Z: gh api pulls/33 --jq .closed_at). List each wrong or stale sentence with its correction.` },
]
const reports = await parallel(lenses.map(l => () => agent(`${COMMON}\n\n${l.task}\nReturn every claim you checked with its verdict.`, { label: l.label, phase: 'Verify', schema: V })))

phase('Critic')
const critic = await agent(`${COMMON}

Your task: COMPLETENESS CRITIC over three independent audits of the inline steps:
${JSON.stringify(reports.filter(Boolean), null, 1)}

Ask what none of them checked that a merge of this kind must satisfy (LANES rule 6 and 7, the brief's merge steps: merge commit not rebase, expectedHeadSha, required checks, description from the template read back, push runs read, worktree removed, status file updated, orchestrator told). Check each gap yourself before reporting it. Then give the final list of corrections needed (description, status file, or a follow-up), each with evidence; an empty list is a good answer.`, { label: 'critic', phase: 'Critic', schema: V })

return { reports, critic }
