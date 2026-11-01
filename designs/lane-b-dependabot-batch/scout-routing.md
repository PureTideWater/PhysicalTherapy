# Scout: the triage record and the group routing fix (dependabot-batch)

Read-only scout, 2026-11-01 17:05Z to 17:22Z. Base `claude/build-platform` 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56. Every line reference is at 83d71fd6 unless it names another commit. Scratch work is under `design/tmp/scout-routing/`:
- `model.mjs` is the pure-JS router;
- `dependabot.yml.proposed`, `dependabot-config.test.ts.proposed` and `routing-fix.diff` (265 lines) are the trial edits;
- the trial worktree has been removed.

Downloads went into their own directories and nothing in them was run: `tmp/routing-dbcore/core` (dependabot-core) and `tmp/routing-ghdocs/docs` (github/docs).

**Corrections to the item file:**
- **#82's head has moved.** It is now 9db52a2b (`gh api pulls/82`, 17:16Z), a merge of base 83d71fd6 on top of 96758e44.
- **The line-48 comment is wrong for exact names too.** An exact name is kept in **both** its own group and minor-and-patch, and only the file's order keeps it out of minor-and-patch (§2).
- **Rule 6 does not order merges.** The PR merged second resolves the conflict (LANES.md:31-35). The item's "merge after them" over-reads it.

## 1. What each source requires of this item

| Source | What it requires |
|---|---|
| `docs/runbooks/dependency-upgrades.md` | No bot PR merges as it stands. Each goes through the four required checks (10-12). Release age is 3 days, plus `toolchain:check` (13-15). One version in one place (16-19). The group list is at 28. The weekly triage, steps 1-6, is at 45-99, and step 2 is at 62-69: read the checks, then the notes of every major or minor; take it as the build's own PR; "a `minor-and-patch` group can be taken whole once its notes are read"; a money-closure move runs mutation in full. The SDK goes through the evaluation gate in a deliberate PR (273-274). For CDK, read `cdk:diff` first, and `@aws-sdk/*` runs the pricing and packets mutation (275-277). The runbook never says how groups are matched. Its only routing claim is 275, "come in their groups", which was false on 10-29 for `@aws-sdk/*`. |
| `docs/runbooks/model-evaluation.md` 1-80 | Real-model runs are for people only. CI and the build run only the local provider (7-11). A real provider is served only with floors, an entry, a price and a permitted run (13-26). Floors come first (28-38). For #87, record that the Anthropic path's first real-model record will be made on SDK 1.x. The build cannot run one. |
| `.github/dependabot.yml` | The groups are at 49-72, and line 48 is the false comment. `aws-sdk` is at 62-64, `next` (with `@next/*`) at 59-61, `minor-and-patch` at 68-69 (no patterns), and `security` at 70-72. |
| `tools/test/dependabot-config.test.ts` (CI-12) | The header (9-15) says "the groups in the order Dependabot matches them". Lines 61-71 pin each group's exact object, and line 70 pins `minor-and-patch` to `{update-types}` only. So any routing fix must change line 70, and the test must say why. Lines 116-117 already show the pattern for reading `repositoryRoot`, not `CI_TREE`, for a file outside the rewritten copy. |
| ADR 0066 Part 2 | Lines 271-717; Part 3 starts at 718. "Dependabot's configuration" is 590-611: "Groups, in this order" (604-607), and CI-12 holds it all (611). Lines 519-521 say stripe, aws-cdk and `@aws-sdk/*` are brought "by their Dependabot groups". The "Revisit when" is at 710-716. The ADR does not itself state "first match". That claim comes from the 2026-10-24 scout (`designs/lane-b-ci/scout-dependency-policy.md:319-320`, citing GitHub's options reference). Needs: a dated amendment under 590-611 (§5). |
| ADR 0048 25-47, 153 | The gateway is the only importer of both SDKs (25-28). There are mocked-client tests for each request, stop reason and error mapping (45-47). Provider-side retries are off (153). For the routing fix this means: `@aws-sdk/client-bedrock-runtime` (the default model path) belongs in the `aws-sdk` group, with its notes read. That is what the fix restores. |
| ADR 0070 | Nothing specific to an SDK. The two-step re-baseline is only for a set change (pdf.js or Textract-reader bump) or a prompt or model change (259-264, 374-375). An SDK bump is neither, so no re-baseline. The local gate (`test:golden`) is what the build runs. |
| `approval-summaries/lane-b-ci-deps-dependabot-2026-10-28.md` | The image runs 40634046721 and 40634047077 succeeded and opened no PR. It cites dependabot-core eb80162 for handled and refresh behaviour (lines 163, 217-241). These are relevant here: a scheduled group run never closes a PR, and only a refresh closes one. |
| `designs/lane-b-ci/scout-dependency-policy.md` | The source of the false rule: "Groups take the first match … (options reference, `groups`)" (319-320). It proposed a test of "the group order" (380). dependabot-core 77f70df2 was cloned then, but its group code was not read (558-561). |

## 2. How Dependabot really picks a group

Source: dependabot-core at **85379652e4ef784fdd38bf4598b0b347832f805b** (committed 2026-10-30T22:50Z; blobless clone at 17:1xZ). The logic was added in 6a5b2b400 (#13044, 2025-09-11), 3cc43e4d4 (#13098, scoring), d615738a6 (#13180, "skip the calculator if there is no pattern set") and fafb34ec7 (#13714). That is about 14 months of behaviour, not a regression.

### 1. Assignment (version job)

- The groups are first filtered to the job's kind, so a version job never sees `security` (`updater/lib/dependabot/dependency_group_engine.rb:42-47`).
- For each dependency and each group in file order, the group keeps it if `group.contains?(dep)` and not `should_skip_due_to_specificity?` (`:123-132`).
- `contains?` (`common/lib/dependabot/dependency_group.rb:64-70`):
  - an exclude-pattern match → false (`:67`, `:117-122`);
  - otherwise the pattern must match, and **no `patterns` key means it matches everything** (`:109-114`);
  - then the dependency type (`:124-133`).
- The matcher is a case-insensitive glob where `*` is `.*` (`common/lib/wildcard_matcher.rb:10-18`).

### 2. Specificity

`should_skip_due_to_specificity?` (`dependency_group_engine.rb:189-225`):
- Other groups whose update-types do not overlap the current group's are not compared (`:193-206`).
- It calls `find_most_specific_group_name`. If that returns a name, it logs "Skipping X for group 'G' - belongs to more specific group 'H'" (`:216-220`). That is the 10-29 log line.

`updater/lib/dependabot/updater/pattern_specificity_calculator.rb`:
- `find_most_specific_group_name` (`:99-116`):
  - It returns nil, so the dependency is kept, if the current group has **no patterns** or the dependency is excluded from it (`can_check_specificity?`, `:121-126`), or if the current score is ≥ 1000 (`:111`).
  - Otherwise it returns the other group, among those containing the dependency, with a strictly higher score (`:137-153`).
- The scores (`:19-37`, `:182-207`):
  - an explicit member or exact name: 1000;
  - a pattern without a wildcard: 500;
  - **a group with no patterns: 500** (`:32`, `:187`);
  - a wildcard pattern: `100 − 10·wildcards + max(len−5, 0)`;
  - `*`: 1;
  - excluded: 0 (`:184`).

### 3. Order

- Groups run in file order (`operations/group_update_all_versions.rb:106-110`).
- A dependency an earlier group already handled is skipped "as it has already been handled by a previous group" (`group_update_creation.rb:360-372`). The skip does not apply when the job is refreshing that group (`:364-367`).
- An empty group logs "Skipping update group for 'G' as it does not match any allowed dependencies." (`group_update_creation.rb:658-661`). That is log line 2367.

### Why the wildcards lose and the exact names keep their group

- `@aws-sdk/*` scores 100−10+(10−5) = **95**, and `@next/*` scores 90+2 = **92**. `minor-and-patch` has no patterns, so it scores **500** for every dependency. 500 > 95, so `aws-sdk` and `next` give up their wildcard members.
- `minor-and-patch` itself can never give anything up: it has no patterns, so `can_check_specificity?` is false.
- An exact name (`next`, `pg-boss`, `@anthropic-ai/sdk`, `aws-cdk`, `aws-cdk-lib`, `constructs`, the browser-tests names) scores 1000, so it is kept by its own group.
- **It is also kept by `minor-and-patch`.** Only the file's order (the handled list) stops a second PR.
- When `minor-and-patch` is *refreshed* (a rebase or recreate of #89), the handled-list skip does not apply (`:364-367`). So in that case, aws-cdk-lib, next or pg-boss minors could plausibly be pulled into it. This was not verified against a live run.

`design/tmp/scout-routing/model.mjs` models this rule. Run on the base file, it prints `@aws-sdk/client-bedrock-runtime → [minor-and-patch]`, `@next/eslint-plugin-next → [minor-and-patch]` and `aws-cdk-lib → [aws-cdk, minor-and-patch]`. That matches the 10-29 log as the item file quotes it.

**GitHub's docs disagree with the code.** In github/docs at 33b1f4a6 (2026-10-31):
- `content/code-security/reference/supply-chain-security/dependabot-options-reference.md:326` says "If a dependency matches more than one rule, it's included in the first group that it matches".
- `data/reusables/dependabot/dependabot-version-updates-groups-match-first.md:1` says the same.

The code has not worked that way since 2025-09. The fix must route the same way under both rules.

**The log.** `get_job_logs` for job 123265353642 works, but the log is 5115 lines (`original_length`). The download URL host (`productionresultssa3.blob.core.windows.net`) answers 403 through the proxy (curl, 17:14Z), and fetching 5000 lines inline was not reasonable. So I read only the tail. It shows the results table: three PRs created, the third with the `@aws-sdk/*` packages, and "pnpm-workspace.yaml minimumReleaseAge … already satisfied". Lines 160-226 and 2367 were **not re-read**. I rely on the item file for them, and the model reproduces them.

## 3. The fix

**Recommended: `exclude-patterns` on `minor-and-patch` listing all 13 patterns of the six specific version groups, exact names included.**

The key is documented: options-reference `:334`, and "If a dependency matches both a pattern and an exclude-pattern, then it is excluded" (`:374-376`). It is honoured in `contains?` (`dependency_group.rb:67`) and scores 0 (`calculator:184`).

Why it is best:
- An excluded dependency is never contained by `minor-and-patch`, so each dependency is in exactly one group.
- Routing is then the same under the code's specificity rule and under the docs' first-match rule.
- It does not depend on the scoring constants.
- It also closes the refresh pull-in.

Rejected: `patterns: ["*"]` on `minor-and-patch`. It works under today's code (score 1 < 92/95), but it rests on undocumented constants, and under the documented first-match rule it is the same as today's file.

The exact YAML replaces lines 48 and 68-69 (`dependabot.yml.proposed`):

```yaml
    # Each dependency belongs to one group: minor-and-patch excludes every pattern the groups above it name. Without the
    # exclusions, Dependabot ranks a group with no patterns above a wildcard pattern, so "@aws-sdk/*" and "@next/*" lost
    # their packages to minor-and-patch (run 40818560725), and only the file's order kept an exact name in its group.
    # dependabot-config.test.ts holds the list equal to those patterns and routes every direct dependency.
    groups:
      ...
      # Everything no group above takes, minor and patch.
      minor-and-patch:
        exclude-patterns:
          - "@playwright/test"
          - playwright
          - playwright-core
          - "@axe-core/playwright"
          - axe-core
          - "@anthropic-ai/sdk"
          - pg-boss
          - next
          - "@next/*"
          - "@aws-sdk/*"
          - aws-cdk
          - aws-cdk-lib
          - constructs
        update-types: [minor, patch]
```

**Every intended membership holds.** These are the members each group's comment and runbook 251-277 intend. Results are from the model on the proposed file over every direct dependency of every manifest (root, apps/*, packages/*, tools, infra):

| Group | Intended members | Result |
|---|---|---|
| browser-tests | `@playwright/test`, playwright, playwright-core, `@axe-core/playwright`, axe-core | only browser-tests |
| anthropic-sdk | `@anthropic-ai/sdk` | only anthropic-sdk |
| pg-boss | pg-boss | only pg-boss |
| next | next, `@next/eslint-plugin-next` | only next (**fixed**) |
| aws-sdk | the nine `@aws-sdk/*`, `client-bedrock-runtime` among them | only aws-sdk (**fixed**) |
| aws-cdk | aws-cdk, aws-cdk-lib, constructs | only aws-cdk |
| minor-and-patch | everything else (stripe, `@stripe/*`, zod, `@types/node` minors, typescript minors, …) | only minor-and-patch |

What is unchanged:
- **`security`:** a security job filters groups to `applies-to: security-updates` (`dependency_group_engine.rb:42-47`), so `minor-and-patch`'s exclusions never reach it.
- **Majors:** the specific groups keep their own update-types, so a major of an excluded name (aws-cdk-lib 3, an `@aws-sdk` major) goes where it went before (no group with `major` → individual PR). The ignores are untouched.
- **`open-pull-requests-limit: 8`** is still right: 7 version groups and room for 1.

**The test** (`dependabot-config.test.ts.proposed`; failing-first was proven):
- **(a)** Line 70 becomes `{ 'exclude-patterns': SPECIFIC.flatMap(g => groups[g].patterns), 'update-types': [...] }`.
- **(b)** A new test: the specific version groups are exactly `SPECIFIC` (every group but `minor-and-patch` and `applies-to` groups); `minor-and-patch` has no `patterns`; its `exclude-patterns` equals the in-order concatenation of their patterns; no specific group has an `exclude-patterns`. Adding a group without excluding it then fails.
- **(c)** A pure-TS `dependabotMembers(groups, name)` ports `contains?`, the scores and the eligible filter, citing the files above at 85379652.
- **(d)** A new test, for every direct dependency of the repository's manifests (read from `repositoryRoot`, as line 116 does, not `CI_TREE`) plus a table of named cases (`@aws-sdk/client-bedrock-runtime → aws-sdk`, `@next/eslint-plugin-next → next`, `stripe → minor-and-patch`, …). The documented first-match owner must equal the intended group, and `dependabotMembers` must be exactly `[owner]`. That means one member, so neither the scores nor the order decides.
- **(e)** A test that pins the model to the 10-29 evidence: on the old groups, `@aws-sdk/client-s3` and `@next/eslint-plugin-next` give `[minor-and-patch]`, and `aws-cdk-lib` gives `[aws-cdk, minor-and-patch]`.
- **(f)** The header (9-15) and the title "in the order Dependabot matches them" are reworded.

Results (each run under `flock`):
- On the trial tree: 10 passed.
- With `CI_TREE=/home/user/PhysicalTherapy` (the base config): 3 failed. The (a), (b) and (d) assertions fail, and (d) first on `@anthropic-ai/sdk: [anthropic-sdk, minor-and-patch]`.
- `workflows.test.ts -t rewrite` (the simulated Dependabot rewrite, which runs this file on a copy) passed.
- eslint was clean on the file.
- `pnpm typecheck` was **not run**.

## 4. The CI-12 amendment

Four places change. The new text:

> "Groups in order, each dependency in one: minor-and-patch excludes every pattern a specific group names, and a model of Dependabot's group assignment routes every direct dependency to its group; majors ignored for the Node image, its types, TypeScript, Next and pg-boss, and for the compose file's postgres; cooldowns; staggered days; and an entry per ecosystem in use"

1. `docs/product/test-matrix.md:278`: the Assertion cell takes the text above.
2. `packages/synth/src/cases/matrix.ts:430`: the same string, word for word. `packages/synth/src/fixtures.test.ts:33-43` holds `TEST_MATRIX` equal to the rows.
3. `packages/synth/src/cases/registry.ts:617`: **no change**. It is `none(0, …, ['tools/test/dependabot-config.test.ts', 'tools/test/workflows.test.ts'])`, and the test files are the same.
4. `fixtures/synthetic/CI-12/expected.json`: its `assertion` is regenerated by `pnpm synth --all`. Never edit it by hand.

There is no new CI ID, synth module or fixture release.

What else touches these files (`gh api pulls/<n>` and `git fetch` read-only, 17:16Z; `git diff` from each merge-base):

| PR (head) | test-matrix / matrix.ts / registry.ts | Runbook / ADR 0066 / reconciliation-001 | Trial merge with the fix (commit 991cf7c1) |
|---|---|---|---|
| #82 (9db52a2b) | CI header 261-262; adds CI-21..23 after 286 | runbook 90-91 and 229-286; ADR 0066 4-52, 121, 454, Part 5 appended at 1272+; reconc. | clean |
| #42 (be63bdc2) | LED and SCR rows | reconc. | clean |
| #84 (e3299ea2) | PRC rows | none | clean |
| #75 (871faff9) | rows at 231-235 | reconc. | conflicts, but in exactly the same files as #75 against the base (pre-existing; none from the fix) |
| #83 (f4a97668) | 340-349 | none | same: pre-existing |
| #85 (29dded52) | after 130 | none | same: pre-existing |
| #86 (83167b8f) | none | ADR 0066 28, 37, 965+; reconc. | clean |

No PR touches `dependabot.yml` or `dependabot-config.test.ts`, and none touches the CI-12 row. Under rule 6 (LANES.md:34), whichever merges second resolves and keeps both. The fix needs no waiting order for the matrix files. #82 and #86 edit the runbook and ADR 0066, so this PR resolves after them if they merge first. The edits are on separate lines (§5), so expect a clean merge.

## 5. The triage, steps 1-6, for these PRs (read 17:19-17:20Z)

1. **Dependabot's runs** (`gh api …/actions/runs?event=dynamic&created=>=2026-10-28`, which works):
   - 40818560725: npm, success, 2026-10-29T04:35Z;
   - 40634047077: compose, success, 10-28T04:44Z;
   - 40634046721: docker, success, 10-28T04:44Z.

   There is no failure, and no actions run fell in the window (the next is 2026-11-03 04:37). "release-age block detected" was not re-grepped in the full log (§2); the item file says it is absent, and the tail shows the release age satisfied. **New finding for the record:** the npm run's own routing lines ("belongs to more specific group", "does not match any allowed dependencies") show a misrouted group. Step 1 should read for them.
2. **Each PR** (`gh api commits/<sha>/check-runs`; the PRs via `pulls/<n>`): open, not drafts, `clean`, base 83d71fd6, 0 comments. The four required checks are success on all three.

   | PR | Check runs | Result | Stryker |
   |---|---|---|---|
   | #87 | 27 | 26 success, `notify` skipped | 7 shards, money-ledger included |
   | #88 | 21 | 19 success, `notify` and the stryker matrix skipped | none |
   | #89 | 26 | 25 success, `notify` skipped | 6 (packets ×3, pricing ×3) |

   That is all green, so the step 2 path is: read the notes, then take each as the build's own PR. #89 is the "take whole once its notes are read" case, but it holds the `aws-sdk` group's packages. So read it under 277 (pricing and packets mutation, as it ran) and the aws-sdk scout's notes. It is not a plain minor-and-patch.
3. **Alerts:** `dependabot/alerts` returns 403 "Resource not accessible by integration" (17:19:55Z). This waits on a person.
4. **Exception lists:** `minimumReleaseAgeExclude: []` (`pnpm-workspace.yaml:45`), and `release-age-exceptions.json` and `audit-exceptions.json` have `entries: []`. There is nothing to remove.
5. **check-toolchain's warnings:** pnpm **10.34.9**, published 2026-10-25T17:54Z (`npm view pnpm time`, 17:20Z), is more than 3 days old. `packageManager` is 10.34.8. So the runbook's packageManager PR (193-204) is due. That is outside this item; it goes in the notes as a proposal. Action tags were not checked (no push-run warning was read).
6. **Stored ignores:** listing them needs an `@dependabot show` comment, which is a write, so it is not done. The three PRs have 0 comments, so none was stored through them. Never `@dependabot ignore`.

**The runbook needs an edit**, in this PR:
- **Line 28:** after the group list, add "each dependency in exactly one: `minor-and-patch` excludes every pattern the others name".
- **Line 275:** add that `dependabot.yml` routes `@aws-sdk/*` to its group only through `minor-and-patch`'s exclusions (until 2026-11-01 it went to `minor-and-patch`, run 40818560725).
- **Step 1:** also read the npm run for "belongs to more specific group" and "does not match any allowed dependencies"; a dependency in a group the file does not mean is fixed in `dependabot.yml` with CI-12.
- **Step 2:** check that each group PR holds only its group's members. Taking a bot PR as the build's own means a `co-001/` PR that names it, and the bot PR is closed with a comment naming the build PR's merge commit once that merges. Never use `@dependabot ignore`. Closing a group PR ignores nothing.
- **The record:** say where a triage is recorded. Today it is the item's design and status file under build-ops. The runbook names none, so propose one line: "record each weekly triage in the build's status file".

**ADR 0066 Part 2 needs a dated amendment** under "Dependabot's configuration" (590-611), not a new ADR. It should state:
- the specificity rule (dependabot-core 85379652);
- that GitHub's docs say first-match;
- `minor-and-patch`'s exclusions;
- CI-12's model;
- one row in "Alternatives considered" (652-668): `patterns: ["*"]`, rejected as undocumented scoring;
- a "Revisit when" item (710-716): GitHub's docs or dependabot-core change the group rule.

#82 edits both the runbook and ADR 0066 (and #86 edits ADR 0066). The hunks are disjoint from 28, 49-69 and 273-277 of the runbook and 590-611 of the ADR. Whichever merges second resolves and keeps both.

## 6. One PR or two for #88 and #89

`git merge-tree --write-tree` (git 2.43):

| Merge | Result |
|---|---|
| #88 × #89 | clean |
| #88 × #42 | clean |
| #89 × #42 | conflicts in `apps/web/package.json`, `apps/worker/package.json` and `pnpm-lock.yaml` (#42 adds `client-sesv2`/`client-sts` to web and `client-sqs` to worker at `^3.1152.0`) |
| #87 × #89 | conflicts in `packages/model-gateway/package.json` (adjacent lines) |
| #87 × #88 | clean |
| #87 × #42 | clean |
| routing fix × #42, #82, #84, #86, #88, #89 | clean |

**Recommendation:**
- **#88 and #89 go in one PR** (`co-001/deps-aws-cdk-minor-patch`), merged after #42 as the item says. They share `infra/package.json` and the lockfile, merge cleanly, and need one lockfile regeneration and one CI run.
- **The routing fix goes in its own PR,** not in that one. The fix has a deadline the bundle cannot promise: Dependabot reads the default branch at Thursday 2026-11-05 04:31Z, and the bundle waits on #42, the founder's approval line. The fix also touches no manifest, lockfile or #42 file, and merges cleanly with every open PR. The item allows the split ("If the routing fix is kept out … its own PR"). It needs a new branch, for example `co-001/dependabot-group-routing`.
- If the orchestrator prefers no new branch, keep the fix as separate commits in the bundle that touch only `.github/dependabot.yml`, the test, the four CI-12 places, the runbook and ADR 0066. On 2026-11-04 cut them to their own PR if #42 has not merged.
- **Once the fix merges before #89's replacement:** a refresh of #89 would drop `@aws-sdk/*` from it, and the next run opens an `aws-sdk` PR. That is harmless. Close both bot PRs with the replacement.

## What the design must say

1. Routing is decided by dependabot-core's specificity rule (85379652: `pattern_specificity_calculator.rb:19-37, 99-153, 182-207`; `dependency_group_engine.rb:42-47, 123-132, 189-225`; `dependency_group.rb:64-70, 109-122`). A group with no patterns scores 500, more than `@aws-sdk/*` (95) or `@next/*` (92), and never gives a dependency up. GitHub's docs (33b1f4a6, options-reference:326) still say "first match". Line 48's comment is false for wildcards, and only order-true for exact names.
2. The fix is `exclude-patterns` on `minor-and-patch` with all 13 patterns of the six specific groups (the YAML in §3), plus the four-line comment replacing line 48. Rejected: `patterns: ["*"]`.
3. Every intended membership holds, with exactly one group each. `security`, the majors and the ignores are unchanged.
4. In CI-12, the test's line 70 changes. Add (b) the exclusions-equal-patterns test, (d) the routing model over every direct dependency and the named table, and (e) the 10-29 evidence test. Failing-first was shown (3 fail on base, 10 pass on fix). Run `pnpm typecheck` in the build.
5. CI-12's row text changes in `test-matrix.md:278`, `matrix.ts:430` and `fixtures/synthetic/CI-12/expected.json` (via `pnpm synth --all`). `registry.ts:617` is unchanged. No new IDs.
6. Runbook edits: lines 28 and 275, step 1's log read, step 2's membership check and the close-with-comment process, and the record line. Add a dated ADR 0066 Part 2 amendment (590-611, Alternatives, Revisit). Under rule 6 these resolve with #82 and #86, whichever merges second.
7. The triage record:
   - **Step 1:** 3 runs, all success.
   - **Step 2:** all green, the four required checks pass; #89 is the aws-sdk group's content.
   - **Step 3:** 403, a person reads the alerts.
   - **Step 4:** nothing to remove.
   - **Step 5:** pnpm 10.34.9 is due. This is a proposal outside this item.
   - **Step 6:** cannot list the stored ignores, and there are none on these PRs.
8. #88 and #89 go in one PR after #42. The routing fix goes in its own PR so it can merge before 2026-11-05 04:31Z, or in separable commits cut out by 2026-11-04.
9. Corrections:
   - #82's head is 9db52a2b.
   - Rule 6 does not order merges.
   - The log lines 160-226 and 2367 were not re-read (blob host 403; 5115 lines).
   - The refresh pull-in of exact names into `minor-and-patch` is plausible from the code, not observed.
