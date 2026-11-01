# Merge of claude/build-platform (#82) into co-001/ci-images-digest: progress

Worktree /home/user/ci-images-digest. Started 2026-11-01 (first run; no earlier progress file existed).
Start: HEAD 83167b8f = origin/co-001/ci-images-digest, clean.

## Step 1: fetch + merge (DONE)
- origin/claude/build-platform = bce57f16 (did not move). Merge base 83d71fd6.
- Merge commit **60a92a70** "Merge claude/build-platform bce57f16 (#82, ci-pin-age) into co-001/ci-images-digest"
  (parents 83167b8f, bce57f16).
- Conflicts (exactly the three expected):
  - ADR 0066 :28-35: kept #82's Part 5 summary, then one Date line with both:
    "- **Date:** 2026-10-25; Parts 2 and 3 2026-10-26; Part 5 2026-10-28; N29 2026-10-28".
  - reconciliation-001 :659: #82's P1 paragraph + bullet first, then this branch's images paragraph + bullet.
  - workflows.test.ts :13: both imports (readDockerfile from check-toolchain/images; MAX_FILE_BYTES, MAX_OPENED_PER_RUN).
- Auto-merged (ci.yml, release.yml, release-dry-run.yml, release-capacity.yml, screening-capacity.yml, ci.md, ADR rest,
  workflows.test.ts rest): checked by script, every added line of each side present, no removed line lingering;
  numstat of merged-vs-theirs equals ours-vs-base and merged-vs-ours equals theirs-vs-base for test, ci.yml, ci.md.
- #82 adds to ci.yml Action pins: env { BASE, GITHUB_TOKEN: "${{ github.token }}" } (T6 candidate).

## Step 2: scoped tests (next)
- Scoped tests on merge 60a92a70: `vitest run --project unit tools/test tools/check-action-pins tools/check-toolchain`
  -> 32 files, 456 tests passed (exit 0). T1-T6 pass on #82's workflows: #82's only new expression is Action pins'
  GITHUB_TOKEN: "${{ github.token }}" (github.token already in BOUNDED_GITHUB) beside BASE (steps.range.outputs.base,
  already a row). No row added, no rule/bound changed.
- T6 citations: 27 ranges / 47 rows drifted (ci.yml +1 after :13, +4 after :84, +5 after :673; release*.yml,
  screening-capacity.yml +1 below the builder comment). Remapped by matching lines (difflib), content asserted equal.
  Commit **5143563f** "test: the value table's citations follow #82's lines ...". `-t "131,072"`: 4 passed.
- Anchor design considered: computed citations (a YAML-position resolver, rows naming job/step ids) are better on
  staleness but not small (~45 rows + a resolver and its own test): recorded as a proposal, not applied.

## Step 3: renumber N29 -> N32 (next)
- N32 free: re-checked bce57f16 (only N29 is ADR Part 5 :1641 at base) and all 79 origin co-001/* branches (none
  uses N32).
- Commit **b2a41a00** "docs: this branch's ADR 0066 Part 3 notice is N32 ...". Renumbered (same line before/after):
  ci.yml:667, :687; release-capacity.yml:64; release-dry-run.yml:113; release.yml:104; screening-capacity.yml:174;
  ADR 0066:31 (Date), :45 (Deciders), :981 (notice head) + :983-984 new sentence ("The branch's commit messages call
  it N29, the number it held until the merge of #82, whose Part 5 took N29 to N31."); reconciliation-001:663;
  ci.md:152, :432; workflows.test.ts:1927, :2842, :2844 (describe title), :3265.
- Remaining \bN29\b (excluding N290-N299 in model-gateway eval report and MOD-03 fixtures): ADR:983 (the new
  sentence naming this branch's old number, by design), ADR:984 ("took N29 to N31", #82's range), ADR:1642 (#82's
  Part 5 notice N29, the revert path).

## Step 4: regenerate (next)
- Regenerate on b2a41a00: `pnpm install --frozen-lockfile` exit 0 ("Lockfile is up to date ... Already up to date");
  `node tools/screening-capacity/watched.ts --write` exit 1 (ERR_MODULE_NOT_FOUND tools/content-files: node cannot
  resolve the extensionless import; the documented command is `pnpm exec tsx tools/screening-capacity/watched.ts
  --write`, watched.ts:22, runbook screening-capacity.md:368) -> tsx form exit 0, "watched-paths.txt: 539 lines";
  `pnpm synth --all` exit 0 (261 cases: 0 written, 653 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged).
  Tree clean afterwards: no regeneration commit.

## Step 5: checks (running)
- actionlint 1.7.7 (/usr/local/bin): exit 1, 22 findings, all [runner-label] "ubuntu-26.04" unknown to 1.7.7; no other.
- actionlint with a temp config admitting the ubuntu-26.04 label: exit 0.
- Interplay: the hand-over patch (49 lines, 3,456 bytes, SHA-256 8cf981fb...) applies in reverse to b2a41a00
  (`git apply --check -R` clean, ci.yml hunks at 743/755). #42 (be63bdc2, merge base 56ed6279) trial
  `git merge-tree` with b2a41a00: no conflict; #42's workflow change is the patch alone (ci.yml 8 lines, test 7).
- Full check run started (vitest scoped, typecheck, lint, lint:logs, actions:check --offline, actions:check BASE,
  toolchain:check BASE); logs in /tmp/laneb-checks/.
- vitest (unit; tools/test, tools/check-action-pins, tools/check-toolchain) on b2a41a00: exit 0, 32 files, 456 tests.
- Pre-push: launcher /home/user/PhysicalTherapy/.git/hooks/pre-push installed; pinned gitleaks 8.24.3 in
  /root/.cache/paidwhole/gitleaks/8.24.3/ (not on PATH; the hook resolves it). WIP refs on origin: none yet.
- All on b2a41a00, exit 0: typecheck (22 projects, 84.9 s wall); lint (1,676 files in 3 groups, 0 errors, 0
  warnings); lint:logs (1,086 files, every log call allowlisted); actions:check --offline (offline rules only, pass);
  BASE=origin/claude/build-platform actions:check (merge base bce57f16; no pin new or with changed inputs; builder
  v0.34.1 no newer release 3 days old; age: nothing read; pass); BASE=origin/claude/build-platform toolchain:check
  (networked reads ran, none refused: passed, 0 errors, 1 warning: pnpm 10.34.9 newer than packageManager's 10.34.8,
  a base warning, package.json and lockfile unchanged against bce57f16).
- Nothing failed, so no fix commit and no base comparison worktree was needed.

## Step 6: push (next)
- Pushed `git push origin HEAD:refs/heads/co-001/wip-ci-images-digest` (ref was absent on origin): exit 0; pre-push
  "3 commits checked: 0 file(s) read by the fixture guard, 19 text file(s) searched for an X12 header, and gitleaks
  found no secret". origin co-001/wip-ci-images-digest = **b2a41a00**; co-001/ci-images-digest still 83167b8f (not
  pushed). The remote printed GitHub's notice of 1 moderate Dependabot alert on the default branch (not this branch's).

## DONE (all six steps). WIP head b2a41a00 <- 5143563f <- 60a92a70 (parents 83167b8f, bce57f16).
