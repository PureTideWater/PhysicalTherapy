# Repository settings due when ci-deps merges (F1 (a), F2 (a), then F3)

The founder ruled all three (relayed by the co-founder, 2026-10-25 ~01:10 UTC; `designs/lane-b-ci.md` §3.2.5 step 12 and
§7). They are owner-admin settings, so a person with admin rights clicks them, never a session. The GitHub mobile app has
no repository settings: on a phone, open github.com in the browser and switch it to the desktop site (Safari: aA →
Request Desktop Website; Chrome: ⋮ → Desktop site).

**Only after ci-deps (PR #48) has merged**, in this order:

1. **F1 (a): the default branch.** Settings → General → Default branch → the ⇄ button → choose `claude/build-platform`
   → Update → "I understand, update the default branch". From then on Dependabot, scheduled workflows and the PR
   template read the build branch.
2. **F2 (a): Dependabot alerts and security updates.** Settings → Advanced Security (older name: Code security and
   analysis) → Dependabot alerts → Enable; then Dependabot security updates → Enable.
3. **F3: actions pinned to a full SHA.** Settings → Actions → General → Actions permissions → tick "Require actions to
   be pinned to a full-length commit SHA" → Save. ci-deps pins every action, `publish-content.yml` included (F4).

**After each, the orchestrator checks it** (read-only):
- F1: `gh api repos/PureTideWater/PhysicalTherapy --jq .default_branch` prints `claude/build-platform`.
- F2: `gh api repos/PureTideWater/PhysicalTherapy/vulnerability-alerts -i` answers 204, and
  `gh api repos/PureTideWater/PhysicalTherapy/automated-security-fixes --jq .enabled` prints `true`.
- F3: this session's proxy refuses `gh api .../actions/permissions` (403, 2026-10-26), so the person who ticks it
  confirms it, and the next workflow run that starts after it shows it holds (an unpinned action would fail to start).

Then the ci-deps session reads Dependabot's first runs after the switch (§3.2.5 step 12) and logs them.
