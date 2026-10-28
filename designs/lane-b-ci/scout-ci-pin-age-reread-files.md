# P1 re-read at ecebdc90: files and code (scout-files)

Worktree `/home/user/ci-pin-age`, `co-001/ci-pin-age` = `origin/claude/build-platform` = ecebdc90 (git ls-remote
2026-10-27T22:25:38Z). Old cites are the design's, at `co-001/ci-deps` 19e3d98e (present locally; compared with
`git show 19e3d98e:<file>`). Every new cite below is at ecebdc90 unless it names another source. Worktree left clean.

## 1. The checkers' cites, re-read

### tools/check-action-pins

| Design cite (19e3d98e) | Now (ecebdc90) | Holds? |
|---|---|---|
| `base.ts:31-49` `baseState` | `base.ts:30-49` (file byte-identical to 19e3d98e: `git diff 19e3d98e ecebdc90 -- base.ts` empty) | Yes. Returns `{ mergeBase, workflows, everyPin }`; `workflows` are always the merge base's (`:34-43`), so the age set can use them even when `everyPin` is set (`:44-47`: no `index.ts` at base, or the change edits `tools/check-action-pins`). Note `check.ts:86-95` only passes `base` on when `everyPin` is undefined, so the age loop must take `state.workflows` itself. |
| `base.ts:60-67` `selectPins` (`verify` also holds changed-input pins) | `base.ts:60-67`, `signature` `:52-57` | Yes, unchanged. |
| `check.ts:71-89` verify loop | `check.ts:101-118`, then the "no pin is new" note `:119` | Yes, plus: the verdict now carries `warnings` (deprecated-runtime, `:114`), and the loop is followed by a NEW builder check `:121-129` (below). |
| `check.ts:90-103` push re-reads, warnings only | `check.ts:131-168` | Holds as a convention (moved tag or unreadable tag = `::warning::`), but reshaped: `PUSH_CONCURRENCY = 4` (`:22`) under one `PUSH_DEADLINE_MS = 120_000` (`:27`) through `pool` (`:45-55`), tags still unread at the deadline named in one warning (`:165-167`). |
| `network.ts:54-68` `withRetries` | `network.ts:144-173` | Holds (3 tries, fail closed naming the host), but its signature gained `signal?: AbortSignal` (`:150`): an aborted deadline throws `NetworkError` "stopped by the deadline" (`:153-162`). A rate-limit wait must go through `transport.sleep(ms, signal)` so a deadline still stops it. |
| `network.ts:35` `BACKOFF_MS` 2 s, 5 s | `network.ts:124`, `TRIES` `:122` | Yes. |
| `fixtures.ts` recorded transport | `fixtures.ts:18-80` | Reshaped: `tags` (string, Error or `HANG` `:16`), `files` keyed by `blob(repo, commit, file)` (`:85`), `urls` (body or status, answer `{status, text}` `:63-73`), `latency`, `peak()`; `raw()` is gone. No headers anywhere. |
| `index.ts` | `index.ts:10-14` | Changed: `liveTransport` is gone; `const transport = gitTransport()` and `.finally(() => transport.close())`. |
| (transport) | `network.ts:21-33` | `Transport` = `lsRemote`, `file(repo, commit, file)` (NEW: action files read with git, not raw.githubusercontent.com), `get(url)` returning only `{status, text}`, `sleep(ms, signal)`. `gitTransport()` `:45-120` keeps one bare repository per action repository under `mkdtempSync(os.tmpdir()/tp-action-pins-git-)` (`:57-58`), each commit fetched `--depth=1 --filter=blob:none` (`:76`), all removed by `close()` (`:116-118`). `READ_TIMEOUT_MS = 30_000` (`:38`). |

Added by ci-deps after 19e3d98e, which P1 must fit:
- **`buildkit.ts` (new, 106 lines).** `builderOf` (`:39-48`, offline form, its problems are errors at `check.ts:75`);
  `checkBuilder` (`:65-106`) on every networked run reads `https://hub.docker.com/v2/repositories/moby/buildkit/tags/<v>`
  (`:76-77`) and the tag list `?page_size=100&ordering=last_updated` (`:85-86`) through `withRetries` with `refuse`
  accepting 200 and 404 (`:56`). A new builder (`check.ts:123-124`, `isNew` against the base's `builderOf`) fails on a
  tag that is not the pin, otherwise warns (`:74`); a newer release pushed three days ago or more is a warning
  (`:93-101`). **It never ages the pinned builder itself**: `tag_last_pushed` is declared (`:61`) but read only for other
  releases. `BUILDKIT_AGE_MS = 3 * 24 * 60 * 60 * 1000` (`:20`) is a second, hard-coded copy of the floor, whose comment
  says it is `minimumReleaseAge`.
- **Rules (a) and (b)** offline: `formProblems` `workflows.ts:95-111` (refuses `./` and `docker://` uses, `:100-101`),
  `consistencyProblems` `:118-136`, `versionsByRef` `:139-147`. **(c)** and **(d)** live in `tools/test/workflows.test.ts`
  (`:2183` usesAction matching; `:2886-` the simulated Dependabot rewrite, which copies `.github`, both Dockerfiles and
  `docker-compose.yml`, `:2888`, and rewrites every pin and every `@sha256:` digest, `:2889-2890`), described at ADR 0066
  `:351-362`.
- **verify.ts**: nested `docker://…@sha256` in a composite is skipped (`DOCKER_DIGEST` `:88`, `:100`), as the design's
  C9/R6 assume; `runtimeWarning` `:205-209`.

### tools/check-toolchain

| Design cite (19e3d98e) | Now (ecebdc90) | Holds? |
|---|---|---|
| `tree.ts:51-57` `readTreeAt` reads only `FILES` | `tree.ts:51-57` (file unchanged) | Yes. Base `dockerfiles` is still undefined, so B1's fix is still needed. |
| `tree.ts:44-47` `readWorkingTree` | `tree.ts:44-48` | Yes. |
| `tree.ts:32-41` `dockerfilePaths` | same | Yes (apps/*/Dockerfile only). |
| `check.ts:40-48` `FILES` | `check.ts:42-52` | Grew: also `npmrc: '.npmrc'`, `pnpmfile: '.pnpmfile.cjs'`. Adding `docker-compose.yml` and `image-age-exceptions.json` still works for both trees. |
| `check.ts:53-54` "A push run follows a green pull request, so it warns" | `check.ts:60-61` (`CheckEvent`); `index.ts:28` maps any event but `push` to `pull_request` | Holds, but note its reach: in check-toolchain only the expired-exclude finding is downgraded on push (`:536-544`); every other rule, the lockfile release age included, errors on push too. The image rule's push=warning is new behaviour for this checker. |
| `check.ts:169`, the floor read "never under `MINIMUM_RELEASE_AGE_MINUTES`" | the floor every rule uses is `check.ts:829`: `Math.max(head.workspace.minimumReleaseAge ?? 0, MINIMUM_RELEASE_AGE_MINUTES)`; `gatesRule` reads it at `:200` and errors under 4,320 at `:201-203` | The old `:169` was `gatesRule`'s read, not the floor used (that was old `:472`). `releaseAgeMinutes` should export `:829`'s expression; `ageWords` `:135-137` goes with it. |
| `check.ts:243` `dockerfileRule` | `check.ts:387-414` | Yes; it now also requires `install-pnpm.sh` (`:407-411`). |
| `check.ts:288-345` `releaseAgeExcludeRule` | `check.ts:489-547` | Holds, with structure the extraction must keep: the window is checked **only for entries new or rewritten against the base** (`baseEntries` `:499`, `:512`): `added` in the future `:513-515`, expiry > added + 7 days `:516-518`, expiry < publish + floor `:520-533`; then `excludeAdvisoryFindings` (N3, `:467-487`: the GHSA must be reported by npm's bulk endpoint against a version the base runs and not against the excluded one), which is npm-only and stays in `check.ts`. Expired: error on a pull request that edits either list, else warning (`:536-544`, `edited` `:500-502`). |
| `registry.ts:57-81` the retry | `readJson` `registry.ts:71-98`; `transient` (408, 429, 5xx) `:66-68`; backoff 1 s then 2 s `:74` | Holds for transient failures, but a **404 is fatal** (`:84-86`, "reading … failed (HTTP 404); check-toolchain fails closed"), so a Hub "no such tag" would read as a network failure; and a 429 is retried after 1 s and 2 s, inside Hub's 60 s window. The response (and its headers) is in scope from `:79`, so the wait fits there. |
| `index.ts` | `index.ts:6-38` | `readTreeAt(repositoryRoot, commit)` at `:30`; `annotate = GITHUB_ACTIONS === 'true'` `:13`. |
| `release-age-exceptions.json` | 4 lines, `entries: []` | Schema `policy.ts:122-126`: `advisory` GHSA-only, `reason` ≥ 20 chars (`:113`), `added`/`expires` UTC instants (`:112`). New lists need their own schema (GHSA or CVE). |
| `check.test.ts`, `tree.test.ts` | window cases `check.test.ts:224` and `:273` (also `:206`, `:215`); committed lists `:544-551`; real-tree offline rule list asserted `:559` | `tree.test.ts:36-66` asserts base `trustExceptions` undefined and head `dockerfiles` (the B1 test goes beside it). |

Added by ci-deps after 19e3d98e that P1 must fit: `settingsRule` (`:237-280`, one registry, no pnpmfile or config
dependency), `pnpmIntegrityRule` (`:359-378`), `lockfileResolutionRule` (`:576-597`), `readAdded` (`:605-622`),
`lockfileIntegrityRule` (`:676-692`), `lockfileTrustRule` (`:705-742`), `trustRule` (`:744-761`), `overridesRule`
(`:786-803`), `checkOffline` (`:810-817`, its rule list held at `check.test.ts:559`), `checkToolchain` order
(`:820-852`), `install-pnpm.sh` and `install-pnpm.test.ts`, `policy.ts` constants (`MINIMUM_RELEASE_AGE_MINUTES` `:11`,
`EXCLUDE_MAX_DAYS` `:13`, `DAY_MS`/`MINUTE_MS` `:17-18`). No lockfile-host rule beyond `lockfileResolutionRule`;
`packageManager` is held by `pnpmRules` (`:282-352`).

### Behaviour the design relies on: verdict
- baseState/selectPins sets: hold. The verify loop and push re-reads: hold, push now pooled under a deadline.
- withRetries/BACKOFF_MS: hold, with a signal. Recorded transport: holds, reshaped (above).
- readTreeAt/readWorkingTree/dockerfilePaths/FILES: hold; B1 still real.
- releaseAgeExcludeRule window: holds, applied only to added entries (the extraction must keep that).
- Floor: `check.ts:829`, not `:169`; a third reader, `buildkit.ts:20`, is hard-coded.
- Push-run warnings: hold in check-action-pins; in check-toolchain only for expired excludes.

## 2. ci.yml's two steps, the runner, gpgv and git
- Workflow: `on` pull_request and push to the build branch (`ci.yml:8-11`); `permissions: contents: read` (`:14-15`),
  under the comment `:13` "The jobs read the repository and nothing else: no step calls the GitHub API (docs/adr/0063)".
  ADR 0066 Part 1 says the same at `:120-121` ("no step calls GitHub").
- Job `static` `:31-171`: `runs-on: ubuntu-26.04` (`:35`), `timeout-minutes: 15` (`:37`), checkout `fetch-depth: 0`,
  `persist-credentials: false` (`:40-41`), range step `:55-75`.
- "Action pins" `:85-88` (comment `:81-84`): `if: ${{ !cancelled() && steps.install.outcome == 'success' &&
  steps.range.outcome == 'success' }}` (`:86`), `env: { BASE: "${{ steps.range.outputs.base }}" }` (`:87`),
  `run: pnpm actions:check` (`:88`).
- "Toolchain" `:92-95` (comment `:89-91`): same `if` (`:93`) and `env` (`:94`), `run: pnpm toolchain:check`.
- `tools/test/workflows.test.ts`: `ci.permissions` equals `{ contents: 'read' }` (`:1318-1319`, comment "The whole
  workflow reads the repository and nothing more"); both steps once, after install and range, that `if`, and
  `env` toEqual `{ BASE: … }` in one loop (`:1393-1402`, the env at `:1401`); every step after the install starts with
  `!cancelled()` (`:1404`); root scripts (`:2191-2195`); images by digest (`:2775-2822`); no `services:` (`:2719`);
  `CI_ROOT = process.env.CI_TREE ?? repositoryRoot` (`:82`).
- **static on ubuntu-26.04: yes.** Run 40593100176 (push of ecebdc90; still in progress at 22:16Z, static finished
  22:16:28Z, success), static job 122502076872, labels `ubuntu-26.04`; its log (GitHub MCP get_job_logs, read 22:2xZ):
  "Image: ubuntu-26.04 / Version: 20261012.163.1" (log lines 16-18), `git version 2.55.0` (57-58). The Action pins step
  (log 401-440) re-read 7 unchanged tags on the push and reported "the builder moby/buildkit:v0.34.1: its tag is the index
  sha256:99368f3e… / no newer release is three days old"; Toolchain (456-474) passed 0/0 "as a push run".
- **gpgv on 26.04: yes.** actions/runner-images main 19874e7a (2026-10-27T17:18:57Z; blobless fetch 22:21:55Z):
  `images/ubuntu/toolsets/toolset-2604.json:130` `"gnupg2"`; `images/ubuntu/Ubuntu2604-Readme.md:271` gnupg2
  2.4.8-4ubuntu3.1, `:11` Image Version 20261023.163.3, `:76` Git 2.55.0. archive.ubuntu.com `dists/resolute/main/
  binary-amd64/Packages.xz` (22:22:23Z): apt 3.2.0 `Depends: … gpgv …`, gpgv 2.4.8-4ubuntu3 Priority important; `gpg`
  comes with gnupg. (packages.ubuntu.com answered 500.) The unit job also runs on 26.04 (job 122502077308).
- **git**: 2.55.0 on the runner (above); locally 2.43.0, gpgv 2.4.4, gpg present (Ubuntu 24.04 container).

## 3. Every image reference
| Image | Where | Design rule (Dockerfile FROM, compose `services.*.image`) |
|---|---|---|
| `node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea` | `apps/web/Dockerfile:7`, `:24`; `apps/worker/Dockerfile:5`, `:23` | covered |
| `postgres:18-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` | `docker-compose.yml:8`; read from there by `tools/ci/postgres.sh:41` (`docker compose up`) and `tools/screening-capacity/containers.ts:205-228` (`composePostgresImage`, which already requires `postgres:<tag>@sha256:`) | covered (one line) |
| `moby/buildkit:v0.34.1@sha256:99368f3e46177c6405b9740e4461d91cee004128daeecca78d4ceac50ec1da5c` (setup-buildx `driver-opts: image=…`) | `ci.yml:673`, `release-capacity.yml:56`, `release-dry-run.yml:88`, `release.yml:79`, `screening-capacity.yml:165` | **not covered** |
| `jobs.*.container` | none; allowed by digest (`workflows.test.ts:2814-2820`) | not covered |
| `jobs.*.services` | none; refused (`workflows.test.ts:2719`) | n/a |
| `uses: docker://…` | refused by rule (a) (`workflows.ts:101`) | n/a |
| nested `docker://` in composites | skipped (`verify.ts:88, 100`), R6 | out of scope as designed |
| frozen `tools/test/frozen/publish-content.yml` | no image | n/a |

The only tracked image files are the two Dockerfiles and `docker-compose.yml` (`git ls-files`). `ghcr.io/…` in
release.yml and the dry run are our own outputs. Not images, noted: both Dockerfiles `ADD
https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` with no `--checksum` (`apps/web/Dockerfile:48`,
`apps/worker/Dockerfile:49`), and Trivy's DB pulled by tag (P2's area).

Hub, read 2026-10-27T22:23:12Z (`/v2/namespaces/<ns>/repositories/<repo>/tags/<tag>`): node `43b9…` tag_last_pushed
2026-10-21T17:39:11Z (images max 17:39:10Z); postgres `edb0…` 2026-10-21T19:08:32Z (images max 19:08:22Z); buildkit
v0.34.1 `99368f3e…` 2026-10-20T21:37:36Z (images max 21:36:33Z). All three tags still name the pins and are over three
days old, so P1's bootstrapping run would pass them today. Headers: `x-ratelimit-limit: 180`, `x-ratelimit-reset`
1793139853 = 22:24:13Z, about 60 s ahead.

How they are held today: Dockerfiles and compose, offline digest form (`workflows.test.ts:2777-2789`), Dependabot's
docker and docker-compose ecosystems in one `container-images` group with `default-days: 7` (`dependabot.yml:15-22,
88-108`), the rewrite (d); check-toolchain reads the Dockerfiles only for the pnpm install. The builder: offline form,
one value, buildx before every build (`workflows.test.ts:2791-2813`); `builderOf` (offline) and `checkBuilder`
(networked: tag equals digest, newer release warning). Nothing ages any image.

**Recommendation: widen.** The builder is the image a hand bump is the only way to move (Dependabot cannot rewrite
`driver-opts`, ADR 0066 `:444-452`; runbook `dependency-upgrades.md:228-240`), it builds the production images in
release.yml, and today a bump to a release pushed minutes ago passes as long as the tag names it. That is the exact
window P1 exists for. Best fit: age it in `buildkit.ts`, where the head and base builders are compared already
(`check.ts:123-124`) and the tag answer that carries `tag_last_pushed` and `images[].last_pushed` is already read
(`buildkit.ts:76-77`): when the builder is new against the base, the youngest of those must be at least the floor, else
fail on a pull request (warn on push) unless `image-age-exceptions.json` names it; the floor from `releaseAgeMinutes`,
replacing `BUILDKIT_AGE_MS`. The Hub-age logic (youngest time when the tag's digest is the pin; the tag search;
fail-closed messages; the rate-limit wait) lives once, in `tools/check-toolchain/images.ts`, and both callers use it,
with one exceptions list for every image. Also age a `jobs.*.container` image the same way (none today, allowed by
digest), so every image a workflow can run is either aged or refused.

## 4. Tests
- New tests go where the design says: `tools/check-action-pins/age.test.ts` (with `testdata/age/`), and
  `tools/check-toolchain/{images,exclude-window}.test.ts`; builder-age cases beside `buildkit.test.ts:44-77`; the B1 case
  beside `tree.test.ts:36-66`; the two new lists in "the committed lists" (`check.test.ts:544-551`).
- `tools/test/collection.test.ts`: `testsIn` `:20-26` (files directly in a directory, `.db.test.ts` excluded),
  `testsIn('tools/check-action-pins')` `:41`, `testsIn('tools/check-toolchain')` `:42` (also `testsIn('tools/ci')` `:43`
  and ci-browser's files `:45-46`). The new test files are collected with no edit; they must make temporary directories
  (and any GnuPG home) in `beforeAll` or in a test, never at module level (`:11-17`). `testdata/age/` holds no test file.
- Unit count now: run 40593100176's unit job 122502077308 (ubuntu-26.04, success): "Test Files 382 passed (382)", "Tests
  6352 passed | 1 skipped (6353)" (log tail, 22:19:06Z).
- Under the lock, 2026-10-27T22:24:20Z to 22:25:04Z: `pnpm exec vitest run --project unit tools/check-action-pins
  tools/check-toolchain tools/test` → Test Files 29 passed (29), Tests 358 passed (358), 40.59 s, exit 0, no failure.

## 5. Shared files
- **ADR 0066** (1,258 lines): Part 1 `:53`, Part 2 `:271` (Decision `:317`, action pins `:319-381`, images `:427-470`,
  the builder `:444-452`, release age `:527-589`, Measured `:626`, Revisit `:710`), Part 3 `:718` (After #42 `:838`),
  **Part 4 `:989-1258`, the last part**. There is a Part 4; Part 5 goes after `:1258`, and the header's Status
  (`:3-27`), Date (`:28`), Deciders (`:29-41`) and PRD sections (`:42-52`) each take a Part 5 line. Part 5 must also
  amend Part 1 `:120-121` ("no step calls GitHub") and Part 2's builder bullet (`:444-452`).
- **`docs/runbooks/dependency-upgrades.md`** (286 lines): "Base images and PostgreSQL" `:222-248` (builder bullet
  `:228-240`, which says "one value on all four" steps; there are five, `workflows.test.ts:2803` lists them), "Actions"
  `:279-286` (end of file). Also "The release age (F2 (b))" `:119`.
- **`docs/runbooks/ci.md`**: jobs table, static `:26`; "Reading a red gate": Action pins `:87-93`, Toolchain `:94-100`;
  "Dependabot's pull requests and runs" `:164`; local commands `:384-387`; "Changing CI", a new action `:397-399`.
- **`docs/product/reconciliation-001.md`** (657 lines): no P1 entry yet. The CI series `:141-146`; the co-founder's
  2026-10-26 ~00:20 UTC ruling (CQ1 to CQ3) `:653-657`, the natural place for P1's record (after `:657`).
- **`packages/compliance/src/controls.ts`**: `dependency_and_image_hygiene` `:252-268`; evidence `pnpm actions:check`
  `:261`, `pnpm toolchain:check` `:262`.
- **`docs/product/test-matrix.md`**: CI section `:250`, intro `:252-257` (ends "…join CI-20 once #42 has merged (Part 3,
  'After #42')."), CI-20 row `:280`, next section DBF `:282`.
- **`packages/synth/src/cases/matrix.ts`**: CI-20 `:420`, DBF-01 `:421`. **`registry.ts`**: CI-20 `:617`, group comments
  `:605`, `:610`, `:614`, the DBF comment `:618`.
- **LANES.md "Not while #42 is open"** (`/home/user/ops/LANES.md:84-91`): none of P1's files is listed. The shared
  documents (test-matrix, reconciliation-001, ADRs, the synth registry) follow rule 6 (`:93`).
- **#42** (GitHub MCP `pull_request_read`, about 22:25Z; `git ls-remote` 22:25:38Z): open, **draft**, head
  `co-001/pr-06b-mail-streams` 6f23c42b (2026-10-27T19:09:16Z), base e908c214 (`mergeable_state: behind`), 55 commits,
  **212 files** (the design says 143). With P1 it shares `test-matrix.md`, `reconciliation-001.md`, `matrix.ts`,
  `registry.ts` (positions 91, 92, 203, 204 of `git diff --name-only e908c214 6f23c42b`); it also changes
  `pnpm-lock.yaml` (205), which P1 does not touch. Its hunks (against e908c214): test-matrix `:178-214` (LED, SEC, SCR
  rows), reconciliation-001 an insert after `:640` (before the F1 to F7 block, `:641` at ecebdc90), matrix.ts after
  `:219`, `:327`, `:331`, registry.ts after `:362`, `:508`, `:518`. None touches the CI section, CI rows or the end of
  reconciliation-001, so the second to merge keeps both and runs `pnpm synth --all`.

## Changes the design needs
1. **Header (`:3-7`)** "every `tools/check-*` cite below is at that commit and is re-read when the branch is cut" → re-read
   at ecebdc90 (2026-10-27), cites as in §1 of this note. Evidence: `git diff --shortstat 19e3d98e ecebdc90`: check-action-pins 9 files,
   +642 −101; check-toolchain 8 files, +888 −65.
2. **Acceptance 1** "`check.ts:169`" → `tools/check-toolchain/check.ts:829` (`Math.max(minimumReleaseAge ?? 0,
   MINIMUM_RELEASE_AGE_MINUTES)`), with `gatesRule` refusing a lower setting at `:200-203`. Evidence: old `:169` is
   `gatesRule`'s read (`git show 19e3d98e:…/check.ts`).
3. **§3.1, retries**: "`network.ts:54-68`'s `withRetries`" → `network.ts:144-173`, which takes an `AbortSignal`;
   "`BACKOFF_MS` (`network.ts:35`)" → `:124`. Add: the rate-limit wait sleeps through `transport.sleep(ms, signal)` so a
   deadline stops it.
4. **§3.1, the age set**: "`baseState` (`base.ts:31-49`)" → `:30-49`; add "from `state.workflows`, which `check.ts:86-95`
   passes on only when `everyPin` is undefined". Improvement: age per commit, not per ref (cache/restore and cache/save
   share `55cc8345`), and report per ref.
5. **§3.1, `check.ts`**: "after the verify loop (`:71-89`) … push re-reads (`check.ts:90-103`)" → the age loop goes
   after the verify loop (`:101-119`) and the builder check (`:121-129`), before the push block (`:131-168`). New text:
   on a push its reads run under the push deadline (`PUSH_DEADLINE_MS`, `:27`; pool `:45-55`), and the pins still unread
   are one warning; on a pull request they run under a deadline too, and the unread pins are errors that name the host.
   Evidence: static's `timeout-minutes: 15` (`ci.yml:37`); one pin's worst case under C12 is about 510 s (a fetch at 3 ×
   30 s, plus two API reads at 3 × 30 s with two 60 s waits each), so two or more pins in an outage would hit the job
   timeout and name nothing.
6. **§3.1 and §4, the transport** "transport gains `fetchRefs`, `fetchSha` and `getJson`" → `Transport` is now
   `lsRemote`/`file`/`get`/`sleep` (`network.ts:21-33`), `gitTransport()` (`:45-120`) with a scratch directory and
   `close()` (`index.ts:11-14`). New text: extend `get` to take request headers (`Authorization`,
   `X-GitHub-Api-Version`, `Accept`) and return response headers (`Retry-After`, `x-ratelimit-*`), not a parallel
   `getJson`; `fetchRefs` and `fetchSha` live in `gitTransport`, in bare repositories of their own under its scratch
   (removed by `close()`), never the shallow `--depth=1 --filter=blob:none` ones `file()` makes (`:71-84`), whose shallow
   boundary would cut the history `merge-base --is-ancestor` walks; the recorded transport (`fixtures.ts:18-80`) gains
   headers per URL and refs/objects per repository and keeps `HANG`. And "into a temporary bare repository under
   `os.tmpdir()` (removed after)" → "under `gitTransport`'s scratch directory, removed by `close()`".
7. **§3.1, ci.yml** "(`:84-87` at 19e3d98e)" → `ci.yml:85-88` (env `:87`). Add: rewrite the comment at `ci.yml:13` ("no
   step calls the GitHub API") and `workflows.test.ts:1318`'s comment; Part 5 amends Part 1's `:120-121`; `permissions`
   stays `contents: read` (`:14-15`, test `:1319`). State in Part 5 that the token reaches the code that step loads
   (repository and `node_modules`; ADR 0063 `:300` records the same caution for approval-of-record) and that it can read
   nothing the full-history checkout does not already hold.
8. **§4, workflows.test.ts** "(the step's env asserted)" → split the shared loop at `:1396-1402` (`env` toEqual `{ BASE }`
   at `:1401`): `actions:check` `{ BASE, GITHUB_TOKEN: '${{ github.token }}' }`, `toolchain:check` `{ BASE }`. Any new
   assertion that reads a P1 file uses `repositoryRoot`, not `CI_ROOT` (`:82`), since the rewrite's copy holds only
   `.github`, the Dockerfiles and the compose file (`:2888`).
9. **§3.2, Hub reads** "through `registry.ts`'s retry (`:57-81`)" → `readJson` `:71-98`; add: a Hub 404 ("no such tag") is
   an answer with its own message, whereas `readJson` makes it a fail-closed network error (`:84-86`); the wait takes the
   headers from the response at `:79`.
10. **§3.2, `FILES`** "(`check.ts:40-48`)" → `:42-52` (now also `.npmrc`, `.pnpmfile.cjs`); "`dockerfileRule`
    (`check.ts:243`)" → `:387-414`. The `tree.ts` cites and B1 stand (file unchanged).
11. **§3.2 (new bullet) and acceptance 3, §2.2, CI-22, §4, §5: widen the image rule to the BuildKit builder** (and to any
    `jobs.*.container`). Text: "A builder new against the base (`check.ts:123-124`) is aged from the Hub tag answer
    `buildkit.ts` already reads (`:76-77`), the youngest of `tag_last_pushed` and `images[].last_pushed` when the digest
    is the pin, through `images.ts`'s Hub-age function, failing on a pull request and warning on a push, under
    `image-age-exceptions.json`; `BUILDKIT_AGE_MS` (`buildkit.ts:20`) gives way to `releaseAgeMinutes`." Evidence: five
    `driver-opts` copies (§3 table); Dependabot cannot move them (ADR 0066 `:444-452`); `checkBuilder` never ages the pin.
    §2.2's "(none today; ci-browser adds no image)" gains "the builder is a Docker Hub image in five workflow steps".
    Tests: in `buildkit.test.ts`, a new builder pushed 2 days ago fails, 3 days passes, and on a push it warns.
12. **§3.3** "`releaseAgeExcludeRule` (`check.ts:288-345`)" → `:489-547`. Add: the window applies only to entries the
    change adds or rewrites (`:499`, `:512`), as now; `excludeAdvisoryFindings` (`:467-487`) stays npm-only in
    `check.ts`; `ageWords` (`:135-137`) moves with `releaseAgeMinutes`; the floor's readers are four (npm, actions, images,
    the builder warning), plus P2. Improvement: for an action `security-fix`, check on CI, with the token, that the GHSA
    is GitHub's advisory against the base's version of that action (`GET /advisories/{ghsa_id}`), as N3 does for npm.
    (Not verified here; api.github.com answers 403.)
13. **§2.3, measured** → add a re-measure: 2026-10-27T22:23Z, Hub digests and push times unchanged, plus buildkit
    v0.34.1 `99368f3e…` at 2026-10-20T21:37:36Z; the workflows still hold 13 refs and 12 commits at ecebdc90 (same set as
    e908c214).
14. **C3** → "`static` runs on ubuntu-26.04 (`ci.yml:35`; run 40593100176's static job: Image ubuntu-26.04, Version
    20261012.163.1, git 2.55.0)"; `toolset-2604.json:130` re-read at runner-images 19874e7a (2026-10-27); resolute apt
    3.2.0 `Depends: gpgv` re-read 2026-10-27T22:22Z; the unit job, which runs the tests, is on 26.04 too.
15. **§5** "tests … need only `gpgv`" conflicts with "the committed key file's primary fingerprints … (`gpg --show-keys` in
    a temporary home)". New text: dearmor and compute the v4 fingerprints in TypeScript (SHA-1 over 0x99, the length and
    the public-key packet), the same code the push run's key-rotation comparison uses, so the tests need only `gpgv` and
    no GnuPG home (collection.test.ts `:11-17`). Add: the committed-lists test (`check.test.ts:544-551`) gains both new
    lists, empty; if `images.ts` adds an offline form rule, `checkOffline`'s rule list at `check.test.ts:559` changes.
16. **§5, acceptance 9** "the unit count rises by the new tests only" → name the baseline: 6352 passed and 1 skipped
    (6353) in 382 files (run 40593100176, unit job).
17. **§6, ADR** "Part 5 (after Part 4, `:626` at 19e3d98e)" → after Part 4 at `:989-1258` (end of file), with Part 5 lines
    in Status `:3-27`, Date `:28`, Deciders `:29-41`, PRD sections `:42-52`; it amends Part 1 `:120-121` and Part 2's
    builder text `:444-452`.
18. **§6, runbooks** "Actions" (`:204`) → `:279-286`; "Base images and PostgreSQL" (`:162`) → `:222-248`, and its builder
    bullet's "one value on all four" → five (release-capacity.yml; `workflows.test.ts:2803`). `ci.md` targets: `:26`,
    `:87-93`, `:94-100`, `:397-399`.
19. **§6, controls.ts** `:252` stands; the evidence lines to edit are `:261` and `:262`.
20. **§6, reconciliation-001** → no P1 entry exists; add it after `:657` (the CQ1 to CQ3 ruling), which keeps clear of
    #42's insert before `:641`.
21. **§7** → the intro is `test-matrix.md:252-257` (CI-21 to CI-23 follow its last sentence), rows after `:280`;
    `matrix.ts` after `:420`; `registry.ts` after `:617` under a group comment like `:605`, `:610`, `:614` ("The pins and
    images held to the release age (docs/adr/0066, Part 5)").
22. **§11** "`pr42-files.txt:85, 86, 136, 137` … #42's 143" → #42 at 6f23c42b (draft, 212 files, base e908c214): shared
    files at positions 91, 92, 203, 204; it now changes `pnpm-lock.yaml` too, which P1 does not touch; its hunks miss
    P1's regions (§5 above).
23. **§11, ci-browser** "ci-browser adds steps that use existing pins (setup-node) and no image" → still true (pins
    unchanged from e908c214; no new image); it did move 22 jobs, `static` among them, to ubuntu-26.04.

Proposals outside P1 (notes): (a) both Dockerfiles `ADD` the RDS CA bundle by URL with no `--checksum`
(`apps/web/Dockerfile:48`, `apps/worker/Dockerfile:49`): pin it with `ADD --checksum=sha256:…` and a refresh step. (b) A
new builder whose tag no longer names its digest is an error even on a push (`check.ts:124-125`, `buildkit.ts:74`):
align it with the push-warns convention when P1 edits `buildkit.ts` (borderline in scope). (c) Trivy's DB is pulled by
tag, which is P2's area.
