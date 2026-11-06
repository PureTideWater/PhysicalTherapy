ACTING (Lane A's account, https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J) holds this item from 2026-11-04T19:45Z; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Lane B item: letters have Social Security and phone numbers redacted by pattern (`co-001/redact-ssn-phone`)

Created 2026-11-01T14:50:00Z by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) from the item prompt
`lanes/lane-b-item-prompts-2026-11-01/redact-ssn-phone.md`.
Session: session_01FcouKP1U2GGDFhhZT9CaUV (https://claude.ai/code/session_01FcouKP1U2GGDFhhZT9CaUV), from 2026-11-01T16:57Z. GitHub login: PureTideWater (checked 2026-11-01).
Reserved (LANES.md claim row 198): ADR 0088 if the design needs more than an ADR 0054 amendment; test-matrix MOD-15 to MOD-16;
`packages/synth` the same as MOD-13 if needed: `matrix.ts` entries plus `registry.ts` entries `none(10, '<why no file>', [test
paths])` with no fixture file, in the existing MOD module (module 9; the `10` is `completesIn`, the milestone, not a module
number). No migration timestamps. Gateway-only Lane B work, never a schema PR. If only ADR 0054 is amended, ADR 0088 is
released: record it here and tell the orchestrator.
Follow-on: none.

## Now (2026-11-02T02:12Z)
- **PAUSED** on the co-founder's pacing call (relayed by the orchestrator 2026-11-02 02:10 UTC: the 7-day limit is at its
  warning level; resets 2026-11-06 19:00 UTC). Clean point: stage 1 (design) done; nothing built, no branch, no PR, no WIP ref
  needed (no code). One send_later at 2026-11-06T19:15Z; all other check-ins cancelled. Resume only when the orchestrator says.
- **Stage 1 (design) done; waiting on #75's merge to build.** Design `designs/lane-b-redact-ssn-phone.md` (reviewed: one reviewer,
  a completeness critic, two-lens verification; F1-F12 and C1-C10 all applied; section 17 R1-R13 is the rule set the build follows).
  Workflow wf_8670bbfd-b5d, archived as `workflow-scripts/lane-b-redact-ssn-phone-design-wf_8670bbfd-b5d.js`.
- **ADR 0088 released:** the change is an amendment of ADR 0054 (plus a dated sentence in ADR 0070 N6). Told the orchestrator.
- **#75** (checked 17:55Z): open, draft, `dirty`, head 871faff9, not merged. Build step 0 (design §13) diffs #75's merged gateway files
  against 871faff9 and re-runs the probe and the prototype if any changed, before anything is built.
- **The ruling:** the founder (Tyler Williams), 2026-11-01: a payer letter has its Social Security numbers and phone numbers
  redacted by pattern before the model reads it (`readDenialLetter`), as a PRD §14 "PHI minimization" requirement. The
  co-founder relayed it to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, 18bbe0e9, 14:04 UTC) and confirmed it in
  session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC. Addresses stay a residual: the ruling does not cover them.
- **Today:** the gateway redacts only the patient's own identifiers: names, date of birth, member IDs and the call's claim
  numbers (PRD.md:575 on 83d71fd6). ADR 0054 lines 370-371 list "addresses, phone numbers and Social Security numbers, which
  PRD 14 does not list for redaction" as residuals.
- **Where it goes:** the one-pass folded matcher in `packages/model-gateway/src/redact.ts`, which #80 built and #75 extends. No
  over-redaction of amounts, dates, claim numbers, NPIs or codes; the self-check refuses a letter in which an SSN or phone form
  survives, with a refusal that names no number.
- **Branch:** `co-001/redact-ssn-phone` is not on origin; no WIP refs. The base `claude/build-platform` (83d71fd6) does not
  contain #75: cut the branch only from a base head that contains #75's merge commit. Read #75's code from
  `co-001/contract-phi-check` at 871faff987298fdbf493a092e3d13c2325e64309 (contains #80's 0dd1ba7e); `co-001/wip-contract-phi-check-5`
  (7f77cb19) has identical model-gateway, PRD and ADR 0054 files. Never commit or push to #75's branch or WIP refs.
- **PR:** none yet. #75 is open, draft, `dirty`, at 871faff9 (updated 2026-10-28T03:54Z); its own session resolves its base
  conflicts.
- **Design:** none yet. Create `designs/lane-b-redact-ssn-phone.md` on claude/build-ops. Prior art:
  `designs/lane-b-redact-placeholders.md`; ADR 0054's #80 amendment (lines 268-378 on 83d71fd6; residuals at 370-371, 372-373
  on 871faff9); `designs/lane-b-model-eval-gate.md` §5 and Appendix A.3; `lane-b-redact-placeholders-status.md` Proposals.

## Corrections: records that live state contradicts
1. **The claim row said "PRD 14 records the ruling". It does not.** On 83d71fd6, PRD.md:575 lists only names, dates of birth,
   member IDs and claim numbers; on 871faff9 #75 edits that paragraph and still adds no SSN or phone; ADR 0054:371 still calls
   them unlisted. The ruling exists only on build-ops (`approval-summaries/founder-asks-2026-10-27.md` "Decided 2026-11-01",
   LANES.md row 198 and rule 4, `lanes/lane-b.md`:1024, `lanes/lane-a-handoff-to-lane-b.md` §3 and §7). This PR records it, with
   who and when, in PRD §14, ADR 0054 (or 0088) and reconciliation-001 (rule 8). The claim row was corrected on 2026-11-01 at
   14:50 UTC.
2. **"Relayed 2026-11-01" is incomplete.** Recorded as: the founder (Tyler Williams), 2026-11-01; the co-founder relayed it to
   Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, 18bbe0e9, 14:04 UTC) and confirmed it in session_01FcouKNNHsdecRMzfTs7XwW at about
   14:40 UTC.
3. **"Builds on #80's folded matcher" is not the whole picture.** Build on #75's `redact.ts`, which contains #80: +356/-5 lines
   (1,166 lines against 815 on the base; `SCREEN_FLOORS`, `screenIdentifier`, `runIndex`, `someIdentifierRun`,
   `identifierRuns` and more); `redact.test.ts`, new, 491 lines; `functions/denial-letter.ts` (`denialLetterSpec` frozen); the
   same PRD §14 paragraph; ADR 0054's header (lines 3-9) and end (from line 378).
4. **"synth the same as MOD-13"** means `matrix.ts` entries and `registry.ts` `none(10, …)` entries, no fixture file, in the
   existing module 9 (MOD). No new module is needed and none is reserved. The redact-placeholders claim row's "synth module 10"
   read `completesIn` as a module number (corrected in LANES.md on 2026-11-01 at 14:50 UTC).

## Log (UTC)
- 2026-11-01T14:50:00Z: created by Lane B's orchestrator. The item session starts now: design first; the build waits for #75's
  merge.
- 2026-11-01T16:58Z: session_01FcouKP1U2GGDFhhZT9CaUV started. Setup (build-ops e92795ee) printed OK: it moved the base image's
  Node v24.22.1 aside itself and installed v24.22.0; every line ok, playwright included; pre-push hook and gitleaks 8.24.3 in place.
  Live state re-checked: claude/build-platform 83d71fd6, #75 still at 871faff9, no `co-001/redact-ssn-phone` branch. The read-only
  probe worktree `/home/user/redact-ssn-phone-probe` (detached at 871faff9) is installed.
- 2026-11-01T17:01Z: stage 1 started: the design workflow wf_8670bbfd-b5d (script archived as
  `workflow-scripts/lane-b-redact-ssn-phone-design-<runId>.js` when it ends).
- 2026-11-01T17:55Z: stage 1 done (wf_8670bbfd-b5d, 7 agents: probe, designer, design reviewer, completeness critic, two verifiers,
  applier). The probe: all 36 SSN and phone forms pass through #75's redactor today and nothing on the must-not-redact list is
  altered; baseline 56-307 ms per crafted 100 kB letter. Review: 12 reviewer findings (F1-F4 blocking: amounts/dates over-redacted
  across a period and a space gap; a line break inside a number leaks; the self-check shared the matcher so it could not catch a
  miss; label/keep-noun precedence) and 10 critic findings; neither verifier refuted any; all applied, the self-check now has an
  independent survivor scan (R7). Prototype after review: 66 named rows as the rules say; 17-381 ms per 100 kB letter. ADR 0088
  released. Design and script committed on build-ops.
- 2026-11-01T18:30Z: the orchestrator relayed a #75 finding (years()/iso() accept a four-digit year below 100, so `0023-04-26`
  is kept as a date; MOD-13 seed 1162287068 at bce57f16; #75's session fixes it inside #75). Added to the design as §17 R14: step 0
  re-reads the fix, a named regression test for date-shaped identifiers, and the survivor scan treats an implausible-year date as
  digits.
- 2026-11-01T19:56Z: #75 still unmerged (871faff9, dirty); hourly send_later check continues. Reported to the orchestrator.
- 2026-11-01T20:37Z: the orchestrator's merge rule of 20:36 UTC (merge when verified and green; the section-6 order only between
  PRs that conflict) does not change this item: it builds on #75's code (`redact.ts`, its tests, PRD §14, ADR 0054), so it still
  waits for #75's merge before the branch is cut.
- 2026-11-01T22:01Z: #75 still unmerged (PR head 871faff9, dirty). Its session has pushed WIP refs `-6` (7cd60740) and `-7`
  (cf61a828): a base merge of 83d71fd6, 3a033b32 (a written date needs a plausible year: the R14 fix) and cf61a828 (a letter's
  number joins over `_`, `|` and `\`; a number stays a date only when it is that whole date). Against 871faff9 they change
  `redact.ts` (+48 lines net), `redact.test.ts`, `redact.property.test.ts` and ADR 0054. Build step 0 must re-read these: the join
  set and the whole-date rule touch design §3 (joiners), §17 R1/R7 (date barriers in the survivor scan) and R14.
- 2026-11-02T01:01Z and 02:02Z: #75 still unmerged (PR head 871faff9, dirty); a newer WIP ref `-8` (49156dd8) exists. Step 0 reads
  #75's merged state, whatever its last WIP was.
- 2026-11-02T02:12Z: paused on the co-founder's pacing call (orchestrator, 02:10 UTC). Check-ins cancelled except one at
  2026-11-06T19:15Z. Reported to the orchestrator.

## Waiting on someone
- **#75's merge** (its own session, S4): the build waits for it (cut only from a base containing its merge commit).
- **For the co-founder (decided here as the safer option; none blocks):** design §15 items 15.1-15.17. The main ones: unlabeled
  bare nine- and ten-digit numbers are redacted unless a keep-noun (claim, ICN, reference, NPI, TIN, check, trace...) names them
  (15.1, 15.15); the payer's own phone numbers are redacted (15.2); a reference written in an SSN or phone shape is redacted (15.3);
  an SSN or phone label beats a keep-noun, except NPI and TIN/EIN numbers they name (15.11); an independent survivor scan in the
  self-check may send unusual letters to hand handling (15.12); a bare ZIP+4 with no ZIP word becomes [SSN] (15.14); a payer letter
  misfiled as a contract is not redacted here (15.16, proposal 16.8). Refusals reuse `identifier_left` with no number (15.9).
- Nothing blocks. The ruling is decided (the founder, 2026-11-01) and confirmed by the co-founder.
- New trade-offs the design raises go to the co-founder through the orchestrator (the founder's delegation of 2026-10-25 covers
  security trade-offs on Lane B's work), for example an unlabeled bare 9-digit number that may be a claim number or member ID,
  or the payer's own letterhead phone being redacted. Each blocks only that point.
- Merge: non-schema, so on green CI after the fresh-clone verification (rule 7). Runbook 3i and `APPROVAL_REVIEW_REQUIRED`
  stay the founder's and do not block. #75's F1 floors and F2 (legal) are the founder's and do not block.

## Proposals (outside this PR)
Design §16 items 1-10, among them: fold every digit to ASCII across the redactor (other-script digits in names, member IDs and dates);
fix #80/#75's general gaps the probe found (the call's own claim written `(555) 012-3456` or `555.012.3456` is sent today when it is
not SSN/phone-shaped by the new patterns' reach; `)` and `.` between digits and the 3-token cap in identifierCandidates); widen
`readDate` (figures.ts) to every `datesIn` form; MBIs as a pattern; 16.8 the contract screen refuses a page holding an SSN; 16.9
align packages/observability phi-guard's SSN and phone shapes; 16.10 log prepare refusals (IDs only) once the letter reader has a
caller.

## Next step
Paused. On resume (the orchestrator says so, after 2026-11-06 19:00 UTC or a raised limit): re-run setup if PostgreSQL is down
(`bash /tmp/setup-container.sh`; the probe worktree `/home/user/redact-ssn-phone-probe` may need re-adding at 871faff9 if the
container was reclaimed); check #75 with `gh api repos/PureTideWater/PhysicalTherapy/pulls/75 --jq '.merged, .merge_commit_sha'` on
an hourly send_later (no polling; do not subscribe to #75). Once merged: design §13 step 0 (diff #75's merged gateway files, PRD §14,
ADR 0054, test-matrix and synth against 871faff9 — expect at least the WIP -7/-8 changes: plausible-year dates, joins over `_`, `|`,
`\`, whole-date rule; re-run the probe and the prototype in a scratchpad if any gateway file changed; reconcile design §3, §17 R1,
R7, R14 with them; record); cut `co-001/redact-ssn-phone` from a base containing #75's merge (item prompt step 6); setup with
`co-001/redact-ssn-phone:/home/user/redact-ssn-phone`; remove the probe worktree; then the build workflow (stage 2) on design §13
and §17, and the draft PR (stage 3).

## Acting Lane B S1 (session_019i9ifCJSbPYXpafL86Rm6J), from 2026-11-04 19:45 UTC
- Assigned by Lane A's orchestrator (07:40 UTC) after #85. #75 merged as 72096e94 and #115 (redact-label-boundary, the label-boundary fix on the same matcher) as 00fd2906. Branch `co-001/redact-ssn-phone` cut from **00fd2906**, worktree `/home/user/redact-ssn-phone`; the probe worktree is not needed (the base holds #75's code).
- Build workflow running (script archived as `workflow-scripts/lane-b-redact-ssn-phone-build-<runId>.js`). Step 0 re-reads #75's final redact.ts (fixes 4, 4b, G1-G4, phi-G2-regress-1, numero-glued, label-end-dash) and #115's label rules against design §17 and re-runs the probe and prototype. Then the build per §13 and §17 R1-R14, and two adversarial reviews (security; correctness with the redaction oracle), each finding checked by a skeptic. Then fixes, the full suite once, and a critic. No push yet.
- 2026-11-04 19:46 UTC: build workflow **wf_58fc6224-3b6** running (script archived). Check-in 2026-11-05 00:50 UTC (trig_017ncjQAb2f3wnv8w2zxyb4S).
- 2026-11-05 ~06:30 UTC: **wf_58fc6224-3b6 done** (20 agents, ~10.7 h). Step 0: the design fits the merged code with 13 adaptations (`wip/step0.md`). Build: 9c9b1768, 77f5f1c8, 88aaa649. Reviews: security SEC-1 to SEC-6 and correctness corr-ssn-1 to -6; skeptics confirmed 11 and refuted 1 (corr-ssn-5). Fixed in round 1 (9c0a90fd .. d51286e8, 6a8cff99) and round 2 (base f185655c merged 4dc9a110; be3b35e6, ef901af6, bf12d736, 11f0ee29, 10b48fb3). Full suite on 10b48fb3: unit 9,621 / 4 skipped; db 145 files 9,814 / 1 skipped; golden 381; e2e 81; oracle, eval, synth, watched, verify-content, check:fixtures, stryker (no shard), freeze, build, gitleaks and the hook all pass. Critic 2: one blocking gap (an issued-area SSN twin in denial-letter.test.ts:673), fixed as an area-000 twin. Then base f7d609cc (#110) merged clean (four shared docs, both sides kept); typecheck, lint, lint:logs, lint:copy, check:fixtures, touched tests 1,672, eval pass, generators wrote nothing. **Pushed `co-001/redact-ssn-phone`.** Next: the draft PR (description fact-checked), CI, fresh-clone verification, ready, merge.
- Base notes from S4: #117 (c7bed0f7) fixed the sign-in-time e2e flake; a rare `route-tests.8` db flake (PricingRunInputError in seedMappedNotPriced) is a base bug S4 fixes as co-001/pricing-run-cutoff: not this PR's if seen.
- 2026-11-05 06:43 UTC: **draft PR #127** (description from the template, two fact-checks applied). Base 0f4a5ed5 (#125) merged clean as **d333d70d** (three shared documents, both sides kept; typecheck 23 projects, check:fixtures, synth tests 192); pushed.
- 07:29 UTC: CI green on d333d70d (21 runs; the four required runs green). **Fresh-clone verification** (wf_09ee7935-640; `lane-b-redact-ssn-phone-verify-summary.md`): code, tests, boundaries and CI pass. 94 forms probed: every SSN and phone form is redacted at head and none at base; the must-stay classes are kept; the scan refuses and names no number; MOD-15 and MOD-16 fail on the base's redact.ts. It FAILed only the description (a stale Checks section; one false claim: a glued list item is redacted, not refused; inexact fail-first counts). All fixed; posted and read back.
- **2026-11-05 07:36 UTC: #127 MERGED as 23b25ad0** (method merge, expectedHeadSha d333d70d; ready 07:35; approval-of-record green; up to date). Unsubscribed; check-ins cancelled. **Item done.**
- 2026-11-05 07:55 UTC: the acting session stood down (orchestrator's order). This item is merged (#127, 23b25ad0); nothing is left. The WIP ref `co-001/wip-redact-ssn-phone` (ef901af6) is superseded by the merge and may be deleted by Lane B.

## RESUME-BLOCK (for Lane B): a follow-up defect in #127, reported by S2 at 07:57 UTC on 2026-11-05 after the stand-down
- **What:** MOD-16's unseeded property in `packages/model-gateway/src/redact.property.test.ts` failed on #128's CI. The test is "sends amounts, dates, NPIs, codes, ZIPs, TINs, ICNs, traces, checks, references, named numbers and service-line rows unchanged, refuses none…". It failed on run 41989155119, job 127116974440, head 4ffadf3f, which has no model-gateway change.
  - Seed **1034253323**, "Property failed after 47 tests"; the full path is in that job's log.
  - The synthetic counterexample is `Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00`: it is not sent unchanged.
  - The likely cause is a date range glued to the next word with no space or full stop. The dash-range barrier (ef901af6) or the glued-date barrier (6a8cff99) does not hold for a range glued to letters. The text is probably refused by the survivor scan, or partly redacted.
- **Effect:** the base fails any PR's unit job at random, as MOD-13 did before #115.
- **Next step:**
  1. Cut `co-001/redact-range-glued` (or a similar name) from the current base.
  2. Reproduce with the seed pinned as a fixed run beside `LABEL_BOUNDARY_SEED`, plus an example test of the counterexample, and show both fail.
  3. Fix the barrier so a dash-joined date or amount range counts as a barrier when glued to letters, and sweep that class.
  4. Run two adversarial reviews (security, then correctness with the redaction oracle), the fast checks and the touched tests, then open the PR and merge it under the up-to-date rule.
  5. Tell S2's successor and the other sessions to merge the base.

## 2026-11-06T19:20Z (session_01FcouKP1U2GGDFhhZT9CaUV, back after the weekly reset)
- Read this file's acting-S1 section, the RESUME-BLOCK and lanes/lane-b.md 2026-11-05 07:40 UTC: the item is **done** (#127 merged as
  23b25ad0, built by the acting session from this design). Checked live: base cc3dd7f6; no fix for the MOD-16 seed-1034253323 defect
  on the base (last redact.ts change 26aa9ff5) and no branch for it on origin.
- This session has not started the RESUME-BLOCK follow-up: its check-in resumes only on the orchestrator's word. Offered it to the
  orchestrator (it can run here: the design, the scratchpad prototypes and the probe history are in this session). Idle until told.
