# Lane B's handoff to Lane A (2026-10-26 ~23:35 UTC)

From 2026-10-26 evening the co-founder runs the build from Lane A's Claude account. That account is different from Lane
B's but works on the same GitHub repository, so everything is here, on `claude/build-ops`, and on GitHub. Lane B's
account has stopped: it is at ~97% of its weekly allowance (resets Friday 2026-10-30 19:00 UTC), with no PR open, no
session running and no scheduled task left.

Read in this order: `CLAUDE.md` (on `claude/build-platform`), `LANES.md`, `HANDOFF.md` "Start here" (Lane A's own
state, last written 2026-10-25 10:00 UTC, so 14 Lane B merges behind), then `lanes/lane-b.md` "Start here" (Lane B's
final state), then this file.

## 1. What changed on `claude/build-platform` since HANDOFF.md's Start here
14 Lane B PRs merged, each as a merge commit after its fresh-clone verification, with every required check green.
The tip is e908c21, and its push runs are green (ci, mutation, screening-capacity, content-calendar, release-dry-run).

| PR | What | Merge commit |
| --- | --- | --- |
| #43 | ci-speed: CI in parallel jobs behind one `all green` gate | 9c57d2d |
| #44 | ci-mutation: every money package mutation-tested, gated above 85% | de8f9b5 |
| #45 | PR 15, ledger tests LED-12 and LED-13 | 6ddd587 |
| #47 | #135, the bank account shown first (ADR 0073) | c5195ee |
| #46 | #111, readable database-function diffs: `packages/db/functions/*.sql` (ADR 0068) | 4d99df8 |
| #54 | materiality settings showed stored cents as dollars (a money bug) | 7ef421b |
| #53 | #84, the model evaluation gate (ADR 0070 Parts 1 and 2) | 88a0e4e |
| #55 | the UX and brand reviewer checklist, `.claude/agents/ux-brand-reviewer.md` | 6070e41 |
| #50 | #10, a superseded re-run cannot be accepted | 9d3ab33 |
| #52 | #38, every figure explained in words (ADR 0072) | 3486f75 |
| #56 | UX PR 2, a suspended organization never reads "In good standing" | 0e28f9b |
| #51 | PR 15b (#12), ledger amounts in payment terms (ADR 0067) | c355633 |
| #49 | the release content checks (#7, #30, #31, #59; ADR 0071) | d725977 |
| #48 | ci-deps: every action and image pinned, Dependabot's groups, cooldowns and trust rules (ADR 0066) | e908c21 |

Test counts on #48's head 7b6b10b: unit 6,265 and 1 skipped; db 9,222 and 1 skipped; e2e 54.

## 2. Due now, in this order
1. **The founder's three repository settings** (owner-admin; a person clicks them): F1 (a) the default branch to
   `claude/build-platform`, F2 (a) Dependabot alerts and security updates, then F3 actions pinned to a full SHA.
   Steps and read-only checks: `designs/lane-b-settings-after-ci-deps.md`. After F1, #49's weekly release-capacity
   workflow fails on its first run until SUITE-CAP-1 is fixed (below); that is expected.
2. **Fold Lane B's state into HANDOFF.md's Start here** and the build tracker (Lane A's job, LANES.md rule 10).
3. **#42 (PR 6b-4, mail streams; Lane A's schema PR, draft at 13f59b1):** its fix round, now 14 merges behind.
   - Merge the base with a merge commit. Then regenerate, never hand-merge: `pnpm install` (the lockfile),
     `tools/screening-capacity/watched.ts --write` (`watched-paths.txt`), and `pnpm db:domain-model --out`. That also
     writes `packages/db/functions/*.sql` (#46; about 45 files at 13f59b1). Commit them before the founder signs.
   - The shared documents (test-matrix, reconciliation-001, the synth registry and matrix) keep both lanes' rows (rule 6).
   - #53 changed one line of `infra/test/compute.test.ts`; it merges cleanly.
   - Fold in, from LANES.md "Handed to Lane A": the screening journey's e2e timing flake, and the capacity harness race
     in `tools/screening-capacity/run.ts` (wait for the run's commit before opening a result link).
   - It merges only with the founder's APPROVED GitHub review of its latest commit (the domain model gate, ADR 0063).
     The co-founder cannot give that approval. Never write the approval line or `approvers.json` yourself.
4. **The defects handed to Lane A on 2026-10-26, most severe first** (LANES.md "Handed to Lane A" has each in full).
   Each is a migration, so each goes into Lane A's serial schema chain after #42:
   - **SS-01, blocking:** a suspended firm's granted practices still run. #56 fixed only the words.
   - **Interest credited twice** when a remittance carries both AMT I and PLB L6 (from 15b). It changes the ledger's
     existing behaviour, so it needs a freeze exception from the founder.
   - **SUITE-CAP-1:** at real size (a 100,000-line month), triage fails with "out of shared memory". The cause is one
     advisory lock per line in one transaction (`line_status_rules()`).
   - Then the rest of today's entries:
     - #32's stored notice and email;
     - #54's two `settings.ts` steps;
     - #38's four proposals;
     - 15b's other ledger items and its stored case close;
     - #84 and #120's F3 and F4;
     - #59's coverage function;
     - the UX review's 19 items (`designs/lane-b-ux-review.md` §5).
5. **Lane A's queue** in LANES.md "Queues": 6c, 6d and onward.

## 3. Lane B's work that remains (no migration), for any session that takes it
Each has its design and status file. Run it as a Lane B item: claim it in LANES.md and log it in `lanes/lane-b.md`.
- **Ready to finish:**
  - `co-001/ux-forms` at 17bbb70: forms keep what the person typed, a blocking UX defect on ~112 forms. Everything it
    waited on (#50, #51, #52) has merged.
  - `co-001/contract-phi-check` at d7447ad: #120, the builders' work done.
  - `co-001/ci-browser` at 8b38f48: phase 1 built; phase 2 can start now that #48 has merged.
- **Designed, not built:**
  - #32 (`designs/lane-b-unmapped-plan.md`);
  - #48's narrative draft (`designs/lane-b-narrative-draft.md`);
  - the CI follow-ups P1, P2 and P4 (`designs/lane-b-ci/follow-up-p*.md`).
- **Queued:** #46, the Verified seal, and #135's micro-deposit proposal.
- **The UX review's queue:** 89 more PRs in landing order, from PR 3 (`designs/lane-b-ux-review.md` §3;
  `designs/lane-b-ux-review/synthesis/prs.json`).

## 4. Who decides
- **The founder's, always:**
  - approving `docs/product/domain-model.md`, so every schema PR's merge;
  - release tags;
  - the owner-admin settings;
  - legal text;
  - freeze exceptions;
  - reversing a founder ruling.
  Take these to the co-founder, who relays them.
- **The co-founder's** (the founder's delegation of 2026-10-25, LANES.md): every decision on Lane B's work. Their
  standing rulings: take the recommended option without asking (security: the safer), apply wording and visible
  changes without asking, and improve as you go. Each is recorded in `lanes/lane-b.md` "Rulings".
- **Open questions for the founder** (`lanes/lane-b.md` "Waiting on someone"):
  - the UX review's F1 to F5: dark mode, the terms text, the palette, and two screening legal texts;
  - the evaluation gate's floors;
  - the data-rights addendum;
  - #111's guard on `packages/db/functions`;
  - rulesets 4B and 4C.

## 5. What cost Lane B time, so it does not cost Lane A's
`lanes/lane-b.md` "How Lane B runs" has each one in full.
- **The account's 5-hour limit** stopped every session twice on 2026-10-26, with eight sessions in parallel. Give every
  workflow agent a progress file it continues from (the SAVE rule). Resume with `resumeFromRunId`. Keep a scheduled
  check just after each reset.
- **Interrupting the main session** stops its background workflow agents. A monitor that alarms after 10 quiet minutes
  catches it.
- **After a container restart,** PostgreSQL 18 on 5433 keeps a stale pid. Re-run `tools/setup-container.sh`.
- **gitleaks** reads bare screenshot ids such as `support-access.1280` as keys, so write them in backticks. Never add a
  `.gitleaksignore` entry.
- **Merging:** marking a PR ready re-runs `approval-of-record`, so wait for it before `merge_pull_request` with
  `expectedHeadSha`.
- **Times:** take every time you record from `date -u`.
- **Shared counters,** allocated by one session only: ADR 0078, synth module 17, fixture release 900008.
