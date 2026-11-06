# Skeptic 2 of 3: ci-tooling-security N1 (PR #96, head 50029e64…)

Status: done. Verdict: not refuted; severity nit.

## Reproduction
- Fresh clone /home/user/sk-p4-ci-tooling-security-N1-1 at 50029e64… (removed after).
- Synthetic layout in scratchpad p4/logs/n1-1: root with no direct node_modules/@stryker-mutator/core, a fake core
  only at root/node_modules/.pnpm/node_modules/@stryker-mutator/core; a second fake core in a parent dir.
- strykerBin(root) from the clone's tools/stryker/stryker.ts, run under tsx:
  - no NODE_PATH: REFUSED (correct)
  - NODE_PATH=<root>/node_modules/.pnpm/node_modules (what the tsx shim exports): ACCEPTED the hoisted copy
  - NODE_PATH=<parent>/node_modules: REFUSED (the only case the tests cover)
- Real install: the direct core resolves (realpath) into node_modules/.pnpm/<core@10.1.1…>/..., so the check can only
  ever test "under <root>/node_modules", not "the root's direct dependency".

## Why only a nit
- Reachable only when the root's own @stryker-mutator/core is dropped while another package still pulls core into the
  hidden hoist dir (e.g. vitest-runner's peer). That is a root package.json change, which the classifier treats fail
  closed, and the copy still comes from the frozen lockfile. Stryker still runs; no shard is skipped, so the money
  gate is not bypassed. The defect is that the doc comment ("one NODE_PATH supplies is refused") overclaims.

## Refined fix
Require the root's direct link: `direct = path.join(modules, '@stryker-mutator/core/package.json')`; refuse unless
`existsSync(direct) && realpathSync(direct) === manifestPath`. Add a test with a core only under
node_modules/.pnpm/node_modules and NODE_PATH pointing there. (Or, minimally, reword the comment.)
