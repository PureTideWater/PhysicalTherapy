# The schema chain after PR 2: #143's merge step, then schema PR 4 (the first skip)

Lane A, W15 (https://claude.ai/code/session_019i9if9aX9NMhnMVmJCk4BM), from 2026-11-11 18:12 UTC. It took the chain
from W11. Plan: `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md`.

## RESUME-BLOCK (W16, https://claude.ai/code/session_019i9ifEMVhfmHMsi6UzykXB, 2026-11-11 19:30 UTC; schema PR 4 only; #143's merge step stays W15's, block below)
- **State: steps 1 and 2 are done; PR 4 waits only for #143 to merge.** WIP ref `co-001/wip-payer-response-db-rules`
  = **f8732bda** (on #143's head a3a32024). Worktree `/home/user/pr4`, branch `co-001/payer-response-db-rules`
  (a successor makes it with W15's command in the block below, from the WIP ref).
- **Reviews, both done, no migration or function change after 217e96ce, so no delta review:** tenant isolation
  (`lane-a-wip/schema-pr4/review-tenant-isolation.md`), database (`lane-a-wip/schema-pr4/review-database.md`, run by
  W16: no must-fix; F1 a handler-then-trigger deadlock, the web's to fix, P4; F2 the handlers' lock key on a
  non-lowercase id, the web's, new P5; both in ADR 0085's amendment).
- **Records done (654e5169, f8732bda):** the runbook's section before "## Rollback"; CAS-58 in test-matrix.md, matrix.ts,
  registry.ts and fixtures (`pnpm synth --all`); CAS-45 and CAS-48 name the database tests; ADR 0085's amendment (the
  search path taken, the duplicate residual not closed and why, the crossing); ADR 0093 accepted.
- **Passed on f8732bda's tree (654e5169 for all but lint:copy):** typecheck, lint, lint:logs, lint:copy,
  check:fixtures, synth's unit tests, the three database files (57) on PostgreSQL 18.
- **Next, only when the orchestrator says #143 is in:** (5) in `/home/user/pr4`: fetch and merge
  `origin/claude/build-platform`; a fresh database on 5433, `pnpm db:migrate`, `pnpm -s db:domain-model --out --strict`
  (the approval line stays blank), `--check`; the fast checks; the one full local suite
  (`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`; output to files); (6) push
  `co-001/payer-response-db-rules`; the draft PR into claude/build-platform: the description is the whole output of
  `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`, then
  `lane-a-wip/schema-pr4/pr-description-body.md` with its three `@@` places filled (the checks table, the two hashes;
  the review rows are in); (7) on CI green but for the blank line: the suggested approval line by the skill's `gh api`
  route, its link to the orchestrator with the founder's reading (the body's "What the founder should know", point 1
  first); subscribe; merge after the founder's "Commit suggestion" and green required checks.
- Kit to change the migration, if ever needed: W15's paragraph below ("To change the migration").
- A slip, 19:35 UTC: this block's first writing went through an unquoted shell here-document, which ran its backticked
  text in `/home/user/ops`. What ran: two fetches, pnpm refusing for want of a manifest, and a bare push the pre-push
  hook refused. Nothing merged, no branch was pushed, no database was touched; the block was rewritten.

## W15's database review run, recorded and not acted on (W15, after W16's block was written)
W15's reviewer finished its report on a539fa14 but was ended by the account's usage limit at its hand-back, so nothing
of it reached W15 until the file was found on W15's machine. It is now `lane-a-wip/schema-pr4/review-database-w15-run.md`
(257 lines; no blocking finding; three should-fix). W15 checked none of it and changed nothing for it: it is W16's to
weigh against its own review. S1 (the preflight's read while ACCESS EXCLUSIVE on `source_document` is held, with the
reviewer's timing) and S2 (a deadlock between two version writes ends as 40P01, where the design says "busy") are the
two to read first; S3 (`source_document_rules()` and a temporary table) was written before 217e96ce gave the function
its search path.

## W15's block (superseded for B by W16's above; A still stands) (W15, 2026-11-11 21:45 UTC; W15's context is at its limit, a successor takes B from here)
- **A. #143** (schema PR 2): W15 is subscribed. Head a3a32024, waiting for the founder's "Commit suggestion" on
  discussion_r4541570803. The merge step is W11's block in `approval-summaries/lane-a-schema-pr2-status.md`, unchanged.
- **B. The next schema PR is the plan's PR 4** (#85's database rules, design 7.2 items 1 to 5). PR 3 is skipped (slice
  4's export render is not built) and keeps its place. Founder gate: the CO-02 line and his approval of the latest
  commit; no ruling needed. The orchestrator was told at 18:40 UTC.
  - Design: `designs/lane-a-schema-pr4-payer-response-db-rules.md` (its proposal P2 is now TAKEN; its "one message
    for every refusal" means every refusal the trigger makes: see the tenant review's F1 and F3).
  - **Build: WIP ref `co-001/wip-payer-response-db-rules` at 217e96ce**, cut from #143's head a3a32024. A successor
    makes its worktree with `git fetch origin co-001/wip-payer-response-db-rules && git worktree add -b
    co-001/payer-response-db-rules /home/user/pr4 FETCH_HEAD && (cd /home/user/pr4 && pnpm install --frozen-lockfile)`.
    In it: migration `20261114090000_payer_response_document_rules.sql`, the Drizzle column and two indexes, the row
    factory's response letter, the regenerated `domain-model.md` and function files, ADR 0085's amendment, ADR 0093
    "accepted", and three database test files written failing first (`packages/db/src/document-use-rules.db.test.ts`
    28, `payer-response-db-mirrors.db.test.ts` 27, `payer-response-document-rules-migration.db.test.ts` 2): **57 pass
    on PostgreSQL 18**; typecheck, lint, lint:logs, lint:copy, check:fixtures and `db:domain-model --check --strict`
    passed (lint and typecheck before the last two commits; eslint on the changed files after).
  - **To change the migration:** edit `lane-a-wip/schema-pr4/template.sql` or `build.py` (it derives the five bodies
    from the functions at a3a32024, each replacement asserted to match once), run `python3 build.py` beside them, then
    the marker route's ONE command in the worktree (this session's permission check allowed it twice):
    `( trap 'rm -f .claude/.allow-protected-edit' EXIT; touch .claude/.allow-protected-edit && cp <built file>
    packages/db/migrations/20261114090000_payer_response_document_rules.sql )`; then a fresh database, `pnpm db:migrate`,
    `pnpm -s db:domain-model --out --strict`, `--check --strict`, the three test files. If the check refuses the command,
    stop and tell the orchestrator.
  - **Reviews:** tenant isolation and authorization: DONE, `lane-a-wip/schema-pr4/review-tenant-isolation.md` (F1 taken
    and fixed; F2 not taken, a recorded residual for the PR description; F3 a note). **Database review: still running
    in W15's session when this was written** (report to `lane-a-wip/schema-pr4/review-database.md`; if that file is
    missing, run the review again from the brief in section 6 of the design: locks, snapshots, volatility, the
    preflight, the previous image). Its findings are checked and fixed before anything else.
  - **Owed before it opens, in order:** (1) the database review's findings; (2) a section in
    `docs/runbooks/deploy-and-rollback.md` before "## Rollback": the lock loop (ACCESS EXCLUSIVE on `source_document`
    is refused by any open transaction that has read it, so no long job at the deploy, as the two sections above it
    say for theirs) and what to do when the preflight refuses; (3) **CAS-58** (given by the orchestrator at 18:17 UTC)
    for item 5 in `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts` (a `none(...)`
    entry naming `packages/db/src/payer-response-db-mirrors.db.test.ts`, as CAS-48's at registry.ts:352), then `pnpm
    synth` and its diff; CAS-45's and CAS-48's registry entries gain the new database test files, and each listed test
    file names its row in its header comment; (4) the fast checks; (5) when #143 has merged: merge
    `origin/claude/build-platform`, regenerate on a fresh database (the approval line stays blank), the one full local
    suite (`DATABASE_URL` on 5433; output to files); (6) push `co-001/payer-response-db-rules`, open the draft PR with
    the template and `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`,
    naming in it: the skip of PR 3, the hazards list's hits (a volatility and language change on
    `contract_version_documents_ok`, a new `SET search_path` on `source_document_rules`, one new column grant to
    tp_app, a SECURITY DEFINER function replaced with its scope handling unchanged), the preflight, the residual F2,
    and the founder's reading; (7) when CI is green but for the blank line, post the suggested approval line
    (.claude/skills/new-migration's `gh api` route) and send the orchestrator the link.
  - Tests need PostgreSQL 18: `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`.
  - It may not open as a PR before #143 merges.
- **Placed:** ADR 0093's Status line rides PR 4. Queues item 32 (the queue outbox table): its own schema PR, the
  plan's new section 11, after PR 5 unless PR 5 is not ready.
- **Owed after #143's merge (from W11's block):** step 7b's no-migration measurement PR; the `ledger_line_net`
  candidate for PR 5's ask; the `service_line.practice_id` trigger proposal. None is started.
- **Machine:** PostgreSQL 16 on 5432 and 18 on 5433, sockets in /tmp (not /var/run/postgresql).
