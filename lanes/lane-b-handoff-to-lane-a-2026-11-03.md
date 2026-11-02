# Lane B's handoff back to Lane A (written early, 2026-11-02 ~02:15 UTC; refreshed before 2026-11-03 14:00 UTC)

From 2026-11-01 14:50 UTC Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) ran every Lane B item from Lane B's
account and, as **acting Lane A**, #42's last steps and the schema chain (`lanes/lane-a-handoff-to-lane-b.md` §4). Lane
A's account returns **2026-11-03 14:00 UTC** (15:00 UTC if its reset moved with the US clock change of 2026-11-01). From
then **Lane A takes back #42 and the schema chain at their current clean point** (sections 2 and 3), the counters
(section 6) and the new Lane A items (section 4). Lane B keeps its own items (section 5).

Lane B's account is at its **7-day limit's warning level** (every session reports `seven_day` `allowed_warning`, reset
Fri 2026-11-06 19:00 UTC). The co-founder's call, relayed to every session at 2026-11-02 02:07 UTC (the relay and the
status files stamp it 02:10): finish the near-done PRs economically, pause the rest at a clean point, no second wave,
keep budget for this handoff. So the acting-Lane-A sessions stop at their next clean point, not at a finished chain.
Before 14:00 UTC on 2026-11-03 Lane B's orchestrator refreshes this file (every head again, what merged, each acting
session's last clean point), has both acting sessions push any work as WIP refs, then stands them down and cancels their
check-ins. Lane A's account still has its own check-in at 2026-11-03 14:10 UTC (Lane A's 2026-11-01 18:00 UTC entry in
`lanes/lane-b.md`).

Read in this order: `CLAUDE.md` (on `claude/build-platform`), `LANES.md` (claims; "Handed to Lane A"; the merge rule
under the lapsed hold; rule 4's counters), this file, `lanes/lane-b.md` from "2026-11-01 14:50 UTC" on, then
`approval-summaries/lane-a-pr42-status.md` and `approval-summaries/lane-a-schema-chain-status.md`. Each is the item's own
handoff. Every head, PR and check below was read live (`git ls-remote origin`, the GitHub API, read-only) at ~02:15 UTC
on 2026-11-02 and re-checked at ~02:25 UTC, after #92 merged (02:14 UTC).

## 1. What merged on `claude/build-platform` since 83d71fd

Each merged as a merge commit after its fresh-clone verification, with every required check green.

| PR | What | Merge commit |
| --- | --- | --- |
| #82 | CI follow-up P1, ci-pin-age: action pins and image digests held to the three-day floor (ADR 0066 Part 5); 2026-11-01 17:19 UTC from 9db52a2b | bce57f16 |
| #83 | UX PR 4, the screening result reads on a phone and its rows say what they are; 2026-11-01 20:40 UTC from 71536c60, under the 20:36 UTC rule | 43565235 |
| #92 | UX PR 6, each sign-in step states its limit, warns before it closes, and starts again with the email kept (ADR 0081, SGN-01 to SGN-04, synth module 19); 2026-11-02 02:14 UTC from ab68af87, under the 20:36 UTC rule; no migration | 4eaf7124 |

The tip is **4eaf7124**. Push runs green: on bce57f16 ci 41330911483, mutation 41330911489, screening-capacity
41330911481, dry run 41330911485; on 43565235 ci 41348075952, mutation 41348076075, screening-capacity 41348076076. On
4eaf7124 ci 41376674140, mutation 41376674161 and screening-capacity 41376674163 were still running at ~02:25 UTC (the
refresh reads them).
Closed unmerged: Dependabot #33 (2026-11-01 14:03:52 UTC). No release tag exists.

## 2. #42 (PR 6b-4): verified, waiting only on the founder's commit

Run by **session_01FcouKMmYaqDNXbqJyagW8u** (acting Lane A; idle, review-ready; its own re-check at 06:08 UTC).
**Lane A takes it back at this clean point:** nothing half-done, nothing unpushed. If the founder commits before the
handover, that session runs the steps below and the refresh records where it stopped.

- **Head 6c28d6a2** (`co-001/pr-06b-mail-streams` = WIP `co-001/wip-pr42-integrate-3`): be63bdc2, then ed032539 (merge of
  83d71fd6, #78), 10db232c (the founder's 2026-11-01 legal sign-off recorded in ADR 0065 :56 and :246-248, ADR 0062
  :1551 and reconciliation-001 :647; no legal sentence changed; counsel's O4 stays open), c65f9cf2 (review fixes),
  6c28d6a2 (merge of bce57f16, #82). Draft; `mergeable_state` behind 43565235 (#83) and 4eaf7124 (#92): neither adds a
  migration, and a trial merge with 4eaf7124 is clean.
- **CI on 6c28d6a2:** 31 check runs, 28 success, `notify` skipped; `domain model` red only for the missing approval line
  (it prints `b23fed0e…2518`) and `all green` red only because of it. `mutation`, `screening-capacity gate`,
  `approval-of-record` and `images` green.
- **Local suite on 6c28d6a2:** green: unit 7,078 (1 skip), golden 376, oracle 687, test:db 9,499 (1 skip, restore-drill's
  pg_dump 16 vs 18), e2e 33+32, capacity S1 and S4 binding, actions:check, toolchain:check. Domain model SHA-256
  `b23fed0ec4fa9658a7751af0b6e58974acc64996343f8ae683d2149b495d2518`, approval line 7334, unchanged since be63bdc2.
- **Verification:** fresh-clone verification **pass** on 6c28d6a2 (2026-11-01 21:14 UTC); its adversarial check upheld it.
- **Description:** 64,998 characters (under 65,536), read back byte for byte (SHA-256 44b81511…): the domain-model summary
  whole at the top, every template section, "Legal text: signed off by the founder 2026-11-01, as written" pointing to
  `approval-summaries/pr6b4-review-record.md` §1 (113 quoted strings byte-identical), actions 1-7 whole, 8 done. The
  `images` comment, posted once: https://github.com/PureTideWater/PhysicalTherapy/pull/42#issuecomment-6563811925.
- **Suggested approval line:** posted 2026-11-01 21:13 UTC on 6c28d6a2, line 7334 of `docs/product/domain-model.md`, as
  one pull-request comment (`gh api .../pulls/42/comments`; no review):
  https://github.com/PureTideWater/PhysicalTherapy/pull/42#discussion_r4437376734 ("Approved by: Tyler Williams  Date:
  2026-11-01  Document SHA-256: `b23fed0e…2518`"). **The founder has not committed it** (head still 6c28d6a2 at 02:15
  UTC). Posted on 6c28d6a2 although #83 had merged: the line stays valid while the document's hash is unchanged.

Remaining steps, in order (the status file's "Next"):
1. The founder commits the suggestion on GitHub ("Commit suggestion", as on #39, 54ec8909). Push nothing until then.
2. Set up with `co-001/pr-06b-mail-streams:/home/user/pr6b4` (the `:dir` is needed); `git pull --ff-only`.
3. Merge the base (43565235 or later) with a merge commit **only if its delta has no migration and
   `pnpm -s db:domain-model --check --require-approval` still reads `b23fed0e…2518`**; otherwise the line is void:
   regenerate and post a new suggestion. Regenerate (`pnpm install`, `watched.ts --write`, `synth --all`; if #94 merged
   first, the lockfile and both app manifests are regenerated here). The checks the delta needs; push once.
4. CI green on that head, `domain model` and `all green` included (ruleset 25837331: `all green`, `mutation`,
   `screening-capacity gate`, `approval-of-record`, strict up to date).
5. Mark ready; wait for approval-of-record's re-run; `merge_pull_request` with method merge and `expectedHeadSha`.
6. Read the push runs; tell the schema chain, then the items waiting on #42 (status file, "Merge order and
   dependencies": ux-forms-after-42, UX PR 4b, P5 ci-catalog, release-content-checks' #42 parts, ci-browser's follow-up,
   UX-DLR-18, UX PRs 74-76, LANES.md queue items 15-16 and its "Not while #42 is open" list).
- Small, for Lane A (#42's file `tools/screening-capacity/run.ts`): the harness records commit `unknown` when the images
  directory is not a git checkout; it could read the build stamp.

## 3. The schema chain (SS-01, SUITE-CAP-1b, interest)

Run by **session_01FcouKQthXdmDnPmwhFepxW** (acting Lane A; running). The order is unchanged: #42, SS-01, 1b, interest,
each opening its PR only after the one before merges. No PR and no CI run exists on any chain branch. Both ledger freeze
exceptions stand (the founder, 2026-10-27 20:49 UTC). Every domain-model hash below is provisional until that PR's final
base merge. **Pacing (the session's decision on the co-founder's call, committed 02:08 UTC as 954b40a2; its status entry
is stamped 02:15):** wf_5566bd1c-8eb's script was
edited so each branch's full suite runs once, on the #42-merged tree; the two pre-PR fresh-clone verifiers were dropped
(each PR's own verification does that). Scripts: `workflow-scripts/lane-a-schema-chain-merge-build-wf_5566bd1c-8eb.js`,
`workflow-scripts/lane-a-schema-chain-pr42-into-ss01-wf_a12c973a-c12.js`; progress copies under
`approval-summaries/lane-a-wip/progress/`. A workflow resumes only in its own session: Lane A starts from origin's heads
and WIP refs.

- **SS-01** (`co-001/ss-01-suspension-refusal`; ADR 0080, BIL-07 to BIL-10):
  - Origin **bb13be1b** (= WIP `co-001/wip-ss01-chain`), pushed by wf_a12c973a-c12 between ~02:16 and ~02:23 UTC: #42's
    6c28d6a2 and 43565235 merged into efb20704; typecheck, lint 1,725, lint:copy, lint:logs, verify-content, fixtures,
    unit 7,160 and test:db shards 1-2 green. The workflow pushes after test:db shards 3-4, build and e2e (ports
    4991-4999); the status file does not yet record those results: read them there before building on bb13be1b.
  - Before it, **efb20704** (83d71fd6, then bce57f16 merged): all green (unit 7,125, test:db 4 shards, build, e2e 68,
    verify-content, synth 0 written); domain model `6559c5b9…c2fadc` at line 7413.
- **SUITE-CAP-1b** (`co-001/suite-cap-1-triage-locks`; ADR 0083 1b section, CAS-40, CAS-42):
  - Origin **ce408d2f** (SS-01 efb20704 merged): test:db 9,600 (1 skip); domain model `81d0ac76…` at line 7458. No WIP ref:
    the measurement gate is uncommitted in the session's `/home/user/sc1b`.
  - Gate measured: CAS-42.1 triage alone 61.5 s, live peak 160 MiB, 1 lock; CAS-42.2 together PASS (220 MiB < 420, 1 lock).
  - Running (wf_5566bd1c-8eb): the gate builder and the real-size route scout; then the integrator waits for SS-01 with
    #42 on origin, merges it, runs 1b's full suite once (CAS-42.5 and .6 excluded) and pushes.
- **Interest** (`co-001/ledger-interest-once`; ADR 0084, LED-23 to LED-25):
  - Origin **e0646746**: slices 1, 2, 3 and 5 on 358dc53f; domain model `3083defa…0d09` at line 7468, never checked.
  - WIP `co-001/wip-interest-chain` **c18a847e**: 1b's ce408d2f merged in. test:db shard 1 found 15 failures from the merge
    (1b's `streamed.db.test.ts` order phrase now `ORDER BY m.seq`; `ledger-world.ts`'s one-record interest match, which
    20261110090000 now skips): fixed, uncommitted, shards to re-run.
  - Running (wf_5566bd1c-8eb): builder W, slice 4 (the screens); then the interest integrator after 1b's: merges 1b's
    integrated head, full suite once, push.

Open problems:
- **1b's CAS-42.1 report alone took 481.3 s against its 180 s budget (FAIL);** a second report took 89 s. Suspected stale
  planner statistics right after triage; under investigation. SUITE-CAP-3's runs point the same way (realistic
  statistics made reconcile about 30% faster: section 4).
- **The flaky `tools/release/load.db.test.ts`** (test:db shard 1 on efb20704: `relallvisible` 0 vs 7 after VACUUM FREEZE;
  passed on re-run and alone 3 of 3; untouched by SS-01 and #82). Not investigated.
- **The 8-CPU runner is still the founder's** (section 7): CAS-42.5 and .6 stop as RUNNER_TOO_SMALL on 4 CPUs. As
  designed it blocks 1b's merge, not its PR or reviews.
- 1b's verifier's open item: CAS-42's `assertedBy` lacks `reconcile.large`.

Next, after #42 merges: SS-01 takes #42's merged tree and the base (domain model regenerated on a fresh database), its
draft PR, two reviews (security and tenancy; UX and brand with shots), the fix round, the fresh-clone verification, its
suggested approval line for the founder, the merge. Then 1b the same way (the runner question first), then interest.

## 4. New items handed to Lane A since 2026-11-01

Older items stand unchanged in LANES.md "Handed to Lane A" (6c's engine defects, #120's F3 and F4, #32's notice
migration as design §14 12c reads, SS-01's (a) to (j), the Cases page's waiting patterns, the renumbered reversal, the
capacity harness's link wait).

1. **#85 (UX PR 10) design §7.2, items 1-5**, each a new migration with its function file regenerated (LANES.md,
   2026-11-01): (1) `case_line_rules()` refuses a person's "Window passed" while the window is open or unknown; (2)
   `console_contract_queue()` leaves out response letters, with an index `payer_response (practice_id, document_id)`; (3)
   `payer_response_belongs()` applies the handler's letter check; (4) `contract_version_documents_ok()` refuses a letter a
   response names (3 and 4 take the `document_use:` lock key); (5) security: an upload-time link column on
   `source_document`, written only at insert, so a letter uploaded in the response form counts as the response's from
   upload. Status `approval-summaries/lane-b-ux-payer-response-status.md`.
2. **#84's migration for `tp-packet-verifier/3`**: `packet_verifier_report_valid` accepts `tp-packet-verifier/3` and
   `packet_version_current_verifier` requires it (the approval CHECK and format guard of migration 20261027090000 ~line
   336; the approval-request check of 20261024110000 ~line 102), then `VERIFIER_FORMAT = 'tp-packet-verifier/3'` in
   `packages/packets/src/format.ts`; with it, any Postgres-side part of the "Verifier passed" fix. Not needed for #84's
   merge (the code re-runs the verifier at request, approval, export and display). Status
   `approval-summaries/lane-b-packet-day-counts-status.md`; LANES.md "Handed to Lane A" gets it at Lane B's next records
   commit.
3. **SUITE-CAP-3's superlinear profile** (reconcile step 7b; states (a) the base, (b) plus `claim_by_superseded`, (c) plus
   1b's sections 3-6): 2,000 lines (a) 262.5 s, (b) 224.2 s, (c) 208.4 s; 6,000 lines (a) 1,653.3 s, (c) 1,486.4 s; 10,000
   lines (c) 3,412.1 s (5 times the lines, 16 times the time). Postings only: ~65 s at 2,000, 264.7 s at 6,000 (a). With
   realistic planner statistics: 2,000 (c) 143.8 s, 6,000 (c) 1,035.3 s. Terms: cached trigger plans made on empty tables,
   and the worker's per-line reads (`claimLines`, `byControl`, `byPatient`, settle, one-row stage inserts). For 1b: its
   gate and real-size runs should expect it until SUITE-CAP-3 lands. Figures in
   `approval-summaries/lane-b-suite-cap-3-wip/`; any index or table its design needs comes to Lane A with its DDL.
4. **The flaky `tools/release/load.db.test.ts`** (section 3; LANES.md 2026-11-01 20:05 UTC (b)).
5. **From the other status files:**
   - #93 (UX PR 9) F9: a fifth `roi_links_valid()` key, `actionable_open_lines`, so a stored statement's actionable figure
     can be recomputed (a migration). Its open question 3 (UX PR 11): should the stored `case.actionable_cents` hold the
     live figure (`ACTIONABLE_NOW`)? `approval-summaries/lane-b-ux-home-figures-status.md`.
   - #92 (UX PR 6, merged as 4eaf7124): the stale "three days" comment in `infra/lib/constructs/identity.ts`
     (INVITATION_DAYS is 7), a #42 file; a staging check of AssociateSoftwareToken's session; the 15-minute Cognito
     session and the pending cookie's length (`identity.ts`, `infra/test/identity.test.ts`) belong to UX PR 66 (infra,
     Lane A). `approval-summaries/lane-b-ux-sign-in-time-status.md`.
   - FYI, stays with Lane B: the base's redaction gap in `packages/model-gateway/src/redact.ts` (a year below 100 read as
     a date; numbers joined by `_`, `|`, `\`, apostrophes and other joiners never matched) is fixed inside #75.

## 5. Lane B's open PRs and items (02:15 UTC; re-checked ~02:25 UTC)

"Finish" is the co-founder's list (relayed 02:07 UTC); "paused" waits at a clean point for the 7-day reset (2026-11-06
19:00 UTC).

- **#75** contract-phi-check (session_01FcouKPAcRv6FTuHCMKAre2): origin 871faff9 (`dirty`, no CI); WIP
  `co-001/wip-contract-phi-check-8` 49156dd8 (base 43565235 merged as fe9c8da8; fixes 4, 4b, 1677792a, 49156dd8), suite
  green through test:db; mutation, build, e2e, shots and the critic, then one push, description, verification 2, merge. Finish.
- **#84** packet day counts (session_01FcouKQVq7K3Np8pwNtDhew): origin e3299ea2 (behind; `mutation` red: `stryker
  (packets-words)` cancelled at 30 min); fix round wf_4be9898c-37f on WIP `-2` bf849464, Stryker split backup `-4`
  081a8034. Merges after #75 and #85 (resolves ADR 0054 and #85's rows). Finish.
- **#85** UX PR 10 (session_01FcouKNxBLBBy2FVM7bfSvj): a97d6011, CI green, behind (lacks bce57f16, 43565235 and
  4eaf7124); verified and ready 2026-11-01 21:59 UTC; waits for #75 only. Finish.
- **#86** ci-images-digest (session_01FcouKN1UjKZTWt4U9bZjyW): origin 83167b8f (`dirty`); fix round built on WIP
  `co-001/wip-ci-images-digest` d257fe6d (43565235 in, D1-D10); verifiers, full suite, trial merges, one push (R3),
  verification, merge. Finish. P2, #91 and ci-findings-transport wait for it.
- **#90** Dependabot A, SDK 1.3.0 (session_01FcouKRD17iBBR4HhnYcQQx): 06f79c07, CI green, behind; fix round
  wf_416e36ca-397 (18 findings applied; WIP `co-001/wip-dependabot-batch-a` 442d7a81, 01:10 UTC: 950e8ca8 plus four
  checker fixes, N1 and N6 to N8); suite, one push, verification. Finish.
- **#91** Dependabot C, group routing (same session): 651f8b80, CI green but a cancelled approval-of-record re-run,
  behind; reviews round 2 (wf_91a35eba-252); waits for #86, deadline guard 2026-11-04 12:00 UTC. Finish.
- **#92** UX PR 6, sign-in time (session_01FcouKNxVRK8x6iV52PfxXz): **merged** 2026-11-02 02:14 UTC as 4eaf7124 (section
  1) after its fresh-clone verification (wf_1b56253c-138) with CI green on ab68af87; item done, no follow-on.
- **#93** UX PR 9, home figures (session_01FcouKPLmdYyBmbVaUjag2c): fix round wf_768311e7-b88 done and pushed as
  30c055c9 (the fourth review round's findings fixed; full local suite green once); #92's merge then conflicted it
  (test-matrix, synth `common.ts`, `matrix.ts`, `registry.ts`, `expected/types.ts`), so 4eaf7124 was merged in as
  **d1e4c4c4** (02:16 UTC), CI running (`blocked` until green). WIP `co-001/wip-ux-home-figures` 27a848c1 is superseded.
  Next: the fresh-clone verification on the final head, then the merge. Finish.
- **#94** Dependabot B, aws-cdk and minor-and-patch (dependabot session): 484e9f06, CI green, behind since #92 merged
  (4eaf7124 merges clean); reviews round 2; its description does not yet record O9 (the 01:02 UTC ruling: record it as a
  launch item with a link to #41); merges on green. Pairs: #42 (manifests, lockfile), #91 (runbook). Finish.
- **#95** #32, one unmapped plan (session_01FcouKNB2TyuPCAha9BaEjQ): 8517ee3a, CI green, behind; reviews done (01:50 UTC);
  fix round running. Finish; #48 (narrative draft) after it is a follow-on, paused.
- **P2** ci-trivy-version (session_01FcouKNP2XtaombFLueKLnu): design re-read done (e71571bf); no branch on origin; waits
  for #86. Paused.
- **P4** ci-mutation-trigger, **draft #96** (same session): 50029e64, built, local checks green (409 files, 6,984 + 1); CI
  running. Paused before its reviews (resume wf_f8ce3582-ddc in that session).
- **ci-findings-transport** (session_01FcouKQ3BjYKaME5uBLn8Lz): built on WIP `co-001/wip-ci-findings-transport` b9a83bd3
  (cut from #86's d257fe6d; tests green). Paused before its reviews; its PR after #86 merges.
- **redact-ssn-phone** (session_01FcouKP1U2GGDFhhZT9CaUV): design done (22 findings; ADR 0054 amended, ADR 0070 N6;
  MOD-15, MOD-16); no branch on origin; builds after #75 merges. Paused.
- **SUITE-CAP-3** (session_01FcouKP4ekrT97eyDtLe4Rd): design workflow wf_4bc31523-700; the profile is complete (01:30
  UTC; committed to build-ops as 4fab56f6) and its design stage is still running (candidate fixes probed in a scratch
  clone, `approval-summaries/lane-b-suite-cap-3-wip/cap3-design.md`); `co-001/suite-cap-3-reconcile` = 83d71fd6 (no
  commits). Pauses when that stage ends.
- **UX PR 4b** (session_01FcouKRDfoFAeXZK4Thp8M8): starts after #42 merges. Paused.
- Not started: UX PR 7, UX PR 8 (ADR 0090, SGN-09 to SGN-12), ux-forms-after-42, P5 ci-catalog, #46 Verified seal. The
  bot PRs #87, #88 and #89 stay untouched until #90 and #94 merge, then close with a comment.

## 6. Rulings made by Lane B's orchestrator

- **2026-11-01 18:00 UTC, Dependabot:** PR C (`co-001/dependabot-group-routing`, amends CI-12) claimed. C merges after #86
  (both amend ADR 0066), never ahead of a PR already green and waiting; deadline guard: if #86 has not merged by
  2026-11-04 12:00 UTC, C merges anyway (ADR 0066 kept both), before Dependabot's 2026-11-05 04:31 UTC run. A, B and C
  may merge while #42 waits on the founder.
- **18:30 UTC:** the base's `redact.ts` year gap (found by #83's suite) is fixed inside #75, which owns `redact.ts`.
- **20:36 UTC, the merge rule** (in place of the lapsed hold and §6's order; broadcast wf_0d9195c0-5f7): a verified,
  green PR merges as soon as it is ready; the order applies only between PRs that conflict (the one merged second
  resolves). Pairs: #86/P2, #86/#91, #75/#85, #75/#84, #85/#84, #94/#91, #42/#94, #90/#94.
- **21:02 and 21:33 UTC, ADR 0066 numbering:** #86 notice N32; P2 notices N33 to N42, proposals P38 to P42; P4 notices
  from N43, proposals P29 to P37, P43, P44.
- **21:59 UTC:** #85 waits for #75 only; #84 resolves #85's test-matrix and registry rows at its own base merge.
- **2026-11-02 01:02 UTC:** O9 (the consumer's size, issue #41) is a launch blocker, not a merge blocker; #94 records it
  and merges on green.
- **02:11 UTC:** P4 keeps its `workflows.test.ts` edit (its mutation block only; disjoint from #42; rule 6).
- Acting Lane A, recorded in the status files: #42 merged #82 before its description, verification and line (18:16 UTC);
  the line went on 6c28d6a2 although #83 had merged (posted 21:13 UTC); the schema chain runs one full suite per branch
  (954b40a2, 02:08 UTC).
- The co-founder's own calls: "go wide" (under 20% weekly, ~14:40 UTC); "No need to ask for approvals just make sure
  things are optimized" and ultracode in every session (~16:50 UTC); the pacing call (relayed 2026-11-02 02:07 UTC).
- **Counters:** allocated 14:50 UTC (ADR 0089 and MOD-17, MOD-18 to the Dependabot batch; ADR 0090 and SGN-09 to SGN-12
  to UX PR 8; CI-30, CI-31 to ci-findings-transport); released 18:00 UTC (ADR 0088, ADR 0089, synth module 21, CI-30,
  CI-31; MOD-17, MOD-18 used). **Next free** (LANES.md rule 4; ADR numbers checked on the base and every origin branch):
  **ADR 0088**, then 0089, then 0091 (0090 reserved for UX PR 8); **synth module 21**; **fixture release 900008**;
  test-matrix CAS-52, MOD-19, LED-26, BIL-11, CI-30, MAP-11, PRC-32, SGN-13, HOM-05, TBL-09, DLR-05, SEC-20, SCR-23,
  JOB-06, FRM-09, RCC-09, DBF-06. Lane A allocates them again from its return.

## 7. Founder items waiting

1. **Commit #42's suggested approval line:** https://github.com/PureTideWater/PhysicalTherapy/pull/42#discussion_r4437376734.
   It gates the whole schema chain. Then each schema PR's line in turn (SS-01, 1b, interest), each posted as a suggested
   change when its PR is verified.
2. **The 8-CPU runner,** through a move of the repository to a GitHub organization on Team (larger runners; also a merge
   queue and a private repository). Owner-admin and cost. Blocks 1b's merge as designed (CAS-42.5 and .6) and SUITE-CAP-3's
   full-size proof.
3. **#42's launch actions 2-7** (`approval-summaries/lane-a-wip/pr42-body-drafts/body-actions.md`; #42's description): a
   second AWS account per environment; phase 1, DNS, phase 2; SES production access; Postmaster, SNDS and DMARC; staging's
   checks and the AWS prices; the consumer's size. They block the screening's launch, not the merge. Counsel reads the
   signed-off legal text (O4) before the screening opens.
4. **Runbook 3i,** the build's own GitHub account, and `APPROVAL_REVIEW_REQUIRED`: until then ordinary PRs merge on green
   checks after the fresh-clone verification. Recommended before launch.
5. **O9, issue #41 (open):** S4's middle run against the 44 s sizing line: 45.6 s (local, #42), 55.1 s (CI, #42), 52.3 s
   (bce57f16), 37.1 s (43565235), on the same consumer code: runner noise. A launch blocker only.
6. **The moderate Dependabot alert** on the default branch:
   https://github.com/PureTideWater/PhysicalTherapy/security/dependabot/1. The build gets 403 on alerts; a person reads it.
   Does not block.
7. **Usage (cost):** overage is disabled at the organization level, so the 5-hour window and the 7-day cap stop sessions
   outright (429); Lane B's 7-day cap is at its warning level until 2026-11-06 19:00 UTC.
- Recorded, not blocking: #85 design 8.2 (may a line at Payer approved or Recovered be written off, and with which
  reasons); #75's F1 (per-field recall and precision floors) and F2 (the data-rights addendum and evaluation examples);
  Stripe's webhook API version; a credentialed `cdk:diff` on staging; a real-model evaluation on the Anthropic path.

## 8. What cost time, so it does not cost Lane A's

- **The 5-hour 429s.** The window stopped every session twice on 2026-11-01 (~18:35-19:10 UTC, 7 of 15 left FAILED;
  ~22:00-00:10 UTC), although the plan was said to have no hourly limits; with overage disabled at the organization level
  the stop is a hard 429. Each session resumed from its progress file (setup re-run: PostgreSQL is down after a worker
  restart; `resumeFromRunId` in the same session only). Fifteen parallel sessions then reached the 7-day warning in about
  nine hours (16:57 to ~02:05 UTC): the token window, not the number of sessions, sets throughput. Keep WIP refs pushed before every heavy stage.
- **Sessions refuse a relayed go-ahead.** #86 and #83 waited at turn 1 for a go "in your own words"; a quoted message of
  the co-founder did not count; they started when he typed it in each session (~17:25 UTC). Plan for the person to do so.
- **`subscribe_pr_activity` was held by old sessions.** Lane A's stopped sessions held every PR's subscription until Lane
  A archived them (2026-11-01 18:00 UTC); Lane B's sessions polled with `pull_request_read` and `send_later` instead. At
  this handover Lane B's acting sessions stand down and are archived, so Lane A's sessions can subscribe.
- **Node v24.22.1 in the base image.** `tools/setup-container.sh` failed on the image's own `/opt/node24` (v24.22.1, pinned
  v24.22.0); fixed in e92795ee on `claude/build-ops` (it moves the image's copy aside and installs the pinned version).
- **Base-merge churn.** Every base move costs each open PR a merge round (#42 merged #78, then #82; #75 is on its fifth).
  The 20:36 UTC rule (merge when verified and green; order only between conflicting pairs) let #83 merge at once. Merge the
  base once, right before a PR's merge; a schema PR waits on the founder at a head whose base delta has no migration.

## 9. The message that starts Lane A's session

> ultracode. You are Lane A of the PaidWhole build, back from 2026-11-03 14:00 UTC (15:00 UTC if the reset moved with the
> US clock change). From 2026-11-01 14:50 UTC Lane B's account ran #42's last steps and the schema chain as acting Lane
> A. First ask the founder for this account's weekly usage and reset time (LANES.md rule 9). Read CLAUDE.md, LANES.md,
> `lanes/lane-b-handoff-to-lane-a-2026-11-03.md`, `lanes/lane-b.md` from 2026-11-01 14:50 UTC,
> `approval-summaries/lane-a-pr42-status.md` and `approval-summaries/lane-a-schema-chain-status.md`, then check every
> head live (`git ls-remote origin`, #42 and its comment r4437376734). Take back #42 (handoff section 2) in a session of
> its own and the schema chain (section 3) in another, each from origin's heads and WIP refs at the clean point the
> handoff names; do not message Lane B's sessions. Add section 4's items to Lane A's queue, take back the counters
> (section 6), mark LANES.md's #42, SS-01, SUITE-CAP-1b and interest rows "A", and write your entries in HANDOFF.md. One
> schema PR at a time; the founder's decisions stay the founder's.
