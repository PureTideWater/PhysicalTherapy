# Dependabot's Wednesday 2026-10-28 image runs on claude/build-platform (165c5993), and why #33 is still open

This was read-only. I fetched both jobs' whole logs: 236 lines for the docker job and 175 lines for the compose job, and `get_job_logs` returned each one inline. Nothing was commented, reviewed, closed, merged, written or pushed.

| Run | Job | Name | Result |
|---|---|---|---|
| 40634046721 | 122636804170 | docker in /apps/web, /apps/worker - Update #1659648179 | success, 04:44:57 to 04:45:30 |
| 40634047077 | 122636803792 | docker_compose in /. - Update #1659648185 | success, 04:44:56 to 04:45:22 |
| 40401687498 (for comparison) | 121848892213 | docker in /apps/web, /apps/worker for node, node, node, node - Update #1656303887 (2026-10-26, the run that last recreated #33) | success |

## Short answer

- **No pull requests were opened, updated or closed on Wednesday.** Both jobs were scheduled version runs (`"command":"version"`) for the multi-ecosystem group `container-images`. They used the new file: the node or postgres major is ignored, and the cooldown is 7 days. Each dependency ended with "No update needed", and each group ended with "Nothing to update for Dependency Group: 'container-images'".
- **Node 26 was filtered out by the ignore.** The digest refresh within major 24, and the one within postgres 18, were held back by the 7-day cooldown. Docker Hub had republished both tags hours before the run.
- **#33 never appeared in either job.** Both carried `"existing-pull-requests":[]` and `"existing-group-pull-requests":[]`. #33 belongs to the group `base-images`, which comes from main's old `dependabot.yml`. Dependabot no longer reads that file.
- **No scheduled run can close #33.** In dependabot-core a scheduled group run never closes a pull request. Even a refresh of #33 would not close it: when the group it was opened under has gone from the config, the refresh logs a warning and returns. **#33 stays open until a person closes it.**

## 1. The job definitions Dependabot printed

### Docker job 122636804170 (`/apps/web`, `/apps/worker`)

```
2026-10-28T04:45:20.2405493Z updater | 2026/10/28 04:45:20 INFO <job_1659648179> Job definition: {"job":{"command":"version","allowed-updates":[{"dependency-type":"direct","update-type":"all"}],"commit-message-options":{"prefix":null,"prefix-development":null,"include-scope":null},"credentials-metadata":[{"type":"git_source","host":"github.com"}],"debug":null,"dependencies":null,"dependency-groups":[{"name":"container-images","rules":{"patterns":["*"]}}],"dependency-group-to-refresh":null,"existing-pull-requests":[],"existing-group-pull-requests":[],"experiments":{"record-ecosystem-versions":true,"record-update-job-unknown-error":true,"azure-registry-backup":true,"automatic-github-packages-auth":true,"blocked-versions":true,"workflow-job-summary":true,"async-retry":true,"enable-npmrc-credential-generation":true,"proxy-read-only-git-credentials":true,"proxy-egress-observe":true,"proxy-egress-enforce":true,"github-actions-lockfile":true,"maven-wrapper-updater":true,"prioritize-scm-source":true,"enable-yarn-berry-conflicting-dependencies":true},"ignore-conditions":[{"dependency-name":"node","version-requirement":null,"update-types":["version-update:semver-major"],"source":".github/dependabot.yml","updated-at":"2026-10-26T23:03:38.000Z"}],"lockfile-only":false,"package-manager":"docker","requirements-update-strategy":null,"reject-external-code":false,"security-advisories":[],"security-updates-only":false,"source":{"provider":"github","repo":"PureTideWater/PhysicalTherapy","branch":null,"directory":null,"api-endpoint":"https://api.github.com/","hostname":"github.com","directories":["/apps/web","/apps/worker"]},"updating-a-pull-request":false,"update-subdependencies":false,"vendor-dependencies":false,"enable-beta-ecosystems":false,"repo-private":false,"cooldown":{"default-days":7,"semver-major-days":0,"semver-minor-days":0,"semver-patch-days":0,"include":[],"exclude":[]},"multi-ecosystem-update":true,"exclude-paths":null}}
```

### Compose job 122636803792 (`/`)

```
2026-10-28T04:45:15.6300021Z updater | 2026/10/28 04:45:15 INFO <job_1659648185> Job definition: {"job":{"command":"version","allowed-updates":[{"dependency-type":"direct","update-type":"all"}],"commit-message-options":{"prefix":null,"prefix-development":null,"include-scope":null},"credentials-metadata":[{"type":"git_source","host":"github.com"}],"debug":null,"dependencies":null,"dependency-groups":[{"name":"container-images","rules":{"patterns":["*"]}}],"dependency-group-to-refresh":null,"existing-pull-requests":[],"existing-group-pull-requests":[],"experiments":{"record-ecosystem-versions":true,"record-update-job-unknown-error":true,"azure-registry-backup":true,"automatic-github-packages-auth":true,"blocked-versions":true,"workflow-job-summary":true,"async-retry":true,"enable-npmrc-credential-generation":true,"proxy-read-only-git-credentials":true,"proxy-egress-observe":true,"proxy-egress-enforce":true,"github-actions-lockfile":true,"maven-wrapper-updater":true,"prioritize-scm-source":true,"enable-yarn-berry-conflicting-dependencies":true},"ignore-conditions":[{"dependency-name":"postgres","version-requirement":null,"update-types":["version-update:semver-major"],"source":".github/dependabot.yml","updated-at":"2026-10-26T23:03:38.000Z"}],"lockfile-only":false,"package-manager":"docker_compose","requirements-update-strategy":null,"reject-external-code":false,"security-advisories":[],"security-updates-only":false,"source":{"provider":"github","repo":"PureTideWater/PhysicalTherapy","branch":null,"directory":"/.","api-endpoint":"https://api.github.com/","hostname":"github.com"},"updating-a-pull-request":false,"update-subdependencies":false,"vendor-dependencies":false,"enable-beta-ecosystems":false,"repo-private":false,"cooldown":{"default-days":7,"semver-major-days":0,"semver-minor-days":0,"semver-patch-days":0,"include":[],"exclude":[]},"multi-ecosystem-update":true,"exclude-paths":null}}
```

### The fields asked for

| Field | Docker job | Compose job |
|---|---|---|
| package-manager | `docker` | `docker_compose` |
| directories | `"directories":["/apps/web","/apps/worker"]` | `"directory":"/."` |
| branch | `null` (the default branch, which is now `claude/build-platform`) | `null` |
| dependency-groups | `[{"name":"container-images","rules":{"patterns":["*"]}}]` | the same |
| ignore-conditions | node, `["version-update:semver-major"]`, source `.github/dependabot.yml`, updated-at `2026-10-26T23:03:38.000Z` | postgres, the same |
| cooldown | `"default-days":7`, the semver-specific days all 0 | the same |
| existing-pull-requests | `[]` | `[]` |
| existing-group-pull-requests | `[]`, so #33 and its `node` entries are **not** listed | `[]` |
| update type | `"command":"version"`, `"updating-a-pull-request":false`, `"dependency-group-to-refresh":null`, `"dependencies":null`, `"multi-ecosystem-update":true`. This is a scheduled version update, not a "recreate" or "update" of an existing pull request. | the same |

Both jobs then printed `Base commit SHA: 165c59932a261db62529b9ce4eb99f295df173ab`, at 04:45:22.6676137Z for docker and 04:45:17.9895370Z for compose.

### For comparison: the run that last recreated #33 (2026-10-26, job 121848892213)

```
2026-10-26T21:08:09.5253010Z updater | 2026/10/26 21:08:09 INFO <job_1656303887> Job definition: {"job":{"command":"recreate","allowed-updates":[{"dependency-type":"direct","update-type":"all"}],"commit-message-options":{"prefix":null,"prefix-development":null,"include-scope":null},"credentials-metadata":[{"type":"git_source","host":"github.com"}],"debug":null,"dependencies":["node","node","node","node"],"dependency-groups":[{"name":"base-images","rules":{"patterns":["*"]}}],"dependency-group-to-refresh":"base-images","existing-pull-requests":[{"pr-number":10,"dependencies":[{"dependency-name":"node","dependency-version":"26-slim","directory":"/apps/web"}]},{"pr-number":13,"dependencies":[{"dependency-name":"node","dependency-version":"26-slim","directory":"/apps/worker"}]}],"existing-group-pull-requests":[{"dependency-group-name":"base-images","dependencies":[{"dependency-name":"node","dependency-version":"25-slim","directory":"/apps/web"},{"dependency-name":"node","dependency-version":"25-slim","directory":"/apps/web"},{"dependency-name":"node","dependency-version":"25-slim","directory":"/apps/worker"},{"dependency-name":"node","dependency-version":"25-slim","directory":"/apps/worker"}],"pr-number":33}],"experiments":{"record-ecosystem-versions":true,"record-update-job-unknown-error":true,"azure-registry-backup":true,"automatic-github-packages-auth":true,"blocked-versions":true,"workflow-job-summary":true,"async-retry":true,"enable-npmrc-credential-generation":true,"proxy-read-only-git-credentials":true,"proxy-egress-observe":true,"proxy-egress-enforce":true,"github-actions-lockfile":true,"maven-wrapper-updater":true,"prioritize-scm-source":true,"enable-yarn-berry-conflicting-dependencies":true},"ignore-conditions":[],"lockfile-only":false,"package-manager":"docker","requirements-update-strategy":null,"reject-external-code":false,"security-advisories":[],"security-updates-only":false,"source":{"provider":"github","repo":"PureTideWater/PhysicalTherapy","branch":"claude/build-platform","api-endpoint":"https://api.github.com/","hostname":"github.com","directories":["/apps/web","/apps/worker"]},"updating-a-pull-request":true,"update-subdependencies":false,"vendor-dependencies":false,"enable-beta-ecosystems":false,"repo-private":false,"multi-ecosystem-update":false,"exclude-paths":null}}
```

This job matches **main's** `dependabot.yml` exactly, not the rewritten file:

- group `base-images`
- `"ignore-conditions":[]`
- no cooldown
- `"branch":"claude/build-platform"`, which comes from main's `target-branch`

main's file, at main 220f2b4e (blob 5eaa36ff), says:

- `.github/dependabot.yml:1`: "Dependabot reads this file from the default branch (main)."
- `.github/dependabot.yml:27-35`: `package-ecosystem: docker`, `directories: [/apps/web, /apps/worker]`, `target-branch: claude/build-platform`, `groups: base-images: patterns: ["*"]`.

The recreate ran on base `e908c214`, the merge commit of #48:

```
2026-10-26T21:08:12.5193652Z updater | 2026/10/26 21:08:12 INFO <job_1656303887> Base commit SHA: e908c214dfde33be8d9c8e1a2b734cc13cbc2209
```

## 2. What it decided for each dependency

### Docker job: `node` in /apps/web

Both FROM lines are `node:24-trixie-slim@sha256:43b9ba11…`. Dependabot snapshots each FROM line as a separate `node` dependency.

```
2026-10-28T04:45:23.5987247Z updater | 2026/10/28 04:45:23 INFO <job_1659648179> Dependency Snapshot: node
2026-10-28T04:45:23.5993845Z 2026/10/28 04:45:23 INFO <job_1659648179> Updating the /apps/web directory.
2026-10-28T04:45:23.6004163Z updater | 2026/10/28 04:45:23 INFO <job_1659648179> Checking if node 24-trixie-slim needs updating
2026-10-28T04:45:23.6011015Z updater | 2026/10/28 04:45:23 INFO <job_1659648179> Ignored versions:
2026-10-28T04:45:23.6012084Z 2026/10/28 04:45:23 INFO <job_1659648179>   version-update:semver-major - from .github/dependabot.yml
2026-10-28T04:45:24.5990666Z updater | 2026/10/28 04:45:24 INFO <job_1659648179> Original tag components: slim,trixie
2026-10-28T04:45:26.2582370Z updater | 2026/10/28 04:45:26 INFO <job_1659648179> Skipping tag 24-trixie-slim due to cooldown period
2026-10-28T04:45:26.2583535Z updater | 2026/10/28 04:45:26 INFO <job_1659648179> Latest version is 24-trixie-slim
2026-10-28T04:45:26.2585031Z updater | 2026/10/28 04:45:26 INFO <job_1659648179> Adding dependencies as handled: (node).
2026-10-28T04:45:26.2593916Z updater | 2026/10/28 04:45:26 INFO <job_1659648179> No update needed for node 24-trixie-slim
2026-10-28T04:45:26.2595256Z updater | 2026/10/28 04:45:26 INFO <job_1659648179> Skipping node in group container-images as it has already been handled by a previous group
```

### Docker job: `node` in /apps/worker

The decisions are identical:

```
2026-10-28T04:45:26.5907461Z 2026/10/28 04:45:26 INFO <job_1659648179> Updating the /apps/worker directory.
2026-10-28T04:45:26.5919252Z updater | 2026/10/28 04:45:26 INFO <job_1659648179> Checking if node 24-trixie-slim needs updating
2026-10-28T04:45:26.5920905Z updater | 2026/10/28 04:45:26 INFO <job_1659648179>   version-update:semver-major - from .github/dependabot.yml
2026-10-28T04:45:27.6918980Z updater | 2026/10/28 04:45:27 INFO <job_1659648179> Skipping tag 24-trixie-slim due to cooldown period
2026-10-28T04:45:27.6919767Z 2026/10/28 04:45:27 INFO <job_1659648179> Latest version is 24-trixie-slim
2026-10-28T04:45:27.6922742Z updater | 2026/10/28 04:45:27 INFO <job_1659648179> No update needed for node 24-trixie-slim
2026-10-28T04:45:27.6924219Z updater | 2026/10/28 04:45:27 INFO <job_1659648179> Skipping node in group container-images as it has already been handled by a previous group
2026-10-28T04:45:27.7289289Z updater | 2026/10/28 04:45:27 INFO <job_1659648179> Applying GroupDependencySelector filtering for group 'container-images'
2026-10-28T04:45:27.7291743Z updater | 2026/10/28 04:45:27 INFO <job_1659648179> No dependencies were filtered out
2026-10-28T04:45:27.7292652Z 2026/10/28 04:45:27 INFO <job_1659648179> Nothing to update for Dependency Group: 'container-images'
2026-10-28T04:45:27.8086420Z   proxy | 2026/10/28 04:45:27 [066] PATCH /update_jobs/1659648179/mark_as_processed
```

### Compose job: `postgres` in /

The pin is `postgres:18-trixie@sha256:edb0c08d…`.

```
2026-10-28T04:45:18.8525184Z updater | 2026/10/28 04:45:18 INFO <job_1659648185> Dependency Snapshot: postgres
2026-10-28T04:45:18.8528924Z updater | 2026/10/28 04:45:18 INFO <job_1659648185> Updating the / directory.
2026-10-28T04:45:18.8548242Z updater | 2026/10/28 04:45:18 INFO <job_1659648185> Checking if postgres 18-trixie needs updating
2026-10-28T04:45:18.8549940Z updater | 2026/10/28 04:45:18 INFO <job_1659648185> Ignored versions:
2026-10-28T04:45:18.8550921Z 2026/10/28 04:45:18 INFO <job_1659648185>   version-update:semver-major - from .github/dependabot.yml
2026-10-28T04:45:19.1750381Z updater | 2026/10/28 04:45:19 INFO <job_1659648185> Original tag components: trixie
2026-10-28T04:45:19.8538294Z updater | 2026/10/28 04:45:19 INFO <job_1659648185> Skipping tag 18-trixie due to cooldown period
2026-10-28T04:45:19.8539760Z updater | 2026/10/28 04:45:19 INFO <job_1659648185> Latest version is 18-trixie
2026-10-28T04:45:19.8551417Z updater | 2026/10/28 04:45:19 INFO <job_1659648185> No update needed for postgres 18-trixie
2026-10-28T04:45:20.2391726Z 2026/10/28 04:45:20 INFO <job_1659648185> Nothing to update for Dependency Group: 'container-images'
```

### Other images

There are none. The snapshots list only `node` (docker) and `postgres` (compose). The four Dockerfile FROM lines and the single compose `image:` line are the only image references at 165c5993. Neither Dockerfile has a `# syntax` line (runbook dependency-upgrades.md:231).

### How to read the node and postgres decisions

**The major was filtered by the ignore.** On 2026-10-26 the recreate fetched the `26-trixie-slim` manifest and tag:

```
2026-10-26T21:08:16.4403866Z   proxy | 2026/10/26 21:08:16 [038] GET https://hub.docker.com:443/v2/namespaces/library/repositories/node/tags/26-trixie-slim
2026-10-26T21:08:17.1719451Z updater | 2026/10/26 21:08:17 INFO <job_1656303887> Latest version is 26-trixie-slim
```

On Wednesday no request for `26-trixie-slim` appears. The only tag-detail lookup is the current tag:

```
2026-10-28T04:45:26.0765856Z   proxy | 2026/10/28 04:45:26 [038] GET https://hub.docker.com:443/v2/namespaces/library/repositories/node/tags/24-trixie-slim
```

In dependabot-core at eb80162 (the updater image tag), this path runs as follows:

- `fetch_latest_tag` runs `filter_ignored` before `apply_cooldown` (docker/lib/dependabot/docker/update_checker.rb:309-315).
- `filter_ignored` rejects every candidate the ignore requirements match (update_checker.rb:991-1006). That removed 25 and 26.
- The only candidate left was the current `24-trixie-slim`. The cooldown dropped it with "Skipping tag … due to cooldown period" (update_checker.rb:442-463).
- An empty candidate list falls back to the current tag (update_checker.rb:369). That is why the log says "Latest version is 24-trixie-slim".
- `GET .../tags/latest` resolves to 26.12.1 (`HEAD …/manifests/26.12.1` at 04:45:25.6540274Z). That request resolves `latest`; 26.12.1 was not an update candidate.

**The digest refresh was held by the cooldown.** A digest-only refresh, with the tag unchanged, counts as up to date while the tag's publication is inside the cooldown window (update_checker.rb:253-257, `digest_within_cooldown?` at 1112-1131). I read Docker Hub's tag API after the run:

| Tag | tag_last_pushed | Hub digest now | Repo's pin |
|---|---|---|---|
| `node:24-trixie-slim` | 2026-10-28T02:38:52Z, about 2 hours before the run | `sha256:f2fb6134…` | `sha256:43b9ba11…` |
| `postgres:18-trixie` | 2026-10-28T04:13:41Z, about 31 minutes before the run | `sha256:bc8d7bdd…` | `sha256:edb0c08d…` |

Both tags therefore have newer digests that the 7-day cooldown is holding back.

**About "already been handled by a previous group".** Each directory has two `node` dependencies, the `build` and `runtime` FROM lines. The first is checked and marked handled ("Adding dependencies as handled: (node)"). The second is skipped by group_update_creation.rb:360-372, whose message says "previous group" whatever the cause. Nothing was dropped: both lines carry the same tag and digest.

### Did either job mention #33?

No. Neither job has a line containing "33", "supersede", "close" or "base-images". Neither has a `create_pull_request`, `update_pull_request` or `close_pull_request` call. The only service calls are these:

- `GET /update_jobs/<id>/blocked_versions`
- `POST /update_jobs/<id>/update_dependency_list`
- `POST /update_jobs/<id>/increment_metric`
- `PATCH /update_jobs/<id>/mark_as_processed`

## 3. Errors and warnings

Neither job logged an `ERROR` or `WARN` from the updater, and both conclusions are `success`. These are the only warning-like lines. The same lines appear in the 2026-10-26 recreate run, and none affects the outcome.

- `2026-10-28T04:44:59.9425952Z 🤖 ~ Failed to parse GITHUB_REGISTRIES_PROXY environment variable ~` (docker job). The compose job has the same line at `2026-10-28T04:44:59.6767518Z`. The variable is empty (`GITHUB_REGISTRIES_PROXY: `) because no private registries are configured.
- `2026-10-28T04:45:18.5336984Z updater | rehash: warning: skipping ca-certificates.crt,it does not contain exactly one certificate or CRL` (docker job). The compose job has it at `2026-10-28T04:45:13.6454179Z`. This is the updater container's certificate setup.
- `2026-10-28T04:45:18.8207126Z updater | fetch_files command is no longer used directly` (docker job). The compose job has it at `04:45:13.9315949Z`. It is informational.
- `401 … Remote response: {"errors":[{"code":"UNAUTHORIZED","message":"authentication required",…}]}` on the first `tags/list` and `manifests` call to each image. One example:

  ```
  2026-10-28T04:45:23.7749981Z 2026/10/28 04:45:23 [014] Remote response: {"errors":[{"code":"UNAUTHORIZED","message":"authentication required","detail":[{"Type":"repository","Class":"","Name":"library/node","Action":"pull"}]}]}
  ```

  Each 401 is followed by an anonymous `auth.docker.io` token request (200) and the retried request (200). This is Docker Hub's normal token handshake.
- `2026-10-28T04:45:26.6191532Z   proxy | 2026/10/28 04:45:26 [040] * auth'd git request previously retried, won't retry again. (cached)` (docker job). The proxy served the cached 401 from the first directory. The next request, [044], returned 200.

## 4. Why #33 is still open, and what to expect next

### How #33 came to be

1. **The old config created it.** #33 was opened 2026-10-21 13:07 by run 39605064814. Its branch is `dependabot/docker/apps/web/claude/build-platform/base-images-f35557443a`. It belongs to the group `base-images` in main's file (main `.github/dependabot.yml:27-35`). That entry has `target-branch: claude/build-platform`, no ignore and no cooldown.

2. **#48's merge triggered the last recreate, which still used the old config.** #48 merged at 2026-10-26 21:06:13Z as `e908c214`. It changed the Dockerfiles' FROM lines from `node:24-slim` to `node:24-trixie-slim@sha256:…`, and the existing PR branch no longer applied. One minute later Dependabot ran a `"command":"recreate"` for `"dependency-group-to-refresh":"base-images"` (run 40401687498). That job still carried main's config: `"ignore-conditions":[]`, group `base-images`, `"branch":"claude/build-platform"`, `"multi-ecosystem-update":false`. It re-proposed 26:

   ```
   2026-10-26T21:08:17.1741943Z updater | 2026/10/26 21:08:17 INFO <job_1656303887> Updating node from 24-trixie-slim to 26-trixie-slim
   2026-10-26T21:08:18.5608500Z updater | 2026/10/26 21:08:18 INFO <job_1656303887> Target versions have changed, existing Pull Request should be superseded
   2026-10-26T21:08:18.5609369Z updater | 2026/10/26 21:08:18 INFO <job_1656303887> Creating a new pull request for 'base-images'
   ```

   GitHub then force-pushed #33's own branch, commit `5fab269e` at 21:08:28Z per the timeline, rather than opening a new pull request. The head's FROM lines are now `node:26-trixie-slim@sha256:36793bcb…`.

   The rewritten file was already present at that base commit. The recreate still ran with main's config, probably because Dependabot was reading main's file at that moment (main's header says so).

   Wednesday's ignore conditions carry `"updated-at":"2026-10-26T23:03:38.000Z"`, about two hours after the recreate. That fits Dependabot taking up the new file only then, but I cannot see when the default branch changed. The repository's default branch is now `claude/build-platform` (API `default_branch`).

   A side note: GitHub's stored record of #33 lists `"dependency-version":"25-slim"` four times, and the PR commit's trailer says the same. The PR body says 24-trixie-slim to 26-trixie-slim. The stored metadata is stale.

3. **Wednesday's runs belong to a different group and never touched #33.** The current file defines the multi-ecosystem group `container-images` (`.github/dependabot.yml:15-22` at claude/build-platform, blob 95d99dcf). It also defines:
   - the docker entry, with `multi-ecosystem-group: container-images` and the node major ignored (lines 88-97, ignore at 95-97);
   - the compose entry, with the postgres major ignored (lines 99-108, ignore at 106-108);
   - no `target-branch`; line 7 reads "Dependabot reads this file from the default branch, which is claude/build-platform until launch".

   The service gave Wednesday's jobs `"existing-group-pull-requests":[]`, so #33 was never passed to them. It would have made no difference if it had been. dependabot-core matches an existing group PR by group name only (`next false unless pr.dependency_group_name == group.name`, updater/lib/dependabot/updater/group_update_creation.rb:756-762), and `base-images` is not `container-images`.

### Why no scheduled run closes it

All citations are dependabot-core at eb80162bcc49eade1113260107bcf457102a40ad.

- **A multi-ecosystem version job never closes anything.** It runs `GroupUpdateAllVersions`: `return true if job.multi_ecosystem_update?` (operations/group_update_all_versions.rb:26), and that operation comes first in `OPERATIONS` (operations.rb:36-42). It only creates PRs, for groups without one (group_update_all_versions.rb:82-111). When there is nothing to do it logs "Nothing to update for Dependency Group" and stops, with no close (operations/create_group_update_pull_request.rb:77-82).
- **Only a refresh job closes a group PR.** It closes on "No updated dependencies, closing existing Pull Request" with reason `update_no_longer_possible` (group_update_refreshing.rb:36-41), or with reason `dependency_group_empty` when the group matches nothing (operations/refresh_group_update_pull_request.rb:111-119). The supersede path only creates a new PR and "leave[s] it to the backend to close the existing pull request" (group_update_refreshing.rb:63-68).
- **A refresh of a group that has left the config returns without closing.** This is the decisive case for #33:

  ```ruby
  # operations/refresh_group_update_pull_request.rb:95-104
  unless dependency_snapshot.job_group
    Dependabot.logger.warn(
      "The '#{job.dependency_group_to_refresh || 'unknown'}' group has been removed from the update config."
    )
    service.capture_exception(
      error: DependabotError.new("Attempted to refresh a missing group."),
      job: job
    )
    return
  end
  ```

  `job_group` is looked up by name in the job's configured groups (dependency_snapshot.rb:110-114), and `base-images` is not among them.

**So the ignore did not cause #33 to close, and nothing in dependabot-core will close it.**

- A scheduled `container-images` run cannot see #33.
- A refresh of #33 could come from a Dockerfile conflict or a `@dependabot rebase`/`recreate` comment. If the backend schedules one, it either:
  - ends at the warning above and leaves #33 open, or
  - if Dependabot were again given a config that defines `base-images` (main's file), rebuilds node 26 as it did on 2026-10-26.
- Whether GitHub's own backend sweeps up a PR whose update entry has disappeared is not visible from dependabot-core. I could not check GitHub's documentation because docs.github.com is outside this session's allowed network domains; it has to be allowed in the session's network settings to check that. Nothing in these logs shows such a sweep.

### What the build should expect next

**#33 stays open until a person closes it.** The rules say nobody merges it:

- `.github/dependabot.yml:2-4`: "triaged by a person, who never merges one as it stands".
- docs/runbooks/dependency-upgrades.md:10: "No Dependabot pull request merges as it stands."
- docs/runbooks/dependency-upgrades.md:239-243: Node 24 to 26 is a planned upgrade of its own, "before Gate 1".

Closing it is the founder's or triager's call. The ways to do it:

- **A plain close**, in the GitHub UI or with `gh pr close 33 --delete-branch`, with a comment pointing at the planned Node 26 upgrade.
- **Not `@dependabot ignore this major version`.** It would store an ignore outside the file, which the runbook's step 6 (dependency-upgrades.md:97-99) says should not exist.
- **Expect no reopening.** Nothing in the current config would recreate #33 after it is closed.

**#33 will keep showing as out of date or conflicting.** Its `mergeable_state` is already `behind`. If a later change to the FROM lines conflicts with it and the backend refreshes it, the likely outcome is the warning above (a failed or no-op run), not a close.

**Next Wednesday's run** is 2026-11-04 at 04:43 UTC:

- The node and postgres majors stay filtered.
- A `container-images` PR moves an image's digest (node within 24, postgres within 18) only if that image's tag has not been republished in the 7 days before the run. Each image is judged on its own, so the PR may carry one image and not the other.
- This week both had been republished within hours. If the official images keep being republished more often than every 7 days, the digest refresh may keep landing in the cooldown. Watch whether a `container-images` PR ever opens. The runbook's weekly triage step 1 (dependency-upgrades.md:49-56) already lists the `event=dynamic` runs where this shows.

**main's `.github/dependabot.yml`** (main 220f2b4e) still holds the old `base-images` entry. Dependabot does not read it while `claude/build-platform` is the default branch, but it is the only file that defines #33's group.
