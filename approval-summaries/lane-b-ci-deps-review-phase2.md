# ci-deps phase-2 supply-chain delta review (fb0af1d..a2f24e60)

Reviewed read-only on co-001/ci-deps in /home/user/ci-deps, HEAD a2f24e60 with a clean tree. Base origin/claude/build-platform is d7259775. The working files are in scratchpad/ci-deps/rvp2/ (pairs.txt, registry-check.txt, check.py, packuments in pk/).

## Verdict
No blocking or should-fix findings. Four nits, none of which touches the lockfile.

## What was verified (evidence)
- **Lockfile keys.** Every `packages:`/`snapshots:` key that was added or removed between fb0af1d and HEAD forms 47 name pairs, which match the summary's per-commit lists one for one. No name enters or leaves the graph. Four more snapshot keys changed only in their peer suffix (eslint or vitest): @eslint-community/eslint-utils 4.9.1 and 4.10.1, @eslint/js 10.0.1, eslint-plugin-react-hooks 7.1.1 and @stryker-mutator/vitest-runner 10.1.1.
- **Non-key lines.** After normalising the moved versions, the only lockfile lines that differ are these:
  - three catalog entries (@vitest/coverage-v8, eslint, typescript-eslint);
  - ten `specifier: 'catalog:'` lines;
  - the `overrides:` map;
  - one new edge, qs 6.16.1 -> es-define-property 1.0.1, a package that was already resolved.
- **Registry check** (rvp2/registry-check.txt). All 47 added versions pass:
  - Age: each is at least 72 h old. The youngest are next and @next/* 16.4.3, published 2026-10-23T13:28-13:40Z, about 78 h ago.
  - Integrity: the lockfile's integrity equals the packument's dist.integrity.
  - Trust: no version lost trust evidence. 44 are trusted-publisher to trusted-publisher, with the same oidcConfigId and repository. eslint 10.13.0 and qs 6.16.1 are none to none. fast-uri improves from none to trusted publisher.
  - Package contents: there are no new install scripts, and qs's es-define-property is its only new dependency.
- **Hosts.** No lockfile line names a tarball, git, file or link source. The live toolchain:check reports "all 614 entries resolve from https://registry.npmjs.org/ by sha512 integrity".
- **qs override.** It is correct:
  - qs@6.16.1 is the only qs in the graph, and typed-rest-client@2.3.1, reached through Stryker core's `~2.3.0`, is its only dependent.
  - The npm bulk advisory endpoint gives these ranges, and 6.16.1 is outside all three: GHSA-x5fp-wj9c-mxmx `>=6.14.2 <=6.15.3`, GHSA-4mjr-xmp4-gh2g `<6.16.0`, GHSA-q8mj-m7cp-5q26 `>=6.11.1 <=6.15.1`.
  - The registry confirms the claims behind leaving the parent unscoped and the removal trigger: typed-rest-client 3.0.0 pins qs 6.15.1, 3.1.0 pins 6.15.3, and 3.1.1 declares ^6.16.0.
  - 6.16.1 is qs's latest version.
  - overrides.json has the matching entry, and the workspace map, the lockfile map and the entry are equal.
- **fast-uri.** 3.1.9 closes all four advisories, whose ranges all end below 3.1.9. ajv 8.20.0 declares `^3.0.1`.
- **Moves that came with the fast-uri refresh.** Each stays inside its parent's range: rolldown 1.2.15 inside vite 8.3.4's `~1.2.12`, and @oxc-project/types 0.155.0 inside rolldown 1.2.15's `=0.155.0`.
- **Catalog.**
  - The catalog has 17 names and none is duplicated.
  - Every workspace manifest's dependencies and devDependencies name each catalog package as `catalog:`. The only literal is packages/ui's `peerDependencies` react and react-dom, which is intended and outside the rule.
- **Peers.** They hold for next and eslint:
  - next 16.4.3: react and react-dom 19.3.1, @playwright/test 1.56.1 (needs ^1.51.1) and @opentelemetry/api 1.9.1, with engines node >=20.9.0.
  - eslint 10.13.0: it has only an optional jiti peer, and its engines field includes >=24.
  - typescript-eslint 8.72.0 and its plugin and parser need `typescript >=4.8.4 <6.1.0`, and the resolved 6.0.3 is in range. They also need eslint ^10, which holds.
  - next keeps its own exact postcss 8.5.23, separate from apps/web's 8.5.31.
- **Re-run here** (logs in progress/p2-review-*.log):
  - `BASE=origin/claude/build-platform pnpm toolchain:check`, live: passed with 0 errors and 0 warnings, covering 47 added versions for age, integrity and trust, plus the overrides check.
  - `pnpm audit` and `pnpm audit --prod`: no known vulnerabilities.
  - `vitest run check-toolchain/check.test.ts test/no-duplicated-versions.test.ts`: 2 files, 35 of 35 tests passed.

## Findings

### B (blocking)
None.

### S (should fix)
None.

### N (nit)
- **N1: check.test.ts's real-tree case is tied to today's overrides.** It asserts that the real workspace's overrides equal `{typed-rest-client>qs: 6.16.1}` and that the entries list equals `['typed-rest-client>qs']`. This affects tools/check-toolchain/check.test.ts:565-570.
  - Problem: when the override is removed under its trigger, or a second one is added, this guard test fails for a reason that has nothing to do with the defect it exists to catch.
  - The logic itself is sound: dropping the entry makes the overrides rule refuse.
  - Fix: derive the expectation from the real tree. For each selector in the parsed workspace `overrides`, expect the "does not" message once the entries are emptied. Keep one synthetic case (add a `typed-rest-client>qs` override to a tree with none, with the entry missing) so the test still has teeth when the real tree has no overrides.
- **N2: ADR 0066 miscounts the root manifest's literal copies.** The "npm versions taken" paragraph says "root's five literal copies (`@types/node`, fast-check, tsx, typescript, vitest)". The diff shows the root manifest had eight literal copies of catalog packages: @types/node, @vitest/coverage-v8, eslint, fast-check, tsx, typescript, typescript-eslint and vitest. Commit (a) moved two of them and commit (b) moved six. Fix: name all eight, or say "every literal copy".
- **N3: the same ADR table leaves out the moves that came with the refresh.** It omits rolldown 1.2.14 -> 1.2.15 (2026-10-21), its 15 @rolldown/binding-* packages and @oxc-project/types 0.154.0 -> 0.155.0 (2026-10-19). Commit a2f24e60's message and the lockfile summary both list them. Fix: add one row, "rolldown, its bindings and @oxc-project/types, with the fast-uri refresh", or a sentence.
- **N4: three small inaccuracies in the reporting, none in the code.**
  - Commit 645263cc's message and the summary say "qs 6.15.1 to 6.16.1 and nothing else". The qs 6.16.1 snapshot also gains the edge es-define-property 1.0.1, a package already in the graph, by the same maintainer and with no install script, so "+4 beyond the qs entries" is really +3 for the map plus 1 for the edge.
  - The builder's "40 of 40" for check.test.ts is the whole check-toolchain directory (4 files). check.test.ts with no-duplicated-versions.test.ts is 35 of 35.
  - Fix: one line in the PR description, so the summary is exact. No history rewrite is needed.
