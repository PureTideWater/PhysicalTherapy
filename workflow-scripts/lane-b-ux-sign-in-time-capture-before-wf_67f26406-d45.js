export const meta = {
  name: 'lane-b-ux-sign-in-time-capture-before',
  description: 'Add design 6.3 tour states (clock option, sign-in states) on build-ops, take the before shots at bce57f16, then a skeptic checks the tour change and the sample',
  phases: [{ title: 'Capture' }, { title: 'Check' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4a9d4438-0635-51b1-98ea-4663abfca5c5/scratchpad'
const RULES = `Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. Every heavy step (setup.sh's install, build.sh/build-only.sh, reserve.sh/serve.sh, run.sh) only under flock /tmp/laneb-heavy.lock, run in the background with run_in_background and waited on by notification (the Bash tool refuses a long foreground sleep). Another workflow (the builders) shares the lock in /home/user/ux-sign-in-time: do not touch that worktree. Synthetic data only; PNGs and tiles never go on a branch. No model identifier in any file. Pushes to claude/build-ops: pull first (git -C /home/user/ops pull --no-rebase origin claude/build-ops), then GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops; never force, never --no-verify; if refused as non-fast-forward, pull and push again. Commit messages end with a blank line then:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKNxVRK8x6iV52PfxXz
Improve as you go: fix capture faults you find in the tour, and say so.`
const RESULT = { type: 'object', properties: { sample: { type: 'array', items: { type: 'string' } }, tourDir: { type: 'string' }, tilesIndex: { type: 'string' }, specCommit: { type: 'string' }, shots: { type: 'number' }, failed: { type: 'array', items: { type: 'string' } }, commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['sample', 'tourDir', 'tilesIndex', 'specCommit', 'shots', 'failed', 'commands', 'notes'] }
phase('Capture')
const cap = await agent(`You take the BEFORE screenshots for a Lane B pull request of the PaidWhole build: UX PR 6, co-001/ux-sign-in-time ("each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept"; design /home/user/ops/designs/lane-b-ux-sign-in-time.md: read sections 2.3-2.7 and 6 whole, and section 9). Its base is claude/build-platform bce57f16.
Save as you go: keep ${SP}/progress/sgn-capture-before.md up to date (spec edits, commits, each command and result). If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the files say otherwise, and continue from where it stopped.
${RULES}
The tool: /home/user/ops/tools/lane-b-screen-tour/README.md, sections "From another lane" and "Set-up and a run". Read them whole and follow them.
Steps:
1. Grow the tour exactly as design 6.3 (a) to (f) specifies, on claude/build-ops: tools/lane-b-screen-tour/capture/tour.spec.ts (the clock option on cap(), toStepPhase, emailKept, the new caps), designs/lane-b-ux-review/route-map.json and the README lines 6.3 names. Re-find each anchor by content (the line numbers were read earlier). The caps must work on both sides: at the base the new states are recorded as skipped with their reason (no timer, a 404, a persona not seeded), which is the before. Run the tour's own checks if any (tsc of the spec as the README or package.json says). Commit and push to claude/build-ops.
2. The before run: TOUR_DIR=${SP}/screens-before, TOUR_REF=bce57f16, TOUR_ONLY from design 6.2's generator (all 27 states x 1280, 1280-dark, 390). setup.sh, build, serve, run.sh, stop, check the lock and server ended together (README step 5), clean up (step 6). Then /usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> sign-in.
3. Return: the sample ids, the TOUR_DIR, the tiles index path, the build-ops commit of the spec change, the shot count, every skipped or failed shot with its reason, every command with its result, and notes (including anything the after capture at the head must do differently).`, { label: 'capture-before', phase: 'Capture', schema: RESULT })
phase('Check')
const check = await agent(`You are a skeptic checking the before-shots stage of UX PR 6 (co-001/ux-sign-in-time). Read only; edit nothing.
1. The tour change on claude/build-ops (git -C /home/user/ops log -3 -p -- tools/lane-b-screen-tour designs/lane-b-ux-review/route-map.json): does it match design 6.3 (a)-(f) in /home/user/ops/designs/lane-b-ux-sign-in-time.md? Will each new cap reach its state at the PR's head (the personas, the page clock install before navigation, the data-phase wait) and record a reasoned skip at the base, never a silent pass or a wrong screen?
2. The run: ${SP}/screens-before/shots.json (and skipped list): is every id of design 6.2's sample either shot or skipped with a reason that is the true before? Open a few PNGs (Read on the image) of the existing states to confirm they show the right screen, not an error page or a blank.
The capture agent reported: ${JSON.stringify(cap).slice(0, 5000)}
Return a list of real problems, each with evidence and the fix, or say none.`, { label: 'check-before', phase: 'Check' })
return { cap, check }
