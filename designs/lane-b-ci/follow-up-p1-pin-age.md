# P1: action pins and image digests held to the three-day floor (`co-001/ci-pin-age`)

Lane B, after ci-deps (§3.2) and ci-browser (§3.3) merge; cut from `claude/build-platform` then. Written against
6ddd587 plus both designs, and against what the ci-deps builders had written by `co-001/ci-deps` 19e3d98e
(2026-10-26T01:48Z, still moving; every `tools/check-*` cite below is at that commit and is re-read when the branch is
cut). ADR 0066 Part 5; test-matrix CI-21 to CI-23 (all three used). No migration: it changes `tools/`, one `ci.yml`
step's `env`, and documents. Folded with its review on 2026-10-26 (§13).

Rulings it rests on: F2 (b), the three-day release age with a dated, exact, seven-day exclude (ruled); CQ1 (a), actions
and images keep Dependabot's `default-days: 7`; the co-founder's 2026-10-26 ~00:20 UTC ruling (every choice the
recommended one, for security the safer), under which P1 itself is taken (lane-b-ci.md §3.2.6, "P1 ... Recommended
yes"). Every engineering choice below is pre-approved under Q3 and listed in §10 with its reason.

## 1. Goal and acceptance

Goal: nothing a workflow runs, and no base or service image, enters the build branch until its commit or push is three
days old by a time GitHub or Docker Hub recorded, and an action's commit sits on its repository's default branch, unless
an exclude records why, dated and exact, as F2 (b) does for npm versions. Today only npm versions are held
(`check-toolchain`'s lockfile rule, §3.2.1); an action pin or a digest bumped by hand can run a release published
minutes ago, inside the window the floor exists for (a hijacked tag is usually found within hours:
tj-actions/changed-files, March 2025; trivy-action's tags, CVE-2026-33634, March 2026).

**What it does not bound (the residual, stated in ADR Part 5 and §12 R7).** P1 measures a commit's age, not when a tag
came to name it, because no interface exposes the latter (C4), except for an immutable release, whose `published_at` is
exactly that time (§2.1). An attacker who can push to the upstream default branch can land a commit there, wait three
days, then move a mutable tag to it; P1 passes that pin. The default-branch rule (§3.1) makes the commit sit in the
watched history for the whole three days, which is what the floor buys.

Acceptance (measurable):
1. A pull request that adds an `owner/repo@<sha>` absent from the base's workflows fails `static`'s "Action pins" step
   when that commit's age, measured as in §2, is under the floor (`pnpm-workspace.yaml`'s `minimumReleaseAge`, read as
   check-toolchain reads it, `check.ts:169`, never under `MINIMUM_RELEASE_AGE_MINUTES`), naming the pin, every time
   read with its source, the instant it becomes old enough, and the remedy. At or over the floor it passes.
2. The same pull request fails when the pinned commit is not an ancestor of the upstream repository's default branch
   ("not on <branch>"), or when the pin's tag no longer names the pinned commit ("tag moved", both SHAs).
3. A pull request that adds an image digest absent from the base's Dockerfiles and `docker-compose.yml` fails
   "Toolchain" on the same floor, measured from Docker Hub's push time.
4. A pin or digest already in the base, in its workflows, Dockerfiles or compose file, never makes a read for its age
   and never fails on it, on any event.
5. A live, exact, dated exclude passes the pin or digest. For `security-fix`, F2 (b)'s window: time + floor ≤ expiry ≤
   added + 7 days. For `age-unprovable` and `off-default-branch`: added ≤ now, expiry ≤ added + 7 days, a reason, and
   no advisory.
6. On CI, a pin whose commit has no time GitHub recorded (§2.1) fails closed ("age unprovable"), unless an exclude of
   that kind names it.
7. On a `push` run every age finding is a `::warning::`; the pull request is the gate.
8. Today's pins and digests all pass (§2.3); P1's own pull request ages every pin and digest (§3.1, bootstrapping), so
   its CI run is the live proof on GitHub's runners, including the API reads this session cannot make.
9. `pnpm test`, `pnpm lint`, `pnpm typecheck` and CI green; the unit count rises by the new tests only.

## 2. How age is measured

### 2.1 Actions: the candidates

| Signal | Who sets it | Readable here | On CI | Taken |
|---|---|---|---|---|
| Commit committer/author date | the commit's author (`git commit --date`, `GIT_COMMITTER_DATE`) | yes, blobless fetch | yes | in the youngest-of only |
| Annotated tag's tagger date, counted only while the tag names the pin | the tagger | yes, same fetch | yes | in the youngest-of only |
| GitHub web-flow signature time | GitHub's signer, when GitHub creates the commit; key `968479A1AFF927E37D1A566BB5690EEEBB952194` from 2024-01-16, and `5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23` (rsa2048, 2017-08-16, expired 2024-01-16T20:00:00Z) before it | yes: `gpgv` with both public keys | yes | in the youngest-of; GitHub-recorded **locally only** (S4: it equals the committer time to the second in all 12, so it is not proven to be GitHub's clock) |
| `commit.verification.verified_at` (REST `GET /repos/{o}/{r}/commits/{sha}`; required, nullable in the `verification` schema) | GitHub, when it first verifies a signed commit; for commits before persistent verification, at the next verification (`about-commit-signature-verification.md:54`) | no: api.github.com answers 403 here (2026-10-26) | yes, `GITHUB_TOKEN` | **GitHub-recorded** |
| Release `published_at` and `immutable` (REST `GET /repos/{o}/{r}/releases/tags/{tag}`) | GitHub, when the release is published; an immutable release's tag "is locked to a specific commit, cannot be changed, and cannot be deleted" (`immutable-releases.md:22`) | no (403) | yes | in the youngest-of; **GitHub-recorded** when `immutable` is true |
| Tag ref's first appearance | no API returns it (the Events API keeps 30 days and 300 events, `content/rest/activity/events.md:38`) | no | no | not available |
| Dependabot's cooldown | dependabot-core 7c06280: release `published_at`, else `git for-each-ref %(creatordate)` (`common/lib/dependabot/git_cooldown_date_resolver.rb:15, 45-54`); no date means **not** in cooldown (`github_actions/.../latest_version_finder.rb:376-377`) | n/a | n/a | not reused: fails open, and prefers the one date a moved tag keeps old |

**Decision: age = now − the youngest of every signal read, and a GitHub-recorded signal must exist.** On CI that is a
non-null `verified_at`, or an immutable release's `published_at`; a signed commit whose `verified_at` is null or absent
fails closed as "age unprovable" rather than falling back to the signature (S4). Locally, where the API is not read, a
web-flow `VALIDSIG` stands in, and the result is a local reading that CI re-checks. A forged date can only lose to a
younger one in the youngest-of. A mutable release's `published_at` stays with the release when its tag is moved, so it
can make a pin younger but never proves it old; an immutable release's cannot be detached from its commit, so it is the
tag-binding time the floor is about.

**Late `verified_at` (fact, not risk).** For a commit made before persistent verification (November 2024), GitHub
creates the record "the next time the commit's signature is verified" (`about-commit-signature-verification.md:54`),
which P1's own read can be. Such a commit reads as 0 days old on its first CI run and passes three days later. When
`verified_at` is the youngest signal and lies more than the floor after every other signal, the message says so and
names the remedy: re-run the check after the instant it prints. No exclude kind is needed; none of today's 12 is
affected (all are 2026 commits).

What the rule closes: a tag moved to a fresh commit (signed now, or `verified_at` now, or unsigned and unprovable); a
tag moved to an old commit outside the default branch, including one made in a fork, whose verification record is
shared across the network (`:68`) (the default-branch rule); a tag moved between the verify loop's read and the age
read (the tag-names-pin assertion). What it does not close is §1's residual.

### 2.2 Images: the candidates

| Signal | Who sets it | Taken |
|---|---|---|
| Docker Hub `tag_last_pushed` / `last_updated`, and each `images[].last_pushed` (`GET https://hub.docker.com/v2/namespaces/<ns>/repositories/<repo>/tags/<tag>`) | Docker Hub, at push | **yes**, the youngest of them, when the tag's `digest` equals the pin |
| Image config `created` | the builder (docker-library sets it from `SOURCE_DATE_EPOCH`) | no: settable, and a registry GET (`registry-1.docker.io`) answered 429 here on 2026-10-26 |
| Dependabot's cooldown | the same Hub field when Hub's digest matches, otherwise none and the cooldown is skipped (`docker/lib/dependabot/docker/update_checker.rb:476-540, 1113-1131`) | same source, but P1 fails closed where Dependabot fails open |

A re-push only makes `tag_last_pushed` younger, so it errs in the safe direction. When the tag no longer names the
pinned digest, the check lists the repository's tags (`…/tags?page_size=100&ordering=last_updated`, at most 5 pages) for
one that does, and takes that tag's youngest time. That rarely helps: on 2026-10-26 `43b9…` is on only
`lts-trixie-slim` and `krypton-trixie-slim` among node's first 100 of 9,233 tags, and a page covers about 9 hours of
pushes. The expected outcome for a superseded digest is therefore the fail-closed message naming the tag's current
digest, its push time, and the instant that digest turns old enough. Only a digest new against the base is read (B1
fix, §3.2), so this meets only the pull request that changes the digest. A registry other than Docker Hub has no
publisher-proof source, so its image is "age unprovable" (none today; ci-browser adds no image).

### 2.3 Measured today (2026-10-26)

A blobless fetch of each repository's branches and the pinned tag (`git fetch --filter=tree:0 --no-tags <url>
'+refs/heads/*:refs/heads/*' +refs/tags/vX:refs/tags/vX`, 0.8 to 1.2 s and 0.6 to 1.6 MB each, measured in
`scratchpad/p1fold/`), then `gpgv --status-fd 1 --keyring <dearmored web-flow keys>` on the commit's `gpgsig` and its
payload. All 12 pinned commits (13 refs; lane-b-ci.md §3.2.1's table) are ancestors of their repository's default
branch. Each has committer `GitHub <noreply@github.com>` and `VALIDSIG 968479A1AFF927E37D1A566BB5690EEEBB952194`; the
signature time equals the committer time to the second in all 12. The signature times are 2026-10-23T15:11:41Z for login
v4.7.0 (three days old from 2026-10-26T15:11:41Z, which ci-deps already waits for), 2026-10-22 for setup-python v7.1.0,
and 2026-10-08 or earlier for the rest. The keys came from `keyserver.ubuntu.com`; github.com/web-flow.gpg is refused
here, and CI compares fingerprint sets with it (§3.1). Two tags are annotated (pnpm/action-setup, signed by
`649E4D4AF74E7DEC`; trivy-action, SSH-signed); a depth-1 fetch of one transfers two objects, tag and commit. Their tagger
dates are 7.7 hours and 9 minutes after their commits' signatures, so they are the youngest signal for those two and are
still months old. `verified_at`, `published_at` and `immutable` cannot be read here (403); P1's CI run prints them for
all 12. Hub: `node:24-trixie-slim` → `43b9ba11…`, `tag_last_pushed` 2026-10-21T17:39:11Z; `postgres:18-trixie` →
`edb0c08d…`, 2026-10-21T19:08:32Z. Nothing trips today.

## 3. What changes

### 3.1 `tools/check-action-pins`: the age rule
- `age.ts` (new). For each ref in the **age set** (below), one blobless fetch into a temporary bare repository under
  `os.tmpdir()` (removed after): the upstream's branches and the pin's tag, unpeeled (§2.3's command). Then:
  1. `refs/tags/<v>^{commit}` must equal the pin, or "tag moved", naming both SHAs. The tagger date counts only then.
  2. The pin must be an ancestor of the default branch (`git ls-remote --symref <url> HEAD`, then `git merge-base
     --is-ancestor`), or "not on <branch>", fail closed, unless an `off-default-branch` exclude names it. If the pin is
     absent from the fetch, it is fetched by SHA (`git fetch --depth=1 --filter=tree:0 <url> <sha>`) only to say
     whether GitHub serves it at all.
  3. The signals of §2.1 are read from the pinned commit itself, never from whatever the tag names. The web-flow
     signature is checked with `gpgv` against `github-web-flow.asc` (new, armored, both keys, dearmored in memory to a
     temporary keyring, since gpgv refuses an armored one). A `VALIDSIG` counts when its primary fingerprint is the
     current key; one from the 2017 key counts only when gpgv also reports `EXPKEYSIG` and the signature's creation
     time is before 2024-01-16T20:00:00Z. An SSH or X.509 signature, or another key, gives no signal.
  4. When `GITHUB_ACTIONS=true`, it reads `verified_at`, and `published_at` with `immutable`, with `GITHUB_TOKEN`
     (`X-GitHub-Api-Version: 2022-11-28`). A 404 on the release is an answer: no release. Locally the two API reads are
     skipped with a note, since CI can only be stricter. A missing `gpgv` fails closed.
  Every read takes three tries and fails closed, naming the host (`network.ts:54-68`'s `withRetries`). A rate-limit
  answer (429, or 403 with `Retry-After` or `x-ratelimit-remaining: 0`) waits for `Retry-After` or the reset, capped at
  60 s, before the next try, instead of the 2 s and 5 s of `BACKOFF_MS` (`network.ts:35`).
- **The age set**: refs in the head's workflows that appear in no workflow of the merge base, read through the same
  `baseState` (`base.ts:31-49`), not `selectPins`' `verify` set (`base.ts:60-67`), which also holds pins whose inputs
  changed. With no `BASE`, every ref is aged (local runs). **Bootstrapping**: when the merge base has no
  `tools/check-action-pins/age.ts`, every ref is aged, so P1's own pull request proves the rule on CI. A later edit
  of the checker does **not** age every pin, so an unchanged pin can never fail. When the age set is empty, the age loop
  notes "age: no pin new against the base, nothing read".
- `check.ts`: after the verify loop (`:71-89`), the age loop. On `push` (the set new against the previous head, which a
  green pull request already passed), every age finding is a `::warning::`, as ci-deps' push re-reads are
  (`check.ts:90-103`; check-toolchain's "A push run follows a green pull request, so it warns", `check.ts:53-54`), so an
  outage, a rate limit or a moved tag cannot turn the build branch red. ci-deps' own verify-loop errors are unchanged.
- `age-exceptions.json` (new): `{ pin: "owner/repo@<40 hex>", version: "vX.Y.Z", kind: "security-fix" |
  "age-unprovable" | "off-default-branch", advisory: "GHSA-…" | "CVE-…" | null, reason, added, expires }`. Each entry is
  exact, with no patterns. The version must equal the pin's comment. `security-fix` needs an advisory; the other two take
  `null` and a reason. `age-unprovable` is refused when the pin's age is in fact known, and `off-default-branch` when
  the pin is on the default branch, so neither can stand in for a young pin's advisory. The windows are acceptance 5's.
- On push runs, a networked read of https://github.com/web-flow.gpg gives a `::warning::` when its set of primary
  fingerprints differs from the committed file's (a key rotation). It never fails a run.
- `ci.yml`'s "Action pins" step (`:84-87` at 19e3d98e) gains `GITHUB_TOKEN: ${{ github.token }}` in its `env`. The
  job's `contents: read` suffices for public repositories, and Dependabot's runs get a read-only token too. Rate: two
  calls per new pin, against 1,000 an hour per repository (github/docs
  `data/reusables/rest-api/primary-rate-limit-github-token-in-actions.md`).

### 3.2 `tools/check-toolchain`: the image rule
- `tree.ts`: `readTreeAt` (`:51-57`) reads the base's Dockerfiles too, as `readWorkingTree` (`:44-47`) does for the
  head: `git ls-tree --name-only <commit> apps/`, then `apps/<name>/Dockerfile` for each entry that holds one, mirroring
  `dockerfilePaths` (`:32-41`). Without this, `Tree.dockerfiles` is undefined for the base and every pull request would
  age both Dockerfile digests and turn red whenever Hub moves `node` (review B1). `FILES` (`check.ts:40-48`) gains
  `docker-compose.yml` and `image-age-exceptions.json`.
- `images.ts` (new), a rule in `checkToolchain` beside `dockerfileRule` (`check.ts:243`). It reads every `FROM` of the
  Dockerfiles and `docker-compose.yml`'s `services.*.image`, at head and at base. The age set: digests the base names
  in none of its Dockerfiles or compose file; every digest when the base has no `image-age-exceptions.json`
  (bootstrapping). Each must be `name:tag@sha256:<64 hex>`, since a tagless digest has nothing to ask Hub. Hub reads go
  through `registry.ts`'s retry (`:57-81`), naming `hub.docker.com`, which gains the same rate-limit wait as §3.1
  (Hub answers `x-ratelimit-limit: 180` with `x-ratelimit-reset` 60 s ahead, measured 2026-10-26T02:00Z). On `push`
  its findings are warnings, as in §3.1.
- `image-age-exceptions.json` (new): `{ image, kind: "security-fix" | "age-unprovable", advisory, reason, added,
  expires }`, under the same rules. A base image's security fix is usually a CVE, so CVE ids are accepted.

### 3.3 One exclude window and one floor for all three lists
`exclude-window.ts` (new, in `tools/check-toolchain`) takes the window and expiry logic out of
`releaseAgeExcludeRule` (`check.ts:288-345`): for `security-fix`, an `added` in the future, expiry more than seven days
after `added`, or expiry before the known time + floor, is refused; for the reasoned kinds, an `added` in the future or
an expiry more than seven days after `added`. The expired rule is shared: an error on a pull request that edits the
list, a `::warning::` elsewhere. It also exports `releaseAgeMinutes(workspace)`, the floor check-toolchain already
reads (`check.ts:169`), so the npm rule, the action rule, the image rule and P2's Trivy floor cannot drift. An entry
naming a pin or digest no longer used is a warning, which the weekly triage removes.

## 4. Files
- New: `tools/check-action-pins/{age.ts,age.test.ts,github-web-flow.asc,age-exceptions.json}`,
  `tools/check-action-pins/testdata/age/` (§5's synthetic keys and objects, with `make.sh`, the script that made them),
  `tools/check-toolchain/{images.ts,images.test.ts,exclude-window.ts,exclude-window.test.ts,image-age-exceptions.json}`.
- Changed: `tools/check-action-pins/{check.ts,network.ts,fixtures.ts,index.ts}` (transport gains `fetchRefs`,
  `fetchSha` and `getJson`, and the rate-limit wait; the recorded transport records them and their pauses);
  `tools/check-toolchain/{check.ts,index.ts,tree.ts,registry.ts}`; `tools/check-toolchain/{check.test.ts,tree.test.ts}`
  (window cases move to `exclude-window.test.ts`; `readTreeAt`'s Dockerfiles); `.github/workflows/ci.yml` (one `env`
  key and the step comment); `tools/test/workflows.test.ts` (the step's env asserted).
- Not changed: `tools/test/collection.test.ts`, whose `testsIn('tools/check-action-pins')` and
  `testsIn('tools/check-toolchain')` (`:20-26, 41-42`) already collect the new test files.
- Documents and registries: §6.
- Not touched: any lockfile or manifest (no dependency; `gpgv` is the runner's), the engine, migrations,
  `watched-paths.txt`, and every file in #42's list except the shared documents in §11.

## 5. Tests (failing first)
Commit 1 holds the cases marked ★, red against the unchanged checkers. Commit 2 makes them pass. Every network answer
is recorded and synthetic, with made-up owners. Signatures are real but synthetic: `testdata/age/make.sh` was run once
with a throwaway `GNUPGHOME`, made two test keys (one with an expiry in the past, signing under
`--faked-system-time`) and the signed commit and tag objects, exported only the public keys, and was then deleted with
`gpgconf --homedir … --kill all`. The objects' SHAs are their real hashes. Tests inject the test fingerprints, the old
key's expiry instant and `now`, and need only `gpgv`; a missing `gpgv` fails with the install hint. No GitHub key
material is used in tests, no private key is committed, and the files pass the fixture check and gitleaks at push.

`age.test.ts`:
- ★ a new pin whose signed commit is 2 days old fails, naming the time, its source and when it turns old enough; the
  same at the floor + 1 s passes; the floor follows `minimumReleaseAge`;
- ★ unsigned commit dated 2020, no `verified_at`: "age unprovable", fails;
- ★ CI mode: a valid web-flow signature with `verified_at: null` fails as unprovable (S4);
- ★ the pin is not an ancestor of the default branch: "not on main", fails; an `off-default-branch` exclude passes it;
- ★ the tag names another commit: "tag moved" with both SHAs, and the tagger date is not counted;
- youngest wins: a 10-day-old signature with a 1-day tagger date fails, and so does a 1-day `published_at` (CI mode);
- an immutable release published 1 day ago on a 30-day-old commit fails; one published 5 days ago on an unsigned commit
  passes on CI, and the run prints `immutable`;
- `verified_at` 20 days after every other signal and 1 day old fails, and the message names the re-run instant;
- keys: a signature by an unknown test key gives no signal; a signature by the expired test key dated before its expiry
  counts, and one dated after does not;
- CI mode: `verified_at` 1 day fails, and 5 days passes; three failed API reads fail closed, naming `api.github.com`; a
  429 with `Retry-After: 30` records a 30 s pause, and `x-ratelimit-reset` 90 s ahead records 60 s; in local mode no API
  read is made;
- ★ a pin present in the base with a 1-day commit prints "age: no pin new against the base, nothing read" and passes
  (also when the change edits the checker); a new step on an existing ref makes no age read;
- push: a young new pin is a warning, not an error; the key-rotation warning compares fingerprint sets, so a file with
  the same keys in another order or armor does not warn;
- bootstrapping: a base without `age.ts` ages every pin;
- excludes: a live `security-fix` passes with a note; a missing advisory, a pattern, a version mismatch, an expiry
  before time + floor or after added + 7 days each fail; `age-unprovable` on a provably dated pin, or
  `off-default-branch` on a pin on the default branch, fails; for both, `added` tomorrow or an expiry at added + 8 days
  fails; an expired entry fails a pull request that edits the list and warns elsewhere; an entry for an unused pin warns;
- the committed key file's primary fingerprints are exactly `968479A1AFF927E37D1A566BB5690EEEBB952194` and
  `5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23` (`gpg --show-keys` in a temporary home).

`images.test.ts`: ★ a new digest pushed 2 days ago fails and one pushed 3 days ago passes; ★ a base and head whose
Dockerfiles hold the same digest, with a recorded Hub that would answer "superseded", make zero Hub reads and pass;
changing one Dockerfile's digest reads only that digest; the youngest of `tag_last_pushed` and `images[].last_pushed` is
taken; the compose file is covered; a superseded digest found on another tag uses that tag's time, and one found on no
tag fails, naming the current digest and when it turns old enough; a non-Hub registry is unprovable; three Hub failures
fail closed; a 429 waits for the reset; on push a young digest warns; bootstrapping ages every digest.
`tree.test.ts`: `readTreeAt` returns the base's Dockerfiles. `exclude-window.test.ts`: the npm cases moved unchanged,
plus the reasoned kinds' bounds.

## 6. Documents
- ADR 0066 Part 5 (after Part 4, `:626` at 19e3d98e): the context (only npm was held), the decision (§2's youngest-of
  rule with a GitHub-recorded signal, `verified_at` required on CI; the default-branch and tag-names-pin rules; Hub push
  time; excludes under F2 (b)), the residual (§1), the assumption that a web-flow signature time is not GitHub's clock
  (`about-commit-signature-verification.md:150` refuses only bots with custom committer data; the docs are silent on
  user tokens), the measured state (§2.3), the alternatives (§10), and when to revisit: require immutable releases for
  new actions once most pinned publishers use them; GitHub exposes a tag's creation time; a web-flow key rotates.
- `docs/runbooks/dependency-upgrades.md`, "Actions" (`:204`) and "Base images and PostgreSQL" (`:162`): what a hand
  bump meets (§9), how to add each kind of exclude, the late-`verified_at` re-run, and the triage's removal of expired
  ones.
- `docs/runbooks/ci.md`: the two steps' new messages, push-run warnings, and the key-rotation warning.
- `docs/product/reconciliation-001.md`: P1 ruled yes (the co-founder, 2026-10-26 ~00:20 UTC), with the item.
- `packages/compliance/src/controls.ts`, `dependency_and_image_hygiene` (`:252`): evidence names the age rules.

## 7. Test-matrix rows (and `packages/synth` cases)
| ID | Case | Assertion |
|---|---|---|
| CI-21 | An action pin held to three days | A pin new against the base passes on a pull request only when its commit is on the upstream default branch, its tag still names it, and it is at least three days old by the youngest time read with a time GitHub recorded; an unchanged pin is never read for its age; on a push a finding warns |
| CI-22 | An image digest held to three days | A digest new against the base's Dockerfiles and compose file passes on a pull request only when Docker Hub pushed it at least three days ago; a superseded or unreadable digest fails closed; an unchanged digest is never read; on a push a finding warns |
| CI-23 | A pin or digest by dated exclude | An exact pin or digest enters young under a security-fix exclude with an advisory that covers its whole young window and lasts at most seven days, or unprovable or off the default branch under a reasoned exclude of at most seven days; an expired one fails only where the list is edited |

The section's intro sentence gains "CI-21 to CI-23 hold pins and digests to the release age (Part 5)". In `matrix.ts`,
three rows go after CI-20. In `registry.ts`, each is `none(0, …)`: "The workflows, Dockerfiles and compose file are
read; GitHub's and Docker Hub's answers are synthetic and recorded; the signed objects are the synthetic ones in
tools/check-action-pins/testdata/age; no file is generated." They are listed with their test files. Then
`pnpm synth --all`.

## 8. Builders
- **B1**: `tools/check-action-pins/**` and the `ci.yml` `env` line with its `workflows.test.ts` assert.
- **B2**: `tools/check-toolchain/**`, including `exclude-window.ts` and `releaseAgeMinutes`, which B1 imports, and the
  `tree.ts` change. B2 lands `exclude-window.ts` first, with the npm rule moved to it as a no-op refactor proven by the
  existing cases.
- **Integrator**: documents, matrix, synth, the fresh-clone verification, and acceptance step 8 read from the CI log:
  each pin's signals printed, with `verified_at`, `published_at` and `immutable` read with the token, and which of the
  12 are immutable recorded in ADR Part 5. If `verified_at` is absent from the API's answer, the step stays red and the
  integrator stops: under §2.1 a signed commit without it is unprovable on CI, and dropping it would leave the
  unproven signature time as the gate.

## 9. What each kind of update meets
- **Dependabot's version updates** (actions and images, `default-days: 7`, CQ1) do not trip it on honest dates. Its
  date is one of P1's signals, which is at least 7 days old when it opens. It trips only when another signal is
  younger by more than four days, such as a commit or tag newer than its release (the moved-tag case), a late
  `verified_at` (re-run), or a digest superseded before CI reads it. Then the pull request is red until Dependabot's
  next run moves it, or a person moves it to the current digest once that digest is three days old.
- **Dependabot's security updates** skip the cooldown (`dependabot-options-reference.md:196`), so a young fix
  is held red until a person adds the dated `security-fix` exclude, as an npm security update is under F2 (b).
- **A person's hand bump** to a release 3 to 6 days old passes (the floor is three days; the 7 is Dependabot's
  pacing). Under three days, it fails with: the pin, each time and source, "old enough from <instant>", and "wait, or
  for a security fix add it to tools/check-action-pins/age-exceptions.json with its advisory, the date added and an
  expiry (docs/runbooks/dependency-upgrades.md)". A new action from an unsigned, non-immutable release needs an
  `age-unprovable` exclude with a reason; one released from a maintenance branch needs `off-default-branch`.
- **Who writes an exclude.** Nothing enforces that a person wrote it. Until runbook 3i, merges need only green checks
  (CLAUDE.md "Merging"), exactly as for F2 (b)'s npm excludes; this is inherited, not new (§12 R8).

## 10. Choices made, with reasons
- C1. Take the youngest of all signals rather than a priority order like Dependabot's. Forgery can only push a date
  earlier, and the youngest-of ignores that.
- C2. Fail closed when no time GitHub recorded exists, and on CI require `verified_at` (or an immutable release) rather
  than accept the web-flow signature time, whose independence from the committer date is unproven (S4). This is the
  safer option under the ruling. It costs one `age-unprovable` exclude for a commit pushed unsigned without an immutable
  release, and none of today's 12 pins needs one.
- C3. Verify signatures with `gpgv` and committed public keys, rather than (a) trusting the `committer GitHub` text,
  which anyone can write, or (b) the `openpgp` npm package, a new dependency under the release age with more surface.
  `gpgv` is on every runner: ubuntu-26.04's apt 3.2.0 has `Depends: … gpgv` (archive.ubuntu.com
  `dists/resolute/main/binary-amd64/Packages`), and runner-images `toolset-2604.json:130` installs `gnupg2`; `static`
  runs there after ci-browser (lane-b-ci.md:59).
- C4. Measure age at the commit, because no interface exposes when a mutable tag was created; take an immutable
  release's `published_at` where one exists, because it is that time.
- C5. Require the pin on the upstream default branch, checked with git rather than the compare API, so it runs the same
  locally and on CI with no token, at about 1 s per new pin (§2.3). This is zizmor's impostor-commit audit, narrowed
  from any branch to the default branch, since an attacker who moved a tag can usually also push a branch; a
  maintenance-branch release takes a reasoned exclude.
- C6. Read Docker Hub's push time rather than the config `created` (set by the builder) or registry GETs (rate-limited;
  429 seen). It is Dependabot's own source, so the two agree.
- C7. Age only what is new against the base, with bootstrapping only on the pull request that adds the rule. That
  meets "an unchanged pin never fails" and still proves the rule on CI. A push run warns, since its pull request was
  the gate and a red build branch blocks both lanes.
- C8. Keep one exclude list per check, beside its code, as `release-age-exceptions.json` is, with one shared window
  and floor module.
- C9. Do not age actions nested in a composite on their own. A nested SHA predates the commit that names it, so the
  parent's age bounds it. A nested `docker://…@sha256` is the action author's and is not read (R6).
- C10. Add no new job or required check. Both rules are steps of `static`, under `all green`, so F7's ruleset is
  unchanged.
- C11. Read `verified_at`, `published_at` and `immutable` on CI only. CI can only be stricter than a local run.
- C12. On a rate limit, wait for the server's reset (capped at 60 s) rather than the fixed backoff, which ends before
  Hub's 60 s window does; it still fails closed after three tries.

## 11. Interplay
- **Lane A's #42** shares `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md` and
  `packages/synth/src/cases/{matrix,registry}.ts` (`pr42-files.txt:85, 86, 136, 137`). These are LANES rule 6
  documents, and P1 writes different sections (CI rows, its own record), so the pull request merged second keeps both
  and runs `pnpm synth --all`. P1 touches no other file of #42's 143 (no lockfile, manifest, watched path or ADR 0062).
  The B1 fix matters to #42 too: without it, a Hub move of `node` would turn #42 red.
- **ci-deps and ci-browser** are merged first; P1 builds on their files as merged, re-reading every cite at the cut.
  ci-browser adds steps that use existing pins (setup-node) and no image. Its move to `ubuntu-26.04` changes no pin, and
  runner images are not pinnable, so they are outside P1.
- **P2 (Part 6, Trivy's version)** edits `tools/check-action-pins` too. Whichever merges second resolves. P2 imports
  the floor (`releaseAgeMinutes`) from `exclude-window.ts`, not the window: P2 gives Trivy no exclude
  (`p2-design.md:232-234`). **P4 (Part 7, `affected.ts`)** shares only ADR 0066, the matrix and synth. Other Lane B pull
  requests follow rule 6. A pin added by one that merges after P1 is aged by P1.

## 12. Risks and rollback
- R1. **GitHub rotates the web-flow key.** New pins then give no local signature signal, while `verified_at` covers them
  on CI. The push-run warning names the rotation, and the remedy is to add the new key to `github-web-flow.asc`.
- R2. **Late `verified_at`** for commits before persistent verification (§2.1, a documented fact): a false red, in the
  safe direction, cleared by a re-run after the printed instant.
- R3. **API rate limits or outages** (GitHub, Docker Hub). Only a pull request that adds a pin or digest reads the
  network; a rate limit waits for the reset, then fails closed, and a re-run clears it. A push run only warns.
- R4. **A superseded Dependabot digest** stays red until it is moved (§9).
- R5. **The web-flow signature time is the commit's committer time** (§2.3). It is therefore not taken as GitHub's clock
  on CI (C2); locally it remains a reading CI re-checks.
- R6. **Images nested in actions** (`docker://` digests in a composite) are not aged.
- R7. **The patient attacker** (§1): a commit on the default branch for three days, then a mutable tag moved to it,
  passes. Immutable releases close it per action; ADR Part 5's revisit trigger tracks requiring them.
- R8. **Excludes are self-approved until runbook 3i**, as for F2 (b).
- **Rollback**: revert the pull request. It holds no state and no migration, and the excludes are only files.

## 13. Review (2026-10-26)
Review `follow-ups/p1-review.md`: 1 blocking, 10 should fix, 8 nits. Each was re-checked against ci-deps 19e3d98e,
github/docs main and the keyserver before folding; all 19 hold and are fixed.

| Finding | Disposition |
|---|---|
| B1 base Dockerfiles never read | Fixed. Confirmed `tree.ts:51-57` reads only `FILES`. `readTreeAt` reads the base's Dockerfiles (§3.2); two tests (§5) |
| S1 commit age is not tag age | Fixed. Residual stated (§1, R7, ADR Part 5); default-branch rule added (§3.1 step 2, C5), checked with git rather than the compare API so it runs locally; measured: all 12 pins are on their default branch (§2.3). The Events API option was not taken: 30 days, and absence proves nothing |
| S2 immutable releases ignored | Fixed. `immutable` read with `published_at`; an immutable release's `published_at` is GitHub-recorded (§2.1, C4); CI records which pins are immutable (§8); revisit trigger rewritten (§6); test (§5) |
| S3 late `verified_at` | Fixed. Stated as fact with `:54` (§2.1, R2); the message names the re-run instant; test |
| S4 signature time unproven, §8 fallback | Fixed. On CI `verified_at` is required for a signed commit; null fails closed (§2.1, C2); §8's fallback removed; `:150` and the assumption in ADR Part 5; test |
| S5 age read from the tag's current commit | Fixed. Signals read from the pinned commit; tag-names-pin asserted, "tag moved" with both SHAs (§3.1 step 1); test |
| S6 push runs fail | Fixed. Age findings warn on `push` (acceptance 7, §3.1, §3.2, CI-21, CI-22); tests |
| S7 pre-2024 key, byte comparison | Fixed. Both keys committed, the old one accepted only before 2024-01-16T20:00:00Z with `EXPKEYSIG` (§3.1 step 3); fingerprint-set comparison; tests. Expiry instant read from keyserver.ubuntu.com (uid expiry 1705435200) |
| S8 rate limit vs 60 s window | Fixed. Wait for `Retry-After` or reset, capped at 60 s, in both transports (§3.1, §3.2, C12); tests |
| S9 gpg in tests, ★ that cannot fail first | Fixed. Synthetic signed objects made once by `testdata/age/make.sh`, only public material committed; tests need only `gpgv`; the base-pin case asserts the new note, so it is red first; the B1, S2, S4, S5, S6, S7, S8 cases added |
| S10 `age-unprovable` window | Fixed. added ≤ now, expiry ≤ added + 7 days, reason, null advisory, for both reasoned kinds (acceptance 5, §3.3); tests |
| N1 Events API 30 days | Fixed (§2.1, `events.md:38`) |
| N2 `collection.test.ts` needs no edit | Fixed (§4, `:20-26, 41-42`) |
| N3 hard-coded 4,320 | Fixed. Floor from `minimumReleaseAge` via `releaseAgeMinutes` (acceptance 1, §3.3) |
| N4 P2 and the window | Fixed. P2 imports the floor, not the window (§11) |
| N5 `gpgv` on 24.04 | Fixed. Cites resolute's apt and `toolset-2604.json:130` (C3) |
| N6 tag search | Fixed. `ordering=last_updated`; the expected fail-closed message stated (§2.2) |
| N7 depth-1 fetch of an annotated tag | Fixed. Two objects (§2.3) |
| N8 who writes an exclude | Fixed. Named as inherited (§9, R8) |

Open: `verified_at`, `published_at` and `immutable` for the 12 pins could not be read from this session (403); P1's own
CI run reads them (acceptance 8), and if `verified_at` is absent the integrator stops (§8). Whether web-flow signs
API commits with a caller-set `committer.date` stays unproven; C2 no longer depends on it.
