ultracode. Resume the PaidWhole build as Lane A from the handoff, with no gaps.

1. Run, in the background, until it prints OK (it takes several minutes):
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/pr-06b-mail-streams:/home/user/pr6b4
   Pass every other open Lane A branch named in the claims of LANES.md the same way.
2. Read, in order: /home/user/ops/LANES.md (the two-lane rules, the queues and the claims); /home/user/ops/HANDOFF.md from "Start here", and the dated entries at its end; /home/user/ops/lanes/lane-b.md (Lane B's state, to fold into the tracker); then CLAUDE.md and docs/product/reconciliation-001.md on claude/build-platform.
3. Before any heavy run, ask me for my weekly usage % and the reset time. Pace to about 11% a day, start no new heavy run past about 80%, and never cut a run off mid-way.
4. Continue Lane A where HANDOFF says: today, PR 6b-4's fix round on #42 (approval-summaries/pr6b4-review-findings.md), then the next items of Lane A's queue in LANES.md, claiming each first. Use the same pipeline:
   - design first, with one reviewer;
   - builders;
   - a draft PR;
   - two adversarial reviews, as default workflow agents;
   - a fix round with the full suite;
   - a fresh-clone verification that reads CI.
   Use one PR per change into claude/build-platform. Never write the approval line yourself: post it in a PR comment for me to commit.

Standing rule: recommend and build only the best option, never weighted by build effort, and never sacrifice quality.
