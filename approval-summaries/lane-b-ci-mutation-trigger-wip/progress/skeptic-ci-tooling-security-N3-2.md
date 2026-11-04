# Skeptic 3 of 3: ci-tooling-security N3 (the gate job's own runtime is never checked)

PR #96, head 50029e64…, fresh clone /home/user/sk-p4-ci-tooling-security-N3-2 (offline frozen install, removed after).

## Reproduction
- mutation.yml at the head: `pnpm -s exec tsx tools/stryker/runtime.ts` runs only in the `changes` job. The `mutation`
  (gate) job runs its own checkout, pnpm/action-setup, setup-node and install, then gate.ts, with no runtime step.
  gate.ts holds each shard to the pins through its canary verdict, never the job it runs in.
- manifests.ts pinnedSteps/classifyWorkflow keys each pin by job and step index, so a move confined to one job counts.
- Driver (temporary, deleted) calling affected() on the repository with mutation.yml before/after:
  - the gate job's setup-node SHA moved alone: packages [money, ledger] (money-ledger alone)
  - every setup-node SHA moved: [money, ledger]
  - the gate job's node-version changed: all four (correct, not pin-only)
- So a pin-only move of the gate job's setup steps is "proved" by money-ledger, whose shard job still runs the OLD
  pins: nothing proves the gate job's new pin. Finding is real and reachable.

## Impact
- Fails closed if the new action breaks the setup (install or tsx fails, required check red).
- A silently different Node in the gate job cannot plausibly change the verdict: gate.ts parses JSON, compares in
  integers and reads Unicode/ICU data only from the canary verdicts, never process.versions of its own.
- Not a money bypass: the shards still score what they scored. The defect is the workflow header's claim ("every job
  runs the one exact Node", "money-ledger's canary and the gate prove the new pins on the runner") going unenforced
  for the gate job. Severity: nit.

## Verdict
Not refuted. Severity nit. Refined fix: in the `mutation` job, after `pnpm install --frozen-lockfile` and before the
artifact download, add a step `name: The runtime is the pinned one`, `if: steps.needs.outputs.run == 'true'`,
`run: pnpm -s exec tsx tools/stryker/runtime.ts` (the `if:` is required: on run=false nothing is installed). Same
`run:` text as the changes job, so the run-line allowlist holds. Optionally cover in the CI-28 matrix row / header
comment that every job, the gate included, checks its own runtime.
