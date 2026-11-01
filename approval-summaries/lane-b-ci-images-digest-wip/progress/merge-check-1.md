# Adversarial merge check 1 of WIP head b2a41a00 (co-001/wip-ci-images-digest): progress

Clone /home/user/mc-imgdigest-1 (read only, never pushed). Started 2026-11-01.

## Setup (done)
- Clone made; origin co-001/wip-ci-images-digest = b2a41a00 (ls-remote and fetch agree); checked out detached at
  b2a41a00. Chain: b2a41a00 <- 5143563f <- 60a92a70 (parents 83167b8f, bce57f16). Merge base 83d71fd6.
  origin co-001/ci-images-digest still 83167b8f; claude/build-platform bce57f16.

## (a) both sides kept: PASS
- Files both sides changed vs 83d71fd6 (9): ci.yml, release-capacity.yml, release-dry-run.yml, release.yml,
  screening-capacity.yml, ADR 0066, reconciliation-001, ci.md, workflows.test.ts.
- `git show --remerge-diff 60a92a70`: only the three conflicted files appear (ADR Date line, reconciliation-001
  :659, workflows.test.ts :13 imports); each resolution keeps both sides, #82 first. No auto-merged file differs from
  git's own re-merge. `git merge-tree --write-tree 83167b8f bce57f16` conflicts in exactly those three.
- Hunk script (-U0, +/- content, ignoring line numbers): for ci.yml, the four other workflows, ci.md and
  workflows.test.ts, diff(MB,ours)==diff(theirs,M) and diff(MB,theirs)==diff(ours,M) exactly (nothing dropped or
  duplicated). ADR: only difference is the Date line both sides edited, merged as "...; Part 5 2026-10-28; N29
  2026-10-28". reconciliation-001: only difference is blank-line alignment; region 658-665 at M reads blank, #82's
  paragraph, blank, #82's bullet, blank, ours' paragraph, blank, ours' bullet (665 lines = 657+4+4).
- Stats: diff bce57f16..60a92a70 = 9 files 737+/18- (= ours vs MB); diff 83167b8f..60a92a70 = 55 files 7079+/280-
  (= theirs vs MB).
- 5143563f touches only workflows.test.ts (47+/47-); b2a41a00 only N29->N32 lines plus the new ADR sentence.

## (b) N29 -> N32: PASS (one wording nit)
- At 83167b8f, 16 lines name this branch's N29; at b2a41a00, 16 lines name N32 (same files and roles); N32 absent
  on bce57f16; no N32x anywhere.
- Remaining \bN29\b at b2a41a00: ADR:983-984 (the new sentence) and ADR:1642 (#82's Part 5 N29, byte-identical to
  bce57f16:1622; `git diff bce57f16 b2a41a00` on the ADR touches nothing in Part 5). N29x only in MOD-03 fixture and
  a model-gateway eval report (unrelated IDs).
- ADR Date line ":31 ...; Part 5 2026-10-28; N32 2026-10-28", Deciders :45 "N32 is made under the same ruling...",
  notice :981 "**N32** (`co-001/ci-images-digest`, 2026-10-28)"; all consistent; :983 says the commit messages call
  it N29.
- Nit: ":983-984 ... whose Part 5 took N29 to N31" reads as a range N29-N31 or as "renamed N29 to N31"; Part 5's
  notices are N23 to N31 (the commit message itself says "took N23 to N31").

## (c) T1-T6 on #82's workflows: PASS
- #82's workflow changes (git diff 83d71fd6 bce57f16 -- .github/): comments only, except ci.yml Action pins env
  gains `GITHUB_TOKEN: "${{ github.token }}"`. github.token was already admitted (BOUNDED_GITHUB has 'token' at
  83167b8f; five other workflows already used it). BASE row (steps.range.outputs.base) already present.
- #82's own changes to workflows.test.ts (tokenProblems, dockerfileDigestProblems, Action pins env) touch none of
  the N32 block's helpers.
- The N32 describe block (538 lines) at 83167b8f vs b2a41a00: identical except the describe title and one comment
  (N29->N32) and 47 citation strings. No rule, set, bound text or row added/removed; BOUNDED_GITHUB, ONE_LEVEL,
  BOUNDED_INPUT_TYPES, GITHUB_ENV_NAMES, DIGEST_KEY, expressionProblems, unboundedValueProblems unchanged.
- Citations: script maps all 67 rows / 75 citations; every cited range's text at b2a41a00 equals the old range's text
  at 83167b8f (0 mismatches). Read each workflow range at b2a41a00: ci.yml 791 needs, 328-336/527-535/216-224
  runner-image, 374/150/233/213 cache keys, 688-699/712-724 the two builds, 56-75 range step; release-capacity 141
  ADVISORIES_B64; release-dry-run 97-110/100/102-105 image step, 164-192 identity, 70-76 outputs; release.yml
  86-99/89/91-94, 169-197, 55-67, 446-450 attest; screening-capacity 254, 238-246, 286, 349/351/352, 88-130. All
  correct. Files cited but unchanged since 83167b8f: content-calendar, mutation, large-zip, publish-content
  workflows and tools/{content-calendar,release-capacity,screening-capacity,stryker}, publish-content.sh.
- No other yml:line citations in ci.md, reconciliation-001, ADR 0066 or the workflows.
- Probe (working tree only, restored, tree clean after): 'token' removed from BOUNDED_GITHUB -> T1 fails with 6
  problems, among them `ci.yml job static step "Action pins" env.GITHUB_TOKEN: github.token, not a bounded github
  value`, so the rule reads #82's new value and admits it only through the existing bounded 'token'.

## (e) vitest + typecheck
- `flock ... pnpm exec vitest run --project unit tools/test` on b2a41a00: exit 0, 21 files, 294 tests passed
  (36.3 s). (Integrator's 32/456 also included tools/check-action-pins and tools/check-toolchain.)
- `flock ... pnpm typecheck`: exit 0, "passed, 22 projects in 74.8 s wall".
- (e) PASS.

## (d) regeneration: PASS
- On b2a41a00 after the checks: `flock ... pnpm install --frozen-lockfile` exit 0 ("Already up to date").
- `node tools/screening-capacity/watched.ts --write` exit 1, ERR_MODULE_NOT_FOUND for tools/content-files (plain node
  cannot resolve watched.ts:4's extensionless import). Pre-existing, not the merge's: watched.ts, content-files.ts and
  watched-paths.txt are unchanged from 83d71fd6 to b2a41a00. The documented form (watched.ts:22,
  runbooks/screening-capacity.md:368) `pnpm exec tsx tools/screening-capacity/watched.ts --write`: exit 0,
  "watched-paths.txt: 539 lines".
- `flock ... pnpm synth --all` exit 0: 261 cases, 0 written, 653 unchanged, 0 removed; 8 EMR formats, 0 written, 16
  unchanged, 0 removed.
- `git status --porcelain`: empty (0 lines); HEAD still b2a41a00.

## Verdict: sound (all of (a)-(e) pass). Clone to be removed.
- Clone /home/user/mc-imgdigest-1 and scratch scripts removed; nothing pushed from it.
