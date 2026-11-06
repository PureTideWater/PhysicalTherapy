# Skeptic 3 of 3: ci-tooling-security N2 (pnpm leg from a settable user agent)

Clone: /home/user/sk-p4-ci-tooling-security-N2-2 at 50029e64... (removed after).

## Reproduction (pnpm 10.34.8, Node v24.22.0, throwaway project in scratchpad logs/n2-2)
- Default `pnpm -s exec node -e ...` prints user agent `pnpm/10.34.8 npm/? node/v24.22.0 linux x64`; npm_execpath is `undefined`.
- `.npmrc` `user-agent=pnpm/10.34.8 forged` prints `pnpm/10.34.8 forged`: the leg's value is set by a setting.
- runtime.ts:46-48 and :105-107 read only env.npm_config_user_agent. Confirmed.

## Reachability
- `.npmrc` is in affected.ts's all-shards list (line 147); `userAgent` is not in WORKSPACE_INERT_KEYS (manifests.ts:53), so either
  spoof is a global change: every shard runs. It cannot narrow or skip the mutation run (the central risk).
- pnpm 10 switches to packageManager's version by default, and action-setup installs from packageManager, the pin source itself:
  the leg is a weak cross-check, not a gate.

## Fix refinement
- npm_execpath fix does not work (unset under `pnpm exec`).
- Safest: also take `pnpm --version` (execFileSync, no shell) in runtime.ts and require it and the user agent to agree with the pin;
  at minimum state the limit in ADR 0066 Part 7 and runtime.ts's header.

Verdict: refuted=false, severity nit.
