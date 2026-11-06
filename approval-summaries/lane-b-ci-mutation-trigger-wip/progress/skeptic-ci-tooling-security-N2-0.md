# Skeptic 1 of 3, ci-tooling-security N2 (PR #96, head 50029e64...)

Status: done. Clone /home/user/sk-p4-ci-tooling-security-N2-0 made at 50029e64..., read, removed.

## Reproduction (pnpm 10.34.8, Node 24, throwaway dir under scratchpad/p4/logs, removed)
- No .npmrc: `pnpm -s exec node -e 'console.log(process.env.npm_config_user_agent)'` -> `pnpm/10.34.8 npm/? node/v24.22.0 linux x64`.
- `.npmrc` with `user-agent=pnpm/9.0.0 npm/? spoof` -> the exec'd process sees `pnpm/9.0.0 npm/? spoof`. Same with
  `manage-package-manager-versions=false`, and an inherited `npm_config_user_agent` env var also wins.
- So tools/stryker/runtime.ts:46-48 / :105-107 (pnpmOfUserAgent(env.npm_config_user_agent)) reports whatever a
  pnpm setting says, not the pnpm that ran. Claim real.

## Reachability / impact
- `.npmrc` is a global input (affected.ts:147; affected.test.ts:779): any change to it runs all four shards, so the
  spoof can never narrow the trigger. pnpm-workspace.yaml keys other than release-age/trust are global too.
- The pnpm that runs is the one pnpm/action-setup installs from packageManager, which is also the pin source, so a
  PR moving the real pnpm moves the pin with it. The leg is a weak cross-check, not a gate on money coverage.
- Severity: nit (agree).

## Fix refinement
- The suggested `npm_execpath` source does not work: `pnpm exec` does not set npm_execpath (printed `undefined`;
  only an inherited value appears), so it is both absent and env-spoofable.
- Safest: have runtime.ts obtain the version from the pnpm binary itself, e.g. a workflow step
  `echo "PNPM_ACTUAL=$(pnpm --version)"` is still config-free (`--version` ignores user-agent) and pass it in, or
  execFileSync('pnpm', ['--version']) inside runtime.ts, then compare to packageManager; keep the user agent only
  as a second leg that must agree. At minimum, state the limit in ADR 0066 Part 7 (the leg reads a settable user
  agent; .npmrc is global so it cannot narrow a run).

Verdict: refuted=false, severity nit.
