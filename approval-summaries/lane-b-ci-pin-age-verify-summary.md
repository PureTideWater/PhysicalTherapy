# P1 fresh-clone verification: ci-pin-age (#82), head 96758e44, 2026-10-28

Written 2026-10-28 from 07:37Z to 07:50Z by the fresh-clone verifier. This file is not committed.

- **Clone and install.** Blobless clone `/home/user/verify-p1`, detached at `96758e442dd01e2fb393ff6e9cac6f07e58a78c2`.
  `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile` exited 0. The clone has been removed.
- **Evidence.** Logs are in `/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/p1verify/logs/`,
  the CI static log in `…/p1verify/ci/static-122685084796.log`, and the progress record in
  `…/p1verify/progress/verify.progress.md`.
- **GitHub.** Read only, through the MCP read tools. Nothing was committed, pushed, commented, reviewed, approved or
  merged.

## Verdict

| Item | Verdict |
| --- | --- |
| 1. Code against the design (§14 to §16) and both reviews; scope | **PASS** |
| 2. Local runs at 96758e44 under the lock | **PASS** |
| 3. CI on 96758e44 | **PASS** |
| 4. The description against the code and CI | **FAIL**: the description still describes 03e18576 as the head. Eleven corrections are listed below |

Nothing in the code or in CI blocks the merge. Only the description has to change.

## 1. Code against the design and the reviews: PASS

### Scope

`git diff --stat 56ed6279 96758e44` is 55 files, +7,079 −280 (GitHub's PR stats agree). 96758e44 itself changes 2
files, +12 −9: `tools/check-toolchain/tree.ts` and `images.test.ts`.

- **Forbidden paths.** No migration, no `package.json`, no `pnpm-lock.yaml`, no `pnpm-workspace.yaml`. Nothing under
  `apps/`, `infra/` or `content/`, and no `.github/dependabot.yml`.
- **`packages/` files.** Only three change, each named by the design:
  - `packages/compliance/src/controls.ts`: the two evidence strings, §6;
  - `packages/synth/src/cases/matrix.ts` and `registry.ts`: CI-21 to CI-23, §7.
- **Workflows.** The only change is the Action pins step's `env` gaining `GITHUB_TOKEN: "${{ github.token }}"`, plus
  comments: `ci.yml:13` and the five setup-buildx comments. Permissions stay `contents: read`. No pin and no image
  changes.
- **#42.** #42's head is now 46974a25 (pushed 02:13Z, 217 files). It shares exactly four files with P1, all rule-6
  documents: `reconciliation-001.md`, `test-matrix.md`, synth `matrix.ts` and `registry.ts`.
- **Trial merges** with `git merge-tree`: 96758e44 + #42, base 83d71fd6 + #42, and base 83d71fd6 + 96758e44 all
  merge cleanly.
- **Model names.** No added line names a model.

### Spot checks of the riskiest fixes

- **The BuildKit reader and its fail-closed scan** (SEC-S1, SEC-S2):
  - `readDockerfile` (`images.ts:872`) strips a BOM and reads directives with `DirectiveParser`. It reads heredocs with
    `heredocsOf` and continuations with `continuationOf`/`trimContinuation`.
  - After parsing, every raw line matching `^\s*FROM` must be a parsed FROM. Every non-comment `from=` must belong to a
    parsed COPY or RUN, an ONBUILD trigger included. Anything else is refused (`:903-918`). A JSON Dockerfile is
    refused, and so is any parse that BuildKit's grammar refuses.
  - CI-13 reads through the same function (`workflows.test.ts:13, :2844`) and refuses "no FROM" (`:2846`).
  - Tests:
    - `images.test.ts:556`: an `it.each` over the reviewer's five inputs, plus a FROM split by a continuation;
    - `:566`: the fail-closed refusals;
    - `:593`: ONBUILD and CSV mounts;
    - `:602`: the frontend forms;
    - `:620`: the build inputs;
    - `workflows.test.ts:2862`: five Dockerfiles that the old line-by-line read passed.
  - **The differential, re-run here** against 96758e44's committed reader, using the fix round's harness and BuildKit
    outputs (`logs/differential.log`, 07:42:51Z to 07:42:58Z):
    - 23,037 inputs in all: 37 corpus files and 23,000 generated.
    - BuildKit refuses 19,160 of them. The reader also refuses 19,155 of those.
    - The other 5 fail in BuildKit only. Four are files with no instruction ("go error only"); they name no image, and
      CI-13 refuses them. One is an ENV error, which `compare.py` excuses by design.
    - The reader refuses nothing that BuildKit parses (0 reader-only failures).
    - The 3,877 files that BuildKit parses agree on every instruction's line, command, flags and arguments.
    - The frontend agrees throughout.
    - This is the fix round's own result (its log ran at 7f3d8cbb plus uncommitted edits), now reproduced on the
      committed code. It is narrower than the description's sentence; see correction 3.
- **The revert path** (CI-S3, and 96758e44's time handling):
  - `buildBranchHistory` (`tree.ts:146`) runs `git log --first-parent --diff-merges=first-parent --format=%H %ct -G<hex>`
    on `origin/claude/build-platform` (`BUILD_BRANCH`, fixed, not BASE). It keeps commits at or behind the merge base
    (`merge-base --is-ancestor`) that still name the digest (`git grep -F`). It writes
    `new Date(seconds * 1000).toISOString()`, with seconds limited to at most 12 digits, so no RangeError is possible.
  - `imageRule` checks the history before the registry test and before any Docker Hub read (`images.ts:1452-1458`), so
    it applies to any registry.
  - The case at `images.test.ts:309` covers four outcomes:
    - a digest named 3+ days ago passes with no Hub read;
    - a digest named under 3 days ago fails;
    - a side-branch commit dated by its author is never taken, only the merge commit's time counts;
    - a digest never named returns null.
  - **Red and green.**
    - CI on 03e18576 (run 40647891389, unit job 122680868647, git 2.55.0) failed only `images.test.ts:342`: expected
      `+00:00`, received `Z`.
    - Locally the red is `ci-git-time-red.log` (07:13:24Z) and the green `ci-git-time-green.log` (32 files, 451).
    - CI on 96758e44 passes on a unit runner whose post-job step reports git 2.56.0. Local git is 2.43.0. The fix is
      therefore shown on three git versions.
- **The push-run warnings** (CI-S4):
  - On a push, a failed read is a warning for every ref, whether or not the base already ran it (`check.ts:197`). So
    is a moved tag (`:184-186`), and so are refs the deadline left unread (`:204-210`).
  - A problem in what was read stays an error: anything that is not a `NetworkError`, an unparsable `action.yml`
    included.
  - Test: `check.test.ts:334`.
- **The token's single step and its asserts** (CI-S1, SEC-N2):
  - `ci.yml` names `github.token` once, at `:91`, in Action pins' `env`. The Toolchain step's env is `{ BASE }` alone.
  - `tokenProblems` (`workflows.test.ts:1329`):
    - counts `/\bgithub\s*\.\s*token\b/gi`, which must match exactly once;
    - finds the holders from each step's lower-cased JSON, and they must be `["Action pins"]`;
    - forbids `secrets.`/`secrets[`, `github[`, `github.*`, `join(github` and `tojson(github|secrets)`, in any case;
    - refuses any expression that names the whole `github` context.
  - The negative case (`:1366`) gives the Toolchain step the token in seven spellings, and each one is refused.
- **The exclude kinds:**
  - Actions: `security-fix` (a GHSA, checked on CI), `age-unprovable` and `off-default-branch` (`age.ts:66, :650-700`).
    Each waives one requirement, and the floor still holds by every time read.
    - Tests: `age.test.ts:227`, `:708`, `:734`, `:748`, `:762` and `:792`.
  - Images: `imageAgeExceptionsSchema` (`policy.ts`).
    - `security-fix` takes a GHSA or CVE id and requires `fixes`.
    - `age-unprovable` takes `advisory: null`.
    - A Hub digest found on no tag passes under no kind.
    - Tests: `images.test.ts:388`, `:414` and `:483`.

### Every other finding, with its test

| Finding | Test |
| --- | --- |
| CI-S2 | `tree.test.ts:152` |
| CI-N1, SEC-N3 | `age.test.ts:488`, `:546` |
| CI-N2 | `images.test.ts:433` |
| CI-N3 | `images.test.ts:458` |
| CI-N4 | `check.test.ts:181` (`CHECKER_FILE`/`AGE_FILE`/`AGE_EXCEPTIONS` in `base.ts:21-23`) |
| CI-N5 | the five workflow comments |
| CI-N6 | `ci.md:413-416` |
| CI-N7 | `age.test.ts:505` |
| SEC-S3 | `check.test.ts:161` (`base.ts` `ls-tree` without `-r`, top level only) |
| SEC-S4 | `verify.test.ts:187` (`runsAs`, lower-cased) |
| SEC-N1 | `images.test.ts:535` |
| SEC-N4 | `age.test.ts:380`, `check.test.ts:193`, `verify.test.ts:359` (`childEnv`) |
| The builder's rate-limit wait | `buildkit.test.ts:95` |
| The `READ_DEADLINE_MS` seam | `age.test.ts:630` (`AGE_DEADLINE_MS` is gone) |

Every merge-commit cite in §16 and the description is an ancestor of 96758e44: fe9af0ec, 9d576b26, 54610150,
e9ec332e, c10011b6, 7e816ed4, 1b794873, 137aed85, 10995d73, 5f06218a, 4ef198ef, 70c3376b, edbc928e, 0e2cc6dc and
0dda631d.

**Counts.** The scoped run at the merge base 56ed6279 is 29 files and 358 tests (`logs/vitest-at-mergebase.log`). At
96758e44 it is 32 and 451. So P1 adds 3 files and 93 tests: the build's 62 and the fix round's 31.

## 2. Local runs at 96758e44, under the lock: PASS

Run between 07:38:12Z and 07:42:31Z. Local tools: Node 24, pnpm 10.34.8, git 2.43.0.

| Command | Result |
| --- | --- |
| `pnpm exec vitest run --project unit tools/check-action-pins tools/check-toolchain tools/test` | 32 files, 451 passed (as expected) |
| `pnpm typecheck` | passed, 22 projects, 67.1 s wall |
| `pnpm lint` | passed, 1,657 files in 3 groups, 0 errors, 0 warnings |
| `pnpm actions:check --offline` | exit 0 |
| `BASE=origin/claude/build-platform pnpm actions:check` | exit 0. Bootstrapping, because merge base 56ed6279 lacks `age.ts`. All 13 refs verified; the builder's tag is its index `99368f3e…`, with no newer release three days old. 12 commits aged, each on its default branch with its tag naming it and web-flow VALIDSIG by `968479A1…`. The API reads were skipped locally, with a note |
| `BASE=origin/claude/build-platform pnpm toolchain:check` | 0 errors, 0 warnings: "images: no image is new against the base, so nothing is read (3 digests named, each one in the base)" |
| `actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown' .github/workflows/*.yml` (1.7.7) | exit 0, no output |
| `pnpm synth --all`, then `git status --porcelain` | 257 cases: 0 written, 649 unchanged, 0 removed (EMR: 16 unchanged). Status clean, 0 lines |

## 3. CI on 96758e44: PASS

**Check runs.** All 25 are green, apart from two skipped by design:

- **ci, run 40649212144:** static, lint, unit, db 1/4 to 4/4, domain model, build, images, e2e 1/2 and 2/2, and all
  green: every one success.
- **screening-capacity, run 40649212134:** changes, capacity (07:19:37Z to 07:35:44Z) and screening-capacity gate:
  success. notify: skipped.
- **mutation, run 40649212125:** changes and mutation: success ("No money path changed: no mutation run."). stryker:
  skipped.
- **release-dry-run, run 40649212209:** build (web), build (worker), capacity and push: success.
- **approval-of-record, run 40649212149:** success.

**Unit (job 122685084628).** 404 files, 6,893 passed, 1 skipped (6,894).

- The pull_request merge ref is b9669bbf, "Merge 96758e44 into 83d71fd6", taken from the static checkout log.
- Base 83d71fd6's own push run (40646308313, unit job 122675823570) counts 401 files and 6,800 + 1 (6,801).
- 401 + 3 = 404 and 6,800 + 93 = 6,893, matching exactly. The 93 is 62 + 31.

**Earlier counts this verification also confirmed:**
- 56ed6279's push unit job 122652834138: 394 files, 6,573 + 1.
- 03e18576's run 40647891389: 403 of 404 files passed, 1 failed, 6,892 passed, 1 skipped (6,894). The only failure
  was CI-S3's history case.

**Static (job 122685084796).** ubuntu-26.04 20261012.163.1, git 2.55.0. The token permissions were "Contents: read" and
"Metadata: read".

- **"Action pins."** Its env was `BASE: origin/claude/build-platform` and `GITHUB_TOKEN: ***`. That token is on this
  step only; Toolchain's env has no token.
  - "every pin is read: this change edits tools/check-action-pins"; all 13 refs verified.
  - Builder: "its tag is the index sha256:99368f3e…" and "no newer release is three days old".
  - Bootstrapping note: "the merge base 83d71fd62c6d has no tools/check-action-pins/age.ts, so every pin is aged".
  - 12 age blocks for 13 refs (`actions/cache/restore` and `actions/cache/save` share one).
  - Every block reads:
    - on its default branch (main or master);
    - its tag names it;
    - committer and author dates, plus the tagger date for trivy-action and action-setup;
    - a web-flow signature by key `968479A1AFF927E37D1A566BB5690EEEBB952194`;
    - `verified_at` with reason valid, 0 to 4 s after the committer time;
    - the release's `published_at`, with immutable true for 8 (attest, setup-node, setup-python, trivy, build-push,
      login, setup-buildx, action-setup) and false for 4 (cache, checkout, download-artifact, upload-artifact);
    - the arrival read: "no push brought the pin onto <branch> since 2026-10-25T07:19:05.231Z (1 entries read)".
  - The youngest signal in every block is the release's `published_at`. The youngest pin is login-action at 4.66
    days, old enough from 2026-10-26T15:22:45Z.
  - The step ends: "every action is pinned to its release's commit, and every pin new against the base is old
    enough."
- **"Toolchain."** It compares with 83d71fd6 as a pull request. Every rule is ok, including "images: no image is new
  against the base, so nothing is read (3 digests named, each one in the base)". Result: 0 errors, 0 warnings.

**Images, capacity and the dry run** are all green, as listed above.

## 4. The description: FAIL (corrections needed)

**What holds:**
- **Template sections.** All are present and in order: What changes, Why, What it does not change (all six lines
  answered), Checks with the `<!-- required-checks -->` markers and their exact text, Reviewer agents' findings,
  Freeze exception, Domain model, and The founder's approval, verbatim.
- **Footer.** It carries both required attribution lines.
- **Reviewer table.** It is complete: all 11 CI findings and all 8 SEC findings, each with its commit, plus the
  security reviewer's proposal and the integrator's three.
- **Code claims.** Every claim about the code checked here holds, except the differential sentence (correction 3).
- **Other numbers.** The build's "50 files, +4,993 −218 against 0dd1ba7e" holds, as do §13's 19, §15's 30, §16's
  19 + 3, 39 commits, and 1,657 lint files and 22 typecheck projects. b574d4e8's CI table matches the security
  review's reading.

**What does not hold.** The description still treats 03e18576 as the head:
- It never mentions 96758e44 or the git-time failure.
- It says the suite "needed no fix".
- Its CI section still expects 03e18576's run, with an expected count (397 files, 6,666) that CI's moved base made
  wrong in any case.
- It gives 03e18576's diff stat.
- It overstates the differential.
- It still reports a #42 trial-merge conflict that no longer exists.

Each item below gives the current text and then the corrected text.

## Description corrections

1. **What changes, Integrator list, last bullet.**
   - Current: "The full local suite needed no fix: every step passed at `03e18576`, which is the pushed head."
   - Corrected: "The full local suite passed once at `03e18576` (local git 2.43). CI's unit job on `03e18576` (run
     40647891389, job 122680868647) then failed one case, CI-S3's history test (`images.test.ts:342`): the runner's
     git 2.55 prints `%cI`'s UTC as `Z`, where the local git 2.43 prints `+00:00`. **`96758e44`** (CI-S3) reads the
     commit time as epoch seconds (`%ct`) and writes it as ISO 8601 in UTC (`toISOString()`), so it no longer depends
     on git's version. It was red first locally on `03e18576`'s `tree.ts` (07:13:24Z). Green: `tools/check-toolchain`,
     `tools/check-action-pins` and `tools/test`, 32 files and 451 tests; typecheck and eslint clean. `96758e44` is the
     pushed head."

2. **What changes, F1 list, "The revert path" bullet.**
   - Current: "… is old enough by that commit's committer time, with no Docker Hub read; the message names the commit.
     No new exclude kind."
   - Corrected: "… is old enough by that commit's committer time, with no Docker Hub read. The time is read as epoch
     seconds and written in UTC (`96758e44`), so it reads the same on every git version. The message names the
     commit. No new exclude kind."

3. **What changes, F1 list, "The Dockerfile reader" bullet, last sentence.**
   - Current: "Against BuildKit's own parser on 23,037 inputs (its 37 test Dockerfiles and generated ones),
     instructions, flags, arguments, parse failures and the frontend agree."
   - Corrected: "Against BuildKit's own parser on 23,037 inputs (its 37 test Dockerfiles and 23,000 generated ones):
     the 3,877 that BuildKit parses agree in every instruction's line, command, flags and arguments. BuildKit refuses
     19,160, and the reader refuses 19,155 of them. The other 5 are four files with no instruction (CI-13 refuses a
     Dockerfile with no FROM) and one ENV error, and none names an image. The reader refuses nothing BuildKit parses,
     and the frontend agrees throughout. The fresh-clone verifier re-ran it against `96758e44`'s reader with the same
     result."

4. **What changes, "In all" line.**
   - Current: "In all, 55 files change, +7,076 −280 against the merge base 56ed6279 (the build: 50 files, +4,993 −218
     against 0dd1ba7e)."
   - Corrected: "In all, 55 files change, +7,079 −280 against the merge base 56ed6279 (the build: 50 files, +4,993
     −218 against 0dd1ba7e; the git-time fix, 2 files, +12 −9)."

5. **Checks, after the table "The full local suite, once, at `03e18576`".** Add (the template asks for each command
   run on the head commit):
   "**At the head, `96758e44`** (the git-time fix):
   - The build ran the scoped unit run (32 files, 451 passed; 29 and 358 at 56ed6279), `pnpm typecheck` and eslint,
     all clean.
   - The fresh-clone verifier ran every command below at `96758e44` (07:38Z to 07:43Z), and every one passed:

   | Command | Result |
   | --- | --- |
   | scoped unit run | 32 files, 451 passed |
   | `pnpm typecheck` | 22 projects |
   | `pnpm lint` | 1,657 files, 0 errors, 0 warnings |
   | `pnpm actions:check --offline` | exit 0 |
   | `BASE=origin/claude/build-platform pnpm actions:check` | exit 0: bootstrapping against 56ed6279, 12 commits aged, web-flow VALIDSIG on all 12 |
   | `BASE=origin/claude/build-platform pnpm toolchain:check` | 0 errors, 0 warnings; no image new |
   | actionlint 1.7.7 | exit 0 |
   | `pnpm synth --all` | 0 written, 649 unchanged; status clean |"

6. **Checks table, "pre-push" row.**
   - Current: "| pre-push (fixture check, gitleaks 8.24.3) | 22 commits checked; no secret |"
   - Corrected: "| pre-push of `03e18576` (fixture check, gitleaks 8.24.3) | 22 commits checked; no secret |". Then add a
     row for the push of `96758e44` (03e18576..96758e44, 1 commit) with its own pre-push result. The verifier found no
     log of that push under `scratchpad/p1fix/logs`, so the session should fill the result in from its own record.

7. **Checks, "Failing first (the fix round)".**
   - Current sentence: "Every behaviour fix's test ran red against b574d4e8's code for what it tests, then green; …"
   - Corrected: "Every behaviour fix's test ran red against b574d4e8's code for what it tests, then green (the git-time
     fix against 03e18576's); …"
   - Add a table row: "| CI-S3's time (`96758e44`) | the history case expecting `toISOString`'s form fails on
     `03e18576`'s `tree.ts` (local git 2.43 prints `+00:00`; CI's 2.55 failed the old expectation with `Z`) | passes
     with git 2.43 locally and on CI (unit job 122685084628, its runner on git 2.56.0) |"

8. **Checks, "The new head's run".**
   - Current: "**The new head's run** (`03e18576`) is recorded when it has run. It should show: unit **397 files,
     6,666 passed and 1 skipped** (base 56ed6279's push run 40639109816, unit job 122652834138: 394 files, 6,573 + 1;
     plus P1's 3 files and 62 tests and the fix round's 31: F1 16, F2 12, the integrator 3); "Action pins"
     bootstrapping again (56ed6279 lacks `age.ts`), with the 12 blocks; "Toolchain" with no image new against the
     base; `mutation` with no shard; `capacity` (watched paths change)."
   - Corrected: replace the whole paragraph with the two below.

   "**CI on `03e18576`** (run 40647891389; base 83d71fd6 by then, after #78 merged at 06:50Z) was red on one case.
   Unit job 122680868647: 403 of 404 files, 6,892 passed, 1 failed, 1 skipped (6,894). The failure was CI-S3's history
   test (`images.test.ts:342`), whose expected `+00:00` the runner's git 2.55 prints as `Z`. Every other job was
   green. `96758e44` fixes it."

   "**CI on `96758e44`** (the head; merge ref b9669bbf onto base 83d71fd6, #78): every check is green.
   - **The runs:**
     - ci (run 40649212144): static, lint, unit, db 1/4 to 4/4, domain model, build, images, e2e 1/2 and 2/2, all
       green;
     - screening-capacity (run 40649212134): `capacity` 07:19:37Z to 07:35:44Z and the gate; notify skipped;
     - mutation (run 40649212125): "No money path changed: no mutation run.", stryker skipped;
     - release-dry-run (run 40649212209): build (web), build (worker), capacity and push;
     - approval-of-record (run 40649212149).
   - **unit** (job 122685084628): **404 files, 6,893 passed, 1 skipped (6,894)**. That is base 83d71fd6's 401 files
     and 6,800 + 1 (push run 40646308313, unit job 122675823570) plus P1's 3 files and 93 tests (the build's 62 and
     the fix round's 31: F1 16, F2 12, the integrator 3).
   - **"Action pins"** (static job 122685084796):
     - every pin read ("this change edits tools/check-action-pins");
     - the builder's tag is its index `99368f3e…`, with no newer release three days old;
     - the bootstrapping note (merge base 83d71fd62c6d lacks `age.ts`);
     - the 12 blocks, with the same `verified_at` (reason valid), `published_at` and `immutable` as on b574d4e8;
     - the youngest signal in each block is the release's `published_at`, and the youngest pin is login-action at
       4.66 days;
     - the arrival read gives "no push brought the pin onto <branch> since 2026-10-25T07:19:05.231Z (1 entries read)"
       for all 12.
   - **"Toolchain"**: "images: no image is new against the base, so nothing is read (3 digests named, each one in the
     base)", then 0 errors and 0 warnings."

9. **Checks, "#42 (rule 6)" paragraph.**
   - Current: "… a trial merge conflicts only in ADR 0062, not a file of this branch. Whichever merges second keeps
     both sides and runs `pnpm synth --all`."
   - Corrected: "… a trial merge with #42's head 46974a25 has no conflict, and neither has a trial merge of either
     branch with base 83d71fd6 (`git merge-tree`, 2026-10-28 about 07:46Z). Whichever merges second keeps both sides and
     runs `pnpm synth --all`."

10. **Deviations, "The base moved" bullet.**
    - Current: "**The base moved** to 56ed6279 (#81) after the task named 165c5993; it is merged with no conflict."
    - Corrected: "**The base moved** to 56ed6279 (#81) after the task named 165c5993; it is merged with no conflict.
      Since then it has moved to 83d71fd6 (#78, 06:50Z). CI's merge ref ran on it, and a trial merge has no conflict.
      It is merged in at merge time, after the merge hold (until #75 merges or 11:00 UTC)."

11. **What changes, the fix round's first paragraph.**
    - Current: "… the integrator merged both (`--no-ff`), wired the seam, fixed the rest, merged the build branch and
      ran the full local suite once."
    - Corrected: "… the integrator merged both (`--no-ff`), wired the seam, fixed the rest, merged the build branch
      and ran the full local suite once (at `03e18576`); CI then caught one git-version difference, fixed in
      `96758e44`."

## Observations outside the description (no action needed for the merge)

- **The design is stale on the pushed head.** §16 still says "Pushed head: 03e18576…" and "CI on it is recorded when
  it has run" (design lines 1327-1329). It does not record 96758e44 or 03e18576's red unit job.
- **The fix-round summary has the same overstatement** as correction 3. It says "23,037 inputs agree with BuildKit's
  own".
- **The unit runner's git version differs from static's.** The unit job on 96758e44 ran on a runner whose post-job
  step reports git 2.56.0; static's reports 2.55.0. The fix makes the difference harmless.
- **GitHub reports `mergeable_state: behind`.** That is expected under the merge hold. Base 83d71fd6 merges cleanly.
