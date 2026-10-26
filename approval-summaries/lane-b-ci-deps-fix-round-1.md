# co-001/ci-deps fix round 1 (draft PR #48; reviewed head 2d86bb0)

Worktree /home/user/ci-deps, branch co-001/ci-deps, from 19e3d98 (2d86bb0 pushed, plus the first colour fix) to
123b8fa5ab0d (pushed twice: 2d86bb0..28d60efc, then 28d60efc..123b8fa5, each through the pre-push hook and gitleaks; no
force, no `--no-verify`). Phase 1 still: `git diff --numstat 6eae41a..HEAD -- pnpm-lock.yaml pnpm-workspace.yaml` is
empty, no `package.json` dependency field changed (only `packageManager`'s string, which gained its `+sha512` suffix),
`docker/login-action` stays v3.7.0, and none of #42's files was touched by the round. No migration; nothing under
packages/pricing, packages/ledger, packages/db/migrations, content/, tools/verify-content or the content hook changed.
Every heavy command ran under `flock /tmp/laneb-heavy.lock`. Logs: scratchpad/ci-deps/progress/fi-*.log and the fixers'
f1-*.log and f2-*.log; progress: scratchpad/ci-deps/progress/fix-integrate.md.

| Commit | What |
| --- | --- |
| 68c6db15 Merge claude/build-platform at c5195ee | the base had moved (#47, billing; no lockfile); clean |
| 803b3c90 Merge co-001/ci-deps-f1 (ee92211a … 3cbc1472) | B1, ci-infra S1, S2, N1, N4, N5, security S4, N2, node-runtime warning, large-zip shell |
| cdab194d Merge co-001/ci-deps-f2 (7d2f67d9 … 6e9015a6) | security S1, S2, S3, S5, N1, N3, N4, ci-infra N3; one conflict, both sides kept |
| c917092e runbooks: the BuildKit builder moves by hand | seam: S4's manual step F1 left to F2's file |
| ae7394b9 ci: the dry run also runs on a change to install-pnpm.sh | seam: N1's installer is part of the image build |
| 28d60efc adr: line break | cosmetic |
| 123b8fa5 test: the rewrite test compares outcomes with a control run | CI on 28d60efc found the rewrite test's fixed skip list red |

## Dispositions

### B1 (both reviews, blocking): fixed, ee92211a and 123b8fa5
The spawned vitest writes `--reporter=json --outputFile=<scratch>`; NO_COLOR set, FORCE_COLOR deleted. Red at 2d86bb0
under `FORCE_COLOR=1` (`expected 0 to be greater than 80`, exit 1); green under `FORCE_COLOR=1 CI=true`. CI on 28d60efc
(run 40269124920) then failed `expected 102 to be 103`: the test kept a fixed list of the tests allowed to skip in its
spawned run (itself, and actionlint's where none is installed), and GitHub's runner skipped one more. 123b8fa5 replaces
the list with a control run of the same three files on the repository's own tree, started the same way: every outcome
on the copy must equal the control's, nothing may fail, all three files run, more than 80 pass, and what did not pass
only skipped, the test itself among them. Red: a scratch environment-dependent skip gave `expected 103 to be 104`, exit 1
(fi-envskip-red.log); green with the same probe, and under `FORCE_COLOR=1 CI=true` with and without actionlint on PATH.
CI on 123b8fa5 (run 40270689259): `unit` green, 336 files, 5,189 passed and 1 skipped.

### ci-infra S1 (should_fix): fixed, f091a543
Push re-reads 4 at a time under one 120 s deadline whose signal reaches every git call, sleep and fetch; unread tags
are one warning, never a failure. Red: the new test hung to its 10 s limit; green in 0.2 s, peak concurrency 4.

### ci-infra S2 (should_fix): fixed, e36fd17a
The compose healthcheck asserted whole (2s, 5s, 30) and interval x retries under `--wait-timeout 120`; timeout back to
5s. Red on `timeout: 3s`, then green.

### ci-infra N1 (nit): fixed, 3cbc1472 (and 123b8fa5 for the control run)
ADR 0066 Part 2 (d) names all three files and says the outcomes come from the JSON report against a control run.

### ci-infra N2 (nit): phase 2
The ADR's login v4.7.0 row stays; the login commit after 2026-10-26T15:11Z moves release.yml and release-dry-run.yml
together, which makes the row true and clears check-action-pins' new node20 warning.

### ci-infra N3 (nit): fixed, 5b6384f1
`checkOffline` (gates, settings, Dockerfiles, lockfile resolutions, trust excludes, overrides) runs on the real tree in
the unit tests, with a negative case for a `typed-rest-client>qs` override with no entry. Red: `checkOffline is not a
function`; green: 26 passed.

### ci-infra N4 (nit): fixed, 8cc08e25
The dry run gains a `capacity` job to the frozen install (inputs held equal to release.yml's) and release.yml's SBOM
step with a `jq` SPDX read. Red 4 failed, green 91 passed. CI: dry run build, push and capacity green (runs 40269124915,
40270689452).

### ci-infra N5 (nit): fixed differently, f091a543
Action files read with git over github.com (shallow `blob:none` fetch, then the one blob) instead of a longer backoff:
the old transport got HTTP 429 on all 13 pins in this session; git read them in 25 s. Tested offline over `file://`.

### ci-infra phase-2 findings: phase 2, in the PR's plan
fast-uri needs `pnpm update -r` (rolldown and bindings move too: named, or a temporary override); next 16.4.3 keeps
postcss 8.5.23 (named in the summary); the qs override with its entry (now held offline by N3, no test edit needed);
CI's numbers for "No test lost"; the login commit touches both workflows; @vitest/coverage-v8 in the catalog. The
simulated resolution under the gates: not a defect.

### security S1 (should_fix): fixed, 7d2f67d9 and 6e9015a6
Every lockfile resolution `{integrity}` or a registry.npmjs.org tarball; an added entry's integrity equal to the
packument's; no other registry (`registry`, `@scope:registry`, `registries`), pnpmfile or `configDependencies`
(workspace and `package.json`'s `pnpm` field). Red 6 failed then 1 failed; green 31 and 28 passed. Live: all 614
entries pass against an empty base.

### security S2 (should_fix): fixed, 0fe14976
A lockfile trust rule mirroring pnpm 10.34.8's `failIfTrustDowngraded` over every added version; the gates refuse
`trustPolicyIgnoreAfter` and any trust-policy or release-age key in `.npmrc`; ADR and runbook record the limit pnpm 10
leaves. Red 3 failed; green 33 passed. All 613 non-excluded entries pass.

### security S3 (should_fix): fixed, ea3ec45a
The overrides rule reads `resolutions` too and holds overrides.json equal to the lockfile's `overrides:` map. Red 2
failed; green 25 passed.

### security S4 (should_fix): fixed, 8890c4e6, 8a1bf1e1 and c917092e
`# syntax` removed from both Dockerfiles; `driver-opts: image=moby/buildkit:v0.34.1@sha256:99368f3e…` on all four
setup-buildx steps (Docker Hub's tag API re-read here: same digest, pushed 2026-10-20T21:37Z); CI-13 extended;
check-action-pins reads the builder on Docker Hub (tag equals pin; a newer release three days old warns);
dependency-upgrades.md's "The BuildKit builder, by hand". CI's images job and the dry run built both images.

### security S5 (should_fix): fixed in the documents, d548fb0c
ADR and runbook: selector `typed-rest-client>qs`, removed at typed-rest-client 3.1.1 or later (registry: 3.0.0 and
3.1.0 pin qs 6.15.x). The override lands in phase 2.

### security N1 (nit): fixed, 438df387 and ae7394b9
`packageManager` = `pnpm@10.34.8+sha512.f627a8e9…c5a8`; `install-pnpm.sh` packs, compares and only then installs, in
both images; check-toolchain holds the suffix to the registry and the Dockerfiles to the script; the dry run triggers
on the script. Red 22 failed and 3 failed; green 65 and 3 passed; the real tarball installs, a tampered one installs
nothing; the frozen install accepts the suffix with the lockfile unchanged.

### security N2 (nit): fixed, cbddb781
A problem gate past depth 8; the wording says composite actions and names the explicit-input assertions as the JS
actions' guard. Red `[]`; green exactly one problem.

### security N3 (nit): fixed, 8a1bfe86
An added exclude's GHSA must be reported by the bulk endpoint against a version the base runs and not against the
excluded one; a package the base does not run is refused; fails closed. Red 1 failed; green 66 passed.

### security N4 (nit): fixed, e28e237f
The weekly triage lists open Dependabot alerts and takes a major-only fix as a deliberate upgrade; the ignores note says
they hold for security updates too.

### security phase-2 notes: phase 2 or not a defect
qs selector (in the plan; no trust downgrade); the targets' trust evidence (not a defect); new transitive packages'
trust (now judged in `static` by S1 and S2's rules); the login move (in the plan); toolchain:check against the merge
base and 6ddd587 after the bumps (plan step 5).

### Integration seams
- c5195ee merged first (clean); later the base moved again to 4d99df8 (#46): `git merge-tree` clean, CI's merge ref
  ran 123b8fa5 on it green; left to phase 2's first commit rather than a third push.
- F2's merge: one conflict, `no-duplicated-versions.test.ts`'s header comment; both kept.
- The f2 merge message had git's `# Conflicts` trailer after the attribution; rebuilt before the push with the same
  trees (commit-tree), so every commit ends with the two attribution lines.
- The dry run's path filter, its test, header, ADR and ci.md gain `install-pnpm.sh` (red 1 failed, green 91 passed).
  The screening-capacity watched list does not: the measured runtime stages carry no pnpm, ci.yml's images job builds
  both images on every pull request, and watched-paths.txt is #42's file.
- PostgreSQL 18 at 5433 was down after the session restart; started with pg_ctl as postgres (the targeted suite's
  oracle.db.test needs it).

## Checks run

| Command | Result |
| --- | --- |
| `flock … pnpm install --frozen-lockfile --prefer-offline` | exit 0, lockfile up to date |
| `flock … pnpm typecheck` | exit 0, 22 projects (28d60efc's tree and again after 123b8fa5) |
| `flock … pnpm lint` | exit 0, 1,514 files, 0 errors, 0 warnings (123b8fa5) |
| `actionlint .github/workflows/*.yml` | exit 0 |
| `flock … pnpm test` (ENGINE_FREEZE_BASE, Chromium) | exit 0 at 123b8fa5: 333 files, 5,126 passed; coverage met |
| `flock … pnpm exec vitest run tools/test tools/check-action-pins tools/check-toolchain tools/check-licenses tools/screening-capacity tools/ci` | 37 files, 523 passed (DATABASE_URL at :5433) |
| rewrite test `FORCE_COLOR=1 CI=true` | 1 passed, exit 0, with and without actionlint |
| `flock … pnpm synth --all` | 200 cases, 0 written, 483 unchanged; tree clean |
| `pnpm verify-content`; `pnpm licenses:check` | pass; 185 packages allowed |
| `pnpm audit --prod`; `pnpm audit --audit-level=high` | none; exit 0 with 2 low, 5 moderate (qs, fast-uri: phase 2) |
| `BASE=origin/claude/build-platform pnpm actions:check` (live) | exit 0; every pin read with git; builder tag equals pin; one warning, login v3.7.0 node20 |
| `BASE=origin/claude/build-platform pnpm toolchain:check` (live) | exit 1 on CQ3 alone (young until 18:06:37Z); every other rule ok |
| design 3.2.3 failing first against `git archive 6ddd587` | 7 failed / 104 skipped there, 7 passed here; (c) red then green |
| each new behaviour red then green | 18 rows (PR description, "Fix round 1, failing first") |
| scope (acceptance 1) | protected paths 0; publish-content uses + timeout only; frozen diff only the timeout, runs-on ubuntu-24.04; minio grep empty; lock/workspace numstat empty; #42 files untouched by the round; 0 model ids; attribution on all 28 commits since 2d86bb0 |
| `pnpm db:domain-model --summary-since origin/claude/build-platform` | No change |
| CI run 40269124920 (28d60efc) | unit red (fixed list of skips), static CQ3 only, all else green; dry run and mutation green |
| CI run 40270689259 (123b8fa5) | unit green (5,189 + 1 skipped), static CQ3 only, lint, build, images, db 1-4, domain model, e2e 1-2 green; dry run, approval-of-record green; mutation and screening-capacity running at the time of writing |
| PR #48 description | updated with the MCP update_pull_request tool; the API's body equals pr-body.md byte for byte (gh --jq output = file + newline) |

## Open items

- Phase 2 (after 15:11Z the login commit; after 19:18:50Z the bumps, the qs override `typed-rest-client>qs` with its
  entry and the lockfile's map, fast-uri with `-r`, catalog moves, re-run toolchain:check against the base and
  6ddd587, merge 4d99df8 or later first).
- Follow-up: mutation.yml and screening-capacity.yml under pipefail need their pipes rewritten first.
- `static` stays red until 2026-10-26T18:06:38Z by design (CQ3).
