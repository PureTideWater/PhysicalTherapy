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

## Now (2026-11-01T17:20Z)
- **Stage 1 (design) running** as workflow `lane-b-redact-ssn-phone-design` (probe, draft, one reviewer plus a completeness critic, two-lens verification, apply). Before that: Done: the claim and the reservations (18bbe0e9, 15725ba2). All seven pipeline stages
  remain: design and review, build, draft PR, two reviews, fix round, verification, merge.
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
- 2026-11-01T17:20Z: stage 1 started: the design workflow (script archived as
  `workflow-scripts/lane-b-redact-ssn-phone-design-<runId>.js` when it ends).

## Waiting on someone
- Nothing blocks. The ruling is decided (the founder, 2026-11-01) and confirmed by the co-founder.
- New trade-offs the design raises go to the co-founder through the orchestrator (the founder's delegation of 2026-10-25 covers
  security trade-offs on Lane B's work), for example an unlabeled bare 9-digit number that may be a claim number or member ID,
  or the payer's own letterhead phone being redacted. Each blocks only that point.
- Merge: non-schema, so on green CI after the fresh-clone verification (rule 7). Runbook 3i and `APPROVAL_REVIEW_REQUIRED`
  stay the founder's and do not block. #75's F1 floors and F2 (legal) are the founder's and do not block.

## Proposals (outside this PR)
None yet.

## Next step
Next: run setup with no branch argument in the background until it prints OK (after `FAIL node - /opt/node24/bin/node
reports 'v24.22.1', not v24.22.0`, run `mv /opt/node24 /opt/node24.base-image` and run it again); add the read-only probe
worktree at 871faff9 (`/home/user/redact-ssn-phone-probe`, `pnpm install --frozen-lockfile` under the lock); write this
session's id here, pull and push build-ops; then the design (stage 1): probe `redactLetter`, `holdsIdentifier` and
`identifierCandidates` on the SSN and phone forms and the must-not-redact cases with synthetic twins, then write the design and
run one design reviewer (adapt the "Design review" phase of
`workflow-scripts/lane-b-redact-placeholders-design-build-wf_0f7e6d06-e5b.js`). The build waits for #75 to merge.
