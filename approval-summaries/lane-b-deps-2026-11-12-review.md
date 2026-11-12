# Adversarial review: supply chain and CI of the dependency pull request (2026-11-12)

Scope: `git diff origin/claude/build-platform...f063e54f` (commits 721dc8a1, f063e54f) in the PhysicalTherapy
checkout, supply chain and CI only. Read-only: no git writes, no file of the repository changed, no pnpm
test/lint/typecheck/install run, node_modules and pnpm-lock.yaml read only. Ages are taken at 2026-11-12T00:00Z.

Verdict: no blocker found. Two should-fix items, both in the `tools/stryker` change, and six notes.

## Findings

### S1 (should-fix) `tslib` in TEST_TOOLING switches the undeclared-import scan off for tslib in every tooling package, and its comment's last sentence is not true for a lockfile move

Evidence, `tools/stryker/affected.test.ts` (the test at line 1047):

    if (declared.has(name) || tooling.some((pattern) => pattern.test(name))) continue;

A name matching TEST_TOOLING is skipped before it is resolved, for every installed tooling package, not for
typescript alone. And `lockedPackages` (`tools/stryker/affected.ts` 597-606) seeds tooling names only from what
an importer declares:

    for (const [name, entry] of Object.entries(importers[importer]?.[field] ?? {})) {
      if (!toolingPatterns.some((pattern) => pattern.test(name))) continue;

No importer declares tslib, so the name adds nothing to what the lockfile rule holds. Reproduced on the head
lockfile with a script that follows the root's and tools' tooling entries through `snapshots`:

    tooling lockfile closure 269 holds tslib: [ 'tslib@2.8.1' ]

So the new comment's "Holding the name errs toward running: a tslib move affects all four" is true only for a
manifest or catalog entry named tslib (manifests.ts line 271, and none exists); a lockfile move of the hoisted
tslib 2.9.1 still affects only closures that reach it. The result: a tooling package that one day really
requires tslib without declaring it, and so loads the hoisted copy, is neither reported by the scan nor held by
the lockfile rule. That is the exact gap the scan exists to close (ADR 0066 Part 7, N51).

Does it run fewer shards or skip anything today? No. Adding a name to TEST_TOOLING can only add verdicts:
`classifyManifests` returns `global` for a matching name before any other rule, `lockedPackages` only adds seeds,
and mutation.yml's `changes` job only passes `any`, `packages` and `shards` on. An independent scan of the 219
installed packages of the tooling's lockfile closure for `from|require(|import( 'tslib'` found two: 

    typescript@6.0.3 files=2 declares tslib=NO e.g. lib/_tsc.js
    rxjs@7.8.2 files=58 declares tslib=^2.1.0 e.g. dist/esm/internal/observable/dom/fetch.js

so nothing real is hidden today; the loss is in what the scan can catch later.

Smallest fix: take `'tslib'` back out of TEST_TOOLING and exempt the one pair in the scan, with its reason, for
example a small list `TEXT_NOT_IMPORT = [{ package: 'typescript', name: 'tslib' }]` checked beside `declared`
in that test (it keeps the scan on for every other package's tslib). Better still, and the cause's own fix:
have `bareSpecifiers` skip a match that sits inside a string literal (the match here is `from 'tslib'` inside a
double-quoted message), with a case added to the test at line 1038. If the name stays in TEST_TOOLING instead,
correct the comment's last sentence and add an assertion beside lines 654-668 that states why it is there.

### S2 (should-fix, wording) "Stryker pins tslib exactly" is half true

    npm view @stryker-mutator/core@10.1.1 dependencies.tslib          -> 2.8.1
    npm view @stryker-mutator/instrumenter@10.1.1 dependencies.tslib  -> 2.8.1
    npm view @stryker-mutator/api@10.1.1 dependencies.tslib           -> ~2.8.0
    npm view @stryker-mutator/vitest-runner@10.1.1 dependencies.tslib -> ~2.8.0

Two pin exactly, two hold the 2.8 line by tilde; rxjs 7.8.2 (`^2.1.0`) is locked to 2.8.1 beside them. The
conclusion (none of them takes 2.9.1) holds. Fix: "Stryker holds tslib to 2.8.x (two of its packages exactly)".

### N1 (note) The action pin brings a newer bundled pnpm into every job: 11.25.0 to 11.28.10

`pnpm/action-setup` has no input set in any of the 17 steps (none has a `with:`), and `action.yml` is byte
identical between the two pins (fetched from raw.githubusercontent.com at each SHA; `diff` empty), still
`using: node24`, `main` and `post` `dist/index.js`. What differs between ea17c68d and 73e46992 (five commits,
fetched with git): `dist/index.js` (232 lines), `src/cache-save/run.ts` (+12, "skip saving missing cache
directories"), the three bootstrap lockfiles, tests, workflows and README of the action itself.

    src/install-pnpm/bootstrap/pnpm-lock.json:  "pnpm": "11.25.0" -> "11.28.10"
    npm view pnpm@11.28.10: published 2026-10-30T15:30:50Z by "GitHub Actions", not deprecated,
      dist.integrity equal to the bootstrap lockfile's sha512-ZyIW8G4V…

So each job's bootstrap now runs pnpm 11.28.10 (12.4 days old) before the switch to the `packageManager`
pnpm 10.34.8, which is unchanged. This is code CI did not run on the base; it is the action's own pinned,
integrity-checked choice. Nothing to fix; it belongs in the pull request's description.

### N2 (note) tslib 2.9.1 enters as the hoisted copy, published by a different account, without provenance

    tslib 2.8.1->2.9.1 publisher typescript-bot->microsoft1es, evidence none->none
    maintainers: minestarks, rbuckton, sanders_n, sheetalkamat out; jakebailey, microsoft-oss-releases, microsoft1es in
    tslib@2.9.1 published 2026-10-30T20:20:28Z; used by 56 lockfile packages (the AWS SDK's among them)
    node_modules/.pnpm/node_modules/tslib -> ../tslib@2.9.1/node_modules/tslib

`trustPolicy: no-downgrade` passes (no earlier version had stronger evidence), the integrity is the registry's,
it has no install script, and it is 12.2 days old. The account is on the package's own maintainer list.
typescript@6.0.3 is still published by typescript-bot. A publisher change on a package the production SDK loads
is a thing for the founder to see rather than a defect; no fix proposed.

### N3 (note) Other publisher changes among the sensitive packages: none

For all 125 added versions, publisher, maintainer list and evidence were compared with the base's version:

    @opentelemetry/api 1.9.1->1.10.0   maintainers +martinkuba +overbalance; trusted publisher both
    @stripe/react-stripe-js 7.0.0->7.0.1, @stripe/stripe-js 10.1.0->10.2.1   a different Stripe staff account each; no provenance before or after
    tslib (N2)

otpauth 9.6.0, @simplewebauthn/server 14.1.0, @peculiar/x509 2.2.0, asn1js 3.1.0 and pdfjs-dist 6.5.438: same
publisher ("GitHub Actions", trusted publisher), same maintainers, same evidence as the base's versions.

### N4 (note) The two literals in manifests.test.ts still test what they tested, and will break again on the next bump

`replaced()` throws when the workspace file does not hold the quoted line (manifests.test.ts 121-124), so each
edit was forced by the catalog move and each case is unchanged in meaning: typescript-eslint `^8.72.1` to
`^8.72.2` still expects no package; catalog vitest `^5.1.0` to `^5.1.1` still expects all four. Every future
Dependabot bump of vitest or typescript-eslint fails these two cases by construction, which is why such a pull
request has to be re-made by hand. Smallest lasting fix: read the current line from the file
(`/^  vitest: (.+)\n/m`) and replace it with a different range, rather than quoting today's.

### N5 (note) The CDK CLI moves without the library

#124 moves `aws-cdk` 2.1146.1 to 2.1148.0 alone; the runbook's AWS bullet says the CLI moves with the library
and that `pnpm cdk:diff` and `infra/test/cli-settings.test.ts` are read on a CLI bump. A newer CLI reads an
older library's assembly, so nothing is wrong by the rule; the build job's `cdk:diff` output and that test's
result on this pull request are the evidence, and they were not run here.

### N6 (note) Same version in more than one manifest, as on the base

`pdfjs-dist` (apps/worker, packages/contracts), `tailwindcss` (apps/web, packages/brand) and several
`@aws-sdk/*` clients are written in two or three manifests rather than the catalog. The diff moves every copy
to the same range, and the lockfile resolves one version of each. Pre-existing; not this diff's to fix.

## Verified and found clean

1. Manifests, catalog, workflows against the four Dependabot commits (pr123 c5048adf, pr124 7d80d257, pr135
   dc4fd712, pr139 76af8620), non-lockfile lines compared both ways: the union equals this diff exactly, nothing
   extra, nothing missing (10 AWS SDK clients across 6 manifests, aws-cdk, 14 minor-and-patch names, 17 pins in 9
   workflows). Every range is a caret with a raised floor; none loosened, none changed in kind. All 17 pins read
   `pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1`; no `ea17c68d` is left under .github.
   Each workflow's diff is the pin line alone: no permissions, trigger, step, env or input changed.
   publish-content.yml changes by that one line only.
2. The pin: `git ls-remote` gives `refs/tags/v6.1.1^{}` = 73e46992… (annotated tag, tagger time
   2026-11-03T13:49:45Z); the commit is on `master`, signed, committed 2026-11-03T13:48:37Z, 8.4 days old.
3. Lockfile, by script over the parsed base and head:
   - `lockfileVersion`, `settings` and `overrides` identical; `catalogs` differs only by the four catalog moves;
     no `patchedDependencies`, no change to `onlyBuiltDependencies` (still esbuild alone) or to the release-age
     and trust settings in pnpm-workspace.yaml.
   - 125 package entries added, 137 removed, no entry changed under an unchanged key; no new package NAME and
     none gone; no downgrade; two major moves, both transitive below vitest
     (`@vitest/istanbul-lib-coverage` and `@vitest/istanbul-lib-report` 1.0.2 to 2.1.0).
   - Every one of the head's 602 resolutions is `{integrity: sha512-…}` (a tarball nowhere); no snapshot refers
     to a link, file, git, URL or alias, or to a package the lockfile lacks.
   - All 125 added versions (not a sample) carry exactly the registry's `dist.integrity`, tarballs under
     registry.npmjs.org. This covers @smithy/core 3.39.0, tslib 2.9.1, @peculiar/x509 2.2.0, asn1js 3.1.0,
     rolldown 1.2.16 and @rolldown/binding-linux-x64-gnu 1.2.16, pdfjs-dist 6.5.438, otpauth 9.6.0,
     @simplewebauthn/server 14.1.0, vitest 5.1.0, aws-cdk 2.1148.0, @opentelemetry/api 1.10.0,
     @stripe/stripe-js 10.2.1, eslint 10.14.0, postcss 8.5.32, tailwindcss 4.3.5.
   - No added version has `hasInstallScript`/`requiresBuild` in the lockfile, nor a preinstall, install or
     postinstall script or `gypfile` in its registry manifest. The head lockfile has none at all.
   - No added version is deprecated, and the head lockfile holds no deprecated entry. The base's one,
     @smithy/core 3.38.0, is gone: the only @smithy/core in `packages` and `snapshots` is 3.39.0.
   - Youngest added versions are 5.15 days old (@simplewebauthn/server 14.1.0 and the AWS SDK 3.1164.0
     clients); none is under three days.
   - Trust policy re-applied from the registry's documents to all 125: no version follows an earlier one with
     stronger evidence.
   - Every added entry is also in one of the four Dependabot lockfiles, and every entry Dependabot added is in
     the head: the re-resolution moved nothing Dependabot had not.
4. The tslib claim: typescript 6.0.3 declares no dependencies and its `lib` names `"tslib"` in six places, all
   text (the message "Import emit helpers from 'tslib'.", `externalHelpersModuleNameText`, an assertion); no
   `require(`/`import(` of it exists. The hoisted tslib is 2.9.1. Stryker's packages hold 2.8.x (S2).
5. Code at install or in CI that the base did not run: no new lifecycle script and no new built dependency.
   What is new is the new versions' own code where CI already ran the old (vitest, eslint, typescript-eslint,
   rolldown and tailwind's native bindings, the CDK CLI), the action's `dist/index.js`, and its bootstrap pnpm
   (N1).

## Not checked

- `pnpm/action-setup`'s `dist/index.js` against its source: the bundle is minified and was not rebuilt, so that
  its 232 changed lines are only the cache-save fix and the bootstrap versions is unproven. GitHub's
  `verified_at`, the release's `published_at` and `immutable`, and the release notes were out of reach (the
  GitHub API is not enabled for this session); `pnpm actions:check` on CI reads them.
- Publishers and contents of the pieces bundled inside the action (its `@pnpm/exe` and native bootstrap
  packages), beyond the plain `pnpm` 11.28.10 integrity.
- No test, lint, typecheck, `pnpm toolchain:check`, `pnpm actions:check`, `pnpm audit` or `pnpm cdk:diff` was run
  (a suite was running in the checkout); the publish-content frozen-copy test, the workflow tests and
  `infra/test/cli-settings.test.ts` are taken from the diff's shape, not from a run.
- The contents of the 125 tarballs: integrity was matched to the registry, not the code read. Advisories
  against the added versions were not queried.
- The independent tslib scan covered the 219 packages of the tooling's lockfile closure installed on this
  platform, not the peers the repository's own test also follows from disk.

## Fix round 1: the delta's review

Scope: `git diff f063e54f 7660a331` (answer to S1), and the net of `tools/stryker` against
`origin/claude/build-platform`. Verdict: no blocker, no should-fix; S1 is answered. Three notes.

What was run: `npx vitest run --project unit tools/stryker/affected.test.ts` at 7660a331: 1 file, 64 tests
passed (91 s). Greps over the installed typescript 6.0.3, `node_modules/.pnpm` and `pnpm-lock.yaml`.

Clean, by question:

1. The exemption cannot hide a real import. The removed text begins with a capital `Import` followed by two
   bare words; that is not import syntax, so the exact text can only ever sit inside a string or a comment,
   in typescript or anywhere else. It is applied to typescript alone, so no other package's scan changes
   (the text occurs in no other installed package: 2 files, both typescript@6.0.3). In typescript the
   scan's own pattern meets tslib exactly twice (`lib/_tsc.js:7130`, `lib/typescript.js:10536`), both the
   diagnostic 6139 line; with the text out, a `require("tslib")` or `from "tslib"` elsewhere in typescript
   is still read, undeclared, resolved to the hoisted 2.9.1 and reported.
2. No joining. Both occurrences are `"Import emit helpers from 'tslib'."`, which becomes `"."`: the left
   neighbour is a double quote and the right a full stop, and neither can complete `from`, `import` or
   `require(` with what follows. In general a join could only add a match (fail closed), never remove one
   that was outside the removed text.
3. `manifest.name === 'typescript'` is the right key. It is the name in the installed package's own
   package.json, read after realpath, so an alias (`x: npm:typescript@...`) is still exempted and a
   differently named fork is not; one typescript (6.0.3) is installed and no alias exists in the lockfile.
   A foreign package carrying that name would lose only the non-import text of point 1.
5. Nothing is left of the earlier attempt: `git diff origin/claude/build-platform 7660a331 --
   tools/stryker/affected.ts` is empty, and no `tslib` remains in `affected.ts` or `manifests.ts`. The net
   in `tools/stryker` is the test file (+14/-1) and two version strings in `manifests.test.ts` that follow
   the workspace catalog.
6. The comments are true. Installed manifests: `@stryker-mutator/core` and `instrumenter` declare tslib
   `2.8.1`, `api` and `vitest-runner` `~2.8.0`, `util` none: "at 2.8.x" is right (the earlier "pins
   exactly" was not). Lockfile snapshots: those four resolve to 2.8.1; the hoisted copy is 2.9.1; the
   tooling closure holds 2.8.1 only.

Notes:

- N-F1 (note) The three new assertions prove the property of the string operation, not of the line that
  uses it. Evidence: the first `it` calls `.replaceAll(TYPESCRIPT_TSLIB_TEXT, '')` itself; the scan has
  its own inline copy with the `manifest.name === 'typescript'` condition. A later edit of the inline line
  (a wider text, a regex, another package) leaves the three assertions green. What they do prove is what
  the comment says: the text alone reads as tslib, an import beside it survives the removal, the text alone
  yields nothing. Smallest fix: one helper, `scanned(name, source)`, used by the scan and by the three
  assertions, plus one assertion that a name other than `typescript` keeps the text.
- N-F2 (note) Nothing fails when the exemption goes dead. If typescript drops the message, or the closure
  comes to hold the hoisted tslib, the constant and its comment stay with no test noticing. A reworded
  message fails loudly, which is the right direction. Smallest fix, optional: count the removals in the
  scan and expect at least one.
- N-F3 (note) The comment names Stryker's packages only; `rxjs@7.8.2` (below `@stryker-mutator/core`) also
  resolves tslib to 2.8.1 in the lockfile, by an earlier resolution rather than by its range. A re-resolve
  could move rxjs to the hoisted version and put it in the closure, at which point the exemption is
  unneeded and still harmless. No change needed; N-F2's count would surface it only if the text also went.

Not checked: other platforms' installs (the scan judges the Linux install, as the test states), and
typescript versions other than the installed 6.0.3.
