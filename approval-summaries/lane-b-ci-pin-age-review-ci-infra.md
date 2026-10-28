# P1 review: CI and test infrastructure (ci-pin-age, draft PR #82)

Written 2026-10-28 between 03:27Z and 03:50Z by the adversarial reviewer for CI and test infrastructure. This file is
not committed. The review covers head `b574d4e8…` on `co-001/ci-pin-age`, diffed against `0dd1ba7e…`, with CI read on
that head merged with `165c5993…`.

I worked in a fresh blobless clone at `/home/user/review-p1-ci-infra`, installed with `--frozen-lockfile` and every
heavy command run under `/tmp/laneb-heavy.lock`. I used two temporary worktrees for the red commits, and all three
are now removed. GitHub was read through the MCP read tools only. Nothing was pushed, commented, reviewed or approved.

Hashes are shortened to 8 hex digits and an ellipsis. The logs are in
`/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/p1build/logs/rev-ci-*`, each
with its command and UTC times.

## Verdict

**0 B, 4 S, 7 N.** Nothing blocks the merge.

- **Pull requests.** No pull request that adds no pin and no digest can turn red, with one exception: S2, a tracked
  file whose name only looks like a Dockerfile or compose file.
- **Push runs.** No push run of such a change can turn red, with one exception: N1, a narrow race in the arrival read
  that crashes the step.
- **Counts.** All the counts hold.
- **Red commits.** Both red commits are red on behaviour, and I reproduced each run.
- **Static.** The static job on the head printed every reading the design asks for.

The four S findings are cheap to fix inside P1's files:
- **S1.** The token asserts can be bypassed.
- **S2.** The image-file rule refuses names that are not image files.
- **S3.** An image revert can be blocked for good.
- **S4.** A push of a new pin still turns red on an outage. This is E16's explicit choice, but it contradicts the
  reasoning the code gives for every other push finding.

## Findings

### S1. The token asserts are case-sensitive, but Actions expressions are not

**Where:** `tools/test/workflows.test.ts:1328-1331`, which holds E8 and S8.

**Scenario:** A step anywhere in `ci.yml` gets one of these:
- `env: { T: "${{ GITHUB.TOKEN }}" }`;
- `${{ Secrets.GITHUB_TOKEN }}`;
- `${{ ToJSON(GitHub) }}`;
- `${{ join(github.*, ',') }}`.

Each one hands the job's token to that step, and every assert still passes:
- `text.match(/github\.token/g)` still counts 1;
- the step loop matches `'github.token'` exactly, so it still finds only "Action pins";
- `/secrets\.|github\[|toJSON\(\s*(?:github|secrets)\b/` matches none of them.

The ADR (Part 5, "The token") and `ci.md` ("Changing CI") say this test is what stops the token spreading.

**Evidence:**
- actions/runner at `4197182e…`, read 2026-10-28T03:35Z. Named values and functions are looked up with
  `StringComparer.OrdinalIgnoreCase` (`src/Sdk/DTExpressions2/Expressions2/ExpressionParser.cs:426-427`).
  `GitHubContext : DictionaryContextData` (`src/Runner.Worker/GitHubContext.cs:7`), whose key lookup is also
  `OrdinalIgnoreCase` (`DictionaryContextData.cs:77`).
- I ran the test's own regexes with node over a step holding the four forms. They printed `github.token count: 1`
  and `forbidden regex matches: false`.

**Fix:**
- Count `/\bgithub\s*\.\s*token\b/gi` and require exactly 1.
- Lower-case the step JSON before the `includes` check.
- Forbid `/\bsecrets\s*[.[]|\bgithub\s*\[|\bgithub\s*\.\s*\*|\btojson\s*\(\s*(?:github|secrets)\b/i`.
- Add one negative case: a copy of `ci.yml` with `GITHUB.TOKEN` on a second step must fail. The rewrite harness
  already runs these asserts on a copy.

### S2. `isImageFile` refuses ordinary files whose names start with "dockerfile", "containerfile" or "compose"

**Where:** `tools/check-toolchain/tree.ts:58-62`.

**Scenario:** A pull request that adds no image adds one of these, all plausible names:
- `tools/check-toolchain/dockerfile.ts` (`dockerfileRule` pulled out of `check.ts` as `images.ts` was);
- `docs/runbooks/dockerfiles.md`;
- `docs/containerfile-notes.md`;
- a content file `compose-email.yml`.

Each is then refused in two places:
- the "Toolchain" step fails with "an image file outside apps/<name>/Dockerfile and docker-compose.yml …; remove it";
- the unit job fails too, because check-toolchain's `check.test.ts` holds the real tree to every offline rule.

**Evidence:** I ran `pnpm exec tsx` with `isImageFile` on those four names, and each returned `true`. The
`Dockerfile.dev` and `apps/web/Dockerfile` cases behave as intended.

**Fix:** Match Docker's own names and nothing else, case-insensitively:
- `Dockerfile` or `Containerfile`, alone, with `.<suffix>`, or as `<x>.Dockerfile`;
- `compose.y?ml`, `docker-compose.y?ml` and their `.override`/`-<x>` variants.

Exclude source and document extensions (`.ts .tsx .js .mjs .cjs .json .md .txt .snap`), or confirm a candidate by
its content: a `FROM` instruction, or a top-level `services:`. Then add these names as passing cases to the S6 test.

### S3. Reverting an images bump can be blocked with no way through

**Where:**
- `tools/check-toolchain/images.ts:404-426` (the search, then `nowhere`);
- `images.ts:525-535` ("no exclude clears that");
- `listProblems` `:339-345`.

**Scenario:**
1. Dependabot's `container-images` pull request moves `node` from D_old to D_new and is merged.
2. D_new breaks something, and a person opens the exact revert, back to D_old.
3. D_old is not in the base, so it is read. Its tag now names D_new or later.
4. The rule searches the 500 most recently updated tags. Docker's official images rebuild a version tag when their
   Debian base updates, so after a rebuild nothing carries D_old.
5. The pull request then fails with "no exclude clears that: pin a tag's current digest". By B1/E15 no kind clears
   it, not even `security-fix`.

The exact image the repository ran until yesterday cannot come back. The only way through is a different digest,
which is not the rollback. Design §9 lists what each update meets but never considers a revert.

**Evidence:** Docker Hub at 2026-10-28T03:34:00Z:
- `24-trixie-slim` moved to `f2fb6134…`, pushed 2026-10-28T02:38:52Z.
- `43b9ba11…` (ours) is now carried only by `lts-trixie-slim`, `krypton-trixie-slim`, `24.22.1-trixie-slim` and
  `24.22-trixie-slim`.
- Page 5 of the search ends at 2026-06-24.

So a digest survives only on its version tags until they are rebuilt. The rule's own test asserts the refusal: "clears
a Docker Hub digest found on no tag under no entry, security-fix included".

**Fix (recommended):** Treat a digest that the base's first-parent history named in a tracked image file as old
enough when that commit is at least the floor old. A digest is pushed before any commit can name it, so the committer
time of the build-branch commit that first named it is a safe upper bound on its push time. This is one
`git log --first-parent -G<digest> --format=%H %cI <mergeBase> -- apps/*/Dockerfile docker-compose.yml
.github/workflows` per fresh digest, with no new exclude kind. Add one `images.test.ts` case.

### S4. On a push, a pin new against the previous head still turns the build branch red on an outage

**Where:** `tools/check-action-pins/check.ts:168-169` and `:180`. The case at `check.test.ts:303-306` asserts it.

**Scenario:** A Dependabot actions pull request bumps `docker/login-action`, passes and is merged. On the merge push:
- the new ref is not in `ran`;
- a github.com failure in its tag or `action.yml` read (three tries) is an error;
- so is leaving it unread at the 120 s verify deadline.

`claude/build-platform` goes red, every lane is blocked, and the fix is a re-run. In the same step, the same pin's age
faults and the builder's faults only warn on a push (`age.ts:829`, `buildkit.ts:86`), and so does an image's failed
read (`images.ts:464`). The reason the code gives for warning applies to the verify loop's new refs as well: "the pull
request was the gate and a red build branch blocks every lane" (`check.ts:18-21`). Direct pushes are blocked by the
ruleset (`ci.yml` range-step comment).

This is not a regression. Before P1 every push fault was an error and the loop had no deadline. But it is the one red
path left on a push run, and E16 kept it on purpose.

**Fix:** On a push, make read faults, moved tags and deadline leftovers warnings for every ref, and keep "a problem in
what was read" an error. Change the one assertion at `check.test.ts:306` and the ADR sentence in "A push warns". If the
session prefers E16 as written, record why a new ref differs from a new pin's age.

### N1. The arrival read can throw, and on a push that crashes the step

**Where:** `tools/check-action-pins/age.ts:375-378` and `:425`, together with `network.ts:230-239`.

**Scenario:** `carriesPin` calls `transport.object()` outside any `try`. The real `object()` catches only
`git cat-file -t`. The second spawn, `git cat-file <type>`, rejects when the shared 180 s deadline aborts it, or at its
30 s limit. If the deadline fires during that spawn for an activity entry inside the window, the rejection escapes in
this order:
1. `arrival`;
2. `readFacts`;
3. `pool`'s `Promise.all`;
4. `ageRule`;
5. `checkActionPins`;
6. the top-level await in `index.ts`.

The step then exits 1 with a stack trace, on a push as well. The arrival read is meant to be best effort and only ever
a note (E12). The recorded transport's `object()` never rejects (`fixtures.ts:146-151`), so no test can reach this path.

**Evidence:** `scratchpad/p1build/review-ext/arrival-throw.mts` (synthetic) calls `ageRule` with `push: true` and a
recorded transport whose `object()` rejects with `ABORT_ERR` for the entry's `after`. It printed `ageRule REJECTED on a
push run: The operation was aborted`.

The window is narrow: a few milliseconds per entry, and only when the deadline expires. That is why this is N.

**Fix:**
- Wrap `carriesPin`'s object read with `.catch(() => undefined)`, or the loop body in a `try` that returns an
  "activity: not read" note.
- Let the recorded `object()` take an `Error`, and add a case.

### N2. The image deadline message always says 180 s

**Where:** `images.ts:561`, which the test enshrines at `images.test.ts:350-352` ("(180 s)" from a 20 ms signal). The
integrator noted it too.

**Fix:** Name the caller's deadline or leave the number out, and correct the test.

### N3. On a push, image exclude-window problems are errors; action ones are warnings

**Where:** `images.ts:587`.

**Scenario:** A pull request adds a `security-fix` image entry. Its window bound uses `known`, the digest's push time
read on that run. If the tag moved between the pull request and the merge push, the search can return a younger
carrier on the push. "expires … before the digest is three days old" is then an error on the build branch. The ADR
says "On a push every image age finding is a warning". The action rule turns every finding into a warning on a push
(`age.ts:829`).

**Fix:** Use the event's level (`age`) for window problems on a push, as `age.ts` does.

### N4. The bootstrapping marker is named in two places, and nothing checks it exists

**Where:** `base.ts:52` hardcodes `${CHECKER_DIR}/age.ts`, and `age.ts:33` has its own `AGE_FILE`.

**Scenario:** A later refactor renames `age.ts` and updates only `AGE_FILE`, or neither. No merge base then holds the
marker, so every later pull request bootstraps: it ages every pin, raises errors on any young or unprovable one and
costs about 50 API calls. Nothing notices.

**Fix:**
- Have `base.ts` take the path from one constant (moving `AGE_FILE` there avoids the import).
- Add a unit assert that `AGE_FILE` exists at the head.

### N5. The builder comments in the workflows are now incomplete

**Where:** `ci.yml:672-674` and the same comment in `release.yml:74`, `release-dry-run.yml:83`,
`release-capacity.yml:52` and `screening-capacity.yml:161`.

The comments still say only that check-action-pins warns about a newer release. The builder's own age is now held by
check-toolchain's image rule. The runbook says so; these five comments do not.

### N6. `ci.md` says the age rule reads Docker Hub

**Where:** `docs/runbooks/ci.md:410`.

It says "Locally the age rule reads git, `gpgv` and Docker Hub". The age rule reads no Docker Hub; the builder check
and check-toolchain do.

### N7. A force push upstream makes every pin of that repository young

**Where:** `age.ts:425`.

An activity entry whose `before` the fetch does not hold counts as an arrival. A force push of an upstream's default
branch inside the window (`before` is the rewritten head) therefore makes every pin of that repository "young". A
Dependabot actions pull request is then red until the window passes. The result is stricter, not unsafe.

**Fix (optional):** `fetchSha(before)` before deciding, so an arrival is only claimed when `before` is held and lacks
the pin.

## What I checked and found sound

### Counts

- **CI.** The unit job on the head (job 122611334567) has 395 files and 6,627 passed with 1 skipped. The base's push
  run (unit job 122607512954 of run 40624946717) has 392 and 6,565 + 1. The difference is P1's 3 files and 62 tests
  exactly.
- **Scoped run.** I re-ran `vitest --project unit tools/check-action-pins tools/check-toolchain tools/test` at the
  head: 32 files and 420 passed, at 03:30:32Z (`rev-ci-scoped-head.log`).
- **Per file.** The `it(` counts, base against head, match 14.5: `age.test.ts` 29, `images.test.ts` 17,
  `exclude-window.test.ts` 4, `tree.test.ts` +2, `registry.test.ts` +3, check-action-pins `check.test.ts` +3,
  `buildkit.test.ts` +1, `verify.test.ts` +2 and `workflows.test.ts` +1. That makes 62.
- **Local full run.** The 386 / 6,480 + 1 on `0dd1ba7e…` is the integrator's log; I did not re-run the full suite.

### Failing first

I reproduced both red runs in worktrees.

| Commit | Run | Result |
| --- | --- | --- |
| 280f6616… | check-toolchain project (`rev-ci-red-c2.log`) | 6 files, 4 failed and 44 passed; every failure an `AssertionError` (the 2 ★ image cases and `tree.test.ts`'s 2) |
| ca824962… | scoped run (`rev-ci-red-c4.log`) | 31 files, 12 failed and 359 passed; every failure an `AssertionError` |

Every ★ case imports only modules that existed before its commit (`images.test.ts`: `./check` and `./registry`, types
only; `age.test.ts`: `./check` and `./fixtures`), so each is red on behaviour and none on a missing import. The weakest
red is the base-pin ★, which is red only because its note is new (accepted in N13). It also asserts zero `fetchRefs`
and API reads for all three variants.

### CI on the head

Every check of #82 is green: e2e 1/2 and 2/2, and capacity (job 122611394961, finished 03:37:22Z). The static job
(122611334491) ran 03:20:32Z to 03:23:55Z, 203 s against 900. Its log is saved as `rev-ci-static-122611334491.txt`.

What "Action pins" printed, from 03:20:58Z to 03:21:17.7Z (19.7 s):
- the bootstrapping note ("the merge base 165c59932a26 has no tools/check-action-pins/age.ts");
- "every pin is read: this change edits tools/check-action-pins", with 13 refs verified;
- the builder: its tag is the index `99368f3e…`, and no newer release is three days old;
- 12 age blocks. Each says it is on its default branch, its tag names it, and its web-flow signature is by `968479A1…`.

My own extraction of the 12 blocks matches the integrator's table field for field:

| Pin | `verified_at` (reason) | Release `published_at` | `immutable` |
| --- | --- | --- | --- |
| attest-build-provenance v4.2.2 | 2026-08-06T19:54:09Z (valid) | 2026-08-06T19:59:04Z | true |
| cache v6.1.0 | 2026-06-23T20:30:29Z (valid) | 2026-06-26T19:17:06Z | false |
| checkout v7.0.1 | 2026-07-17T18:45:11Z (valid) | 2026-07-20T15:10:05Z | false |
| download-artifact v8.0.2 | 2026-10-07T10:00:58Z (valid) | 2026-10-07T10:09:51Z | false |
| setup-node v7.1.0 | 2026-10-08T02:43:27Z (valid) | 2026-10-08T02:52:34Z | true |
| setup-python v7.1.0 | 2026-10-22T02:33:06Z (valid) | 2026-10-22T02:56:04Z | true |
| upload-artifact v7.0.2 | 2026-10-07T10:00:52Z (valid) | 2026-10-07T10:08:14Z | false |
| trivy-action v0.36.0 | 2026-04-22T09:20:49Z (valid) | 2026-04-22T09:39:33Z | true |
| build-push-action v7.4.0 | 2026-09-15T07:29:04Z (valid) | 2026-09-15T08:22:01Z | true |
| login-action v4.7.0 | 2026-10-23T15:11:41Z (valid) | 2026-10-23T15:22:45Z | true |
| setup-buildx-action v4.4.1 | 2026-09-16T07:47:46Z (valid) | 2026-09-16T07:50:21Z | true |
| pnpm/action-setup v6.1.0 | 2026-09-04T23:42:41Z (valid) | 2026-09-05T07:31:28Z | true |

Every pin's youngest time is its release's `published_at`, and the youngest of those is login-action's, at 4.50 days.
The arrival read answered 200 for all 12 with "activity: no push brought the pin onto <branch> since
2026-10-25T03:21:12.792Z (1 entries read)". So the job's token does read another owner's `/activity`.

"Toolchain" printed "images: no image is new against the base, so nothing is read (3 digests named, each one in the
base)". It then printed `passed, 0 error(s), 0 warning(s)`.

### Red paths for a change that adds no pin and no digest

I traced each check against the code; none of these has a red path:
- **Age set.** It is empty whenever the merge base has `age.ts`; it never bootstraps after the merge.
- **Builder.** Its newness comes from `state.workflows`, and its faults warn when it is not new or on a push.
- **Excludes.** Window checks apply only to entries the change adds; expiry is an error only on a pull request that
  edits the list.
- **Missing token.** It is an error only when commits are aged or entries exist.
- **Images.** No Hub read is made, and the rule is the same on every event.
- **Push re-reads.** A moved or unreadable tag is a warning, under 120 s.
- **Verify loop on a push.** For refs the base ran, faults and moved tags warn, under 120 s.
- **The merge's own push.** Base `165c5993…` lacks `age.ts`, so it bootstraps with warnings only, and the verify loop
  re-reads 13 refs, all of them in `ran`.

The only exceptions found are S2's file names and N1's race.

### Deadlines and timeouts

On a push, P1's limits add up to 120 + 180 + 120 + 180 = 600 s. With the 181 to 183 s the other steps took, that is
inside the 900 s of `timeout-minutes: 15`.
- In the age path, every read takes the shared signal: git through `execFile`'s signal, `gpgv`, `withRetries` and its
  sleeps, the arrival read, the advisory read and the rotation read.
- `cacheGates` (`verify.ts:174`) reads without a signal, but only keys that `nestedProblems` already cached under the
  signal, a rejection included. So it is bounded in practice.
- On CI the slowest single case of `age.test.ts` was under the listing threshold (6,217 ms for all 29). Locally the
  slowest was 880 ms, and check-action-pins `check.test.ts` 425 ms. The 30 s per-case limit is ample, and
  `check.test.ts` does not need it.

### The recorded transports against the real answers

- **Hub.** `registry.test.ts` uses Docker Hub's real shapes: the tag fields; a 404 with `httperror 404`; a page with
  `count`, `next` as a URL and `results`; `x-ratelimit-reset` in epoch seconds; `Retry-After` in seconds and as a
  date. The live headers here were `x-ratelimit-limit: 180` and a reset about 60 s ahead.
- **GitHub API.**
  - The age tests model 3xx answers with `Location`, 403 with `x-ratelimit-remaining: 0`, and 429 with `Retry-After`.
  - `Link` paging is held to the API's origin.
  - The verification and release bodies match what CI returned: `reason` "valid", `immutable` true or false.
- **Git.** `verify.test.ts` drives the real `gitTransport` against a local origin with `uploadpack.allowFilter`, so
  the `--filter=tree:0` promisor path, ancestry, objects and `fetchSha` are exercised. In this run the unit job had
  git 2.56.0 and static had 2.55.0, while the runner image was rolling out.
- **gpgv.** The tests use real `gpgv` with make.sh's synthetic keys, and a stuck shell script stands in for a hang.
  The `VALIDSIG` field positions match the CI output.
- **The gap:** the recorded `object()` cannot reject (N1).

### `workflows.test.ts` and the rewrite copy

- The split step loop expects `{ BASE, GITHUB_TOKEN }` and `{ BASE }`.
- The new asserts read `CI_ROOT`, so the simulated Dependabot rewrite runs them on its copy. That copy's case took
  19.7 s on CI and passed.
- The only gap is S1.

### Documents against the code

The runbooks, ADR Part 5 and `ci.md` match the code on these points:
- the youngest-of signals;
- what each exclude kind waives;
- the 180 s and 120 s deadlines;
- the push behaviour (except N3);
- the refused references, `docker/bake-action` included.

Two notes:
- **The pins, on CI.** ADR Part 5's section of that name still says only what it will record, with no readings. It
  needs the table above before the pull request is ready; that is the integrator's item 1, and the data is confirmed
  here.
- **Test matrix and synth.** CI-21 to CI-23 and their synth entries list the right test files. The three
  `expected.json` files follow the CI-19 and CI-20 precedent, and CI's clean-status step passed.

### Dependabot

**The actions pull request.** dependabot-core at `510dd5e8…` (read 03:37Z) dates an action's cooldown by:
1. the release's `published_at`;
2. else the tag's `creatordate`;
3. else the commit date.

The source is `common/lib/dependabot/git_cooldown_date_resolver.rb:15, :43`. Its seven days therefore fall on the same
`published_at` that P1 reads, and the runbook's "passes on honest dates" holds. It can trip only on:
- a younger tagger date;
- an arrival on the default branch;
- a late `verified_at`;
- N7.

**The images pull request.** It will offer `f2fb6134…`, which Hub pushed 2026-10-28T02:38:52Z. P1's floor clears it
from 2026-10-31T02:38:52Z, and Dependabot's seven-day cooldown holds it back until about 2026-11-04.

### Merging

- **Into the base.** P1 merges with `165c5993…` with no conflict (`git merge-tree`).
- **With #42.** #42 (`6f23c42b…`) conflicts only in ADR 0062, which is not P1's. None of #42's 212 files is an image
  file, a workflow or a checker file, so P1's new rules do not trip on it.

### Hygiene

- All 11 commits end with the two required trailer lines.
- No model name appears in the diff.

## Proposals outside P1 (not built)

- **The gitleaks download.** `tools/gitleaks/install.sh:53` downloads with `curl --retry 3` and no `--max-time` or
  `--connect-timeout`. In a github.com outage, static then times out on that step whatever P1's deadlines do. Add
  `--connect-timeout 10 --max-time 120`.
- **The rotation read.** It (`https://github.com/web-flow.gpg`) is unproven live: it answers 403 here (03:39:54Z), and
  only a push makes it. Read the merge push run's "web-flow" note. If GitHub publishes a set other than the committed
  two keys, every push that ages a pin will warn.
