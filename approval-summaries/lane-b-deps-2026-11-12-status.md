# Dependabot replacement PR, 2026-11-12 (W26, acting Lane B)

Session: session_019i9ifCYJnbESeoV7M8kwdU. Branch `co-001/deps-2026-11-12` from `claude/build-platform` fd14d89f.
Takes as the build's own: #123 (aws-sdk, 10), #124 (aws-cdk 2.1146.1 to 2.1148.0), #135 (pnpm/action-setup 6.1.0 to
6.1.1), #139 (minor-and-patch, 14). Procedure of record: docs/runbooks/dependency-upgrades.md.

## Plan (written before any change)
1. Cut the branch; apply the four PRs' manifest and workflow changes (their non-lockfile diffs, as patches).
2. Regenerate the lockfile with pnpm (`pnpm install --lockfile-only`, the workspace's release age and trust policy on);
   never a hand edit. Compare each direct dependency's locked version with the bot's lockfiles by script.
3. `pnpm install --frozen-lockfile`; `pnpm actions:check`; `pnpm toolchain:check` (BASE=origin/claude/build-platform).
4. `pnpm lint`, `typecheck`, `test`; then the full local suite once (test:db, test:golden, test:e2e, verify-content,
   lint:logs, licenses:check). Output to files; read counts and failures.
5. Changelogs: one line per non-patch bump, and per package touching the gateway, auth, crypto, the database driver or
   the EDI parser whatever its size (one subagent reads release notes; report file).
6. The runbook's AWS items: `pnpm cdk:diff` for the CDK CLI bump; the SDK socket and bundle comparison if a harness
   exists in the repository (else recorded as owed, with why).
7. One adversarial review, scope "supply chain and CI of this diff"; verify each finding; at most two fix rounds.
8. Draft PR from the template; subscribe; CI green; base merged right before the last push; merge.
9. Verify with git ls-remote; close #123, #124, #135, #139 with one comment each; final state here; tell the orchestrator.
10. A bump that breaks beyond a quick, obvious fix is held back, recorded here, and the rest ships.

## Log (UTC)
- 2026-11-12 01:40 machine OK (setup log ends OK; hook and gitleaks present). Read CLAUDE.md, STATE.md, the runbook.
- The four PRs' non-lockfile diffs read; each holds only its group's members (10, 1, 1 action on 17 steps, 14).

## RESUME-BLOCK
State: plan written, nothing changed yet. Next: step 1.
