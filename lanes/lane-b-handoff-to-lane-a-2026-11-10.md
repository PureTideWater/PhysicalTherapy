# Lane B's handoff to Lane A (for 2026-11-10)

**Rolling: current as of 2026-11-06 21:30 UTC; finalized at stand-down.**

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

Read in this order:
1. `CLAUDE.md` (on `claude/build-platform`).
2. `LANES.md`:
   - the claims, each row's sentence of 2026-11-06 21:30 UTC or later;
   - the notes at the top of "Claims";
   - "Handed to Lane A".
3. This file.
4. `lanes/acting-lane-b-2026-11-04.md`: the speed rules for both lanes, 2a (the up-to-date rule) included.
5. `lanes/lane-b.md` from 2026-11-06 19:40 UTC on. Lane A's own entries of 2026-11-03 14:20 to 2026-11-05 07:55 UTC are
   there too.
6. Each item's status file and its RESUME-BLOCK.

Check every head live first (`git ls-remote origin`, the open PRs). Sessions push and merge between updates of this file.

## 1. What merged since Lane A's handoff (2026-11-05, tip cc3dd7f6)

| Merged | PRs |
| --- | --- |
| 2026-11-05 ~07:55 UTC to 2026-11-06 21:30 UTC | None. `claude/build-platform` is still cc3dd7f6 (#128, 2026-11-05 08:19 UTC). Both accounts were out of weekly usage until 2026-11-06 19:00 UTC. |

Nothing went into `main` (220f2b4e, unmoved since 2026-10-20), and there are no tags.

## 2. In flight

Heads were checked live at 2026-11-06 21:32 UTC. Each item's exact next step is in its status file's RESUME-BLOCK, or in
its log while the session runs. A branch "not on origin" has only a WIP ref.

| Item | Session | Branch, WIP ref, PR | Stage | Resume from |
| --- | --- | --- | --- | --- |
| **MOD-16: a range glued to a word** (`co-001/redact-range-glued`; CI flake, PHI) | S1, session_01FcouKP1U2GGDFhhZT9CaUV | Branch = cc3dd7f6; WIP `co-001/wip-redact-range-glued` 89fb3193; no PR | Built (2861bc0f, 89fb3193). Two reviews with skeptics (PHI and security; gateway correctness) running in wf_bca3d2b3-77c. | `approval-summaries/lane-b-redact-range-glued-status.md` |
| **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; PHI; MOD-21, MOD-22) | S1, next | Not cut; no PR | Mapped, not built. The read-only hunt wf_8da6dd19-398 found 52 candidate classes at cc3dd7f6 in round 1. Its synthesis (the design input) is in S1's scratchpad and goes to build-ops before any stand-down. | The range-glued status file, until its own exists; LANES.md row |
| **Packets verifier identifier fold** (MOD-19, MOD-20) | S1, third | `co-001/packets-verifier-identifier-fold` not on origin, no commits; no PR | Three scouts done; design next. It shares verifier files with slice 2 and the /3 migration. | `approval-summaries/lane-b-packets-verifier-identifier-fold-status.md` RESUME-BLOCK |
| **Interest credited once** (schema, acting Lane A) | S2, session_01FcouKQthXdmDnPmwhFepxW | `co-001/ledger-interest-once` c49367c5; WIP `co-001/wip-interest-fix` 23369ae6; draft #126 | wf_342b2332-e78 runs: the second review round on c49367c5..23369ae6, fixes, the base merged once, the full suite once. Then the push, the description, CAS-42.5 and the verification. Then ready, and the suggested line as one comment. | `approval-summaries/lane-a-schema-chain-status.md` (its 19:50 UTC section, then the RESUME-BLOCK) |
| **password-changed-notice** (schema; ADR 0091, SGN-16) | S2, after #126 | Not started | Designed (`designs/lane-a-auth-emails.md`). Its PR opens only after #126 merges. | `approval-summaries/lane-a-auth-emails-status.md` RESUME-BLOCK |
| **Contract pages in their own process** (SEC-24) | S3, session_01FcouKQJppM8BdCui7NVQUa | `co-001/pages-child-process` not on origin; WIP `co-001/wip-pages-child-process` 43a81626 (cc3dd7f6 merged as 7ce6c8b5); no PR | wf_cb013d2b-2e3 runs the rest of the suite (build, e2e, 16 mutation shards, the gate, the workflow checks) and the description. Then the push and the draft PR. | `approval-summaries/lane-a-pages-child-process-status.md` |
| **Email lockup plate** (O-5, O-8) | session_01FcouKRo5iee5QFtPT8UimZ (S3's second item, run in parallel) | `co-001/email-lockup-plate` 231da9c4; WIP `co-001/wip/email-lockup-plate-s5` 0234d5fe; draft #129 | Full suite green on 31c41a9d: unit 9,929, db 9,863, e2e 81/81. Fix round 2 (wf_5ac1f379-e54: D1, D2) is running. Then the push, CI, the verification and the merge. | `approval-summaries/lane-a-email-lockup-plate-status.md` |
| **Packet figures as placeholders, slice 2** (ADR 0089, CAS-52 to CAS-54) | S4, session_01FcouKPkXdRW5ntz6ye92pL | `co-001/packet-figure-placeholders-2` not on origin; WIP `co-001/wip-packet-figure-placeholders-2` a3d234ce; no PR | Built in two parts (0fc43dcd, a3d234ce). wf_445df00c-8d3 runs its reviews (money A, money B, security fail-closed, test quality), the fixer and the recheck. | `approval-summaries/lane-b-packet-figure-placeholders-status.md` (the SLICE-2 section) |
| **SUITE-CAP-3, the design review** | session_01FcouKP4ekrT97eyDtLe4Rd | `co-001/suite-cap-3-reconcile` 83d71fd6 (stale); WIP `co-001/wip-suite-cap-3` 0b6e90eb (cc3dd7f6 merged); no PR | wf_9dd7a743-340 runs the re-measure, D1, D3 and D14, two reviews, and the freeze-exception ask. The build (worker-side fixes only) is S5's third item. | `approval-summaries/lane-b-suite-cap-3-status.md` |
| **S5's queue** | S5, session_01FcouKRDfoFAeXZK4Thp8M8 | None cut | Waiting for #129 to merge. In order: UX PR 4b with #121's P1; ux-forms-after-42; SUITE-CAP-3's worker-side fixes; P2; P5; UX PR 8 (ADR 0090, SGN-09 to SGN-12); dark-mode-ship. | Each item's LANES.md row; `approval-summaries/lane-b-ux-screening-result-tables-status.md` for 4b |
| **Kept and idle** | session_01FcouKNB2TyuPCAha9BaEjQ (#48, the narrative draft; ADR 0076, CAS-35 to CAS-37); session_01FcouKNP2XtaombFLueKLnu (ci-pin-age; P2 is now in S5's queue) | — | #48 waits for slice 2. Not started this week. | `approval-summaries/lane-b-unmapped-plan-status.md`, `approval-summaries/lane-b-ci-deps-status.md` |
| **Dependabot #122, #123, #124** | None | Open, behind the base | Untriaged. Never merged as they stand; one replacement PR, like #94. | LANES.md rule 7 |

Two things are not yet allowed:
- **infra/lib/heap.ts's `--max-old-space-size=560`** must not ship before pages-child-process merges.
- **Slice 2, the verifier identifier fold and the /3 migration** all touch the packet verifier, so they go one at a time
  (rule 6: check the other's branch first).

## 3. The first item for Lane A

**Take the schema chain back from S2 (session_01FcouKQthXdmDnPmwhFepxW) at its RESUME-BLOCK** in
`approval-summaries/lane-a-schema-chain-status.md`. This section is rolling; at 21:30 UTC that means #126:
- **First check** whether the founder has committed #126's approval line, and whether every required check is green on
  the latest commit.
- **If both hold,** merge #126 under rule 2a (the base merged right before, with one CI re-run if the base moved). Then
  start password-changed-notice from its RESUME-BLOCK, on a migration timestamp after 20261110090000.
- **If #126 still waits on the founder,** relay its link and open no other schema PR.

Then take back the counters (section 6). Lane B keeps its own items, its sessions and the PHI leak PR.

## 4. The schema queue (one at a time, each with the founder's committed line)

0. **#126, the interest fix.**
   - Draft at c49367c5, with the WIP at 23369ae6.
   - Its second review round, its one base merge and the full suite are running.
   - The suggested approval line is not yet posted.
   - The domain model's hash on 23369ae6 is provisional (f1b603ca…ef7, line 7469), and the base merge moves it.
   - CI on c49367c5 is red only on the blank approval line and on e2e INT-REL-1, which is fixed on the WIP ref.
1. **password-changed-notice.** Not started; S2 takes it next. ADR 0091, SGN-16.
2. **#84's `tp-packet-verifier/3` migration** (packet-figure-placeholders slice 3).
   - **Ordering: slice 3's `VERIFIER_FORMAT` flip must ship with or after slice 4's export render.** This is S4's finding
     of 2026-11-06: flipping the constant stores token templates, which the export prints only once slice 4 renders
     them.
   - Slice 2 reaches /3 only by an explicit format argument, so nothing served changes before then.
   - The note is also in LANES.md "Handed to Lane A".
3. **#85's design §7.2, items 1 to 5.**
4. **#93's F9:** `roi_links_valid()`'s fifth key.
5. **Relinking an app row to a new Cognito subject** (#125's stuck-invitee note).
6. **The rest of LANES.md "Handed to Lane A".**
   - SUITE-CAP-3's index or table part, if its design review needs one.
   - SUITE-CAP-3's `ledger_line_net` rewrite, only on a founder freeze exception.

Cognito PR 2 (the confidential client and cutover; ADR 0088) is not a schema PR. It waits for two things: #113 deployed to
staging, and the founder's F1 to F5 and ruling 16.

## 5. The founder's open items

- **#126's approval line:** https://github.com/PureTideWater/PhysicalTherapy/pull/126
  - S2 posts it as one suggested change on the domain model's approval line; the founder clicks "Commit suggestion", as
    for #104 and #110.
  - It is not posted as of 2026-11-06 21:30 UTC.
  - password-changed-notice's line follows.
- **SUITE-CAP-3's ledger freeze exception** for the `ledger_line_net` rewrite. The ask will be at
  https://github.com/PureTideWater/PhysicalTherapy/blob/claude/build-ops/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md
  - The design review is drafting it; it has not been asked yet.
  - It goes through the co-founder with its exact text.
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

Next free, as of 2026-11-06 21:04 UTC:
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
> (section 6). One schema PR at a time; the founder's decisions stay the founder's. Write your entries in HANDOFF.md.
