# Lane B Dependabot batch, PR B (#94): fresh-clone verification

2026-11-04T02:42Z to 02:48Z, acting Lane B session S4 (Lane A's account). Read only on GitHub. Not committed.
Head e3fc02e44cb7b13a2496192d0c4fb8fc04c01f37 (draft), base claude/build-platform 21fa10dfddd73228865f183e34c809946b014441.

## 1. Remote state
| Check | Result |
| --- | --- |
| `git ls-remote` 02:42:51Z and again 02:47:29Z | branch e3fc02e4, base 21fa10df: neither moved |

## 2. Fresh clone (`git clone --filter=blob:none`, checkout e3fc02e4; heavy steps under `flock /tmp/laneb-heavy.lock`)
| Command | Result |
| --- | --- |
| `git log -1 --format=%P` | e6823f5b (B(6)) and 21fa10df: the base is merged |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm install --lockfile-only`; `git diff --exit-code` | no change |
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint:logs` | 1,115 files, every log call on allowlisted fields |
| `pnpm verify-content` | every content set passes |
| `pnpm check:fixtures` | 334 files read by the guard, 4,029 searched; every table synthetic |
| `pnpm synth --all` | 287 cases: 0 written, 680 unchanged; 8 EMR formats: 0 written, 16 unchanged |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | 551 lines, no change; `git status --porcelain` empty |
| `pnpm exec vitest run --project unit infra/test/cli-settings.test.ts packages/contracts/src/testing/recorded-textract.test.ts` | 2 files, 14 passed (10 + 4) |
| `pnpm --filter @tp/infra test` | 27 files, 710 passed |
| `BASE=origin/claude/build-platform pnpm toolchain:check` | passed against 21fa10df, 0 errors, 1 warning (pnpm 10.34.9 newer than packageManager's 10.34.8; not this PR's); 37 versions added, each 3+ days old, registry integrity, no weaker trust; 614 entries by sha512; 0 audit exceptions, 0 release-age excludes; no image new |
| Tree after all steps | clean |
| Manifests | all 13 direct `@aws-sdk/*` ranges `^3.1160.0` (apps/web 5, apps/worker 4, model-gateway, db, contracts, infra client-sts); `aws-cdk-lib ^2.275.0`, `aws-cdk ^2.1146.1`, `stripe ^23.1.0` |
| `git diff --stat 21fa10df e3fc02e4` | 16 files, +779/-332: 7 manifests, lockfile, ADR 0012, runbook, `infra/scripts/cdk-diff.ts` (one env line), `infra/test/cli-settings.test.ts`, `packages/contracts/src/testing/{index,recorded-textract,recorded-textract.test}.ts`, `packages/model-gateway/eval/sets.ts`: each named in the description. No migration, no `content/releases/**`, nothing under pricing, ledger, packets or edi835 |

## 3. CI on e3fc02e4 (`get_check_runs`, #94: 30 runs, 29 success, 1 skipped, none failed; all on this head)
| Check | Result |
| --- | --- |
| `all green` 125236643791 (required) | success |
| `mutation` 125239033970 (required) | success; log tail "mutation gate: passed" |
| `screening-capacity gate` 125237059480 (required) | success (capacity 125228651914 success; notify skipped) |
| `approval-of-record` (required) 125226139578, 125227753965, 125230505531, 125243435574 | all success; the 4th (run 41435292789, 11:15:28Z) is from the description edit and is not in the description |
| unit 125226140255 | log tail: 432 files; 7,306 tests: 7,305 passed, 1 skipped (matches) |
| db 1/4 to 4/4 | success; 4/4 log: 34 files (matches). Per-shard test counts sit above long file listings and were not re-read (the raw log URL is refused by the proxy); 9,649 not re-confirmed from logs |
| e2e 1/2, 2/2; static (golden); lint; domain model; build; images; 6 stryker shards; 2 changes; dependabot.yml | success. e2e 70 and golden 376 not re-read from logs |

## 4. Open PRs into claude/build-platform now, `git merge-tree --write-tree`
| PR | Head | Draft | vs e3fc02e4 | vs 21fa10df | Because of #94 |
| --- | --- | --- | --- | --- | --- |
| #101 Dependabot minor-and-patch | d9646252 | no | clean | clean | no |
| #100 Dependabot aws-cdk | 7350d861 | no | clean | clean | no |
| #99 Dependabot aws-sdk | dc7d68c7 | no | conflict: pnpm-lock.yaml | clean | **yes** (never merges as it stands; closed with a comment when #94 merges) |
| #96 ci-mutation-trigger | 50029e64 | yes | clean | clean | no |
| #86 ci-images-digest | 83167b8f | yes | conflict: ADR 0066, reconciliation-001.md, workflows.test.ts | same conflict | no |
| #85 UX PR 10 | a97d6011 | yes | conflict: reconciliation/display.test.tsx | same conflict | no |
| #84 packet day counts | e3299ea2 | yes | clean | clean | no |
| #75 contract PHI check | 871faff9 | yes | conflict: uploads/page.tsx, uploader.tsx, uploader.test.tsx | same conflict | no |

No non-draft, green PR other than Dependabot's waits with a file that conflicts with #94: #94 jumps nothing.
#88 closed unmerged 2026-11-02T04:10:18Z; #89 closed unmerged 04:07:49Z. #99, #100, #101 open. All other PRs'
`updated_at` precede 2026-11-02T10:35:57Z, so the heads are those the description's merge-tree read.

## 5. Description corrections (the "Merge order" and "Checks" claims otherwise hold)
1. Merge order: "(`git merge-tree` of each open head against e3fc02e4, 2026-11-02T11:08:25Z; the same heads as at 10:35:57Z)"
   -> "(`git merge-tree` of each open head against e3fc02e4, 2026-11-04T02:47Z; the same heads as at 2026-11-02T10:35:57Z)"
2. Merge order: "still the tip of `claude/build-platform` at 2026-11-02T11:07:46Z"
   -> "still the tip of `claude/build-platform` at 2026-11-04T02:47:29Z"
3. Checks (the source wraps after "the"): "Updated 2026-11-02T11:08Z without a commit: the base had not moved, so nothing was merged, re-run or pushed."
   -> "Updated 2026-11-04T02:48Z without a commit: the base had not moved, so nothing was merged, re-run or pushed; a fresh-clone verification of this head passed."
4. Checks: "finished 2026-11-02T11:05:44Z: 29 check runs, 28 success, 1 skipped (`notify`)"
   -> "finished 2026-11-02T11:05:44Z, the description edits' last `approval-of-record` at 11:15:28Z: 30 check runs, 29 success, 1 skipped (`notify`)"
5. Checks, CI table: "`approval-of-record` (jobs 125226139578, 125227753965, 125230505531)"
   -> "`approval-of-record` (jobs 125226139578, 125227753965, 125230505531, 125243435574)"
Net about +150 characters; the description (65,141 characters by `wc -m` on the saved copy) stays under 65,536.
Each later description edit adds an approval-of-record run, so item 4/5's counts move again with the next edit.

VERDICT: VERIFIED
