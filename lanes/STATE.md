# PaidWhole build: current state (read this first; one page)

Updated 2026-11-11 09:15 UTC by Lane A's orchestrator, at its handover. **Keep it current:** the orchestrator rewrites it after every
merge or ruling. History lives in `lanes/lane-b.md`; claims and counters in `LANES.md`. Sessions read this file, their
own status file and `CLAUDE.md`, not the long history files.

## Accounts and pace
- **Orchestrator:** session_019i9ifBCrxfV35CFDVHLTad, from 2026-11-11 09:15 UTC, at the default effort. The co-founder talks to it. It took over from session_019i9ifDAzQNA3kLHozjBoeS (2026-11-10 21:23 UTC to 2026-11-11 09:15 UTC), whose context had passed 480k tokens and which holds nothing. Work sessions:
  - **W1** session_019i9if9bThP3wWKpHBiU3m8: merged MOD-16 (#138) and #129, wrote item 3's RESUME-BLOCK, then stood down on 2026-11-11 03:05 UTC. It holds nothing.
  - **W2** session_019i9ifDkbzUJwNMrtB7Yriz: merged #126, then stood down on 2026-11-11 05:37 UTC. It holds nothing.
  - **W3** session_019i9ifE6JAC24yB5654GXcV: merged #134 and #136, then stood down on 2026-11-11 (its context had passed 500k tokens). It holds nothing.
  - **W4** session_019i9ifAM5Y3ftqx7i6Cx8Gk: merged #137, then stood down on 2026-11-11 04:26 UTC (its context had passed 300k tokens). It holds nothing.
  - **W5** session_019i9ifC8ouxG6CLPdZtgAcJ (acting Lane B): item 3, the SSN and phone leaks PR, to its merge, then it stands down (its context is past 760k tokens).
  - **W6** session_019i9if9f2m3xyLBavfHUgui (Lane A): item 6 until its approval line is posted, then it stands down (its context is past 600k tokens). The merge step goes to W9.
  - **W7** session_019i9ifCb8Sa7jHnu6j4af8F (acting Lane B): item 8, draft #141; it merges it, then stands down (its context is past 770k tokens).
  - **W8** session_019i9ifE7teUhX79iAZKaxt5: designed Queues item 28 (two design reviews, version 2), then stood down on 2026-11-11 07:25 UTC. It holds nothing; `approval-summaries/lane-a-step-before-reset-status.md` is the handoff.
  - **W9** session_019i9ifBKxrX229x23BggpZK (Lane A), from 2026-11-11 07:15 UTC, at the default effort: builds Queues item 28 from W8's design, takes item 6's merge step after the founder's commit, then opens item 28's PR.
  - **W10** session_019i9ifDEoMdpgEBKLKNbUEq (Lane A), from 2026-11-11 09:40 UTC, at medium effort (a merge step and a PR from a finished branch): #140's merge step, then item 28's PR. W9 stood down at 09:37 UTC (context past 300k tokens); it holds nothing.
  - **W11** session_019i9ifBgvfeZAe47vuU7EUC (Lane A), from 2026-11-11 11:25 UTC, at high effort (ledger function bodies under an exact grant: money, a migration, an equivalence proof): the schema batching plan's PR 2, built on a WIP ref until #142 merges.
  - **W12** session_019i9ifDAwBuwwvswwPuj4AN (acting Lane B), from 2026-11-11 12:55 UTC, at the default effort (a build with a design note and two bounded reviews): Queues item 25 (a), the web's transaction scope.
- **Lane A** (this account): the weekly allowance reset on 2026-11-10 at about 14:00 UTC; the next reset is Tue 2026-11-17 14:00 UTC. **Its weekly limit showed the warning level at about 00:30 UTC on 2026-11-11**, 11 hours into the week; sessions cannot see the percentage, only the co-founder can.
- **Usage:** the account ran out of its weekly allowance at 08:11 UTC on 2026-11-11 (every session stopped with its work pushed); the co-founder reset it at about 08:55 UTC and every session resumed. From the sessions' records one allowance is roughly 1,400 API-equivalent dollars, and a merged PR has cost roughly 110 to 130 of them, so one allowance buys about ten PRs at this review depth. Sessions cannot see the percentage. When the limit stops them the orchestrator stops too; the co-founder's next message after a reset restarts them from their RESUME-BLOCKs.
- **Lane B:** capped until Fri 2026-11-13 19:00 UTC. Until then Lane A runs Lane B's urgent items as acting Lane B, and hands them back at 18:30 UTC that day.
- **Environment:** the Default environment has a guarded setup script since 2026-11-10 (it runs `tools/setup-container.sh` from `claude/build-ops`; log in `/tmp/setup-container.log`). **Proven on 2026-11-11:** W4's machine was ready at start. After a container restart a session runs the script again.
- **Pace (from the reset, 2026-11-11 09:00 UTC):** at most three builds beside the orchestrator, by the priority order below, each at the default effort; in-flight items finish before a new one starts. **New sessions run at the default effort (the orchestrator's ruling, 2026-11-11 07:15 UTC).** The co-founder allowed the highest effort where it is needed; W4 to W8 ran at it, and each cost about 35 to 90 API-equivalent dollars an hour (read at 07:10 UTC) against about 6 to 25 for W1 to W3, whose reviews and merges were as sound, so it is not needed by default. A session may ask the orchestrator for one deeper review where a finding turns on hard reasoning. Two rules stay. Every session pushes its WIP ref and keeps its RESUME-BLOCK current at every clean point, so a hard stop strands nothing. A session whose context passes about 300k tokens finishes its item and stands down; the next item starts in a fresh session. If the account stops, this page and `lanes/lane-a-handoff-to-lane-b-2026-11-13.md` are the handoff.
- **Effort (the co-founder's direction, 2026-11-11 09:09 UTC, read in their own message; it replaces the ruling that every new session runs at the default effort):** every session and subagent stays on the model the co-founder chose, and each new session's effort is chosen for its item, set at creation, with the reason in one line in `lanes/lane-b.md`. Low or medium for mechanical or narrow work (a merge step, opening a PR from a finished branch, a version pin, the Dependabot replacement, records); the default for a build from a reviewed design, display, wording and tests; higher for the design and the review of changes where a wrong call is costly and the reasoning hard (PHI and redaction rules, sign-in and session security, ledger arithmetic, migrations with locking). The highest setting is for a bounded design or review step, never a long-running builder. A running session's effort cannot be changed. The subagent budgets matter as much as the effort.
- **Model:** every session and every subagent runs the model the co-founder chose on 2026-11-10, set on each session. Subagents inherit it; never override it with a smaller model.

## Token rules (the co-founder's direction: token friendly, no loss of quality)
- No Workflow fan-outs unless the co-founder opts in. Reviews run as Agent subagents: two adversarial reviews for the database, money, PHI and redaction, auth, security and CI permissions; one for wording, display, tests and dependencies.
- Mechanical steps run in the session itself, not in a subagent: base merges, generators, descriptions.
- While CI runs, subscribe to the PR and end the turn; never poll in a loop (each poll re-reads the session's whole context).
- Large output (suites, gates, generators, renders) goes to a file; a session reads the counts and the parts it needs.
- Every review subagent gets a named scope (one risk, or the delta), the files or sections to read, a budget of about 20 tool calls and a file for its report. A fix round's review reads its delta only. One larger command beats several small ones: every tool call re-reads the session's whole context.
- **The commit trailer (the orchestrator's ruling, 2026-11-11 05:20 UTC, under the co-founder's standing instruction; the co-founder was asked at 04:45 UTC and may overrule it):** every commit ends with `Co-Authored-By: Claude <noreply@anthropic.com>` and the session's `Claude-Session:` line, naming no model. Why: the brief's fixed trailer names a model that is not the one the sessions run, so it is untrue of their commits, and three sessions would not write it; a line that names none is true whichever model serves a turn. Earlier commits stay as they are (no forced push): some carry the brief's line, some the harness's, which names the model the sessions run (seven of those are in the base under 4fe8bcca). No model is named anywhere else in a file, commit body, PR text or comment.
- The speed rules stand (`lanes/acting-lane-b-2026-11-04.md`, rules 1 to 5 and 2a):
  - CI is the suite of record; the full local suite runs once per PR;
  - the base is merged right before the last push;
  - the up-to-date rule;
  - review depth matches risk.
- Report to the orchestrator only merges, blockers and founder asks, in one line each.

## Base and open PRs (live 2026-11-11 05:40 UTC)
- `claude/build-platform` is at **3bff4fd6** (#142, Queues item 28, merged 2026-11-11 12:53 UTC by W10 with the founder's committed line dfd39ec0; W10 stood down and holds nothing; ADR 0093's Status still reads "proposed" and rides the next schema PR). Before it: **edab4d4d** (#141, the packets verifier identifier fold, merged 2026-11-11 11:20 UTC by W7, which stood down and holds nothing; `redact.ts` now lives in `packages/redact`). Before it: **342d6144** (#140, password-changed-notice, merged 2026-11-11 10:06 UTC with the founder's committed line 7e05e0c6). Before it: 2e26a416 (#126, merged 2026-11-11 05:37 UTC with the founder's approval line; before it #137 as 4fe8bcca, #129 as ca504674, #138 as ef3e8d20, #136 as 06cde5eb and #134 as 994ee303). Every open PR merges this base before its last push.
- **#142: merged as 3bff4fd6.** Next in the schema chain: the batching plan's PR 2 (ledger function bodies under the founder's grant), **W11**, on a WIP ref; its migration write was refused by the session's permission check and waits for the co-founder's word in W11's session (asked 11:35 UTC). No schema PR is open.
- **#141: merged as edab4d4d.** Its proposals P1 to P7 are in `approval-summaries/lane-b-packets-verifier-identifier-fold-status.md`; P1 is a founder ruling (brought to the co-founder 11:25 UTC), P6 is in Queues item 26.
- Dependabot #123, #124, #135 and #139 (#139 replaced #122 on 2026-11-11), untriaged: one replacement PR, never merged as they stand.

## Work, in priority order (each item's status file holds its RESUME-BLOCK; Lane B's handoff §2 names them)
| # | Item | Resume from | Lane | Notes |
| --- | --- | --- | --- | --- |
| 1 | MOD-16: **merged as ef3e8d20** (#138, 2026-11-11) | `lane-b-redact-range-glued-status.md` | B (acting) | Done. Residuals A, A' and B go to item 3. Four safer-reading costs are recorded in ADR 0054 and #138's description. |
| 2 | #126, interest credited once: **merged as 2e26a416** (2026-11-11) | `approval-summaries/lane-a-schema-chain-status.md` | A | Done. Four owed items are `LANES.md` Queues item 27. Open with the founder: whether to grant D19's exact alternative as a later schema PR (a new ledger freeze exception). |
| 3 | **SSN and phone leaks** (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22) | `lane-b-redact-ssn-phone-leaks-status.md` | B (acting), **W5** | **Must land before any real PHI is processed.** Design reviewed and fixed; build next. It also takes the middle dot and the hyphenation point as name joiners. Two reviews. **After it: `LANES.md` Queues item 26 (MOD-23), two name forms still sent in clear, also before any real PHI; not assigned.** |
| 4 | #134, SUITE-CAP-3: **merged as 994ee303** (2026-11-10) | `lane-b-suite-cap-3-status.md` | B (acting) | Done. No `ledger_line_net` change. |
| 5 | #129, email plate: **merged as ca504674** (2026-11-11) | `lane-a-email-lockup-plate-status.md` | B (acting) | Done. |
| 6 | **password-changed-notice** (schema PR 1; ADR 0091, SGN-16): **draft #140** | Head abdc2192; `approval-summaries/lane-a-auth-emails-status.md` (the merge step's RESUME-BLOCK, once W6 writes it) | A, W6 then **W9** | W6 posts the suggested line, then stands down. Four reset cases, (a) to (d), it cannot close are recorded as open residuals; Queues item 28 closes them, (d) by a fix W9 adds to item 28 (ruling, 09:20 UTC). W6 stood down without posting the line; W9 posts it. **Founder's line next,** with that trade-off in the description; W9 merges after it. |
| 7 | **Queues item 28 first** (a step begun before a password reset is refused, and a reset whose answer is lost is not reported as refused; ADR 0093, SGN-17, SGN-18; required before launch): **built and reviewed by W9** (WIP `co-001/wip-step-before-reset` 47c99ac7), it opens when #140 merges. Then the schema batching plan's PRs 2 to 10 | `approval-summaries/lane-a-step-before-reset-status.md`; `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` | A, **W9** | One schema PR open at a time; the next one is always in build while the current one waits for the founder. |
| 8 | Packets verifier identifier fold (MOD-19, MOD-20): **draft #141** | Head 995380b7; `lane-b-packets-verifier-identifier-fold-status.md` | B (acting), **W7** | Four reviews in, the full local suite passed; W7 merges on green CI. It moves `redact.ts` whole to `packages/redact` (`@tp/redact`); item 3 merges second and takes the base merge (git follows the rename; new files beside it move by hand). |
| 9 | The queue: `LANES.md` Queues item 25, seven follow-ups from #137's reviews (first the web's transaction scope, which does not read COMMIT's answer); then Queues item 29 (an operator can remove a member's keys); then Queues item 31 (four follow-ups from item 28's design reviews); then Queues item 27, four items #126's reviews left owed; then the Stryker static-mutant timeouts; the Dependabot replacement PR; P2 Trivy version; dark-mode-ship; the UX queue | `LANES.md` Queues; Lane B's handoff §2 | B | **Not assigned:** three builds run (W5, W6, W7). The next free build takes Queues item 25 (a). #136 and #137 (ADR 0092, CAS-56, CAS-57) are merged. |

## Founder items (bring each with the exact link or text)
- **Granted 2026-11-07 19:26 UTC** (relayed as "Tyler approves"): the schema batching plan's PR 5 ledger freeze ask. Q1 to Q3 yes, exactly Appendices A and D, for schema PR 5 only (`approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`).
- **Next: password-changed-notice's approval line,** when W6 posts it (the orchestrator brings the link). #126's line was committed on 2026-11-11 at 05:06 UTC and #126 merged. Optional: D19's exact alternative on the interest fix (one entry per PLB L6, line and chain) needs a new ledger freeze exception; if the founder wants it, the schema session drafts the ask.
- Staging:
  - F0, before release N reaches production;
  - F1 to F5 and ruling 16, before Cognito PR 2;
  - #125's smoke checks;
  - Gmail iOS and Outlook.com dark renders.
- Launch: #42's actions 2 to 7, counsel's reading of the legal text, O9 (#41), runbook 3i, PRD section 19's RDS cost line. **Also before launch: `LANES.md` Queues item 28** (a sign-in step begun before a password reset is refused), and before any real PHI: item 3 and Queues item 26. Item 28's rule holds for an account only once the Cognito client is confidential (ADR 0088's second release, Cognito PR 2, which waits on F1 to F5 and ruling 16).

## Never
- Sign or approve as the founder, or write the approval line or `approvers.json`.
- Approve or request changes on a PR; merge a schema PR before the founder's line.
- Open a PR into main, or create a release tag.
- Use `--no-verify`, force a push, or touch `.gitleaksignore`: a gitleaks refusal is fixed by rewriting the flagged text.
- Write files through the GitHub connector.
- Put PHI or a model identifier in any repository artifact.

Keep the repository public: a private repository fails the screening-capacity gate on GitHub's free runners.
