# Co-founder start: joining the PaidWhole build as Lane B

You run the build from your own Claude Max 20x account, beside the founder's sessions (Lane A). Your sessions are **Lane B**. This page is the whole set-up. Your sessions read everything else themselves.

## One-time set-up (people, not Claude; about 15 minutes)
1. **Your Claude plan.** Use your own Max 20x plan, bought on the web at claude.ai ($200 a month; the app stores charge more). Never sign in to the founder's account, and never let anyone sign in to yours.
2. **GitHub.**
   - The founder adds your GitHub account as a collaborator with write access on `PureTideWater/PhysicalTherapy` (the repository's Settings, then Collaborators). Accept the email invitation.
   - In claude.ai, connect your GitHub account at https://claude.ai/connect-github. The Claude GitHub App is already installed on the repository.
3. **A cloud environment.** In Claude Code on the web, create an environment for this repository. Give it network access wide enough for the setup script, which downloads from:
   - github.com and GitHub's release downloads;
   - registry.npmjs.org;
   - pypi.org and files.pythonhosted.org;
   - the Ubuntu package archive.

   The founder's environment uses full network access. With limited access, allow those hosts and leave "Allow package managers" ticked (https://code.claude.com/docs/en/cloud-environments#network-access).
4. **Usage.** Your account has its own weekly allowance. Your session asks you for your usage % and the reset time before each heavy run, and stops starting heavy runs past about 80%. Extra usage (usage credits) is optional and your choice.
5. **Session settings, every session:**
   - Select only `PureTideWater/PhysicalTherapy`. A session with one repository reads its `.claude/settings.json` (the build's hooks and permissions).
   - Pick **Auto** in the mode menu next to the prompt box, so long runs don't stop for every command.
   - Pick the most capable model in the picker, the same one the founder's sessions use, at the highest effort offered (the founder's run at extra-high).
   - Keep the word `ultracode` in the first message.
6. **Nothing else to hand over.**
   - **Secrets:** no keys, tokens or environment variables. The build uses no secrets of its own, and nothing is deployed to AWS yet.
   - **Logins:** no copy of the founder's.
   - **Memory or chat history:** everything a session needs is on this branch and in the repository.
   - **The build tracker** is the founder's dashboard. They can share a view of it with you from claude.ai if you want to watch progress; your sessions don't need it.
7. **Who decides.** Product, cost, wording, legal and approval decisions are the founder's (Tyler Williams), unless the founder delegates one to you in `LANES.md`. Your session will ask you its questions. Answer what is delegated, and take the rest to the founder.

## Every session: paste this as the first message
Start a new session on `PureTideWater/PhysicalTherapy` in that environment, and paste this unchanged:

```
ultracode. Join the PaidWhole build as Lane B, from the handoff, with no gaps.

1. Run, in the background, until it prints OK (it takes several minutes):
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
   Pass each open Lane B branch named in the claims of LANES.md as an argument, written branch:/home/user/<worktree>, if there are any.
   If /home/user/PhysicalTherapy does not exist, clone the ops branch instead (git clone -q --depth 1 -b claude/build-ops https://github.com/PureTideWater/PhysicalTherapy /tmp/ops-boot) and run bash /tmp/ops-boot/tools/setup-container.sh the same way.
2. Read, in order: /home/user/ops/LANES.md (the two-lane rules, the queues and the claims); /home/user/ops/lanes/lane-b.md (Lane B's log: its "Start here (Lane B)" section first, which gives the state, the next actions in order, what waits on whom, and the pitfalls); /home/user/ops/HANDOFF.md from "Start here" up to "Owner decisions and rulings" (Lane A's state, how the build is run, the founder's standing rules), and "Owner decisions and rulings" itself; then CLAUDE.md and docs/product/reconciliation-001.md on claude/build-platform.
3. Before any heavy run, ask me for my weekly usage % and the reset time. Pace to about 11% a day, start no new heavy run past about 80%, and never cut a run off mid-way.
4. Continue Lane B's in-flight item, or take the next action, from lanes/lane-b.md's "Start here (Lane B)". If it names none, claim the first unclaimed item of Lane B's queue in LANES.md (pull, add the claim with its reserved ADR and test-matrix numbers, push) and start it, with the same pipeline as Lane A:
   - design first, with one reviewer;
   - builders;
   - a draft PR;
   - two adversarial reviews, as default workflow agents;
   - a fix round with the full suite;
   - a fresh-clone verification that reads CI.
   One PR per change into claude/build-platform. Lane B never opens a PR with a migration: if a design needs one, stop and hand it to Lane A in LANES.md.
5. For a decision that is the founder's, ask me. I answer what the founder delegated in LANES.md and take the rest to the founder. Record each ruling with who made it and when.

Standing rule: recommend and build only the best option, never weighted by build effort, and never sacrifice quality.
```

## What your session does
- Rebuilds its machine with the setup script: the repository, PostgreSQL 18 and 16, Node 24, the Python venvs, gitleaks, actionlint and the pre-push hook.
- Reads the rules and both lanes' state, then asks you for your usage.
- Builds Lane B's next pull request through every quality stage, merging on green CI once the PR is verified.
- Logs each step in `lanes/lane-b.md` on the `claude/build-ops` branch, so the next session, or the founder's, picks up exactly there.

## If a session ends or the machine restarts
Start a new session with the same message. It resumes from `lanes/lane-b.md` and the claims in `LANES.md`. A workflow cannot be resumed from another session, so a stage cut off mid-run starts again; the log says which stage.
