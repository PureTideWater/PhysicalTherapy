# Skeptic 1 of 3: ci-tooling-security N3 (gate job's runtime never checked)

Clone /home/user/sk-p4-ci-tooling-security-N3-0 at 50029e64… (removed after).

## Reproduction
- mutation.yml: runtime.ts runs only in `changes` (:70-71). `stryker` is held to pins by its canary verdict, which gate.ts checks (runtimeProblems, :291). The `mutation` job (:181-204) runs checkout, pnpm/action-setup, setup-node and install, then gate.ts, and checks neither its own runtime nor its checkout's commit.
- manifests.ts classifyWorkflow (:473-509) judges pins step by step (job id plus index). It does not require a moved action to move in every job.
- Test: a local commit changing only the `mutation` job's setup-node SHA (:187). `tsx tools/stryker/affected.ts --event pull_request --base 50029e64…` gave money and ledger "affected by .github/workflows/mutation.yml step references only: runner proved on money-ledger", and shards: money-ledger. The money-ledger shard job still runs the old setup-node. Only the unchecked gate job runs the new pin, so it is not proved. That contradicts the header (:23-26) and the classifier's reason line.
- Log: scratchpad/p4/logs/sk-N3-0.log

## Verdict
Not refuted. Reproduced. Severity: should (not nit). The classifier says a change is proved when no checked job runs it. The required check's own Node and pnpm, and its checkout, are then unproved. Exploiting it needs a reviewed SHA edit to the gate job alone. Dependabot moves every job together, and that move is caught in `changes`.

## Refined fix
1. In the `mutation` job, after `pnpm install` and before download-artifact, add a step with `if: steps.needs.outputs.run == 'true'` that runs `pnpm -s exec tsx tools/stryker/runtime.ts`. Add `test "$(git rev-parse HEAD)" = "$GITHUB_SHA"`, or a --commit option on runtime.ts, so the gate's checkout is held to the tested commit.
2. Add a workflows test (CI-29): every mutation.yml job that runs tsx runs runtime.ts first. A test case: a gate-job-only pin move stays money-ledger only and is proved by that step.
3. Fix the header comment (:25) to say every job checks its own runtime.
