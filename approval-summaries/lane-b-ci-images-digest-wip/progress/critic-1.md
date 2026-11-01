# critic-1: completeness critic for PR #86 reviews at WIP head b2a41a00…

Started 2026-11-01. Clone: /home/user/critic-imgdigest-1 (read only, removed after).

## Gaps checked
(none yet)
- G1 #42's head: refs/pull/42/head is now c65f9cf2 (be63bdc2 + merge of 83d71fd6 (#78) + two ADR 0062 docs commits,
  17:01-17:07 UTC), not be63bdc2. To check: merge-tree with b2a41a00, T6 citations.
- G2 job 122624309161 (#42's failure, run 40630123457, head 46974a25): exists, "Argument list too long" at the web
  identity step confirmed (tail read). Test name's run id 40630123457 matches. Two .dockerbuild artifacts
  (12791306593, 12791211790) from #42's run carry #42's real description, 90 days.
- G3 approval-of-record runs on the branch: 07:40:18 eeac99e2 (opened), 07:44:46 eeac99e2 (cancelled; an edit?),
  07:45:29 9ec30e1d (R1 synchronize), 08:01:18 9ec30e1d (edit), 08:01:41 83167b8f (R2). R1's log: to read.
- G3 done: 07:44:46 run = the ruler edit on eeac99e2 (cancelled by R1's push). R1 images log (job 122694617018) read
  whole: original_length 4,206 = 4,206 lines returned. Metadata groups (log lines 981, 3139): 162,422 and 162,428
  bytes, keys incl. buildx.build.provenance, body length 124,840 (Python code points); identity steps passed (web
  config sha256:66bc0f6e…, worker 51bb5cde…), no ##[error]. R1 is a valid run of record for c2 alone (what #42 ports):
  the fromJSON form starts bash with a 162 KB metadata. Not in the status file (gap in the record, not a defect).
- G1 done: merge-tree b2a41a00 + c65f9cf2 (#42 now) clean, tree 6c626606 (= wip-pr42-integrate-3's merge with
  b2a41a00); be63bdc2..c65f9cf2 touches no workflow, test, report.ts or run.ts. Same as the reviewers' be63bdc2 result.
- G4 other branches (79 co-001 refs; unmerged ones touching the 9 files or T6's producer files): clean merges with
  b2a41a00 for wip-pr42-integrate-3, ss-01-suspension-refusal (carries #42's report.ts/run.ts via f5bd6201: same 4
  stale citations, so S1's drift arrives from whichever of #42 or SS-01 lands first), dependabot-group-routing (ADR
  0066 Part 2 amendment at ~:731, no notice number, no collision with N32), packet-day-counts(-3) (ci.md +2),
  unmapped-plan, contract-phi-check-6. Conflicting ones (ledger-interest-once, suite-cap-1-triage-locks,
  contract-phi-check, pr-05b) are stale old-base branches, conflicts outside this PR's lines (to confirm vs bce57f16).
  main-dependabot-template is merged into main (#27); main has no workflows.
- G5 GITHUB_PATH / exportVariable / GITHUB_STATE: none in workflows or tools; only ci.yml:289 GITHUB_ENV.
- G6 action.yml expressions of the 12 pinned actions (fetched at their pins): defaults github.token/repository/
  run_id/workspace/server_url only; trivy-action and attest-build-provenance composites route inputs.* into env.
  All bounded today. T3 never reads them (workflows only): candidate nit (ADR/ci.md claim "every expression that
  reaches ... an input" is wider than the test).
- G7 ci-findings-transport (session_01FcouKQ3BjYKaME5uBLn8Lz; design done 17:47 UTC, waiting on #86): its design
  (designs/lane-b-ci/ci-findings-transport.md) is written against 83167b8f: ADR 0071 amendment text (:711) cites
  "ADR 0066, Part 3, N29" (at the merged head N29 is #82's Part 5 revert-path notice, ADR :1642); it rewrites "#86's
  :982-983" sentence (now :996-997 at b2a41a00); T6 rows/`over` field by 83167b8f lines; its re-read plan lists line
  numbers only, not the notice number; the #86 status file's "For ci-findings-transport" section names neither N32
  nor the fix round's T6 reshape (P6). CANDIDATE FINDING (interplay, hand-over).
  Transport's P4 (ci.md re-run clause "for #86's owner") concerns transport's own notify behaviour: noted only.
- G7 confirmed: transport's item prompt (lanes/lane-b-item-prompts-2026-11-01/ci-findings-transport.md) and status
  name no N32; design :15, :124, :711, :735, :801, :804-805, :910 all say N29 / #86 :982-983. FINDING (hand-over).
- G2 done: #42 job 122624309161 log (5,000 of 5,400 lines; both Metadata groups inside): web Metadata 132,377 bytes,
  body 95,324, worker 132,383; "Argument list too long" at both identity steps. ADR N32's numbers CONFIRMED.
- G8 #42's latest ci runs: be63bdc2 run 40651775903 and c65f9cf2 run 41335494512 conclusion failure, but
  41335494512's images job (124934331671) success; failure is `domain model` (approval), unrelated. The ported c2
  lines pass on #42's own run.
- G4 done: ledger-interest-once and suite-cap-1-triage-locks conflict in the same files against bce57f16 alone (stale
  bases; not caused by #86).
- G9 #82's images.ts:1185-1206 reads build-push-action `with:` only; env route (BUILDX_BUILDER etc.) is #82's domain,
  and `builder:` input isn't refused either: not #86's, dropped.
- G10 R1's A5/A7 record: the live body (body-2026-11-01-live-without-ruler.md :199, :207) already records R1's
  Metadata 162,422/162,428 bytes and the 124,840-character event; my read of job 122694617018 matches exactly. Not a gap.
- G11 local composites: #82's check-action-pins workflows.ts:100 refuses `uses: ./` (local actions), so T3/T5 cannot
  be bypassed through an in-repo composite. Third-party action.yml: #82's verify.ts:34-60 already parses each pin's
  inputs and composite steps (recursively) but applies no value rule -> F3's proposal.

## Findings (final)
- F1 (S) ci-findings-transport hand-over: N32, ADR lines, the fix round's T3/T6 reshape (G7).
- F2 (N) #42 is at c65f9cf2 (and wip-pr42-integrate-3 6c28d6a2); SS-01 efb20704 carries the same report.ts/run.ts
  shift; fix round's trials should use live heads (G1, G4, G8).
- F3 (N) T3's closed list stops at workflow text; pinned actions' action.yml expressions unread; ADR/ci.md claim wider
  than the test; proposal: apply T3's predicate in check-action-pins' verify.ts (G6, G11).
## DONE: clone /home/user/critic-imgdigest-1 and scratch action sources removed; nothing pushed or commented.
