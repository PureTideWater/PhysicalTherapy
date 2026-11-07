# Lane B's handoff to Lane A (for 2026-11-10)

**Rolling: current as of 2026-11-07 15:40 UTC; finalized at stand-down.**

Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) brings this file up to date at every records commit, so a
handoff exists whenever Lane B stops. Last week the 7-day cap stopped the orchestrator itself, and the planned refresh
never happened (section 7).

The stand-down starts at 2026-11-10 09:00 UTC, before Lane A's reset (~2026-11-10 14:00 UTC). It comes sooner if Lane B's
account nears its own limit. Lane B's week resets about 2026-11-13 19:00 UTC. Since 2026-11-07 06:50 UTC its 7-day limit
is at the warning level again: near-done items go on, other builds are held at clean points, and no new item starts
(section 2).

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
   - "Handed to Lane A", its 2026-11-07 09:40 UTC entry (PR 5's freeze ask, relayed) and 03:35 UTC entry (the schema
     queue plan and the rulings on it) first, then 2026-11-06 22:45 UTC;
   - Queues items 20 (the UX PRs struck by ux-forms-after-42), 21 (the web owner's try-lock item), 22 (the SSN and
     phone leaks PR: must land before any real PHI is processed) and 23 (the static-mutant timeout CI item).
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
| 2026-11-07 03:27 UTC | **#131**, UX PR 4b: the screening result's words and tones (UX-040, UX-206, #121's P1; TBL-08 reworded, no new number; the labels re-pinned under `screening-labels/2026-11-05` with no migration, P5's four figure labels included by the 01:31 UTC ruling, its three conditions met), as **8a722f80** from 9e577017, by S5 (session_01FcouKRDfoFAeXZK4Thp8M8). CI green on 9e577017 (22 runs: unit 9,952; db 9,864; e2e 81); fresh-clone verification wf_a6153b93-653 passed; 0 tags right before the merge. One nit not taken: `lib/screening/routes.ts:836`'s doc comment "Expected less allowed", proposed to become "The Medicare figure less allowed" at the next change to that file (`approval-summaries/lane-b-ux-screening-result-words-status.md`). Its push runs on 8a722f80 are green (screening-capacity, mutation; ci on attempt 2 after one re-run of MOD-16's base flake, seed -460602131). S5 is done; the claim row is closed. |
| 2026-11-07 11:32 UTC | **#132**, ux-forms-after-42 (design 7.8; CI-30), as **ce95546d** from 109654d6, by S3 (session_01FcouKQJppM8BdCui7NVQUa). Every required check green; fresh-clone verification passed; approval-of-record re-ran green after ready. The fix round (bceda579) fixed the UX review's three should-fixes and nits; security and privacy clean (ruling: the late re-send's second result email accepted as the safer option). Its push runs on ce95546d are all green (ci, mutation, screening-capacity). The UX PR strikes and follow-up proposals: `approval-summaries/lane-b-ux-forms-after-42-status.md`. S3 stopped clean; the claim row is closed. |
| 2026-11-07 14:34 UTC | **#133**, packet-figure-placeholders slice 2 (ADR 0089, CAS-52 to CAS-54), as **d4f52071** from 79d7e1bb, by S4 (session_01FcouKPkXdRW5ntz6ye92pL). Every check green; fresh-clone verification passed; approval-of-record green after ready; the base ce95546d an ancestor. The second mutation red was CI load (a static `facts.ts` equivalent timed out), fixed by removing the redundant array branch it described (behaviour-identical; no test or timeout changed). Its push runs on d4f52071 are green (ci, mutation, screening-capacity). S4 stopped clean. Next: slice 3, the schema queue's item 2 (section 4, item 3); the CI-level static-mutant timeout fix is LANES.md Queues item 23. |

`claude/build-platform` is d4f52071 (fetched 2026-11-07 15:40 UTC; #133 merged since #132).

Nothing went into `main` (220f2b4e, unmoved since 2026-10-20), and there are no tags.

## 2. In flight

Heads were checked live at 2026-11-07 09:43 UTC (the open PRs too), status files read to 09:40 UTC; updated at 12:40 UTC from the sessions' reports to 12:38 UTC (not re-checked live: the weekly cap at its warning). **The pacing since
06:50 UTC** (the 7-day limit at its warning level; it resets 2026-11-13 19:00 UTC): MOD-16, #126 to its line, PR 5's ask,
slice 2, ux-forms-after-42, SUITE-CAP-3's build and #129 go on; P2's build and schema PR 1's build are held at clean
points; S5 stopped; no new item starts. The account's 5-hour limit stopped every
workflow between ~22:58 and 00:10 UTC, and again at ~04:45-05:30 UTC (S1) and ~05:00-05:50 UTC (S3, S4); each resumed in
its same run. **Every review in a workflow now runs as a default agent reading `.claude/agents/<type>.md`, and a dead or
empty agent never counts** (the two review lessons, 01:33 and 06:40 UTC, section 7). Each item's exact next step is in its status file's RESUME-BLOCK, or in
its log while the session runs. A branch "not on origin" has only a WIP ref.

| Item | Session | Branch, WIP ref, PR | Stage | Resume from |
| --- | --- | --- | --- | --- |
| **MOD-16: a range glued to a word** (`co-001/redact-range-glued`; CI flake, PHI) | S1, session_01FcouKP1U2GGDFhhZT9CaUV | Branch = cc3dd7f6; WIP `co-001/wip-redact-range-glued` 3fcb9359; candidate B's WIP `co-001/wip-redact-range-glued-b` fefd22d2; no PR | Built (2861bc0f, 89fb3193); gateway round 1 fixed; the re-run base-against-head differential (350,000 letters) found no digit the base redacts sent at e0cf46e0; the re-review's fixes 9ecbe6c9 and 6fc88092. **Review round 2 found PHI2-1 (blocking):** the call's own DOB, name part, member ID or claim number glued at a range end was sent where cc3dd7f6 refused only by chance (6,602 of 21,600 targeted letters). Fix round 2 (8d98b8bb to 3fcb9359; 632 of 632 gateway tests) reads the call's own identifiers across glued boundaries. **Review round 3 (03:35 UTC) found that fix itself regressed** (PHI3-1 and PHI3-2, blocking: a glued own name between an SSN or phone label and the number cuts the label, so SSNs the base redacted are sent; PHI3-3, PHI3-4; GATEWAY3-1 to GATEWAY3-3), the third round running in which a fix traded one regression for another. So **a judge workflow, wf_5d1aedda-db5,** was started: one base-against-candidate differential gate; candidates A (patch the glued reading) and B (revert it and refuse an own identifier glued across a boundary the patterns do not read); two judges; reviews with skeptics on the winner until dry. **The tie-break (ruled 03:40 UTC):** a close call goes to B (refuse where the boundary is unknowable); the winner shows zero PHI regressions per identifier kind on the gate and no must-stay damage beyond the base. **At the weekly-cap pacing (06:45 UTC) candidate A and the two judges were dropped; B is built alone against that bar.** **The gate (07:20 UTC; 975,489 seeded synthetic letters, 5,292 synthetic patients):** neither head meets the bar against cc3dd7f6: 3fcb9359 sends SSN 38,604 and phone 33,965 (about 65,000 of them the glued-own-name-cuts-the-label class), DOB 95, name parts 648 and initials 357, and damages 3,615 code or unit letters; 6fc88092 sends name parts 15,064, DOB 6,036, initials 3,455, member 2,465, claim 1,511 and SSN 7,495. **The fail-closed ruling (07:20 UTC; SSN-shaped amounts at range ends, the R1 must-stay conflict), applied verbatim to B, restarted from its progress file at 07:22 UTC:** where it is not decidable at run time, refuse as the base does (no regression, no damage beyond the base); a class is send-exempt only if the generator's ground truth shows no identifier of any kind, of any patient, in every letter of the class, and the rule decides from structure (a code-computed money figure), not surface text; one failing letter refuses the class; every class is reported with its counts in the PR description and the status file. **B's gate (10:53 UTC; fefd22d2):** initials, DOB, member ID and claim number 0; name parts 5; SSN 385; phone 171; must-stay changed 0; 679 of 679 tests; the three CI seeds 79 of 79; stress 7 x 20,000 with 0 bad; slowest 587 ms; send-exempt none; fail-safe refusals 60 and 187. **Rulings (10:53 UTC):** (A) SSN 385 and phone 171 accepted as a pinned residual (the leaks PR's class, exposed by removing MOD-16's accidental refusal), with an ADR 0054 entry naming `co-001/redact-ssn-phone-leaks` (MOD-21, MOD-22), whose acceptance is that the pinned rows flip; (B) name parts 5 (month-word name parts) accepted and recorded, a named case in the leaks PR's design. S1 restarted at review round 1 (the gate and B cached); at 12:38 UTC its fixer is on round 1's findings. **MOD-16's five seeds** (1034253323 from #128, -1074798020 from #129, 383403599 from #131, -460602131 from the base's own push run on 8a722f80, -594136649 from S3's integration run) are pinned failing at cc3dd7f6 and passing at HEAD in the final stage. It merges only with zero regressions against the base. **The critical path for #129** (a test is never skipped or pinned to get round MOD-16): when it merges, the orchestrator wakes #129. **15:40 UTC: fix round 1 on B committed as 2a5ed43b** (15:26 UTC): the gate at the bar except the ruled residuals (initials, DOB, member, claim 0; name parts 5 = B; SSN 385 and phone 171 = A, pinned); 1,717 redaction tests; an 800-run seed sweep clean; MOD-16 stress 0 bad. Review round 2: bookkeeping (8 class-A rows mis-pinned; the lone-initial residual unpinned; 2 new clean-letter refusals; a quadratic check) and PHIJ2-2. **Ruling (A'), 15:26 UTC:** the call's own name, member ID, claim number or DOB in forms no rule reads (OCR confusions, homoglyphs, date writings no rule reads), sent in held letters, is a recorded residual pinned with counts per kind; ADR 0054 names the leaks PR, whose design gets an OCR/homoglyph fold (NFKC, TR39 confusable skeleton, an O/0, l/1, I/1, S/5, B/8 map, before own-identifier matching; must-stay damage measured on the gate); the leaks PR's acceptance: the pinned A and A' rows flip; must-land-before-real-PHI covers A'. The fixer closes the forms a rule reads and the bookkeeping; the quadratic check bounded under 587 ms. S1 acknowledged at 15:27 UTC; **fix round 2 running**. Next: round 2, the base merged once, the full suite once, the push, the PR. | `approval-summaries/lane-b-redact-range-glued-status.md` |
| **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; PHI; MOD-21, MOD-22) | S1, next | Not cut; no PR | **Must land before any real PHI is processed; next for S1 after MOD-16; exempt from the cap hold** (ruling (A), 10:53 UTC; the founder owns launch). Its acceptance: MOD-16's pinned rows (SSN 385, phone 171) flip; its design carries the month-word name-part case (ruling (B)). Mapped, not built. The read-only hunt wf_8da6dd19-398 found 52 candidate classes at cc3dd7f6 in round 1. The 5-hour stop lost its round-2 skeptics, rounds 3 and 4 and the synthesis; S1 holds it until range-glued's build ends, then reruns it. The synthesis (the design input) goes to build-ops before any stand-down. | The range-glued status file, until its own exists; LANES.md row |
| **Packets verifier identifier fold** (MOD-19, MOD-20) | S1, third | `co-001/packets-verifier-identifier-fold` not on origin, no commits; no PR | Three scouts done; design next. It shares verifier files with slice 2 and the /3 migration. | `approval-summaries/lane-b-packets-verifier-identifier-fold-status.md` RESUME-BLOCK |
| **Interest credited once** (schema, acting Lane A) | S2, session_01FcouKQthXdmDnPmwhFepxW | `co-001/ledger-interest-once` 9c68a4be (live 09:43 UTC; = WIP `co-001/wip-interest-fix`); draft #126 | CAS-42.5 passed on d2fdd106 (run 42307508461: working set 668.3 of 921.6 MiB; F's reconcile 603.0 s of 900 s). The second review round, redone with default agents (wf_a71650bd-ea2, three rounds), found **F1 (MONEY-R2-1), a blocking money defect, confirmed by a red db test:** with two remittances uploaded out of order (two-chains.835 before paired.835), a PLB L6's payment written in one reconcile pass blocked its own take-back in the next, leaving 11.40 of interest on the lines against 6.00 of cash. **Fixed at 9824f4e9** (8ea33e13): `interestWrites` holds a PLB L6's payments while any take-back of a chain that may still hold interest is not written in full; both orders end at 0 on the lines, never above the cash; LED-23's renumbered-reversal overstatement (5.40) closes too; failing-first db, unit and property tests; `interest.ts` 100% (328 mutants); no migration change; the domain model unchanged. **The trade-off (ADR 0084 and the PR body; for the founder's awareness, section 5):** a payment netted against a take-back of a reversal whose claim is never uploaded is never credited: low by up to that payment, never high. F2 (9824f4e9): the runbook for the lock loop's 55P03, with a guard test. **Running, wf_d944494b-d50 (in its round 4 at 08:44 UTC; head 9c68a4be at 08:45 UTC):** three judges on F-M2-1, the remaining nits, a third review round on everything since d2fdd106 (until dry), the base (8a722f80) merged once, the full local suite once, the push, CAS-42.5 on the final head (the interest code changed), the body, the fresh-clone verification. Then ready, and the suggested line (not posted yet). **12:40 UTC:** round 4 at 9c68a4be (11:10 UTC) fixed F-M2-1 (three of three judges: LED-R1's widening mis-split a PLB L6 naming the latest correction), MONEY-R4-1 (a later claim match could put interest above the cash) and nits; round 2 then confirmed two more money should-fixes (a partly written take-back gave an order-dependent outcome; `mayYetHold`'s condition (b) had no committed test), in progress at 12:38 UTC; then round 3, the full suite, CAS-42.5, the body, the verification. | `approval-summaries/lane-a-schema-chain-status.md` (its 19:50 UTC section, then the RESUME-BLOCK) |
| **password-changed-notice** (schema PR 1 of the plan; ADR 0091, SGN-16) | S2, beside #126 | `co-001/password-changed-notice` f110efd9 on origin (stacked on #126); WIP `co-001/wip-pwnotice` c0ced87f; no PR | **Held at a clean point (06:42 UTC)** at the weekly-cap pacing. Built since 02:20 UTC (wf_5cf101cd-7ab): a design addendum with a reviewer and skeptics; migration 20261111090000 through the marker route; the database, worker and infra, and records parts pushed (f110efd9); WIP c0ced87f (the base 8a722f80 merged, the seam tests); `unit` 10,065 green. The suite, the three reviews (security and sign-in; database, mail and deploy; UX and brand with renders) with skeptics and a critic, and the fix round wait for #126's founder line. No PR until #126 merges. D11 and ADR 0081 A6 do not ride. Its renders show #129's White plate: #129 should merge first, or PR 1 renders again after it. | `approval-summaries/lane-a-auth-emails-status.md` (its RESUME-BLOCK) |
| **Email lockup plate** (O-5, O-8) | session_01FcouKRo5iee5QFtPT8UimZ (S3's second item, run in parallel) | `co-001/email-lockup-plate` f4fef908; draft #129 | **Waits on `co-001/redact-range-glued`.** CI on f4fef908 green but `unit`: MOD-16, seed -1074798020 (the base's defect; #129 changes no gateway file); its one re-run failed the same way. Nothing more is pushed meanwhile, and no test is skipped or pinned to get round MOD-16 (f4fef908 unchanged at 09:43 UTC). Its three ux-brand-reviewer rounds each returned a real result (none empty). **Its check-ins stopped at 08:38 UTC:** it is idle until the orchestrator messages it after range-glued merges (below). When range-glued merges: the base (now ce95546d) merged once, the fast checks and the generators, the push, CI green, the fresh-clone verification, ready, the merge. | `approval-summaries/lane-a-email-lockup-plate-status.md` |
| **Packet figures as placeholders, slice 2** (ADR 0089, CAS-52 to CAS-54): **done** | S4, session_01FcouKPkXdRW5ntz6ye92pL (stopped clean) | `co-001/packet-figure-placeholders-2` 79d7e1bb; #133 merged as d4f52071 (14:34 UTC) | Built in two parts (0fc43dcd, a3d234ce); round 1's nine findings (two blocking) fixed in d21f4577 (new code `fact_not_separated`); the `template.ts` equivalent signed in d96a053a. Round 2 (wf_db15c2a6-888) runs its loop-until-dry review rounds: NEW-1 fixed in code (3d44aff7: a sign set off before a fact token fails it), NEW-2 an accepted reading in ADR 0089 (c3a2743e), then 2f3726ad (the separation check in linear time) and 0b5ca610 ($0.00 interest and two releases pinned; 03:16 UTC). **Round 2 done:** 12 more findings fixed, one **blocking** (a `draft.ts` mutant recorded and signed as "equivalent" hid a real $0.00-interest print in the /2 draft's interest guard; fixed with a test; WIP 0b5ca610). Round 3 was not counted dry (its agents died at the 5-hour limit) and resumed at 05:50 UTC with the script throwing on a dead skeptic or critic (section 7). **Reviews done (07:03 UTC):** round 3 nits only (e30a44aa); the critic's one finding fixed (a `draft.ts` "equivalent" was not equivalent; a test now kills it): WIP 7e9618e3. **Suite stage (wf_ca36d6f2-079):** the base 8a722f80 merged as a851850d, the one full local suite green, the branch pushed at a851850d, the PR body prepared (the status file at 09:37 UTC). **Draft #133** at a851850d, opened 09:38 UTC (subscribed; CI running). **12:40 UTC: head 972cae9c** (the base ce95546d merged clean). The mutation gate was red on a wall-clock test (100k-character templates under 1,500 ms) failing under CI load with a mutant active; the test moved unchanged to its own file, still run by `unit`, excluded from mutation runs like pricing's performance test (7984faa8; 15 packets shards and the gate green, scores identical); the orchestrator checked it is not a skip. The mutation check was red again at 12:36 UTC; six packets shards re-running. **Merged as d4f52071 (14:34 UTC; head 79d7e1bb):** the second mutation red was CI load (a static `facts.ts` equivalent timed out), fixed by removing the redundant array branch it described (behaviour-identical); push runs green; S4 stopped. Its /3 codes for Lane A: section 4, PR 3. | `approval-summaries/lane-b-packet-figure-placeholders-status.md` (the SLICE-2 section) |
| **SUITE-CAP-3, the worker-side build** (CAS-49 to CAS-51, ADR 0087) | session_01FcouKP4ekrT97eyDtLe4Rd (its own; not S5) | `co-001/suite-cap-3-reconcile` 31a7345f (fast-forwarded; no commits of its own yet); WIP `co-001/wip-suite-cap-3-build`; no PR | **Design reviewed** (b27a9861): seven rounds of default agents (payment-engine and security checklists), three skeptics per finding: 46 findings, 31 applied, 15 refuted; verdict BUILD. **Corrections to the granted ask's text** (38123394; the two bodies unchanged, so the grant stands; the founder informed through the co-founder): the 360 s is a sizing bound no release check enforces; A's month was compared on totals, not row for row (row for row holds at F 10,000 and R 2,000). D14 written into the design (§0, D9, D14, 8.4, 14.1). **BUILD GO 02:15 UTC, worker-side only:** slices 1 to 6 and 5a, step 7b on F at 10,000 lines; no migration, index or table. wf_f2526ebe-769 (each slice red first, a skeptic verifier); check-in 07:27 UTC. **The pacing (06:50 UTC):** taken to its merge with no stage skipped and nothing spent that does not change the outcome. At 09:37 UTC it is re-running the setup after a machine restart left /root at 0700 (the setup fix, section 7). **12:38 UTC: slices 1 and 2 committed; slice 3 building.** Next: the push, the draft PR, two reviews. The web owner's item (LANES.md Queues item 21) comes from its §14.4 item 14. | `approval-summaries/lane-b-suite-cap-3-status.md` |
| **ux-forms-after-42** (design 7.8; test-matrix CI-30) | S3, session_01FcouKQJppM8BdCui7NVQUa | `co-001/ux-forms-after-42` 109654d6; #132 merged as ce95546d | **Designed** 01:20 UTC (wf_8ed4a036-bce; 27 findings applied; `designs/lane-b-ux-forms-after-42.md`). **CI-30 allocated** 01:19 UTC (the shell's skip link). **Built** (wf_24fdaecd-29b): slices U (bfe8c135), C (a1ba3b0f), W1 (aeb3f242) and W2 (23599a55) integrated with E into WIP dab7d237 (on origin); typecheck, lint, the generators and the browser harness green; `pnpm test` 10,014 with one MOD-16 failure (seed -594136649, the base's flake); test:db 9,870; e2e 84 of 84. Two check rounds, their findings repaired; 105 after-shots. **Draft #132 opened** (08:03 UTC) at 76da396a (85 files). **Next, wf_1bd58daa-b34:** the UX and brand review with shots and the security and privacy review (including a ruling on the late re-send's second result email), skeptics and a critic, one fix round with the base 8a722f80 merged, the full suite once, one push, the description; then CI, the verification, the merge. It covers parts of queued UX PRs 67, 68, 74, 75 and 84 (struck in LANES.md Queues item 20). **Merged as ce95546d (11:32 UTC; section 1); push runs green; S3 stopped clean (11:48 UTC), free, no new item under the cap.** | `approval-summaries/lane-b-ux-forms-after-42-status.md` |
| **S5** (4b merged as #131; done) | S5, session_01FcouKRDfoFAeXZK4Thp8M8 | None | **Done clean (06:47 UTC):** #131's push runs on 8a722f80 green; its status file final; no check-ins, workflows or worktrees left. At 06:40 UTC it refused P2 without a typed human go (an older session), so P2 went back to its own session (next row). Free; it takes no new item under the pacing. P5, UX PR 8 (ADR 0090, SGN-09 to SGN-12) and dark-mode-ship wait for new sessions created with the `append_system_prompt` authorization, when the cap allows. | `approval-summaries/lane-b-ux-screening-result-words-status.md`; each item's LANES.md row |
| **P2: Trivy's version** (`co-001/ci-trivy-version`; CI permissions; CI-24 to CI-26, N33 to N42, P38 to P42) | ci-pin-age, session_01FcouKNP2XtaombFLueKLnu (its original session; it holds the design) | Not on origin (no commits; = the base 8a722f80); no WIP; no PR | **Held before the build** at the pacing. The delta re-read is done (08:30 UTC; wf_ab899371-7bf: 19 findings, 5 S and 14 N; 17 fixed, 2 refuted; target Trivy v0.76.1). #107's de7438c8 ages `tools/trivy/release.txt` by the action pins' default-branch rule, so P2 moves Trivy to its own verified release-branch rule (the 3-day floor kept). **Ruled 08:30 UTC:** that per-release exclude is not the founder's (the founder's exclude under the floor and the 48-hour database floor untouched); no relay. Its check-in trig_01R6nXDdCD43e1PypnQ2Dtwi is settled at the stand-down (below). On resume: the build alone, two reviews (CI and test infrastructure; security and supply chain), the fix round, CI, the verification, the merge. | `approval-summaries/lane-b-ci-deps-status.md` (build-ops 097acc24; its EXACT NEXT STEP) |
| **No web request waits on a reconcile pass** (for the web owner; no migration) | Not assigned | Not cut | Queued 02:15 UTC from SUITE-CAP-3's design §14.4 item 14: the reopen, the write-off and the five manual reconciliation actions take the `ledger:` lock with `pg_try_advisory_xact_lock` and refuse at once with an identifier-free, retryable refusal, never a blocking wait. On the base today each can hold one of the web's 10 connections for a whole pass. | LANES.md Queues item 21 |
| **Kept and idle** | session_01FcouKNB2TyuPCAha9BaEjQ (#48, the narrative draft; ADR 0076, CAS-35 to CAS-37) | — | #48 waits for slice 2. Not started this week. | `approval-summaries/lane-b-unmapped-plan-status.md` |
| **Dependabot #122, #123, #124** | None | Open, behind the base | Untriaged. Never merged as they stand; one replacement PR, like #94. | LANES.md rule 7 |
| **Static-mutant timeouts under CI load** (CI; LANES.md Queues item 23) | Not assigned | Not cut | Queued 15:40 UTC from S4's #133 proposal; not started under the cap. About 14 recorded static packets equivalents share the timeout margin under CI load with the base. Close the class at CI level: Stryker concurrency below the vCPUs, or a timeout factor for static mutants; the design picks the option that never turns a real kill into a survivor. | `approval-summaries/lane-b-packet-figure-placeholders-status.md` |

**Open PRs (15:40 UTC, from the sessions' reports):** drafts #126 and #129 (f4fef908); Dependabot #122, #123 and #124
(untriaged). #133 merged (d4f52071). No tags.

**Check-ins and wakes outstanding:**
- P2's check-in trig_01R6nXDdCD43e1PypnQ2Dtwi fires at 2026-11-13 19:15 UTC, after Lane B's reset. Settle it at the
  stand-down: cancel it, or hand it to Lane A.
- #129 has no check-in (stopped 08:38 UTC): when `co-001/redact-range-glued` (MOD-16) merges, the orchestrator messages
  session_01FcouKRo5iee5QFtPT8UimZ to wake it. #126 takes the fixed base at its own base merge.
- **The leaks PR (`co-001/redact-ssn-phone-leaks`) must land before any real PHI is processed; next for S1 after MOD-16; exempt from the cap hold** (ruling (A), 2026-11-07 10:53 UTC; it covers the A' rows and gets the OCR/homoglyph fold, ruling (A'), 15:26 UTC).

One thing is not yet allowed:
- **The verifier identifier fold and the /3 migration** both touch the packet verifier (slice 2 merged as d4f52071), so
  they go one at a time (rule 6: check the other's branch first).

`infra/lib/heap.ts`'s `--max-old-space-size=560` on the worker task is allowed since #130 merged (2026-11-06 22:55 UTC).

## 3. The first item for Lane A

**Take the schema chain back from S2 (session_01FcouKQthXdmDnPmwhFepxW) at its RESUME-BLOCK** in
`approval-summaries/lane-a-schema-chain-status.md`. This section is rolling; at 2026-11-07 09:40 UTC that means #126:
- **First check** whether the founder has committed #126's approval line, and whether every required check is green on
  the latest commit.
- **If both hold,** merge #126 under rule 2a (the base merged right before, with one CI re-run if the base moved). Then
  open schema PR 1, password-changed-notice, from S2's held build (`co-001/password-changed-notice` f110efd9, WIP
  `co-001/wip-pwnotice` c0ced87f, stacked on #126; migration 20261111090000; its suite, reviews and fix round run after
  #126's line; `approval-summaries/lane-a-auth-emails-status.md`), and follow the batching plan (section 4) under its
  rulings.
- **If #126 still waits on the founder,** relay its link and open no other schema PR.

Then take back the counters (section 6). Lane B keeps its own items, its sessions and the PHI leak PR.

## 4. The schema queue: the batching plan (one at a time, each with the founder's committed line)

**The plan of record:** `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` (acting Lane A, S2; read-only
wf_255f9403-721, three rounds of a critic and a risk skeptic). **10 schema PRs for about 22 queued items** (about 18
founder approval cycles if each shipped alone). Still one schema PR open at a time, each regenerating `domain-model.md` and
`packages/db/functions` and carrying the founder's committed line. A batch never widens a grant.

0. **#126, the interest fix.**
   - Draft at 9c68a4be (live 09:43 UTC; in its round 4 at 08:44 UTC). Review F1, the blocking money defect (11.40 of
     interest held against 6.00 of cash when two remittances arrive out of order), fixed with failing-first tests and no
     migration change; its trade-off in ADR 0084 (section 5). CAS-42.5 passed on d2fdd106 and runs again on the final
     head (the interest code changed).
   - Running, wf_d944494b-d50: three judges on F-M2-1, the remaining nits, a third review round until dry, the base
     (8a722f80) merged once, the full local suite once, the push, CAS-42.5, the body, the verification reading CI, with
     `unit` green on that head. Then ready, and the suggested line as one comment.
   - The suggested approval line is not yet posted. The domain model's hash moves with the base merge, so it is taken
     on the final head.
1. **password-changed-notice** (ADR 0091, SGN-16). Held clean in S2 at the pacing (06:42 UTC; section 2); no PR until
   #126 merges. SS-01's D11 REVOKE rides it only if the founder states the deploy fact before its database review
   (ruling (d), below).
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
   - **Slice 2 merged as #133 (d4f52071, 2026-11-07 14:34 UTC):** this item (the schema queue's item 2) is slice 3, next
     for the item; the notes above stand as merged.
4. **#85's design §7.2, items 1 to 5**, with F4 if it is designed in time.
5. **The ledger-freeze batch:** #93's F9 (a fifth `roi_links_valid()` key), plus every other queued ledger item the founder
   grants in the same ask (`ledger_entry_within_evidence`, `ledger_line_stage`, the interest branch, whichever are designed
   by then). #93's open question 3 (the live `case.actionable_cents`) is a product ruling, not part of it. The combined
   ask is ready and relayed, awaiting the founder (ruling (c), below; section 5).
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
  did not converge. The short rewrite (the frozen bodies only, yes/no questions; wf_c7d47053-463) is **ready** (08:44
  UTC): `approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`, relayed to the co-founder at 08:45 UTC for the
  founder (section 5).
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
  - It is not posted as of 2026-11-07 12:40 UTC (wf_d944494b-d50 runs first, in its round 4; section 4, item 0).
  - password-changed-notice's line follows.
- **MOD-16's residual and the leaks PR (the founder owns launch; for awareness, not an ask):** the orchestrator's
  rulings of 2026-11-07 10:53 UTC on candidate B: (A) SSN 385 and phone 171 of 975,489 synthetic letters accepted as a
  pinned residual, with an ADR 0054 entry naming `co-001/redact-ssn-phone-leaks` (MOD-21, MOD-22), whose acceptance is
  that the pinned rows flip; (B) 5 month-word name parts accepted and recorded, a named case in the leaks PR's design.
  The leaks PR must land before any real PHI is processed; next for S1 after MOD-16; exempt from the cap hold.
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
- **PR 5's combined ledger freeze ask (ruling (c)): relayed, awaiting the founder.**
  `approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md` (build-ops 9102eadf; base 8a722f80), relayed to the
  co-founder (a push notification and the chat) at 2026-11-07 08:45 UTC, for Tyler. Three yes/no questions, each a
  ledger-frozen function body in its appendix:
  - Q1: `roi_links_valid` accepts a fifth key, `actionable_open_lines`;
  - Q2: `roi_statement_rules` checks a new statement's figure against the lines it lists (only with Q1);
  - Q3: `roi_links_valid` refuses an empty links object `{}`.

  Lane A recommends yes to all three. The grant is the appendix text only, for PR 5 only. SUITE-CAP-3's further ledger
  items are a later ask.
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
  And P2 (2026-11-07 08:30 UTC): the orchestrator ruled that Trivy's per-release exclude is not the founder's (the
  founder's exclude under the floor and the 48-hour database floor are untouched), so it is not relayed
  (`approval-summaries/lane-b-ci-deps-status.md`).

## 6. Counters (Lane B allocates until Lane A returns)

Next free, as of 2026-11-07 01:19 UTC (CI-30 to `co-001/ux-forms-after-42`, the shell's skip link; unchanged at 09:40
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
  - S5, an older session, refused P2 without a typed go (2026-11-07 06:40 UTC). P2 went back to its own session, and
    later queue items go only to sessions created with the authorization.
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
- **A machine restart leaves /root at 0700,** so the PostgreSQL clusters stay down (found by SUITE-CAP-3, 2026-11-07).
  The fix, 6bc01e3d on build-ops (`tools/setup-container.sh`): `start_server` reopens /root to 0755 before
  `pg_ctl start`. Verified at 06:50 UTC (0700 reproduced; the setup restored 0755 and started both clusters). A session
  whose PostgreSQL is down re-runs the setup.
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
