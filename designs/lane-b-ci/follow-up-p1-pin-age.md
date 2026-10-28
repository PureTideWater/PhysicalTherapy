# P1: action pins and image digests held to the three-day floor (`co-001/ci-pin-age`)

Lane B, after ci-deps (§3.2) and ci-browser (§3.3) merge; cut from `claude/build-platform` then. Written against
6ddd587 plus both designs, and against what the ci-deps builders had written by `co-001/ci-deps` 19e3d98e
(2026-10-26T01:48Z, still moving; every `tools/check-*` cite below is at that commit and is re-read when the branch is
cut; (14) re-read at ecebdc90 on 2026-10-27, §14 maps every cite and governs; its review folded on 2026-10-28, §15).
ADR 0066 Part 5; test-matrix CI-21 to CI-23 (all three used). No migration: it changes `tools/`, one `ci.yml` step's
`env` and (14) two `ci.yml` comments, and documents. Folded with its review on 2026-10-26 (§13).

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
days, then move a mutable tag to it; P1 passes that pin. (14) The same attacker need not wait in the default branch's
public history: a commit pushed signed to a fork, or to a branch later deleted, three days ahead keeps its verification
record across the repository network (`about-commit-signature-verification.md:68`), so it can be fast-forwarded onto the
default branch and tagged in the same minute with every signal three days old. The default-branch rule (§3.1) proves
that the commit is on the default branch when read; when it arrived there is not proven, except that a GitHub-recorded
arrival inside the floor's window, when the activity read answers (§3.1 step 5, E12), makes the pin young.

Acceptance (measurable):
1. A pull request that adds an `owner/repo@<sha>` absent from the base's workflows fails `static`'s "Action pins" step
   when that commit's age, measured as in §2, is under the floor (`pnpm-workspace.yaml`'s `minimumReleaseAge`, read as
   check-toolchain reads it, `check.ts:829` (14), never under `MINIMUM_RELEASE_AGE_MINUTES`), naming the pin, every time
   read with its source, the instant it becomes old enough, and the remedy. At or over the floor it passes.
2. The same pull request fails when the pinned commit is not an ancestor of the upstream repository's default branch
   ("not on <branch>"), or when the pin's tag no longer names the pinned commit ("tag moved", both SHAs).
3. A pull request that adds an image digest absent from the base's Dockerfiles, `docker-compose.yml` and (14)
   workflows (the BuildKit builder, any container, service or `docker://` image; §14.4 item 1) fails "Toolchain" on
   the same floor, measured from Docker Hub's push time.
4. A pin or digest already in the base, in its workflows, Dockerfiles or compose file, never makes a read for its age
   and never fails on it, on any event, (14) except an action pin on a change whose merge base has no
   `tools/check-action-pins/age.ts` (bootstrapping, acceptance 8), where a push only warns.
5. A live, exact, dated exclude passes the condition its kind names, and nothing else (14): `security-fix` the floor;
   `age-unprovable` only the need for a GitHub-recorded signal; `off-default-branch` only the ancestry rule. Under
   either reasoned kind the pin or digest must still be at least three days old by every time read. For `security-fix`,
   F2 (b)'s window: time + floor ≤ expiry ≤ added + 7 days. For `age-unprovable` and `off-default-branch`: added ≤ now,
   expiry ≤ added + 7 days, a reason, and no advisory. (14) An image `age-unprovable` applies only to a registry other
   than Docker Hub, and a Docker Hub digest found on no tag passes under no kind.
6. On CI, a pin whose commit has no time GitHub recorded (§2.1) fails closed ("age unprovable"), unless an exclude of
   that kind names it (14) and it is three days old by every time read.
7. On a `push` run every age finding is a `::warning::`; the pull request is the gate. (14) So is a verify-loop read
   fault or moved tag of a ref the base's workflows hold, and the push's verify loop ends at its deadline (S4).
8. Today's pins and digests all pass (§2.3; (14) again on 2026-10-27, §14.3); P1's own pull request ages every pin
   (§3.1, bootstrapping) and (14) no digest already in the base (E2), so its CI run is the live proof on GitHub's
   runners, including the API reads this session cannot make.
9. `pnpm test`, `pnpm lint`, `pnpm typecheck` and CI green; the unit count rises by the new tests only.

## 2. How age is measured

### 2.1 Actions: the candidates

| Signal | Who sets it | Readable here | On CI | Taken |
|---|---|---|---|---|
| Commit committer/author date | the commit's author (`git commit --date`, `GIT_COMMITTER_DATE`) | yes, blobless fetch | yes | in the youngest-of only |
| Annotated tag's tagger date, counted only while the tag names the pin | the tagger | yes, same fetch | yes | in the youngest-of only |
| GitHub web-flow signature time | GitHub's signer, when GitHub creates the commit; key `968479A1AFF927E37D1A566BB5690EEEBB952194` from 2024-01-16, and `5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23` (rsa2048, 2017-08-16, expired 2024-01-16T20:00:00Z) before it | yes: `gpgv` with both public keys | yes | in the youngest-of; GitHub-recorded **locally only** (S4: it equals the committer time to the second in all 12, so it is not proven to be GitHub's clock) |
| `verification.verified_at` (REST (14) `GET /repos/{o}/{r}/git/commits/{sha}`, E7; required, nullable in the `verification` schema) | GitHub, when it first verifies a signed commit; for commits before persistent verification, at the next verification (`about-commit-signature-verification.md:54`) | no: api.github.com answers 403 here (2026-10-26) | yes, `GITHUB_TOKEN` | **GitHub-recorded** |
| Release `published_at` and `immutable` (REST `GET /repos/{o}/{r}/releases/tags/{tag}`) | GitHub, when the release is published; an immutable release's tag "is locked to a specific commit, cannot be changed, and cannot be deleted" (`immutable-releases.md:22`) | no (403) | yes | in the youngest-of; **GitHub-recorded** when `immutable` is true |
| Tag ref's first appearance | no API returns it (the Events API keeps 30 days and 300 events, `content/rest/activity/events.md:38`) | no | no | not available |
| (14) Arrival on the default branch: the newest `GET /repos/{o}/{r}/activity?ref=refs/heads/<default>` entry inside the floor's window whose `after` has the pin as an ancestor and whose `before` does not (E12) | GitHub, at the push or merge | no (403) | best effort: one try a page, at most three pages | in the youngest-of when such an entry is found; never proves a pin old, since an absent entry proves nothing |
| Dependabot's cooldown | dependabot-core 7c06280: release `published_at`, else `git for-each-ref %(creatordate)` (`common/lib/dependabot/git_cooldown_date_resolver.rb:15, 45-54`); no date means **not** in cooldown (`github_actions/.../latest_version_finder.rb:376-377`) | n/a | n/a | not reused: fails open, and prefers the one date a moved tag keeps old |

**Decision: age = now − the youngest of every signal read, and a GitHub-recorded signal must exist.** On CI that is a
non-null `verified_at`, or an immutable release's `published_at`; a signed commit whose `verified_at` is null or absent
fails closed as "age unprovable" rather than falling back to the signature (S4). Locally, where the API is not read, a
web-flow `VALIDSIG` stands in, and the result is a local reading that CI re-checks. A forged date can only lose to a
younger one in the youngest-of. A mutable release's `published_at` stays with the release when its tag is moved, so it
can make a pin younger but never proves it old; an immutable release's cannot be detached from its commit, so it is the
tag-binding time the floor is about.

**Late `verified_at` (fact, not risk).** For a commit made before persistent verification ((14) the docs give it no
date), GitHub creates the record "the next time the commit's signature is verified"
(`about-commit-signature-verification.md:54`), which P1's own read can be. Such a commit reads as 0 days old on its
first CI run and passes three days later. When `verified_at` is the youngest signal and lies more than the floor after
every other signal, the message says so and names the remedy: re-run the check after the instant it prints. No exclude
kind is needed; none of today's 12 is affected (all are 2026 commits).

What the rule closes: a tag moved to a fresh commit (signed now, or `verified_at` now, or unsigned and unprovable); a
tag moved to an old commit outside the default branch, including one made in a fork, whose verification record is
shared across the network (`:68`) (the default-branch rule), (14) while that commit is still outside the default branch
when read; a tag moved between the verify loop's read and the age read (the tag-names-pin assertion). What it does not
close is §1's residual: (14) the ancestry rule holds at read time only, so a commit staged elsewhere and fast-forwarded
onto the default branch with its tag is caught only by its arrival time, when the activity read answers (E12).

### 2.2 Images: the candidates

| Signal | Who sets it | Taken |
|---|---|---|
| Docker Hub `tag_last_pushed` / `last_updated`, and each `images[].last_pushed` (`GET https://hub.docker.com/v2/repositories/<ns>/<repo>/tags/<tag>`, (14) the form `buildkit.ts:76` already reads) | Docker Hub, at push | **yes**, the youngest of them, when the tag's `digest`, (14) or one of its `images[].digest` (a pinned platform manifest), equals the pin |
| Image config `created` | the builder (docker-library sets it from `SOURCE_DATE_EPOCH`) | no: settable, and a registry GET (`registry-1.docker.io`) answered 429 here on 2026-10-26 |
| Dependabot's cooldown | the same Hub field when Hub's digest matches, otherwise none and the cooldown is skipped (`docker/lib/dependabot/docker/update_checker.rb:476-540, 1113-1131`) | same source, but P1 fails closed where Dependabot fails open |

A re-push only makes `tag_last_pushed` younger, so it errs in the safe direction. When the tag no longer names the
pinned digest, the check lists the repository's tags (`…/tags?page_size=100&ordering=last_updated`, at most 5 pages) for
one that does, and takes that tag's youngest time. That rarely helps: on 2026-10-26 `43b9…` is on only `lts-trixie-slim`
and `krypton-trixie-slim` among node's first 100 of 9,233 tags, and (14) a page's span depends on the push burst (node's
first page 9.0 hours, its second 28.9 days; five pages reach 2026-06-24 for node and 2024-11-15 for postgres, and hold
all 366 of BuildKit's tags, 2026-10-27). The expected outcome for a superseded digest is therefore the fail-closed
message naming the tag's current digest, its push time, and the instant that digest turns old enough, (14) which no
exclude kind clears: the remedy is the tag's current digest, under a `security-fix` exclude if it is a young fix. Only
a digest new against the base is read (B1 fix, §3.2), so this meets only the pull request that changes the digest. A
registry other than Docker Hub has no publisher-proof source, so its image is "age unprovable" (none today; ci-browser
adds no image).

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
- `age.ts` (new). For each ref in the **age set** (below), one blobless fetch into a bare repository of its own under
  (14) `gitTransport`'s scratch directory (`network.ts:57-58`), removed by `close()` (E6): the upstream's branches and
  the pin's tag, unpeeled (§2.3's command). (14) Both are `fetchRefs`: one `git ls-remote --symref <url> HEAD
  refs/tags/<v> refs/tags/<v>^{}` names the default branch and the tag, so a tag the upstream lacks is the answer "no
  tag <v>" rather than a fetch that fails three times as a host failure (N6); then the fetch takes the default branch
  alone and, when listed, the tag (N16). Then:
  1. `refs/tags/<v>^{commit}` must equal the pin, or "tag moved", naming both SHAs. The tagger date counts only then.
  2. The pin must be an ancestor of the default branch (`git ls-remote --symref <url> HEAD`, then `git merge-base
     --is-ancestor`), or "not on <branch>", fail closed, unless an `off-default-branch` exclude names it. If the pin is
     absent from the fetch, it is fetched by SHA (`git fetch --depth=1 --filter=tree:0 <url> <sha>`) only to say
     whether GitHub serves it at all. (14) The exclude waives this rule only; the age rule still applies in full.
  3. The signals of §2.1 are read from the pinned commit itself, never from whatever the tag names. The web-flow
     signature is checked with `gpgv` against `github-web-flow.asc` (new, armored, both keys, dearmored in memory to a
     temporary keyring, since gpgv refuses an armored one). A `VALIDSIG` counts when its primary fingerprint is the
     current key; one from the 2017 key counts only when gpgv also reports `EXPKEYSIG` and the signature's creation
     time is before 2024-01-16T20:00:00Z. An SSH or X.509 signature, or another key, gives no signal.
  4. When `GITHUB_ACTIONS=true`, it reads `verified_at`, and `published_at` with `immutable`, with `GITHUB_TOKEN`
     (`X-GitHub-Api-Version: 2026-03-10` (14), E7). A 404 on the release is an answer: no release. Locally the two API
     reads are skipped with a note, since CI can only be stricter. A missing `gpgv` fails closed. (14) A
     `verification.reason` of `gpgverify_error` or `gpgverify_unavailable` (GitHub's signature service failed) is a
     failed read, tried again and then failed closed with the remedy "re-run", never "age unprovable"; every block
     prints `reason` beside `verified_at` (S9). The API reads never follow a redirect: a 3xx is an answer naming where
     the repository moved, and no message carries a request header (N15).
  5. (14) On CI, the arrival read (E12): `GET /repos/{o}/{r}/activity?ref=refs/heads/<default>&per_page=100`, newest
     first through the `Link` header, at most three pages, back to now − floor; one try a page and no rate-limit wait.
     The newest entry inside the window whose `after` the fetch holds with the pin as an ancestor, and whose `before`
     it does not hold or holds without the pin, is the arrival, and its `timestamp` joins the youngest-of. Any other
     outcome (no such entry, a non-200 answer, an unparsable body, a timeout, three pages short of the window) is a
     note, "activity: …", never a finding: the read can make a pin young and never proves one old.
  Every read takes three tries and fails closed, naming the host (`withRetries`, `network.ts:144-173` (14)), (14) except
  the arrival read (step 5). A
  rate-limit answer (429, or 403 with `Retry-After` or `x-ratelimit-remaining: 0`) waits for `Retry-After` or the reset,
  capped at 60 s, before the next try, instead of the 2 s and 5 s of `BACKOFF_MS` (`network.ts:124` (14)).
- **The age set**: refs in the head's workflows that appear in no workflow of the merge base, read through the same
  `baseState` (`base.ts:30-49` (14), its `workflows` whatever `everyPin` says), not `selectPins`' `verify` set
  (`base.ts:60-67`), which also holds pins whose inputs changed. With no `BASE`, every ref is aged (local runs).
  **Bootstrapping**: when the merge base has no `tools/check-action-pins/age.ts`, every ref is aged, so P1's own pull
  request proves the rule on CI. A later edit of the checker does **not** age every pin, so an unchanged pin can never
  fail. When the age set is empty, the age loop notes "age: no pin new against the base, nothing read". (14) A ref
  whose verify-loop read failed is not aged again: its fault is already reported, an error on a pull request (S3).
- `check.ts`: after the verify loop and (14) the builder check (`:101-129`), the age loop. On `push` (the set new
  against the previous head, which a green pull request already passed), every age finding is a `::warning::`, as
  ci-deps' push re-reads are (`check.ts:131-168` (14); check-toolchain's "A push run follows a green pull request, so it
  warns", `check.ts:60-61`), so an outage, a rate limit or a moved tag cannot turn the build branch red. ci-deps' own
  verify-loop errors are unchanged. (14) Both halves of that are amended. check-toolchain's comment states the
  convention, but only its expired-exclude finding follows it (`:536-544`, the one use of the event); its other rules
  fail a push, so P1's push warnings are new there (N5). And on a push the verify loop follows the same rule for a ref
  the base's workflows already hold, as every ref is when the change edits the checker (`check.ts:86-95`, `base.ts:63`):
  a read that fails, a read the deadline stops, or a tag that moved is a warning; a problem found in what was read
  (inputs, nested pins, caches) stays an error, since no outage or upstream move produces it; a ref new against the
  previous head keeps its errors; and the push's verify loop runs under its own `PUSH_DEADLINE_MS` (S4).
- `age-exceptions.json` (new): `{ pin: "owner/repo@<40 hex>", version: "vX.Y.Z", kind: "security-fix" | "age-unprovable"
  | "off-default-branch", advisory: "GHSA-…" ((14) GHSA only, E11) | null, reason, added, expires }`. Each entry is
  exact, with no patterns. The version must equal the pin's comment. `security-fix` needs an advisory; the other two
  take `null` and a reason. `age-unprovable` is refused when the pin's age is in fact known, and `off-default-branch`
  when the pin is on the default branch, so neither can stand in for a young pin's advisory. The windows are acceptance
  5's. (14) Each kind waives one requirement and nothing else: `security-fix` the floor, `age-unprovable` only the need
  for a GitHub-recorded signal, `off-default-branch` only the ancestry rule. Under either reasoned kind the youngest of
  every signal read (committer, tagger, signature, `verified_at`, a mutable release's `published_at`, the arrival when
  read) must still be at or over the floor, so a reason never admits a pin a signal shows young (B1). A pin that needs
  two waivers carries two entries, one per kind.
- On push runs, a networked read of https://github.com/web-flow.gpg gives a `::warning::` when its set of primary
  fingerprints differs from the committed file's (a key rotation). It never fails a run.
- `ci.yml`'s "Action pins" step (`:85-88` at ecebdc90, its `env` at `:87` (14)) gains
  `GITHUB_TOKEN: ${{ github.token }}` in its `env`. The job's `contents: read` suffices for public repositories, and
  Dependabot's runs get a read-only token too. Rate: (14) two calls per new commit (`verified_at`, the release) and one
  to three pages of the default branch's activity (E12), one more per `security-fix` exclude (E11), against 1,000 an
  hour per repository (github/docs
  `data/reusables/rest-api/primary-rate-limit-github-token-in-actions.md`).

### 3.2 `tools/check-toolchain`: the image rule
- `tree.ts`: `readTreeAt` (`:51-57`) reads the base's Dockerfiles too, as `readWorkingTree` (`:44-48` (14)) does for the
  head: `git ls-tree --name-only <commit> apps/`, then `apps/<name>/Dockerfile` for each entry that holds one, mirroring
  `dockerfilePaths` (`:32-41`). Without this, `Tree.dockerfiles` is undefined for the base and every pull request would
  age both Dockerfile digests and turn red whenever Hub moves `node` (review B1). `FILES` (`check.ts:42-52` (14)) gains
  `docker-compose.yml` and `image-age-exceptions.json`, and (14) both trees gain their `.github/workflows/*.yml` and
  the paths of every tracked `Dockerfile*`, `Containerfile*` and compose file other than `apps/*/Dockerfile` and
  `docker-compose.yml`, for the form rule below (S6).
- `images.ts` (new), a rule in `checkToolchain` beside `dockerfileRule` (`check.ts:387-414` (14)). It reads every `FROM`
  of the Dockerfiles, `docker-compose.yml`'s `services.*.image` and (14) every image the workflows name (§14.4 item 1),
  at head and at base. The age set: digests the base names nowhere ((14) no bootstrapping, E2). Each must be
  `name:tag@sha256:<64 hex>`, since a tagless digest has nothing to ask Hub. Hub reads go through `registry.ts`'s
  `readJson` (`:71-98` (14), a Hub 404 an answer, E14), naming `hub.docker.com`, which gains the same rate-limit wait as
  §3.1 (Hub answers `x-ratelimit-limit: 180` with `x-ratelimit-reset` 60 s ahead, measured 2026-10-26T02:00Z). On `push`
  its findings are warnings, as in §3.1. (14) `readJson` also gains a `signal`, combined with each try's timeout through
  `AbortSignal.any` as `network.ts:96` does, and a sleep the signal stops, since today it replaces any caller's signal
  (`registry.ts:79`) and sleeps unstoppably (`:75`); Hub tries take 30 s, npm's keep 60 s (S5). The rule is named
  "images" offline and networked. (14) Its offline form rule also refuses every image reference it does not read, so
  that "every image the tree names" holds on its own (S6): a `COPY --from=` or `RUN --mount=…,from=` naming anything
  but an earlier stage; a `docker-image://` in `build-push-action`'s `build-contexts`; any tracked `Dockerfile*` or
  `Containerfile*` outside `apps/*/Dockerfile` (two workflows compute `file:`, `release.yml:106`,
  `release-dry-run.yml:115`); any tracked compose file other than `docker-compose.yml` (Compose prefers `compose.yaml`
  when both exist, docker/docs 370c82d9 `content/manuals/compose/intro/compose-application-model.md:40-42`); and a
  compose `build:`. None occurs today: every `--from=` names the stage `build` (`apps/web/Dockerfile:38-42`,
  `apps/worker/Dockerfile:33-43`).
- `image-age-exceptions.json` (new): `{ image, kind: "security-fix" | "age-unprovable", advisory, reason, added,
  expires }`, under the same rules. A base image's security fix is usually a CVE, so CVE ids are accepted. (14)
  `age-unprovable` applies only to a registry other than Docker Hub, where no time is read, so it rests on its reason
  (none today); a Hub digest found on no tag passes under no kind (B1). A `security-fix` entry also names `fixes:
  { package, version }`, the package the advisory is against and the version the image now carries, since its advisory
  is checked for form only (S10; a residual in ADR Part 5, and P23 proposes checking it).

### 3.3 One exclude window and one floor for all three lists
`exclude-window.ts` (new, in `tools/check-toolchain`) takes the window and expiry logic out of `releaseAgeExcludeRule`
(`check.ts:489-547` (14)): for `security-fix`, an `added` in the future, expiry more than seven days after `added`, or
expiry before the known time + floor, is refused; for the reasoned kinds, an `added` in the future or an expiry more
than seven days after `added`. The expired rule is shared: an error on a pull request that edits the list, a
`::warning::` elsewhere. It also exports `releaseAgeMinutes(workspace)`, the floor check-toolchain already reads
(`check.ts:829` (14)), so the npm rule, the action rule, the image rule, (14) the builder's newer-release warning (in
place of `BUILDKIT_AGE_MS`) and P2's Trivy floor cannot drift. An entry naming a pin or digest no longer used is a
warning, which the weekly triage removes.

## 4. Files
- New: `tools/check-action-pins/{age.ts,keys.ts,age.test.ts,github-web-flow.asc,age-exceptions.json}` ((14) `keys.ts`,
  E9), `tools/check-action-pins/testdata/age/` (§5's synthetic keys and objects, with `make.sh`, the script that made
  them),
  `tools/check-toolchain/{images.ts,images.test.ts,exclude-window.ts,exclude-window.test.ts,image-age-exceptions.json}`.
- Changed (14): `tools/check-action-pins/{check.ts,network.ts,fixtures.ts,index.ts,buildkit.ts,workflows.ts,verify.ts}`
  and `{check.test.ts,buildkit.test.ts,verify.test.ts,workflows.test.ts}` (the transport gains `fetchRefs`, `object`,
  `isAncestor` and `fetchSha`, and `get` carries headers in place of a `getJson`, E6; `withRetries` gains the rate-limit
  wait; the recorded transport records them and their pauses; the builder takes the floor and its newness from the
  base, E4; rule (a) refuses a reusable workflow and `verify.ts` a Docker action not by digest, S7; the push's verify
  loop, S4);
  `tools/check-toolchain/{check.ts,tree.ts,registry.ts,policy.ts}` and `{check.test.ts,tree.test.ts,registry.test.ts}`
  (the window cases stay in `check.test.ts`, E13; `readTreeAt`'s Dockerfiles and both trees' workflows; its `index.ts`
  is unchanged, since `checkToolchain` already receives both trees, the event and `now`, `index.ts:30` (14));
  `.github/workflows/ci.yml` (one `env` key, the step comment and the comment at `:13`); `tools/test/workflows.test.ts`
  (the step's env and `github.token` once asserted, E8, and the comment at `:1318`).
- Not changed: `tools/test/collection.test.ts`, whose `testsIn('tools/check-action-pins')` and
  `testsIn('tools/check-toolchain')` (`:20-26, 41-42`) already collect the new test files.
- Documents and registries: §6.
- Not touched: any lockfile or manifest (no dependency; `gpgv` is the runner's), the engine, migrations,
  `watched-paths.txt`, and every file in #42's list except the shared documents in §11.

## 5. Tests (failing first)
The cases marked ★ are red against the unchanged checkers; (14) they are each builder's failing-first commit, before
the commit that makes them pass (§14.5, commits 2 and 4). Every network answer
is recorded and synthetic, with made-up owners. Signatures are real but synthetic: `testdata/age/make.sh` was run once
with a throwaway `GNUPGHOME`, made two test keys (one with an expiry in the past, signing under
`--faked-system-time`) and the signed commit and tag objects, exported only the public keys, and was then deleted with
`gpgconf --homedir … --kill all`. The objects' SHAs are their real hashes. Tests inject the test fingerprints, the old
key's expiry instant and `now`, and need only `gpgv`; a missing `gpgv` fails with the install hint. No GitHub key
material is used in tests, no private key is committed, and the files pass the fixture check and gitleaks at push.
(14) `make.sh` takes a short `GNUPGHOME` (`mktemp -d /tmp/gh.XXXXXX`), since gpg-agent cannot bind a socket path longer
than the 108 bytes of `sun_path` (a 125-byte one gave "No agent running", N10), and gpg refuses to sign with an expired
key. So the expired key is made with no expiry at T0; it signs one object at T0 + 10 days and one at T0 + 40 days, each
under `--faked-system-time`; then, at a faked T0 + 1 day, `--quick-set-expire` adds a self-signature, newer than the
key's first, that sets the expiry to T0 + 30 days, so one signature precedes the expiry and one follows it. The ★ cases
go through `checkActionPins` and `checkToolchain` and import only modules that exist before the change, so they are red
on behaviour, a message or note the unchanged checker does not print, not on a missing import (N13, N14).

`age.test.ts`:
- ★ a new pin whose signed commit is 2 days old fails, naming the time, its source and when it turns old enough; the
  same at the floor + 1 s passes; the floor follows `minimumReleaseAge`;
- ★ unsigned commit dated 2020, no `verified_at`: "age unprovable", fails;
- ★ CI mode: a valid web-flow signature with `verified_at: null` fails as unprovable (S4);
- ★ the pin is not an ancestor of the default branch: "not on main", fails; an `off-default-branch` exclude passes it
  (14) when the pin is three days old by every signal;
- ★ the tag names another commit: "tag moved" with both SHAs, and the tagger date is not counted; (14) the verify loop's
  tag read names the pin and the age loop's names another commit, so the message asserted is the age loop's (N14);
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
  `5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23` ((14) computed in TypeScript, E9).

`images.test.ts`: ★ a new digest pushed 2 days ago fails and one pushed 3 days ago passes; ★ a base and head whose
Dockerfiles hold the same digest, with a recorded Hub that would answer "superseded", make zero Hub reads and pass, (14)
and `checkToolchain` prints the image rule's note that no image is new and nothing is read (N13);
changing one Dockerfile's digest reads only that digest; the youngest of `tag_last_pushed` and `images[].last_pushed` is
taken; the compose file is covered; a superseded digest found on another tag uses that tag's time, and one found on no
tag fails, naming the current digest and when it turns old enough; a non-Hub registry is unprovable; three Hub failures
fail closed; a 429 waits for the reset; on push a young digest warns; (14) a base without `image-age-exceptions.json`
still reads only new digests (E2).
`tree.test.ts`: `readTreeAt` returns the base's Dockerfiles. `exclude-window.test.ts`: (14) direct cases, the npm
cases staying in `check.test.ts` (E13), plus the reasoned kinds' bounds.

## 6. Documents
- ADR 0066 Part 5 (after Part 4, `:1258` at ecebdc90 (14)): the context (only npm was held), the decision (§2's
  youngest-of rule with a GitHub-recorded signal, `verified_at` required on CI; the default-branch and tag-names-pin
  rules; Hub push time; excludes under F2 (b)), the residual (§1), the assumption that a web-flow signature time is not
  GitHub's clock (`about-commit-signature-verification.md:150` refuses only bots with custom committer data; the docs
  are silent on user tokens), the measured state (§2.3), the alternatives (§10), and when to revisit: require immutable
  releases for new actions once most pinned publishers use them; GitHub exposes a tag's creation time; a web-flow key
  rotates. (14) The residuals also name: the arrival on the default branch, proven only when the activity read answers
  (§1); what an action downloads at run time, Node, Python, Trivy and its database, pip packages (R6, S7); an image
  `security-fix` advisory checked for form only (S10); and the token's reach from earlier steps through `$GITHUB_ENV`
  (14.4 item 7, N12). The revisit triggers gain "the repository goes private", as Part 1 (`:267`) and Part 4
  (`:1256`) have it. The measured state gains the integrator's local Hub reading through `images.ts` (S11).
- `docs/runbooks/dependency-upgrades.md`, "Actions" (`:279-286` (14)) and "Base images and PostgreSQL" (`:222-248`,
  whose builder bullet says "four" steps for five (14)): what a hand bump meets (§9), how to add each kind of exclude,
  the late-`verified_at` re-run, and the triage's removal of expired ones.
- `docs/runbooks/ci.md`: the two steps' new messages, push-run warnings, and the key-rotation warning; (14) and
  `gpgv` as a prerequisite of `pnpm test` and `pnpm actions:check` among the local commands (`:384-387`, N11).
- `docs/product/reconciliation-001.md`: P1 ruled yes (the co-founder, 2026-10-26 ~00:20 UTC), with the item.
- `packages/compliance/src/controls.ts`, `dependency_and_image_hygiene` (`:252`): evidence names the age rules ((14)
  `:261` and `:262`).

## 7. Test-matrix rows (and `packages/synth` cases)
| ID | Case | Assertion |
|---|---|---|
| CI-21 | An action pin held to three days | A pin new against the base passes on a pull request only when its commit is on the upstream default branch, its tag still names it, and it is at least three days old by the youngest time read with a time GitHub recorded; an unchanged pin is never read for its age, (14) except on the change that adds the rule; on a push a finding warns |
| CI-22 | An image digest held to three days | A digest new against the base's Dockerfiles, compose file and workflows passes on a pull request only when Docker Hub pushed it at least three days ago; a superseded or unreadable digest fails closed; an unchanged digest is never read; on a push a finding warns |
| CI-23 | A pin or digest by dated exclude | An exact pin or digest enters young under a security-fix exclude with an advisory that covers its whole young window and lasts at most seven days, or unprovable or off the default branch under a reasoned exclude of at most seven days (14) and still at least three days old by every time read; a Docker Hub digest found on no tag enters under no exclude; an image's advisory is held for form only, with the package and version it fixes; an expired one fails only where the list is edited |

(14) The section's intro (`test-matrix.md:252-257`) says CI-18 to CI-20 "complete the series" (`:255`), so that
sentence is rewritten to end the series at CI-23 and gains "CI-21 to CI-23 hold pins and digests to the release age
(Part 5)"; CI-22's assertion names the workflows (§14.4 item 1); CI-21's and CI-23's carry the §15 amendments above.
In `matrix.ts`, three rows go after CI-20. In `registry.ts`, each is `none(0, …)`: "The workflows, Dockerfiles and
compose file are read; GitHub's and Docker Hub's answers are synthetic and recorded; the signed objects are the
synthetic ones in tools/check-action-pins/testdata/age; no file is generated." They are listed with their test files.
Then `pnpm synth --all`.

## 8. Builders
- **B1**: `tools/check-action-pins/**` and the `ci.yml` `env` line with its `workflows.test.ts` assert, and (14) the
  comments at `ci.yml:13` and `workflows.test.ts:1318` (§14.5).
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
  date is one of P1's signals, which is at least 7 days old when it opens ((14) for an action; for an image Dependabot
  gates the tag's `tag_last_pushed` and writes the tag's current digest, so the digest can be younger: #33's was 5.14
  days old when written, still over P1's three). It trips only when another signal is
  younger by more than four days, such as a commit or tag newer than its release (the moved-tag case), a late
  `verified_at` (re-run), or a digest superseded before CI reads it. Then the pull request is red until Dependabot's
  next run moves it, or a person moves it to the current digest once that digest is three days old.
- **Dependabot's security updates** skip the cooldown (`dependabot-options-reference.md:196`), so a young fix
  is held red until a person adds the dated `security-fix` exclude, as an npm security update is under F2 (b).
- **A person's hand bump** to a release 3 to 6 days old passes (the floor is three days; the 7 is Dependabot's
  pacing). Under three days, it fails with: the pin, each time and source, "old enough from <instant>", and "wait, or
  for a security fix add it to tools/check-action-pins/age-exceptions.json with its advisory, the date added and an
  expiry (docs/runbooks/dependency-upgrades.md)". A new action from an unsigned, non-immutable release needs an
  `age-unprovable` exclude with a reason; one released from a maintenance branch needs `off-default-branch`; (14) and
  under either it is still held to three days by every time read, so the exclude never shortens the wait (B1).
- **Who writes an exclude.** Nothing enforces that a person wrote it. Until runbook 3i, merges need only green checks
  (CLAUDE.md "Merging"), exactly as for F2 (b)'s npm excludes; this is inherited, not new (§12 R8).

## 10. Choices made, with reasons
- C1. Take the youngest of all signals rather than a priority order like Dependabot's. Forgery can only push a date
  earlier, and the youngest-of ignores that. (14) Not only earlier: a committer or tagger date can be set in the future,
  which makes the pin young until that instant. That is the safe direction, so the rule keeps it; no exclude kind clears
  it (a `security-fix` window cannot reach a time + floor in the future beyond added + 7 days), and the message names the
  future date with the remedy "choose another release" (N7).
- C2. Fail closed when no time GitHub recorded exists, and on CI require `verified_at` (or an immutable release) rather
  than accept the web-flow signature time, whose independence from the committer date is unproven (S4). This is the
  safer option under the ruling. It costs one `age-unprovable` exclude for a commit pushed unsigned without an immutable
  release, and none of today's 12 pins needs one.
- C3. Verify signatures with `gpgv` and committed public keys, rather than (a) trusting the `committer GitHub` text,
  which anyone can write, or (b) the `openpgp` npm package, a new dependency under the release age with more surface.
  `gpgv` is on every runner: ubuntu-26.04's apt 3.2.0 has `Depends: … gpgv` (archive.ubuntu.com
  `dists/resolute/main/binary-amd64/Packages`), and runner-images `toolset-2604.json:130` installs `gnupg2`; `static`
  runs there ((14) `ci.yml:35`; run 40593100176's static job logged ubuntu-26.04 20261012.163.1), and so does `unit`.
- C4. Measure age at the commit, because no interface exposes when a mutable tag was created; take an immutable
  release's `published_at` where one exists, because it is that time.
- C5. Require the pin on the upstream default branch, checked with git rather than the compare API, so it runs the same
  locally and on CI with no token, at about 1 s per new pin (§2.3). This is zizmor's impostor-commit audit, narrowed
  from any branch to the default branch, since an attacker who moved a tag can usually also push a branch; a
  maintenance-branch release takes a reasoned exclude.
- C6. Read Docker Hub's push time rather than the config `created` (set by the builder) or registry GETs (rate-limited;
  429 seen). It is Dependabot's own source, so the two agree.
- C7. Age only what is new against the base, with bootstrapping only on the pull request that adds the rule ((14)
  for actions only; images are not bootstrapped, E2). That
  meets "an unchanged pin never fails" and still proves the rule on CI. A push run warns, since its pull request was
  the gate and a red build branch blocks both lanes.
- C8. Keep one exclude list per check, beside its code, as `release-age-exceptions.json` is, with one shared window
  and floor module.
- C9. Do not age actions nested in a composite on their own. A nested SHA predates the commit that names it, so the
  parent's age bounds it. A nested `docker://…@sha256` is the action author's and is not read (R6). (14) The premise
  holds for composites only, so the rest is refused: a `jobs.*.uses` that calls a reusable workflow, whose own pins and
  images nothing here reads (`workflows.ts:14, :73`; `verify.ts:226` checks its tag alone), by rule (a); and a Docker
  action, at the top level or nested at any depth, whose `runs.image` is not `docker://…@sha256:<64 hex>` (a
  `Dockerfile` or an image by tag pulls a mutable image at run time; `nestedProblems` reads composites only,
  `verify.ts:95`), by `verify.ts` (S7). None is used today.
- C10. Add no new job or required check. Both rules are steps of `static`, under `all green`, so F7's ruleset is
  unchanged.
- C11. Read `verified_at`, `published_at` and `immutable` on CI only. CI can only be stricter than a local run.
- C12. On a rate limit, wait for the server's reset (capped at 60 s) rather than the fixed backoff, which ends before
  Hub's 60 s window does; it still fails closed after three tries.

## 11. Interplay
- **Lane A's #42** shares `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md` and
  `packages/synth/src/cases/{matrix,registry}.ts` ((14) lines 91, 92, 203 and 204 of `git diff --name-only e908c214
  6f23c42b`). These are LANES rule 6 documents, and P1 writes different sections (CI rows, its own record), so the pull
  request merged second keeps both and runs `pnpm synth --all`. P1 touches no other file of #42's (14) 212 (no lockfile,
  manifest, watched path or ADR 0062; #42 now also changes `pnpm-lock.yaml`), and #42's hunks in the four shared files
  miss every region P1 edits. The B1 fix matters to #42 too: without it, a Hub move of `node` would turn #42 red.
- **ci-deps and ci-browser** are merged ((14) #48, e908c21, 2026-10-26 21:06 UTC; #77, ecebdc90, 2026-10-27 22:13
  UTC); P1 builds on their files as merged, every cite re-read in §14.
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
- R6. **Images nested in actions** (`docker://` digests in a composite) are not aged. (14) Nor is what an action
  downloads at run time: Node from setup-node's `node-versions` manifest, Python, Trivy and its database, pip packages.
  These stay outside P1 (S7; P25 covers pyx12).
- R7. **The patient attacker** (§1): a commit on the default branch for three days, then a mutable tag moved to it,
  passes. Immutable releases close it per action; ADR Part 5's revisit trigger tracks requiring them. (14) The attacker
  need not wait on the default branch: a commit signed in a fork, or on a deleted branch, three days ahead and
  fast-forwarded onto the default branch with its tag in one minute has every signal three days old and passes the
  ancestry rule, which holds at read time only. Its GitHub-recorded arrival makes it young when the activity read
  answers (E12); when it does not, it passes (S1).
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

## 14. Re-read at ecebdc90 (2026-10-27)

Re-read on 2026-10-27 between 22:15Z and 22:50Z, and finished on 2026-10-28 from 00:15Z against `claude/build-platform`
ecebdc90 (#77, ci-browser, merged 22:13 UTC; ci-deps merged as #48, e908c21, on 2026-10-26 21:06 UTC), in the P1
worktree `/home/user/ci-pin-age` at that commit with `node_modules` installed. Two scouts read it first, each in
`scratchpad/p1reread/`: one the files and code (`scout-files.md`; every design cite compared with `git show
19e3d98e:<file>`; the unit projects of both checkers and `tools/test` run under the lock, 29 files and 358 tests passed,
`progress/scout-files.progress.md:36`), and one the pins, digests and upstream facts (`scout-pins.md`; a blobless fetch,
a tag peel, `merge-base --is-ancestor` and `gpgv` per pin, Docker Hub's tags and tag lists, github/docs at 3869faed,
github/rest-api-description at 83a2153c and dependabot-core at d710c250; raw output `progress/measure.out.txt`). This
revision re-checked every code cite it uses at ecebdc90 itself, re-read Docker Hub's three tags (22:38:25Z), the REST
description's `api.github.com.2026-03-10.json` at 83a2153c (blobless clone, 22:37Z), #42's file list (`git fetch` of
`refs/pull/42/head`, 22:40:51Z) and the repository's visibility (its github.com page, labelled "Public", 22:37Z).
api.github.com still answers 403 here, so `verified_at`, `published_at` and `immutable` stay CI-only. Where this section
and §1 to §13 differ, this section governs; §1 to §12 were edited in place only where a fact, a cite or a statement of
what P1 builds had become wrong (so that no builder or the integrator copies stale text, CI-22's row among it), each
edit marked "(14)" and listed in 14.8. "F n" is scout-files' item n under "Changes the design needs", "D n" scout-pins'
item n.

### 14.1 What changed from the 2026-10-26 text, and why

| § | Change | Evidence |
|---|---|---|
| Header | **Adopted, edited in place** (F1). Every cite is re-mapped in 14.2. Since 19e3d98e, `tools/check-action-pins` changed 9 files (+642 −101) and `tools/check-toolchain` 8 (+888 −65). | `git diff --shortstat 19e3d98e ecebdc90 -- tools/check-action-pins` (and `tools/check-toolchain`) |
| §1 acceptance 1 | **Adopted, in place** (F2). The floor every rule uses is `Math.max(minimumReleaseAge ?? 0, MINIMUM_RELEASE_AGE_MINUTES)`, check-toolchain `check.ts:829`; `gatesRule` refuses a lower setting (`:200-203`). The old `:169` was only `gatesRule`'s read. | `tools/check-toolchain/check.ts:200-203, :829` |
| §1 acceptance 3, §2.2, §3.2, §4, §5, CI-22 | **Adopted, and widened further than proposed** (F11, D2). The image rule ages every image the tree names: each Dockerfile's `FROM` and `# syntax=` frontend, `docker-compose.yml`'s `services.*.image`, every setup-buildx step's `driver-opts` `image=` (the BuildKit builder), and every workflow's `jobs.*.container`, `jobs.*.services.*.image` and `docker://` step. The builder `moby/buildkit:v0.34.1@sha256:99368f3e…` sits on five steps, builds the production images, and nothing ages it: `buildkit.ts` checks only that its tag still names it and warns about a newer release; Dependabot never rewrites `driver-opts`, so every builder change is a hand bump, the case P1 exists for. **Declined: aging it inside `buildkit.ts`**, the placement both scouts proposed. One rule, `tools/check-toolchain/images.ts`, owns every image's age, the one exceptions list and its "entry no longer used" check, comparing the base's tree with the head's as it already must for the Dockerfiles; aging the builder in check-action-pins would split image ages across two steps, leave check-toolchain's list holding entries it cannot see used, and need a second notion of "new" beside `isNew`. The cost is one more Hub read of the builder's tag, only on a pull request that changes the builder (14.4). | `ci.yml:673`, `release-capacity.yml:56`, `release-dry-run.yml:88`, `release.yml:79`, `screening-capacity.yml:165`; `buildkit.ts:4-13`; `workflows.test.ts:2798, :2814-2820`; `8890c4e6` (2026-10-26T03:59:21Z) is not in 19e3d98e (`git merge-base --is-ancestor` false) |
| §1 acceptance 8 | **Changed: images are not bootstrapped.** P1's own pull request ages every action pin, because three of its signals exist only on CI, but no digest that is already in the base. Docker Hub is readable from here, so the integrator's local reading (14.3) is recorded in ADR Part 5 instead, and Hub reads from GitHub's runners are already proven by the builder check on every networked run ((§15, S11) the host only: the builder reads through `buildkit.ts:76-86` and `transport.get`, not `images.ts` and `readJson`, so the integrator also runs the image rule locally against Hub, 14.5). Bootstrapping images would only turn P1 red whenever Hub rebuilds `node`, since all five tags that name `43b9…` move together, which says nothing about P1's change. | run 40593100176 (push, ecebdc90), static job 122502076872, "Action pins" logged the builder's tag (F §2); scout-pins §3 (the five tags) |
| §1 acceptance 9 | **Adopted** (F16); counts in 14.5. Baseline: run 40593100176's unit job 122502077308, 382 files, 6,352 passed and 1 skipped (6,353). | `progress/scout-files.progress.md:22, :37` |
| §2.1 late `verified_at` | **Adopted, in place** (D7): "(November 2024)" is dropped; github/docs gives no date for persistent verification. The `:54` cite stands. | github/docs 3869faed `about-commit-signature-verification.md:54` |
| §2.1 release row, §3.1 step 4 | **Adopted** (D4). `immutable` is optional in the `release` schema (absent from `required`), so an absent field reads as false; a null `published_at` (required, nullable) gives no signal. One test. | `api.github.com.2026-03-10.json:137938, :138002` (83a2153c) |
| §2.1 web-flow row | **Adopted in 14.3; the row is not wrong** (D8). `968479A1…` was created 2024-01-16T18:05:42Z; the 2017 key expired 2024-01-16T20:00:00Z; `github.com/web-flow.gpg` still answers 403 here (22:19:09Z). | keyserver.ubuntu.com (HTTP 200, 22:19Z), `progress/measure.out.txt` |
| §2.1 tag-ref row, C4, §6 revisit, R7 | **Adopted as an observation** (D6). `GET /repos/{o}/{r}/activity` records pushes with a time and a `ref`, but its documented `activity_type` values (`push`, `force_push`, `branch_creation`, `branch_deletion`, `pr_merge`, `merge_queue_merge`) are branch types, so whether it records a tag push is unknown. On CI, for each pin new against the base, the age read prints the first `ref=refs/tags/<v>` entry as a note, never a finding; P1's run records it for the 12, ADR Part 5 says whether it closes R7, and P21 follows. ((§15, S1, S2) Superseded: the activity schema's `ref` is "formatted as `refs/heads/<branch name>`", so the read asks for the default branch, and a GitHub-recorded arrival inside the floor's window joins the youngest-of; the read is best effort, §3.1 step 5, E12.) | `api.github.com.2026-03-10.json:57657` |
| §2.2 tag search | **Adopted, in place** (D3). A page's span depends on the push burst: node's first page spanned 9.0 hours and its second 28.9 days; five pages reach 2026-06-24 for node and 2024-11-15 for postgres, and hold all 366 of BuildKit's tags. | scout-pins §3 |
| §2.3 | **Adopted in 14.3** (F13, D1): the same 12 commits and 13 refs, all on their default branch, every tag naming its pin, every commit `VALIDSIG 968479A1…`; the three Hub tags name their pins; BuildKit added. §2.3 stays as the 2026-10-26 record. | `progress/measure.out.txt` (22:20Z); Hub (22:38:25Z) |
| §3.1 retries | **Adopted** (F3). `withRetries` is `network.ts:144-173` and takes a `signal` (`:150`). A rate-limit answer's wait replaces that try's `BACKOFF_MS` pause (`:124`) and sleeps through `transport.sleep(ms, signal)` (`:99-115`), so a deadline still stops it. | `network.ts:99-115, :122-124, :144-173` |
| §3.1 age set | **Adopted** (F4). The age set is read from `state.workflows` (`base.ts:30-49`) whatever `everyPin` says, because `check.ts:86-95` hands the base on only when `everyPin` is unset. Each commit is aged once, not each ref: `actions/cache/restore` and `actions/cache/save` share `55cc8345`, and rule (b) allows one commit per repository. | `check.ts:86-95`; `workflows.ts:118-136` |
| §3.1 `check.ts` | **Adopted** (F5). The age loop goes after the verify loop (`:101-119`) and the builder check (`:121-129`), before the push block (`:131-168`). Its reads run four at a time under one deadline, which the builder's reads share (`checkBuilder` already takes a signal, `buildkit.ts:68`, that `check.ts:125` never passes); pins unread at the deadline are one warning on a push and one error naming them and the host on a pull request. Without it one pin's reads can take about 824 s in an outage (two git reads of up to 97 s each, three 30 s tries with the 2 s and 5 s pauses of `network.ts:124`, and three API reads of up to 210 s each, three 30 s tries with two 60 s rate-limit waits), against `static`'s 15 minutes (`ci.yml:37`); scout-files put it at about 510 s. The deadline is 180 s (E3). ((§15, N4) 824 s is a lower bound: with the SHA fetch, the advisory read and the arrival read at one 30 s try, one commit's reads can take 3 × 97 + 3 × 210 + 30 = 951 s; the deadline bounds either.) | `check.ts:22, :27, :45-55, :125`; `ci.yml:36-37` |
| §3.1, §4 transport | **Adopted** (F6). No `getJson`: `get(url, signal, headers?)` sends request headers and returns `{ status, text, headers }`. `fetchRefs` and `fetchSha` join `gitTransport`, each repository's refs in a bare repository of its own under the same scratch directory (`network.ts:57-58`), removed by `close()` (`:116-118`), never in the shallow ones `file()` fetches into (`:71-84`), whose shallow boundary would cut the history `merge-base --is-ancestor` walks. The recorded transport gains headers. | `network.ts:21-33, :45-120`; `fixtures.ts:18-80` |
| §3.1 `ci.yml` | **Adopted; cite in place** (F7, D11). The step is `ci.yml:85-88`, its `env` at `:87`. Three texts say no step calls GitHub's API: `ci.yml:13`, the comment at `workflows.test.ts:1318`, and ADR Part 1 (`:120-121`); the first two are rewritten and Part 5 amends Part 1. Permissions stay `contents: read`. Part 5 records that the token is visible to the code that step loads, the caution ADR 0063 states for approval-of-record (`:300`), and why that is accepted here (14.4, item 7). | `ci.yml:13-15, :85-88`; ADR 0066 `:120-121`; ADR 0063 `:300` |
| §4 `workflows.test.ts` | **Adopted** (F8). The shared loop at `:1396-1402` splits: `pnpm actions:check` gets `{ BASE, GITHUB_TOKEN }`, `pnpm toolchain:check` keeps `{ BASE }`. Any new assert that reads a P1 file uses `repositoryRoot`, never `CI_ROOT` (`:82`), because the rewrite's copy holds only `.github`, the Dockerfiles and the compose file (`:2888`). Added here: `ci.yml` names `github.token` exactly once (E8). | `workflows.test.ts:82, :1393-1402, :2888` |
| §3.2 Hub reads | **Adopted** (F9, D10). `readJson` (`registry.ts:71-98`) throws on a 404 (`:84-86`); P1's Hub reader returns a 404 as an answer, and the image rule then searches the tag list as for a superseded digest. The rate-limit wait goes into `registry.ts`'s retry, for npm and Hub alike. Measured: no `Retry-After` on a 200, `x-ratelimit-reset` about 60 s ahead, and `x-ratelimit-ip` varying between reads through this proxy (160.79.106.19, .128 and .143 in four reads at 22:38:25Z), so a remaining count read here is per address. | `registry.ts:66-68, :71-98`; Hub responses 22:38:25Z |
| §3.2 cites | **Adopted, in place** (F10): `FILES` `:42-52`, `dockerfileRule` `:387-414`, `readWorkingTree` `:44-48`, `readJson` `:71-98`. The B1 fix stands: `readTreeAt` (`tree.ts:51-57`) still reads only `FILES`. | `tree.ts:44-57`; check-toolchain `check.ts:42-52, :387-414` |
| §3.3 | **Adopted; cite in place** (F12). `releaseAgeExcludeRule` is `:489-547`. The extraction keeps "an entry this change adds or rewrites" (`:499, :512`) as the condition for the window checks, leaves `excludeAdvisoryFindings` (`:467-487`, npm's advisory endpoint) in `check.ts`, and moves `ageWords` (`:135`) beside `releaseAgeMinutes`. The floor's readers become: npm's three rules through `:829`, the builder's newer-release warning (a second copy today, `buildkit.ts:20, :93`), the action rule, the image rule and P2. | check-toolchain `check.ts:135, :467-547, :829`; `buildkit.ts:20, :93` |
| §3.1, §3.3 action excludes | **Adopted** (F12's improvement; E11). On CI an action `security-fix` exclude's advisory is checked against GitHub's advisory database, as the npm rule checks npm's (ci-deps' N3, check-toolchain `check.ts:463-487`): `GET /advisories/{ghsa_id}` must be unwithdrawn and list a vulnerability in ecosystem `actions` for that `owner/repo` whose range covers the base's version and not the pin's. An action exclude therefore takes a GHSA id; an image exclude keeps a GHSA or CVE id, held for form only, since no registry answers for it. Locally the read is skipped with a note, as the other API reads are. | `api.github.com.2026-03-10.json:484` (the path), `:131892` (ecosystems, `actions` among them), `:132171` (`global-advisory`) |
| §5 | **Adopted** (F15). No `gpg` in tests: `gpg --show-keys` contradicted "tests need only `gpgv`". The armored keys are dearmored and their v4 fingerprints computed in TypeScript (SHA-1 over `0x99`, the two-byte length and the public-key packet body), checked in the tests against the fingerprints `make.sh` recorded; the push run's key-rotation check reuses it, and `gpgv` stays the only binary. Both new exception lists join the committed-lists test (`check.test.ts:544-551`); the offline rule list (`:559`) gains `images` (E5). | check-toolchain `check.test.ts:544-551, :559` |
| §6 ADR | **Adopted; cite in place** (F17). Part 5 goes after `:1258`; Status (`:3-27`), Date (`:28`), Deciders (`:29-41`) and PRD sections (`:42-52`) each gain a Part 5 line. Part 5 amends Part 1's History bullet (`:120-121`) and Part 2's builder bullet (`:444-454`: the newer-release warning takes the floor, and the builder is aged as every image is). | ADR 0066 `:3-52, :120-121, :444-454, :1258` |
| §6 runbooks | **Adopted; cites in place** (F18). "Actions" is `dependency-upgrades.md:279-286`, "Base images and PostgreSQL" `:222-248`; its builder bullet (`:228-238`) says four steps where there are five (release-capacity.yml), which P1's edit there fixes. `ci.md`: `:26`, `:87-93`, `:94-100`, `:384-387`, `:397-399`. Following scout-pins' note on C5, the "Actions" text says a release made on a release branch takes an `off-default-branch` exclude, since GitHub's how-to tells action authors to work that way. | `dependency-upgrades.md:228-238`; github/docs `using-immutable-releases-and-tags-to-manage-your-actions-releases.md:14` |
| §6 controls | **Adopted** (F19): the evidence lines are `controls.ts:261` (actions) and `:262` (toolchain). | `controls.ts:252-262` |
| §6 reconciliation-001 | **Adopted** (F20): the P1 entry goes after `:657`, the last line, under the co-founder's 2026-10-26 ruling (`:653`). | `reconciliation-001.md:653-657` |
| §7 | **Adopted** (F21). The test-matrix intro (`:252-257`) says CI-18 to CI-20 "complete the series" (`:255`), so the sentence is rewritten, not only extended; the rows go after `:280`; `matrix.ts` after `:420`; `registry.ts` after `:617`, under a group comment of its own as `:605` and `:614` are. | `test-matrix.md:252-257, :280`; `matrix.ts:420`; `registry.ts:605, :614, :617` |
| §9, R4 | **Adopted; §9 in place** (D9). Dependabot's docker update gates the candidate tag's `tag_last_pushed` (`update_checker.rb:442-460`) and writes that tag's current digest (`:1143-1150`). #33 (head 5fab269e, written 2026-10-26T21:08:26Z) carries `node:26-trixie-slim@sha256:36793bcb…`, pushed 2026-10-21T17:39:48.81Z, so 5.14 days old when written (scout-pins' 5.06 is an arithmetic slip), under the 7-day cooldown of `dependabot.yml:92-93`. The cause is not verified; the branch keeps the group name `base-images` of the config before #48 (`d725977:.github/dependabot.yml:34`, no cooldown at `:28-35`), where the current group is `container-images` (`dependabot.yml:17, :90`), which points to the old config. So an images pull request can be younger than its cooldown. P1 still holds it to three days, and a re-run after the printed instant clears it. R4 stands. | dependabot-core d710c250; Hub `26-trixie-slim` → `36793bcb…` (22:38:25Z); `git fetch` of `refs/pull/33/head` (22:50:10Z) |
| §10 C3 | **Adopted, in place** (F14). `static` runs on `ubuntu-26.04` (`ci.yml:35`); run 40593100176's static job logged image ubuntu-26.04 version 20261012.163.1 and git 2.55.0; `toolset-2604.json:130` (runner-images 19874e7a) and resolute's apt 3.2.0 `Depends: gpgv` were re-read on 2026-10-27; the unit job, which runs the new tests, is on 26.04 too. | scout-files §2 |
| §11 #42 | **Adopted, in place** (F22). #42 (draft; head 6f23c42b, merge base e908c214) changes 212 files, not 143; it shares `test-matrix.md`, `reconciliation-001.md`, `matrix.ts` and `registry.ts` with P1, and also changes `pnpm-lock.yaml`, which P1 does not touch. Its hunks in the shared four (a reconciliation insert at e908c214's `:640`; LED and SCR rows at `test-matrix.md:178-219`; synth rows at `matrix.ts:219-331` and `registry.ts:362-518`) miss every region P1 edits. None of P1's files is on LANES' "Not while #42 is open" list (`LANES.md:84-91`); the shared four follow rule 6 (`:93`). | `git diff --name-only` and `-U0` of e908c214 against 6f23c42b, 22:40:51Z |
| §11 ci-browser | **No edit** (F23): still true that ci-browser added no pin and no image; it moved `static` to 26.04 (C3). | `ci.yml:35` |
| §3.1 step 4 | **Adopted: `X-GitHub-Api-Version: 2026-03-10`** (D5): the same fields for every endpoint P1 reads and no end of support, where 2022-11-28's ends 2028-03-10. A correction to D5: the repository does set a version already, `2022-11-28` in `approval-of-record.ts:309`; P19 proposes moving it. Like approval-of-record, P1 takes the API base from `GITHUB_API_URL` (`:289`) and sends a `User-Agent` (`:309`). | github/docs `data/tables/rest-api-versions.yml:5-8`; `tools/approval-of-record/approval-of-record.ts:289, :309` |
| §3.1 cites | **Adopted, in place** (D11): "Action pins" `ci.yml:85-88` (env `:87`), "Toolchain" `:92-95`, `static` on `ubuntu-26.04` (`:35`). | `ci.yml:35, :85-95` |
| §13 open | **Adopted in 14.8** (D12): the GitHub MCP read tools refuse other repositories and return no `verification` for ours, so the three fields stay readable only on CI. | scout-pins §2 |
| §3.1 builder (this re-read) | **Adopted** (scout-files' borderline proposal, taken because P1 rewrites those lines). `isNew` (`check.ts:123-124`) is true whenever the base is unset, which `everyPin` makes so on any change that edits the checker, on a push too: P1's own merge push, and P2's, would fail on a builder tag Hub moved. Newness now comes from `state.workflows`, as the age set's does, and on a push the builder's faults warn (E4). | `check.ts:80-95, :121-129`; `buildkit.ts:74` |
| §3.1 step 4 (this re-read) | **Changed:** `verified_at` is read from `GET /repos/{o}/{r}/git/commits/{sha}`, whose `git-commit` schema carries `verification` with `verified_at` required and nullable, rather than `GET …/commits/{sha}`, whose answer also lists the commit's files and stats. | `api.github.com.2026-03-10.json:72274` (path), `:162478` (`git-commit`), `:162598-162625` (`verification`, `verified_at`, `required`) |
| §4, §5 window cases (this re-read) | **Declined: moving the npm window cases** to `exclude-window.test.ts`. They stay in check-toolchain `check.test.ts` (`:224`, `:273`) unchanged, which is what proves the extraction a no-op end to end; `exclude-window.test.ts` adds direct cases. | check-toolchain `check.test.ts:224, :273` |

### 14.2 Cites at ecebdc90

Old cites are the design's, at 19e3d98e; new ones are at ecebdc90. Builders work from the new column.

| Design § | Old (19e3d98e) | New (ecebdc90) |
|---|---|---|
| §1 acc. 1, §3.3 | check-toolchain `check.ts:169`, the floor | `check.ts:829` (`Math.max(minimumReleaseAge ?? 0, MINIMUM_RELEASE_AGE_MINUTES)`); `gatesRule` refuses under 4,320 at `:200-203`; `MINIMUM_RELEASE_AGE_MINUTES` is `policy.ts:11`, `EXCLUDE_MAX_DAYS` `:13` |
| §3.1 | `network.ts:54-68`, `withRetries` | `network.ts:144-173` (takes `signal`, `:150`; "stopped by the deadline", `:153`); `NetworkError` `:127-135` |
| §3.1 | `network.ts:35`, `BACKOFF_MS` | `network.ts:124`; `TRIES` `:122`; one read's limit `READ_TIMEOUT_MS` `:38` |
| §3.1, §4 | the transport (`liveTransport`) | `Transport` `network.ts:21-33` (`lsRemote`, `file`, `get` returning `{ status, text }` only, `sleep(ms, signal)`); `gitTransport` `:45-120` (scratch `:57-58`, shallow blobless fetch per commit `:71-84`, `close()` `:116-118`); `index.ts:10-14` calls `gitTransport()` and `close()` |
| §3.1 | `base.ts:31-49`, `baseState` | `base.ts:30-49` (`hasChecker` `:44`, `everyPin` `:47`); `selectPins` `:60-67` unchanged |
| §3.1 | `check.ts:71-89`, the verify loop | `check.ts:101-118`, note `:119`; the verdict carries `warnings` (`:114`) |
| §3.1 | (none) | the builder check `check.ts:121-129` (`isNew` `:123-124`); `buildkit.ts`: `BUILDKIT_AGE_MS` `:20`, `builderOf` `:39-48`, `checkBuilder` `:65-106` (signal option `:68`, fault `:74`, tag read `:76-77`, list read `:85-86`, the age comparison `:93`) |
| §3.1 | `check.ts:90-103`, push re-reads | `check.ts:131-168` (`PUSH_CONCURRENCY` `:22`, `PUSH_DEADLINE_MS` `:27`, `pool` `:45-55`, the one unread warning `:165-167`) |
| §3.1 | check-toolchain `check.ts:53-54`, "a push run … warns" | `check.ts:60-61`; `index.ts:28` reads every event but `push` as `pull_request`; only the expired-exclude finding warns on a push (`:536-544`) |
| §3.1 | `ci.yml:84-87`, "Action pins" | `ci.yml:85-88`, env `:87`, comment `:81-84`; "Toolchain" `:92-95`, env `:94`; `static` `:31-171`, `runs-on: ubuntu-26.04` `:35`, `timeout-minutes: 15` `:37`, checkout with full history and `persist-credentials: false` `:40-41`; permissions `:13-15` |
| §3.1 | (none) | rules (a) `workflows.ts:95-111` (`./` `:100`, `docker://` `:101`) and (b) `:118-136`; (c) `tools/test/workflows.test.ts:2183`; (d) `:2886-2891`; nested `docker://…@sha256` skipped `verify.ts:88, :100` |
| §3.2 | `tree.ts:51-57` `readTreeAt`, `:44-47` `readWorkingTree`, `:32-41` `dockerfilePaths` | `:51-57`, `:44-48`, `:32-41` (file unchanged) |
| §3.2 | check-toolchain `check.ts:40-48`, `FILES` | `check.ts:42-52` (now with `.npmrc` and `.pnpmfile.cjs`); `Tree` `:58` |
| §3.2 | `check.ts:243`, `dockerfileRule` | `check.ts:387-414` |
| §3.2 | `registry.ts:57-81`, the retry | `readJson` `registry.ts:71-98` (transient statuses `:66-68`, backoff 1 s then 2 s `:74`, per-try timeout `:79`, a 404 fatal `:84-86`) |
| §3.3 | `check.ts:288-345`, `releaseAgeExcludeRule` | `check.ts:489-547` (added or rewritten entries `:499, :512`; expired `:536-544`); `excludeAdvisoryFindings` `:467-487`; `ageWords` `:135`; `checkToolchain` `:820-852`; `checkOffline` `:810-817` |
| §3.3 | (none) | the exceptions schema `policy.ts:122-126` (GHSA only) |
| §4 | `collection.test.ts:20-26, 41-42` | unchanged; temporary directories in `beforeAll` or a test, never at module level (`:11-17`) |
| §5 | (none) | `buildkit.test.ts:44-77`; `tree.test.ts:36-66`; check-toolchain `check.test.ts:544-551` (committed lists), `:559` (offline rules), `:224` and `:273` (window cases) |
| §6 | ADR 0066 Part 4 `:626` | Part 4 is `:989-1258`; header `:3-52`; Part 1 History `:120-121`; Part 2 builder bullet `:444-454` |
| §6 | `dependency-upgrades.md:204` "Actions", `:162` "Base images and PostgreSQL" | `:279-286`; `:222-248` (builder bullet `:228-238`) |
| §6 | `ci.md` | `:26` (static row), `:87-93` (Action pins), `:94-100` (Toolchain), `:384-387` (local commands), `:397-399` ("Changing CI") |
| §6 | `controls.ts:252` | `:252`; evidence `:261`, `:262` |
| §6 | reconciliation-001 (none) | after `:657` |
| §7 | test-matrix, `matrix.ts`, `registry.ts` | `test-matrix.md:252-257` (intro), `:280` (CI-20); `matrix.ts:420`; `registry.ts:617`, group comments `:605, :614` |
| §10 C3 | `lane-b-ci.md:59` | `ci.yml:35` |
| §11 | `pr42-files.txt:85, 86, 136, 137` (143 files) | lines 91, 92, 203, 204 of `git diff --name-only e908c214 6f23c42b` (212 files) |
| §4, new asserts | (none) | `workflows.test.ts:82` (`CI_ROOT`), `:1318-1319` (permissions), `:1393-1402` (the two steps' loop), `:2719` (no `services:`), `:2798` (`# syntax=` by digest), `:2806` (builder form), `:2814-2820` (container and `docker://` by digest), `:2888` (the rewrite's copied files), `:2390-2393` (approval-of-record's token env, the precedent) |
| §15 (the fold) | (none) | check-action-pins: `selectPins` puts every ref in the verify set when the base is unset, `base.ts:63`; `PIN` admits a reusable workflow's path, `workflows.ts:14`, and `actionUses` collects `jobs.*.uses`, `:73`; `nestedProblems` reads composites only, `verify.ts:95`; a reusable workflow's tag alone, `:226`; both SHAs on a moved tag, `:223`; `get` follows redirects, `network.ts:96`; the test repository writes only `index.ts` at the base, `check.test.ts:64`, with exact read lists at `:82`, `:90`, `:95`, `ls-remote` counts at `:106`, `:112`, and the cases at `:129`, `:144`, `:173`, `:197`. check-toolchain: `readJson` replaces the caller's signal, `registry.ts:79`, and sleeps unstoppably, `:75`; `checkToolchain` is called at `index.ts:30`; the event's one use, `check.ts:540`; `excludeAdvisoryFindings` refuses a package the base lacks, `:471-473`; `rangeHolds`, `policy.ts:195`; the committed lists read beside their test, `check.test.ts:547`; the networked rule list, `:160`; `fakeRegistry`, `:51`. Workflows: `secrets.GITHUB_TOKEN` at `release.yml:346`, `release-dry-run.yml:224`; computed `file:` at `release.yml:106`, `release-dry-run.yml:115`; `pip install pyx12`, `ci.yml:48`; the job asserts with `secrets.`, `workflows.test.ts:1127, :1150, :1277`; the permissions `it`, `:1316`; CI-13's `^FROM` read, `:2782` |

### 14.3 Pins and digests measured today

Pins: scout-pins' blobless fetch and `gpgv`, 2026-10-27T22:19Z to 22:20:28Z, ages at 22:20:28Z, floor
`pnpm-workspace.yaml:44` (`minimumReleaseAge: 4320`). The 12 commits and 13 refs are §2.3's (lane-b-ci.md:548-561); no
pin was added or changed since, and there is no composite action in the repository and no `./` or `docker://` use.
The use counts are higher than §2.3's because `content-calendar.yml`, `release-capacity.yml` and `release-dry-run.yml`
arrived since 6ddd587 and reuse the same pins. For all 12: every pin is still its repository's newest `v*` tag, the
tag names the pinned commit, the commit is an ancestor of the default branch, the committer is `GitHub
<noreply@github.com>`, gpgv reports `VALIDSIG 968479A1AFF927E37D1A566BB5690EEEBB952194` (created
2024-01-16T18:05:42Z), and the signature time equals the committer time to the second. No commit is signed with SSH,
X.509 or the 2017 key, which expired 2024-01-16T20:00:00Z.

| Pin | Version | Uses | Default branch | Youngest local signal | Age (d) | Old enough from |
|---|---|---|---|---|---|---|
| `actions/checkout@3d3c42e5` | v7.0.1 | 22 | main | commit 2026-07-17T18:45:11Z | 102.15 | 2026-07-20T18:45:11Z |
| `actions/setup-node@949feb24` | v7.1.0 | 22 | main | commit 2026-10-08T02:43:26Z | 19.82 | 2026-10-11T02:43:26Z |
| `pnpm/action-setup@ea17c68d` | v6.1.0 | 17 | master | tagger 2026-09-05T07:26:11Z (annotated, PGP `649E4D4AF74E7DEC`) | 52.62 | 2026-09-08T07:26:11Z |
| `actions/setup-python@6d4fd22b` | v7.1.0 | 1 | main | commit 2026-10-22T02:33:06Z | **5.82** | 2026-10-25T02:33:06Z |
| `actions/upload-artifact@cf430e03` | v7.0.2 | 9 | main | commit 2026-10-07T10:00:52Z | 20.51 | 2026-10-10T10:00:52Z |
| `actions/download-artifact@9000827c` | v8.0.2 | 9 | main | commit 2026-10-07T10:00:57Z | 20.51 | 2026-10-10T10:00:57Z |
| `actions/cache/{restore,save}@55cc8345` | v6.1.0 | 11 + 6 | main | commit 2026-06-23T20:30:28Z | 126.08 | 2026-06-26T20:30:28Z |
| `docker/setup-buildx-action@f87e5991` | v4.4.1 | 5 | master | commit 2026-09-16T07:47:45Z | 41.61 | 2026-09-19T07:47:45Z |
| `docker/build-push-action@c3c9e263` | v7.4.0 | 7 | master | commit 2026-09-15T07:29:04Z | 42.62 | 2026-09-18T07:29:04Z |
| `docker/login-action@81c6f93d` | v4.7.0 | 2 | master | commit 2026-10-23T15:11:41Z | **4.30** | 2026-10-26T15:11:41Z |
| `aquasecurity/trivy-action@ed142fd0` | v0.36.0 | 5 | master | tagger 2026-04-22T09:29:59Z (annotated, SSH-signed) | 188.54 | 2026-04-25T09:29:59Z |
| `actions/attest-build-provenance@4d101475` | v4.2.2 | 1 | main | commit 2026-08-06T19:54:05Z | 82.10 | 2026-08-09T19:54:05Z |

Two pins are under Dependabot's seven days: login until 2026-10-30T15:11:41Z and setup-python until
2026-10-29T02:33:06Z. Both pass the three-day floor.

Images: Docker Hub's `/v2/repositories/<ns>/<repo>/tags/<tag>`, 2026-10-27T22:38:25Z (scout-pins read the same values
at 22:21Z). Every tag still names its pin, `tag_last_pushed` is the youngest signal in each, and no digest is
superseded.

| Image | Where | `tag_last_pushed` | Youngest `images[]` | Age (d) | Old enough from |
|---|---|---|---|---|---|
| `node:24-trixie-slim@sha256:43b9ba11…` | `apps/web/Dockerfile:7, :24`; `apps/worker/Dockerfile:5, :23` | 2026-10-21T17:39:11.31Z | 17:39:10.53Z | 6.21 | 2026-10-24T17:39:11Z |
| `postgres:18-trixie@sha256:edb0c08d…` | `docker-compose.yml:8` | 2026-10-21T19:08:32.86Z | 19:08:22.62Z | 6.15 | 2026-10-24T19:08:32Z |
| `moby/buildkit:v0.34.1@sha256:99368f3e…` | `ci.yml:673`, `release-capacity.yml:56`, `release-dry-run.yml:88`, `release.yml:79`, `screening-capacity.yml:165` | 2026-10-20T21:37:36.86Z | 21:36:33.58Z | 7.04 | 2026-10-23T21:37:36Z |

v0.34.1 is still BuildKit's newest release. No workflow has a `container:`, a `services:` block or a `docker://` step,
and neither Dockerfile has a `# syntax=` line. Nothing trips today.

**What P1's own pull request is expected to print on CI** (its first run, after 2026-10-28):
- "Action pins": the bootstrapping note (the merge base has no `tools/check-action-pins/age.ts`), then one block per
  commit, 12 blocks for the 13 refs: on its default branch; its tag names it; each signal with its source (commit,
  tagger for action-setup and trivy-action, web-flow `VALIDSIG`, `verified_at` (14) with its `reason`, the release's
  `published_at` and `immutable`, or "no release"); (14) the arrival on its default branch, or the activity note saying
  why none was read (§3.1 step 5); the youngest signal, the age and the instant it was old enough. Expected: all 12
  pass, each `verified_at` no later than three days before the run. A null or absent `verified_at` fails that pin as
  "age unprovable" and the integrator stops (§8). (14) 36 to 60 API calls (two per commit and one to three activity
  pages) against 1,000 an hour; about 10 s at four at a time. Then the builder: "its tag is the index 99368f3e…" and
  "no newer release is three days old" unless BuildKit releases first.
- "Toolchain": the `images` offline rule passes, and the image rule notes that no image is new against the base and
  nothing is read (E2).
- Its merge's push run ages the same 12 again, since that base also lacks `age.ts`, and every finding there is a
  warning. (14) Its verify loop also reads all 13 refs again, since the change edits the checker; on that push a read
  fault or a moved tag is a warning, under the 120 s push deadline (S4), so neither an outage nor a tag moved upstream
  can turn the build branch red.

### 14.4 Scope decisions

1. **The image rule widens to every image the tree names, workflows included. Recommended, and the safer option.**
   (a) As written: the Dockerfiles' `FROM` and the compose file's `services.*.image`. It leaves out the BuildKit builder,
   which runs every build of both production images and is held today only to "its tag still names the digest"
   (`buildkit.ts:74-81`), so a hand bump to a release pushed minutes ago passes. (b) The scouts' placement: age the
   builder inside `buildkit.ts`. That covers today's builder, but splits image ages and their exceptions across two
   checkers, and a `jobs.*.container` added later is in neither. (c) One rule, `tools/check-toolchain/images.ts`, over
   every image the tree names: each Dockerfile's `FROM` and `# syntax=` line (`workflows.test.ts:2798` allows the latter
   by digest), `docker-compose.yml`'s `services.*.image`, every setup-buildx step's `driver-opts` `image=`, and every
   workflow's `jobs.*.container` (a string or its `image`), `jobs.*.services.*.image` and `docker://` step. **Taken:
   (c).** Every image a workflow can run is then aged or refused: `services:` is refused (`workflows.test.ts:2719`) and
   a `docker://` use by rule (a) (`workflows.ts:101`), and the rule reads them anyway, so it holds on its own if either
   refusal is ever lifted. (§15, S6) It holds on its own only with the image references it does not read refused: the
   offline `images` rule refuses a `--from=` or `from=` naming anything but an earlier stage, `docker-image://` in
   `build-contexts`, a tracked `Dockerfile*`, `Containerfile*` or compose file other than the three it reads, and a
   compose `build:` (§3.2). The cost: `tree.ts` reads `.github/workflows/*.yml` at both commits (`git ls-tree`, as
   `base.ts:34-43` does), and one Hub read of the builder's tag on a pull request that changes the builder. Out of
   scope, unchanged: an image a Docker or composite action runs from its own `action.yml` (C9, R6; `verify.ts:88, :100`),
   and Trivy's vulnerability database, which `trivy-action` pulls by tag (P2's). (§15, S7) A Docker action whose image
   is not `docker://…@sha256:<64 hex>` is now refused, and a digest-pinned one stays unaged (C9, R6).
2. **Where the builder's age lives.** In `images.ts`, with every other image (14.1, §1 acceptance 3 row). `buildkit.ts`
   keeps what it does on every networked run, the tag-names-digest check and the newer-release warning; that warning
   takes the floor from `releaseAgeMinutes` (`exclude-window.ts`), and `BUILDKIT_AGE_MS` (`buildkit.ts:20`) is deleted,
   so the builder's two age questions, "is the pinned one three days old" and "is a newer one three days old", read one
   floor (N3 of the 2026-10-26 review).
3. **Images are not bootstrapped (E2).** Only a digest new against the base is read, on every event, P1's own pull
   request included; the integrator's Hub reading (14.3) goes into ADR Part 5 as the measured state.
4. **The builder's newness, and its faults on a push (E4).** In scope because P1 rewrites `check.ts:121-129` for the
   shared deadline and the floor. `isNew` is taken from `state.workflows`, which `baseState` always returns
   (`base.ts:30-49`), not from the `base` that `check.ts:86-95` leaves undefined whenever `everyPin` is set. Without
   that, a change that edits the checker (P1 itself, then P2, whose files are in `tools/check-action-pins`) reads the
   unchanged builder as new, and a tag Hub moved after the merge fails it, on its merge's push run too. On a push, every
   builder fault is a warning, as every age finding is (acceptance 7); on a pull request a new builder whose tag no
   longer names its digest still fails. (§15, S4) The same reasoning reaches ci-deps' verify loop, which `check.ts`
   also runs over every ref when `everyPin` is set: on a push, a read fault or a moved tag of a ref the base holds is a
   warning, a problem in what was read stays an error, and the loop runs under the push deadline (§3.1, E16).
5. **What ci-deps added that P1 must fit.**
   - The transport (`network.ts:21-33`): `file`, the scratch directory and `close()`, a `get` with no headers, and a
     `sleep` that a signal stops. P1 extends `get` and adds its git reads to `gitTransport` (E6).
   - `withRetries` takes a signal (`network.ts:144-173`); the push re-reads run through `pool` four at a time under one
     deadline (`check.ts:22, :27, :45-55`). The age reads reuse both (E3).
   - `buildkit.ts` and the builder check on every networked run (items 2 and 4).
   - Rules (a) and (b) (`workflows.ts:95-111, :118-136`): every age-set ref is `owner/repo@<40 hex>`, and one commit per
     action, so a commit is aged once (E10). Rule (d), the simulated Dependabot rewrite (`workflows.test.ts:2886-2891`),
     copies only `.github`, both Dockerfiles and the compose file and runs three test files on the copy, so a new
     assert that reads a P1 file outside `.github` reads it from `repositoryRoot` (14.1, §4 row).
   - check-toolchain's new rules and their order (`check.ts:820-852`; `checkOffline` `:810-817`, its rule list asserted
     at `check.test.ts:559`): the image rule runs after `dockerfileRule`, and the offline `images` form rule joins
     `checkOffline` after `Dockerfiles` (E5).
   - The npm exclude's advisory check, ci-deps' N3 (`check.ts:463-487`): it stays in `check.ts`, and the action excludes
     get the same kind of check against GitHub's advisory database (E11).
   - The exceptions schema accepts GHSA ids only (`policy.ts:122-126`). The action list does too (E11); the image list
     has a schema of its own that also accepts a CVE id, since a base image's fix is usually published as one.
   - `dependabot.yml`'s `container-images` group with `default-days: 7` and node majors ignored (`:88-108`, `:95-97`),
     and the actions' `default-days: 7` (`:74-86`): §9 as amended by 14.1.
6. **What ci-browser added that P1 must fit.** `static` and `unit` run on `ubuntu-26.04` (`ci.yml:35`), with `gpgv`
   and git 2.55.0 (run 40593100176), so C3 is now a fact; the release's capacity chain stays on 24.04 (F5) and runs
   no checker. It added no pin and no image. Its test files under `tools/ci` are collected (`collection.test.ts:43`)
   and untouched by P1.
7. **The job's token on the "Action pins" step. Recommended, the safer option that keeps C2.** (a) As designed:
   `GITHUB_TOKEN: ${{ github.token }}` in that one step's `env`. (b) No token: `verified_at`, `published_at` and
   `immutable` stay unread, so the gate falls back to the web-flow signature time, which S4 showed is not proven to be
   GitHub's clock. (c) A separate job holding the token that runs only the age read: a new job under `all green`, the
   same code loaded, more to keep. **Taken: (a).** The token is `contents: read` (`ci.yml:14-15`) with GitHub's
   `metadata: read` (run 40593100176's static job logged "Contents: read" and "Metadata: read"), and the repository is
   public (its github.com page, 2026-10-27T22:37Z), so it reads nothing an anonymous reader cannot, beyond a higher rate
   limit, and nothing the full-history checkout (`ci.yml:40-41`, which already used the same token) does not hold. A
   same-repository pull request can already edit `ci.yml` to hand the token to any step, so the step gives a change's
   author no new reach; a fork's pull request and Dependabot's runs get a read-only token. What it adds is exposure to
   the packages that step loads (`tsx` and the checker's imports, from the frozen lockfile under the release age), the
   caution ADR 0063 states for approval-of-record (`:300`); Part 5 records it, with `workflows.test.ts:2390-2393` as the
   precedent. (§15, N12) Part 5 also records two facts. Every earlier step of the job can reach the token step's
   environment through `$GITHUB_ENV` (`NODE_OPTIONS`, for one), the unpinned `pip install pyx12` (`ci.yml:48`) among
   them (P25). And the token already reaches third-party code in the same job: setup-node 949feb24 defaults its `token`
   input to `github.token` (`action.yml:18-20`, read 2026-10-28T01:07Z), as checkout 3d3c42e5 does (`action.yml:24`,
   01:13Z). A repository gone private is
   the revisit trigger, since the token could then read what an anonymous reader cannot. The token is set on that step
   alone, never on the job, and `ci.yml` names `github.token` exactly once (E8), with no `secrets.`, `github[` or
   `toJSON(github` / `toJSON(secrets` anywhere in it; "Toolchain" keeps `{ BASE }`, since it reads only npm and Docker
   Hub. Three texts change: `ci.yml:13` becomes
   "The jobs read the repository and nothing else. One step, Action pins, reads public facts about the pinned actions
   from GitHub's API with this read-only token (docs/adr/0066, Part 5)."; the comment at `workflows.test.ts:1318` gains
   "and only the Action pins step is given it"; and Part 5 amends Part 1's History bullet (`:120-121`), which gains
   "(amended by Part 5)".
8. **The other follow-ups stay apart.** P2 (Trivy's version) imports `releaseAgeMinutes` from `exclude-window.ts` and
   edits `tools/check-action-pins` after P1; whichever merges second resolves, and P2's own pull request then ages every
   pin again only if its base lacks `age.ts` (it will not, once P1 merges). P4 shares ADR 0066, the matrix and synth.
   P5 (ci-catalog) is not this session's. A pin or image another pull request adds after P1 merges is aged by P1.

### 14.5 Build plan on this base

The branch `co-001/ci-pin-age` is cut at ecebdc90 (the worktree `/home/user/ci-pin-age`). B2 lands its no-op refactor
first, because B1 imports `releaseAgeMinutes` and the window from it; then the two builders work in parallel on
disjoint files, and the integrator follows. Every builder runs its tests under the lock and records the red commit's
failing test names in the pull request's description. (§15) Every ★ case goes through an existing entry point,
`checkToolchain` or `checkActionPins`, and imports only modules that exist before the change, so commits 2 and 4 are
red on behaviour (a message or note the unchanged checker does not print), not on a missing import; the cases that
import `images.ts` or `age.ts` arrive with those files in commits 3 and 5 (N13, N14). Commits 2 and 4 may also fail
`pnpm typecheck`; commits 1, 3, 5 and 6 pass every command.

**B2, `tools/check-toolchain`** (and nothing else):
- Commit 1, no-op refactor, green. `exclude-window.ts` (new) takes from `releaseAgeExcludeRule` (`check.ts:489-547`)
  the window checks (`:511-535`) and the expired rule (`:536-544`); the caller keeps "an entry this change adds or
  rewrites" (`:499, :512`) and `excludeAdvisoryFindings` (`:467-487`). It also exports `releaseAgeMinutes(workspace)`,
  replacing the inline `Math.max` at `:829`, and `ageWords`, moved from `:135`. Proof: check-toolchain's
  `check.test.ts` passes unchanged, its window cases (`:224`, `:273`) included. `exclude-window.test.ts` (new) adds 4
  direct cases: the `security-fix` window's three bounds; the reasoned kinds' two; the expired rule (an error on a
  pull request that edits the list, a warning elsewhere); the floor never under `MINIMUM_RELEASE_AGE_MINUTES`.
- Commit 2, failing first, red: `images.test.ts` (new) with its two ★ cases, both through `checkToolchain` (a new
  digest pushed 2 days ago fails and one pushed 3 days ago passes; the same digests at base and head, with a recorded
  Hub that would answer "superseded", make zero Hub reads and print the image rule's note that no image is new and
  nothing is read), and `tree.test.ts`'s two cases: `readTreeAt` returns the base's Dockerfiles, and both trees hold
  their workflows and the paths of the tracked image files outside the three the rule reads (S6).
- Commit 3, the image rule, green:
  - `tree.ts`: `readTreeAt` (`:51-57`) also reads the base's Dockerfiles (`git ls-tree --name-only <commit> apps/`,
    mirroring `dockerfilePaths`, `:32-41`) and `.github/workflows/*.yml`; `readWorkingTree` (`:44-48`) reads the
    head's workflows; both list every tracked `Dockerfile*`, `Containerfile*` and compose file (`compose.y*ml`,
    `docker-compose*.y*ml`, at any depth) other than `apps/*/Dockerfile` and `docker-compose.yml` (S6). `Tree`
    (`check.ts:58`) gains `workflows` and those paths.
  - `check.ts`: `FILES` (`:42-52`) gains `compose: 'docker-compose.yml'` and
    `imageAgeExceptions: 'tools/check-toolchain/image-age-exceptions.json'`; `checkToolchain` runs the image rule after
    `dockerfileRule`; `checkOffline` runs the `images` form rule after `Dockerfiles` (E5).
  - `images.ts` (new): `imagesOf(tree)`, every image with where it is (14.4, item 1); the form rule (`name:tag@sha256:<64
    hex>`, with a tag, since a tagless digest has nothing to ask Hub; and every reference the rule does not read
    refused: a `COPY --from=` or `RUN --mount=…,from=` naming anything but an earlier stage, a `docker-image://` in
    `build-push-action`'s `build-contexts`, a tracked image file from `tree.ts`'s list, a compose `build:`; S6, E17);
    the age set, the digests the base names nowhere; `imageAge`, the youngest of `tag_last_pushed`, `last_updated` and
    each `images[].last_pushed` when the tag's `digest`, or one of its `images[].digest` (N9), equals the pin, else a
    search of `tags?page_size=100&ordering=last_updated` for at most 5 pages, else the fail-closed message naming the
    tag's current digest, its push time and when that digest turns old enough, which no exclude kind clears (B1); a
    registry other than Docker Hub is "age unprovable", the one place an image `age-unprovable` exclude applies (B1,
    E15). Its reads run four at a time under one 180 s deadline (E3), handed to `readJson` as its signal (S5). Findings
    warn on a push.
  - `registry.ts`: `hubTag` and `hubTags` read `hub.docker.com` through `readJson` (`:71-98`), with a 404 returned as
    an answer ("no such tag") rather than the fatal error of `:84-86` (E14); `Registry` gains the two methods, so
    `createRegistry` serves both hosts and `index.ts` is unchanged. `readJson` gains (S5) a `signal`, combined with each
    try's timeout through `AbortSignal.any`, a sleep the signal stops, and a per-host try timeout (Hub 30 s, npm 60 s);
    and the rate-limit wait for both hosts: on a 429, or a 403 with `Retry-After` or `x-ratelimit-remaining: 0`, it
    waits for `Retry-After` or the reset (`x-ratelimit-reset`, epoch seconds), capped at 60 s, in place of that try's
    1 s or 2 s pause (`:74`).
  - `policy.ts`: the image exceptions' schema, `{ image, kind: "security-fix" | "age-unprovable", advisory: GHSA or
    CVE id or null, fixes: { package, version } (required for `security-fix`, absent otherwise; S10), reason, added,
    expires }`; `image-age-exceptions.json` (new) is `{ "entries": [] }`.
  - `images.test.ts`'s other 15 cases (17 in all, listed below); `registry.test.ts` +3 (the wait, capped; a Hub 404 as
    an answer; a signal stops a try and a pause, and a Hub try times out at 30 s, S5). In existing cases only (S3,
    S12): `check.test.ts`'s committed lists (`:544-551`) assert `image-age-exceptions.json` empty (`age-exceptions.json`
    is B1's, asserted in `age.test.ts`), its offline rule list (`:559`) and its networked rule list (`:160`) each gain
    `'images'` after `'Dockerfiles'`, and `fakeRegistry` (`:51`) answers `hubTag` and `hubTags` from a recorded table.
    `tree.test.ts`'s two cases from commit 2 now pass.

**B1, `tools/check-action-pins`, `ci.yml`'s step and its asserts:**
- Commit 4, failing first, red: `age.test.ts` (new) with its six ★ cases through `checkActionPins` (§5's six; the
  base-pin note among them, red first because the note is new; "tag moved" with the verify loop's and the age loop's
  tag reads disagreeing, so the message asserted is the age loop's, N14); check-action-pins `check.test.ts`'s three
  cases: the builder is not new on a change that edits the checker, and its faults warn on a push (E4), and on a push
  a verify-loop read fault or moved tag of a ref the base holds warns while a problem in what was read stays an error
  (S4, E16); `tools/test/workflows.test.ts`'s step loop (`:1396-1402`) split, expecting `{ BASE, GITHUB_TOKEN }` on
  "Action pins", and in the `it` at `:1316` the token asserts of E8.
- Commit 5, the age rule, green:
  - `age.ts` (new): the age set from `state.workflows` (bootstrapping when the merge base lacks `age.ts`), aged once
    per commit (E10), a ref whose verify read failed not aged again (S3); per commit, `fetchRefs` (one `ls-remote
    --symref` of `HEAD` and the tag, so a missing tag is the answer "no tag <v>", N6; then a blobless fetch of the
    default branch alone and the tag, N16), the tag-names-pin and default-branch checks, the signals of §2.1 read from
    the pinned commit, and on CI the API reads (E7; `reason` printed beside `verified_at`, `gpgverify_error` and
    `gpgverify_unavailable` a failed read, S9) and the arrival read (§3.1 step 5, E12: best effort, a young arrival a
    signal, S1, S2); the floor over the youngest of every signal read, under a reasoned exclude too, each kind waiving
    only its own requirement (B1, E15); a signal dated in the future named, with "choose another release" (N7); the
    excludes in `age-exceptions.json` with the window from `exclude-window.ts` and, on CI, the advisory check (E11);
    four at a time under one 180 s deadline shared with the builder check (E3).
  - `keys.ts` (new): dearmor and v4 primary fingerprints in TypeScript (E9); `github-web-flow.asc` (new, both keys);
    the push run's rotation warning compares fingerprint sets.
  - `network.ts`: `get(url, signal, headers?)` returns `{ status, text, headers }`, and a read that sends a token uses
    `redirect: 'manual'`, a 3xx its answer (N15, E20); `gitTransport` gains `fetchRefs` (the `--symref` read inside it,
    so `lsRemote` keeps its count), `object`, `isAncestor` and `fetchSha`, in bare repositories of their own under its
    scratch directory (E6); `withRetries` takes an optional `pause` read from a refused answer, capped at 60 s and slept
    through `transport.sleep(ms, signal)`.
  - `fixtures.ts`: the recorded transport answers the new reads, carries headers both ways, and records each pause.
  - `buildkit.ts`: `BUILDKIT_AGE_MS` deleted; `checkBuilder` takes the floor and the event (E4).
  - `check.ts`: the age loop after the builder check (`:121-129`), before the push block (`:131-168`); the builder's
    newness from `state.workflows`; on a push, the verify loop's read faults and moved tags for a ref
    `state.workflows` holds are warnings, a problem in what was read and every fault of a ref new against the previous
    head stay errors, and the loop runs under `PUSH_DEADLINE_MS`, refs it leaves unread one warning, or one error naming
    the new ones (S4, E16); `CheckOptions` gains `floor`, `ci`, `token`, `apiUrl` and the web-flow key file beside
    `now` (S3).
  - `workflows.ts`: rule (a) refuses a `jobs.*.uses` that calls a reusable workflow (S7, E18).
  - `verify.ts`: `parseActionMeta` reads `runs.image`; a Docker action whose image is not `docker://…@sha256:<64
    hex>` is refused at the top level and, in `nestedProblems`, at any depth (S7, E18).
  - `index.ts`: passes `GITHUB_ACTIONS`, `GITHUB_TOKEN`, `GITHUB_API_URL`, the event and the floor
    (`releaseAgeMinutes` of the checkout's `pnpm-workspace.yaml`).
  - `age-exceptions.json` (new, `{ "entries": [] }`); `testdata/age/` (new): `make.sh` (a short `GNUPGHOME`, and the
    expired key's signature after its expiry made by signing first and adding the expiring self-signature after,
    N10), the two synthetic public keys and the signed commit and tag objects (§5).
  - `.github/workflows/ci.yml`: "Action pins"' `env` becomes `{ BASE: "${{ steps.range.outputs.base }}", GITHUB_TOKEN:
    "${{ github.token }}" }` (`:87`); its comment (`:81-84`) names the age rule; `:13` is rewritten (14.4, item 7).
  - `tools/test/workflows.test.ts`: the comment at `:1318`, and in the `it` at `:1316` (E8, S8), read from `CI_ROOT`
    (the rewrite's copy holds `ci.yml`, and the rewrite leaves the line as it is): `ci.yml` names `github.token`
    exactly once, in the Action pins step's `env`, and contains no `secrets.`, no `github[` and no `toJSON(github` or
    `toJSON(secrets`.
  - The existing check-action-pins `check.test.ts` cases (S3, E22): `repository()` gains `baseAge`, default true,
    writing `tools/check-action-pins/age.ts` at the base, and false only where `baseChecker` is false; `network()`
    answers each fixture pin's age reads as an old commit on the default branch with a recorded immutable release and
    `verified_at: null`, and the calls that age a pin (`:89`, `:105`) pass `ci: true` and a token, so these cases need
    no `gpgv`. Every existing assertion stays as it is except two: the new age note joins the notes, and the exact read
    list at `:90` gains the new pin's age reads (its `fetchRefs`, then its API reads), since that pin is new against
    the base and is aged. `:197` is unchanged, because a ref whose verify read failed is not aged again; the no-`BASE`
    case at `:110` ages both pins without asserting their verdicts, and its `ls-remote` count holds because the
    `--symref` read is inside `fetchRefs`.
  - `age.test.ts`'s other 23 cases (29 in all, listed below); `buildkit.test.ts` +1 (the newer-release warning follows
    `minimumReleaseAge`); `verify.test.ts` +2 (beside `:252`: on a local origin, `fetchRefs` and `isAncestor` answer
    for a commit older than one `file()` fetched shallow, the fetch holding the default branch alone, and `close()`
    removes both; and a Docker action by tag or by `Dockerfile` refused, top-level and nested, S7); check-action-pins
    `workflows.test.ts` +1 (a reusable workflow of another repository refused, S7). The three `check.test.ts` cases of
    commit 4 now pass.

**Integrator** (commit 6, after both builders):
- ADR 0066 Part 5 after `:1258`, with a Part 5 line in Status (`:3-27`), Date (`:28`), Deciders (`:29-41`) and PRD
  sections (`:42-52`); "(amended by Part 5)" on Part 1's History bullet (`:120-121`) and Part 2's builder bullet
  (`:444-454`). Part 5 holds §6's content as amended here: the measured state of 14.3, the local image reading below,
  and, from P1's CI log, every pin's `verified_at` with its `reason`, `published_at` and `immutable`, and what the
  arrival read answered for each (an arrival, or why none: whether the job's token reads another owner's
  `/activity`); the residuals of §6 as amended (the arrival, run-time downloads, the form-only image advisory, the
  token's reach through `$GITHUB_ENV`); and "the repository goes private" among the revisit triggers.
- `docs/runbooks/dependency-upgrades.md` "Base images and PostgreSQL" (`:222-248`; "four" steps becomes "five" at
  `:228-238`) and "Actions" (`:279-286`), with what each exclude kind waives and what it does not (B1), and the
  advisory read of an action `security-fix` exclude marked unproven live until a run makes it (S11); `docs/runbooks/
  ci.md` `:26`, `:87-93`, `:94-100`, `:384-387` (with `gpgv` as a local prerequisite, N11), `:397-399`;
  `packages/compliance/src/controls.ts` `:261` and `:262`; `docs/product/reconciliation-001.md` after `:657`.
- `docs/product/test-matrix.md`: the intro (`:252-257`) rewritten, CI-21 to CI-23 after `:280`, with §7's rows as
  amended; `packages/synth/src/cases/matrix.ts` after `:420`; `registry.ts` after `:617`, under "// The release age of
  pins and images (docs/adr/0066, Part 5).", each `none(0, …)` listing its test files; `pnpm synth --all` with no file
  changed.
- The full local suite under the lock: `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`, `pnpm test`, `pnpm test:db`
  (the catalog and cross-tenant tests, CLAUDE.md rule 4), `pnpm verify-content`, `pnpm synth --all` then `git diff
  --exit-code -- fixtures/synthetic`, `pnpm actions:check --offline`, and `BASE=origin/claude/build-platform pnpm
  actions:check` and `pnpm toolchain:check` (networked; the API reads are skipped locally with a note); then the
  fresh-clone verification (§8).
- The image path, live (S11): `BASE=afe339b9^ pnpm toolchain:check` from P1's head. Its base, 6eae41a3, predates all
  three digests (afe339b9 entered node's; 91d2579a, whose parent is afe339b9, postgres's; 8890c4e6, which descends
  from both, the builder's; `git merge-base --is-ancestor` in the worktree at ecebdc90), so the image rule reads
  Docker Hub for each through `images.ts` and `readJson`. The image rule's reads and verdicts go into Part 5's measured
  state; that run's npm findings are not P1's and are not recorded.
- After CI: acceptance 8 read from the log (14.3); if `verified_at` is absent, the integrator stops (§8).

**Counts the pull request must reach.** At ecebdc90 the unit project is 382 files, 6,352 passed and 1 skipped (6,353)
(run 40593100176, unit job 122502077308). P1 adds 3 test files and 62 tests: `age.test.ts` 29, `images.test.ts` 17,
`exclude-window.test.ts` 4, `tree.test.ts` 2, `registry.test.ts` 3, check-action-pins `check.test.ts` 3,
`buildkit.test.ts` 1, `verify.test.ts` 2 and check-action-pins `workflows.test.ts` 1. So: **385 files, 6,414 passed
and 1 skipped (6,415).** The scoped run `pnpm exec vitest run --project unit tools/check-action-pins
tools/check-toolchain tools/test` goes from 29 files and 358 tests to 32 and 420. If the base moves before the merge,
the rule is the same: the merge base's count plus P1's 62, and the description says so with both numbers.

**The base moved during this revision.** `claude/build-platform` is now 0dd1ba7e (#80, the letter reader's redaction,
merged 2026-10-28T00:14:58Z; `git ls-remote` at 00:30:03Z). It changes none of P1's files under `tools/`, `.github/`,
ADR 0066, the runbooks, `controls.ts` or reconciliation-001 (`git diff --stat ecebdc90 0dd1ba7e` over those paths is
empty), but it adds rows to three shared documents above P1's regions: in `test-matrix.md` the CI intro becomes
`:257-262` ("complete the series" `:260`) and CI-20 `:285`; in `matrix.ts` CI-20 becomes `:432`; in `registry.ts` the
group comments become `:608` and `:617` and CI-20 `:620`. Its push run (40607540799, unit job 122550688445) counts
383 files, 6,418 passed and 1 skipped (6,419), so on that base P1 must reach **386 files, 6,480 passed and 1 skipped
(6,481)**. The session either merges the build branch into `co-001/ci-pin-age` before the integrator's commit, as
ci-browser did, or keeps ecebdc90 and lets the pull request's merge base set the count; the integrator takes the
shared documents' lines from the base the branch holds at that commit.

The cases, one `it` each, so the counts can be checked against the files (★ red first):
- `age.test.ts` (29): ★ a 2-day-old signed commit fails with each time, its source and the old-enough instant, and
  at the floor it passes; the floor follows `minimumReleaseAge`; ★ unsigned and dated 2020 with no `verified_at` is
  "age unprovable"; ★ on CI a valid web-flow signature with `verified_at: null` fails (S4 of 2026-10-26); ★ "not on
  main", and an `off-default-branch` exclude passes it when it is three days old by every signal; ★ "tag moved" with
  both SHAs and the tagger date not counted, the verify loop's tag read naming the pin and the age loop's another
  commit (N14), and a tag the upstream lacks is "no tag <v>" after one read, not a host failure (N6); the youngest
  wins (a 1-day tagger date, a 1-day `published_at`), and a committer date in the future fails until that instant,
  naming it, with "choose another release" (N7); an immutable release 1 day old fails a 30-day commit and one 5 days
  old passes an unsigned commit, printing `immutable`; `immutable` absent reads as false and a null `published_at`
  gives no signal (D4); a late `verified_at` names the re-run instant; keys: an unknown key gives no signal, the
  expired key counts only before its expiry; on CI `verified_at` 1 day fails and 5 days passes, its `reason` printed
  beside it, and locally no API read is made; three failed API reads fail closed naming `api.github.com`, and a
  `reason` of `gpgverify_error` or `gpgverify_unavailable` is a failed read that ends in "re-run", never "age
  unprovable" (S9); a 429 with `Retry-After: 30` pauses 30 s and a reset 90 s ahead pauses 60 s; ★ a pin in the base
  prints "age: no pin new against the base, nothing read", also when the change edits the checker, and a new step on
  an existing ref reads nothing; on a push a young pin warns; the rotation warning compares fingerprint sets; a base
  without `age.ts` ages every pin; a live `security-fix` exclude passes with a note, and a missing advisory, a
  pattern, a version mismatch or an expiry outside the window fails; the reasoned kinds' misuse and bounds fail; an
  `age-unprovable` exclude on an unsigned pin whose committer date, or a mutable release's `published_at`, is 1 day
  old still fails (B1); an `off-default-branch` exclude on a pin 1 day old still fails (B1); an expired entry fails a
  pull request that edits the list and warns elsewhere, and an unused one warns; the committed key file's
  fingerprints are exactly the two (E9), and the committed `age-exceptions.json` is `{ "entries": [] }` (S12); the
  deadline: unread pins are one warning on a push and one error naming them and the host on a pull request (E3);
  `actions/cache/restore` and `actions/cache/save` on one commit are aged once (E10); the `security-fix` advisory read
  on CI, withdrawn, another package or a range that misses the base's version failing, an action the base does not
  pin refused, the GHSA range read with its `v` prefix stripped (N8), and skipped locally with a note (E11); the
  arrival read: an entry inside the window that brings the pin onto the default branch makes it young, and no entry
  in the window, a 403, a 422 or an unparsable page is a note with `errors: []`, one try a page and no pause (E12, S1,
  S2); the API requests carry `Authorization`, `X-GitHub-Api-Version: 2026-03-10` and the `User-Agent`, against
  `GITHUB_API_URL`, a 3xx is an answer never followed, and no message carries a request header (E7, N15).
- `images.test.ts` (17): ★ a new digest 2 days old fails and 3 days old passes; ★ unchanged digests make zero reads
  and print the rule's note (N13); changing one Dockerfile reads only that digest; the youngest of `tag_last_pushed`
  and `images[]` is taken, and a pin equal to one `images[].digest` is matched there (N9); the compose file's image is
  aged; a new builder digest is aged and an unchanged one is not read; a new `container`, service, `docker://` or
  `# syntax=` image is aged; a superseded digest found on another tag takes that tag's time, and one found nowhere
  fails naming the current digest and its old-enough instant; no exclude kind clears a Hub digest found on no tag,
  `security-fix` included, and an `age-unprovable` entry on any Hub digest is refused (B1); a Hub 404 is "no such tag"
  and the tags are searched; a non-Hub registry is "age unprovable"; three Hub failures fail closed naming
  `hub.docker.com`, and the deadline stops the rest; a young digest on a push warns; a base without
  `image-age-exceptions.json` still reads only new digests (E2); the exclude kinds, a CVE accepted, a `security-fix`
  without `fixes` refused (S10), an expired or unused entry; the offline form rule refuses a tagless digest and a tag
  without a digest (E5); and it refuses a `COPY --from=` or `RUN --mount=…,from=` naming an image, a
  `docker-image://` build context, a tracked image file outside the three read, and a compose `build:` (S6).

### 14.6 Engineering choices made here

Each is taken under the co-founder's 2026-10-26 ruling (the recommended option, for security the safer one), is
reversible by a later pull request, and is recommended.
- **E1. One image rule for every image the tree names**, in `images.ts`, with one exceptions list and its "entry no
  longer used" check (14.4, items 1 and 2). Safer than a rule per place: a new kind of image reference is aged or
  refused from the day it appears, (§15) which holds because every reference the rule does not read is refused
  offline (E17).
- **E2. Images are not bootstrapped.** Hub is readable from here, so the integrator's reading is the measured record,
  and Hub reads from GitHub's runners are already proven by the builder check on every networked run (run
  40593100176). Aging the base's digests on P1's pull request would only turn it red whenever Hub rebuilds `node`
  (the five tags that name `43b9…` move together, scout-pins §3), which proves nothing about P1. (§15, S11) The builder
  check proves the host only: it reads through `buildkit.ts:76-86` and `transport.get`, so P1's own run never
  exercises `images.ts` and `readJson` against Hub. The integrator's local `BASE=afe339b9^ pnpm toolchain:check`
  (14.5) does, for all three digests, and its reads and verdicts are the measured record.
- **E3. One deadline per checker for its age reads, 180 s, four reads at a time.** Unread pins or digests are one
  warning on a push and one error naming them and the host on a pull request, which a re-run clears. Without it one
  pin's reads can take about 824 s in an outage (14.1, §3.1 `check.ts` row; (§15, N4) a lower bound, 951 s with the SHA
  fetch, the advisory read and the one-try arrival read). (§15, S4, S5) What is bounded, on a push: the verify loop
  (120 s, E16), the age reads with the builder check (180 s), the re-reads of unchanged tags (120 s), and
  check-toolchain's Hub reads (180 s, enforced inside `readJson` through its new signal, S5): 600 s at their limits.
  `static`'s push run took 192 s (run 40593100176, job 122502076872, 22:13:16Z to 22:16:28Z; "Action pins" 7 s,
  "Toolchain" 2 s), so its other steps took about 183 s, and all four at their limits stay inside the 900 s of
  `timeout-minutes: 15` (`ci.yml:37`). What is not bounded: the verify loop on a pull request (P28) and
  check-toolchain's npm reads on any event (P20), as today. 180 s also fits one rate-limit wait (60 s) and a retried
  read.
- **E4. The builder's newness from `state.workflows`, and its faults warn on a push** (14.4, item 4).
- **E5. An offline `images` form rule** in `checkOffline`, so a malformed reference (no tag, no digest) fails the
  unit tests and `--offline` runs, not only the networked step; `check.test.ts:559`'s list gains it.
- **E6. The transport's shape.** `get` gains request and response headers rather than a second `getJson`, so the
  builder's Hub reads, the API reads and the rate-limit wait share one method and one recorded form. `fetchRefs`,
  `object`, `isAncestor` and `fetchSha` live in `gitTransport`, each repository's refs in a bare repository of its own
  under the same scratch directory, removed by `close()`; never in the shallow repositories `file()` fetches into
  (`network.ts:71-84`), whose shallow boundary would cut the history `merge-base --is-ancestor` walks. (§15)
  `fetchRefs` holds the `--symref` read and the tag's listing in one `ls-remote` (N6), and fetches the default branch
  alone (N16).
- **E7. The API reads.** `verified_at` from `GET /repos/{o}/{r}/git/commits/{sha}` (its `git-commit` schema carries
  `verification` without the files and stats of `…/commits/{sha}`); the release from `GET
  /repos/{o}/{r}/releases/tags/{tag}`, a 404 meaning "no release"; `X-GitHub-Api-Version: 2026-03-10`, which has no end
  of support (2022-11-28's ends 2028-03-10); the base from `GITHUB_API_URL` and a `User-Agent`, as approval-of-record
  does (`approval-of-record.ts:289, :309`).
- **E8. `ci.yml` names `github.token` exactly once**, asserted, so the token cannot spread to another step or the job
  unnoticed. (§15, S8) The same `it` asserts that `ci.yml` holds no `secrets.` (`secrets.GITHUB_TOKEN` is the same
  token, and `release.yml:346` and `release-dry-run.yml:224` use that form), no `github[` and no `toJSON(github` or
  `toJSON(secrets` (the `github` context carries the token); the existing asserts cover single jobs only
  (`workflows.test.ts:1127, :1150, :1277`).
- **E9. OpenPGP fingerprints in TypeScript** (dearmor, then SHA-1 over `0x99`, the two-byte length and the public-key
  packet's body), checked in the tests against the fingerprints `make.sh` recorded and against the two GitHub keys
  for the committed file. `gpgv` stays the only binary, the tests need no `gpg`, and the push run's rotation check
  uses the same code.
- **E10. A commit is aged once, not each ref**, and printed as one block naming every ref that uses it.
- **E11. An action `security-fix` exclude names a GHSA id, checked on CI against GitHub's advisory database**
  (`GET /advisories/{ghsa_id}`): not withdrawn, a vulnerability in ecosystem `actions` for that `owner/repo`, its
  vulnerable range covering the base's version and not the pin's. This holds an action exclude to what the npm rule
  holds an npm exclude to (ci-deps' N3, `check.ts:463-487`). An image exclude keeps a GHSA or CVE id, checked for form
  only, since no registry answers for it. Locally the read is skipped with a note. (§15, N8) An action the base does
  not pin is refused, as npm's rule refuses a package the base does not lock (`check.ts:471-473`); the advisory's
  `vulnerable_version_range` is read by an evaluator of GHSA's range syntax (`>= 1.0.0, < 1.4.2` and its kin), not by
  `rangeHolds` (`policy.ts:195`), which reads npm's forms; a version's `v` prefix is stripped before either comparison.
  (§15, S10) An image `security-fix` names `fixes: { package, version }`, and its form-only advisory is a residual in
  ADR Part 5 and CI-23 (P23). The advisory read is not exercised by P1's own run, since no `security-fix` exclude
  exists; its live path stays open (14.8).
- **E12. The arrival read** (§15, S1, S2; it replaces the activity note). For each commit aged on CI, `GET
  /repos/{o}/{r}/activity?ref=refs/heads/<default>&per_page=100`, newest first, at most three pages, back to now −
  floor (§3.1 step 5). The schema formats `ref` as `refs/heads/<branch name>` and lists branch activity types only
  (`components.schemas.activity`, rest-api-description 05436cdf, 2026-10-28T01:01Z; the query's `ref` takes
  `refs/heads/BRANCH_NAME` or `BRANCH_NAME`), so the tag query of the re-read would likely not answer. The arrival is
  the newest entry inside the window whose `after` the fetch holds with the pin as an ancestor, and whose `before` the
  fetch does not hold or holds without the pin; its `timestamp` joins the youngest-of. The read can only make a pin
  younger, so taking it now only makes the rule stricter; it never proves a pin old, since an absent entry proves
  nothing. It is best effort: one try a page, no rate-limit wait, and any other outcome is a note "activity: …", never
  a finding, so a 403 for another owner's repository or a 422 cannot turn P1's own pull request red. Whether the job's
  token reads another owner's `/activity` is unproven (403 here) and P1's run records it.
- **E13. The npm window cases stay in check-toolchain's `check.test.ts`**, unchanged, which is what proves the
  extraction a no-op; `exclude-window.test.ts` adds direct cases.
- **E14. Hub reads through `registry.ts`**: a 404 is an answer, and the rate-limit wait lives in `readJson` for npm
  and Hub alike, so the two hosts cannot drift.
- **E15. Each exclude kind waives one requirement** (§15, B1). `security-fix` the floor (inside F2 (b)'s window);
  `age-unprovable` only the need for a GitHub-recorded signal; `off-default-branch` only the ancestry rule. Under
  either reasoned kind the youngest of every signal read must be at or over the floor; an image `age-unprovable`
  applies only to a registry other than Docker Hub, and a Hub digest found on no tag passes under no kind, not even
  `security-fix` (stricter than the review proposed: an image advisory is checked for form only, S10, so a fix must
  name a digest a tag carries, whose push time Hub records). A pin needing two waivers carries two entries.
- **E16. The verify loop on a push** (§15, S4). For a ref `state.workflows` holds, a failed or stopped read and a moved
  tag are warnings; a problem in what was read (inputs, nested pins, caches) stays an error, since no outage or
  upstream move produces it; a ref new against the previous head keeps every error. The loop runs under its own
  `PUSH_DEADLINE_MS`; refs left unread are one warning, or one error naming any new ones. Without it, P1's merge push
  and P2's, which edit the checker and so re-verify all 13 refs (`check.ts:86-95`, `base.ts:63`), turn the build
  branch red on an outage or a moved tag, with no bound on time.
- **E17. The image references the rule does not read are refused offline** (§15, S6): a `--from=` or `from=` naming
  anything but an earlier stage, `docker-image://` in `build-contexts`, a tracked `Dockerfile*`, `Containerfile*` or
  compose file other than the three read (Compose prefers `compose.yaml` over `docker-compose.yml`), a compose
  `build:`. None occurs today.
- **E18. Reusable workflows and Docker actions** (§15, S7). Rule (a) refuses a `jobs.*.uses` that calls a reusable
  workflow; `verify.ts` refuses a Docker action, at any depth, whose `runs.image` is not `docker://…@sha256:<64 hex>`.
  C9's premise then holds for everything that runs. None is used today.
- **E19. A verification-service failure is a failed read** (§15, S9): `reason` `gpgverify_error` or
  `gpgverify_unavailable` is retried, then fails closed with "re-run", never pointing to an `age-unprovable` exclude.
- **E20. Authenticated reads never follow a redirect** (§15, N15): `redirect: 'manual'`, a 3xx an answer naming the
  move ("the repository moved; pin it under its new name"), so the token is sent to `GITHUB_API_URL`'s origin alone;
  a message never carries a request header. Taken over the review's `redirect: 'error'`, which would turn a renamed
  repository into three failed reads and a host failure.
- **E21. ★ cases through the entry points** (§15, N13, N14): red on behaviour, never on a missing import.
- **E22. The existing tests survive the new loops** (§15, S3): `baseAge` in the test repository, CI-mode answers in
  `network()`, a ref whose verify read failed not aged again, and the `--symref` read inside `fetchRefs`; every existing
  assertion holds except the new note and `:90`'s read list.

### 14.7 Proposed improvements outside P1

Continuing after P17, the highest in `lane-b-ci.md` (`:3072`); the status file's highest is P11. Each is reversible and
recommended.
- **P18.** Pin the RDS CA bundle both Dockerfiles fetch by URL with no checksum (`apps/web/Dockerfile:48`,
  `apps/worker/Dockerfile:49`): `ADD --checksum=sha256:<hex>`, with the bundle's SHA-256 recorded, a `dockerfileRule`
  check that every remote `ADD` carries one, and a runbook step for AWS's rotation of the bundle. It is not an image,
  so not P1's.
- **P19.** Move approval-of-record's `X-GitHub-Api-Version` from `2022-11-28` (`approval-of-record.ts:309`) to
  `2026-03-10`, after checking that version's breaking changes against the endpoints it reads, so the repository sends
  one version and none that ends on 2028-03-10.
- **P20.** Give check-toolchain's npm reads one deadline, as the push re-reads have. `readAdded` reads one packument per
  added package, eight at a time (`check.ts:605-622`), each with three tries of up to 60 s (`registry.ts:79`), with no
  overall bound, so a lockfile change that adds many packages, against a registry that accepts and stalls, can time
  out `static`.
- **P21.** If P1's CI log shows that `GET /repos/{o}/{r}/activity` lists tag pushes for the pinned repositories, take
  the first push of `refs/tags/<v>` as a GitHub-recorded time at which the tag came to name its commit, closing R7 for
  those actions, in a pull request of its own with an ADR 0066 line. If it does not, ADR Part 5 records that and R7
  stays as stated. (§15, S1) Restated: P1 now reads the default branch's activity and takes a young arrival as a
  signal (E12). P21 decides, from P1's log, whether an answer that shows no arrival inside the window can stand as a
  GitHub-recorded proof that a pin is old (it would close R7 for the repositories whose activity answers), and whether
  the read should then retry and fail closed rather than note.
- **P22.** #33 (Dependabot, images) carries `node:26-trixie-slim@sha256:36793bcb…`, 5.14 days old when written,
  under the 7-day cooldown, and a node major the current configuration ignores (`dependabot.yml:95-97`). Watch the next
  `container-images` run under the current configuration: if it again writes a digest younger than its cooldown, add
  the case to P8's upstream report. Closing #33 is the founder's or co-founder's (a GitHub write); it must not be merged.
- **P23.** (§15, S10) Check an image `security-fix` exclude's advisory: in the `images` job, Trivy's scan of the base's
  digest must report the advisory against the named `fixes.package` and the new digest's scan must not, as the npm and
  action rules check theirs against an advisory database.
- **P24.** (§15, N11) Have `session-start.sh` report a missing `gpgv`, which P1 makes a prerequisite of `pnpm test`
  and `pnpm actions:check`.
- **P25.** (§15, N12) Pin `pip install pyx12` (`ci.yml:48`) by version with `--require-hashes`, hold it to the release
  age using PyPI's upload time, and run it after the "Action pins" step (before `pnpm test:oracle`, which
  `workflows.test.ts:1384-1386` requires), so an unpinned download no longer runs before the step that holds the
  token.
- **P26.** (§15) Hold `tools/gitleaks/release.txt`'s version (8.24.3) to the floor, using the release's `published_at`
  on CI, as P1 holds actions.
- **P27.** (§15) Apply the default-branch rule to nested SHA pins. Today's nested `setup-trivy@3fb12ec1` and
  `actions/cache@27d5ce7f` are both ancestors of `main` (the review's read, 2026-10-28T00:49:48Z; not re-read here).
- **P28.** (§15, S4) Put ci-deps' verify loop under a deadline on a pull request too, as P1 does on a push (E16),
  naming the refs left unread in one error.

### 14.8 In-place edits, and what stays open

The 39 edits to §1 to §12, grouped by place and each marked "(14)" where it stands (old and new text in
this file's diff in the commit that adds §14, and in `scratchpad/p1reread/revise.md`):

| § | Edit |
|---|---|
| Header | Cites re-read at ecebdc90, §14 governs; the change also rewrites two `ci.yml` comments |
| §1 acc. 1 | `check.ts:169` → `check.ts:829` |
| §1 acc. 3 | The image rule covers the workflows' images (builder, container, service, `docker://`) |
| §1 acc. 8 | P1's pull request ages every pin and no digest already in the base (E2); re-measured in §14.3 |
| §2.1 table | `verified_at` from `GET …/git/commits/{sha}` (E7) |
| §2.1 late `verified_at` | "(November 2024)" dropped: the docs give no date |
| §2.2 | "a page covers about 9 hours" → a page's span depends on the push burst, with the 2026-10-27 spans |
| §3.1 `age.ts` | The fetch goes into `gitTransport`'s scratch directory, removed by `close()` (E6) |
| §3.1 step 4 | `X-GitHub-Api-Version: 2026-03-10` (E7) |
| §3.1 retries, backoff | `network.ts:54-68` → `:144-173`; `:35` → `:124` |
| §3.1 age set | `base.ts:31-49` → `:30-49`, its `workflows` whatever `everyPin` says |
| §3.1 `check.ts` | After the verify loop and the builder check (`:101-129`) |
| §3.1 push cites | `check.ts:90-103` → `:131-168`; check-toolchain `:53-54` → `:60-61` |
| §3.1 `age-exceptions.json` | Action advisories GHSA only (E11) |
| §3.1 `ci.yml` | `:84-87` at 19e3d98e → `:85-88` at ecebdc90, `env` at `:87` |
| §3.1 rate | Two calls per new pin → three per new commit, one more per `security-fix` exclude |
| §3.2 `tree.ts` | `readWorkingTree` `:44-47` → `:44-48` |
| §3.2 `FILES` | `check.ts:40-48` → `:42-52`; both trees gain their workflows |
| §3.2 `images.ts` | `dockerfileRule` `:243` → `:387-414`; the workflows' images; no bootstrapping (E2); `readJson` `:71-98`, a Hub 404 an answer (E14) |
| §3.3 | `releaseAgeExcludeRule` `:288-345` → `:489-547`; the floor `:169` → `:829`, and the builder's warning among its readers |
| §4 | Files: `keys.ts`; `buildkit.ts` and three action-pins test files; `policy.ts` and `registry.test.ts`; check-toolchain `index.ts` unchanged; the transport's shape (E6); the window cases stay (E13); the `:13` and `:1318` comments |
| §5 | The ★ cases are each builder's red commit (§14.5); key fingerprints computed in TypeScript (E9); images not bootstrapped (E2); `exclude-window.test.ts` holds direct cases (E13) |
| §6 | ADR after `:1258`; runbook "Actions" `:279-286`, "Base images" `:222-248` (four steps → five); controls `:261`, `:262` |
| §7 | CI-22's assertion names the workflows; the intro's "complete the series" (`:255`) rewritten |
| §8 B1 | Adds the two comments |
| §9 | An image digest can be younger than Dependabot's cooldown (#33, 5.14 days) |
| §10 C3, C7 | `static` on 26.04 is a fact (`ci.yml:35`, run 40593100176); bootstrapping for actions only |
| §11 | #42: lines 91, 92, 203, 204 of 212, `pnpm-lock.yaml`, no overlapping hunk; ci-deps and ci-browser merged (#48, #77) |

The fold of the re-read's review (§15, 2026-10-28) made 37 more edits to the header and §1 to §12, marked "(14)" as
well (old text in `scratchpad/p1reread/progress/design.before-fold.md`):

| § | Edit (finding) |
|---|---|
| Header | The review folded, §15 |
| §1 residual | The ancestry rule holds at read time; a commit staged in a fork or a deleted branch keeps its verification record, so only a read arrival makes it young (S1) |
| §1 acc. 4 to 7 | Bootstrapping excepted (N3); each exclude kind passes the condition it names, the floor still held by every time read, image `age-unprovable` off Docker Hub only, a Hub digest on no tag under no kind (B1); acc. 6 the same (B1); acc. 7, the push's verify loop warns (S4) |
| §2.1 | A row for the arrival on the default branch; "what the rule closes" says the ancestry rule holds at read time (S1) |
| §2.2 | Hub's URL as `buildkit.ts:76` reads it (N2); a pin matched against `images[].digest` (N9); a digest on no tag cleared by no exclude (B1) |
| §3.1 `age.ts` | `fetchRefs`: one `ls-remote --symref` with the tag, then the default branch alone (N6, N16); step 2's exclude waives ancestry only (B1); step 4: `gpgverify_*` a failed read, `reason` printed (S9), no redirect followed, no header in a message (N15); step 5, the arrival read (S1, S2); the retries' exception (S2) |
| §3.1 age set, `check.ts` | A ref whose verify read failed is not aged again (S3); check-toolchain's push convention is new there (N5); the push's verify loop (S4) |
| §3.1 `age-exceptions.json`, rate | Each kind waives one requirement, two entries for two waivers (B1); two calls and one to three activity pages per commit (S1, S2) |
| §3.2 | `tree.ts` lists the tracked image files the rule does not read (S6); `readJson`'s signal and 30 s Hub tries (S5); the offline refusals (S6); image `age-unprovable` off Hub only, no exclude for a digest on no tag, `fixes` on `security-fix` (B1, S10) |
| §4 | `workflows.ts`, `verify.ts` and `workflows.test.ts` changed (S7); `index.ts:29` → `:30` (N1) |
| §5 | `make.sh`'s short `GNUPGHOME` and sign-then-expire (N10); ★ cases through the entry points (N13, N14); the ★ `off-default-branch` case holds the floor (B1); the ★ "tag moved" case's disagreeing reads (N14); the image ★ case's note (N13) |
| §6 | Part 5's residuals and revisit trigger (S1, S7, S10, N12), the local Hub reading (S11); `ci.md` names `gpgv` (N11) |
| §7 | CI-21 excepts bootstrapping (N3); CI-23 holds the floor under a reasoned exclude, refuses a Hub digest on no tag, and names the form-only image advisory (B1, S10); the intro sentence notes both |
| §9 | Under a reasoned exclude a pin still waits three days (B1) |
| §10 C1, C9 | A future date makes the pin young, no exclude clears it (N7); reusable workflows and Docker actions not by digest refused (S7) |
| §12 R6, R7 | Run-time downloads stay outside P1 (S7); the staged commit and the arrival read (S1) |

Not edited, because they still hold or are kept as records: §2.3 (the 2026-10-26 measurement; 14.3 is today's), §12
(14) except R6 and R7, and §13. §5's case lists for `age.test.ts` and `images.test.ts` are a subset of 14.5's, which
govern.

**Open, and not verified here:**
- `verified_at`, `published_at` and `immutable` for the 12 pins: api.github.com answers 403 from this container, and
  the GitHub MCP read tools refuse other repositories and return no `verification` object for this one (scout-pins
  §2), so the three stay readable only on CI (acceptance 8).
- Whether the job's token reads `GET /repos/{o}/{r}/activity?ref=refs/heads/<default>` for another owner's
  repository, and what it answers for the 12 (E12, P21; §15 S1, S2), and whether any of the 12 actions publishes
  immutable releases: P1's first CI run prints both. The arrival rule's reading of `before` and `after` is designed
  from the schema, not from a live answer.
- GitHub's advisory endpoint for actions (E11) has not been read from here (403); its shape is the REST description's
  (`api.github.com.2026-03-10.json:484, :131892, :132171`, 83a2153c). Its live path is not exercised by P1's own run
  either, since no `security-fix` exclude exists (§15, S11); the runbook marks it unproven until a run makes it.
- `images.ts`'s reads against Docker Hub are proven only by the integrator's local run (14.5; §15, S11), not on CI.
- Why #33's digest was younger than its cooldown (14.1, §9 row; P22).
- `make.sh`'s synthetic objects are not yet made, so E9's fingerprint code is designed, not run. (§15, N10) Its
  sign-then-expire procedure is designed from gpg's documented behaviour; it was not run here, because the scratch
  directory's path is too long for gpg-agent's socket.
- The base moved to 0dd1ba7e (#80) while this revision was written; its effect on P1 is only the shared documents'
  line numbers and the unit count (14.5).

## 15. Review of the re-read (2026-10-27)

**Totals:** 30 findings (1 B, 12 S, 17 N), all re-checked and holding: 28 Fixed, 2 Fixed by another means, 0 Not taken.

The 6 proposals are adopted as P23 to P28 (14.7). The two "Fixed by another means" are S11 and N15.

Review `follow-up-p1-pin-age-reread-review.md` (2026-10-28, 00:35Z to 00:56Z). Folded on 2026-10-28 from 00:58Z. Each
finding was re-checked before any text changed: the code at ecebdc90 in `/home/user/ci-pin-age` (clean); github/docs
3869faed (blobless sparse clone, 01:01Z); github/rest-api-description, whose head had moved to 05436cdf (01:01Z; the
`verification` schema, the `git/commits` description's `reason` table and `components.schemas.activity` read with a JSON
query); docker/docs 370c82d9 (01:10Z; docs.docker.com is refused by this session's proxy, 01:10:23Z); `action.yml` of
setup-node 949feb24 (01:07Z) and checkout 3d3c42e5 (01:13Z); and the ancestry of afe339b9, 91d2579a and 8890c4e6 (`git
merge-base --is-ancestor` in the worktree). api.github.com was not tried again (403 at 2026-10-27T22:15Z). No code was
changed or run; the counts follow from the case lists. Edits are marked "(14)" in §1 to §12 and listed in 14.8; the rest
is in §14 under "(§15, …)" markers. Progress and the pre-fold text: `scratchpad/p1reread/progress/fold.progress.md` and
`design.before-fold.md`. The two scout reports are copied unchanged beside this file as
`scout-ci-pin-age-reread-files.md` and `scout-ci-pin-age-reread-pins.md`: gitleaks 8.24.3, with the repository's
`.gitleaks.toml` (`useDefault = true`) and with its default rules, finds nothing in either (a scratch repository in git
mode, as the pre-push hook scans, 2026-10-28T01:20Z), so no digest or fingerprint in them is shortened.

| Finding | Disposition | Reason and evidence |
|---|---|---|
| B1 a reasoned exclude passes a young pin | **Fixed**, and for images stricter than proposed | Holds: `verification.verified_at` is required and nullable and `reason` includes `unsigned` (05436cdf), so an unsigned commit with a mutable release has no GitHub-recorded signal, and acceptance 5 let `age-unprovable` pass it whatever its dates. Each kind now waives one requirement and the floor holds over every signal read (acc. 5, 6; §3.1; §9; CI-23; E15); +2 `age.test.ts`, +1 `images.test.ts`. A Hub digest found on no tag now passes under no kind, `security-fix` included, because an image advisory is checked for form only (S10): a fix must name a digest a tag carries, whose push time Hub records |
| S1 the residual misstated | **Fixed**, further than proposed | Holds: the verification record "is reused" across forks (`about-commit-signature-verification.md:68`, 3869faed), and `merge-base --is-ancestor` runs at read time. §1, §2.1, R7 and Part 5 reworded. E12 now reads `activity?ref=refs/heads/<default>` (the schema's `ref` is "formatted as `refs/heads/<branch name>`", branch types only). Taken further than a note: a GitHub-recorded arrival inside the window joins the youngest-of now, since it can only make a pin younger (the review's own reasoning) and its absence is never a finding; P21 decides whether an answer can prove a pin old |
| S2 E12's read can fail P1's own PR | **Fixed** | Holds: `withRetries` throws after three refusals (`network.ts:144-173`). The arrival read is best effort: one try a page, no rate-limit wait, any non-200, parse failure or timeout a note (§3.1 step 5, E12); the E12 `it` asserts a 403 and a 422 give a note and `errors: []` |
| S3 existing `check.test.ts` cases break | **Fixed**, with two more cases found | Holds: `repository()` writes only `index.ts` at the base (`check.test.ts:64`). `baseAge` default true; `--symref` inside `fetchRefs`; `CheckOptions` gains `floor`, `ci`, `token`, `apiUrl`, keys. Also found: the cases that age a pin (`:89`, `:105`) need `network()` to answer age reads (CI mode, a recorded immutable release, so no `gpgv`), and `:90`'s exact read list must gain the new pin's age reads, since that pin is new and is aged, so "every assertion unchanged" holds except the note and `:90`; `:197` stays unchanged because a ref whose verify read failed is not aged again. check-toolchain's `:160` list and `fakeRegistry` (`:51`) listed (14.5, E22) |
| S4 merge pushes re-verify every pin with errors | **Fixed**, narrowed, and the deadline taken | Holds: with `everyPin`, `check.ts:86-95` leaves `base` unset and `selectPins` verifies every ref (`base.ts:63`), every problem an error (`check.ts:101-118`). On a push, a failed or stopped read and a moved tag of a ref the base holds warn; a problem in what was read stays an error (no outage produces it); a new ref keeps its errors. The push deadline is taken, not optional, since without it an outage can time out `static` (E16); +1 `check.test.ts`. The run-log line 417 the review cites was not re-read; the code shows the same |
| S5 `readJson` cannot keep a deadline | **Fixed** | Holds: `{ ...init, signal: AbortSignal.timeout(…) }` replaces the caller's signal (`registry.ts:79`) and the sleep has none (`:75`): 3 × 60 + 2 × 60 = 300 s per read. `readJson` gains a signal via `AbortSignal.any`, an abortable sleep, 30 s Hub tries; +1 `registry.test.ts` (counted, so 62 tests, N17); E3 restated with what it bounds and what it does not |
| S6 image references the rule does not read | **Fixed**, widened | Holds: CI-13 reads `^FROM` only (`workflows.test.ts:2782`), `tree.ts:32-41` reads `apps/*/Dockerfile` only, and `release.yml:106` and `release-dry-run.yml:115` compute `file:`. The offline rule refuses each listed form, and also any tracked compose file other than `docker-compose.yml`, since Compose prefers `compose.yaml` (docker/docs `compose-application-model.md:40-42`); none occurs today (every `--from=` is `build`); +1 `images.test.ts` |
| S7 reusable workflows and Docker actions | **Fixed** | Holds: `PIN` admits a workflow path (`workflows.ts:14`), `actionUses` takes `jobs.*.uses` (`:73`), `verifyPin` checks its tag alone (`verify.ts:226`), `nestedProblems` reads composites only (`:95`). Rule (a) refuses reusable workflows; `verify.ts` refuses Docker actions not by digest at any depth; R6, C9 and Part 5 state the run-time downloads (E18); +1 each in `workflows.test.ts` and `verify.test.ts`. None used today |
| S8 the token by another name | **Fixed** | Holds: `secrets.GITHUB_TOKEN` at `release.yml:346`, `release-dry-run.yml:224`; the `secrets.` asserts cover single jobs (`workflows.test.ts:1127, :1150, :1277`). The `it` at `:1316` asserts `github.token` once, in the step's `env`, and no `secrets.`, `toJSON(github`, `toJSON(secrets`, and also no `github[` (index syntax reaches the same field). `ci.yml` holds none of them today |
| S9 a service outage reads as "unprovable" | **Fixed** | Holds: `reason` lists `gpgverify_error` and `gpgverify_unavailable` (the `git/commits` description, 05436cdf). Both are failed reads, retried, then "re-run"; `reason` printed beside `verified_at` (§3.1 step 4, E19); asserted in the existing failed-reads case |
| S10 an image advisory checked for form only | **Fixed** (as fields, not prose) | Holds (design §3.2, E11). A residual in Part 5 and CI-23; `security-fix` entries carry `fixes: { package, version }` rather than prose in `reason`, so P23 can check them against the Trivy scans |
| S11 two live paths unproven | **Fixed by another means** | Holds: the builder reads through `buildkit.ts:76-86` and `transport.get`, so P1's run never reaches `images.ts` and `readJson`. One local run covers all three digests, not two: `BASE=afe339b9^` (6eae41a3) predates node's (afe339b9), postgres's (91d2579a, child of afe339b9) and the builder's (8890c4e6, a descendant of both). E11's live path is marked open in 14.8 and the runbook |
| S12 the committed-lists assert crosses builders | **Fixed** | Holds: the test reads files beside itself (`check.test.ts:547`). B2 asserts `image-age-exceptions.json`; B1 asserts `age-exceptions.json` in the existing key-file case of `age.test.ts` |
| N1 `index.ts:29` | **Fixed** | `checkToolchain` is called at `index.ts:30` (§4) |
| N2 Hub's URL | **Fixed** | `buildkit.ts:76` uses `/v2/repositories/<ns>/<repo>/tags/<tag>` (§2.2) |
| N3 acceptance 4 vs bootstrapping | **Fixed** | Acceptance 4 and CI-21 except bootstrapping |
| N4 824 s | **Fixed** | A lower bound. The worst case is 3 × 97 + 3 × 210 + 30 = 951 s, not 1,131, because S2's fix makes the arrival read one 30 s try; the deadline bounds either (14.1, E3) |
| N5 check-toolchain's push "warns" | **Fixed** | The event's one use is the expired-exclude finding (`check.ts:540`); P1's push warnings are new there (§3.1) |
| N6 a missing tag as a host failure | **Fixed** | The tag is listed in `fetchRefs`' one `ls-remote`, so "no tag <v>" is an answer. The failure is fast (git exits at once on a missing ref), not 97 s, but is still reported as a host failure today |
| N7 a future date | **Fixed** | C1 corrected: a future date makes the pin young, no kind clears it, the message says "choose another release"; asserted in the youngest-wins case |
| N8 E11's gaps | **Fixed** | A pin the base lacks refused (as `check.ts:471-473`), a GHSA range evaluator in place of `rangeHolds` (`policy.ts:195`), `v` stripped (E11) |
| N9 `images[].digest` | **Fixed** | A pin equal to a platform manifest's digest is matched there (§2.2, 14.5) |
| N10 `make.sh` and gpg | **Fixed** (procedure not run here) | Short `GNUPGHOME`; the expired key's after-expiry signature made by signing first and adding an earlier-dated, expiring self-signature (§5). Not run: the scratch path is too long for the agent's socket |
| N11 `gpgv` locally | **Fixed** | `ci.md:384-387` names it (§6); P24 |
| N12 item 7 | **Fixed** | Holds: `pip install pyx12` at `ci.yml:48` precedes the step; "the repository goes private" is a trigger at ADR 0066 `:267` and `:1256`; setup-node's `token` defaults to `github.token` (`action.yml:18-20`), as checkout's does (`:24`). Item 7 and Part 5 record them; P25 |
| N13 a ★ case that cannot fail | **Fixed** | Asserts the image rule's note through `checkToolchain`; every ★ case goes through an entry point (E21) |
| N14 "tag moved" | **Fixed** | The verify read and the age read disagree, and the age loop's message is asserted (`verify.ts:223` already names both SHAs) |
| N15 `redirect: 'follow'` | **Fixed by another means** | Holds (`network.ts:96`). `redirect: 'manual'` with a 3xx as an answer naming the move, rather than `'error'`, which would turn a renamed repository into three failed reads and a host failure; no header in a message (E20) |
| N16 every branch fetched | **Fixed** | The default branch alone (§3.1, E6) |
| N17 counts | **Fixed** | `tree.test.ts` listed once (commit 2); the totals say "in all". 62 tests, not the review's 61, because S5's `registry.test.ts` case is its own `it`: 385 files and 6,414 passed + 1 skipped at ecebdc90, 386 and 6,480 at 0dd1ba7e, the scoped run 32 and 420 (14.5) |
| Proposals P23 to P28 | **Adopted** in 14.7 | No collision: the highest elsewhere is P17 (`lane-b-ci.md:3072`) and this file's P18 to P22. P25 also moves `pip install` after the token step; P27's ancestry is the review's read, not re-read here |
