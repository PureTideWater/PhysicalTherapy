export const meta = {
  name: 'co-001-governance-round-3-fix',
  description: 'Governance round 3: close the fixture-check gap (X12 after a line of text) and the verification\'s runbook points; then a fresh-clone check that reads CI',
  phases: [
    { title: 'Fix' },
  ],
}
const WT = '/home/user/governance'
const BR = 'co-001/governance'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
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
phase('Fix')
return await agent(`Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head 98392bf, verified in a fresh clone. It is open as draft pull request #25 into claude/build-platform, and GitHub CI is running on it. Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; gitleaks 8.24.3 at /tmp/claude-0/gitleaks/gitleaks (or pnpm gitleaks:install); actionlint at ${SP}/gov-r2/actionlint. Logs go in ${SP}/gov-r3/. Push with git -c core.hooksPath=.githooks push origin ${BR}, which runs the pre-push hook, with the 2/4/8/16 s retry. ${ATTR} Never force-push, open a pull request, touch main, the domain model, its approval line or approvers.json. Keep the returned summary short: what changed, every check, every open item.

The fresh-clone verification left these items. Fix each in proportion; for any you do not fix, say why.
1. Fixture-check gap: the pre-push hook and CI's pnpm check:fixtures read an X12 interchange only at the start of a file (after white space or a byte-order mark). One after a line of other text, in a .txt or .md outside fixtures/ and packages/synth/, passes both, while .claude/hooks/fixture-guard.sh finds an ISA header anywhere. Make the commit-mode fixture check find a structured ISA header anywhere in any text file the push adds or changes, with the same rule the edit hook uses (only SYNTHSENDER interchanges allowed), without flagging prose that merely mentions ISA. Add tests: after a line of text in .txt and .md, mid-file, in a file outside fixtures/, and prose that passes. Prove it with the pre-push hook against a scratch bare remote.
2. Runbook 3i and 3j are out of order: do 3j's identity check in a new session first, and resume only in new sessions.
3. Runbook 3j: say what to do when the new session reports an error or no login (repeat 3f before going on).
4. Runbook 3f and 3g read as the same thing on a phone: say plainly that 3g does not undo 3f, and whether the build needs the claude.ai GitHub connector at all (it uses it for pull requests, reviews of state and merges; say what it needs).
5. Possible lockout: if anything the build uses authorizes as an OAuth app rather than the Claude GitHub App, a new organization's OAuth app access restrictions block it until an owner approves it under Settings, Third-party access. Add that step to the move, with how to tell.
6. Runbook 8.3 and ADR 0063: 'Only README.md and .github/dependabot.yml differ between the two branches' trees' is wrong as written; say that of main's 10 files only those two differ.
7. Runbook 8.1 puts the five required checks on 'Protect main' before the preparation, which blocks any other pull request into main until launch. Move 8.1 to just after the launch pull request opens, or say so plainly.
8. A pull request into main cut from main has no .githooks/pre-push, so the launcher refuses its push from its own checkout, and its first suggestion ('Merge claude/build-platform into it') is wrong for such a branch: write down that it is pushed from a checkout that has the hook, and correct the message.
9. Name the route for posting the approval-line suggestion in the new-migration skill: protect-github.sh refuses connector review tools, so the build posts it with the GitHub API as a pull-request comment. Make CLAUDE.md's 'never submit a review' and that route agree (a comment, never an approval or a request for changes).
10. When git rejects a non-fast-forward before the hook runs, the hook prints 'the push only deletes refs; nothing to check': fix the message.
11. Say in the runbook to merge this pull request into claude/build-platform before step 2b (the transfer), or every other open pull request's check goes red.
Then run: pnpm typecheck; pnpm lint (NODE_OPTIONS=--max-old-space-size=8192); pnpm lint:copy; the fixture-check, hook and pre-push tests with GITLEAKS set; tools/test with ACTIONLINT set; pnpm check:fixtures; gitleaks over origin/claude/build-platform..HEAD. Commit in the repository's style and push. Return the summary, the head, every check and the open items.`, { label: 'fix: fixture gap and runbook points', phase: 'Fix', schema: RESULT })
