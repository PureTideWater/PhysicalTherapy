Counters (allocated by the orchestrator 2026-11-06 21:03 UTC): MOD-21 and MOD-22 for the follow-on PR `co-001/redact-ssn-phone-leaks`
(the SSN/phone leak classes the hunt verifies at cc3dd7f6); no ADR expected (an ADR 0054 amendment). Next free becomes MOD-23.

# Lane B item: a date or amount range glued to a word breaks MOD-16 (`co-001/redact-range-glued`)

Session: session_01FcouKP1U2GGDFhhZT9CaUV (https://claude.ai/code/session_01FcouKP1U2GGDFhhZT9CaUV). GitHub login: PureTideWater.
Claimed by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) 2026-11-06 19:40 UTC: "GO on the MOD-16 follow-up (Lane A
handoff 2026-11-05 §2, first item for Lane B) ... no new ADR/MOD expected; COUNTER REQUEST if one is".
Follow-ons, in order (orchestrator 2026-11-06 21:03 UTC: PHI first): (1) `co-001/redact-ssn-phone-leaks` (MOD-21, MOD-22; the week's top PHI
item; two reviews with skeptics; refuse where a boundary is unknowable); (2) (orchestrator ~19:50 UTC, this session is S1) the packets
verifier identifier fold (`approval-summaries/lane-b-packets-verifier-identifier-fold-status.md`, MOD-19/20; RESUME-BLOCK first;
claim row and live heads; it shares verifier files with S4's packet-figure-placeholders slice 2 and the tp-packet-verifier/3
migration: check S4's branch first, rule 6).
Source: `approval-summaries/lane-b-redact-ssn-phone-status.md` RESUME-BLOCK; `lanes/lane-a-handoff-to-lane-b-2026-11-05.md` §2.
Rules: lanes/lane-b-session-brief.md; speed rules in lanes/acting-lane-b-2026-11-04.md (CI is the suite of record; full local
suite once per PR; two adversarial reviews with skeptics for redaction/model-gateway changes; rule 2a up-to-date before merge).

## The defect
MOD-16's unseeded property in `packages/model-gateway/src/redact.property.test.ts` ("sends amounts, dates, NPIs, codes, ZIPs,
TINs, ICNs, traces, checks, references, named numbers and service-line rows unchanged, refuses none...") failed on #128's CI
(run 41989155119, job 127116974440, head 4ffadf3f, no gateway change): seed 1034253323, "Property failed after 47 tests";
counterexample `Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00` (synthetic) is not sent unchanged. Likely: a
dash-joined date range glued to the next word is not a barrier (ef901af6's range barrier, 6a8cff99's glued-date barrier).
Effect: any PR's unit job can go red at random.

## Log (UTC)
- 2026-11-06T19:45Z: branch `co-001/redact-range-glued` cut on origin at cc3dd7f6 (= claude/build-platform). Setup re-run with
  `co-001/redact-range-glued:/home/user/redact-range-glued` (PostgreSQL was down after the restart). The #127 probe worktree removed.
- 2026-11-06T19:31Z: build workflow **wf_bca3d2b3-77c** running (builder: reproduce with the seed pinned + example, root-cause, fix,
  sweep; reviews PHI/security and gateway correctness, each with a skeptic, loop up to 3 rounds; final fixer runs the full local
  suite once; completeness critic). Check-in 2026-11-07T00:42Z (trig_018dkUucZETxGpau5ZxvCeBt). Script archived when it ends.
- 2026-11-06T20:20Z: the builder's sweep found a **pre-existing PHI leak at cc3dd7f6** (not caused by the range fix): an SSN or
  phone glued digit-to-digit to an amount or range is sent (`900 12 3456150.00-01/02/2020`, `SSN 900123456120.00-...`), and a
  masked SSN glued after digits or a word (`...2020XXX-XX-3456`); the same with a space for the dash too. On the user's word
  ("that should be in ultracode"), a second, read-only workflow **wf_8da6dd19-398** hunts the whole leak class at cc3dd7f6 on the
  probe worktree `/home/user/redact-range-glued-probe` (five angles: digit-glued, letter/placeholder/mask-glued, character
  evasions, barrier interplay, structure and other model paths; three skeptics per reported leak; loop until two dry rounds;
  synthesis into `rg-leaks/verified.md` in the scratchpad; completeness critic). Its verified classes go into this PR's fix round
  (security: the safer option; refuse when the boundary is unknowable), with named regression tests.
- 2026-11-06T21:10Z: round 1 of the hunt reported 52 candidate classes (digit-glued 13, letter/mask-glued 13, barriers 10,
  characters 16). Two decisions, with reasons:
  1. **The leak fixes become their own PR, `co-001/redact-ssn-phone-leaks`, right after this one** (one PR per change; this PR is
     a CI-flake fix that turns any PR's unit job red at random, so it should not wait on a much larger PHI change; nothing is
     live before launch, so no real letter is exposed meanwhile). This PR's PHI review still checks that the range barrier does
     not widen any leak. COUNTER REQUEST at the top of this file.
  2. **The hunt's skeptics are batched per angle** (3 lenses x 5 angles per round instead of 3 per leak: this 4-CPU machine runs 2
     agents at a time per workflow, so 156 single-leak skeptics would take many hours). Stopped and resumed as the same run
     wf_8da6dd19-398 (hunters replayed from cache); the synthesis now writes the brief as the follow-on PR's design input,
     triaging pattern gaps (fix) from obfuscation beyond pattern reach (fix or documented residual, for the co-founder).
- 2026-11-06T21:50Z: build workflow state: builder 2861bc0f, 89fb3193; gateway review round 1 (GATEWAY1-1..6) fixed in 21e67bba,
  435f0a68, e0cf46e0 (WIP `co-001/wip-redact-range-glued` = e0cf46e0). **The PHI review of round 1 was lost** (its agent died at
  20:26 with no result), so fix round 1 ran on the gateway findings alone. Its notes showed REGRESSIONS against the base: letters
  refused at cc3dd7f6 and sent at the builder's head (an SSN with an amount fused on, before a range: `SSN 900123456120.00-01/02/2020`,
  `SSN 900 12 3456.78-01/02/2020`; 114 in a 20,000-letter seeded fuzz), and month-word name parts (a patient named May or June)
  redacted at base and sent now in date-adjacent shapes (likely 2861bc0f's datesIn change). Stopped the workflow before round 2,
  edited the script (the PHI lens as a default agent on the security-reviewer checklist, a seeded base-vs-HEAD differential, the
  lost notes given explicitly; any reviewer that dies is retried once) and resumed the same run: the PHI round-1 review re-runs on
  the current head, then the fixer applies its findings. This PR merges only with zero base-vs-HEAD regressions.

## Waiting on someone
None. (Any leak class the hunt marks a documented design trade-off goes to the co-founder through the orchestrator, fixed
meanwhile as the safer option.)

## Next step
Build workflow: reproduce (seed pinned + example), root-cause, fix, sweep the class; two adversarial reviews (PHI/security;
gateway correctness) with skeptics; fix round with the full local suite once; then one push, draft PR, CI, fresh-clone
verification, merge (rule 2a).
