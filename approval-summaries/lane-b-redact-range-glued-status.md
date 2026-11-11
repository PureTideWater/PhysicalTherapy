Counters (allocated by the orchestrator 2026-11-06 21:03 UTC): MOD-21 and MOD-22 for the follow-on PR `co-001/redact-ssn-phone-leaks`
(the SSN/phone leak classes the hunt verifies at cc3dd7f6); no ADR expected (an ADR 0054 amendment). Next free becomes MOD-23.

# Lane B item: a date or amount range glued to a word breaks MOD-16 (`co-001/redact-range-glued`)

Session: session_01FcouKP1U2GGDFhhZT9CaUV (https://claude.ai/code/session_01FcouKP1U2GGDFhhZT9CaUV). GitHub login: PureTideWater.
Claimed by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) 2026-11-06 19:40 UTC: "GO on the MOD-16 follow-up (Lane A
handoff 2026-11-05 §2, first item for Lane B) ... no new ADR/MOD expected; COUNTER REQUEST if one is".
Follow-ons, in order (orchestrator 2026-11-06 21:03 UTC: PHI first; 2026-11-07 10:53 UTC: the very next item, exempt from the
weekly-cap hold, must land before any real PHI is processed): (1) `co-001/redact-ssn-phone-leaks` (MOD-21, MOD-22; the week's top PHI
item; acceptance includes flipping every pinned row of this PR's class (A) residual table; two reviews with skeptics; refuse where a boundary is unknowable); (2) (orchestrator ~19:50 UTC, this session is S1) the packets
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
- 2026-11-06T22:40Z: the re-run PHI review (350,000-letter seeded base-vs-HEAD differential): no SSN/phone/DOB digit that the base
  redacted is sent at e0cf46e0; the earlier regressions were closed by 435f0a68. PHI1-1 (an unlabeled amount-shaped SSN at the end
  of a date or cents-less currency range is now sent; its space twin was already sent by R1's amount barrier) confirmed; fix:
  record and pin, no code change (a narrower rule would refuse clean letters). GATEWAY1-1 (435f0a68 read SEC-5's label through
  "TTY 711", refusing clean letters) confirmed. Fix round 1 (re-run): 9ecbe6c9, 6fc88092 (WIP = 6fc88092).
- 2026-11-07T00:10Z: **both workflows stopped by the account's 5-hour limit** (reset 00:10 UTC; the machine restarted). Lost:
  round-2 reviews, the final fixer and suite, the critic (build); the round-2 skeptics, rounds 3-4 and the synthesis (hunt; its
  "two dry rounds" were false: failed hunters returned nothing). 00:35Z: setup re-run (both clusters started), WIP pushed
  (6fc88092), the build workflow resumed (wf_bca3d2b3-77c). **The leak hunt is held until the build workflow ends** (two heavy
  workflows together burned the 5-hour window in ~4.7 h; this PR unblocks every PR's CI, so it goes first). Check-in ~05:45Z.
- 2026-11-07T01:05Z: review round 2. PHI2-1 (blocking, confirmed): the call's own DOB, name part, member ID or claim number glued
  at a range end was sent where cc3dd7f6 refused only by chance (6,602 of 21,600 targeted letters); PHI2-2 the same glued
  boundary without a range (present at base); PHI2-3..6 unrecorded classes and wording; GATEWAY2-1/2. Fix round 2: own
  identifiers read across glued boundaries (letters-only edges accept a digit; DOB on the glued readings; the scan on the same
  readings), 8d98b8bb, d9ae7b30, 6be7976f, 5a13c9d9, 3fcb9359 (WIP = 3fcb9359; 632/632 gateway tests).
- 2026-11-07T01:53Z: the orchestrator: MOD-16 also failed #131 (seed 383403599, job 128259888791) and #129 (seed -1074798020, run
  42319584132) on the same shape; pin both beside 1034253323; #129 and #131 wait on this PR (critical path for three PRs). Stopped
  the workflow at 02:40Z after fix round 2 and resumed it with the final fixer told to pin both seeds (shown failing at cc3dd7f6,
  passing at HEAD) before the one full local suite; round-3 reviews re-run.
- 2026-11-07T03:35Z: review round 3: fix round 2's glued name/DOB reading (21684dff, 5a13c9d9) itself regressed: PHI3-1/2
  (blocking, confirmed: a glued or camel-case own name between an SSN/phone label and the number cuts the label, so SSNs that
  cc3dd7f6 redacted are sent), PHI3-3, PHI3-4 (own-DOB shapes still sent), GATEWAY3-1/2 (codes after the patient's name damaged:
  MA01-MA130, XU, minute units), GATEWAY3-3 (no timing rows). Third round in a row a fix traded one regression for another, so
  the build workflow was stopped before its final fixer, and a judge workflow **wf_5d1aedda-db5** started (03:45Z): one shared
  base-vs-candidate differential gate (PHI per identifier kind, KEEP per must-stay class, timing; >= 200,000 seeded letters plus
  every finding's inputs), then two candidates from 3fcb9359 in their own worktrees: **A** patches the glued reading; **B**
  reverts it and has the self-check REFUSE an own identifier glued to text across a boundary the patterns do not read (the
  orchestrator's "refuse where the boundary is unknowable"); two judges (PHI-first; correctness/over-refusal), a tie-break if
  they split; then whole-change PHI + gateway reviews with skeptics on the winner until a dry round (max 4), fixes gated by
  the differential; then the three MOD-16 seeds pinned, docs, the full local suite once, a critic. The bar: zero base-redacted
  or base-refused inputs sent (SSN, phone, every own identifier) and zero must-stay changes, except classes recorded in ADR 0054
  with a pinned row. Worktrees `/home/user/rg-cand-a`, `/home/user/rg-cand-b` (local branches rg-cand-a/-b); the winner is
  fast-forwarded into `co-001/redact-range-glued` before the push. Round-1 to 3 findings: scratchpad rg-judge/.
- 2026-11-07T03:40Z: the orchestrator's tie-break ruling added to the judges verbatim (close -> B; the winner must show zero PHI
  regressions per identifier kind on the gate and no must-stay damage beyond base); resumed.
- 2026-11-07T~04:45Z: **the 5-hour limit stopped the judge workflow again** (reset 05:30 UTC) before any agent returned (the
  gate was part-built; its progress file is kept). 05:46Z: setup re-run (PostgreSQL restarted), the workflow resumed as the same
  run wf_5d1aedda-db5. Check-in ~10:57Z.
- 2026-11-07T06:45Z: two more MOD-16 seeds from CI (-460602131, #131's push run on 8a722f80; -594136649, S3's integration run):
  five to pin (1034253323, 383403599, -1074798020, -460602131, -594136649); the base's own push runs are going red. The
  orchestrator: the 7-day limit is at its warning level, "spend nothing that does not change the outcome". Decision: candidate A
  and the two judges are dropped (A's approach regressed three rounds running, and the ruling picks B when close); B is built
  alone and must meet THE BAR on the gate; if it cannot, back to the orchestrator before any spend on A. The gate (2.18 M seeded
  synthetic letters; it reproduces the round-3 PHI and code-damage rows) is measuring the baseline; the run is restarted at the
  gate's result with the edited script (archived as `workflow-scripts/lane-b-redact-range-glued-judge-wf_5d1aedda-db5.js` at the
  end). The leak hunt stays held (weekly limit).
- 2026-11-07T07:15Z: **gate baseline** (975,489 seeded synthetic letters, 5,292 patients, the real prepare path, deterministic;
  `rg-judge/gate/baseline.md` in the scratchpad). vs cc3dd7f6, HEAD 3fcb9359 sends SSN 38,604 / phone 33,965 letters the base
  protected (about 65k are the glued-own-name-cuts-the-label class), DOB 95, name parts 648, initials 357, and damages 3,615
  code/unit letters; 6fc88092 sends name parts 15,064, DOB 6,036, initials 3,455, member 2,465, claim 1,511, SSN 7,495. Neither
  ships. Candidate B started with the orchestrator's strict bar (zero PHI regressions per identifier kind vs the base on the
  gate; no must-stay damage beyond base).
- 2026-11-07T07:20Z: **the orchestrator's ruling on SSN-shaped amount classes** (in advance): (1) fail closed: where the rule
  cannot tell at run time whether digits at a range end are an amount or an identifier fragment, refuse as the base did (no
  regression on either bar); (2) a class may be sent only if, per the gate's ground truth, in every letter the sent digits match
  no identifier of any kind for any patient in the call, AND the rule decides it from structure at run time, not surface text;
  (3) report every such class with counts as sent-exempt or refused-as-base, in the PR description and here; ask only if a class
  meets neither. Added to B's prompt verbatim; B restarted from its progress file (07:22Z).
- 2026-11-07T10:50Z: **candidate B committed** (local branch rg-cand-b: 3f76385e, fefd22d2 on 3fcb9359; pushed as WIP
  `co-001/wip-redact-range-glued-b`). It reverts the glued reading (21684dff, 5a13c9d9), keeps 8d98b8bb and d9ae7b30, adds
  `ownIdentifierGlued` to the check and reads each letter with cc3dd7f6's barriers ("kept") beside the range fix's ("held").
  Gate vs cc3dd7f6: PHI initial/DOB/member/claim 0, name 5, SSN 385, phone 171; must-stay code/unit/amount/ID/ref changed 0;
  679/679 tests; the three CI seeds 79/79; MOD-16 stress 7x20k 0 bad; slowest 587 ms. Sent-exempt: none. Refused-as-base and
  fail-safe classes recorded in ADR 0054 (60 must-stay letters with the own DOB glued digit to digit; 187 letters with a glued own
  identifier the base sent in clear). **Two classes meet neither part of the ruling** and went to the orchestrator (10:55Z):
  (A) SSN 385 / phone 171 in shapes no pattern reads, in letters the base refused only via the range's own digits; the base
  sends the same shapes without a range (the leaks PR's class); closing it here refuses MOD-16 must-stay letters (297 or ~10 per
  20k) and so re-creates the CI flake; recommended: a recorded residual here, closed in co-001/redact-ssn-phone-leaks.
  (B) name 5 (month-word patient names); recommended: accept and record. The reviews of B run meanwhile.
- 2026-11-07T10:53Z: **the orchestrator's rulings.** (A) ACCEPTED as a recorded residual on conditions: every row of the class
  pinned in a residual table; an ADR 0054 entry naming `co-001/redact-ssn-phone-leaks` (MOD-21/22) as the fix, whose acceptance
  test is that each pinned row flips to redacted or refused with the generator and patterns changed together; never weaken MOD-16
  or skip a test; the PR description says the class is the pre-existing leak shape the base already sends without a range (this
  PR exposes it, does not create it), with the counts. **The leaks PR is this session's very next item after this merges, ahead of
  the verifier identifier fold, exempt from the weekly-cap hold (PHI safety), and "must land before any real PHI is processed"**
  (the orchestrator records it in LANES.md and the handoff; the founder owns the launch). (B) ACCEPTED and recorded; a named
  case for the leaks PR's design (an own name part equal to a month or common word, next to a date). 10:58Z: the rulings added
  to the reviewers, skeptics, fixers, final stage and critic; the workflow restarted at review round 1 (the gate and B replay
  from cache).
- 2026-11-07T14:55Z: judge review round 1 on B (9 blocking, all confirmed: a new random MOD-13 failure; clean letters refused
  for a patient named Bill and before suite/line words; own short parts, month words, initials, digits-only member/claim and
  masked SSNs still sent in held letters; rulings A/B not yet carried out). Fix round 1: 5b8ed30f, ea4160c2 (the residual
  table), 2a5ed43b (WIP `co-001/wip-redact-range-glued-b` = 2a5ed43b). Gate at the bar apart from the ruled residuals (PHI
  initial/DOB/member/claim 0; name 5 = B; SSN 385 / phone 171 = A, pinned); 1,717 redaction tests; 800-run seed sweep clean;
  MOD-16 stress 0 bad; slowest 642 ms.
- 2026-11-07T15:26Z: judge review round 2: bookkeeping (8 class-A rows pinned with the wrong outcome; the lone-initial residual
  unpinned; two new clean-letter refusals, GATEWAYJ2-2; a quadratic check, PHIJ2-4) and PHIJ2-2. **The orchestrator's ruling
  (A') at 15:27 UTC:** own name, member, claim or DOB in forms no rule reads (OCR letter-digit confusions, homoglyphs, unread
  date writings), sent in held letters, is a recorded residual on the same terms as (A): every gate row pinned with its correct
  outcome, counts per identifier kind in the PR description, "the base sends the same forms in any letter without a range", ADR
  0054 naming the leaks PR (whose design gets an NFKC + TR39-style confusable skeleton + O/0, l/1, I/1, S/5, B/8 fold for
  own-identifier matching; acceptance: the pinned A and A' rows flip; it must land before any real PHI is processed). The fixer
  still closes every form a rule reads. Added to fix round 2 onward; the run restarted at fix round 2 (15:52Z).
- 2026-11-10 (W1, acting Lane B, session_019i9if9bThP3wWKpHBiU3m8): **resumed from candidate B's WIP 9f953223** (fefd22d2 is an
  early commit of it, no ref; the branch stays at cc3dd7f6 until the final push). The base merges into it with no conflict
  (trial). **Gate at 9f953223** (975,489 letters, vs cc3dd7f6): PHI ssn 385, phone 171, name 5 (the ruled residuals), no other
  kind; refused must-stay other 60, after an SSN or phone word 7,014, letters with identifiers 598; changed date 4, text 1,
  number 1; unplaced 523; slowest 598 ms; the five MOD-16 seeds 95 of 95 each. **Review round 5** (two adversarial reviews,
  both delivered): PHI5-1 blocking (two or more initials glued to another word's letters sent in held letters, 276 of 560;
  fixed in dedeb35f by refusing every stretch of initials in a run, the safer reading; gate unchanged, 2,291 residual rows
  hold); the gateway review's six blocking, all reproduced: two new properties fail at random (MOD-13 glued, 4 of 304 seeds;
  PHIJ4-2's, a test bug), a quadratic range scan (122 s at 100 kB), a must-stay date damaged after a date of birth written
  M/D/YY (12,600 of 12,600), new refusals where a code's or unit's own letter stands before the name (304 of 1,440), and a
  clean-letter refusal for a range with no year on its second end (4,584 of 6,000). **Fix round 5 is running** (one fixer;
  then the gate, the seed sweeps, a re-review by two fresh reviewers, the base merge, the full suite once, the push, the PR).
  WIP `co-001/wip-redact-range-glued-b` = dedeb35f. The gate is copied to /home/user/gate in the container; outputs in
  /home/user/gate-out (not kept).

## RESUME-BLOCK (W1, session_019i9if9bThP3wWKpHBiU3m8; written 2026-11-11, at the push)
- **Head:** `co-001/redact-range-glued` = **c5c11918** (pushed; the base 06cde5eb merged; = WIP acac58b3 + the merge). Draft
  PR opened from it; the description is filled from the template (rulings A, A', B; the recorded costs; both review rounds).
- **Done:** review round 5 (PHI5-1 and F1 to F10) and its re-review by two fresh reviewers (PHI5-2 fixed in 65a07881; MOD-15's
  generator fixed in acac58b3; F4's mirror, F6's neighbour family and the lone-letter shapes recorded in ADR 0054 as the
  safer reading, not changed). Gate at 65a07881 vs cc3dd7f6: PHI ssn 385, phone 171, name 5, no other kind; must-stay
  changed 0; refusals 60 / 7,014 / 598; slowest 574 ms. Local on c5c11918: typecheck, lint, lint:logs, verify-content
  pass; `pnpm test` 13,115; golden 381; the 12 named seeds pass. test:db and test:e2e need
  `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres` (PostgreSQL 18; the default 5432 is 16 and fails the
  new line_status_heads migration); their local run was still going at the push; CI is the suite of record.
- **Next:** CI green on the head, the up-to-date rule (origin/claude/build-platform an ancestor of the head), ready, merge,
  one line to the orchestrator, this file closed, unsubscribe. Then #129 (base merge, push, merge on green), then a
  RESUME-BLOCK for the leaks PR in `lane-b-redact-ssn-phone-status.md` and stand down (the orchestrator, 01:20 UTC).
- **If CI's unit job fails on a redaction property:** take the seed from the log, reproduce with the FC_SEED mirror
  (`designs/lane-b-redact-ssn-phone/gate/tests.sh`), fix the cause; never re-run to get green.

## Waiting on someone
- None: classes (A) and (B) ruled 2026-11-07 10:53 UTC.
- Previously: none. (Any leak class the hunt marks a documented design trade-off goes to the co-founder through the orchestrator, fixed
meanwhile as the safer option.)

## Next step
Build workflow: reproduce (seed pinned + example), root-cause, fix, sweep the class; two adversarial reviews (PHI/security;
gateway correctness) with skeptics; fix round with the full local suite once; then one push, draft PR, CI, fresh-clone
verification, merge (rule 2a).
