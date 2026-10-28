# Scout: pins, digests and upstream facts for P1, re-read at ecebdc90 (2026-10-27)

I read the tree in `/home/user/ci-pin-age` at `ecebdc9015b279af7014b957c8d62dc6adf19fee`, which equals `origin/claude/build-platform`. All times are UTC. I measured with blobless fetches and `gpgv` from 22:19Z to 22:30Z on 2026-10-27. The raw output is in `progress/measure.out.txt` next to this file.

## 1. Action pins at ecebdc90

There is no composite action in the repository: `.github/actions` is absent, and no `action.yml` or `action.yaml` exists outside `node_modules`. No workflow has a `docker://` use or a local `uses: ./…`.

| Pin | Comment | Uses | file:line (`.github/workflows/`) |
|---|---|---|---|
| `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 | 22 | approval-of-record.yml:30; ci.yml:40, 179, 193, 305, 427, 465, 506, 666; content-calendar.yml:48; large-zip.yml:26; mutation.yml:49, 81, 168; publish-content.yml:26; release-capacity.yml:47; release-dry-run.yml:78, 268; release.yml:69, 225; screening-capacity.yml:83, 156 |
| `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` | v7.1.0 | 22 | approval-of-record.yml:32; ci.yml:43, 182, 196, 313, 433, 468, 512, 727; content-calendar.yml:51; large-zip.yml:32; mutation.yml:54, 85, 174; publish-content.yml:29; release-capacity.yml:76, 82; release-dry-run.yml:145, 317; release.yml:148, 274; screening-capacity.yml:201 |
| `pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413` | v6.1.0 | 17 | ci.yml:42, 181, 195, 312, 432, 467, 511; content-calendar.yml:50; large-zip.yml:31; mutation.yml:53, 84, 172; publish-content.yml:28; release-capacity.yml:81; release-dry-run.yml:314; release.yml:271; screening-capacity.yml:200 |
| `actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | v7.1.0 | 1 | ci.yml:45 |
| `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9` | v7.0.2 | 9 | ci.yml:480, 573; mutation.yml:100; release-capacity.yml:106; release-dry-run.yml:191; release.yml:140, 196, 310; screening-capacity.yml:312 |
| `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333` | v8.0.2 | 9 | ci.yml:553; mutation.yml:181; release-dry-run.yml:214, 272, 276; release.yml:229, 233, 336, 437 |
| `actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | v6.1.0 | 11 | ci.yml:143, 206, 226, 318, 338, 367, 517, 537; large-zip.yml:50; screening-capacity.yml:246, 278 |
| `actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | v6.1.0 | 6 | ci.yml:155, 244, 255, 405; screening-capacity.yml:269, 289 |
| `docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069` | v4.4.1 | 5 | ci.yml:671; release-capacity.yml:54; release-dry-run.yml:85; release.yml:76; screening-capacity.yml:163 |
| `docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc` | v7.4.0 | 7 | ci.yml:680, 704; release-capacity.yml:63; release-dry-run.yml:112; release.yml:103; screening-capacity.yml:175, 188 |
| `docker/login-action@81c6f93d4bc991e510b342a00b419b3bb4efc5c6` | v4.7.0 | 2 | release-dry-run.yml:220; release.yml:342 |
| `aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25` | v0.36.0 | 5 | ci.yml:690, 715; release-dry-run.yml:131; release.yml:120, 131 |
| `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8` | v4.2.2 | 1 | release.yml:444 |

**What is new or changed since the design's 12:** no pin. These are the same 12 commits and 13 refs (cache/restore and cache/save share `55cc8345`) as `lane-b-ci.md:548-561` and P1 §2.3.

The only changes are in where the pins are used:
- Three workflow files arrived after 6ddd587 and are present at e908c21: `content-calendar.yml`, `release-capacity.yml` and `release-dry-run.yml`. They use existing pins only (commit `8daf8f64`).
- The table's "Uses" column was counted at 6ddd587, so the counts above are higher.

**What is new among the image pins (§3):** the BuildKit builder, `moby/buildkit:v0.34.1@sha256:99368f3e…`. It is set in setup-buildx's `driver-opts` in five workflows. It was added by `8890c4e6` (2026-10-26T03:59:21Z). That commit is not in the design's base `19e3d98e` (2026-10-26T01:48:52Z): `git merge-base --is-ancestor 8890c4e6 19e3d98e` returns false.

## 2. Local measurement with the design's method

Method:
- For each repository: `git init --bare`, then `git fetch --filter=tree:0 --no-tags <url> '+refs/heads/*:refs/heads/*' +refs/tags/<v>:refs/tags/<v>` into `scratchpad/p1reread/tmp/`. Each fetch took 0.53 to 1.11 s and stored 196 to 1,056 KiB of objects.
- `git rev-parse refs/tags/<v>^{commit}` and `git cat-file -t`.
- `git ls-remote --symref <url> HEAD`, then `git merge-base --is-ancestor`.
- `gpgv --status-fd 1 --keyring <binary export of both web-flow keys>` on the commit's `gpgsig` and its payload.

Keys: both fingerprints came from `keyserver.ubuntu.com` (HTTP 200 at 2026-10-27T22:19Z). `github.com/web-flow.gpg` answered 403 at 22:19:09Z.
- `968479A1AFF927E37D1A566BB5690EEEBB952194` was created at 1705428342 (2024-01-16T18:05:42Z) and has no expiry.
- `5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23` expires at 1705435200 (2024-01-16T20:00:00Z), as §13 S7 says.

Ages are measured at 2026-10-27T22:20:28Z, against a floor of `pnpm-workspace.yaml:44` `minimumReleaseAge: 4320` minutes (3 days).

| Pin | Version | On default branch | Tag names pin (peeled) | Committer time (= author time) | Signature time (VALIDSIG 968479A1…) | Tagger time | Youngest local signal | Age (days) | 3-day floor |
|---|---|---|---|---|---|---|---|---|---|
| actions/checkout `3d3c42e5` | v7.0.1 | yes (`main`) | yes | 2026-07-17T18:45:11Z | 2026-07-17T18:45:11Z | lightweight | 2026-07-17T18:45:11Z | 102.15 | pass |
| actions/setup-node `949feb24` | v7.1.0 | yes (`main`) | yes | 2026-10-08T02:43:26Z | 2026-10-08T02:43:26Z | lightweight | 2026-10-08T02:43:26Z | 19.82 | pass |
| pnpm/action-setup `ea17c68d` | v6.1.0 | yes (`master`) | yes | 2026-09-04T23:42:41Z | 2026-09-04T23:42:41Z | **2026-09-05T07:26:11Z** (annotated) | 2026-09-05T07:26:11Z (tagger) | 52.62 | pass |
| actions/setup-python `6d4fd22b` | v7.1.0 | yes (`main`) | yes | 2026-10-22T02:33:06Z | 2026-10-22T02:33:06Z | lightweight | 2026-10-22T02:33:06Z | **5.82** | pass (under 7 d until 2026-10-29T02:33:06Z) |
| actions/upload-artifact `cf430e03` | v7.0.2 | yes (`main`) | yes | 2026-10-07T10:00:52Z | 2026-10-07T10:00:52Z | lightweight | 2026-10-07T10:00:52Z | 20.51 | pass |
| actions/download-artifact `9000827c` | v8.0.2 | yes (`main`) | yes | 2026-10-07T10:00:57Z | 2026-10-07T10:00:57Z | lightweight | 2026-10-07T10:00:57Z | 20.51 | pass |
| actions/cache `55cc8345` (restore, save) | v6.1.0 | yes (`main`) | yes | 2026-06-23T20:30:28Z | 2026-06-23T20:30:28Z | lightweight | 2026-06-23T20:30:28Z | 126.08 | pass |
| docker/setup-buildx-action `f87e5991` | v4.4.1 | yes (`master`) | yes | 2026-09-16T07:47:45Z | 2026-09-16T07:47:45Z | lightweight | 2026-09-16T07:47:45Z | 41.61 | pass |
| docker/build-push-action `c3c9e263` | v7.4.0 | yes (`master`) | yes | 2026-09-15T07:29:04Z | 2026-09-15T07:29:04Z | lightweight | 2026-09-15T07:29:04Z | 42.62 | pass |
| docker/login-action `81c6f93d` | v4.7.0 | yes (`master`) | yes | 2026-10-23T15:11:41Z | 2026-10-23T15:11:41Z | lightweight | 2026-10-23T15:11:41Z | **4.30** | pass (under 7 d until 2026-10-30T15:11:41Z) |
| aquasecurity/trivy-action `ed142fd0` | v0.36.0 | yes (`master`) | yes | 2026-04-22T09:20:48Z | 2026-04-22T09:20:48Z | **2026-04-22T09:29:59Z** (annotated, **SSH-signed**) | 2026-04-22T09:29:59Z (tagger) | 188.54 | pass |
| actions/attest-build-provenance `4d101475` | v4.2.2 | yes (`main`) | yes | 2026-08-06T19:54:05Z | 2026-08-06T19:54:05Z | lightweight | 2026-08-06T19:54:05Z | 82.10 | pass |

Facts that hold for all 12:
- Committer is `GitHub <noreply@github.com>`.
- Author time equals committer time.
- The commit carries a PGP `gpgsig`, and gpgv reports `GOODSIG B5690EEEBB952194` and `VALIDSIG 968479A1AFF927E37D1A566BB5690EEEBB952194`.
- The signature time equals the committer time to the second.
- No commit is SSH- or X.509-signed, and none is signed with the 2017 key.

Points to note:
- **Under seven days (Dependabot's cooldown):** login v4.7.0 at 4.30 d and setup-python v7.1.0 at 5.82 d.
- **Annotated tags:**
  - pnpm/action-setup v6.1.0: a PGP tag signature by `7B74D1299568B586BA9962B5649E4D4AF74E7DEC` (key id `649E4D4AF74E7DEC`), created 1788593171. The tagger date is 7.725 h after the commit.
  - trivy-action v0.36.0: an SSH tag signature (`SSHSIG`, ecdsa-sha2-nistp256). The tagger date is 9 min 11 s after the commit.
- `git ls-remote --tags` at 22:20Z shows each pin is still the newest `v*` release tag of its repository.
- **Not readable here:** `verified_at`, `published_at` and `immutable`.
  - api.github.com answered 403 for docker/login-action at 22:25:48Z ("GitHub access to this repository is not enabled for this session").
  - github.com's release HTML answered 403.
  - The GitHub MCP read tools refuse other repositories ("not configured for this session"). For this repository, `get_commit` returns no `verification` object.
  - These remain **not verified**.

## 3. Images on Docker Hub (2026-10-27T22:20:59Z to 22:22:48Z)

The repository holds three digests. `apps/*/Dockerfile` has no `# syntax=` line.

| Image (where) | Tag digest = pin | `tag_last_pushed` | Youngest `images[].last_pushed` | Youngest signal | Age (days, at 22:21:00Z) | 3-day floor |
|---|---|---|---|---|---|---|
| `node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea` (apps/web/Dockerfile:7, 24; apps/worker/Dockerfile:5, 23) | yes | 2026-10-21T17:39:11.31Z | 2026-10-21T17:39:10.53Z (an `unknown` attestation manifest) | tag | **6.20** (7 d at 2026-10-28T17:39:11Z) | pass |
| `postgres:18-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` (docker-compose.yml:8) | yes | 2026-10-21T19:08:32.86Z | 2026-10-21T19:08:22.62Z (attestation) | tag | **6.13** (7 d at 2026-10-28T19:08:32Z) | pass |
| `moby/buildkit:v0.34.1@sha256:99368f3e46177c6405b9740e4461d91cee004128daeecca78d4ceac50ec1da5c` (ci.yml:673, release-capacity.yml:56, release-dry-run.yml:88, release.yml:79, screening-capacity.yml:165, as `driver-opts: image=…`) | yes | 2026-10-20T21:37:36.86Z | 2026-10-20T21:36:33.58Z (s390x) | tag | 7.03 | pass |

- In all three, `tag_last_pushed` is the youngest signal; every `images[].last_pushed` is earlier.
- BuildKit's newest semver tag on Hub is still v0.34.1. v0.34.0 was pushed 2026-10-07. `master`/`nightly` were pushed 2026-10-27T10:36Z.
- `latest` also names `99368f3e`, pushed 2 s after `v0.34.1`.
- Hub's legacy path `/v2/repositories/moby/buildkit/tags/v0.34.1`, which `buildkit.ts:76` uses, returns the same body as the namespaces path (22:29:38Z).

**Superseded digests:** none today. I still ran the design's listing (`?page_size=100&ordering=last_updated`, pages 1 to 5) to measure it:

| Repo (count) | Pinned digest found on | Page 1 span | Page 2 span | 5 pages reach back to |
|---|---|---|---|---|
| node (9,233) | page 1: `lts-trixie-slim`, `krypton-trixie-slim`; page 2: `24.22.1-trixie-slim`, `24.22-trixie-slim`, `24-trixie-slim` | 2026-10-21T17:40:14Z to 2026-10-22T02:42:09Z (9.0 h) | 2026-09-22T20:40Z to 2026-10-21T17:40Z (28.9 d) | 2026-06-24T05:42Z |
| postgres (1,433) | page 1: `trixie`, `latest`, `18.6-trixie`, `18.6`, `18-trixie`, `18` | 2026-08-05 to 2026-10-26T13:07Z | 2026-02-05 to 2026-08-05 | 2024-11-15 |
| moby/buildkit (366) | page 1: `latest`, `v0.34.1` | 2026-01-16 to 2026-10-27T10:36Z | 2024-10-28 to 2026-01-16 | all 366 (4 pages; page 5 empty) |

**Rate-limit headers** (20 Hub reads, 19 with headers recorded):
- `x-ratelimit-limit: 180`.
- `x-ratelimit-remaining` was between 174 and 180.
- `x-ratelimit-reset` was about 60 s ahead: 1793139720 (22:22:00Z) for a 22:21:00Z read.
- No `Retry-After` header was sent.
- `x-ratelimit-ip` changed from read to read: 9 egress addresses, `160.79.106.16` to `.143`. So the remaining count here is per proxy egress address, not per session.

**The gap at ecebdc90:**
- P1 §3.2 reads only the Dockerfiles and `docker-compose.yml`.
- The builder digest is checked only by `tools/check-action-pins/buildkit.ts`, called from `check.ts:121-125`, with `isNew` at `:124`. That check asserts two things:
  1. The tag still names the digest (an error when new).
  2. A newer release at least `BUILDKIT_AGE_MS` old exists (a warning). That threshold is hard-coded as `3 * 24 * 60 * 60 * 1000` at `buildkit.ts:20` and used at `:93`.
- It never holds the **pinned** version's own push time to the floor. A hand bump to a builder pushed minutes ago passes `static`.
- Dependabot never rewrites `driver-opts` (`buildkit.ts:6`), so every builder change is a hand bump. That is exactly the case P1 exists for.

## 4. GitHub's documented behaviour, re-checked

Sources: `github/docs` at `3869faed240317911b720c484aef61931b8474ec` (2026-10-27T20:34:33Z), a blobless sparse clone of `content/` and `data/reusables/`. `github/rest-api-description` at `83a2153cd1ed70a3191a0d18f66be0eed92e91da` (2026-10-27T18:17:32Z).

**Commit verification** (`content/authentication/managing-commit-signature-verification/about-commit-signature-verification.md`):
- `:46` is the "Persistent commit signature verification" heading. `:50` says the record "can't be edited and will persist". `:52` says the timestamp is readable through "the REST API, which includes a `verified_at` field".
- `:54` holds the "next time" sentence, unchanged: "For any commits that predate this feature, a persistent record will be created the next time the commit's signature is verified".
- `:68` holds the network scope: the record is "reused" across the repository and its forks.
- `:150` holds the custom committer line: bot verification works only with "no custom author information, custom committer information, and no custom signature information".
- `:91` is the `https://github.com/web-flow.gpg` key.
- The file gives **no date** for when persistent verification began. P1 §2.1's "November 2024" has no cite here.

**Immutable releases:**
- `content/code-security/concepts/supply-chain-security/immutable-releases.md:22` is unchanged: "its associated Git tag is locked to a specific commit, cannot be changed, and cannot be deleted while the release exists. If you delete the immutable release, you can delete the tag, but you cannot reuse the same tag name". `:25` says title, notes and the pre-release and latest flags stay editable. `:27` says publishing creates a release attestation of tag, commit SHA and assets.
- `content/actions/how-tos/create-and-publish-actions/using-immutable-releases-and-tags-to-manage-your-actions-releases.md:14` tells action authors to "develop and validate a potential release for your action on a release branch". `:17-23` says tags without a release stay movable (the `v1` major tags).

**REST schemas** (`descriptions/api.github.com/api.github.com.2022-11-28.json`; the 2026-03-10 file has identical definitions):
- `components.schemas.verification` (`:157417`): `verified_at` (`:157435`) is `{"type":"string","nullable":true}` and is in `required` (`:157445`), next to `verified`, `reason`, `payload` and `signature`. The commit object reaches it through `commit.commit.verification` (`$ref`).
- `components.schemas.release` (`:138134`): `immutable` (`:138198`) is a boolean that is **not in `required`**. `published_at` is required and nullable (`date-time`).
- `GET /repos/{o}/{r}/immutable-releases` reports whether a repository has the setting on. It needs admin read access, so it cannot be used for upstream repositories.

**API versions:** `data/tables/rest-api-versions.yml:5-8`: `2022-11-28` reaches end of support on "March 10, 2028", and `2026-03-10` has no date set. `content/rest/about-the-rest-api/api-versions.md:51` says versions are supported for 24 months after a newer one. No code in the repository sets `X-GitHub-Api-Version` (`git grep`). The 2026-03-10 breaking changes (`data/reusables/rest-api/breaking-changes-changelog.md:4-641`) do not touch `GET /repos/{o}/{r}/commits/{ref}` or `GET …/releases/tags/{tag}`.

**`GITHUB_TOKEN` rate:** `data/reusables/rest-api/primary-rate-limit-github-token-in-actions.md:1`: "1,000 requests per hour per repository" (15,000 for Enterprise Cloud). Unchanged.

**Events:** `content/rest/activity/events.md:38` (300 events, 30 days). Unchanged.

**Dependabot cooldown:** `content/code-security/reference/supply-chain-security/dependabot-options-reference.md:187` (cooldown is for version updates only) and `:196` (the default of 3 days "does not apply to security updates"). Both hold.

**A tag's creation time:**
- No REST schema carries one. `git-ref` has `ref, node_id, url, object`. `tag` has `name, commit, zipball_url, tarball_url, node_id`. `git-tag` has only `tagger.date`, and only for an annotated tag.
- `/repos/{o}/{r}/tags/protection` has no methods left.
- Tag rulesets exist ("Tag protections", `content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository.md:74`), but they expose no creation time. Rule suites carry `pushed_at`, but only for your own rulesets and with admin access.
- **New to the design:** `GET /repos/{o}/{r}/activity` (json `:57711`, "List repository activities"). It has `ref`, `timestamp`, `before`, `after` and a `ref` filter, but its `activity_type` enum is `push, force_push, branch_creation, branch_deletion, pr_merge, merge_queue_merge`. Its doc (`using-the-activity-view-to-see-changes-to-a-repository.md:15-17`) speaks only of branches. Whether it records tag pushes is **not documented and not verified** here.

**Pinned actions publishing immutable releases:** **not verified**. The HTML release page, api.github.com and the MCP read tools are all refused here, and the docs list no publishers. P1's CI run (acceptance 8) remains the only reader.

## 5. Dependabot

**Open pull requests:**
- `git ls-remote --heads origin 'dependabot/*'` at 22:22:14Z returns one branch: `dependabot/docker/apps/web/claude/build-platform/base-images-f35557443a` at `5fab269e`, which is `refs/pull/33/head`.
- The MCP `list_pull_requests` (state open) lists 7 open PRs. **#33 is the only one from Dependabot.** It targets `claude/build-platform` and is "behind" (base `e908c214`). No actions PR and no PR into `main` is open.

**#33:**
- Title: "Bump the base-images group across 2 directories with 1 update".
- Created 2026-10-21T13:07:03Z. The head commit was written 2026-10-26T21:08:26Z, two minutes after #48 merged at 21:06:13Z.
- Both Dockerfiles change `node:24-trixie-slim@43b9…` to `node:26-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec`. This is a node major, which `dependabot.yml:95-97` now ignores.

**What P1 does to #33:**
- The digest is new against the base. Hub `26-trixie-slim` at 22:22:48Z: digest equal, `tag_last_pushed` 2026-10-21T17:39:48.81Z, youngest image 17:39:44.40Z. Age 6.19 d, so P1's age rule **passes** it.
- The superseded-digest search would also find it on page 1 (`trixie-slim`, `slim`, `current-trixie-slim`, `current-slim`) and page 2 (`26.12.1-trixie-slim`, `26.12-trixie-slim`, `26-slim` and others).
- When Dependabot wrote this head, the digest was **5.06 days** old. That is younger than the 7-day cooldown at `dependabot.yml:92-93`.
- The cause is not verified. It may be the rebase path, or the pre-#48 config (`d725977:.github/dependabot.yml:28-35`, no cooldown, so GitHub's 3-day default applies, options reference `:196`).
- Never merge it (the brief).

**dependabot-core cites:** checked at `main` `d710c250d7c67dac843b375065c6614dc5ead3e1` (2026-10-27T22:01:14Z), blobless clone. `git diff 7c06280 HEAD` is empty for all three cited files, so every cite holds:
- `common/lib/dependabot/git_cooldown_date_resolver.rb:15` (priority: published_at, then tag creation date, then commit date) and `:44-54` (the sig at `:44`; `resolve_candidate_date` at `:45-54`; `tag_creation_date` at `:75`).
- `github_actions/lib/dependabot/github_actions/update_checker/latest_version_finder.rb:376-377` (`return false unless release_date&.length&.positive?`). Also `:323-342`: release `published_at` first, then `fetch_date_from_git` at `:344-371`, which uses `for-each-ref %(creatordate)` and falls back to the commit's `%cd`.
- `docker/lib/dependabot/docker/update_checker.rb:476-540`. `docker_hub_tag_release_date` takes **only** `tag_last_pushed`, and only when Hub's digest matches (`:534-537`). `:1113-1131` is `digest_within_cooldown?`, which fails open (`:1120-1125`).
- Two further lines bear on P1's §9:
  - `:442-460` `apply_cooldown`: a candidate tag is skipped while its `tag_last_pushed` is in the cooldown, and used outright when there is no date.
  - `:1143-1150` `resolved_digest_for`: a digest-only refresh keeps the old digest while it is in the cooldown, but a tag change writes `digest_of(updated_tag)`, the tag's current digest.
- Nothing in `github_actions/lib` or `common/lib` reads a release's `immutable` field (`git grep -i immutable`).

## Changes the design needs

1. **§2.3 "Measured today (2026-10-26)": re-measure and add BuildKit.**
   - *New text:* "Re-measured 2026-10-27T22:20Z at ecebdc90. Same 12 commits and 13 refs; fetches 0.53 to 1.11 s, 196 to 1,056 KiB. All are on their default branch, each tag still names its pin, and all are web-flow signed (`968479A1…`) with signature time = committer time = author time. Under seven days: login v4.7.0 (4.30 d; seven days at 2026-10-30T15:11:41Z) and setup-python v7.1.0 (5.82 d; 2026-10-29T02:33:06Z). Annotated: pnpm/action-setup (tagger 2026-09-05T07:26:11Z, PGP `7B74D129…649E4D4AF74E7DEC`) and trivy-action (tagger 2026-04-22T09:29:59Z, SSH ecdsa-sha2-nistp256). Hub: node `43b9…` 2026-10-21T17:39:11Z (6.20 d), postgres `edb0…` 2026-10-21T19:08:32Z (6.13 d), **moby/buildkit:v0.34.1 `99368f3e…` 2026-10-20T21:37:36Z (7.03 d)**. Nothing trips."
   - *Evidence:* §2 and §3 above.
2. **§1 acceptance 3, §2.2, §3.2, §4, §5 (`images.test.ts`), §7 CI-22, §8 B1/B2, §11: the BuildKit builder digest is an image P1 must age.**
   - *Change:* The image rule's set becomes "the Dockerfiles' `FROM`s, `docker-compose.yml`'s `services.*.image`, **and the setup-buildx steps' `driver-opts: image=moby/buildkit:vX.Y.Z@sha256:…`**". Build one Hub age function: youngest of `tag_last_pushed` and `images[].last_pushed` when the digest matches, the tags search otherwise, and the rate-limit wait. Put it in `tools/check-toolchain/images.ts` (B2) and export it.
   - `tools/check-action-pins/buildkit.ts`'s `checkBuilder` (B1) calls it when `isNew` (`check.ts:124`): an error under the floor on a pull request, a warning on push. `BUILDKIT_AGE_MS` (`buildkit.ts:20`, used `:93`) is replaced by `releaseAgeMinutes`, for the same reason as N3.
   - `image-age-exceptions.json` accepts the builder's `moby/buildkit:vX.Y.Z@sha256:…`. §4 adds `buildkit.ts` and `buildkit.test.ts` as changed files. Tests: a new builder pushed 2 days ago fails and one 3 days old passes; an unchanged builder makes no age read; on push it warns.
   - Fix §2.2's "none today; ci-browser adds no image" to "ci-deps added `moby/buildkit` by digest (`8890c4e6`, after `19e3d98e`), a Docker Hub image, so it is measurable".
   - *Evidence:* ci.yml:673, release-capacity.yml:56, release-dry-run.yml:88, release.yml:79, screening-capacity.yml:165. `buildkit.ts:6` says Dependabot never rewrites `driver-opts`. `buildkit.ts:64-104` checks no age of the pinned tag. `git merge-base --is-ancestor 8890c4e6 19e3d98e` returns false.
3. **§2.2 "a page covers about 9 hours of pushes":** a page's span depends on the push burst.
   - *New text:* "node's first page covers 9.0 h, its second 28.9 d (2026-10-27). Five pages reach 2026-06-24 for node, 2024-11-15 for postgres and all 366 BuildKit tags. Today's node digest is on five tags across pages 1 and 2."
   - *Evidence:* §3 table.
4. **§2.1 table, "Release `published_at` and `immutable`", and §3.1 step 4: `immutable` is optional in the schema.**
   - *New text:* "`immutable` is not in the release schema's `required` list, so a release object without it counts as mutable. `published_at` is required but nullable, and a null gives no signal."
   - Add a test: a release answer without `immutable` is treated as mutable, never as immutable.
   - *Evidence:* `api.github.com.2022-11-28.json:138134` (release), `:138198` (immutable). The same holds in 2026-03-10.
5. **§3.1 step 4, `X-GitHub-Api-Version: 2022-11-28`.**
   - *New text:* Send `2026-03-10`, which has no end-of-support date and identical `verification` and `release` schemas. None of its breaking changes touches the two endpoints. If 2022-11-28 is kept instead, ADR Part 5 must list "2022-11-28 ends support 2028-03-10" as a revisit trigger.
   - *Evidence:* `data/tables/rest-api-versions.yml:5-8`; `api-versions.md:51`; the changelog `:4-641`; the schema comparison in §4.
6. **§1 "no interface exposes [when a tag came to name a commit]", §2.1 row "Tag ref's first appearance", C4, §6 revisit trigger: name the repository activity API and say tags are undocumented there.**
   - *New text:* "REST exposes no ref or tag creation time (`git-ref`, `tag`). The activity API (`GET /repos/{o}/{r}/activity`) records pushes with a timestamp per `ref`, but its documented types are branch types only. Whether it records tag pushes is unverified."
   - Add to §8, as the integrator's observation and never as a gate: P1's CI run prints that endpoint with `ref=refs/tags/<v>` for each of the 12 pins, so ADR Part 5 records whether it closes R7. That is one more read per pin, within the 1,000/h limit.
   - *Evidence:* json `:57711`; the activity-view doc `:15-17`; the schema keys in §4.
7. **§2.1 "Late `verified_at`": "(November 2024)" has no cite.**
   - *New text:* "before persistent verification (the docs give no start date)". Keep `:54`.
   - *Evidence:* `about-commit-signature-verification.md:46-58` has no date.
8. **§2.1 web-flow row: give the new key's creation instant.**
   - *New text:* "`968479A1…` created 2024-01-16T18:05:42Z (keyserver, read 2026-10-27T22:19Z); the 2017 key expired 2024-01-16T20:00:00Z". `github.com/web-flow.gpg` is still 403 here (22:19:09Z).
   - *Evidence:* `gpg --with-colons` on the keyserver export.
9. **§9 "Its date is one of P1's signals, which is at least 7 days old when it opens".**
   - *New text:* "For images, Dependabot picks a tag only once its `tag_last_pushed` is past the cooldown (update_checker.rb:442-460). A tag change writes the tag's current digest (`:1143-1150`). #33's head (2026-10-26T21:08:26Z) carries a digest pushed 5.06 days earlier, under the 7-day cooldown; the cause is unverified. So a Dependabot image PR can carry a digest younger than its cooldown. P1 still holds it to three days, and when it is younger the PR is red until the printed instant, then a re-run passes."
   - Extend R4 to say so.
   - *Evidence:* §5.
10. **§3.2's Hub rate-limit sentence.**
    - *New text:* Keep "180 per window, reset about 60 s ahead". Add: "no `Retry-After` on 200s; through this session's proxy `x-ratelimit-ip` changes between reads, so the remaining count is per egress address (a runner has one)".
    - *Evidence:* §3, 19 recorded header sets.
11. **§3.1, "`ci.yml`'s 'Action pins' step (`:84-87` at 19e3d98e)":** it is now `ci.yml:85-88`, with `env` at `:87`. "Toolchain" is `:92-95`, and `static` runs on `ubuntu-26.04` (`:35`).
12. **§13 "Open":** add that the GitHub MCP read tools refuse every other repository here, and strip `verification` even for this repository. So `verified_at`, `published_at` and `immutable` stay readable only on CI. Acceptance 8 is unchanged.

## Notes and proposals (outside P1's scope)

- **#33** proposes a node major that `dependabot.yml:95-97` now ignores. It stays open and is "behind". It is not P1's business; the brief says never to merge it.
- **C5, the default-branch rule:** GitHub's own guidance for actions (`using-immutable-releases-and-tags…md:14`) puts releases on release branches. As publishers adopt immutable releases, `off-default-branch` excludes may become more common. The rule should stay (the safer option), but the runbook text in §6 should anticipate that path.
- **C9 (nested pins not aged):** not re-measured here. The nested refs are in the upstream composites (`lane-b-ci.md:657-660`), not in this repository.
- **Clean-up:** all scratch clones and repositories under `p1reread/tmp/` were removed when this was written. `progress/` is kept.
- **Clean-up side effect, for the session:** this scout removed the whole `p1reread/tmp/` directory at about 22:32Z. That also deleted `p1reread/tmp/vitest-unit.log`, which the sibling scout's `scout-files.md` cites. The scout had already finished: its report was written at 22:32:09Z. Its result (29 files and 358 tests passed, exit 0) is still recorded at `progress/scout-files.progress.md:36`. Re-run that vitest command if the log itself is needed.
