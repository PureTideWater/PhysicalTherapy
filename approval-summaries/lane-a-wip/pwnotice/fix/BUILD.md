# Fix round: rules for every builder (password-changed-notice, worktree /home/user/pwnotice, branch head 68895f0f)

Read first: `/home/user/pwnotice/CLAUDE.md` (its rules bind), then
`<W6 scratchpad>/reviews/CONTEXT.md` for what
the change is and how the machine works (its "read-only" rule was for the reviewers: you DO edit the worktree, inside
your own files only), then `…/scratchpad/reviews/RULINGS.md`: it decides what is built and by whom. The findings it
cites are in `…/scratchpad/reviews/{sec,db,ux}/findings.md`, with each reviewer's scripts and outputs beside them
(reuse them for your tests and proofs).

Rules:
- Edit only the files your task names as yours. Another builder is editing the others at the same moment: do not
  touch, format or "fix" them, and expect a typecheck of the whole repository to fail for a while on their half-done
  work (judge your own files).
- Never run a git command that changes anything: no add, commit, stash, checkout, restore, reset, push. Leave your
  work as plain changes in the working tree. `git diff` and `git status` are fine.
- Never edit `docs/product/domain-model.md` or anything under `packages/db/functions` (generated; regenerated once at
  the end by the session that started you). Never write an approval line. Never touch `.gitleaksignore` or anything
  under `.claude/`. No formatter over a whole file: follow the house style of the file you are in, line by line.
- A code change comes with a test that fails before it and passes after it. Keep the proof: the command, and the
  failing and passing counts. Write a scratch copy of a test to prove a red run only in your scratch directory or
  under a name you delete before you finish.
- Comments and docblocks say what the code does now: when you change a behaviour, change the sentences that describe
  it, in the same file.
- Logs carry IDs and codes only (`pnpm -s lint:logs` must pass): no address, no name, no message text.
- No real PHI; synthetic values only. Never write a model's name in any file.
- `export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH`; every test run, build or migration under
  `flock /tmp/laneb-heavy.lock <command>`, its output to a file in your scratch directory.
- Before you finish: `pnpm -s exec eslint <your changed files>` clean, your own tests green, no scratch file left in
  the worktree, no database of yours left (name them `tp_fix_<your id>_<n>`).
- Do the work yourself: start no agent and no workflow.

Your final message (text only, no report file): for each item of your list, the files changed, the red proof and the
green proof in one line each; then anything you did not do and why; then anything you found that the rulings did not
foresee (do not fix it outside your files: say it).
