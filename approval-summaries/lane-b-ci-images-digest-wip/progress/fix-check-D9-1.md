# fix-check D9-1 (adversarial verify of D9: reconciliation-001's #86 entry, design labels removed, runs named)

Started 2026-11-02 02:31 UTC. Clone: /home/user/fx-imgdigest-D9-1 (read only, never pushed).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D9-1-*.log

Finding (CI N3): reconciliation-001.md:665 cites (C1, C2), (C3, C4), (C5 to C8), (C11): design labels defined nowhere in
the repo; C11 = R0 which never ran. Fix: delete the four labels; keep the ADR 0066 Part 3 N32 pointer; name only runs
that exist (R1 ci 40652135443, R2 ci 40653896254).

## Steps
- [x] clone, fetch WIP ref, check out d257fe6d…, confirm = origin/co-001/wip-ci-images-digest
- [x] pnpm install --frozen-lockfile
- [x] read the D9 diff (d5f987a4…) and the entry at the head
- [x] (1) finding's scenario: labels gone; a check that would catch them (docs only, no test reads this file?)
- [x] (2) harmless variants
- [x] (3) nothing loosened: b2a41a00 red cases still red; no fact dropped from the entry
- [x] (4) documents match code; runs named exist (GitHub MCP read), are ci runs on #86
- [x] remove clone

## Log
- C0 heads (git ls-remote, 02:32 UTC): wip = d257fe6d… (= origin/co-001/wip-ci-images-digest), PR branch and
  refs/pull/86/head 83167b8f…, #42 6c28d6a2…, claude/build-platform MOVED to 4eaf7124… (#92, UX PR 6) since 43565235….
  #92's diff 43565235..4eaf7124 touches none of .github, workflows.test.ts, ADR 0066, ci.md, reconciliation-001; it
  adds one watched-paths.txt line. git merge-tree d257fe6d… 4eaf7124… exit 0 (clean). Clone at d257fe6d….
  pnpm install --frozen-lockfile exit 0 (D9-1-install.log).
- C1 D9 = d5f987a4…: one file, docs/product/reconciliation-001.md, one line (:665): the four labels removed; "which
  its description lists (C11)" replaced by ": R1, ci run 40652135443, and R2, ci run 40653896254". ADR pointer at :663
  kept. (The DOCKER_BUILD_RECORD_UPLOAD clause in the same line came from D7 19cc7bf5…, not D9.)
- Record (ops files): R1 = ci 40652135443 on 9ec30e1d (c2), synchronize 07:45:29; critic-1 G3 read its images log
  (job 122694617018): body 124,840 code points. R2 = ci 40653896254 on 83167b8f; its body 125,892 is INFERRED (pre-push
  read lost; last edit 08:01:18, R2 synchronize 08:01:41). R0 never ran (create refused, 65,536 cap). R3 planned.
- C2 same-class search over #86's added lines (merge-base..d257fe6d…, 9 files): no C/A/R0/§/G design label left.
  But the fix round added review labels the repo defines nowhere: ADR N32 :1002 "The security review's S3" and :1003
  "P2, a proposal" (D7 19cc7bf5…), workflows.test.ts:3214 "(the security review's S1)" (D2 330deea0…). The test file
  already says "the security review's S1 and S2" at :4235/:4260 (c10011b6…, CI-13, a different PR's review: Dockerfile
  reading) and "the review's S1" at :776, so "the security review's S1" now names two different findings in one file.
  Same class as N3 (outside D9's line, inside #86's files). Repo convention does cite review labels (ADR :449, :457, :715).
- C3 (4) runs named, GitHub MCP actions_get: 40652135443 = workflow "ci" run 204, event pull_request, PR [86], head
  9ec30e1d…, created 2026-10-28T07:45:29Z, success. 40653896254 = "ci" run 205, pull_request, PR [86], head 83167b8f…,
  08:01:41Z, success. Both exist and are what the entry says.
- C4 description timeline: approval-of-record.yml runs on pull_request [opened, synchronize, reopened, edited,
  ready_for_review]; its runs on the branch (MCP list, total_count 5): 07:40:18 eeac99e2 (opened, no ruler: create
  refused it), 07:44:46 eeac99e2 (edit = the ruler; cancelled by R1), 07:45:29 9ec30e1d (R1 synchronize), 08:01:18
  9ec30e1d (edit), 08:01:41 83167b8f (R2 synchronize). None since: so the body has not been edited since 08:01:18 Oct 28,
  so R2's event carried the body the status read on Nov 1 17:26 (125,892 chars) - no longer only an inference. R1's
  body = the 07:44:46 edit's body; critic-1 G3 measured 124,840 code points in R1's images log. Both > 100,000: TRUE.
- C5 R1 re-measured myself (MCP get_job_logs job 122694617018, whole log 4,206 lines, saved by the harness; parsed
  with imgdigest/d9scripts/r1body2.py; D9-1-R1-body.log): Metadata groups at log lines 982 and 3140, 162,422 and
  162,428 bytes; provenance github_event_name pull_request, payload action synchronize, number 86, head 9ec30e1d…,
  pull_request.body 124,840 code points (124,841 UTF-16 units, 124,879 UTF-8 bytes), ruler header present. Matches
  critic-1 exactly. R1 "a pull_request run with a description over 100,000 characters": TRUE.
- C6 (1) scenario: the four labels are on :665 at b2a41a00… (git grep '\(C[0-9]+([,)]| to C)|\bC11\b' -- docs) and
  gone at d257fe6d…; the other hits (:26 "(C1). C2 to C5", :290 "(C1)", ADR 0071) are other entries' own labels, on
  the base, untouched. No test reads reconciliation-001.md (git grep over tools/apps/packages/infra/.github: no
  reader; markdown is not linted, ESLint only); the only checks over it are gitleaks and the fixture check, both
  green (D9-1-gitleaks.log: d5f987a4… 1 commit, no leaks; file, no leaks; D9-1-check-fixtures.log: exit 0, 333 read,
  3,894 searched). So the scenario is closed by the text, not by a test; re-adding the labels would pass CI.
- C7 (2)/(3) d5f987a4… vs parent: 1 file, 1 line. Word diff b2a41a00..d257fe6d on the file: only the four labels
  removed, "which its description lists (C11)" -> ": R1, ci run 40652135443, and R2, ci run 40653896254", plus D7's
  DOCKER_BUILD_RECORD_UPLOAD clause. Every other fact kept. R1/R2 appear nowhere else in the file, ADR or ci.md (no
  collision; defined inline). Run ids appear only on :665.
- C8 (4) entry vs code at d257fe6d…: BUILT fromJSON(... || '{}')['containerimage.config.digest'] on ci.yml:748/:760;
  7 `uses: docker/build-push-action@` lines (ci 2, screening-capacity 2, release, release-dry-run, release-capacity
  1 each), 7 DOCKER_BUILD_RECORD_UPLOAD "${{ github.event_name != 'pull_request' }}"; provenance-add-gha set nowhere
  (stays). ADR N32 (:981-) carries each choice (digest, provenance disabled, record upload, provenance-add-gha as P2,
  ci-findings-transport). ADR/ci.md/test say nothing of runs of record (consistent: the entry is the only place).
- C9 live heads (02:38 UTC, 100 refs): #42 MOVED to 9426a8d1… (one commit on 6c28d6a2…, "Update domain-model.md", only
  docs/product/domain-model.md; none of #86's or T6's files). Trial merges of d257fe6d… with every co-001 head and #42
  that changes reconciliation-001 (D9-1-heads-reconciliation.log): 18 clean, each keeping D9's run line and no old
  label (#42 9426a8d1…, wip-pr42-integrate-3 6c28d6a2…, suite-cap-1-triage-locks ce408d2f…, ss-01 bb13be1b…,
  wip-ci-findings-transport b9a83bd3…, ...). Conflicts: ci-mutation-trigger 50029e64… (live, 2026-11-02) appends its
  P4 entry at the same place: append/append, keep both; it conflicts identically with D9's parent and with 83167b8f…,
  not with the base, so it predates D9. The other 10 conflicting heads conflict with the base itself (not #86's).
- C10 R2 closed (MCP pull_request_read #86, saved by the harness, measured with python; D9-1-pr86-body.log): body
  125,892 code points, ruler at 25,699, 100,061 chars, SHA-256 5bb5e558…; PR updated_at 2026-10-28T08:01:36Z (before
  R2's 08:01:41), no approval-of-record run since: R2's event carried 125,892 > 100,000. TRUE. The description names
  R1's run id but NOT R2's (40653896254 absent): the OLD text "which its description lists" was false for R2; D9's
  ids are more accurate than what they replaced.
- C11 completeness (status plan step 2-3): the fix round's one push is R3, "images and capacity read as runs of
  record", with the ruler live (125,892 chars), and "if any push is needed after the cut, the ruler goes back first".
  So R3 (the merging head's run, the only one that runs D1-D10) is a run of record by the entry's own definition, and
  its id cannot be in the tree that produces it. D9's "the runs of record are ...: R1 ..., and R2 ..." states a closed
  list that is incomplete the moment the planned push lands, and dropped the pointer to where the full list lives.
  Wording proposal for :665 (before the one push): "..., each with a description over 100,000 characters, the first
  two R1, ci run 40652135443, and R2, ci run 40653896254, and the merging head's run, which the pull request's
  description names." (and the planned body edit must then name R2 and R3).
- C12 same class inside #86's files, beyond D9's line: ADR 0066 N32 :1003 "P2, a proposal" (D7) collides with the CI
  series' follow-up numbering in the same ADR: "the CI series' follow-up P1" (Part 5, :5, :38; reconciliation :659),
  live co-001/ci-mutation-trigger 50029e64… adds "follow-up P4" to ADR 0066 and reconciliation-001, and the series'
  P2 is ci-trivy-version (ADR 0066 Part 6, designed, not pushed). So "P2" will name two things in one ADR.
  Proposal: "**A proposal:**", drop "The security review's S3," (:1002) and "(the security review's S1)" (test :3214),
  as D9 did for the design's labels.
- Clone checked clean (git status empty, one worktree) and removed 02:41 UTC.

## Result
D9 RESOLVED: labels gone, ADR pointer kept, both named runs exist and are what the entry says (R1 124,840 and R2
125,892 chars, both re-measured). Nothing loosened in substance; the old "which its description lists" was false
for R2. Nits: the run list reads as closed and will miss R3 after the planned push (wording proposed, C11); same-class
labels added by D2/D7 elsewhere in #86's files (C2, C12). No test guards the doc (none reads it).
