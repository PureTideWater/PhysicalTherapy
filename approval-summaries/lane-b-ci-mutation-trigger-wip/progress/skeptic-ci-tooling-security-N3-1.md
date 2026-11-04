# Skeptic 2 of 3: ci-tooling-security N3 (the gate job's own runtime is never checked)

PR #96 at 50029e64…, fresh clone /home/user/sk-p4-ci-tooling-security-N3-1 (removed after).

## Reproduction
- True as read: mutation.yml runs tools/stryker/runtime.ts only in the changes job; the gate job installs and runs
  gate.ts with no runtime step; gate.ts checks shards' canary verdicts, not its own process.
- The finding's scenario (a pin-only move of the gate job's setup steps) cannot reach a merge on its own:
  tools/check-action-pins/workflows.ts consistencyProblems (rule (b), held by tools/test/workflows.test.ts:2233,
  `pnpm test` in ci.yml, under `all green`) holds every action repository to one commit across every workflow.
  Moving actions/setup-node to another SHA in the gate job only gives:
  `mutation.yml:187: actions/setup-node is pinned to 1111…, but to 949feb24… at approval-of-record.yml:32; one commit per action`
  (script and log in the scratchpad logs dir, n3-rule-b.*). So any legal move moves the same SHA in the changes job
  (checked by runtime.ts) and in the money-ledger shard (held by its canary verdict and the gate).
- The other way the gate's Node could differ, a `node` bin linked by a dependency (design §15 B1), comes from the
  lockfile at the same commit, so the changes job's runtime step fails first, and the gate fails on CHANGES != success.
- A node-version input change in the gate job is not pin-only: classified global, every shard runs.
- gate.ts's verdict is report arithmetic and string comparison; it holds no Unicode-bound equivalents of its own.

## Verdict
Refuted (not reachable as stated). Severity none. An optional runtime step in the gate job would be cheap defence
in depth, but no current path needs it.
