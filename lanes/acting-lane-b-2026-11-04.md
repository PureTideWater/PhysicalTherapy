# Acting Lane B on Lane A's account (2026-11-04 to 2026-11-06 18:30 UTC)

Lane B's account is capped until **2026-11-06 19:00 UTC**. At the co-founder's word (2026-11-04), Lane A's account
finishes Lane B's six waiting pull requests until then, and hands back whatever is not merged. Lane A's orchestrator is
session_01TrKDxeLbxVo7t7zwRXFzrg. Each session below holds its items alone.

| Session | Items, in order | Lane B's item prompt (`lanes/lane-b-item-prompts-2026-11-01/`) and status file |
| --- | --- | --- |
| S1 session_019i9ifCJSbPYXpafL86Rm6J | #75 contract-phi-check, then #85 UX PR 10 (it waits for #75 only) | `contract-phi-check.md`, `ux-payer-response.md`; `approval-summaries/lane-b-model-eval-gate-status.md` (#75's sections), `lane-b-ux-payer-response-status.md` |
| S2 session_019i9ifAd3jhRt1Vkzz2vUSQ | #84 packet day counts (merges after #85) | `packet-day-counts.md`; `lane-b-packet-day-counts-status.md` |
| S3 session_019i9ifDkvaQzK4YgTGnKWC3 | #86 ci-images-digest, then #96 P4 ci-mutation-trigger | `ci-images-digest.md`, `ci-pin-age.md` (P4); `lane-b-ci-images-digest-status.md`, `lane-b-ci-deps-status.md` |
| S4 session_019i9ifAfByN2caCea4jgSdu | #94 Dependabot B (closing #99 and #100 with a comment when it merges; #88 and #89 get a comment), then PR D test-flakes-2 (FRM-01's monotonic wait, `csv-arena.test.ts:151`'s explicit timeout) | `dependabot-batch.md`; `lane-b-dependabot-batch-status.md` |

The schema chain runs alongside in session_019i9ifEG147aKfNHEAsoS7h (Lane A's own).

## Start
- Write this line at the top of your status file and push it:
  `ACTING (Lane A's account, <your session URL>) holds this item from <UTC time>; Lane B: read lanes/lane-b.md's latest entries before resuming.`
- Start from origin's head and the newest WIP ref. A Lane B session's unpushed work is gone; never wait for it.
- Lane B's capped sessions may still hold a PR's subscription. If `subscribe_pr_activity` says another session holds
  it, poll with `pull_request_read` plus `send_later` instead.

## Speed rules (Lane A's orchestrator, 2026-11-04; they apply to both lanes from now on)
1. **CI is the full suite of record** on every push. Locally run:
   - the fast checks: typecheck, lint, lint:copy, lint:logs, check:fixtures, and synth with its diff;
   - the tests the change touches;
   - `db:domain-model --check` when the database is involved.
   Run the full local suite **once per PR**, on its final tree, before its single fix-round push. Nothing merges unless
   every required check is green in CI on that exact head.
2. **Merge the base once, right before the push that precedes the merge.** Never chase the base otherwise.
   - Order matters only between conflicting pairs, and the PR merged second resolves: #75 then #85 then #84; #86 then #96.
   - Any other verified, green PR merges as soon as it is ready.
3. **Review depth matches risk.**
   - Two adversarial reviews, each finding checked by a skeptic, for a change to:
     - the database (a migration or a function);
     - money (packages/pricing, ledger, packets);
     - PHI handling or redaction, the model gateway;
     - sign-in, authorization, or security;
     - a CI workflow's permissions, triggers or supply chain.
   - One adversarial review for a change that is only wording, display, test-only, or a dependency bump with green
     suites. That review is the UX and brand review when a person sees the change.
   - A review round already done stands. Only the delta since it is reviewed.
4. **Pace the week.** At most two heavy workflows per session, every heavy command under `flock /tmp/laneb-heavy.lock`.
   Push WIP refs before each heavy stage. Schedule a `send_later` check-in about 5 h 10 min ahead of each heavy workflow.
   When the 5-hour limit stops you, re-run setup if PostgreSQL is down and resume with `resumeFromRunId`.
5. **Keep records short:** decisions, results and the next step; no narration. PR descriptions stay under 65,536
   characters.

## Handback
- **When an item merges:** record it in its status file, unsubscribe from the PR, and go on to the session's next item.
- **At 2026-11-06 18:30 UTC, for any item not merged:**
  - stop at a clean point;
  - push the work as a WIP ref;
  - write the status file's RESUME-BLOCK for Lane B (head, WIP ref, CI state, the exact next step);
  - unsubscribe from its PR, cancel your check-ins, and stop;
  - `send_message` to session_01TrKDxeLbxVo7t7zwRXFzrg that you have stood down.
- Lane A's orchestrator then writes the one-page handback in `lanes/lane-b.md`.

## Unchanged
Lane B's brief (`lanes/lane-b-session-brief.md`) and the item prompts hold, including the never-list:
- no approving or requesting changes on a PR;
- no PR into main, no release tag;
- no `--no-verify`, no forced push, no `.gitleaksignore` entry;
- no file written through the GitHub connector;
- no PHI or model identifier in any artifact.
The founder's decisions stay the founder's. Commits end with the Co-Authored-By line and your own session URL.
