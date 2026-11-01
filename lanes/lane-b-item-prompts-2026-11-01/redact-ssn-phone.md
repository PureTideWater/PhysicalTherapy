## Your item
This is redact-ssn-phone, claimed in LANES.md row 198 at build-ops 15725ba2. On 2026-11-01 the founder (Tyler Williams) ruled that a payer letter has its Social Security numbers and phone numbers redacted by pattern before the model reads it. The reader is `readDenialLetter`, and the requirement belongs in PRD §14 "PHI minimization". The co-founder relayed the ruling to Lane A's session_01TrKDxeLbxVo7t7zwRXFzrg, which recorded it in commit 18bbe0e9 (14:04 UTC). He confirmed it in this orchestrator's session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC.

Today the gateway redacts only the patient's own identifiers: names, date of birth, member IDs and the call's claim numbers (PRD.md:575 on 83d71fd6). ADR 0054 lines 370–371 list "addresses, phone numbers and Social Security numbers, which PRD 14 does not list for redaction" as residuals. Addresses stay a residual: the ruling does not cover them.

The change goes into the one-pass folded matcher in `packages/model-gateway/src/redact.ts`. #80 built that matcher and #75 extends it. The change must not over-redact amounts, dates, claim numbers, NPIs or codes. The self-check must refuse a letter in which an SSN or phone form survives.

### Branch and head
- `co-001/redact-ssn-phone` is not on origin (ls-remote, 2026-11-01 ~14:50Z). There are no WIP refs for this item.
- The base `claude/build-platform` is at 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56. It does not contain #75. Do not cut from it. Cut the branch only from a `claude/build-platform` head that contains #75's merge commit.
- Read #75's code from `co-001/contract-phi-check` at 871faff987298fdbf493a092e3d13c2325e64309. That head merged a6e754fc, which contains #80's merge 0dd1ba7e.
- #75's WIP ref `co-001/wip-contract-phi-check-5` (7f77cb19af6c53f260bd3f100874b8357cd8bc48) descends from it and adds 165c5993 (#74). Its model-gateway, PRD and ADR 0054 files are identical to 871faff9's.
- Never commit or push to #75's branch or its WIP refs; #75's own session owns them.

### PR
None yet. Open a draft PR into `claude/build-platform` at the build stage.

The dependency is #75, checked live:
- It is open, draft and `mergeable_state` dirty, at head 871faff9 (updated 2026-10-28T03:54Z).
- Its last base merge is a6e754fc. It lacks 56ed6279 (#81) and 83d71fd6 (#78).
- Against 83d71fd6 it conflicts in `uploads/page.tsx`, `uploader.tsx` and `uploader.test.tsx`. Its own session (S4) resolves those.

### Design
- There is none yet. Create `designs/lane-b-redact-ssn-phone.md` on `claude/build-ops`; it does not exist at 15725ba2.
- Prior art:
  - `designs/lane-b-redact-placeholders.md` (#80's design).
  - ADR 0054's #80 amendment, lines 268–378 on 83d71fd6, with the residuals at 370–371 (372–373 on 871faff9).
  - `designs/lane-b-model-eval-gate.md` §5 (PR C, `co-001/contract-phi-check`) and Appendix A.3 (`identifierRuns`, `SCREEN_FLOORS` in `redact.ts`).
  - The origin of the question: `approval-summaries/lane-b-redact-placeholders-status.md`, Proposals: "PRD 14 question for the founder: redact Social Security and phone numbers by pattern in letters?"

### Status file
`approval-summaries/lane-b-redact-ssn-phone-status.md` does not exist at 15725ba2. The orchestrator creates it.

If it is still missing when you start, create it in the format of `lane-b-redact-placeholders-status.md`:
- header lines: Session, Reserved, Follow-on;
- `## Log (UTC)`, `## Waiting on someone`, `## Proposals (outside this PR)` and `## Next step`.

Then pull and push build-ops. Never force.

These facts in the records are contradicted by live state. Correct them in the status file first:
1. **The claim row says "PRD 14 records the ruling". It does not.**
   - On 83d71fd6, PRD.md:575 ("PHI minimization") lists only names, dates of birth, member IDs and claim numbers. On 871faff9, #75 edits that same paragraph and still adds no SSN or phone.
   - ADR 0054:371 still calls SSNs and phone numbers unlisted.
   - The ruling exists only on build-ops:
     - `approval-summaries/founder-asks-2026-10-27.md` "Decided 2026-11-01 (relayed by the co-founder)";
     - LANES.md row 198 and the rule 4 counter sentence;
     - `lanes/lane-b.md`:1024;
     - `lanes/lane-a-handoff-to-lane-b.md` §3 (line 67) and §7.
   - This PR records it, with who and when, in PRD §14, ADR 0054 (or 0088) and reconciliation-001, as rule 8 requires.
2. **"Relayed 2026-11-01" is incomplete.** Record it as: "the founder (Tyler Williams), 2026-11-01. The co-founder relayed it to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, 18bbe0e9, 14:04 UTC) and confirmed it in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC."
3. **"Builds on #80's folded matcher" is not the whole picture.** Build on #75's `redact.ts`. #75's head already contains #80. It changes:
   - `redact.ts`: +356 / −5 lines (1,166 lines, against 815 on the base). It adds `SCREEN_FLOORS`, `screenIdentifier`, `runIndex`, `someIdentifierRun`, `identifierRuns` and more.
   - `redact.test.ts`: a new file of 491 lines.
   - `functions/denial-letter.ts`: `denialLetterSpec` becomes `Object.freeze`.
   - the same PRD §14 paragraph;
   - ADR 0054's header (lines 3–9) and its end (it appends from line 378).
4. **What "synth the same as MOD-13" means:**
   - `packages/synth/src/cases/matrix.ts` entries, plus `registry.ts` entries of the form `none(10, '<why no file>', [test paths])`, with no fixture file.
   - The first argument of `none()` is `completesIn`, the milestone (`registry.ts:27`). It is not a module number.
   - MOD cases belong to the existing synth module 9, MOD (`packages/synth/src/cases/common.ts:18`). No new module is needed and none is reserved.
   - The redact-placeholders row in LANES.md ("synth module 10, no files") misreads `completesIn` as a module number.

### Reserved numbers
As LANES.md's claim row has them:
- "ADR 0088 if the design needs more than an ADR 0054 amendment"
- "test-matrix MOD-15 to MOD-16"
- "`packages/synth` the same as MOD-13 if needed"

All three are unused on the base and on every open branch (checked). There are no migration timestamps.

This is gateway-only Lane B work and never a schema PR. If the design turns out to need a migration, stop (rule 2), record it under "Handed to Lane A" and tell the orchestrator.

If the design only amends ADR 0054, release ADR 0088. Record that in the status file and tell the orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), so it updates LANES rule 4.

### Setup arguments
- **Design stage:** no branch argument. `bash /tmp/setup-container.sh` clones the repository, installs the pre-push hook and gitleaks 8.24.3, and creates `/home/user/ops`.
  - For running #75's code, also add a detached, read-only probe worktree by hand:
    ```
    git -C /home/user/PhysicalTherapy fetch -q origin co-001/contract-phi-check && git -C /home/user/PhysicalTherapy worktree add --detach /home/user/redact-ssn-phone-probe 871faff987298fdbf493a092e3d13c2325e64309
    ```
  - Then, in it: `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH && flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile`.
  - Never commit or push from the probe worktree.
- **Build stage**, once the branch is on origin: `co-001/redact-ssn-phone:/home/user/redact-ssn-phone`.

### Exact next step
Done so far: the claim and the reservations only (18bbe0e9, 15725ba2). All seven pipeline stages remain: design and review, build, draft PR, two reviews, fix round, verification, merge.

1. **Machine.** Run this in the background until it prints OK:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
   ```
   - The script at 15725ba2 does not move the base image's Node aside itself. If it prints `FAIL node - /opt/node24/bin/node reports 'v24.22.1', not v24.22.0`, run `mv /opt/node24 /opt/node24.base-image` and run it again.
   - storage.googleapis.com is allowed.
   - Then create the probe worktree (Setup arguments).
2. **Status file.** Run `git -C /home/user/ops pull --no-rebase origin claude/build-ops`. Read or create the status file, apply corrections 1–4, and log the start.
   - Usage (rule 9): at ~14:40 UTC on 2026-11-01 the co-founder reported weekly usage under 20% and said go wide. The week resets 2026-11-06 19:00 UTC. Ask again before a heavy run on a later day.
   - Before each heavy workflow, schedule a `send_later` about 5 h 10 min ahead. Run at most 2 heavy workflows per container. Every agent keeps a progress file (SAVE).
3. **Design (stage 1).**
   - **Probe first.** In a scratch test outside the worktree (synthetic twins only, never real PHI), probe what `redactLetter`, `holdsIdentifier` and `identifierCandidates` do today in `/home/user/redact-ssn-phone-probe`.
     - SSN forms:
       - `123-45-6789`;
       - spaced;
       - typographic dashes;
       - invisible characters;
       - a labeled bare 9-digit number (`SSN: 123456789`);
       - an HICN-shaped value (9 digits plus a letter).
     - Phone forms:
       - `(555) 123-4567`;
       - `555-123-4567`;
       - `555.123.4567`;
       - `+1 555 123 4567`;
       - `1-800-555-0100`;
       - with an extension.
     - Against things that must not be taken for an SSN or phone:
       - amounts;
       - every `datesIn` form;
       - the call's own member ID and claim numbers, which keep their MOD-13 placeholder even when SSN- or phone-shaped;
       - another patient's member ID or claim number (9- and 10-digit ones included), which must still reach `identifierCandidates` and the one-patient screen (MOD-14 must hold; candidates are read from the redacted text, `denial-letter.ts:233`);
       - 10-digit NPIs;
       - CPT and HCPCS codes;
       - ZIP+4.
   - **Decide:**
     - Matching runs in the same one pass over the folded view, with placeholder words that cannot be corrupted. MOD-13's properties must hold.
     - The self-check refuses a survivor. The refusal names no number (CLAUDE.md: no PHI in an error message or log).
     - Time stays linear: the crafted 100 kB letters stay within the 3 s budget.
     - The `readDenialLetter` verifier still finds dates and references.
     - No change to the versioned prompt if avoidable. A changed prompt is a new version under `packages/model-gateway/prompts/read-denial-letter/` with a changelog entry (`prompts.ts`).
     - Settle the ADR 0054 amendment against ADR 0088.
   - **Tests:**
     - Suggested split:
       - MOD-15: every SSN and phone form is redacted, and a letter where one survives is refused.
       - MOD-16: amounts, dates, NPIs, codes and ZIPs are sent unchanged; the call's identifiers keep their placeholders; another patient's identifiers are still offered to the screen.
     - Both go in `src/redact.property.test.ts`, with the generator as the oracle. Each probed case goes by name in `src/functions/denial-letter.test.ts` or `src/redact.test.ts` (#75's).
     - Add the synth `matrix.ts` and `registry.ts` entries (`none(10, …)`).
   - **Docs:** PRD §14, ADR 0054 (or 0088), reconciliation-001 and test-matrix.
4. **Design review (one reviewer).**
   - Adapt only the "Design review" phase of `workflow-scripts/lane-b-redact-placeholders-design-build-wf_0f7e6d06-e5b.js`:
     - rewrite `SP` to your scratchpad;
     - set `DESIGN=/home/user/ops/designs/lane-b-redact-ssn-phone.md` and `WT=/home/user/redact-ssn-phone-probe`;
     - rewrite the prompt text, which names `co-001/redact-placeholders` and its checks, for this item;
     - drop the Build phase for now.
   - Apply the findings.
   - Commit the design and the script on build-ops, archived as `workflow-scripts/lane-b-redact-ssn-phone-design-<runId>.js`.
   - Pull, then push with `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`.
5. **Wait for #75 to merge.**
   - Check with `gh api repos/PureTideWater/PhysicalTherapy/pulls/75 --jq '.merged, .merge_commit_sha'` on a `send_later`. Do not poll.
   - Do not `subscribe_pr_activity` to #75: its own session holds it.
   - Do not build before it merges. Then re-read the design against the merged `redact.ts` (rule 1).
6. **Branch.**
   - `git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform`.
   - Once `git merge-base --is-ancestor <#75 merge_commit_sha> origin/claude/build-platform` holds, run:
     ```
     GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin origin/claude/build-platform:refs/heads/co-001/redact-ssn-phone
     ```
   - Re-run setup with `co-001/redact-ssn-phone:/home/user/redact-ssn-phone`. Remove the probe worktree.
7. **Build (stage 2).**
   - Adapt the Build phase of the same script, with the prompt rewritten for this item and `WT=/home/user/redact-ssn-phone`.
   - `redact.ts` and `functions/denial-letter.ts` are screening-capacity watched paths (`tools/screening-capacity/watched-paths.txt`). If a watched file gains an import, run `pnpm exec tsx tools/screening-capacity/watched.ts --write` and commit what it writes. Never edit that file by hand.
8. **Draft PR (stage 3).**
   - Open it at once with MCP `create_pull_request` (draft, base `claude/build-platform`).
   - Fill the description from `.github/pull_request_template.md`: every section present ("None" rather than omitted), under 65,536 characters. Write it with MCP `update_pull_request`, then read it back.
   - Call `subscribe_pr_activity`.
9. **Two reviews (stage 4).**
   - Adapt `lane-b-redact-placeholders-reviews-wf_67ec5416-072.js`: a security and privacy review (`.claude/agents/security-reviewer.md`) and a correctness and AI-safety review, each in a fresh clone.
   - Add a UX and brand review with shots only if something a person sees changes (LANES rule 1).
10. **Fix round (stage 5).**
    - Adapt `lane-b-redact-placeholders-fix-round-wf_e3685db9-6a8.js`.
    - Run the full suite once (brief Part 3 C step 5): test:db in 4 shards and e2e on `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`.
    - Use `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH` (the old scripts lack `/opt/pnpm-bin`). Run every heavy command under `flock /tmp/laneb-heavy.lock`.
    - Push once.
11. **Verification (stage 6).** Adapt `lane-b-redact-placeholders-verify-wf_658451b6-c62.js`: a fresh clone that reads CI on the head.
12. **Merge (stage 7).**
    - Merge the latest base with a merge commit. Regenerate the generated files (`watched.ts --write`, `pnpm install`), never hand-merge them.
    - Wait for the four required checks (ruleset 25837331) to go green: `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
      - The capacity gate will measure, because a watched path changed (docs/runbooks/screening-capacity.md).
    - Mark ready, wait for approval-of-record's re-run, then `merge_pull_request` with method merge and `expectedHeadSha`.
    - Unsubscribe, read the push runs, clean the worktree, log, and tell the orchestrator.

Never use `--no-verify`, never force-push, never approve or request changes, never open a PR into `main`, and never write files through the GitHub connector.

### Merge order and dependencies
**#75 must merge first.** Handoff §6's order is #82, then #86, then #75, then #84, #83 and #85. #75 overlaps this item on:
- `redact.ts`, `redact.test.ts` and `functions/denial-letter.ts`;
- the PRD §14 paragraph (line 575);
- ADR 0054's header and end;
- reconciliation-001, test-matrix, `matrix.ts` and `registry.ts`.

Cutting after #75 merges removes all of those.

For the files below, the PR merged second resolves the conflict and keeps both sides (rule 6). Branch heads were checked live:

| File | Conflicts with |
|---|---|
| ADR 0054 (header lines 3–9 and the end, from line 376) | #84 e3299ea2 (its lost WIP acfd8980 touches the same lines) |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `registry.ts` | #42 be63bdc2, #82 96758e44, #83 f4a97668 (WIP f5e0ceba), #84 e3299ea2, #85 29dded52; the schema chain: SS-01 f897a282, 1b 358dc53f, interest e0646746 |
| `docs/product/reconciliation-001.md` | #42, #82, #86 83167b8f and the schema chain |
| `docs/product/PRD.md` | interest e0646746, which edits §13 at line 545, a different hunk from §14's line 575 |

- No open branch but #75 touches `redact.ts`, `denial-letter.ts` or their tests.
- Generated files are never hand-merged.

### Waiting on someone
- **The ruling:** decided by the founder on 2026-11-01 and confirmed by the co-founder. Nothing is open and nothing blocks.
- **New trade-offs** the design raises go to the co-founder. Examples: an unlabeled bare 9-digit number that may be a claim number or member ID; the payer's own letterhead phone being redacted.
  - The founder's delegation of 2026-10-25 lets him decide security trade-offs on Lane B's work (rule 8).
  - Record each in the status file's "Waiting on someone" and tell the orchestrator. It blocks only that point.
- **Merge:** this is non-schema, so it merges on green CI after the fresh-clone verification (rule 7). Runbook 3i and `APPROVAL_REVIEW_REQUIRED` stay the founder's and do not block.
- **#75's F1 floors and F2 (legal):** these are the founder's. They do not block #75's merge, so they do not block this item.

### Follow-on
None.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
