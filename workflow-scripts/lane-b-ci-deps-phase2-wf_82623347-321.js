export const meta = {
  name: 'lane-b-ci-deps-phase2',
  description: 'Lane B ci-deps phase 2 (lean): the bumps under the gates, one supply-chain delta review, its fixes, the full local suite once, one push',
  phases: [
    { title: 'Bump', detail: 'base merge if moved; the bump commits' },
    { title: 'Review', detail: 'one supply-chain delta review' },
    { title: 'Finish', detail: 'fixes, full local suite, one push, PR description' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/320d184a-020e-5534-ba47-a98ce8d4921f/scratchpad'
const OUT = SP + '/ci-deps'
const PNPM = SP + '/pnpm10348/bin'
const CTX = `
CONTEXT. PaidWhole (PureTideWater/PhysicalTherapy; CLAUDE.md in your context). Lane B's PR #48, co-001/ci-deps (CI 2 of 4; design /home/user/ops/designs/lane-b-ci.md section 3.2; ADR 0066 Part 2), worktree /home/user/ci-deps, head fb0af1d = origin. The handoff and history: /home/user/ops/approval-summaries/lane-b-ci-deps-status.md (read its top sections); the phase-2 plan: /home/user/ops/approval-summaries/lane-b-ci-deps-fix-round-1.md and ${OUT}/fix-summary.md. Every ruling is made (CQ1-CQ3 (a), F1, F2, F4); take the best option, for security the safer, without asking.
BUDGET: the account is near its weekly cap. Do exactly what your task says, nothing optional; no extra agents. If a step fails beyond a quick, clear fix, stop at a clean point (everything committed, nothing half-done), and say exactly what is next.
Environment: export PATH=${PNPM}:/opt/node24/bin:/opt/py312-ci/bin:$PATH (pnpm 10.34.8). PostgreSQL 18 at localhost:5433 (postgres:test; if it is down, start it as the setup script does: pg_ctl as postgres on /root/pgdata18). Heavy commands under flock /tmp/laneb-heavy.lock. No Docker daemon.
Commits in the repository's style ("area: what and why", full sentences), each ending with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TztFLKnDUJniegCFmkfMoc
Never force, never --no-verify, never approve, request changes or merge. No PHI; no model identifier.`
const SAVE = (f, w) => `Save as you go: keep ${OUT}/progress/${f} current (${w}); if it exists when you start, you were interrupted: read it, git status and git log, and continue.`

phase('Bump')
const bump = await agent(`${CTX}

Task: the bump commits. ${SAVE('p2-bump.md', 'each commit and check')}
0. git fetch origin claude/build-platform; if it moved past d725977, merge it in with a merge commit (rule 6; both sides kept; no "# Conflicts" trailer); if new workflows came in, bring them under ci-deps' rules as the previous merge did (${OUT}/base-merge.md); if the lockfile conflicts, take the base's side and let step 1's re-resolution produce the result.
1. Confirm the time is after 2026-10-26T19:18:50Z. Then, one coherent commit per group, each resolved under the gates (minimumReleaseAge 4320, trustPolicy no-downgrade) with pnpm 10.34.8 and no exclude: (a) vitest and @vitest/coverage-v8 5.0.5, with @vitest/coverage-v8 into the catalog; (b) eslint 10.13.0 and typescript-eslint 8.72.0 into the catalog, and root's and tools/'s literal copies of catalog entries as catalog:, with no-duplicated-versions.test.ts's catalog clause (every catalog package is catalog: in every manifest's dependencies and devDependencies); (c) postcss 8.5.31 in apps/web; (d) next and @next/eslint-plugin-next 16.4.3; (e) the qs override typed-rest-client>qs: 6.16.1 in pnpm-workspace.yaml with its tools/check-toolchain overrides.json entry (removeWhen: Stryker on typed-rest-client 3.1.1 or later, qs ^6.16.0) in the same commit; (f) fast-uri 3.1.9 by pnpm update -r fast-uri --lockfile-only, naming every other version that moves (rolldown 1.2.15, its platform bindings, @oxc-project/types) in the commit message. After each: pnpm install --frozen-lockfile passes; the libc rule (pnpm install --lockfile-only --fix-lockfile if it names an entry); semver@6.3.1 still resolved, or removed from trustPolicyExclude, trust-exceptions.json and the committed-lists test in the same commit if it left the lockfile.
2. Then: regenerate tools/screening-capacity/watched-paths.txt if its inputs changed; BASE=origin/claude/build-platform pnpm toolchain:check (live; pnpm 10.34.8 is past its three days, so it must pass whole: every added version's age, integrity and trust); pnpm audit --prod and --audit-level=high (nothing moderate or worse); pnpm licenses:check; pnpm typecheck; pnpm lint.
3. Write ${OUT}/p2-lockfile-summary.md: per commit, git diff --numstat of pnpm-lock.yaml and every package version the lockfile adds or removes, with why (acceptance 9); state that next keeps its own postcss 8.5.23 if it does.
Do not push. Return: head, commits, each check's result, the lockfile summary path, and anything open.`, { label: 'bump', phase: 'Bump' })

phase('Review')
const review = await agent(`${CTX}

You are the adversarial supply-chain reviewer of ci-deps' phase-2 bump commits only: the commits after fb0af1d on the local branch co-001/ci-deps in /home/user/ci-deps (read-only: no commits, no pushes, no posts). The builder's report: ${JSON.stringify(bump)}; the lockfile summary ${OUT}/p2-lockfile-summary.md.
Check, against the registry and the code: every version the lockfile adds is three days old, has integrity equal to the packument's, and keeps or improves its trust evidence (trusted publisher > provenance > none) against the version it replaces; nothing resolves from another host; the qs override's selector and scope are exactly right and closes GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g and GHSA-q8mj-m7cp-5q26; no unexplained version moved (compare every lockfile key added and removed with the summary); the catalog moves leave one line per tool and every manifest catalog:; next 16.4.3's and eslint 10.13.0's peers hold; pnpm audit and check-toolchain pass as the builder says (re-run toolchain:check live yourself). ${SAVE('p2-review.md', 'findings')}
Write ${OUT}/p2-review.md: findings B (blocking), S (should fix), N (nit), each with evidence and a fix. Return the findings as a short list.`, { label: 'review', phase: 'Review' })

phase('Finish')
const finish = await agent(`${CTX}

Task: finish phase 2 of co-001/ci-deps in /home/user/ci-deps. ${SAVE('p2-finish.md', 'each fix, the suite step by step, the push, the PR description')}
The builder's report: ${JSON.stringify(bump)}
The delta review (${OUT}/p2-review.md): ${JSON.stringify(review)}
1. Fix every blocking and should-fix finding that is a quick, clear fix (each with a test where it fixes a behaviour), and every plainly correct nit; for anything that is not, stop and report it (do not iterate).
2. The full local suite, once, each step under the lock, in order (lane-b.md's "One heavy command at a time"): pnpm typecheck; pnpm lint; pnpm test (unit, totals); pnpm test:golden; pnpm test:oracle; pnpm test:db in its four shards one after another (pnpm test:db -- --shard=k/4, DATABASE_URL=postgres://postgres:test@localhost:5433/postgres; totals); the web build, the stamp and e2e with E2E_PREBUILT=1 --workers=2 on its own database tp_laneb_cideps_e2e (dropped after); actionlint; pnpm synth --all clean; pnpm verify-content; BASE=origin/claude/build-platform pnpm actions:check and pnpm toolchain:check live; pnpm audit --audit-level=high; pnpm licenses:check; the mutation shards the change affects as tools/stryker's affected step names them, then the gate, OR, if the root manifest makes every package affected, state that CI runs them all and run only the money-ledger shard locally. A failure that is not a quick, clear fix: stop at a clean point and report.
3. Push once: git push origin co-001/ci-deps (hook, gitleaks; never force or --no-verify).
4. Update PR #48's description only with the GitHub MCP update_pull_request tool (ToolSearch "select:mcp__github__update_pull_request"): start from the current body (gh api repos/PureTideWater/PhysicalTherapy/pulls/48 --jq .body > ${OUT}/pr-body-p2.md), add phase 2 under What changes (the bumps, the override, the catalog moves, the lockfile summary of acceptance 9), the delta review's rows in the findings table, the suite's results in Checks, and the base merges; keep the closing attribution lines exactly; read it back and prove it byte-equal to your file.
Return: head, commits, every check with its result (with totals), the review's dispositions, anything open.`, { label: 'finish', phase: 'Finish' })
return { bump, review, finish }
