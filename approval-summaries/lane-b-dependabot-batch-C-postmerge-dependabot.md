# Lane B, Dependabot batch C: the Dependabot runs started by #91's merge

Read 2026-11-02 at about 10:49 UTC. Nothing was changed: no comment, close, merge, push or re-run. Sources: `gh api` on
PureTideWater/PhysicalTherapy, and the four job logs fetched whole with
`gh api repos/PureTideWater/PhysicalTherapy/actions/jobs/<job>/logs`. The npm log was also cross-checked through the
GitHub MCP `get_job_logs` call, which reports `original_length` 5517, the same length as the download. "Line N" below
is a line number in that job log.

**Verdict: the routing works as #91 intended on the real Dependabot.** Each of the 65 direct npm dependencies was
assigned to exactly one group. All ten `@aws-sdk/*` packages went to `aws-sdk`. `next` and `@next/eslint-plugin-next`
went to `next`. The exact names went to their own groups. `minor-and-patch` held only what no other group names. The
logs have no routing-failure line, no release-age block and no error. The run replaced #98's single 18-update
`minor-and-patch` pull request with three group pull requests, #99, #100 and #101, which carry the same 18 updates
(10 + 2 + 6).

## Runs and jobs (all event=dynamic, completed/success, head 21fa10df on claude/build-platform)

| Ecosystem | Run | Job | Dependabot job | Updater image | Window (UTC) | Log lines |
| --- | --- | --- | --- | --- | --- | --- |
| npm_and_yarn | 41428297500 | 125220201984 | 1673602408 | dependabot-updater-npm:8786cc38 | 10:22:36 to 10:30:55 | 5517 |
| github_actions | 41428297535 | 125220201838 | 1673602426 | dependabot-updater-github-actions:8786cc38 | 10:22:36 to 10:25:05 | 3696 |
| docker | 41428297161 | 125220202372 | 1673602438 | dependabot-updater-docker:8786cc38 | 10:22:43 to 10:23:16 | 236 |
| docker_compose | 41428297846 | 125220202775 | 1673602451 | dependabot-updater-docker-compose:8786cc38 | 10:22:36 to 10:23:08 | 175 |

No other `event=dynamic` run was created on 2026-11-02 after these four. The day's earlier runs are 41386140808 and
41386141443 (04:01Z) and 41407378320 (07:36Z), all on older heads. Nothing recreated a group pull request after the
merge.

**Updater commit.** The npm image is 8786cc38519048e4031db4fa07a1e90eddcc5a35 (npm log line 52). That is not
85379652, the commit CI-12's model ports, so the runbook's step-1 check was run in a blobless clone of
dependabot-core. `git diff --quiet 85379652 8786cc38 --` over the four group-assignment files
(`dependency_group.rb`, `wildcard_matcher.rb`, `dependency_group_engine.rb`, `pattern_specificity_calculator.rb`)
returns 0, and so does the same diff over all of `updater/`, `common/` and `npm_and_yarn/`. 8786cc38 is the
pre-merge commit of the poetry change (#16767) whose squash is 85379652. The model and the real updater therefore
run the same code.

## (1) Groups considered and the dependencies assigned to each

**npm (job 125220201984).** The job definition (line 72) carries seven groups, in this order: browser-tests,
anthropic-sdk, pg-boss, next, aws-sdk, aws-cdk and minor-and-patch. `minor-and-patch` carries the 13
`exclude-patterns` from #91 and `update-types` [minor, patch]. `existing-group-pull-requests` is `[]`. Line 228
reads "Found 7 group(s)." Lines 158 to 222 are 65 `Checking specificity for <dep> in group '<group>' (applies_to:
version-updates)` lines: one per dependency, no dependency twice, and each in a single group.

| Group | Assigned (specificity lines 158-222) | Checked in group pass | Outcome |
| --- | --- | --- | --- |
| browser-tests (3) | @axe-core/playwright, @playwright/test, playwright-core | lines 229-298 | "Nothing to update" (line 298) |
| anthropic-sdk (1) | @anthropic-ai/sdk 1.3.0 | lines 299-338 | Nothing to update (line 338) |
| pg-boss (1) | pg-boss 12.38.0 (majors ignored) | lines 339-380 | Nothing to update (line 380) |
| next (2) | next 16.4.3, @next/eslint-plugin-next 16.4.3 (majors ignored) | lines 381-435 | Nothing to update (line 435) |
| aws-sdk (10) | @aws-sdk/client-bedrock-runtime, client-cognito-identity-provider, client-kms, client-rds, client-s3, client-sesv2, client-sqs, client-sts, client-textract, s3-request-presigner | lines 436-3033 | all 10 from 3.1152.0 to 3.1160.0; "Creating a pull request for 'aws-sdk'" (line 3033) |
| aws-cdk (3) | aws-cdk, aws-cdk-lib, constructs | lines 3371-3552 | aws-cdk-lib 2.273.0 to 2.275.0, aws-cdk 2.1145.0 to 2.1146.1, constructs current; pull request (line 3552) |
| minor-and-patch (45) | @eslint/js, @opentelemetry/api, @radix-ui/react-slot, @simplewebauthn/browser, @simplewebauthn/server, @stripe/react-stripe-js, @stripe/stripe-js, @stryker-mutator/api, @stryker-mutator/core, @stryker-mutator/vitest-runner, @tailwindcss/postcss, @types/node, @types/pg, @types/react, @types/react-dom, @types/yauzl, @types/yazl, @vitest/coverage-v8, aws-jwt-verify, class-variance-authority, clsx, decimal.js, drizzle-orm, esbuild, eslint, eslint-plugin-react-hooks, fast-check, globals, otpauth, pdfjs-dist, pg, postcss, react, react-dom, stripe, tailwind-merge, tailwindcss, tsx, typescript, typescript-eslint, vitest, yaml, yauzl, yazl, zod | lines 3647-4634 | 6 updates (below); pull request (line 4634) |
| security | not in this job | n/a | `applies-to: security-updates` (dependabot.yml lines 89-91), so a version job does not load it. The job's `security-advisories` is `[]`, and no security-update run took place. |

None of `@aws-sdk/*`, `@next/*`, `next`, `aws-cdk*`, `constructs`, `pg-boss`, `@anthropic-ai/sdk` or the playwright
and axe names appears under `minor-and-patch`. That is the difference from run 40818560725 and from #98, whose
`minor-and-patch` held all ten `@aws-sdk/*` updates plus aws-cdk-lib and aws-cdk.

After the group pass, the npm run made its normal pass over the remaining dependencies (lines 4851 to 5495, "Starting
update job" and "Checking all dependencies for version updates..."). It covered the 42 dependencies that the group
pass checked but did not mark handled, and each one ended with "No update needed" or "All updates for <dep> were
ignored" (typescript and @types/node, whose majors are ignored). It opened no individual pull request. The 23 handled
dependencies plus these 42 make up all 65.

**github_actions (job 125220201838).** One group, `actions` (patterns `*`), "Found 1 group(s)." (line 251). Lines 233
to 245 assign 13 actions to `actions`: actions/checkout, setup-node, setup-python, cache/restore, cache/save,
upload-artifact, download-artifact and attest-build-provenance, plus pnpm/action-setup, docker/setup-buildx-action,
docker/build-push-action, docker/login-action and aquasecurity/trivy-action. Every one is current. Line 3686 reads
"Nothing to update for Dependency Group: 'actions'".

**docker (job 125220202372).** One group, `container-images` (multi-ecosystem), "Found 1 group(s)." (line 108). It
holds `node`, checked in /apps/web and /apps/worker. Specificity is at lines 101 and 102. Line 227 reads "Nothing to
update for Dependency Group: 'container-images'".

**docker_compose (job 125220202775).** One group, `container-images`, "Found 1 group(s)." (line 106). It holds
`postgres` (specificity at line 100). Line 166 reads "Nothing to update".

## (2) Routing-failure and skip lines

None of the routing-failure lines appear. The runbook's grep
(`Pulling image|belongs to more specific group|no dependencies match|does not match any allowed`) finds only the two
`Pulling image` lines (npm lines 52 and 55). The runbook's awk for `no dependencies match` prints nothing. No log
contains `Skipping update group` or `belongs to more specific group`. Every group in every job had at least one
dependency.

The skip lines that do appear are all benign:

- docker, lines 157 and 215: "Skipping node in group container-images as it has already been handled by a previous
  group". Each follows "No update needed for node 24-trixie-slim" in the same directory (lines 156 and 214). The run
  has one group, so this is not routing between groups.
- docker, lines 153 and 211: "Skipping tag 24-trixie-slim due to cooldown period". compose, line 151: "Skipping tag
  18-trixie due to cooldown period". The 7-day cooldown held a newer digest of the same digest-pinned tag.
- github_actions, line 3687: "Found no dependencies to update after filtering allowed updates in /". This is the
  ungrouped pass after the `actions` group, and nothing is ungrouped.
- All four logs carry the same setup lines: "🤖 ~ Failed to parse GITHUB_REGISTRIES_PROXY environment variable ~"
  (line 49 in each) and "rehash: warning: skipping ca-certificates.crt,it does not contain exactly one certificate or
  CRL" (npm 66, actions 65, docker 66, compose 66). Neither affects updates.

## (3) Pull requests opened, updated, rebased or closed

The npm run created three pull requests through `POST /update_jobs/1673602408/create_pull_request`, each answered
204 (lines 3365-3366, 3641-3642 and 4845-4846). Its Results table at lines 5503-5510 shows three `created` rows. The
run made no update, rebase or close call. Its only other calls were record_ecosystem_versions, blocked_versions,
update_dependency_list, increment_metric, record_ecosystem_meta, record_cooldown_meta and mark_as_processed (lines
5500-5501). The actions, docker and compose runs created, updated or closed nothing and have no Results table.

| PR | Title | Head | Head SHA | Base | Created | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| #99 | Bump the aws-sdk group with 10 updates | dependabot/npm_and_yarn/aws-sdk-e366097b78 | dc7d68c7 | claude/build-platform @ 21fa10df | 10:27:47Z | all 10 @aws-sdk/* from 3.1152.0 to 3.1160.0; 7 files (6 package.json and pnpm-lock.yaml) |
| #100 | Bump the aws-cdk group with 2 updates | dependabot/npm_and_yarn/aws-cdk-7b647a8e22 | 7350d861 | same | 10:28:24Z | aws-cdk-lib 2.273.0 to 2.275.0, aws-cdk 2.1145.0 to 2.1146.1; infra/package.json and pnpm-lock.yaml |
| #101 | Bump the minor-and-patch group with 6 updates | dependabot/npm_and_yarn/minor-and-patch-9cfdc51c29 | d9646252 | same | 10:30:30Z | @stripe/react-stripe-js 7.0.0 to 7.0.1, @stripe/stripe-js 10.1.0 to 10.2.0, postcss 8.5.31 to 8.5.32, stripe 23.0.0 to 23.1.0, @opentelemetry/api 1.9.1 to 1.10.0, typescript-eslint 8.72.0 to 8.72.1 (pnpm catalog entry in pnpm-workspace.yaml); 5 files |

All three are open and not draft. Each has `mergeable_state` blocked, the labels dependencies and javascript, and a
review requested from PureTideWater. At about 10:49Z their CI was still running: #99 had 21 success, 1 skipped and 4
queued or in progress; #100 had 19 success and 5 in progress; #101 had 15 success and 8 in progress. None had a
failure yet. Unlike #87 to #98, the titles have no `build(deps):` prefix. Neither version of dependabot.yml sets
`commit-message`, so the difference is cosmetic.

**#97 and #98.** This run did not touch either one.

- #97 ("build(deps): bump the minor-and-patch group across 1 directory with 17 updates", head
  dependabot/npm_and_yarn/minor-and-patch-622d1e9a6a) was closed by dependabot[bot] at 07:42:39Z, before #91 merged.
  The bot commented "Looks like these dependencies are updatable in another way, so this is no longer needed." #98
  replaced it at 07:45:01Z.
- #98 ("build(deps): bump the minor-and-patch group across 1 directory with 18 updates", head
  dependabot/npm_and_yarn/minor-and-patch-96a35afc84) was closed by the PureTideWater account at 10:22:27Z. That was
  3 s after #91 merged (10:22:24Z) and before these runs were created (10:22:32-33Z). dependabot[bot] then posted its
  group-rule notice (10:22:31Z) and deleted the head branch (10:22:38Z). The npm job definition shows
  `existing-group-pull-requests: []` (line 72) because #98 was already closed.
- The job's `existing-pull-requests` still lists the closed individual pull requests #16 (typescript 7.0.2) and #17
  (@types/node 26.6.5), as the runbook records. The actions job lists #8, #9, #11, #12, #14 and #19 to #22.

**Do the @aws-sdk packages now sit in the aws-sdk group?** Yes. All ten are assigned to `aws-sdk` (specificity lines
165-169, 183, 184, 192, 193 and 195), updated in that group (lines 2301-2969, "Creating dependency change for ... in
group aws-sdk"), and shipped together as #99. None is in #101.

**Overlap with #94.** #94 is open (co-001/deps-aws-cdk-minor-patch @ e3fc02e44c). It bumps the same ten @aws-sdk
packages to ^3.1160.0, aws-cdk-lib to ^2.275.0, aws-cdk to ^2.1146.1 and stripe to ^23.1.0. That means #99 and #100
duplicate #94, and so does #101's stripe line. #101's other five updates are not in #94. Under the runbook (step on
replacing bot pull requests), #99 and #100 are closed with a comment naming #94 and its merge commit once #94 merges.
#101 stays open, or is closed and rebuilt, for its remaining five updates.

## (4) Release-age block or error

None. No log contains "release-age block", `ERR_PNPM`, an ERROR or WARN updater line, a
`record_update_job_error` or `record_update_job_unknown_error` call, or a 4xx or 5xx from the npm registry or the
GitHub API. The npm log's only non-proxy, non-INFO lines are the setup lines and the Results table. Each npm check
logs "pnpm-workspace.yaml minimumReleaseAge (4320 minutes, 3 days) is already satisfied by all dependabot.yml
update_cooldown values; the dependabot.yml cooldown is used." (first at line 247).

The 3-day cooldown worked as configured. It held exactly one newer version on each of these:

- each @aws-sdk/* package: 3.1161.0, so 3.1160.0 was taken (lines 459-466; the 3.1161.0 tarball is checked at line
  460)
- aws-cdk: 2.1147.0, so 2.1146.1 was taken (lines 3473-3480)
- globals (line 3735), pdfjs-dist (line 4089) and eslint (line 4414): each stays at its current version

The 401s in the docker and compose logs (docker 126, 134, 140 and 146, plus cached repeats at 183-204; compose 124,
132, 138 and 144) are Docker Hub's normal token challenge. Each is followed by a 200 from auth.docker.io and a 200
retry (for example docker lines 128-131).

Observation, not an error and not caused by #91: in every npm group with updates, `GroupDependencySelector` logs "Version
class Dependabot::NpmAndYarn::Version could not determine update type for <from> -> <to>". This appears at lines
3022-3031, 3549-3550 and 4627-4632, followed by "No dependencies were filtered out". Every update today was a minor or
a patch, so it changed nothing. Because the update type cannot be determined, though, the groups'
`update-types: [minor, patch]` filter is not what would keep a future non-ignored major out of `aws-sdk`, `aws-cdk` or
`minor-and-patch`. This run does not show how a major would be routed.

## (5) Verdict

The routing works as #91 intended on the real Dependabot (updater 8786cc38, whose group-assignment code equals the
85379652 that CI-12 models):

- Each of the seven version-update groups received exactly the dependencies its patterns name. Wildcard groups keep
  their packages: `@aws-sdk/*` gives 10 to aws-sdk and `@next/*` gives @next/eslint-plugin-next to next. No exact name
  falls to `minor-and-patch`.
- No routing-failure, skip-group, release-age-block or error line appears in any of the four runs.
- The 18 updates that #98 carried as one `minor-and-patch` pull request now arrive as #99 (aws-sdk, 10), #100 (aws-cdk,
  2) and #101 (minor-and-patch, 6).
- The actions, docker and compose runs opened nothing because everything is current or held by the 7-day cooldown.

Follow-ups, none of which block the verdict:

- reconcile #99, #100 and #101's stripe line with #94 when #94 merges
- watch the first non-ignored major in an `update-types` group, given the "could not determine update type" behaviour
  above

## Challenge (re-read 2026-11-02 at about 10:55 UTC, read only)

**Result: HOLDS.** This re-read went back to the sources: the four job logs fetched again with `gh api .../actions/jobs/<job>/logs` (5517, 3696, 236 and 175 lines), the npm log's tail from the GitHub MCP `get_job_logs` (`original_length` 5517, the same Results table), the runs, PRs #94 and #97 to #101 with their events, comments, files and check runs, and dependabot-core at 85379652, read with `git show` only. Nothing in them breaks the verdict.

What was checked again in npm job 125220201984:
- Line 72 holds the seven groups and the 13 exclude-patterns, which match dependabot.yml lines 53-91 at 21fa10df, and `existing-group-pull-requests` is `[]`.
- Lines 158-222 hold 65 `Checking specificity` lines with no repeated dependency, split 3/1/1/2/10/3/45. In 85379652 this line is written once for each group that `contains?` the dependency (`dependency_group_engine.rb` lines 123-127 and 208-210). One line per dependency therefore means each dependency matched exactly one group.
- No log has a `belongs to more specific group`, `Skipping update group`, `no dependencies match`, WARN or ERROR line.
- Each group pass (lines 229, 299, 339, 381, 436, 3371 and 3647) checked only its own members.
- All 1513 proxied responses in the npm log are 200 or 204.
- Lines 5507-5509 hold three `created` rows, and there was no update, rebase or close call.
- #98's 18 rows equal #99 (10), #100 (2) and #101 (6), with the same from and to versions.
- No `event=dynamic` run was created after 10:22:33Z.

Corrections, none of which change the verdict:
1. **The observation and follow-up 2 are wrong.** "could not determine update type" comes from the base `Dependabot::Version.update_type`, which returns nil (`common/lib/dependabot/version.rb` lines 32-34). npm does not override it. `UpdateTypeHelper#update_type_for_dependency` then falls back to `classify_semver_update` (`update_type_helper.rb` lines 71-87). The log has no "Could not classify semver update" line, so every type was in fact determined. The `GroupDependencySelector` uses that type only for its more-specific-group check. A group's `update-types` are enforced earlier, by `SemverGroupingRules#allow_grouping?` (`semver_grouping_rules.rb`, called at `group_update_creation.rb` line 479), before a dependency is marked handled. This run shows that rule rejecting dependencies: the 42 members of update-types groups whose latest version equalled the current one got no "Adding dependencies as handled" line (for example next, lines 400-433) and were checked again in the ungrouped pass from line 4851. A non-ignored major takes the same path to an individual pull request, within `open-pull-requests-limit` 8. Follow-up 2 can be dropped.
2. Citation: lines 5500-5501 hold only `mark_as_processed`. The other calls are at line 124 (record_ecosystem_versions), lines 129-130 (the blocked_versions GET), line 223 (update_dependency_list), line 225 (increment_metric), and 45 pairs of record_ecosystem_meta and record_cooldown_meta between lines 3367 and 5498.
3. #94 is a **draft** (open, `draft: true`, head e3fc02e44c, base 21fa10df). Its bumps match the report: ten @aws-sdk packages to ^3.1160.0, aws-cdk-lib ^2.275.0, aws-cdk ^2.1146.1 and stripe ^23.1.0.
4. State has moved on since 10:49Z. At 10:55Z, #99 is `mergeable_state` clean with 26 success and 1 skipped. #100 and #101 are each blocked with 24 success, 1 skipped and 1 in progress. None has a failure.
