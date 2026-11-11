# PaidWhole build: current state (read this first; one page)

Updated 2026-11-11 01:20 UTC by Lane A's orchestrator. **Keep it current:** the orchestrator rewrites it after every
merge or ruling. History lives in `lanes/lane-b.md`; claims and counters in `LANES.md`. Sessions read this file, their
own status file and `CLAUDE.md`, not the long history files.

## Accounts and pace
- **Orchestrator:** session_019i9ifDAzQNA3kLHozjBoeS, from 2026-11-10 21:23 UTC. The co-founder talks to it. Work sessions (started 21:24 UTC):
  - **W1** session_019i9if9bThP3wWKpHBiU3m8 (acting Lane B): items 1, 5, 3, 8, in that order.
  - **W2** session_019i9ifDkbzUJwNMrtB7Yriz (Lane A): items 2, 6, 7.
  - **W3** session_019i9ifE6JAC24yB5654GXcV: merged #134 and #136, then stood down on 2026-11-11 (its context had passed 500k tokens). It holds nothing.
- **Lane A** (this account): the weekly allowance reset on 2026-11-10 at about 14:00 UTC; the next reset is Tue 2026-11-17 14:00 UTC. **Its weekly limit showed the warning level at about 00:30 UTC on 2026-11-11**, 11 hours into the week; sessions cannot see the percentage, only the co-founder can.
- **Lane B:** capped until Fri 2026-11-13 19:00 UTC. Until then Lane A runs Lane B's urgent items as acting Lane B, and hands them back at 18:30 UTC that day.
- **Environment:** the Default environment has a guarded setup script since 2026-11-10 (it runs `tools/setup-container.sh` from `claude/build-ops`; log in `/tmp/setup-container.log`). Unproven on a fresh container: a new session still runs the script once and reads its summary.
- **Pace (from 2026-11-11 01:00 UTC, the limit at its warning level):** one build at a time (W1) beside the schema chain's founder-gated steps (W2). Near-done items first: MOD-16 to its merge, #126 to its line, #129. Every session pushes its WIP ref and keeps its RESUME-BLOCK current at every clean point, so a hard stop strands nothing. A session whose context passes about 300k tokens finishes its item and stands down; the next item starts in a fresh session. If the account stops, this page and `lanes/lane-a-handoff-to-lane-b-2026-11-13.md` are the handoff.
- **Model:** every session and every subagent runs the model the co-founder chose on 2026-11-10, set on each session. Subagents inherit it; never override it with a smaller model.

## Token rules (the co-founder's direction: token friendly, no loss of quality)
- No Workflow fan-outs unless the co-founder opts in. Reviews run as Agent subagents: two adversarial reviews for the database, money, PHI and redaction, auth, security and CI permissions; one for wording, display, tests and dependencies.
- Mechanical steps run in the session itself, not in a subagent: base merges, generators, descriptions.
- While CI runs, subscribe to the PR and end the turn; never poll in a loop (each poll re-reads the session's whole context).
- The speed rules stand (`lanes/acting-lane-b-2026-11-04.md`, rules 1 to 5 and 2a):
  - CI is the suite of record; the full local suite runs once per PR;
  - the base is merged right before the last push;
  - the up-to-date rule;
  - review depth matches risk.
- Report to the orchestrator only merges, blockers and founder asks, in one line each.

## Base and open PRs (live 2026-11-11 00:55 UTC)
- `claude/build-platform` is at **06cde5eb** (#136, merged 2026-11-11 00:54 UTC; #134 before it as 994ee303). Every open PR merges this base before its last push.
- **#126**, the interest fix (schema): head 64aa14d9.
- **#137**, a `lock_timeout` on every web mutation (Queues item 24; CAS-57; amends ADR 0092): draft, head 59eb9e9d. **Built, not reviewed, held, not assigned.** Its RESUME-BLOCK is in `approval-summaries/lane-b-web-lock-timeout-status.md`: three reviews, then the fix round and the merge, in a fresh session.
- **#129**, the email lockup plate: head f4fef908; waits only for MOD-16.
- Dependabot #122, #123, #124 and #135, untriaged: one replacement PR, never merged as they stand.

## Work, in priority order (each item's status file holds its RESUME-BLOCK; Lane B's handoff §2 names them)
| # | Item | Resume from | Lane | Notes |
| --- | --- | --- | --- | --- |
| 1 | **MOD-16: a date range glued to a word escapes redaction** (PHI; a random-seed flake in `unit`; push runs on d4f52071 green, but #129 failed on it twice) | Candidate B's WIP `co-001/wip-redact-range-glued-b` 9f953223 (on 3fcb9359); `lane-b-redact-range-glued-status.md` (the orchestrator's rulings (A) and (B) of 2026-11-07 10:53 UTC; the round-4 harnesses kept in `designs/lane-b-redact-ssn-phone/gate/round-harnesses/round4/`) | B (acting) | Judge round 1 confirmed 9 blocking findings on B; round 2 was bookkeeping. Next: finish the review rounds and fixes, the full suite once, push, draft PR, CI, verification, merge. It unblocks #129. Two reviews. |
| 2 | **#126, interest credited once** (schema) | Head 64aa14d9; `approval-summaries/lane-a-schema-chain-status.md` (2026-11-07 18:50 UTC entry); round-5 progress files in `approval-summaries/lane-a-wip/interest-pr/round-5/` | A | Round 5's re-walk fix is pushed (87ce6146, then 64aa14d9): bounded at entries + 1, retryable, interest <= cash after every reconcile. Its review round 1 confirmed findings, and their fix was cut by a restart. Next: that fix, CAS-42.5 on the final head, verification, the suggested approval line. Domain model provisional (bb7662c6…). **The founder commits the line.** |
| 3 | **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22) | Not cut; Lane B's handoff §2 | B (acting) | **Must land before any real PHI is processed.** After MOD-16. Two reviews. |
| 4 | #134, SUITE-CAP-3: **merged as 994ee303** (2026-11-10) | `lane-b-suite-cap-3-status.md` | B (acting) | Done. No `ledger_line_net` change. |
| 5 | **#129, email plate** | f4fef908; `lane-a-email-lockup-plate-status.md` | B (acting), W1 | W1 takes it right after MOD-16 merges: base merge, then merge. |
| 6 | **password-changed-notice** (schema PR 1) | f110efd9 (WIP c0ced87f), stacked on #126 | A | Opens only after #126 merges. Founder's line. |
| 7 | The schema batching plan, PRs 2 to 10 | `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` | A | One schema PR at a time. |
| 8 | Packets verifier identifier fold (MOD-19, MOD-20) | `lane-b-packets-verifier-identifier-fold-status.md` | B | Never at the same time as the verifier /3 migration. |
| 9 | Web requests never wait on a reconcile; Stryker static-mutant timeouts; Dependabot replacement PR; P2 Trivy version; dark-mode-ship; the UX queue | Lane B's handoff §2; `LANES.md` Queues | B | Not assigned while the limit is at its warning level. #136 (the seven ledger actions; ADR 0092, CAS-56) merged as 06cde5eb. Next is `LANES.md` Queues item 24, draft #137 (above): **held** at its reviews. Then the rest in order. |

## Founder items (bring each with the exact link or text)
- **Granted 2026-11-07 19:26 UTC** (relayed as "Tyler approves"): the schema batching plan's PR 5 ledger freeze ask. Q1 to Q3 yes, exactly Appendices A and D, for schema PR 5 only (`approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`).
- #126's approval line ("Commit suggestion"), then password-changed-notice's.
- Staging:
  - F0, before release N reaches production;
  - F1 to F5 and ruling 16, before Cognito PR 2;
  - #125's smoke checks;
  - Gmail iOS and Outlook.com dark renders.
- Launch: #42's actions 2 to 7, counsel's reading of the legal text, O9 (#41), runbook 3i, PRD section 19's RDS cost line.

## Never
- Sign or approve as the founder, or write the approval line or `approvers.json`.
- Approve or request changes on a PR; merge a schema PR before the founder's line.
- Open a PR into main, or create a release tag.
- Use `--no-verify`, force a push, or touch `.gitleaksignore`: a gitleaks refusal is fixed by rewriting the flagged text.
- Write files through the GitHub connector.
- Put PHI or a model identifier in any repository artifact.

Keep the repository public: a private repository fails the screening-capacity gate on GitHub's free runners.
