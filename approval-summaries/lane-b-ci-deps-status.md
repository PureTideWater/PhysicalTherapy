# Lane B: the CI series' remaining PRs (ci-deps, ci-browser, then P1, P2, P4): status

A parallel Lane B session, started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh) on the co-founder's direction
of 2026-10-25 ~23:40 UTC. Design: `designs/lane-b-ci.md` (ADR 0066, a part per PR). Every choice takes the recommended
option (the co-founder's ruling of 2026-10-26 ~00:20 UTC), recorded here and in the PR description.

Open questions: none.

## ci-deps (CI 2 of 4; `co-001/ci-deps`, worktree `/home/user/ci-deps`)

| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-26 00:30 | Started | setup-container printed OK; `gh api user` reads PureTideWater. `claude/build-platform` at 6ddd587; #42 still open (draft); Dependabot #40 and #33 open. |
| 2026-10-26 00:41 | Licence commit | 0e7776c, alone: `packageManager` pnpm 10.28.0 → 10.34.8; `pnpm install --lockfile-only --fix-lockfile` under 10.34.8 gives `git diff --numstat` **43 0** on `pnpm-lock.yaml`, 27 `libc: [glibc]` and 16 `libc: [musl]` (`grep -c '^ *libc: \['`: 0 at 6ddd587, 43 at 0e7776c); the musl exception leaves `allowlist.json`; `pnpm licenses:check` passes (185 production packages), and `pnpm licenses list --prod --json` lists no linuxmusl package. As the design measured at 49514e8. |
| 2026-10-26 00:45 | Gates commit | 6eae41a, alone: `minimumReleaseAge: 4320`, `minimumReleaseAgeExclude: []`, `trustPolicy: no-downgrade`, `trustPolicyExclude: [semver@6.3.1]` (F2 (b); CQ2 (a)). A frozen install under 10.34.8 still passes. |
| 2026-10-26 00:55 | Build | Workflow wf_5ed84ad8-764 (`workflow-scripts/lane-b-ci-deps-build-wf_5ed84ad8-764.js`): builders D1 (workflows, pins, release chain), D2 (toolchain, compose, images, capacity tools; no resolution) and D3 (documents, test matrix, synth) in worktrees `/home/user/ci-deps-d1..d3` from 6eae41a; then an integrator in `/home/user/ci-deps`, one push and the draft PR; then two adversarial reviews (CI and test infrastructure; security and supply chain) in fresh clones. Progress files in the session scratchpad; a monitor reports stalls. |

### The plan, and the choices it makes (each the recommended option)
- **Two phases, because of the release age.** Every commit that changes `pnpm-lock.yaml` or a resolution setting must
  come after 2026-10-26T19:18:50Z, when the locked Stryker 10.1.1 is three days old (§3.2.1, "Commit order"). Phase 1
  (now) builds everything that resolves nothing, opens the draft PR and runs the two reviews. Phase 2 (after 19:18:50Z)
  makes the bump commits (vitest and coverage 5.0.5, eslint 10.13.0 and typescript-eslint 8.72.0 into the catalog,
  postcss 8.5.31, next and the eslint plugin 16.4.3, the qs override, fast-uri by refresh, root's five catalog copies as
  `catalog:`), then the fix round with the full local suite, and one push.
- **The catalog clause of `no-duplicated-versions.test.ts` lands with the catalog moves** in phase 2, so the phase-1
  head's unit run is not red by construction.
- **login-action stays at its current pin until a commit after 2026-10-26T15:11Z** moves it to v4.7.0 (§3.2.1).
- **CI on the draft head is red in `static` until 2026-10-26T18:06:38Z, by design:** `check-toolchain` holds
  `packageManager`'s pnpm 10.34.8 to the three-day age (CQ3 (a)), and 10.34.8 was published 2026-10-23T18:06:37Z.
  No exclude is added for a version that ages out before the merge.

**Next step:** the build workflow's builders, then the draft PR.

## ci-browser (CI 3 of 4; `co-001/ci-browser`)

| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-26 01:00 | Re-read | Workflow wf_90aa53c6-376 (`workflow-scripts/lane-b-ci-browser-reread-wf_90aa53c6-376.js`), beside ci-deps' build (two heavy workflows at most): two scouts (files and code; versions, browsers and runners) against 6ddd587 plus ci-deps' §3.2, a reviser writing §3.3 current with V3, O6, O7 and the browser layout folded in, one adversarial reviewer, then the fold. The result replaces §3.3 in `designs/lane-b-ci.md`. |
| 2026-10-26 01:45 | Re-read done | §3.3 replaced in `designs/lane-b-ci.md` (§3.3.1-3.3.4 current at 6ddd587 plus ci-deps; §3.3.5 the re-read's changes with evidence; §3.3.6 the review's dispositions). Scouts: `designs/lane-b-ci/scout-ci-browser-{files,versions}.md`; review: `designs/lane-b-ci/ci-browser-reread-review.md` (1 blocking, 11 should-fix, 9 nits; all real, all fixed). Main changes: Playwright 1.64.1 and axe 4.14.0 still latest and pass the release age and trust policy (no exclude needed); actionlint 1.7.7 to 1.7.12 rejects `ubuntu-26.04`, so the actionlint test ignores that one label message (no config file); V3 is a throttled Ubuntu mirror (25.9 MB in 9:59), fixed by caching apt's `.deb` archives keyed on the runner image and `browsers.json`, saved on push runs only (apt re-verifies each against the signed index); the baseline step runs on every PR and push, not only on a diff (B1); `browser.json` records the headless shell's binary and tree hashes; image identities pass between release jobs as job outputs; O7 not needed (packets-rest at most 10:06); O6 waits for #42. **One correction made by this session:** the reviser ordered the cut after the UX checklist PR too; the orchestrator's brief (later than `lane-b.md:135`) cuts after ci-deps merges, with the UX review from `ux-brand-reviewer.md` if merged, otherwise the brief and `brand.md` (§3.3.6, S7, rewritten). |

## Proposals outside these PRs
- `tools/setup-container.sh` pins pnpm 10.28.0 (`:36-37, 72-74`). Once ci-deps merges, it should move to 10.34.8 with
  the registry's SHA-512 (`sha512-9ieo6XE0…FqA==`), so session containers match `packageManager` (design §5). This
  session may change that file only for the browser layout, so the orchestrator takes it.
