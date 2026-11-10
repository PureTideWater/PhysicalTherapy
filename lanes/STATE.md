# PaidWhole build: current state (read this first; one page)

Updated 2026-11-10 21:30 UTC by Lane A's orchestrator. **Keep it current:** the orchestrator rewrites it after every
merge or ruling. History lives in `lanes/lane-b.md`; claims and counters in `LANES.md`. Sessions read this file, their
own status file and `CLAUDE.md`, not the long history files.

## Accounts and pace
- **Lane A** (this account): the weekly allowance reset on 2026-11-10 at about 14:00 UTC; the next reset is Tue 2026-11-17.
- **Lane B:** capped until Fri 2026-11-13 19:00 UTC. Until then Lane A runs Lane B's urgent items as acting Lane B, and hands them back at 18:30 UTC that day.
- **Pace to the week:** an orchestrator plus 3 work sessions, about 13% of the weekly allowance a day. No bursts.
- **Model:** every session and every subagent runs `claude-fable-5-2`, the co-founder's choice of 2026-11-10. Sessions inherit it; never override it with a smaller model.

## Token rules (the co-founder's direction: token friendly, no loss of quality)
- No Workflow fan-outs unless the co-founder opts in. Reviews run as Agent subagents: two adversarial reviews for the database, money, PHI and redaction, auth, security and CI permissions; one for wording, display, tests and dependencies.
- Mechanical steps run in the session itself, not in a subagent: base merges, generators, CI polling, descriptions.
- The speed rules stand (`lanes/acting-lane-b-2026-11-04.md`, rules 1 to 5 and 2a):
  - CI is the suite of record; the full local suite runs once per PR;
  - the base is merged right before the last push;
  - the up-to-date rule;
  - review depth matches risk.
- Report to the orchestrator only merges, blockers and founder asks, in one line each.

## Base and open PRs (live 2026-11-10 21:20 UTC)
- `claude/build-platform` is at **d4f52071** (#133). Nothing has moved since 2026-11-07 19:44 UTC.
- **#126**, the interest fix (schema): head 64aa14d9.
- **#134**, SUITE-CAP-3 reconcile: head ee1dbb7d (WIP `co-001/wip-suite-cap-3-build-s1` a3e77a72).
- **#129**, the email lockup plate: head f4fef908; waits only for MOD-16.
- Dependabot #122, #123, #124 and #135, untriaged: one replacement PR, never merged as they stand.

## Work, in priority order (each item's status file holds its RESUME-BLOCK; Lane B's handoff §2 names them)
| # | Item | Resume from | Lane | Notes |
| --- | --- | --- | --- | --- |
| 1 | **MOD-16: a date range glued to a word escapes redaction** (PHI; base CI flake) | `co-001/wip-redact-range-glued` 3fcb9359; candidate B 9f953223 | B (acting) | Unblocks every PR's `unit` job and #129. Two reviews. |
| 2 | **#126, interest credited once** (schema) | 64aa14d9; `approval-summaries/lane-a-schema-chain-status.md` | A | Finish, CAS-42.5 on the final head, verification, then the suggested approval line. **The founder commits it.** |
| 3 | **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22) | Not cut; Lane B's handoff §2 | B (acting) | **Must land before any real PHI is processed.** After MOD-16. Two reviews. |
| 4 | **#134, SUITE-CAP-3** | a3e77a72; `lane-b-suite-cap-3-status.md` | B (acting) | Fix round, then merge. No `ledger_line_net` change without a founder exception. |
| 5 | **#129, email plate** | f4fef908 | B (acting) | Base merge after MOD-16 lands, then merge. |
| 6 | **password-changed-notice** (schema PR 1) | f110efd9 (WIP c0ced87f), stacked on #126 | A | Opens only after #126 merges. Founder's line. |
| 7 | The schema batching plan, PRs 2 to 10 | `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` | A | One schema PR at a time. |
| 8 | Packets verifier identifier fold (MOD-19, MOD-20) | `lane-b-packets-verifier-identifier-fold-status.md` | B | Never at the same time as the verifier /3 migration. |
| 9 | Web requests never wait on a reconcile; Stryker static-mutant timeouts; Dependabot replacement PR; P2 Trivy version; dark-mode-ship; the UX queue | Lane B's handoff §2; `LANES.md` Queues | B | As capacity allows. |

## Founder items (bring each with the exact link or text)
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
