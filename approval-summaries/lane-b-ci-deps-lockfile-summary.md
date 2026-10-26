# co-001/ci-deps phase 2: lockfile changes per bump commit (acceptance 9)

Branch co-001/ci-deps, from fb0af1d (= origin; base claude/build-platform at d725977, unmoved, no merge). Every commit
resolved with pnpm 10.34.8 under the gates (minimumReleaseAge 4320, trustPolicy no-downgrade), no exclude added. After
each: `pnpm install --frozen-lockfile` exit 0, `pnpm licenses:check` exit 0 (the libc rule named no entry, so no
`--fix-lockfile`), semver@6.3.1 still resolved (trustPolicyExclude and trust-exceptions.json unchanged).
`BASE=origin/claude/build-platform pnpm toolchain:check` (live) on the last commit: 47 added versions, each three days
old, with the registry's integrity and no weaker trust evidence; passed with 0 errors, 0 warnings.

Removed and added are the lockfile's `packages:` keys (name@version); the numstat is `git diff --numstat <c>~1 <c> -- pnpm-lock.yaml`.

## a893c0e3

numstat: `55 52 pnpm-lock.yaml`

Why: vitest and @vitest/coverage-v8 5.0.5 (catalog; @vitest/coverage-v8 joins it). @vitest/mocker and @vitest/spy are vitest 5.0.5's exact-version dependencies.

```
removed:
  - @vitest/coverage-v8@5.0.4
  - @vitest/mocker@5.0.4
  - @vitest/spy@5.0.4
  - vitest@5.0.4
added:
  + @vitest/coverage-v8@5.0.5
  + @vitest/mocker@5.0.5
  + @vitest/spy@5.0.5
  + vitest@5.0.5
```

## f3e5dc49

numstat: `103 97 pnpm-lock.yaml`

Why: eslint 10.13.0 and typescript-eslint 8.72.0 (catalog). The ten @typescript-eslint packages are typescript-eslint 8.72.0's exact-version dependencies. Root's and tools/' literal copies becoming `catalog:` move nothing (each copy already equalled its catalog entry).

```
removed:
  - @typescript-eslint/eslint-plugin@8.71.2
  - @typescript-eslint/parser@8.71.2
  - @typescript-eslint/project-service@8.71.2
  - @typescript-eslint/scope-manager@8.71.2
  - @typescript-eslint/tsconfig-utils@8.71.2
  - @typescript-eslint/type-utils@8.71.2
  - @typescript-eslint/types@8.71.2
  - @typescript-eslint/typescript-estree@8.71.2
  - @typescript-eslint/utils@8.71.2
  - @typescript-eslint/visitor-keys@8.71.2
  - eslint@10.12.0
  - typescript-eslint@8.71.2
added:
  + @typescript-eslint/eslint-plugin@8.72.0
  + @typescript-eslint/parser@8.72.0
  + @typescript-eslint/project-service@8.72.0
  + @typescript-eslint/scope-manager@8.72.0
  + @typescript-eslint/tsconfig-utils@8.72.0
  + @typescript-eslint/type-utils@8.72.0
  + @typescript-eslint/types@8.72.0
  + @typescript-eslint/typescript-estree@8.72.0
  + @typescript-eslint/utils@8.72.0
  + @typescript-eslint/visitor-keys@8.72.0
  + eslint@10.13.0
  + typescript-eslint@8.72.0
```

## ee693d14

numstat: `7 7 pnpm-lock.yaml`

Why: apps/web's postcss ^8.5.31. next keeps its own postcss 8.5.23 (next 16.4.1 here, and still 16.4.3 after the next commit), which next 16.4.3 declares exactly (`8.5.23`, registry); apps/web's range does not reach it.

```
removed:
  - postcss@8.5.30
added:
  + postcss@8.5.31
```

## f0110142

numstat: `46 46 pnpm-lock.yaml`

Why: next and @next/eslint-plugin-next 16.4.3. @next/env and the eight @next/swc bindings are next's exact-version dependencies (optional, each with its cpu, os and libc fields). next 16.4.3 keeps its own postcss 8.5.23 (no change to that entry).

```
removed:
  - @next/env@16.4.1
  - @next/eslint-plugin-next@16.4.1
  - @next/swc-darwin-arm64@16.4.1
  - @next/swc-darwin-x64@16.4.1
  - @next/swc-linux-arm64-gnu@16.4.1
  - @next/swc-linux-arm64-musl@16.4.1
  - @next/swc-linux-x64-gnu@16.4.1
  - @next/swc-linux-x64-musl@16.4.1
  - @next/swc-win32-arm64-msvc@16.4.1
  - @next/swc-win32-x64-msvc@16.4.1
  - next@16.4.1
added:
  + @next/env@16.4.3
  + @next/eslint-plugin-next@16.4.3
  + @next/swc-darwin-arm64@16.4.3
  + @next/swc-darwin-x64@16.4.3
  + @next/swc-linux-arm64-gnu@16.4.3
  + @next/swc-linux-arm64-musl@16.4.3
  + @next/swc-linux-x64-gnu@16.4.3
  + @next/swc-linux-x64-musl@16.4.3
  + @next/swc-win32-arm64-msvc@16.4.3
  + @next/swc-win32-x64-msvc@16.4.3
  + next@16.4.3
```

## 645263cc

numstat: `8 4 pnpm-lock.yaml`

Why: the override `typed-rest-client>qs: 6.16.1` (its overrides.json entry in the same commit). The lockfile also gains its `overrides:` map (the +4 beyond the qs entries). Closes GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g.

```
removed:
  - qs@6.15.1
added:
  + qs@6.16.1
```

## a2f24e60

numstat: `72 72 pnpm-lock.yaml`

Why: fast-uri 3.1.9 (ajv 8.20.0's dependency), by `pnpm update -r fast-uri --lockfile-only`, which re-resolves the graph: rolldown 1.2.15 (inside vite 8.3.4's `~1.2.12`), its fifteen @rolldown/binding platform packages (rolldown's exact-version optional dependencies, cpu/os/libc fields kept) and @oxc-project/types 0.155.0 (rolldown 1.2.15 declares `=0.155.0`) move with it; nothing else. Closes GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr, GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp.

```
removed:
  - @oxc-project/types@0.154.0
  - @rolldown/binding-android-arm-eabi@1.2.14
  - @rolldown/binding-android-arm64@1.2.14
  - @rolldown/binding-darwin-arm64@1.2.14
  - @rolldown/binding-darwin-x64@1.2.14
  - @rolldown/binding-freebsd-x64@1.2.14
  - @rolldown/binding-linux-arm-gnueabihf@1.2.14
  - @rolldown/binding-linux-arm64-gnu@1.2.14
  - @rolldown/binding-linux-arm64-musl@1.2.14
  - @rolldown/binding-linux-ppc64-gnu@1.2.14
  - @rolldown/binding-linux-s390x-gnu@1.2.14
  - @rolldown/binding-linux-x64-gnu@1.2.14
  - @rolldown/binding-linux-x64-musl@1.2.14
  - @rolldown/binding-openharmony-arm64@1.2.14
  - @rolldown/binding-win32-arm64-msvc@1.2.14
  - @rolldown/binding-win32-x64-msvc@1.2.14
  - fast-uri@3.1.8
  - rolldown@1.2.14
added:
  + @oxc-project/types@0.155.0
  + @rolldown/binding-android-arm-eabi@1.2.15
  + @rolldown/binding-android-arm64@1.2.15
  + @rolldown/binding-darwin-arm64@1.2.15
  + @rolldown/binding-darwin-x64@1.2.15
  + @rolldown/binding-freebsd-x64@1.2.15
  + @rolldown/binding-linux-arm-gnueabihf@1.2.15
  + @rolldown/binding-linux-arm64-gnu@1.2.15
  + @rolldown/binding-linux-arm64-musl@1.2.15
  + @rolldown/binding-linux-ppc64-gnu@1.2.15
  + @rolldown/binding-linux-s390x-gnu@1.2.15
  + @rolldown/binding-linux-x64-gnu@1.2.15
  + @rolldown/binding-linux-x64-musl@1.2.15
  + @rolldown/binding-openharmony-arm64@1.2.15
  + @rolldown/binding-win32-arm64-msvc@1.2.15
  + @rolldown/binding-win32-x64-msvc@1.2.15
  + fast-uri@3.1.9
  + rolldown@1.2.15
```

## Totals

fb0af1d..a2f24e60: 47 versions added, 47 removed (one for one; no package enters or leaves the graph). `pnpm audit`
(all, --prod, --audit-level=high): no known vulnerabilities. next keeps its own postcss 8.5.23.
