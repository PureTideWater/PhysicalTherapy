# The schema chain after PR 2: #143's merge step, then schema PR 4 (the first skip)

## FINAL STATE: MERGED (W40, https://claude.ai/code/session_019i9ifAz4H3EULGVa7AanUj, 2026-11-12 14:58 UTC; schema PR 4, #156)
- **#156 merged as 1f652b6f** into `claude/build-platform` (parents f7b777d3 and 46d84f71), method merge, expected head
  46d84f71. Before it: the founder's commit of the approval line, 9c6cd37a (2026-11-12 13:50 UTC), verified on the branch;
  the base f7b777d3 (#158, #159) merged on top of it as 46d84f71, one push through the hook.
- **The founder's line is byte for byte his:** `docs/product/domain-model.md` is the same file at 9c6cd37a, 46d84f71 and
  1f652b6f; `pnpm db:domain-model --check --require-approval` passed on a freshly migrated PostgreSQL 18 database (52
  migrations); document SHA-256 `922ff5e3f7e81884d1aaaa1937a46fe1b2ff645c889dd60dc62e8e1e086b061b`.
- **Required checks on 46d84f71:** all green, mutation, screening-capacity gate and approval-of-record green; marked
  ready 14:54 UTC, approval-of-record's re-run green 14:54 UTC, merged 14:58 UTC. No check was re-run.
- **The description** was corrected where the founder's commit made it untrue (the summary regenerated on 46d84f71, the
  approval line no longer "blank" or "awaiting", one row added to Checks); the copy is
  `lane-a-wip/schema-pr4/pr-description.md` (its closing attribution lines differ from the live description's).
- **The push runs the merge started on 1f652b6f** (ci 43242793078, mutation 43242795543, screening-capacity
  43242792769) were running or queued when this was written; nobody is subscribed to them.
- **Owed after it** (from the RESUME-BLOCK below and the PR): nothing by this chain's sessions; W16 and W40 stand down.
  The web half is Lane B's: write `filed_for_submission_id` (the upload route, the contract lists, the response
  form's list), close the handler-lock crossing and cast the document id before hashing (ADR 0085's amendment), and
  decide what the form does when its upload duplicates an unlinked copy. Schema PR 3 (slice 4's export render) keeps
  its place and is not built.

Lane A, W15 (https://claude.ai/code/session_019i9if9aX9NMhnMVmJCk4BM), from 2026-11-11 18:12 UTC. It took the chain
from W11. Plan: `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md`.

## RESUME-BLOCK (W16, https://claude.ai/code/session_019i9ifEMVhfmHMsi6UzykXB, 2026-11-12 05:45 UTC; schema PR 4 only)
- **Draft #156 is open** (https://github.com/PureTideWater/PhysicalTherapy/pull/156), head **ac8500fc** (first 155bcbe6) on
  `co-001/payer-response-db-rules`, the base 93e137f9 (#143, #151) merged, the domain model regenerated: before
  `47fae5d1…` (approved with #143), after `922ff5e3f7e81884d1aaaa1937a46fe1b2ff645c889dd60dc62e8e1e086b061b`, the
  approval line blank. W16 is subscribed. Its description is `lane-a-wip/schema-pr4/pr-description.md`.
- **The one full local suite ran on 155bcbe6:** fast checks, verify-content, synth, test:db (10,346), golden (381),
  e2e (87) passed; `pnpm test` 14,230 passed and 1 failed, `packages/contracts/src/evidence/pages.test.ts`'s
  heap-exhaustion case (SIGABRT): passed alone on rerun, fails the same way on the base's checkout here, untouched by
  this PR. If CI fails on it, it is the base's and is reported, not skipped.
- **Reviews: all done, nothing owed** (tenant isolation; database twice; the fixes' delta). See the files beside the kit.
- **2026-11-12 05:55 UTC: the suggested approval line is posted** (discussion_r4546820790, on line 7564 at 155bcbe6;
  Tyler Williams, 2026-11-12, the hash above) and its link sent to the orchestrator with the founder's reading. CI at
  that time: green but for the blank line (the domain model job and so all green); two mutation shards and capacity
  still running. **What is left: wait for the founder's commit, then the merge step at the end of the next bullet.**
- **2026-11-12 07:55 UTC: brought up to date, head ac8500fc** (the base adaf7897, #157, merged; no generator changed
  a file; the document's hash is unchanged, so the posted suggestion stands and GitHub shows it on the new head, not
  outdated). Fast checks passed. CI is running on ac8500fc; one line to the orchestrator when it is green but for
  the line.
- **Next:** (7) when CI is green but for the blank approval line (`domain model` / approval jobs): post the suggested
  line by the skill's `gh api` route as ONE pull-request comment on the last line of `docs/product/domain-model.md`
  at the head (the founder's name as on the base's line, the date, the hash above); send its link to the orchestrator
  (session_019i9ifCaMokBYHaARonYamS) with the founder's reading (the description's "What the founder should know",
  point 1 first); end the turn. After the founder's "Commit suggestion" and green required checks on that commit,
  with the base an ancestor of the head (rule 2a): merge, one line to the orchestrator, record, unsubscribe, stand down.
  A red job: read only its failing step.
- Kit to change the migration, if ever needed again: `lane-a-wip/schema-pr4/template.sql` and `build.py`; the
  marker-route command was allowed by the co-founder in W16's session on 2026-11-12.

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
