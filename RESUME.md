ultracode. Resume the PaidWhole build from the handoff, with no gaps.

1. Run, in the background, until it prints OK (it takes several minutes):
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
2. Read /home/user/ops/HANDOFF.md, starting with "Start here: state at the switch (2026-10-21, after PR 5 and PR 6)". Then read CLAUDE.md and docs/product/reconciliation-001.md on claude/build-platform (head 8e33cb3).
3. Before any heavy run, ask me for my weekly usage % and the reset time. Pace to about 11% a day, start no new heavy run past about 80%, and never cut a run off mid-way.
4. Then start PR 6b (ZIP+4 localities, the screening's own consumer and its monthly cost for my approval first, the 60-second time check). Use the same pipeline:
   - design first, with one reviewer;
   - builders;
   - a draft PR;
   - two adversarial reviews, as default workflow agents;
   - a fix round with the full suite;
   - a fresh-clone verification that reads CI.
   Use one PR per change into claude/build-platform. Never write the approval line yourself: post it in a PR comment for me to commit.

Standing rule: recommend and build only the best option, never weighted by build effort, and never sacrifice quality.
