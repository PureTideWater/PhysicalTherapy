# Skeptic 2 of 3: ci-tooling-security N2 (pnpm leg from a settable user agent), PR #96 at 50029e64...

Status: done. Verdict: not refuted, real; severity nit.

## Reproduction (pnpm 10.34.8, Node v24.22.0; throwaway projects in the scratchpad logs dir)
- Default: `pnpm -s exec node -e 'console.log(process.env.npm_config_user_agent)'` prints `pnpm/10.34.8 npm/? node/v24.22.0 linux x64`.
- `.npmrc` with `user-agent=pnpm/9.9.9 ...` prints `pnpm/9.9.9 ...`: spoofed.
- `pnpm-workspace.yaml` with `userAgent: pnpm/8.8.8 x` prints `pnpm/8.8.8 x`: spoofed.
- Env `npm_config_user_agent`, `NPM_CONFIG_USER_AGENT`, `pnpm_config_user_agent` set by the caller: overridden, no spoof.
- `npm_execpath` is undefined under `pnpm exec` in pnpm 10, so the finding's first fix (read npm_execpath's package.json) does not work for the step as written.

## Reachability
- tools/stryker/runtime.ts:46-48 and :105-107 read only env.npm_config_user_agent. Confirmed.
- `.npmrc` is in affected.ts's all-four list (line 147); `userAgent` is not in WORKSPACE_INERT_KEYS (manifests.ts:53), so it is global. A spoofing change always runs every shard: it cannot narrow or skip the mutation run, the central risk.
- With pnpm 10's default package-manager switching, the running pnpm follows packageManager anyway; a real divergence needs a second global, reviewed change (managePackageManagerVersions false plus a different action-setup pin). The leg proves little beyond packageManager itself.
- ADR 0066 Part 7 says the pnpm is "from the user agent pnpm sets for the step" but does not state that a setting can set that agent.

## Refined fix
Note the limit in ADR 0066 Part 7 (and runtime.ts's header): the pnpm leg reads the user agent, which `.npmrc` `user-agent` or the workspace `userAgent` can set; both are global, so such a change runs every shard and is in the founder's review. Do not adopt the npm_execpath fix (unset under pnpm exec).
