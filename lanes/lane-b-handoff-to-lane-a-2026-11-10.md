# Lane B's handoff to Lane A (for 2026-11-10)

**Rolling: current as of 2026-11-07 06:40 UTC; finalized at stand-down.**

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
   - "Handed to Lane A", its 2026-11-07 03:35 UTC entry (the schema queue plan and the rulings on it) first, then
     2026-11-06 22:45 UTC;
   - Queues items 20 (the UX PRs struck by ux-forms-after-42) and 21 (the web owner's try-lock item).
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
| 2026-11-07 03:27 UTC | **#131**, UX PR 4b: the screening result's words and tones (UX-040, UX-206, #121's P1; TBL-08 reworded, no new number; the labels re-pinned under `screening-labels/2026-11-05` with no migration, P5's four figure labels included by the 01:31 UTC ruling, its three conditions met), as **8a722f80** from 9e577017, by S5 (session_01FcouKRDfoFAeXZK4Thp8M8). CI green on 9e577017 (22 runs: unit 9,952; db 9,864; e2e 81); fresh-clone verification wf_a6153b93-653 passed; 0 tags right before the merge. One nit not taken: `lib/screening/routes.ts:836`'s doc comment "Expected less allowed" (`approval-summaries/lane-b-ux-screening-result-words-status.md`). |

`claude/build-platform` is 8a722f80 (checked 2026-11-07 06:37 UTC; nothing merged since #131).

Nothing went into `main` (220f2b4e, unmoved since 2026-10-20), and there are no tags.

## 2. In flight

Heads were checked live at 2026-11-07 06:37 UTC, status files read to 06:37 UTC. The account's 5-hour limit stopped every
workflow between ~22:58 and 00:10 UTC, and again at ~04:45-05:30 UTC (S1) and ~05:00-05:50 UTC (S3, S4); each resumed in
its same run. **Every review in a workflow now runs as a default agent reading `.claude/agents/<type>.md`, and a dead or
empty agent never counts** (the two review lessons, 01:33 and 06:40 UTC, section 7). Each item's exact next step is in its status file's RESUME-BLOCK, or in
its log while the session runs. A branch "not on origin" has only a WIP ref.

| Item | Session | Branch, WIP ref, PR | Stage | Resume from |
| --- | --- | --- | --- | --- |
| **MOD-16: a range glued to a word** (`co-001/redact-range-glued`; CI flake, PHI) | S1, session_01FcouKP1U2GGDFhhZT9CaUV | Branch = cc3dd7f6; WIP `co-001/wip-redact-range-glued` 3fcb9359; no PR | Built (2861bc0f, 89fb3193); gateway round 1 fixed; the re-run base-against-head differential (350,000 letters) found no digit the base redacts sent at e0cf46e0; the re-review's fixes 9ecbe6c9 and 6fc88092. **Review round 2 found PHI2-1 (blocking):** the call's own DOB, name part, member ID or claim number glued at a range end was sent where cc3dd7f6 refused only by chance (6,602 of 21,600 targeted letters). Fix round 2 (8d98b8bb to 3fcb9359; 632 of 632 gateway tests) reads the call's own identifiers across glued boundaries. **Review round 3 (03:35 UTC) found that fix itself regressed** (PHI3-1 and PHI3-2, blocking: a glued own name between an SSN or phone label and the number cuts the label, so SSNs the base redacted are sent; PHI3-3, PHI3-4; GATEWAY3-1 to GATEWAY3-3), the third round running in which a fix traded one regression for another. So **a judge workflow, wf_5d1aedda-db5,** runs: one base-against-candidate differential gate (at least 200,000 seeded letters plus every finding's inputs); candidates A (patch the glued reading) and B (revert it and refuse an own identifier glued across a boundary the patterns do not read); two judges (PHI first; correctness and over-refusal); reviews with skeptics on the winner until dry. **The tie-break (ruled 03:40 UTC, given to the judges verbatim):** a close call goes to B (refuse where the boundary is unknowable); the winner shows zero PHI regressions per identifier kind on the gate and no must-stay damage beyond the base. The 5-hour limit stopped it at ~04:45 UTC before any agent returned; it resumed at 05:46 UTC as the same run (check-in ~10:57 UTC; several hours more). **MOD-16's three seeds** (1034253323 from #128, -1074798020 from #129, 383403599 from #131; a fourth, -594136649, showed in S3's ux-forms-after-42 integration run) are then pinned failing at cc3dd7f6 and passing at HEAD before the one full suite. It merges only with zero regressions against the base. **The critical path for #129** (a test is never skipped or pinned to get round MOD-16). Next: the base (8a722f80) merged once, the full suite once, the push, the PR. | `approval-summaries/lane-b-redact-range-glued-status.md` |
| **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; PHI; MOD-21, MOD-22) | S1, next | Not cut; no PR | Mapped, not built. The read-only hunt wf_8da6dd19-398 found 52 candidate classes at cc3dd7f6 in round 1. The 5-hour stop lost its round-2 skeptics, rounds 3 and 4 and the synthesis; S1 holds it until range-glued's build ends, then reruns it. The synthesis (the design input) goes to build-ops before any stand-down. | The range-glued status file, until its own exists; LANES.md row |
| **Packets verifier identifier fold** (MOD-19, MOD-20) | S1, third | `co-001/packets-verifier-identifier-fold` not on origin, no commits; no PR | Three scouts done; design next. It shares verifier files with slice 2 and the /3 migration. | `approval-summaries/lane-b-packets-verifier-identifier-fold-status.md` RESUME-BLOCK |
| **Interest credited once** (schema, acting Lane A) | S2, session_01FcouKQthXdmDnPmwhFepxW | `co-001/ledger-interest-once` 9824f4e9 (= WIP `co-001/wip-interest-fix`); draft #126 | CAS-42.5 passed on d2fdd106 (run 42307508461: working set 668.3 of 921.6 MiB; F's reconcile 603.0 s of 900 s). The second review round, redone with default agents (wf_a71650bd-ea2, three rounds), found **F1 (MONEY-R2-1), a blocking money defect, confirmed by a red db test:** with two remittances uploaded out of order (two-chains.835 before paired.835), a PLB L6's payment written in one reconcile pass blocked its own take-back in the next, leaving 11.40 of interest on the lines against 6.00 of cash. **Fixed at 9824f4e9** (8ea33e13): `interestWrites` holds a PLB L6's payments while any take-back of a chain that may still hold interest is not written in full; both orders end at 0 on the lines, never above the cash; LED-23's renumbered-reversal overstatement (5.40) closes too; failing-first db, unit and property tests; `interest.ts` 100% (328 mutants); no migration change; the domain model unchanged. **The trade-off (ADR 0084 and the PR body; for the founder's awareness, section 5):** a payment netted against a take-back of a reversal whose claim is never uploaded is never credited: low by up to that payment, never high. F2 (9824f4e9): the runbook for the lock loop's 55P03, with a guard test. **Running, wf_d944494b-d50:** three judges on F-M2-1, the remaining nits, a third review round on everything since d2fdd106 (until dry), the base (8a722f80) merged once, the full local suite once, the push, CAS-42.5 on the final head (the interest code changed), the body, the fresh-clone verification. Then ready, and the suggested line (not posted yet). | `approval-summaries/lane-a-schema-chain-status.md` (its 19:50 UTC section, then the RESUME-BLOCK) |
| **password-changed-notice** (schema PR 1 of the plan; ADR 0091, SGN-16) | S2, beside #126 | `co-001/password-changed-notice` f110efd9 on origin (06:37 UTC; stacked on #126); no PR | **Building since 02:20 UTC** (wf_5cf101cd-7ab; at 06:05 UTC the database part was pushed, migration 20261111090000 with 25 db tests and a provisional domain model, W and M next): a design addendum with a reviewer and skeptics; migration 20261111090000 through the marker route; the worker, infra, ADR 0091, SGN-16 and the runbooks; the full suite; three reviews (security and sign-in; database, mail and deploy; UX and brand with renders) with skeptics and a critic; the fix round. No PR until #126 merges. D11 and ADR 0081 A6 do not ride. Its renders show #129's White plate: #129 should merge first, or PR 1 renders again after it. | `approval-summaries/lane-a-auth-emails-status.md` (its 02:20 UTC section) |
| **Email lockup plate** (O-5, O-8) | session_01FcouKRo5iee5QFtPT8UimZ (S3's second item, run in parallel) | `co-001/email-lockup-plate` f4fef908; draft #129 | **Waits on `co-001/redact-range-glued`.** CI on f4fef908 green but `unit`: MOD-16, seed -1074798020 (the base's defect; #129 changes no gateway file); its one re-run failed the same way. Nothing more is pushed meanwhile, and no test is skipped or pinned to get round MOD-16 (f4fef908 unchanged at 06:37 UTC). Its three ux-brand-reviewer rounds each returned a real result (none empty). When range-glued merges: the base (8a722f80) merged once, the fast checks and the generators, the push, CI green, the fresh-clone verification, ready, the merge. | `approval-summaries/lane-a-email-lockup-plate-status.md` |
| **Packet figures as placeholders, slice 2** (ADR 0089, CAS-52 to CAS-54) | S4, session_01FcouKPkXdRW5ntz6ye92pL | `co-001/packet-figure-placeholders-2` not on origin; WIP `co-001/wip-packet-figure-placeholders-2` 0b5ca610; no PR | Built in two parts (0fc43dcd, a3d234ce); round 1's nine findings (two blocking) fixed in d21f4577 (new code `fact_not_separated`); the `template.ts` equivalent signed in d96a053a. Round 2 (wf_db15c2a6-888) runs its loop-until-dry review rounds: NEW-1 fixed in code (3d44aff7: a sign set off before a fact token fails it), NEW-2 an accepted reading in ADR 0089 (c3a2743e), then 2f3726ad (the separation check in linear time) and 0b5ca610 ($0.00 interest and two releases pinned; 03:16 UTC). **Round 2 done:** 12 more findings fixed, one **blocking** (a `draft.ts` mutant recorded and signed as "equivalent" hid a real $0.00-interest print in the /2 draft's interest guard; fixed with a test; WIP 0b5ca610). Round 3 was not counted dry (its agents died at the 5-hour limit) and resumed at 05:50 UTC with the script throwing on a dead skeptic or critic (section 7). Then the completeness critic, the full suite, the push and the PR. Its /3 codes for Lane A: section 4, PR 3. | `approval-summaries/lane-b-packet-figure-placeholders-status.md` (the SLICE-2 section) |
| **SUITE-CAP-3, the worker-side build** (CAS-49 to CAS-51, ADR 0087) | session_01FcouKP4ekrT97eyDtLe4Rd (its own; not S5) | `co-001/suite-cap-3-reconcile` 31a7345f (fast-forwarded; no commits of its own yet); WIP `co-001/wip-suite-cap-3-build`; no PR | **Design reviewed** (b27a9861): seven rounds of default agents (payment-engine and security checklists), three skeptics per finding: 46 findings, 31 applied, 15 refuted; verdict BUILD. **Corrections to the granted ask's text** (38123394; the two bodies unchanged, so the grant stands; the founder informed through the co-founder): the 360 s is a sizing bound no release check enforces; A's month was compared on totals, not row for row (row for row holds at F 10,000 and R 2,000). D14 written into the design (§0, D9, D14, 8.4, 14.1). **BUILD GO 02:15 UTC, worker-side only:** slices 1 to 6 and 5a, step 7b on F at 10,000 lines; no migration, index or table. wf_f2526ebe-769 (each slice red first, a skeptic verifier); check-in 07:27 UTC. Next: the push, the draft PR, two reviews. The web owner's item (LANES.md Queues item 21) comes from its §14.4 item 14. | `approval-summaries/lane-b-suite-cap-3-status.md` |
| **ux-forms-after-42** (design 7.8; test-matrix CI-30) | S3, session_01FcouKQJppM8BdCui7NVQUa | `co-001/ux-forms-after-42` local at 31a7345f; WIP `co-001/wip-ux-forms-after-42` dab7d237 (slices on `-u`, `-c`, `-w1`, `-w2`); no PR | **Designed** 01:20 UTC (wf_8ed4a036-bce; 27 findings applied; `designs/lane-b-ux-forms-after-42.md`). **CI-30 allocated** 01:19 UTC (the shell's skip link). **Built** (wf_24fdaecd-29b): slices U (bfe8c135), C (a1ba3b0f), W1 (aeb3f242) and W2 (23599a55) integrated with E into WIP dab7d237 (on origin); typecheck, lint, the generators and the browser harness green; `pnpm test` 10,014 with one MOD-16 failure (seed -594136649, the base's flake); test:db 9,870; e2e 84 of 84. Stopped at ~05:00 UTC in check round 1's skeptics and resumed in the same run. Next: the check rounds with repairs, the head shots, the draft PR, two reviews (UX and brand; security and privacy), the fix round with the full suite once, the push, CI, the verification, the merge. It covers parts of queued UX PRs 67, 68, 74, 75 and 84 (struck in LANES.md Queues item 20). | `approval-summaries/lane-b-ux-forms-after-42-status.md` |
| **S5's queue** (4b merged as #131) | S5, session_01FcouKRDfoFAeXZK4Thp8M8 | P2's `co-001/ci-trivy-version` not on origin; no PR | **On P2 since ~03:45 UTC:** the delta re-design, on 8a722f80, of only what #107 (7bf7b252) and #106 (881e2bbd) leave undone, then that build alone with two reviews (CI permissions; CI-24 to CI-26, N33 to N42, P38 to P42). Then P5; UX PR 8 (ADR 0090, SGN-09 to SGN-12); dark-mode-ship, each on the orchestrator's go. SUITE-CAP-3's build left the list (it runs in its own session). | Each item's LANES.md row |
| **No web request waits on a reconcile pass** (for the web owner; no migration) | Not assigned | Not cut | Queued 02:15 UTC from SUITE-CAP-3's design §14.4 item 14: the reopen, the write-off and the five manual reconciliation actions take the `ledger:` lock with `pg_try_advisory_xact_lock` and refuse at once with an identifier-free, retryable refusal, never a blocking wait. On the base today each can hold one of the web's 10 connections for a whole pass. | LANES.md Queues item 21 |
| **Kept and idle** | session_01FcouKNB2TyuPCAha9BaEjQ (#48, the narrative draft; ADR 0076, CAS-35 to CAS-37); session_01FcouKNP2XtaombFLueKLnu (ci-pin-age; superseded for P2, which S5 runs) | — | #48 waits for slice 2. Not started this week. | `approval-summaries/lane-b-unmapped-plan-status.md`, `approval-summaries/lane-b-ci-deps-status.md` |
| **Dependabot #122, #123, #124** | None | Open, behind the base | Untriaged. Never merged as they stand; one replacement PR, like #94. | LANES.md rule 7 |

One thing is not yet allowed:
- **Slice 2, the verifier identifier fold and the /3 migration** all touch the packet verifier, so they go one at a time
  (rule 6: check the other's branch first).

`infra/lib/heap.ts`'s `--max-old-space-size=560` on the worker task is allowed since #130 merged (2026-11-06 22:55 UTC).

## 3. The first item for Lane A

**Take the schema chain back from S2 (session_01FcouKQthXdmDnPmwhFepxW) at its RESUME-BLOCK** in
`approval-summaries/lane-a-schema-chain-status.md`. This section is rolling; at 2026-11-07 06:40 UTC that means #126:
- **First check** whether the founder has committed #126's approval line, and whether every required check is green on
  the latest commit.
- **If both hold,** merge #126 under rule 2a (the base merged right before, with one CI re-run if the base moved). Then
  open schema PR 1, password-changed-notice, from S2's build (`co-001/password-changed-notice`, stacked on #126;
  migration 20261111090000; `approval-summaries/lane-a-auth-emails-status.md`), and follow the batching plan
  (section 4) under its rulings.
- **If #126 still waits on the founder,** relay its link and open no other schema PR.

Then take back the counters (section 6). Lane B keeps its own items, its sessions and the PHI leak PR.

## 4. The schema queue: the batching plan (one at a time, each with the founder's committed line)

**The plan of record:** `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` (acting Lane A, S2; read-only
wf_255f9403-721, three rounds of a critic and a risk skeptic). **10 schema PRs for about 22 queued items** (about 18
founder approval cycles if each shipped alone). Still one schema PR open at a time, each regenerating `domain-model.md` and
`packages/db/functions` and carrying the founder's committed line. A batch never widens a grant.

0. **#126, the interest fix.**
   - Draft at 9824f4e9: review F1, the blocking money defect (11.40 of interest held against 6.00 of cash when two
     remittances arrive out of order), fixed with failing-first tests and no migration change; its trade-off in ADR 0084
     (section 5). CAS-42.5 passed on d2fdd106 and runs again on the final head (the interest code changed).
   - Running, wf_d944494b-d50: three judges on F-M2-1, the remaining nits, a third review round until dry, the base
     (8a722f80) merged once, the full local suite once, the push, CAS-42.5, the body, the verification reading CI, with
     `unit` green on that head. Then ready, and the suggested line as one comment.
   - The suggested approval line is not yet posted. The domain model's hash moves with the base merge, so it is taken
     on the final head.
1. **password-changed-notice** (ADR 0091, SGN-16). Building in S2 (section 2); no PR until #126 merges. SS-01's D11
   REVOKE rides it only if the founder states the deploy fact before its database review (ruling (d), below).
2. **The granted SUITE-CAP-3 bodies of `ledger_line_net` and `ledger_entry_rules`, alone.** The founder granted the freeze
   exception at ~22:40 UTC, exactly as written in `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`.
   - One migration. It carries exactly the two granted bodies; at build start the build diffs them against the ask at the
     grant, and any difference stops the build for a new ruling. Nothing else rides it.
   - Every amount, stage, refusal and recovered total stays unchanged, proved by LED-01 to LED-18, LED-23 to LED-25, the
     ledger oracle, the refusal tests and the write-equality dumps (F at 10,000 lines, R at 2,000).
   - The ask's text was corrected after the grant (the bodies unchanged, so the grant stands): the 360 s is a sizing bound
     no release check enforces; A's month was compared on totals, not row for row.
   - Measure again on #126's base, which adds one index on the matches.
   - **D14 (ruled 2026-11-06 22:31 UTC):** the weekly run's step 7b stays on practice F at 10,000 lines. The move back to
     practice A's month is a no-migration follow-up after both this PR and Lane B's SUITE-CAP-3 worker PR merge, measured
     on that tree; if A's month is over 360 s, step 7b stays on F and the Known gap line is reworded, never removed. A's
     month is 1,653 s against the 900 s attempt today, and 310 s with both bodies.
3. **`tp-packet-verifier/3`** (packet-figure-placeholders slice 3), with #38's stored words version and `words_changed`.
   - Gated on slice 4 and the verifier identifier fold. **The `VERIFIER_FORMAT` flip ships with or after slice 4's export
     render** (S4's finding of 2026-11-06: flipping it stores token templates, which the export prints only once slice 4
     renders them). Slice 2 reaches /3 only by an explicit format argument, so nothing served changes before then.
   - **The /3 reports carry six new codes (ADR 0089):** `free_figure`, `number_word`, `unknown_fact`,
     `fact_not_canonical`, `fact_contradicted` and `fact_not_separated`, all of kind `'fact'`. The mismatch key
     `canonical` appears on `fact_not_canonical` only.
4. **#85's design §7.2, items 1 to 5**, with F4 if it is designed in time.
5. **The ledger-freeze batch:** #93's F9 (a fifth `roi_links_valid()` key), plus every other queued ledger item the founder
   grants in the same ask (`ledger_entry_within_evidence`, `ledger_line_stage`, the interest branch, whichever are designed
   by then). #93's open question 3 (the live `case.actionable_cents`) is a product ruling, not part of it.
6. **Sign-in identity:** the Cognito relink (#125's stuck-invitee note), ADR 0081 A6 (moved from PR 1), and **SEC-N5**
   (conditional: only if staging shows Cognito's `auth_time` records the sign-in's start for a challenge answered after
   the reset; otherwise left out with the reason).
7. **Mail to role holders:** SS-01 D15's suspension and reinstatement mail with Q13, and #32's unmapped-plan notice.
8. **PHI identifier lookups:** #120's F3, with **`provider_adjustment.reference`** (PHI under ADR 0027, stored in plain
   text: a keyed hash, encrypted storage and a definer screen).
9. **Triage's stored waiting patterns** (SUITE-CAP-1 design §14).
10. **Release-content health:** `operator_content_coverage()` for #59's daily `content_due` job.

**The orchestrator's rulings on the plan (2026-11-07 02:20 UTC; the co-founder: decide without asking):**
- (a) **Skip-ahead: yes.** When the next PR's gate is unmet (PR 3's slice 4 and identifier fold, PR 5's grant, PR 6's
  design), the next ready one opens and the waiting one keeps its place. Each skip is recorded in the plan's "Skips taken"
  and the PR description. Likely first uses: PR 4 ahead of PR 3; PR 2 ahead of PR 1 if PR 1's review is still open when
  #126 merges (D14 makes PR 2's delay costly).
- (b) **SEC-N5 and `provider_adjustment.reference` queued** (the safer option), in PR 6 and PR 8.
- (c) **PR 5's combined freeze ask is written now** and relayed to the founder early, so PR 5 is not idle at its turn. At
  06:25 UTC its first draft is kept as WIP (`approval-summaries/lane-a-wip/pr5-ask/draft-v1-long.md`), not relayed: it
  did not converge. A short rewrite (the frozen bodies only, yes/no questions), wf_c7d47053-463, runs.
- (d) **D11's deploy fact is the founder's statement,** asked through the co-founder (section 5). **Pending.** Until it is
  stated, D11 does not ride PR 1; it rides the first non-ledger carrier after the fact (never PR 2 or PR 5), with its
  rollback floor (never roll back past #104).
- (e) **#38 §2.2's heading governs only the stored worksheet;** the words version is not founder-gated and stays in PR 3.

Cognito PR 2 (the confidential client and cutover; ADR 0088) is not a schema PR. It waits for two things: #113 deployed to
staging, and the founder's F1 to F5 and ruling 16.

## 5. The founder's open items

- **#126's approval line:** https://github.com/PureTideWater/PhysicalTherapy/pull/126
  - S2 posts it as one suggested change on the domain model's approval line; the founder clicks "Commit suggestion", as
    for #104 and #110.
  - It is not posted as of 2026-11-07 06:40 UTC (wf_d944494b-d50 runs first; section 4, item 0).
  - password-changed-notice's line follows.
- **#126's F1 trade-off, for the founder's awareness (not an ask):** the fix of F1 means a payment netted against a
  take-back of a reversal whose claim is never uploaded is never credited: low by up to that payment, never high
  (ADR 0084 and #126's body).
- **SUITE-CAP-3's ledger freeze exception: granted** by the founder, relayed by the co-founder at ~22:40 UTC, as written in
  https://github.com/PureTideWater/PhysicalTherapy/blob/claude/build-ops/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md
  (the new bodies of `ledger_line_net` and `ledger_entry_rules`; section 4, item 2). Its PR still needs the founder's
  approval of record. The design review's round 1 (f795bf28) added the 360 s wording and two proof items to the ask; the
  two granted bodies are unchanged. Two statements in the granted text were corrected after the grant (the founder
  informed through the co-founder, 2026-11-07): the 360 s is a sizing bound no release check enforces; A's month was
  compared on totals, not row for row. The grant stands.
- **D11's deploy fact (asked through the co-founder, 2026-11-07 02:20 UTC; pending):** does every environment run an
  image that contains #104 (SS-01), so that any rollback lands on an image that contains #104? GitHub shows no
  deployments or tags. It is a fact to state, not a ruling; until it is stated, D11's REVOKE waits (section 4, (d)).
- **PR 5's combined ledger freeze ask** (ruling (c)): one ask for #93's F9 and the other ledger items designed by then,
  relayed early through the co-founder with its exact text.
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

Next free, as of 2026-11-07 01:19 UTC (CI-30 to `co-001/ux-forms-after-42`, the shell's skip link; unchanged at 06:40
UTC; #131 reworded TBL-08 and took no new number):
- **ADR 0092.** 0089 is slice 2's, 0090 UX PR 8's, 0091 password-changed-notice's.
- **Test-matrix MOD-23.** MOD-19 and MOD-20 are the verifier fold's; MOD-21 and MOD-22 are redact-ssn-phone-leaks'.
- **Test-matrix CAS-56, SEC-25, SGN-17, CI-31** (CI-30 is ux-forms-after-42's; CI-24 to CI-26 stay P2's), and in the
  other series LED-26, BIL-11, MAP-11, PRC-33, HOM-05, TBL-09, DLR-05, SCR-23, JOB-06, FRM-09, RCC-09 and DBF-06.
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
- **Custom reviewer agent types never return in workflows** (the orchestrator's lesson, broadcast 2026-11-07 01:33 UTC).
  - #126's second review round lost every reviewer of a custom type (payment-engine-reviewer, security-reviewer,
    ux-brand-reviewer) three rounds running (wf_29adffb1-b27): each ended without returning its result.
  - Run every review as a default agent that reads `.claude/agents/<type>.md` and applies that checklist.
  - **Never count an empty review as passed.** A reviewer, hunter or round that returned nothing is not a clean or dry
    round (the leak hunt's "two dry rounds" were false for the same reason); re-run it.
  - In `lanes/lane-b-session-brief.md` §5 since 2026-11-07 03:35 UTC.
- **A dead or empty agent never counts** (the orchestrator's second review lesson, 2026-11-07 06:40 UTC).
  - A review, skeptic or critic agent that dies (a usage stop) or returns nothing never counts; a round with a dead
    agent is not dry.
  - Workflow scripts must throw (or redo the agent) on a null result, as S4 did on 2026-11-07: slice 2's round 3 lost its
    agents at the 5-hour limit, was not counted dry, and resumed at 05:50 UTC with the script throwing.
  - In `lanes/lane-b-session-brief.md` §5, beside the first lesson.
- **Two agents at a time per workflow on these machines.** When findings are many, batch the skeptics per angle, not per
  finding.
- **The 5-hour limit stops a session's workflows too** (2026-11-06 ~22:58 to 00:10 UTC: every workflow on Lane B's
  account stopped and resumed at 00:35 UTC; again on 2026-11-07 at ~04:45-05:30 and ~05:00-05:50 UTC). Two heavy workflows in one session used the window in ~4.7 h, so run one
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
> (section 6). One schema PR at a time, in the batching plan's order under its rulings (section 4); decide without
> asking, as the co-founder instructed on 2026-11-06, and leave the founder-only acts to the founder. In workflows, run
> every reviewer as a default agent that reads `.claude/agents/<type>.md`, never count an empty review or a dead agent as
> passed, and have every script throw (or redo the agent) on a null result.
> Write your entries in HANDOFF.md.
