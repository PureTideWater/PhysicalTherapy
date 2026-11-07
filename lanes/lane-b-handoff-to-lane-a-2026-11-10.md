# Lane B's handoff to Lane A (for 2026-11-10)

**Rolling: current as of 2026-11-07 00:35 UTC; finalized at stand-down.**

Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) brings this file up to date at every records commit, so a
handoff exists whenever Lane B stops. Last week the 7-day cap stopped the orchestrator itself, and the planned refresh
never happened (section 7).

The stand-down starts at 2026-11-10 09:00 UTC, before Lane A's reset (~2026-11-10 14:00 UTC). It comes sooner if Lane B's
account nears its own limit. Lane B's week resets about 2026-11-13 19:00 UTC.

Until the stand-down, Lane B's account runs everything:
- Lane B's own items;
- the items Lane A was finishing;
- the schema chain, as acting Lane A;
- the counters.

The co-founder's handoff prompt of 2026-11-06 19:30 UTC is the plan of record for the week. At its return, Lane A takes
back the schema chain and the counters from the live heads. One schema PR at a time; the founder's decisions stay the
founder's.

**Since 22:40 UTC, the co-founder's standing instruction:** "Don't ask for approvals anymore just make the most optimized
decision." Lanes decide without asking, take the most optimized option (for security and privacy, the safer one) and
record why. These stay the founder's: the approval of record (the committed approval line), release tags, the owner-admin
settings, legal text, and reversing or lifting a founder ruling (so a new freeze exception is still relayed with its exact
text). Record: `approval-summaries/founder-asks-2026-10-27.md`, "Decided 2026-11-06".

Read in this order:
1. `CLAUDE.md` (on `claude/build-platform`).
2. `LANES.md`:
   - the claims, each row's sentence of 2026-11-06 21:30 UTC or later;
   - the notes at the top of "Claims";
   - "Handed to Lane A", its 2026-11-06 22:45 UTC entry first.
3. This file.
4. `lanes/acting-lane-b-2026-11-04.md`: the speed rules for both lanes, 2a (the up-to-date rule) included.
5. `lanes/lane-b.md` from 2026-11-06 19:40 UTC on. Lane A's own entries of 2026-11-03 14:20 to 2026-11-05 07:55 UTC are
   there too.
6. Each item's status file and its RESUME-BLOCK.

Check every head live first (`git ls-remote origin`, the open PRs). Sessions push and merge between updates of this file.

## 1. What merged since Lane A's handoff (2026-11-05, tip cc3dd7f6)

| Merged | PRs |
| --- | --- |
| 2026-11-05 ~07:55 UTC to 2026-11-06 22:54 UTC | None. Both accounts were out of weekly usage until 2026-11-06 19:00 UTC. |
| 2026-11-06 22:55 UTC | **#130**, contract pages read in their own process (SEC-24; ADR 0033 and ADR 0071 amended), as **31a7345f** from 43a81626, by S3 (session_01FcouKQJppM8BdCui7NVQUa). CI green (38 check runs); fresh-clone verification wf_1edda650-2ad passed. Its push runs on 31a7345f are green (ci 42308243590, mutation 42308243735, screening-capacity 42308243690). `infra/lib/heap.ts`'s `--max-old-space-size=560` on the worker task is now unblocked. S3's proposals, not in #130: a step in ci.yml's images job reading one synthetic PDF through `dist/page-reader.js` in the built worker image; the core-crash test run in CI; the child's network reach revisited with Node 26 LTS (`approval-summaries/lane-a-pages-child-process-status.md`). |

`claude/build-platform` is 31a7345f (checked 2026-11-07 00:33 UTC).

Nothing went into `main` (220f2b4e, unmoved since 2026-10-20), and there are no tags.

## 2. In flight

Heads were checked live at 2026-11-07 00:33 UTC, status files read to 00:36 UTC. The account's 5-hour limit stopped every
workflow between ~22:58 and 00:10 UTC; each resumed in its same run at 00:35 UTC (what each lost is below). Each item's exact next step is in its status file's RESUME-BLOCK, or in
its log while the session runs. A branch "not on origin" has only a WIP ref.

| Item | Session | Branch, WIP ref, PR | Stage | Resume from |
| --- | --- | --- | --- | --- |
| **MOD-16: a range glued to a word** (`co-001/redact-range-glued`; CI flake, PHI) | S1, session_01FcouKP1U2GGDFhhZT9CaUV | Branch = cc3dd7f6; WIP `co-001/wip-redact-range-glued` 6fc88092; no PR | Built (2861bc0f, 89fb3193); gateway round 1 fixed (21e67bba, 435f0a68, e0cf46e0). Round 1's PHI review was lost and its notes showed regressions against the base, so wf_bca3d2b3-77c was resumed with a base-against-head differential PHI review. The re-run differential (350,000 letters) found no digit the base redacts sent at e0cf46e0. The re-review's fixes: 9ecbe6c9 (GATEWAY1-1) and 6fc88092 (PHI1-1 to PHI1-3, GATEWAY1-2, GATEWAY1-4). The 5-hour stop lost round 2's reviews, the final fixer, the suite and the critic; resumed 00:35 UTC. It merges only with zero regressions against the base. Next: the base 31a7345f merged once, the full suite once, the push, the PR. | `approval-summaries/lane-b-redact-range-glued-status.md` |
| **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; PHI; MOD-21, MOD-22) | S1, next | Not cut; no PR | Mapped, not built. The read-only hunt wf_8da6dd19-398 found 52 candidate classes at cc3dd7f6 in round 1. The 5-hour stop lost its round-2 skeptics, rounds 3 and 4 and the synthesis; S1 holds it until range-glued's build ends, then reruns it. The synthesis (the design input) goes to build-ops before any stand-down. | The range-glued status file, until its own exists; LANES.md row |
| **Packets verifier identifier fold** (MOD-19, MOD-20) | S1, third | `co-001/packets-verifier-identifier-fold` not on origin, no commits; no PR | Three scouts done; design next. It shares verifier files with slice 2 and the /3 migration. | `approval-summaries/lane-b-packets-verifier-identifier-fold-status.md` RESUME-BLOCK |
| **Interest credited once** (schema, acting Lane A) | S2, session_01FcouKQthXdmDnPmwhFepxW | `co-001/ledger-interest-once` d2fdd106 (= WIP `co-001/wip-interest-fix`); draft #126 | Pushed at d2fdd106 (~22:48 UTC): cc3dd7f6 merged once (e81cd5af), the full suite once, the mutation gate's two survivors killed. **The second review round is not done** (its reviewers were cut off by the 5-hour limit, ~23:55 UTC): wf_29adffb1-b27 redoes it, then CAS-42.5, the re-shots, the description and the verification. CI on d2fdd106: e2e green (INT-REL-1 fixed); red on the domain model (the blank approval line) and `unit` (cancelled at its 20-minute timeout). Behind 31a7345f, merged once right before the merge. Then ready, and the suggested line as one comment. The batching plan wf_255f9403-721 (read-only) resumed beside it. | `approval-summaries/lane-a-schema-chain-status.md` (its 19:50 UTC section, then the RESUME-BLOCK) |
| **password-changed-notice** (schema; ADR 0091, SGN-16) | S2, after #126 | Not started | Designed (`designs/lane-a-auth-emails.md`). Its PR opens only after #126 merges; it may be batched with related queue items (section 4). | `approval-summaries/lane-a-auth-emails-status.md` RESUME-BLOCK |
| **Email lockup plate** (O-5, O-8) | session_01FcouKRo5iee5QFtPT8UimZ (S3's second item, run in parallel) | `co-001/email-lockup-plate` f4fef908; draft #129 | Fix round 2 done and verified (61169d8b; description citations fixed in 34927fd0). Every CI check green on 34927fd0 (22:56 UTC). The base moved to 31a7345f, which shares `test-matrix.md` and the synth registry, so wf_464a574d-f04 merged it once (f4fef908, no conflicts, its checks pass) and pushed it at ~00:40 UTC, after a 5-hour-limit stop. Next: CI on f4fef908, the fresh-clone verification that reads CI, ready, the merge. | `approval-summaries/lane-a-email-lockup-plate-status.md` |
| **Packet figures as placeholders, slice 2** (ADR 0089, CAS-52 to CAS-54) | S4, session_01FcouKPkXdRW5ntz6ye92pL | `co-001/packet-figure-placeholders-2` not on origin; WIP `co-001/wip-packet-figure-placeholders-2` d96a053a; no PR | Built in two parts (0fc43dcd, a3d234ce). wf_445df00c-8d3 done: 9 findings confirmed, two blocking (MONEY-A-1, MONEY-B-1), all fixed in d21f4577 (new code `fact_not_separated`). Round 2 (wf_db15c2a6-888) was stopped at 22:58 UTC after the carry-over verdicts and the equivalent's review: the `template.ts` equivalent signed in d96a053a; NEW-1 fixed (fails closed); NEW-2 an accepted reading in ADR 0089. Resumed 00:35 UTC: loop-until-dry reviews, a completeness critic. Then the full suite, the push and the PR. Its /3 codes for Lane A: section 4, item 3. | `approval-summaries/lane-b-packet-figure-placeholders-status.md` (the SLICE-2 section) |
| **SUITE-CAP-3, the design review** | session_01FcouKP4ekrT97eyDtLe4Rd | `co-001/suite-cap-3-reconcile` 83d71fd6 (stale); WIP `co-001/wip-suite-cap-3` 0b6e90eb (cc3dd7f6 merged); no PR | wf_9dd7a743-340 done: step 7b at 2,000 lines on practice F 620 s -> 21.5 s, spread R 159 -> 46 s, writes identical row for row. D14 ruled 22:31 UTC (section 4). The freeze-exception ask was granted 22:40 UTC. The review loop wf_d171f0f0-948 finished round 1 (15 findings, 9 upheld; both lenses BUILD WITH CHANGES, nothing blocking; applied in f795bf28, design §18). Round 2 and the completeness critic, stopped by the 5-hour limit, resumed at 00:35 UTC. The ask gained the 360 s wording and two proof items (a cross-practice test; a plan test); the two granted bodies are unchanged. The build (worker-side fixes only) is S5's second item. | `approval-summaries/lane-b-suite-cap-3-status.md` |
| **UX PR 4b: the screening result's words** (TBL-08 reworded; no migration) | S5, session_01FcouKRDfoFAeXZK4Thp8M8 | `co-001/ux-screening-result-words` cut at 31a7345f, not on origin; no PR | Started 22:57 UTC, when #130 merged. The build workflow wf_efec3b83-f5b started at 00:35 UTC. Next: the push and the draft PR; one review (UX and brand, with shots and skeptics); the full suite once; the merge under rule 2a. | `approval-summaries/lane-b-ux-screening-result-words-status.md` |
| **ux-forms-after-42** (design 7.8) | S3, session_01FcouKQJppM8BdCui7NVQUa (moved from S5's queue at 22:57 UTC) | `co-001/ux-forms-after-42` cut locally at 31a7345f, not on origin; no PR | Claimed 23:00 UTC. The design refresh of 7.8 against the base (wf_8ed4a036-bce: one reviewer and a critic) was stopped at its start by the 5-hour limit and resumed at 00:35 UTC. Then the build, the shots, the draft PR, the UX and brand review, the fix round with the full suite once, the push, CI, the verification, the merge. | `approval-summaries/lane-b-ux-forms-after-42-status.md` |
| **S5's queue after 4b** | S5 | None cut | In order: SUITE-CAP-3's worker-side fixes; P2; P5; UX PR 8 (ADR 0090, SGN-09 to SGN-12); dark-mode-ship. | Each item's LANES.md row |
| **Kept and idle** | session_01FcouKNB2TyuPCAha9BaEjQ (#48, the narrative draft; ADR 0076, CAS-35 to CAS-37); session_01FcouKNP2XtaombFLueKLnu (ci-pin-age; P2 is now in S5's queue) | — | #48 waits for slice 2. Not started this week. | `approval-summaries/lane-b-unmapped-plan-status.md`, `approval-summaries/lane-b-ci-deps-status.md` |
| **Dependabot #122, #123, #124** | None | Open, behind the base | Untriaged. Never merged as they stand; one replacement PR, like #94. | LANES.md rule 7 |

One thing is not yet allowed:
- **Slice 2, the verifier identifier fold and the /3 migration** all touch the packet verifier, so they go one at a time
  (rule 6: check the other's branch first).

`infra/lib/heap.ts`'s `--max-old-space-size=560` on the worker task is allowed since #130 merged (2026-11-06 22:55 UTC).

## 3. The first item for Lane A

**Take the schema chain back from S2 (session_01FcouKQthXdmDnPmwhFepxW) at its RESUME-BLOCK** in
`approval-summaries/lane-a-schema-chain-status.md`. This section is rolling; at 2026-11-07 00:35 UTC that means #126:
- **First check** whether the founder has committed #126's approval line, and whether every required check is green on
  the latest commit.
- **If both hold,** merge #126 under rule 2a (the base merged right before, with one CI re-run if the base moved). Then
  start password-changed-notice from its RESUME-BLOCK, on a migration timestamp after 20261110090000.
- **If #126 still waits on the founder,** relay its link and open no other schema PR.

Then take back the counters (section 6). Lane B keeps its own items, its sessions and the PHI leak PR.

## 4. The schema queue (one at a time, each with the founder's committed line)

0. **#126, the interest fix.**
   - Draft at d2fdd106 (= the WIP), pushed ~22:48 UTC after one base merge (cc3dd7f6) and the full suite once.
   - **Its second review round is not done:** the 5-hour limit cut its reviewers off (~23:55 UTC). wf_29adffb1-b27
     redoes it, then CAS-42.5, the re-shots, the description and the verification.
   - CI on d2fdd106: e2e green (INT-REL-1 fixed); red on the blank approval line and on `unit`, cancelled at its
     20-minute timeout.
   - Behind the base again (31a7345f): merged once right before the merge, with `unit` green on that head. Then ready.
   - The suggested approval line is not yet posted. The domain model's hash moves with the base merge, so it is taken
     on the final head.
1. **password-changed-notice.** Not started; S2 takes it next. ADR 0091, SGN-16.
2. **The ledger-function migration: new bodies of `ledger_line_net` and `ledger_entry_rules`.** The founder granted the
   freeze exception at ~22:40 UTC, exactly as written in `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`.
   - One migration, after #126. It carries exactly the two granted bodies.
   - Every amount, stage, refusal and recovered total stays unchanged, proved by LED-01 to LED-18, LED-23 to LED-25, the
     ledger oracle, the refusal tests and the write-equality dumps (F at 10,000 lines, R at 2,000).
   - Measure again on #126's base, which adds one index on the matches.
   - **D14's condition (ruled 22:31 UTC):** the weekly run's step 7b stays on practice F at 10,000 lines until this
     merges. Then it moves back to practice A's month, as SUITE-CAP-1b's hand-off asked; SUITE-CAP-3's PR amends ADR
     0083 with this condition. Measure on Lane A's own base before the move: A's month is 1,653 s against the 900 s
     attempt today, and 310 s with both bodies.
3. **#84's `tp-packet-verifier/3` migration** (packet-figure-placeholders slice 3).
   - **Ordering: slice 3's `VERIFIER_FORMAT` flip must ship with or after slice 4's export render.** This is S4's finding
     of 2026-11-06: flipping the constant stores token templates, which the export prints only once slice 4 renders
     them.
   - Slice 2 reaches /3 only by an explicit format argument, so nothing served changes before then.
   - **The /3 reports carry six new codes (S4, 2026-11-06 22:36 UTC; ADR 0089):** `free_figure`, `number_word`,
     `unknown_fact`, `fact_not_canonical`, `fact_contradicted` and `fact_not_separated`. All six are of kind `'fact'`.
     The mismatch key `canonical` appears on `fact_not_canonical` only.
   - The ordering note is also in LANES.md "Handed to Lane A"; the codes are in the slice's claim row too.
4. **#85's design §7.2, items 1 to 5.**
5. **#93's F9:** `roi_links_valid()`'s fifth key.
6. **Relinking an app row to a new Cognito subject** (#125's stuck-invitee note).
7. **The rest of LANES.md "Handed to Lane A".**
   - SUITE-CAP-3's index or table part, if its design review needs one.

**Batching (from 22:40 UTC).** S2 batches related schema items into fewer PRs, to cut the founder's approval cycles. Still
one schema PR open at a time, each regenerating `domain-model.md` and `packages/db/functions` and carrying the founder's
committed line. A batch never widens a grant, and keeps item 3's ordering.

Cognito PR 2 (the confidential client and cutover; ADR 0088) is not a schema PR. It waits for two things: #113 deployed to
staging, and the founder's F1 to F5 and ruling 16.

## 5. The founder's open items

- **#126's approval line:** https://github.com/PureTideWater/PhysicalTherapy/pull/126
  - S2 posts it as one suggested change on the domain model's approval line; the founder clicks "Commit suggestion", as
    for #104 and #110.
  - It is not posted as of 2026-11-07 00:35 UTC.
  - password-changed-notice's line follows.
- **SUITE-CAP-3's ledger freeze exception: granted** by the founder, relayed by the co-founder at ~22:40 UTC, as written in
  https://github.com/PureTideWater/PhysicalTherapy/blob/claude/build-ops/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md
  (the new bodies of `ledger_line_net` and `ledger_entry_rules`; section 4, item 2). Its PR still needs the founder's
  approval of record. The design review's round 1 (f795bf28) added the 360 s wording and two proof items to the ask; the
  two granted bodies are unchanged.
- **A documented PHI residual,** if the leak hunt marks any class one (obfuscation beyond pattern reach). It would go
  through the co-founder with the exact text, and be fixed meanwhile as the safer option. There is none yet.
- **Staging steps:**
  - F0: a synthetic invite, then set the password, enrol and sign in, before release N reaches production (ADR 0088).
  - F1 to F5, and ruling 16, before Cognito PR 2.
  - #125's staging smoke checks (ADR 0081): https://github.com/PureTideWater/PhysicalTherapy/pull/125
  - Real Gmail iOS and Outlook.com dark renders of the email plate (#129):
    https://github.com/PureTideWater/PhysicalTherapy/pull/129
- **Launch items:**
  - #42's actions 2 to 7: https://github.com/PureTideWater/PhysicalTherapy/pull/42
  - counsel's reading of the signed-off legal text;
  - O9: https://github.com/PureTideWater/PhysicalTherapy/issues/41
  - runbook 3i (the build's own GitHub account);
  - PRD section 19's RDS cost line: staging db.t4g.medium is about +$23 a month, dev db.t4g.small about +$11.
- **Open issues:**
  - #102 is open, though its cause was fixed when the repository went public again:
    https://github.com/PureTideWater/PhysicalTherapy/issues/102
  - #73 and #111, release capacity: https://github.com/PureTideWater/PhysicalTherapy/issues/73 and
    https://github.com/PureTideWater/PhysicalTherapy/issues/111
- **Housekeeping, the person's call:**
  - delete `co-001/cognito-confidential-client` (it holds two .gitleaksignore entries and is never to be merged),
    `co-001/wip-pricing-run-cutoff` and `co-001/wip/pricing-run-cutoff-s4`;
  - Lane B's cleanup list: `lanes/lane-b.md`, 2026-11-06 19:40 UTC.
- **Release tags** are the founder's. There are none.
- **For awareness:** the orchestrators' calls on founder ground, in `lanes/lane-b.md` 2026-11-06 19:40 UTC (D), item 8.

## 6. Counters (Lane B allocates until Lane A returns)

Next free, as of 2026-11-06 21:04 UTC (unchanged at 2026-11-07 00:35 UTC: 4b rewords TBL-08 and takes no new number):
- **ADR 0092.** 0089 is slice 2's, 0090 UX PR 8's, 0091 password-changed-notice's.
- **Test-matrix MOD-23.** MOD-19 and MOD-20 are the verifier fold's; MOD-21 and MOD-22 are redact-ssn-phone-leaks'.
- **Test-matrix CAS-56, SEC-25, SGN-17**, and in the other series LED-26, BIL-11, CI-30, MAP-11, PRC-33, HOM-05, TBL-09,
  DLR-05, SCR-23, JOB-06, FRM-09, RCC-09 and DBF-06.
- **Synth module 21.**
- **Fixture release 900008.**

The record of each allocation is LANES.md rule 4's counters line.

## 7. What cost time this round, so it does not cost Lane A's

- **The 7-day cap stops the orchestrator too.**
  - Lane B's orchestrator was stopped from 2026-11-02 ~12:35 to 2026-11-06 19:16 UTC.
  - The refresh and stand-down that the 2026-11-03 handoff promised never happened: build-ops has no commit from
    2026-11-02 11:02 to 2026-11-03 14:16 UTC. Lane A found the state live instead.
  - **Hence this rolling file.** Every records commit keeps it current, and the stand-down is a scheduled reminder, not a
    plan.
- **The ultracode flag is set only by a typed message.**
  - The audit of 2026-11-06 19:50 UTC found the flag on only in the sessions the co-founder had typed in.
  - An "ultracode." message from the orchestrator did not set it in the six working sessions (re-checked at 19:54 UTC).
  - So a person types "ultracode" in each session that should run in it. The co-founder was asked to do that for the six.
- **Some sessions refuse a relayed go-ahead.**
  - A session may decline to open or merge a PR on a request relayed by another session (11-05 handoff, section 7).
  - New sessions now get an `append_system_prompt` that authorizes their own draft PRs, comments, subscriptions and
    merges as LANES.md allows.
  - If one still waits, the person types "go" in it.
- **A scratchpad is not durable.** Workflow progress and syntheses (such as the leak hunt's) live in a session's
  scratchpad. Commit what a successor needs to `claude/build-ops` before any stand-down.
- **Two agents at a time per workflow on these machines.** When findings are many, batch the skeptics per angle, not per
  finding.
- **The 5-hour limit stops a session's workflows too** (2026-11-06 ~22:58 to 00:10 UTC: every workflow on Lane B's
  account stopped and resumed at 00:35 UTC). Two heavy workflows in one session used the window in ~4.7 h, so run one
  heavy workflow per session at a time, and push WIP refs before long runs.
- **CI's `unit` job can hit its 20-minute timeout** (#126 on d2fdd106, 22:48 to 23:08 UTC, cancelled). Re-run it once on
  the final head; if it repeats, measure before raising the limit.
- **The co-founder asked at 22:40 UTC how to speed the build up.** The answer, in `lanes/lane-b.md` 2026-11-07 00:35 UTC:
  raise the usage ceiling first (the organization's extra usage); same-day founder approval lines; the GitHub
  organization on the Team plan (merge queue, runners, a private repository; until then the repository stays public,
  below); start the people-only launch work. In place already: schema batching, the speed rules, this rolling file,
  about five sessions.
- **The 11-05 handoff's section 7 still holds:**
  - keep the repository public;
  - GitHub's up-to-date rule;
  - never a .gitleaksignore entry;
  - a process-wide `--max-old-space-size` overrides a worker thread's limits.

## 8. The message that starts Lane A (draft; finalized at stand-down)

The founder types it, so that the flag takes.

> ultracode. You are Lane A of the PaidWhole build again, from your account's reset (~2026-11-10 14:00 UTC). Read
> CLAUDE.md, LANES.md, `lanes/lane-b-handoff-to-lane-a-2026-11-10.md`, `lanes/acting-lane-b-2026-11-04.md` (the speed
> rules, 2a included) and `lanes/lane-b.md` from 2026-11-06 19:40 UTC, then each item's status file and RESUME-BLOCK.
> Check every head live. Take back the schema chain from Lane B's S2 at its RESUME-BLOCK (section 3), and the counters
> (section 6). One schema PR at a time; decide without asking, as the co-founder instructed on 2026-11-06, and leave
> the founder-only acts to the founder. Write your entries in HANDOFF.md.
