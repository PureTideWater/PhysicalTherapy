# Lane B's handoff back to Lane A (written early, 2026-11-02 ~02:15 UTC; state as of 2026-11-02 09:25 UTC; refreshed again before 2026-11-03 14:00 UTC)

From 2026-11-01 14:50 UTC Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) ran every Lane B item from Lane B's
account and, as **acting Lane A**, #42's last steps and the schema chain (`lanes/lane-a-handoff-to-lane-b.md` §4). Lane
A's account returns **2026-11-03 14:00 UTC** (15:00 UTC if its reset moved with the US clock change of 2026-11-01). #42
merged on 2026-11-02 (section 2). From then **Lane A takes back the schema chain at its current clean point** (section
3), the counters (section 6) and the new Lane A items (section 4). Lane B keeps its own items (section 5).

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
handoff. Every head, PR and check below was read live (`git ls-remote origin`, the GitHub API, read-only): **state as of
2026-11-02 09:25 UTC** (first written ~02:15 UTC).

## 1. What merged on `claude/build-platform` since 83d71fd

Each merged as a merge commit after its fresh-clone verification, with every required check green.

| PR | What | Merge commit |
| --- | --- | --- |
| #82 | CI follow-up P1, ci-pin-age: action pins and image digests held to the three-day floor (ADR 0066 Part 5); 2026-11-01 17:19 UTC from 9db52a2b | bce57f16 |
| #83 | UX PR 4, the screening result reads on a phone and its rows say what they are; 2026-11-01 20:40 UTC from 71536c60, under the 20:36 UTC rule | 43565235 |
| #92 | UX PR 6, each sign-in step states its limit, warns before it closes, and starts again with the email kept (ADR 0081, SGN-01 to SGN-04, synth module 19); 2026-11-02 02:14 UTC from ab68af87, under the 20:36 UTC rule; no migration | 4eaf7124 |
| #93 | UX PR 9, one actionable figure on the home and the ROI statement; the Recovered tile names its period (ADR 0082); 2026-11-02 02:42 UTC from d1e4c4c4; no migration | 877e662f |
| #90 | Dependabot PR A, the Anthropic SDK 1.3.0 with its tracing, propagation and logging off (replaces Dependabot #87; ADR 0048, MOD-17, MOD-18); 2026-11-02 04:00 UTC from cf124313; no migration | 88708069 |
| #42 | PR 6b-4, mail streams, delivery recording and the screening cut-off (audit #76; ADR 0065; migration 20261107090000); 2026-11-02 07:35 UTC from 9bb0604e, with the founder's approval line 9426a8d1 (`b23fed0e…2518`) | 22789493 |
| #95 | #32, one unmapped plan no longer freezes a whole month (ADR 0075; MAP-06 to MAP-09, PRC-29 to PRC-31); 2026-11-02 08:47 UTC from 48dabc28; no migration | 2affb854 |

The tip is **2affb854**. Push runs green: on bce57f16 ci 41330911483, mutation 41330911489, screening-capacity
41330911481, dry run 41330911485; on 43565235 ci 41348075952, mutation 41348076075, screening-capacity 41348076076; on
4eaf7124 ci 41376674140 (second attempt), mutation 41376674161, screening-capacity 41376674163; on 877e662f ci
41379177645, mutation 41379177616, screening-capacity 41379177620; on 22789493 ci 41407227669, mutation 41407227619,
screening-capacity 41407227658; on 2affb854 ci 41415623536, mutation 41415623512, screening-capacity 41415623520. On
88708069 ci 41386010790 was red in `unit` only: FRM-01 (`action-form.browser.test.tsx` :366) timed out, a flake
root-caused at 06:22 UTC and fixed by Lane B's PR D (section 5); mutation 41386010949 and screening-capacity 41386010778
green.
Closed unmerged: Dependabot #33 (2026-11-01 14:03:52 UTC); #87 (closed with a comment when #90 merged, 2026-11-02 04:00
UTC); #88 and #89 (closed by Dependabot at 04:10 and 04:07 UTC after #90 merged); #97 (opened 04:10 UTC, closed by
Dependabot at 07:42 UTC after #42 merged). No release tag exists.

## 2. #42 (PR 6b-4): merged as 22789493

Run by **session_01FcouKMmYaqDNXbqJyagW8u** (acting Lane A); done, no follow-on. Nothing of #42 is left for Lane A to take
back but the follow-ups below.

- **The founder's approval:** committed on GitHub as **9426a8d1** (2026-11-02 02:36 UTC), the suggested line unchanged:
  "Approved by: Tyler Williams  Date: 2026-11-01  Document SHA-256: `b23fed0e…2518`"
  (https://github.com/PureTideWater/PhysicalTherapy/pull/42#discussion_r4437376734).
- **Final round** (wf_447524bf-bd7): 88708069 (#83, #92, #93, #90; no migration in the delta) merged in as **9bb0604e**;
  the generators wrote nothing; local checks green (typecheck, lint, unit 7,198, the delta's test:db files, build,
  capacity S1 and S4); `pnpm db:domain-model --check --require-approval` exit 0 on `b23fed0e…2518`. CI on 9bb0604e: all
  25 jobs green (`notify` skipped), `domain model`, `all green`, `mutation`, `screening-capacity gate`,
  `approval-of-record` and `images` included. Fresh-clone verification pass; the description refreshed (65,019
  characters, read back byte for byte).
- **Merged** 2026-11-02 07:35 UTC with method merge and expectedHeadSha 9bb0604e: **22789493**. Push runs green (section
  1). Record: `approval-summaries/lane-a-pr42-status.md`; progress `approval-summaries/lane-a-wip/progress/pr42{g,h,i}-*.md`.
- **What waited on #42** is unblocked: ux-forms-after-42, UX PR 4b, P5 ci-catalog, release-content-checks' #42 parts,
  ci-browser's follow-up, UX-DLR-18, UX PRs 74-76 (`tables.test.ts`'s removedBy), LANES.md queue items 15-16 and its
  "Not while #42 is open" list. Lane B's of these (UX PR 4b, ux-forms-after-42, P5 ci-catalog, the `help.ts` proposals)
  stay paused until its 7-day reset.
- Small, for Lane A (#42's file `tools/screening-capacity/run.ts`): the harness records commit `unknown` when the images
  directory is not a git checkout; it could read the build stamp.
- For the founder, blocking the screening's launch, not code: #42's launch actions 2-7, counsel's reading of the
  signed-off legal text (O4) and O9 (section 7).

## 3. The schema chain (SS-01, SUITE-CAP-1b, interest)

Run by **session_01FcouKQthXdmDnPmwhFepxW** (acting Lane A; running). The order is unchanged: SS-01, 1b, interest, each
opening its PR only after the one before merges. #42 merged (22789493), so **SS-01's PR is the only schema PR to open
next**; no chain PR exists yet. Both ledger freeze exceptions stand (the founder, 2026-10-27 20:49 UTC). Every
domain-model hash below is provisional until that PR's final base merge. **Pacing** (the session's decision on the
co-founder's call, 954b40a2, 02:08 UTC): each branch's full suite runs once, on its final tree; each PR's own
verification is the fresh-clone check. Scripts: `workflow-scripts/lane-a-*`; progress copies under
`approval-summaries/lane-a-wip/progress/`; results `approval-summaries/lane-a-schema-chain-*-result.json`. A workflow
resumes only in its own session: Lane A starts from origin's heads and WIP refs.

- **SS-01** (`co-001/ss-01-suspension-refusal`; ADR 0080, BIL-07 to BIL-10): **its PR stage runs** (wf_78cd4c88-7b1,
  `workflow-scripts/lane-a-ss01-pr-stage-wf_78cd4c88-7b1.js`, from 07:40 UTC):
  - the base 22789493 merged into bb13be1b (SS-01's recreated objects re-read on #42's merged bodies; regenerated; delta
    checks; push); the draft PR into `claude/build-platform`, its description headed by `pnpm db:domain-model
    --summary-since origin/claude/build-platform --function-diffs list`, whole, with every template section, under 65,536
    characters; two adversarial reviews in fresh clones (security and tenant isolation; UX and brand with 1280/390 light
    and 1280 dark shots), each finding checked by a skeptic; the fix round with the full local suite once and one push;
    the fresh-clone verification reading CI; then the suggested approval line as one pull-request comment.
  - At 09:25 UTC origin is still **bb13be1b** (= WIP `co-001/wip-ss01-chain`: #42's 6c28d6a2 and 43565235 in; migration
    20261108090000; unit 7,160, test:db 9,567 + 1, e2e 69; domain model `3922b6a6…f019` at line 7414, provisional) and no
    PR is open. The base has since moved to 2affb854 (#95, no migration).
  - Taking it back mid-stage: read the status file's latest entry and origin's head first; work a stage had not pushed
    exists only in the session's worktree `/home/user/ss01`.
- **SUITE-CAP-1b** (`co-001/suite-cap-1-triage-locks`; ADR 0083 1b section, CAS-40, CAS-42): origin **048bc843** (SS-01
  bb13be1b with #42's 6c28d6a2 and 43565235 in; the measurement gate, CAS-42.1 and .2, SLOW_FIRST, ADR 0083's 1b
  section; its full suite once, green: unit 7,188, test:db 9,608 + 1, e2e 69, Stryker; domain model `e024cf9f…efc4df` at
  line 7459, provisional).
  - **No 8-CPU runner is needed** (the ask withdrawn 06:22 UTC): the `--small` smoke at 048bc843 passed on 4 CPUs
    (`requiredCpus` = 4), and runs 40479127979 and 40584379787 reached FULL_SIZE verdicts on GitHub's free 4-CPU runner.
    At 1b's PR stage, on its final head: CAS-42.5 by dispatching `release-capacity.yml` on 1b's branch; CAS-42.6 by the
    local process route (`approval-summaries/lane-a-wip/progress/rc-smoke.md`).
  - **CAS-42.1 fails at 048bc843** (found ~09:20 UTC): the report 730-750 s against its 180 s budget, nearly all of it the
    report lines' fetch (95.8 s in 1b's integrator run); its plan depends on whether autovacuum's ANALYZE lands after
    triage. **Running: wf_3118d5d7-edb** (`workflow-scripts/lane-a-sc1b-report-plan-fix-wf_3118d5d7-edb.js`) in
    `/home/user/sc1b`: a plan-independent fix (the query's shape first), proven by three runs and one with autovacuum
    off, narrow checks, one push; a skeptic re-runs it. 1b's full suite runs once in its PR fix round.
- **Interest** (`co-001/ledger-interest-once`; ADR 0084, LED-23 to LED-25): at its clean point, origin **74a6b290**
  (wf_3c4cf5ac-af0, ~09:20 UTC; `approval-summaries/lane-a-schema-chain-wf_3c4cf5ac-af0-result.json`): 379fed9f merged
  1b's 048bc843; builder W's slice 4, the screens (d37a0ee3); the integrator's fix 74a6b290 (a take-back is capped at
  the line's whole interest as well as the chain's, so two chains on one line after a specialist's correction cannot
  trip `ledger_interest_line_floor`; failing-first test). Its one full suite is green but for 1b's CAS-42.1 (unit 7,275,
  golden 376, oracle 712, test:db shards 2-4, shard 1 3,334 + 1 failed; e2e 71; Stryker `interest.ts` 100%); domain
  model `47887070…eb8ef` at line 7469, provisional. Open at its PR: ADR 0084 D5's sentence on the line-whole cap, and
  its UX review.

Open problems:
- 1b's CAS-42.1 (above; its fix running).
- **The flaky `tools/release/load.db.test.ts`** (test:db shard 1 on efb20704: `relallvisible` 0 vs 7 after VACUUM FREEZE;
  passed on re-run and alone 3 of 3; untouched by SS-01 and #82). Not investigated.
- 1b's verifier's open item: CAS-42's `assertedBy` lacks `reconcile.large`.

Next: SS-01's reviews, fix round, verification and suggested approval line; the founder commits it; SS-01 merges. Then
1b the same way (CAS-42.5 and .6 at its PR stage), then interest.

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
   `approval-summaries/lane-b-packet-day-counts-status.md`; LANES.md "Handed to Lane A", 2026-11-02 02:35 UTC.
3. **SUITE-CAP-3's superlinear profile** (reconcile step 7b; states (a) the base, (b) plus `claim_by_superseded`, (c) plus
   1b's sections 3-6): 2,000 lines (a) 262.5 s, (b) 224.2 s, (c) 208.4 s; 6,000 lines (a) 1,653.3 s, (c) 1,486.4 s; 10,000
   lines (c) 3,412.1 s (5 times the lines, 16 times the time). Postings only: ~65 s at 2,000, 264.7 s at 6,000 (a). With
   realistic planner statistics: 2,000 (c) 143.8 s, 6,000 (c) 1,035.3 s. Terms: cached trigger plans made on empty tables,
   and the worker's per-line reads (`claimLines`, `byControl`, `byPatient`, settle, one-row stage inserts). For 1b: its
   gate and real-size runs should expect it until SUITE-CAP-3 lands. Figures in
   `approval-summaries/lane-b-suite-cap-3-wip/`; any index or table its design needs comes to Lane A with its DDL.
4. **The flaky `tools/release/load.db.test.ts`** (section 3; LANES.md 2026-11-01 20:05 UTC (b)). The other two flaky
   tests of LANES.md 2026-11-02 06:20 UTC (b), FRM-01 and `csv-arena.test.ts:151`, are fixed by Lane B's PR D (section 5).
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
6. **SUITE-CAP-3's `ledger_line_net` rewrite** (LANES.md "Handed to Lane A", 2026-11-02 06:20 UTC (a)): at 10,000 lines
   reconcile goes 1,058 -> 263 s on top of its paused design's own fixes (3,412 -> 1,058 s); DDL in its design's §14.1;
   it needs a founder ledger-freeze exception.

## 5. Lane B's open PRs and items (state as of 09:25 UTC)

"Finish" is the co-founder's list (relayed 02:07 UTC); "paused" waits at a clean point for the 7-day reset (2026-11-06
19:00 UTC). Open PRs on GitHub at 09:25 UTC: #75, #84, #85, #86, #91, #94 and #96 (all drafts, each `behind` or `dirty`
against 2affb854), and Dependabot's #98.

- **#75** contract-phi-check (session_01FcouKPAcRv6FTuHCMKAre2): origin 871faff9 (`dirty`, no CI). Check round 2 fixed G1
  to G4 in `redact.ts` (d2a609fd), merged #92 (b81429f4) and 88708069 (**315ac91e**, WIP
  `co-001/wip-contract-phi-check-9`); the suite green there through test:db (unit 7,155, golden 381, oracle 688, eval
  300/300). Resumed 06:22 UTC (wf_51ee625f-c33): mutation, e2e, critic 2, then one push, the description, verification
  2, the merge. The base has moved since (22789493 with #42's migration; 2affb854). Finish.
- **#84** packet day counts (session_01FcouKQVq7K3Np8pwNtDhew): origin e3299ea2 (`behind`; `mutation` red there: `stryker
  (packets-words)` cancelled at 30 min). Fix round wf_4be9898c-37f: the Stryker split done (17 shards; snapshot
  `co-001/wip-packet-day-counts-5` 15d8ed1c); a base-merge step (88708069 or later; a `test-support/browser.ts`
  conflict) before the one full suite and the re-reviews; then one push, the verification. Merges after #75 (resolves
  ADR 0054 and #85's rows). Finish.
- **#85** UX PR 10 (session_01FcouKNxBLBBy2FVM7bfSvj): a97d6011, verified and ready (2026-11-01 21:59 UTC), `behind`;
  waits for #75 only. Its one base merge after #75 runs `pnpm install` (#90's lockfile), re-checks the route database
  tests on #42's schema and resolves #93's `display.test.tsx`. Finish.
- **#86** ci-images-digest (session_01FcouKN1UjKZTWt4U9bZjyW): origin 83167b8f (`dirty`). Fix round wf_401c564d-6b7:
  check round 1 found two loosenings, repair 1 fixed them (a5bc1170); the later rounds re-check only the open
  dispositions and the whole diff, their repairs on WIP `co-001/wip-ci-images-digest` (**5c01f150**, 09:18 UTC). Then
  the base (88708069 or later), the suite once, one push (R3), the verification, the merge. Finish. P2 and
  ci-findings-transport wait for it; #91 no longer does.
- **#90** Dependabot A: **merged** 2026-11-02 04:00 UTC as 88708069 (section 1).
- **#91** Dependabot C, group routing (session_01FcouKRD17iBBR4HhnYcQQx): origin 651f8b80, `behind`. Fix round done
  locally (**b1fd5df1**, WIP `co-001/wip-dependabot-batch-c`; full suite once, green); merge prep wf_194e8aaf-799 (base
  merge, description, one push, CI, verification). **No longer waits for #86** (the 08:52 UTC ruling; the 2026-11-04
  guard is moot): it merges when verified and green. Finish.
- **#92** UX PR 6 and **#93** UX PR 9: **merged** (section 1); their sessions stopped, no follow-on.
- **#94** Dependabot B, aws-cdk and minor-and-patch (same session): origin 484e9f06, `behind`. Fix round in its suite
  (WIP `co-001/wip-dependabot-batch-b` **f43f809d**, 88708069 in; e2e green, Stryker next); then merge prep with B(6):
  #42's three AWS SDK ranges (web `client-sesv2`, `client-sts`; worker `client-sqs`) to ^3.1160.0, the manifests and
  lockfile regenerated, the synth comparison redone with #42's stacks. O9 recorded as a launch item (issue #41). Merges
  on green; #88 and #89 get a comment then. Finish.
- **PR D** test-flakes-2 (same session; ruling 06:22 UTC): `co-001/test-flakes-2` on origin at 88708069 (no commits yet),
  tests only: FRM-01's monotonic wait (`action-form.browser.test.tsx` :366; the exact data-shown wait raced a deliberate
  re-key ~35-50 ms later, 1 in 48 CI runs) and an explicit timeout for `csv-arena.test.ts:151` (CAS-41.3). Design inputs
  `designs/lane-b-dependabot-batch/test-flakes-2-*.md`; it builds after B's and C's suites and merges when verified and
  green. Finish.
- **#95** #32 (session_01FcouKNB2TyuPCAha9BaEjQ): **merged** 08:47 UTC as 2affb854 (section 1); item done. #48 (narrative
  draft; ADR 0076, CAS-35 to CAS-37 reserved) not started: paused.
- **#98** Dependabot (minor-and-patch, 18 updates; opened 07:45 UTC, replacing #97): left, like #97, to the next weekly
  triage (pacing). Never merged as it stands.
- **P2** ci-trivy-version (session_01FcouKNP2XtaombFLueKLnu): design re-read done (e71571bf); no branch on origin; waits
  for #86. Paused.
- **P4** ci-mutation-trigger, **draft #96** (same session): 50029e64, built, local checks green; paused before its
  reviews (resume wf_f8ce3582-ddc in that session).
- **ci-findings-transport** (session_01FcouKQ3BjYKaME5uBLn8Lz): built on WIP `co-001/wip-ci-findings-transport` b9a83bd3
  (cut from #86's d257fe6d; tests green). Paused before its reviews; its PR after #86 merges.
- **redact-ssn-phone** (session_01FcouKP1U2GGDFhhZT9CaUV): design done (22 findings; ADR 0054 amended, ADR 0070 N6;
  MOD-15, MOD-16); no branch on origin; builds after #75 merges. Paused.
- **SUITE-CAP-3** (session_01FcouKP4ekrT97eyDtLe4Rd): paused after design (67159eaf; WIP `co-001/wip-suite-cap-3`
  956b32ef; ADR 0087 needed). Probed: 6,000 lines 1,486 -> 378 s; 10,000 lines 3,412 -> 1,058 s; its `ledger_line_net`
  rewrite (1,058 -> 263 s) needs a founder ledger-freeze exception (section 4, item 6).
- **UX PR 4b** (session_01FcouKRDfoFAeXZK4Thp8M8): #42 merged, so it may start; paused until the reset.
- Not started: UX PR 7, UX PR 8 (ADR 0090, SGN-09 to SGN-12), ux-forms-after-42, P5 ci-catalog, #46 Verified seal.

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
- **06:22 UTC, PR D:** the Dependabot session owns `co-001/test-flakes-2` (tests only: FRM-01's monotonic wait and
  `csv-arena.test.ts:151`'s explicit timeout), in the Dependabot claim row; it builds after B's and C's suites.
- **08:52 UTC, an update to 18:00 UTC's C ruling:** #91 no longer waits for #86 (the first-ready rule; a trivial ADR 0066
  overlap that #86 resolves at its final base merge); the 2026-11-04 guard is moot; B, C and D merge when ready.
- **Dependabot's regrouped PRs:** #97 (opened after #90 merged) is deferred to the next weekly triage (pacing; named in
  #94); #98, which replaced it after #42 merged, is left there too.
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

1. **SS-01's approval line, next:** when SS-01's PR is verified, its suggested approval line is posted as one pull-request
   comment on the domain model's approval line, and the founder commits it ("Commit suggestion", as on #42: 9426a8d1).
   It gates SS-01's merge and so the rest of the chain; then 1b's line and interest's, each in turn. (#42's line is
   committed and #42 merged.)
2. **#42's launch actions 2-7** (`approval-summaries/lane-a-wip/pr42-body-drafts/body-actions.md`; #42's description): a
   second AWS account per environment; phase 1, DNS, phase 2; SES production access; Postmaster, SNDS and DMARC; staging's
   checks and the AWS prices; the consumer's size. They block the screening's launch, not a merge. Counsel reads the
   signed-off legal text (O4) before the screening opens.
3. **Runbook 3i,** the build's own GitHub account, and `APPROVAL_REVIEW_REQUIRED`: until then ordinary PRs merge on green
   checks after the fresh-clone verification. Recommended before launch.
4. **O9, issue #41 (open):** S4's middle run against the 44 s sizing line: 45.6 s (local, #42), 55.1 s (CI, #42), 52.3 s
   (bce57f16), 37.1 s (43565235), 41.4 s (CI, #42's final head 9bb0604e), 54.1 s (CI, #95's 48dabc28), on the same
   consumer code: runner noise. A launch blocker only.
5. **The moderate Dependabot alert** on the default branch:
   https://github.com/PureTideWater/PhysicalTherapy/security/dependabot/1. The build gets 403 on alerts; a person reads it.
   Does not block.
6. **Usage (cost):** overage is disabled at the organization level, so the 5-hour window and the 7-day cap stop sessions
   outright (429); Lane B's 7-day cap is at its warning level until 2026-11-06 19:00 UTC.
- Recorded, not blocking: #85 design 8.2 (may a line at Payer approved or Recovered be written off, and with which
  reasons); #75's F1 (per-field recall and precision floors) and F2 (the data-rights addendum and evaluation examples);
  Stripe's webhook API version; a credentialed `cdk:diff` on staging; a real-model evaluation on the Anthropic path;
  SUITE-CAP-3's ledger-freeze exception for its `ledger_line_net` rewrite, when SUITE-CAP-3 resumes (section 4, item 6).
- No 8-CPU runner is asked for: the ask was withdrawn 2026-11-02 06:22 UTC (section 3).

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
> head live (`git ls-remote origin`, the open pull requests). #42 is merged (handoff section 2). Take back the schema
> chain (section 3) in a session of its own, from origin's heads and WIP refs at the clean point the handoff names
> (SS-01's pull request may be mid-stage); do not message Lane B's sessions. Add section 4's items to Lane A's queue, take back the counters
> (section 6), mark LANES.md's #42, SS-01, SUITE-CAP-1b and interest rows "A", and write your entries in HANDOFF.md. One
> schema PR at a time; the founder's decisions stay the founder's.
