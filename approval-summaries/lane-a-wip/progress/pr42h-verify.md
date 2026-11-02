# pr42h-verify (fresh clone /tmp/claude-0/-home-user-PhysicalTherapy/b44a103e-64fa-5094-8b17-09d1b9f5409a/scratchpad/pr42h-verify)

## Step 1
- HEAD 6c28d6a2… confirmed; origin/claude/build-platform bce57f16 is ancestor: OK

## Step 2 (diff since be63bdc2) -- DONE, holds
- first-parent: ed032539 (merge 83d71fd6 #78), 10db232c (docs), c65f9cf2 (docs), 6c28d6a2 (merge bce57f16 #82)
- ed032539: 62 files base-only, M==base blob; 4 both-sides files (test-matrix.md, synth matrix.ts, registry.ts, watched-paths.txt) each == clean `git merge-file` 3-way result (0 conflicts). No file changed by merge beyond base.
- 6c28d6a2: 49 files base-only M==base; 6 both-sides (ci.yml, reconciliation-001.md, test-matrix.md, matrix.ts, registry.ts, workflows.test.ts) each == clean 3-way (0 conflicts).
- lockfile/fixtures/watched-paths: equal to base or clean merge; no our-only change in merges.
- screening/legal-surfaces/data-retention diff empty; migration, domain-model.md, db/functions, approvers.json, content/releases, pricing/src: empty.
- docs commits: 3 files (ADR 0062, ADR 0065, reconciliation-001); quoted-string sequences identical before/after in each (whitespace-normalised); no changed line contains a quote; ADR 0062 quote == wording.ts ADDRESS_CHECK_KEPT.
- no model name in added content; added 40-hex = git object IDs in #82 test fixtures (base). Note: commit trailers "Co-Authored-By: Claude Opus 5.5" on all 4 commits (harness attribution; same on base commits).

## Step 4 (CI) partial
- domain model (job 124970503678): failure; only error = not approved (names no person; date not a date); domain-model.md matches schema at 20261107090000_mail_streams.sql; packages/db/functions matches 375 function names; prints SHA-256 b23fed0e…. Summary step: last approved at bce57f16 6d7a143d..., new b23fed0e... awaiting approval.
- approval-of-record: success; lint, build, changes x2: success (at first poll). Poll running (pr42h-ci.tsv).

## Step 3 (local, under lock)
- install --frozen-lockfile: ok; typecheck 0; workflows.test.ts 116/116; tables.test.ts 7/7
- tp_pr6b4h_v_1: migrate 0 (45 migrations, head 20261107090000_mail_streams.sql); --check 0: matches schema + 375 functions
- --require-approval exit 1: "not approved: the approval names no person; the approval date is not a date", SHA-256 b23fed0e...2518. Line 7334 = last line = "Approved by: ________  Date: ________  Document SHA-256: `b23fed0e...2518`" (tool checks the last line; prints no line number itself).
- db tests: running
- db tests 0: 11 files, 208 passed, 1 skipped (restore-drill pg_dump: local pg_dump 16 vs server 18, environmental self-skip). tp_pr6b4h_v_1 dropped.
- images: success. Step 10 web archive: BUILT sha256:baf176ea..7084 == archive config. Step 11 worker: BUILT sha256:964add78..4429 == config; target 5150eb4f..; loaded as target on the image store.
- CI snapshot 20:50:
  all green	completed	failure
  e2e (2/2)	completed	success
  e2e (1/2)	completed	success
  stryker (packets-rest)	in_progress	-
  stryker (pricing-engine)	completed	success
  stryker (packets-explain)	completed	success
  stryker (pricing-rest)	completed	success
  stryker (packets-scan)	completed	success
  stryker (pricing-recompute)	completed	success
  capacity	in_progress	-
  db (4/4)	completed	success
  unit	completed	success
  domain model	completed	failure
  lint	completed	success
  build	completed	success
  images	completed	success
  db (2/4)	completed	success
  db (3/4)	completed	success
  db (1/4)	completed	success
  approval-of-record	completed	success
  static	completed	success
  changes	completed	success
  changes	completed	success

## Step 4 final (26 check runs, all completed)
- notify	completed	skipped
- screening-capacity gate	completed	success
- mutation	completed	success
- all green	completed	failure
- e2e (2/2)	completed	success
- e2e (1/2)	completed	success
- stryker (packets-rest)	completed	success
- stryker (pricing-engine)	completed	success
- stryker (packets-explain)	completed	success
- stryker (pricing-rest)	completed	success
- stryker (packets-scan)	completed	success
- stryker (pricing-recompute)	completed	success
- capacity	completed	success
- db (4/4)	completed	success
- unit	completed	success
- domain model	completed	failure
- lint	completed	success
- build	completed	success
- images	completed	success
- db (2/4)	completed	success
- db (3/4)	completed	success
- db (1/4)	completed	success
- approval-of-record	completed	success
- static	completed	success
- changes	completed	success
- changes	completed	success
- all green fails only on: domain-model failure. Required: all green failure (domain model only), mutation success, screening-capacity gate success, approval-of-record success.

## VERDICT: pass (all holds; only expected reds)
