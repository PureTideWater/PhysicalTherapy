LANE B (https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ, started by Lane B's orchestrator) holds this item from 2026-11-06T19:30Z; resuming from the RESUME-BLOCK at f62265dc.

<!-- RESUME-BLOCK (2026-11-05T08:00Z, acting S4 stood down: Lane A's account at 99% weekly usage; Lane B resumes from 2026-11-06 19:00 UTC) -->
## RESUME-BLOCK
- **Branch:** `co-001/email-lockup-plate`. Local head f62265dc, NOT on the PR branch: the PR branch is still 231da9c4.
- **WIP ref:** `co-001/wip/email-lockup-plate-s4` = f62265dc, everything.
- **PR:** #129, a draft, head 231da9c4, base claude/build-platform. CI on 231da9c4 was RED: `unit` failed in
  packages/synth fixtures.test.ts "holds every row of test-matrix.md word for word" (SGN-13's synth copy). That is
  fixed at f62265dc. Unsubscribed; no check-in is pending.
- **Commits after 231da9c4:**
  - 40eae422: the plated PNGs and the generator, UX-S1 and UX-N4;
  - 01f67609: docs, UX-N1 and UX-S1;
  - 9dc0f976: ADR 0081 rewrapped, UX-N3;
  - 1fcd3115: synth SGN-13 and its fixture;
  - 3d3664b0: the base merge of 23b25ad0 (#127), clean;
  - dceba1a5: the SHA-256 pins;
  - f62265dc: the BRAND.md section 7 line.
- **Findings:**
  - Fixed: UX-S1, N1, N2 (the design note in /home/user/ops/designs/lane-a-auth-emails.md, "Ruled 2026-11-05"
    lines; check that it reached claude/build-ops), N3 and N4.
  - None open.
  - The orchestrator, as the brand owner's delegate, CONFIRMED the derived art (07:43Z) with four conditions; all
    four hold at f62265dc.
- **Not done:** the full suite on f62265dc. It was started twice and stopped for the stand-down; only typecheck
  passed.
- **The exact next step:**
  1. Run setup if needed.
  2. In a worktree at the WIP ref, `git fetch origin claude/build-platform`; if it moved past 23b25ad0, merge it
     once.
  3. Run the full local suite once. The script is scratchpad plate/suite2.sh, which may be gone; it is the
     standard list plus `pnpm --filter ./infra test`.
  4. `git push origin HEAD:co-001/email-lockup-plate`.
  5. Update #129's description. The fix agent's round-2 draft is in scratchpad plate/pr-body.r2.draft.md, which
     may be gone. It needs:
     - `{{SUITE}}` replaced with the suite results;
     - the SGN-13 synth fix, the #127 merge, the SHA-256 pins and the BRAND.md line added;
     - the last "Pending" review row changed to done;
     - the UX-S1 row's "needs confirmation" changed to "confirmed by Lane A's orchestrator, 2026-11-05 07:43Z".
  6. On green CI: ready, approval-of-record re-run, merge with expectedHeadSha.
- **Counters used:** none new (no ADR number, no test-matrix case).
<!-- /RESUME-BLOCK -->

ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-05T06:50Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 06:40Z.

# Item: email-lockup-plate (`co-001/email-lockup-plate`), a small UX and brand PR

The orchestrator decided both points, as the brand owner's delegate:
- O-5: every worker email's lockup sits on a fixed White rounded plate (full-colour lockup, not a reversed variant).
  Forced inversion in email clients is undetectable and inconsistent.
- O-8: the reset code email adds "If you asked more than once, use the newest code." ADR 0081's staging smoke list
  gains a check on whether a first code still works after a second request.
Process: one UX and brand review with inverted-client renders, then CI and the merge. It goes before the follow-on
co-001/password-changed-notice.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-05T06:50Z: started. Worktree /home/user/email-plate from 0f4a5ed5 (#125). The workflow's script is archived
  as workflow-scripts/lane-a-email-lockup-plate.js.

- 2026-11-05T07:45Z: workflow wf_80ea358c-97c.
  - Draft PR #129: the table plate, the newest-code sentence, red first.
  - The UX review found UX-S1: forced inversion inverts the plate cells too.
  - The fix round made new plated PNGs (the delivered art composited onto an opaque White plate inside the image),
    written by tools/brand-email-plate and held pixel for pixel by a test. Its agent returned early: 3 commits
    unpushed, the suite unfinished.
  - CI on 231da9c4 was red: SGN-13's synth copy was not updated. I fixed it (synth matrix.ts and its fixture) and
    merged #127 (23b25ad0).
- 2026-11-05T07:55Z: the orchestrator, as the brand owner's delegate, confirmed the derived art, with conditions:
  - versioned file names (kept);
  - each img keeps width, height and alt "PaidWhole" (holds);
  - input and output SHA-256 pinned in the test: dceba1a5, which fails on a one-byte change;
  - BRAND.md section 7 calls it a derived plate composite, generated, never hand-edited: f62265dc.
  The full suite is running on f62265dc.

- 2026-11-06T19:32Z (Lane B item session, session_01FcouKRo5iee5QFtPT8UimZ): resumed from the RESUME-BLOCK.
  - Worktree /home/user/email-plate from the WIP f62265dc; merged claude/build-platform cc3dd7f6 (#128) once, clean: 31c41a9d,
    also pushed as WIP `co-001/wip/email-lockup-plate-s5`.
  - Workflow wf_ce02ff47-f34 (archived as workflow-scripts/lane-b-email-lockup-plate-suite-wf_ce02ff47-f34.js): the full
    local suite once (plus `pnpm --filter ./infra test` and the affected mutation shards), an adversarial review of the
    base-merge delta (two lenses, skeptics per finding), then #129's description rewritten and checked.
  - Next: push to co-001/email-lockup-plate, update #129's description, CI, verification reading CI, ready, merge.

- 2026-11-06T20:25Z: wf_ce02ff47-f34 done. The full local suite PASSED on 31c41a9d: unit 9,929 passed (4 skipped); golden 381;
  oracle 689 of 689; test:db 6 shards, 9,863 passed (1 skipped); infra 793; e2e 81 of 81; brand baselines 7 of 7 byte
  for byte; no mutation shard covers a changed file, and the gate passes. Delta review: F1 (ADR 0081 says the repository
  renders an inverting client; it does not), F2 (BRAND.md 7 puts space-3 padding on the table; it is in the image's own
  pixels) and F3 (packages/brand/README.md still names the 1200 px PNG for email) were confirmed by 2 of 2 skeptics; F4
  (commit trailers) was refuted. Fix round wf_f6e043ec-5b7 (archived): fixes, a sweep until dry with skeptics and a
  completeness critic, the fast checks, then the description.

- 2026-11-06T20:56Z: wf_f6e043ec-5b7 done: F1 to F3 fixed (c189c4a1); the sweep confirmed 7 more (reviewer citations, ADR 0058 pointing
  to 0081, plateHolds wording, lockup heights pinned to the plated PNGs, a mail test comment): d7a45752, 8a92286e,
  80ce3ec0; fast checks and the brand e2e green on 80ce3ec0 (WIP `co-001/wip/email-lockup-plate-s5`). The sweep was not
  dry after 3 rounds, so wf_6882a2d4-33e (archived) sweeps until dry, then re-checks the description.

- 2026-11-06T21:07Z: wf_6882a2d4-33e: the sweep went dry in round 3 and confirmed 2 findings, but its fix prompt carried no list
  (a script defect, mine), so nothing was fixed. D1: ADR 0058's new line says the mail "embeds" the plate; it loads it
  from the static host. D2: the O-8 text says replacement of an earlier code is unverified, while ADR 0081 A3 and the
  reset page's step warning ("it replaces the code already sent") assert it. Decision (recommended on accuracy; within
  the O-8 ruling): word the page's warning and A3 to hold either way, as the email does. wf_5ac1f379-e54 (archived)
  fixes both, reviews the delta twice (UX and brand with shots; correctness) until dry, runs pnpm test and the sign-in
  and brand e2e, then the description.

- 2026-11-06T21:54Z: wf_5ac1f379-e54 done. f24a14f5 (D1, D2), 7fb2ac5c (UX review: the warning now reads "If you need more time,
  send a new code below and the step opens again for 15 minutes. Then use the newest code."; dev-provider.ts scopes
  replacement to the twin), 0234d5fe and 61169d8b (ADR 0058 and 0081 name both plated files). Reviews dry in round 3.
  On 0234d5fe: pnpm test 9,932 passed; e2e sign-in-time, sign-in, brand 19 passed; fast checks green. WIP s5 = 61169d8b.
  wf_4cb68701-e78 (archived) verifies 61169d8b and checks the description until clean; then push and #129's body.

- 2026-11-06T22:18Z: wf_4cb68701-e78: 61169d8b verified (skeptic ok; lint, lint:copy, verify-content, 453 doc tests). Its last
  description check found two reviewer citations one line early (BRAND.md 126-127, 128-129): fixed in 34927fd0 (22
  files, 363 tests). Pushed 34927fd0 to co-001/email-lockup-plate (base cc3dd7f6 still an ancestor). #129's description
  rewritten with the MCP tool and read back identical (a filter in the MCP path escapes an `<img src=` tag, so the
  code block carries a placeholder and the attributes are in prose). subscribe_pr_activity failed, so send_later
  check-ins stand in (22:55Z).
  - Next: CI green on 34927fd0, then the fresh-clone verification that reads CI, ready, approval-of-record's re-run,
    merge with expectedHeadSha.

- 2026-11-06T22:56Z: CI on 34927fd0 all green (all green, mutation, screening-capacity gate, approval-of-record). The base moved to
  31a7345f (#130), which shares test-matrix.md and the synth registry with this PR, so the up-to-date rule applies:
  wf_464a574d-f04 (archived) merges it once, regenerates, runs the fast checks and touched tests, and checks the merge
  twice. Next: push, CI, the fresh-clone verification reading CI, ready, merge.

- 2026-11-07T00:40Z: the account's 5-hour limit stopped wf_464a574d-f04 after its merge commit; setup re-run, the workflow resumed.
  f4fef908 merges 31a7345f (#130) with no conflicts (SGN-13 and SEC-24 both kept; synth 0 written); fast checks, 52 files
  and 799 tests on #130's and this PR's packages, infra 798, domain-model check: all pass; two merge checks clean. Pushed
  f4fef908 to co-001/email-lockup-plate (up to date with the base); the description updated for it.
  - Next: CI green on f4fef908, the fresh-clone verification reading CI, ready, approval-of-record's re-run, merge.

- 2026-11-07T01:17Z: CI on f4fef908: every job green but `unit` (and so `all green`): one test, MOD-16's unseeded property in
  packages/model-gateway/src/redact.property.test.ts, seed -1074798020, counterexample "Paid $0,000.00. Service
  01/01/2020-01/02/2020Paid $0,000.00": the base's known defect (handoff 2026-11-05 section 2; its fix is in flight as
  `co-001/redact-range-glued`, session_01FcouKP1U2GGDFhhZT9CaUV, not yet merged; this PR changes no gateway file). Decision:
  one re-run of the failed jobs (run 42319584132), as the rules allow to confirm a failure is not this PR's; porting the fix
  is not possible (an unreviewed PHI change). If green, verify and merge; if red again, wait for the fix to merge.

- 2026-11-07T01:34Z: the re-run of `unit` (job 128252577494) failed the same way: MOD-16, the same counterexample. Everything else is
  green on f4fef908. **Ready; waiting on `co-001/redact-range-glued`** (the base's MOD-16 fix, session_01FcouKP1U2GGDFhhZT9CaUV).
  Nothing more is pushed to #129 meanwhile. When it merges: merge claude/build-platform once (rule 6), fast checks and the
  generators, push, CI green on that head, the fresh-clone verification that reads CI, ready, merge with expectedHeadSha.
  Also checked (orchestrator's 01:33Z lesson): wf_5ac1f379-e54's three ux-brand-reviewer rounds each returned a real result
  with shots (UXS-R1-01; then none, at r2 and r3), so no review round of this item is empty.

- 2026-11-07T06:41Z: still waiting on `co-001/redact-range-glued` (not merged; its session hit the 5-hour limit ~04:45). The base moved
  to 8a722f80 (#131): merged once, after the fix lands. #129 unchanged at f4fef908 (WIP s5 = f4fef908). Setup re-run after
  the restart; PG16 needed its stale postmaster.pid removed (its PID was reused by PG18). Check-in 08:37Z is the third: if
  no change, check-ins stop and a message brings this session back. Orchestrator 06:50Z: spend nothing that does not change
  the outcome; no follow-on after the merge.

- 2026-11-07T08:38Z: third check-in with no change: `co-001/redact-range-glued` not merged (base 8a722f80). Check-ins stopped; a
  message to session_01FcouKRo5iee5QFtPT8UimZ brings it back. The exact next step when the fix merges: in /home/user/email-plate
  (WIP s5 = f4fef908), merge claude/build-platform once (it will hold #131 and the fix), run the fast checks and pnpm synth
  with no diff, the tests of the packages the merge brings in, two adversarial merge checks; push to co-001/email-lockup-plate;
  update #129's description (the scratchpad draft pr-body.md, via a helper that reads it back byte for byte; no `<img src=` in
  the body); CI green on that head; the fresh-clone verification that reads CI; ready; approval-of-record's re-run; merge
  with method merge and expectedHeadSha. No follow-on item after it (orchestrator, 06:50Z).

- 2026-11-11T03:06Z (W1, acting Lane B, session_019i9if9bThP3wWKpHBiU3m8): **#129 merged as ca504674** on claude/build-platform.
  After #138 (MOD-16) merged as ef3e8d20: the base merged once into f4fef908 with no conflict (787bed17); typecheck, lint,
  lint:logs, verify-content, `pnpm test` (13,137 passed, 4 skipped) and `pnpm synth --all` with no diff on it; pushed; CI
  green on 787bed17, every job, `unit` included; the description's head line brought to 787bed17 (one line, read back byte
  for byte; no `<img src=`); ready; the base an ancestor of the head, 0 tags; merged with expectedHeadSha. Not repeated:
  the two adversarial merge checks and the fresh-clone verification the 2026-11-07 entry planned (a clean base merge of an
  already reviewed head; the orchestrator's 2026-11-11 word was base merge, push, merge on green). The item is closed; W1
  is unsubscribed.

## Waiting on someone
- None: #129 merged as ca504674 (2026-11-11).

## Next step
The suite on f62265dc, the push and the description, CI, then the merge. Then the follow-on.
