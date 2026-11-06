# PR #106 fresh-clone verification 2 (head 92ae9a25)

Verifier: Lane B S4 workflow step, 2026-11-04 07:22Z to 07:45Z. Nothing was pushed, commented, reviewed, marked ready or merged.

## Inputs
- The resolution check's verdict: clean (B none, S none). The verification went ahead.

## 1. Remote refs
- `co-001/ci-trivy-install-2026-11-04` = `92ae9a25592ec280a82398e993e70030691744d6`, as reported, at 07:21Z and again at 07:41Z. Its parents are `78cd55d2` and `df4daff7`.
- Base tip at 07:21Z: `df4daff7ced918e622589024164b7f03f980148a`, which is the merged base.
- Base tip at 07:41Z: `72096e9468781a83602443a788d7056c706b568b`, after #75 (the contract PHI check) merged. The PR's checks ran against `df4daff7`; see section 5.

## 2. CI on 92ae9a25 (final)
All runs had finished by 07:37:31Z.

| Check | Run/job | Result |
| --- | --- | --- |
| domain model | 41791343115 | success |
| build | 41791343115 | success |
| static | 41791343115 | success |
| lint | 41791343115 | success |
| unit | 41791343115 | success |
| images | 41791343115 | success |
| db (1/4) through db (4/4) | 41791343115 | success |
| e2e (1/2), e2e (2/2) | 41791343115 | success |
| **all green** | 41791343115 / 126449332915 | **success** |
| changes (mutation) | 41791343167 | success |
| stryker (shard) | 41791343167 | skipped (no money package touched) |
| **mutation** | 41791343167 / 126445476552 | **success** |
| changes (screening-capacity) | 41791343218 / 126445200709 | success |
| capacity | 41791343218 / 126445615829 | success |
| **screening-capacity gate** | 41791343218 / 126452252666 | **success** |
| notify | 41791343218 | skipped |
| **approval-of-record** | 41791343102 and 41791489654 | **success** (both runs) |

**The changes job used the token-less full fetch.**
- The checkout fetched every ref with no partial clone and checked out `d083de78`, the merge of `92ae9a25` into `df4daff7`.
- The checkout step then removed the credentials ("Removing credentials config").
- With no token, `git diff --name-only "$BASE...$HEAD"`, `git cat-file` and `git show` read only local objects.
- It reported `watched: .github/workflows/screening-capacity.yml` and `watched: packages/synth/src/cases/matrix.ts`, so `measure=true`.

**Capacity, quoted from the job log:**
- Runner line: `runner 4 CPUs, 15983 MiB, load 2.60 1.51 0.63; harness on CPUs 0-1; runtime docker; time mode advisory`
- S4: `S4#1 50.9, 53.5, 52.9 and 37.6 s; S4#2 54.9, 54.0, 54.2 and 42.1 s; S4#3 55.8, 55.1, 55.3 and 42.5 s. ... the middle run is S4#2 (54.9 s)`
- Verdict: `verdict: pass (time advisory)`
- The gate printed: "the capacity measurement passed every check but time, which is advisory here; a release's capacity run holds it binding".

**Advisory warnings (on the capacity job and repeated by the gate):**
- `time: S4#2 S4-1 54.9 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)`
- the same for S4-2 at 54.0 s and S4-3 at 54.2 s;
- Sizing question (O9): `the worst time, S4#2 S4-1's 54.9 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge`

## 3. Fresh clone at 92ae9a25
- `pnpm install --frozen-lockfile` under the lock: ok.
- `vitest run tools/test`: 21 files, 300 tests, all passed.
- actionlint 1.7.7: exit 1 with 22 messages, all of them the ubuntu-26.04 label message (which the workflow test ignores), and 0 others.
- `pnpm actions:check`: passed ("every action is pinned to its release's commit, and every pin new against the base is old enough").
- `git diff --stat df4daff7..HEAD` (df4daff7 is the merge base): 8 files, +247 / -8. The per-file numstat matches the description's table exactly.
  - screening-capacity.yml: +3 / -1
  - ADR 0066: +40
  - test-matrix.md: +2 / -2
  - ci.md: +7
  - CI-11 and CI-21 expected.json: +1 / -1 each
  - matrix.ts: +2 / -2
  - workflows.test.ts: +191 / -1

## 4. Description
The body GitHub shows equals the prep's body.md. GitHub shows head `92ae9a25`, base `df4daff7` and draft true. These claims checked out:
- the diff table;
- the two watched paths, both listed in `tools/screening-capacity/watched-paths.txt`;
- the checkout: `fetch-depth: 0`, `persist-credentials: false`, no `filter`;
- O15 in docs/runbooks/screening-capacity.md;
- the ADR amendment heading and where it sits;
- the ci.md paragraph;
- the re-check numbers, which match the prep's logs and, where run again here, this clone.

Stale or incomplete sentences, with exact replacements:
1. Screening-capacity note, second bullet.
   - Now: "The repository is public again, so the standard runner has 4 CPUs, which meets the harness minimum. The gate can pass."
   - Replace with: "The repository is public again, so the standard runner has 4 CPUs, which meets the harness minimum. On `92ae9a25` the gate passed (run 41791343218): `runner 4 CPUs, 15983 MiB`, `verdict: pass (time advisory)`. S4's middle run was S4#2 at 54.9 / 54.0 / 54.2 / 42.1 s (S4#1 50.9 / 53.5 / 52.9 / 37.6 s, S4#3 55.8 / 55.1 / 55.3 / 42.5 s). There were three advisory time warnings above the 48-s line, and the sizing question (O9): the worst time, 54.9 s, is above 44 s."
2. The founder's approval, last line.
   - Now: "**What waits on a person:** nothing for this PR. The decision on the runner and the organization (issue #102) applies only if the repository goes private again."
   - Replace with: "**What waits on a person:** the capacity run's sizing question (O9). S4's middle-run worst time, 54.9 s, is above 44 s, so under docs/runbooks/screening-capacity.md it goes to the founder before merge as a question of the consumer's size (after the 2026-10-22 ruling, a consumer of 4 vCPU and 8 GiB and GitHub's 8-core runner). This PR changes neither the consumer nor the harness. The decision on the runner and the organization (issue #102) applies only if the repository goes private again."
3. If the session merges the new base before merging, then in "What changes", the sentence "Head `92ae9a25`, the merge of base `df4daff7` (#107 and #105) into the reviewed `78cd55d2`." and the re-check heading must name the new head and base. As long as the head stays `92ae9a25`, nothing else is stale.

## 5. Base moved during verification
- `claude/build-platform` moved from `df4daff7` to `72096e94` (#75, 81 files). Two of those files overlap #106's: `docs/product/test-matrix.md` and `packages/synth/src/cases/matrix.ts`. #75 also adds 2 lines to `tools/screening-capacity/watched-paths.txt`. The lockfile is unchanged.
- I made a trial merge of `92ae9a25` with `72096e94`, local to the clone only and never pushed. It merged cleanly by auto-merge, with no conflicts. On that merge:
  - `pnpm synth --all`: 288 cases, 0 files written, 689 unchanged;
  - vitest over tools/test, packages/synth and watched.test.ts: 36 files, 498 tests, all passed.
- No action is needed unless branch protection requires the branch to be up to date. If it does, a base merge of `72096e94` is clean and needs a fresh CI run before merge.

## Findings
- B: none.
- S: none.
- N1: S4 is above the 48-s line in all three runs and above the 44-s sizing question. The gate passes because time is advisory, but the runbook sends the O9 sizing question to the founder before merge. The description says nothing waits on a person; corrections 1 and 2 fix that. This is the standing O9 condition: #106 does not touch the consumer, the harness or the web.
- N2: The base moved to `72096e94` after CI. A trial merge is clean and its synth and tests pass; see section 5.

The clone was removed after the run.

VERDICT: VERIFIED
