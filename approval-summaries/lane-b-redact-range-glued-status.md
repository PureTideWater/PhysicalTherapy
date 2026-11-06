# Lane B item: a date or amount range glued to a word breaks MOD-16 (`co-001/redact-range-glued`)

Session: session_01FcouKP1U2GGDFhhZT9CaUV (https://claude.ai/code/session_01FcouKP1U2GGDFhhZT9CaUV). GitHub login: PureTideWater.
Claimed by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) 2026-11-06 19:40 UTC: "GO on the MOD-16 follow-up (Lane A
handoff 2026-11-05 §2, first item for Lane B) ... no new ADR/MOD expected; COUNTER REQUEST if one is".
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

## Waiting on someone
None.

## Next step
Build workflow: reproduce (seed pinned + example), root-cause, fix, sweep the class; two adversarial reviews (PHI/security;
gateway correctness) with skeptics; fix round with the full local suite once; then one push, draft PR, CI, fresh-clone
verification, merge (rule 2a).
