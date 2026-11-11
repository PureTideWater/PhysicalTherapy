# PaidWhole build: current state (read this first; one page)

Updated 2026-11-11 03:10 UTC by Lane A's orchestrator. **Keep it current:** the orchestrator rewrites it after every
merge or ruling. History lives in `lanes/lane-b.md`; claims and counters in `LANES.md`. Sessions read this file, their
own status file and `CLAUDE.md`, not the long history files.

## Accounts and pace
- **Orchestrator:** session_019i9ifDAzQNA3kLHozjBoeS, from 2026-11-10 21:23 UTC. The co-founder talks to it. Work sessions (started 21:24 UTC):
  - **W1** session_019i9if9bThP3wWKpHBiU3m8: merged MOD-16 (#138) and #129, wrote item 3's RESUME-BLOCK, then stood down on 2026-11-11 03:05 UTC. It holds nothing.
  - **W2** session_019i9ifDkbzUJwNMrtB7Yriz (Lane A): items 2, 6, 7.
  - **W3** session_019i9ifE6JAC24yB5654GXcV: merged #134 and #136, then stood down on 2026-11-11 (its context had passed 500k tokens). It holds nothing.
  - **W4** session_019i9ifAM5Y3ftqx7i6Cx8Gk (acting Lane B), from 2026-11-11 01:20 UTC, at the highest effort: draft #137, then item 8, then the rest of item 9.
  - **W5** session_019i9ifC8ouxG6CLPdZtgAcJ (acting Lane B), from 2026-11-11 02:37 UTC, at the highest effort: item 3, the SSN and phone leaks PR.
- **Lane A** (this account): the weekly allowance reset on 2026-11-10 at about 14:00 UTC; the next reset is Tue 2026-11-17 14:00 UTC. **Its weekly limit showed the warning level at about 00:30 UTC on 2026-11-11**, 11 hours into the week; sessions cannot see the percentage, only the co-founder can.
- **Usage (the co-founder's reading, 2026-11-11 01:30 UTC):** 34% of the week on all models, 32% on the build's model. From the sessions' records, 1% is about 5 dollars of API-equivalent usage, so three builds use roughly 4 to 7% an hour and the limit would arrive between about 11:00 and 19:00 UTC on 2026-11-11 unless the co-founder resets it. Sessions cannot see the percentage. When the limit stops them the orchestrator stops too; the co-founder's next message after a reset restarts them from their RESUME-BLOCKs.
- **Lane B:** capped until Fri 2026-11-13 19:00 UTC. Until then Lane A runs Lane B's urgent items as acting Lane B, and hands them back at 18:30 UTC that day.
- **Environment:** the Default environment has a guarded setup script since 2026-11-10 (it runs `tools/setup-container.sh` from `claude/build-ops`; log in `/tmp/setup-container.log`). Unproven on a fresh container: a new session still runs the script once and reads its summary.
- **Pace (the co-founder, 2026-11-11 01:15 UTC):** weekly usage is under 40% and the co-founder can reset the limit, so three builds run again beside the orchestrator. A session started for database, money, PHI and redaction, auth, security or CI-permissions work runs at the highest effort setting (the co-founder: the same model throughout, the highest effort where it is needed). Two rules stay. Every session pushes its WIP ref and keeps its RESUME-BLOCK current at every clean point, so a hard stop strands nothing. A session whose context passes about 300k tokens finishes its item and stands down; the next item starts in a fresh session. If the account stops, this page and `lanes/lane-a-handoff-to-lane-b-2026-11-13.md` are the handoff.
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

## Base and open PRs (live 2026-11-11 03:07 UTC)
- `claude/build-platform` is at **ca504674** (#129, merged 2026-11-11 03:05 UTC; before it #138 as ef3e8d20, #136 as 06cde5eb and #134 as 994ee303). The `unit` job's random-seed flake is fixed on it. Every open PR merges this base before its last push.
- **#126**, the interest fix (schema): head 8a61c612 (W2 found and fixed a CI hang in CAS-42.3; then CAS-42.5, verification and the suggested line).
- **#137**, a `lock_timeout` on every web mutation (Queues item 24; CAS-57; amends ADR 0092): draft; **W4** is in its fix rounds (review rounds 1 and 2 recorded in `approval-summaries/lane-b-web-lock-timeout-status.md`), then merges it.
- Dependabot #122, #123, #124 and #135, untriaged: one replacement PR, never merged as they stand.

## Work, in priority order (each item's status file holds its RESUME-BLOCK; Lane B's handoff §2 names them)
| # | Item | Resume from | Lane | Notes |
| --- | --- | --- | --- | --- |
| 1 | MOD-16: **merged as ef3e8d20** (#138, 2026-11-11) | `lane-b-redact-range-glued-status.md` | B (acting) | Done. Residuals A, A' and B go to item 3. Four safer-reading costs are recorded in ADR 0054 and #138's description. |
| 2 | **#126, interest credited once** (schema) | Head 64aa14d9; `approval-summaries/lane-a-schema-chain-status.md` (2026-11-07 18:50 UTC entry); round-5 progress files in `approval-summaries/lane-a-wip/interest-pr/round-5/` | A | Round 5's re-walk fix is pushed (87ce6146, then 64aa14d9): bounded at entries + 1, retryable, interest <= cash after every reconcile. Its review round 1 confirmed findings, and their fix was cut by a restart. Next: that fix, CAS-42.5 on the final head, verification, the suggested approval line. Domain model provisional (bb7662c6…). **The founder commits the line.** |
| 3 | **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22) | `lane-b-redact-ssn-phone-leaks-status.md` | B (acting), **W5** | **Must land before any real PHI is processed.** Started 2026-11-11 02:40 UTC: the gate reproduced. Two reviews. |
| 4 | #134, SUITE-CAP-3: **merged as 994ee303** (2026-11-10) | `lane-b-suite-cap-3-status.md` | B (acting) | Done. No `ledger_line_net` change. |
| 5 | #129, email plate: **merged as ca504674** (2026-11-11) | `lane-a-email-lockup-plate-status.md` | B (acting) | Done. |
| 6 | **password-changed-notice** (schema PR 1) | f110efd9 (WIP c0ced87f), stacked on #126 | A | Opens only after #126 merges. Founder's line. |
| 7 | The schema batching plan, PRs 2 to 10 | `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` | A | One schema PR at a time. |
| 8 | Packets verifier identifier fold (MOD-19, MOD-20) | `lane-b-packets-verifier-identifier-fold-status.md` | B (acting) | Not started. W4 takes it after #137, or a fresh session does. Never at the same time as the verifier /3 migration. |
| 9 | Web requests never wait on a reconcile; Stryker static-mutant timeouts; Dependabot replacement PR; P2 Trivy version; dark-mode-ship; the UX queue | Lane B's handoff §2; `LANES.md` Queues | B | W4. #136 (the seven ledger actions; ADR 0092, CAS-56) merged as 06cde5eb. Next is `LANES.md` Queues item 24, draft #137 (above). Then the rest in order. |

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
