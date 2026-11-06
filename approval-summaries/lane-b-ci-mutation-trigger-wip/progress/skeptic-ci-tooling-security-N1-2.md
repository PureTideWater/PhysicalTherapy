# Skeptic 3 of 3: ci-tooling-security N1 (PR #96, head 50029e64...)

Status: done. Verdict: not refuted; severity nit.

## Reproduction
- Fresh clone /home/user/sk-p4-ci-tooling-security-N1-2 at 50029e64... (removed after).
- Twin root in scratchpad logs: package.json with no deps; the only core is a twin manifest + bin at
  <root>/node_modules/.pnpm/node_modules/@stryker-mutator/core (no <root>/node_modules/@stryker-mutator/core).
- strykerBin(root) with NODE_PATH=<root>/node_modules/.pnpm/node_modules (the entry the tsx shim exports):
  ACCEPTED, returns the hoisted bin.
- Same, NODE_PATH unset: REFUSED ("not installed in <root>/node_modules").
- So the doc comment "one ... NODE_PATH supplies is refused" is untrue for the shim's own NODE_PATH entry.

## Reachability
- Root package.json is the only declarer of @stryker-mutator/core; @stryker-mutator/vitest-runner peers on it
  (lockfile). Drop the root devDependency and pnpm's auto-install-peers installs core for the runner, hoisted to
  .pnpm/node_modules: the check then accepts it.
- Impact is low: the core is still lockfile-pinned (frozen install), so the same bytes run; a root
  devDependencies edit is a dependency-field change the classifier sends to a full run. No path to a
  money change skipping its mutation run. Claim accuracy only: nit.

## Refined fix
- Require the direct link: expect = path.join(modules, '@stryker-mutator', 'core', 'package.json');
  if (!existsSync(expect) || realpathSync(expect) !== manifestPath) refuse (pnpm links the root's direct
  dependency there; require.resolve returns the realpath under .pnpm/, which is why a containment test
  over node_modules is too loose). Or resolve the manifest from that path directly, without createRequire.
- Add a test: core only under <root>/node_modules/.pnpm/node_modules with that NODE_PATH is refused.
