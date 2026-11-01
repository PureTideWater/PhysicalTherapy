# P2 re-read at bce57f16: files and code (scout)

Read only, 2026-11-01 17:23 to ~17:50 UTC. Tree: `/home/user/ci-trivy-version` at bce57f16 (= origin/claude/build-platform;
`git status` clean before and after). Every `file:line` below is at bce57f16 unless another ref is named. `wt86.ts` is
#86's `tools/test/workflows.test.ts` at its head 83167b8f (read from a scratch clone under `tmp/`, now removed). Network
reads by `gh api` at the UTC times given. Versions of Trivy, trivy-action and `@sigstore/*` were not re-read here (the
versions scout's); "not verified" marks what I could not check.

## 1. The design's cites, re-read

### 1.1 Every Trivy use now

Five `aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0` steps, not four:

| Where | Step | Inputs |
|---|---|---|
| `ci.yml:694-705` (`images`, runs-on ubuntu-26.04 `:666`) | Scan the web image | `input: ${{ runner.temp }}/image/web.tar`, table, HIGH,CRITICAL, ignore-unfixed, exit-code "1", `cache: false` `:704`, `cache-dir: ${{ runner.temp }}/trivy` `:705` |
| `ci.yml:718-730` | Scan the worker image, `if: ${{ !cancelled() && steps.worker.outcome == 'success' }}` `:719` | same, `input: …/worker.tar` `:722`, `cache-dir` `:730` |
| `release.yml:120-129` (`build`, `runs-on: ubuntu-24.04` `:45`, 4 legs `:49`) | Scan the image | `image-ref: ${{ steps.image.outputs.ref }}` `:123`, table, HIGH,CRITICAL, ignore-unfixed, exit-code "1", `cache: false`, `cache-dir` `:129` |
| `release.yml:131-139` | Write the software bill of materials | `image-ref` `:134`, spdx-json, `output: sbom-${{ matrix.image }}-${{ github.ref_name }}.spdx.json`, exit-code "0", cache off `:138-139` |
| `release-dry-run.yml:131-139` (`build`, ubuntu-24.04 `:64`, legs web and worker `:69`) | Write the software bill of materials (new since b36214aa, 2026-10-27) | release.yml's inputs, `output: sbom-${{ matrix.image }}-dry-run.spdx.json`; then `jq -e` SPDX read `:140-143` |

No `TRIVY_*` env anywhere; the DB source is the action's default. What runs, from bce57f16's push run 41330911483
(`gh api …/actions/jobs/124920631345/logs`, 17:30Z): trivy-action ed142fd nests setup-trivy `3fb12ec…` (log `:34-37`),
`version: v0.70.0` (`:1629`), installed by `bash ./trivy/contrib/install.sh -b … -c setup-trivy v0.70.0` (`:1757`), DB
`repo="mirror.gcr.io/aquasec/trivy-db:2"` (`:1887`), 131.24 MiB; the worker scan reuses the cache dir (no second
download). The dry run's SBOM step needs no DB: `"--format spdx-json" disables security scanning` (dry-run web job
124920631202, log `:1930`, 17:21:33Z). No Trivy in `release-capacity.yml`, `screening-capacity.yml`,
`content-calendar.yml` (grep; the first and third are new since 6ddd587, the second existed).

### 1.2 Old cite, new place, and whether it holds

| Design cite | At bce57f16 | Holds? |
|---|---|---|
| `6ddd587:ci.yml:484, 507` (scans) | `ci.yml:695, :720` | yes, but scans read `input:` archives (ci-browser) |
| `6ddd587:ci.yml:497, 506` (worker `if:`) | `ci.yml:708` (`!cancelled()`), `:719` | yes |
| `ci-deps:ci.yml:514, 537` (`cache-dir`) | `ci.yml:705, :730` | yes |
| `ci-deps:ci.yml:142` (`actions/cache/restore@55cc834… # v6.1.0`) | `ci.yml:147` (also `:210, :230, :322, :342, :371, :521, :541`) | yes |
| `ci-deps:release.yml:92-110`, `:94, :105` | `release.yml:120-139`, `:123, :134` | yes |
| `ci-deps:release.yml:21-27` (no cache) | `release.yml:21-29` ("and Trivy with its cache off" `:25`) | yes |
| `ci-deps:release-dry-run.yml:44` ("does not scan") | header `:59-62` "with no scan"; **but the dry run now writes the SBOM** `:129-143` on both legs | changed |
| `release-dry-run.yml:14-27` (paths) | `:19-30` (pull_request), `:32-43` (push) | yes (9 paths) |
| `RELEASE_RUNNER.label` | `release.yml:45` literal `ubuntu-24.04`, held by `workflows.test.ts:493-500` (`RELEASE_CHAIN` `:224`) | yes |
| `tools/gitleaks/install.sh`, `release.txt` (6ddd587) | unchanged (`git diff 6ddd587 bce57f16 -- tools/gitleaks` empty). Message `install.sh:59`, `tar … gitleaks` `:63`, atomic move `:65-67`, awk reads `:12, :23`; curl `:53` has no `--proto/--tlsv1.2`; `GITLEAKS_DOWNLOAD_BASE` mirror `:50` | yes |
| `package.json:18` (`gitleaks:install`) | `package.json:18` | yes |
| `workflows.test.ts:176` `isScan` | `:252` (matches `uses: aquasecurity/trivy-action@` + `exit-code '1'`) | moved |
| `workflows.test.ts:450` release scan+SBOM | `:626-660` (scan `:640, :644`) | moved |
| `workflows.test.ts:571-575` no-cache rule | `:871-897`, Trivy lines `:889-893` (expects exactly 2 trivy-action steps) | moved |
| `workflows.test.ts:1213-1237` images | `:1815-1846`; plus the identity test's scan order `:1876-1877` | moved |
| `workflows.test.ts:1306-1345` dry-run equality, `:1310` PATHS | describe `:2252-2388`: PATHS `:2258-2268`; equality `:2324-2349` (`kept` drops `isScan` and the sbom upload `:2337-2339`); SBOM test `:2375-2386` names `aquasecurity/trivy-action` `:2376, :2383` | moved, and the dry run now has an SBOM |
| gitleaks precedent in workflows.test.ts | `:1489-1512`, `:1566-1569` | — |
| `no-duplicated-versions.test.ts:9-16, 25-33`, "a sixth case" | header `:9-29`, `scanned()` `:35-43`; **eight** cases `:71, :81, :89, :93, :105, :112, :118, :124` | P2's is a ninth |
| `collection.test.ts:41-43` | `:41-43` (`testsIn('tools/ci')` `:43`) | yes |
| `check-action-pins/network.ts:14, :27-28` (`get` → text) | `Answer {status, text, headers}` `:27-31`; `get(url, signal?, headers?)` `:62`; `gitTransport(origin)` `:109` (no `liveTransport`); `get` impl `:191-200`, `response.text()` `:199`; `READ_TIMEOUT_MS = 30_000` `:98`; `TRIES`, `BACKOFF_MS` `:281-283`; `withRetries(transport, host, what, read, retry, signal, pause)` `:338-371`; `tagCommit` `:377-388` | changed shape |
| `base.ts:44-47` (diffs the checker only) | `baseState` `:45-73`, checker diff `:67-69`; paths named once `:14-23` (held by `check.test.ts:181-191`); `BaseState` gains `hasAge`, `ageExceptions` `:33-42` | moved |
| `check.ts:43-105`, push path `:90-103` | `checkActionPins` `:118-297`: offline errors `:122-129`, `--offline` return `:132`, push verify loop `:166-210`, builder + age rule under one deadline `:213-256`, push tag re-reads `:258-295` | moved |
| `verify.ts:113-181` (nested caches) | `cacheGates` `:162-200`, `releaseCacheProblems` `:203-220`, release steps `:260-266` | yes |
| `workflows.ts:101` (`docker://` refused) | `:101` | yes |
| `check-toolchain/policy.ts:10` | `MINIMUM_RELEASE_AGE_MINUTES = 4320` `:11` | moved |
| `check-toolchain/check.ts:219-238` (newer pnpm) | `:346-363` | moved; `buildkit.ts:96-117` is now the closer precedent |
| `tools/package.json` | deps all `catalog:`/`workspace:*` but `yaml: ^2.9.1` (devDependencies) | — |
| `docs/runbooks/ci.md:33, 83, 197` | `:33` (images row), `:148-149` (images triage), `:271-273` (cache paragraph) | moved |
| `dependency-upgrades.md` | sections `:21, :45` (triage; step 5 `:89-92`), `:121, :148, :166, :178, :195` (pnpm), `:224` (images), `:295`, `:325` (Actions); no Trivy section | — |
| ADR 0010 `:19, :30` | `:19`, `:30-31` | yes |
| ADR 0066 `:618` (Part 2 Revisit) | `:727` | moved |
| `CLAUDE.md` | no Trivy text; `:33` gained the actions:check line since 6ddd587 | yes |
| `registry.ts:463-466` (CI-11 to 14 form), `test-matrix.md:211-213` | CI-11..14 `registry.ts:615-619`; CI-21..23 `:628-631`; matrix intro `test-matrix.md:257-264` | moved |
| `lane-b-ci.md:2009-2011`, `:2108-2112`, `:2066-2068` | RELEASE_RUNNER `:2026-2027`; Trivy `input:` `:2168`; attestation `:2086`; P2 line `:1534` holds | moved |
| `p1-design.md:178-183`, `:343-345` | `follow-up-p1-pin-age.md:244-249` (releaseAgeMinutes, P2's floor), `:451-452` (P2 imports the floor, no exclude), `:750-752` | moved |

Not in the design and found now: `packages/compliance/src/controls.ts:264` names `aquasecurity/trivy-action` as the
`ci_job` evidence of the container scan (it was `:261` at 6ddd587); `controls.test.ts:221-228` requires every `ci_job`
step to be named whole in its workflow (`namesWhole` `:124-129`). Retiring the action turns that test red.

## 2. P1 (#82) and what P2 takes from it

- **Module.** `tools/check-toolchain/exclude-window.ts` (header `:3-15`):
  - `READ_DEADLINE_MS = 180_000` `:22`: "the one deadline each checker's age reads run under (E3)";
  - `releaseAgeMinutes(workspace: Pick<Workspace, 'minimumReleaseAge'>): number` `:29-32`: the workspace's value, never
    under `MINIMUM_RELEASE_AGE_MINUTES` (`policy.ts:11`), a non-number reads as the minimum;
  - `ageWords(minutes)` `:35-37` ("three days" for 4,320);
  - `ExcludeDates` `:40-43`, `KnownTime {what, at, as}` `:49-56`, `ExcludeWindow` `:64`;
  - `excludeWindowProblems(subject, entry, window, now)` `:72-97`;
  - `expiredExclude(subject, expires, now, where)` `:105-119`.
  - `policy.ts`: `EXCLUDE_MAX_DAYS = 7` `:13`, `DAY_MS`, `MINUTE_MS` `:17-18`.
- **How P2 should call it.**
  - `index.ts:18-22` already reads `pnpm-workspace.yaml` (`parseYamlFile` + `workspaceSchema`, failing closed) and
    passes `floor: releaseAgeMinutes(workspace.value)` `:30`.
  - `check.ts:220` normalizes it again: `const floor = releaseAgeMinutes({ minimumReleaseAge: options.floor })`.
  - `trivy.ts` should take `floor` (and `now`, `clock`, `signal`, `push`, `isNew`) as `checkBuilder` does
    (`buildkit.ts:65-88`, called at `check.ts:224-231`).
  - The age test: verified `integratedTime * 1000 + floor * MINUTE_MS <= now.getTime()`, and `integratedTime` equals
    `signed_at`. Messages say the floor with `ageWords(floor)`.
  - `pin-trivy.ts` reads the workspace as `index.ts:18-22` does.
  - P2 calls neither `excludeWindowProblems` nor `expiredExclude`, since Trivy gets no exclude (design C7, the founder's
    to rule). If one is ever ruled, it is a `security-fix` window with `known: {what: 'the release', at: signed_at, as:
    'signed'}` (a new `as` word).
  - Today an `aquasecurity/trivy@<sha>` entry in `tools/check-action-pins/age-exceptions.json` would only warn "no
    workflow pins" (`age.ts:849`), so it opens no side path. The design's "if P2 merges before P1 … repoints" fallback
    is moot.
- **The deadline.** The builder and the age rule share `ageDeadline = deadline(READ_DEADLINE_MS)` (`check.ts:213-215`).
  The design's `getBytes` limit of 300 s per read cannot fit under it, so P2 must state its own deadline (see Changes).
- **The action-pin age rule and trivy-action.**
  - `ageSet` (`age.ts:206-213`) ages only pins new against the base, or every pin when the base lacks `age.ts`.
  - So trivy-action ed142fd was aged once, on P1's own pull request (bootstrapping). ADR 0066 Part 5 records it:
    `:1504` (tagger 2026-04-22T09:29:59Z, 188.70 days) and `:1529` (`verified_at` 2026-04-22T09:20:49Z valid, published
    09:39:33Z, immutable true, 188.74 days).
  - On every push run its tag is re-read (`check.ts:258-295`, warnings only).
  - When P2 retires the action, the pin leaves every workflow. The age rule, the verify loop and the push re-read have
    nothing to read for it; `age-exceptions.json` has no entries to clean (`entries: []`). The nested-cache rule
    (`verify.ts:162-220`) stays for any other composite in release.yml, and its synthetic trivy-shaped fixture
    (`verify.test.ts:25`) stays valid. ADR 0066's tables (`:347` "(kept)", `:1504`, `:1529`) remain records.
  - The new `actions/cache/restore|save` steps P2 adds in `images` reuse the base's pin (`ci.yml:147`), so no age read.
- **The image rule** (`images.ts:1123-1210` `workflowImages`).
  - It reads job `container`, `services`, `docker://` steps, setup-buildx `driver-opts image=`, build-push inputs,
    setup-qemu and bake. It never reads `env` or `run:`.
  - So `TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db` (an OCI artifact, untagged by design) and the `trivy` run
    steps are invisible to it: no conflict and no cover. P2's own checker must hold them, as the design says.
  - Part 5's Consequences already lists "Trivy and its database" as unheld at run time (ADR 0066 `:1666`); Part 6
    answers that line.
  - `images.ts:1195` ("leave the bill of materials to the release's Trivy scan") stays true.

## 3. Tests

- **Locally.** Under the lock: `flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/test
  tools/check-toolchain tools/check-action-pins tools/gitleaks`, 2026-11-01 17:29:02 to 17:29:34Z: **32 files, 451
  tests passed, exit 0**.
  - The filter matched 30 intended files plus `tools/test-oracle/{compare,parser}.test.ts` (substring).
  - `tools/gitleaks` holds no test file. Its tests are `tools/hooks/pre-push.test.ts:619-628` (executable bit, script)
    and `workflows.test.ts:1489-1512`, `:1566-1569`.
  - `packages/compliance/src/controls.test.ts`, which P2 breaks, is outside this filter: the builder should add it.
- **CI on bce57f16.** Push run 41330911483 (`gh api …/actions/runs?head_sha=bce57f16…`, 17:28Z).
  - `unit` job 124920631257 succeeded (17:19:52 to 17:25:08Z): **404 files passed; 6,893 tests passed, 1 skipped
    (6,894)**, the same as PR run 41329075340's unit job.
  - `images` 124920631345 succeeded. release-dry-run push run 41330911485 succeeded.
- **actionlint.** `/usr/local/bin/actionlint` 1.7.7 is installed here. `workflows.test.ts` runs it where installed
  (`:2455-2460`).

## 4. Overlaps

### 4.1 #86 `co-001/ci-images-digest` (open, draft, head 83167b8f; `gh api …/pulls/86` at 17:28Z: mergeable false, "dirty")

- **Status.** The status file (`approval-summaries/lane-b-ci-images-digest-status.md`) is last dated 2026-10-28 06:41
  UTC. The PR was last updated 2026-10-28T08:01:36Z. Design: `designs/lane-b-ci/ci-images-digest.md` (its own "P2"
  proposals are unrelated).
- **Merge base with bce57f16: 83d71fd6.** `git merge-tree --write-tree bce57f16 83167b8f` conflicts in ADR 0066,
  reconciliation-001 and workflows.test.ts (with P1). The five workflows and ci.md auto-merge. So #86 must merge the
  build branch first.
- **Its hunks**, in the trial-merged tree:
  - `ci.yml`: 3 comment lines above `images:` (`:665-667`); `env: { BUILDX_METADATA_PROVENANCE: disabled }` plus 2
    comment lines on the web build (`:686-687, :691`) and the worker build (`:716`); the identity steps take
    `BUILT: ${{ fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest'] }}`. In that tree the
    Trivy steps sit at `:700-711` and `:725-737`.
  - `release.yml`: `:103-104, :107` on the build step (Trivy at `:123-142`).
  - `release-dry-run.yml`: `:112-113, :116` (SBOM at `:132-142`).
  - `release-capacity.yml` and `screening-capacity.yml`: the same env (no Trivy).
- **What collides with P2.**
  - **Workflows: no textual collision** if P2 edits only the Trivy steps, adds job-level env after `timeout-minutes`,
    and leaves the build steps, the `images` header's last line (`ci.yml:664` merged) and release.yml's `:101-102`
    comment alone. Each #86 hunk is separated from the Trivy steps by the build step's `with:` block (seven or more
    unchanged lines).
  - It does collide if P2 inserts its install or database step directly before a build step, or rewords those comment
    lines.
  - **`docs/runbooks/ci.md`: direct.** #86 extends the `images` triage bullet (`:148-149` at bce57f16), the same bullet
    P2 extends with its three failures. #86 also adds a "Changing CI" bullet (~`:392`).
  - **ADR 0066: direct.** #86 edits the Date line (`:31` at bce57f16, `:28` at #86's base), Part 3's Deciders, and adds notice N29 in Part 3's Notices.
    P2 edits Status, Date, Deciders and PRD lines and adds Part 6.
  - **reconciliation-001: direct.** Both append at the file's end, after P1's `:659-661`.
  - **`workflows.test.ts`: semantic.** #86 adds the expression value rule (`wt86.ts:3058-3130`) and `BOUNDED_VALUES`
    (`wt86.ts:3213-3289`).
    - Every `steps.*`/`needs.*` value that reaches a step's env, `with`, `run` or `working-directory` must be listed
      with a bound naming `file:line`.
    - `$GITHUB_ENV` writes are a closed list: `ENGINE_FREEZE_BASE` only.
    - `runner.*` is admitted one level down.
    - P2's `IMAGE_REF: ${{ steps.image.outputs.ref }}` is already admitted for `release.yml build` and
      `release-dry-run.yml build`.
    - A cache step output that P2 hands to `actions/cache/save` in `images` needs a new row.
    - #86's bound cites name lines P2 shifts: `ci.yml:683-694`, `:707-719`; `release.yml:168-196`;
      `release-dry-run.yml:163-191`. These are not test-held but should be refreshed.
    - #86 also asserts exactly 7 build-push steps (P2 adds none).
    - #86 edits the identity assertions (`workflows.test.ts:1856-1865`), about 10 lines above P2's scan-order line
      `:1876-1877`.
- **Recommendation: build P2 after #86 merges.** #86 is next in the merge order. P2's branch has no commits yet (cut
  locally at bce57f16, not pushed), so re-cutting it from the build branch after #86 costs nothing. Then P2 resolves
  nothing of #86's and writes its new outputs into #86's list once.
  - If P2's build must start first: merge the build branch in after #86 (a merge commit, rule 6). Keep #86's ci.md
    bullet text and append P2's failures after it. Keep N29 and add Part 6. Append P2's reconciliation entry after #86's.

### 4.2 The rest of the queue (`gh api …/pulls/<n>/files`, 17:40Z)

- **#75, #83, #84, #85:** they touch `test-matrix.md` (`:228`, `:337`, `:129`, `:129`), `matrix.ts` and `registry.ts`,
  outside the CI block. #75 also touches reconciliation-001 at `:260` (not the end). #84 touches `ci.md` at `:440`
  (mutation shard table).
  - None touches P2's regions: rule 6 resolves them mechanically.
- **#87, #88, #89 (Dependabot; never merged by this session):** `pnpm-lock.yaml`, plus other packages' `package.json`
  files (#89: ten @aws-sdk/stripe minors and patches).
  - None touches `tools/package.json`, P2's lockfile importer (`tools:` at `pnpm-lock.yaml:791`).
  - Whichever of P2 and those merges second regenerates the lockfile with `pnpm install` (rule 6, LANES.md:35).
- **Watched paths.** Root `package.json` (`watched-paths.txt:20`) and `pnpm-lock.yaml` (`:23`) are watched, so P2's
  pull request runs the capacity measurement (as design §11 says). `tools/package.json` is not watched.

### 4.3 #42 (PR 6b-4, head be63bdc2, merge base 56ed6279)

- The P2 files it changes now:
  - `ci.yml` and `workflows.test.ts`: the #86 port of the identity steps only (`ci.yml:731-751`;
    `workflows.test.ts:1799, :1808`);
  - `test-matrix.md` `:177-217` (LED/SCR, not CI);
  - `matrix.ts` `:223, :331`;
  - `registry.ts` `:367, :513, :523`;
  - `reconciliation-001.md` `:638`;
  - `pnpm-lock.yaml`: the apps/web and apps/worker importers and `@aws-sdk/client-sqs`.
- None is in P2's hunks, and none is on the "Not while #42 is open" list (LANES.md:84-91). ADRs and the matrix and
  registry are rule-6 documents (`:93`).
- ADR 0062 is a #42 file. It still says "both trivy-action steps set `cache: false`…" (`0062…md:1376`, the 2026-10-26
  amendment), so keep B1: do not edit it while #42 is open. Part 6 should say it supersedes that bullet.

## 5. The shared files at bce57f16

- **ADR 0066** (1,681 lines).
  - Parts start at `:62, :282, :731, :1002, :1273`; Part 5 ends `:1681`. Part 6 goes after it.
  - Status `:3-30` (Part 5's amends line `:28-30`), Date `:31` ("…; Part 5 2026-10-28"), Deciders `:32-48` (Part 5's
    sub-bullet `:35-38`), PRD sections `:49-60` (Part 5 `:52-53`).
  - Part 2 Revisit `:723-729` (the trivy line `:727`). Part 2's release no-cache text: `:390-400`. Pin table `:347`.
  - Part 5 Context names CVE-2026-33634 (`:1282-1283`). Consequences "What runs at run time … Trivy and its database"
    `:1666`. Revisit `:1674-1681`.
- **Test matrix.**
  - Intro `test-matrix.md:257-264`. It says "CI-21 to CI-23 hold pins and digests … **and complete the series**"
    (`:261-262`), which CI-24 to CI-26 make untrue.
  - Rows CI-01 to CI-23 `:268-290`; the last used is CI-23 `:290`.
  - `matrix.ts` CI-21..23 `:439-441`, word for word with the doc (`fixtures.test.ts:33`).
  - `registry.ts`: comment `:628` "The release age of pins and images (docs/adr/0066, Part 5)", CI-21..23 `:629-631`.
    `fixtures.test.ts:57-62` requires each `assertedBy` file to exist.
- **reconciliation-001.**
  - No Trivy text. P1's entry is the file's end, `:659-661` (edbc928e): "Under the same ruling of October 26, 2026
    (about 00:20 UTC), the CI series' follow-up P1 is taken …".
  - #86 adds its own entry in the same form.
- **packages/compliance.** `controls.ts:264`: `{ kind: 'ci_job', workflow: CI, step: 'aquasecurity/trivy-action', what:
  'the container scan of both images on every pull request (the images job)' }`.
  - `:265` `{ workflow: RELEASE, step: 'sbom-' }` survives, since the output names keep `sbom-`.
  - `controls.test.ts:217` is a literal `namesWhole` example (harmless). `:221-228` reads the workflows.

## Changes the design needs

1. **§3 "Job-level `env` on each of those jobs: `TRIVY_CACHE_DIR: ${{ runner.temp }}/trivy`" (blocking).**
   - The fact: `jobs.<id>.env` cannot read the `runner` context. actionlint 1.7.7 refuses it on a scratch workflow:
     `context "runner" is not allowed here. available contexts are "github", "inputs", "matrix", "needs", "secrets",
     "strategy", "vars"`. `workflows.test.ts:2455-2460` runs actionlint where installed.
   - New text: the literal variables stay job-level. These are `TRIVY_DB_REPOSITORY`, `TRIVY_JAVA_DB_REPOSITORY`,
     `TRIVY_DISABLE_TELEMETRY`, `TRIVY_SKIP_VERSION_CHECK` and `TRIVY_NO_PROGRESS`. The cache directory is given per
     Trivy step, either as step `env: TRIVY_CACHE_DIR: ${{ runner.temp }}/trivy` (allowed there, and admitted by #86's
     rule) or as `--cache-dir "$RUNNER_TEMP/trivy"` in `db.sh` and each scan.
   - Never via `$GITHUB_ENV`: #86's closed list admits only `ENGINE_FREEZE_BASE` (`wt86.ts` `GITHUB_ENV_NAMES`).
   - The checker's offline env rule and the workflows assertions say the same.
2. **§4 Files and §8: add `packages/compliance/src/controls.ts:264`.**
   - The fact: it names `aquasecurity/trivy-action` as the scan's CI evidence, and `controls.test.ts:221-228` fails once
     no workflow names it.
   - New text: the step becomes P2's scan command or install step (e.g. `tools/trivy/install.sh`), and `what` says "by
     the Trivy release tools/trivy/release.txt names, its SHA-256 checked".
   - Run `packages/compliance/src/controls.test.ts` in the failing-first set.
3. **§2 "What runs today" (four steps, the dry run does not scan).** New text:
   - Five steps: `ci.yml:695, :720` (`input:`), `release.yml:121, :132`, `release-dry-run.yml:132` (SBOM on both legs
     since b36214aa, 2026-10-27). All have `cache: false` and `cache-dir: ${{ runner.temp }}/trivy`.
   - bce57f16's `images` ran v0.70.0 through setup-trivy's `contrib/install.sh` and pulled
     `mirror.gcr.io/aquasec/trivy-db:2` (job 124920631345, log `:1757`, `:1887`).
4. **§3 release-dry-run bullet ("gains the release's install, database, scan and SBOM steps for `web`"; "`:44` reworded").**
   - New text: the dry run already writes the SBOM with release.yml's step on web and worker (`:129-143`). Its
     equality rule makes its `build` exactly release.yml's `build` minus the scan and the SBOM upload
     (`workflows.test.ts:2324-2349`, `:2337-2339`). So it gains the install and database steps on both legs, and no
     scan.
   - Reword `:59-62` ("with no scan") and `:3-15`. `isScan` (`:252`) becomes the CLI form. The SBOM test
     (`:2375-2386`) matches the CLI SBOM step.
   - Keep the database step even though spdx-json reads no DB (dry-run job 124920631202, log `:1930`): the dry run is
     the only pre-tag run of `db.sh` on ubuntu-24.04's jq.
5. **§3 `network.ts` ("`getBytes` … on `Transport` and `liveTransport`", "a 300 s limit").**
   - The facts: `liveTransport` is gone. The live transport is `gitTransport(origin)` (`network.ts:109`, `index.ts:23`)
     and the test one is `recordedTransport` (`fixtures.ts:46`).
   - `get(url, signal?, headers?)` returns `{status, text, headers}` (`:27-31, :62`). It never sends Authorization
     across a redirect (`:57-61, :193-194`), and each read is limited to 30 s (`:98`).
   - `withRetries` is `(transport, host, what, read, retry, signal, pause)` (`:338`).
   - New text: `getBytes(url, signal?)` takes no headers, so the token never reaches release hosts. It is retried by
     `withRetries`.
   - **P2's reads need a stated deadline.** Either they run under the shared `READ_DEADLINE_MS` (180 s,
     `exclude-window.ts:22`, `check.ts:213-215`) with a per-read limit of 60 s or less, or under a named deadline of
     their own whose sum with the verify loop, the age rule and the push re-reads (120 s, `check.ts:38`) stays inside
     `static`'s 15 minutes. A 300 s single read cannot finish under the shared deadline.
6. **§3 `base.ts` ("gains `changedSince(root, mergeBase, paths)`"; "`base.ts:44-47`").**
   - New text: `baseState` (`:45-73`, checker diff `:67-69`) gains the base's `tools/trivy/release.txt`. Its path
     constant joins the "named once" list (`:14-23`) and `check.test.ts:181-191`.
   - Newness follows P1's E4 (`check.ts:222-227`, `check.test.ts:287-309`): the Trivy pin is new when `release.txt`
     differs from the base's.
   - A checker-only change still runs the reads. A verification failure fails; a read outage on an unchanged pin warns,
     as `buildkit.ts:89` does.
7. **§3 `trivy.ts` placement and precedent ("`check.ts:43-105`", "`:90-103`", "`check-toolchain/check.ts:219-238`").**
   - The offline rules join the errors at `check.ts:122-129`, before the `--offline` return (`:132`).
   - The networked check runs beside `checkBuilder` (`:224-231`) with `floor` (`:220`), `now` and `clock` (`:216-218`).
   - The push form follows `buildkit.ts` (`fault` `:89`, newer-release warning `:110-117`). The newer-pnpm warning is
     now `check-toolchain/check.ts:346-363`.
8. **§3 step (5) and C7 (the floor).**
   - Delete "If P2 merges before P1, it imports `MINIMUM_RELEASE_AGE_MINUTES` … repoints" and "(or ci-deps' constant
     until P1 lands)".
   - New text: `releaseAgeMinutes` at `exclude-window.ts:29-32`, 4,320 (`policy.ts:11`). The floor is passed as
     `options.floor` and compared with `MINUTE_MS` (`policy.ts:18`); messages use `ageWords` (`:35`); no exclude
     helper is called.
   - Re-cite P1: `follow-up-p1-pin-age.md:244-249`, `:451-452`.
9. **§7 C8 and §3 (the archive cache).**
   - New text: the save step runs on a push only (`github.event_name != 'pull_request' && cache-hit != 'true'`, the
     `APT_SAVE_IF` form, `workflows.test.ts:244`), so pull requests restore what the build branch saved.
   - The key is `trivy-${{ hashFiles('tools/trivy/release.txt') }}` or a step output. A step output, including
     restore's `cache-primary-key` passed to save, needs a `BOUNDED_VALUES` row once #86 merges (as
     `screening-capacity.yml`'s scale-release key has).
   - The pin is at `ci.yml:147`, not `:142`.
10. **§5 "reconciliation-001: no change".**
    - New text: P1 recorded its ruling as an entry (`reconciliation-001.md:659-661`), and #86 adds one. P2 adds "Under
      the same ruling of October 26, 2026 (about 00:20 UTC), the CI series' follow-up P2 is taken … (`co-001/ci-trivy-version`,
      `docs/adr/0066`, Part 6): **P2, Trivy from verified bytes:** … Test matrix CI-24 to CI-26. Not an exception to a
      check above."
    - It is appended after #86's entry (rule 6).
11. **§5 ADR 0066 Part 6.**
    - Part 6 also answers Part 5's Consequences line `:1666` ("Trivy and its database" unheld) and Part 2's release
      no-cache text `:397-400`. It amends Part 2's Revisit at `:727` (not `:618`).
    - It adds Part 6 lines to Status (`:3-5` and the amends list `:28-30`), Date `:31`, Deciders (after `:35-38`) and
      PRD sections (after `:52-53`), in Part 5's form.
    - It says it supersedes ADR 0062's `:1376` bullet without editing 0062 while #42 is open.
    - Runbook cites: `ci.md:148-149` (the `images` bullet #86 also extends) and `:271-273`.
    - `dependency-upgrades.md`: the Trivy section after "Actions" (`:325-`), and the weekly triage's step 5
      (`:89-92`) gains Trivy's push warning.
12. **§8 the matrix and the registry.**
    - Re-cite `test-matrix.md:257-264` and reword "and complete the series" (`:261-262`).
    - Rows go after `:290`, and `matrix.ts` after `:441`, word for word.
    - Registry entries go after `:631` under their own comment ("Trivy from verified bytes (docs/adr/0066, Part 6)"),
      in CI-21..23's form (`:628-631`), not CI-11..14's.
13. **§4 `no-duplicated-versions.test.ts` ("a sixth case").**
    - New text: a ninth case (eight exist, `:71-124`).
    - `scanned()` (`:35-43`) gains `tools/trivy/install.sh` and `db.sh` beside `install-pnpm.sh`. The header (`:9-29`)
      gains the Trivy line.
14. **§4 `workflows.test.ts` cites.**
    - `isScan` `:252`; release build `:626-660`; no-cache `:871-897` (`:889-893`); images `:1815-1846` and
      `:1876-1877`; dry run PATHS `:2258-2268`, equality `:2324-2349`, SBOM `:2375-2386` (which name
      `aquasecurity/trivy-action` at `:2339, :2376, :2383`). `collection.test.ts:41-43` holds.
15. **§8 install test precedent ("as `tools/ci/postgres.test.ts` does").**
    - New text: `tools/check-toolchain/install-pnpm.test.ts` (a stub tool on PATH for an installer that refuses a hash
      mismatch) is the closer model.
    - `tools/trivy/install.sh` and `db.sh` are committed 100755, held as `tools/hooks/pre-push.test.ts:619-622` holds
      gitleaks' installer.
16. **§3 `tools/package.json`.**
    - New text: put `@sigstore/*` in `devDependencies` (checker tooling; `licenses:check` reads `--prod`), beside
      `yaml` (`^2.9.1`). Say why they are exact while `yaml` is a caret.
    - Versions and publish times: not verified here.
17. **§11 Interplay.**
    - #42 at be63bdc2 now also shares `ci.yml` and `workflows.test.ts` (the #86 port) and `reconciliation-001` (`:638`)
      with P2, none of it in P2's hunks; the `pr42-files.txt` cites are of an older head.
    - Add #86 (§4.1: build after it), the Dependabot lockfile pull requests #87 to #89 (regenerate, never hand-merge),
      and #75, #83, #84, #85 (matrix, registry, `ci.md:440`, `reconciliation-001:260`; outside P2's regions).
    - P1 merged, so "the one merged second resolves" no longer applies.
18. **§2 cites.** Use the table in §1.2 for every moved line: `release.yml:21-29, 120-139`; `release-dry-run.yml:18-43,
    :59`; ci.yml as above; `lane-b-ci.md:2026-2027, :2086, :2168`.

## Notes (proposals outside this item's scope, or for the reviser to weigh)

- **The push run's newer-release check.** The design runs steps (2) to (5) for each newer tag on every push, which
  means downloading 52 MB per candidate per push. A push-only age warning could read the bundle's verified tlog entry
  and `checksums.txt` and leave the tarball to `pnpm trivy:pin`. This is a design choice for the reviser; it costs
  less in `static`'s time.
- **README.** `README.md:44-45` could gain `pnpm trivy:pin X.Y.Z` beside `pnpm actions:check`, with no version literal
  (README is scanned, `no-duplicated-versions.test.ts:41`).
- **#86's stale bound cites.** #86's `BOUNDED_VALUES` cites (`ci.yml:683-694` etc.) will be off by P1's and P2's line
  shifts. A test that the cited lines hold the producer would keep them honest. That belongs to #86's owner.
