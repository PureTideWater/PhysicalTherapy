# Schema PR 2: the ledger lookups (SUITE-CAP-3's two ledger-function bodies, under the founder's grant of 2026-11-06)

Lane A, W11 (https://claude.ai/code/session_019i9ifBgvfeZAe47vuU7EUC), from 2026-11-11 11:22 UTC. Plan:
`approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` section 2. Grant: `approval-summaries/founder-asks-2026-10-27.md`,
"Decided 2026-11-06"; the granted text: `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md` at 38123394.

## FINAL STATE (W27, https://claude.ai/code/session_019i9ifBp9zpTBLKudEaqjLq; 2026-11-12 04:52 UTC): #143 is MERGED; no one holds this item
- **Merged as 93e137f91f97a9dd4590435288e9e6ed13b529f4** on `claude/build-platform` (parents 891bf993 and
  2f266302; verified with git ls-remote, 04:51 UTC). The orchestrator and W16 are told; W27 is unsubscribed and has
  stood down; W15 was told to stand down at 02:18 UTC.
- **The head that merged, 2f266302:** a26f1b60 (the base fd14d89f merged into a3a32024, with the proof run again) +
  the founder's own commit **cee1702c** (GitHub's web commit, 2026-11-12 03:55 UTC; one line of
  `docs/product/domain-model.md`, the approval line as suggested, hash 47fae5d1; verified by W27 and the
  orchestrator) + a merge of the base 891bf993 (#151, dependencies only) made on top of his commit by the
  orchestrator's ruling of 2026-11-12 04:20 UTC (schema files and approvers.json byte-identical to cee1702c).
- **Checks on 2f266302:** every CI check green, the required four included (`all green`, `mutation`,
  `screening-capacity gate`, `approval-of-record`; the last ran green again after ready-for-review). Local: the fast
  checks, `db:domain-model --check --strict --require-approval` on a fresh database, both `ledger-lookups.db.test.ts`
  files (14 tests).
- **The proof on the merged tree (a26f1b60, seeds from fd14d89f without the migration;
  `lane-a-wip/schema-pr2/run-of-record-3-compare.txt`):** spread R 2,000 lines 41.8 s to 18.9 s, IDENTICAL row for
  row (20,635 rows); F 10,000 lines 183.2 s to 75.5 s, IDENTICAL (102,907 rows); body hashes abbcba68/f151e27e
  before, 834cdefc/5d0a94c0 after. Not re-run for #151 (no named path changed). `pnpm test:db` on a26f1b60: 4 shards
  green (10,287 passed, 1 skipped).
- **Not done by W27:** the PR's description was left as W11 wrote it (its Checks table speaks of a3a32024; this
  block is the record of the later heads). `lanes/STATE.md` is the orchestrator's to update.
- **Owed after the merge:** W11's list in the block below (step 7b back to A's month; the PR 5 freeze-ask candidate;
  the `service_line.practice_id` guard; ADR 0093's status line; Queues item 32).
- **For the kit's next user:** it needs `seedF.mts` from `lane-b-suite-cap-3-wip/probe-rev/` beside the files the
  W15 block names; the shared 5433 cluster may be down at session start
  (`runuser -u postgres -- /opt/pg18/bin/pg_ctl -D /root/pgdata18 -l /tmp/pg18.log -w start`); the full database
  suite takes about 35 minutes locally, longer than one background command's limit, so run its shards separately.

## RESUME-BLOCK for the base merge (W15, 2026-11-12 01:50 UTC; W15 pushed NOTHING to #143 and hands this step on)
**The orchestrator's ruling (2026-11-12 01:25 UTC, session_019i9ifCaMokBYHaARonYamS): merge the base into #143 NOW,
before the founder's commit, by W11's step 3 below exactly, so his commit can be the last one.** W15's context could
not carry the proof (past 280k tokens), so a fresh session does the whole step. What W15 established first:
- **#143 is unchanged:** head a3a32024, the suggested line (discussion_r4541570803) not yet committed. W15 is still
  subscribed and holds nothing else; whoever takes this subscribes too (W15 unsubscribes when told).
- **The base is fd14d89f** (#145 to #150 since 91bc6b7c). `git merge-tree` of a3a32024 with it: no conflict. W15
  made the merge on its own machine only (fbd53d36, not pushed; make it again).
- **The posted line stays right if the merge is all that changes:** between 91bc6b7c and fd14d89f nothing changed
  under `packages/db/migrations`, `packages/db/functions` or `docs/product/domain-model.md`, so the document's hash
  47fae5d1... holds. Check it again after the merge (`pnpm -s db:domain-model --check --strict` on a fresh database:
  the document must not change), and after the push confirm on GitHub that the suggestion is not marked outdated. Do
  not touch the approval line or the suggestion.
- **Why the proof is required again:** the base changed `packages/db/src/authz/scope.ts` (+67), `authz/index.ts` and
  `scope.test.ts`; nothing under `apps/worker/src/reconcile` or `packages/ledger`. It also rewrote the migration
  runner (`packages/db/src/migrate.ts`, +211: #145 bounds every lock wait and retries), so both
  `ledger-lookups.db.test.ts` files (packages/db/src and apps/worker/src/reconcile) matter: they apply this
  migration through that runner.
- **The kit's real place** is `approval-summaries/lane-a-wip/schema-pr2/probe/` on claude/build-ops (W11's block
  says `lane-a-wip/...`): `queue3.sh`, `run.sh`, `cluster.sh`, `compare.py`, `dump.py`. It is not self-contained:
  `queue3.sh` calls `$P/seed.mts`, which with `common.mts` and `pass.mts` is in
  `approval-summaries/lane-b-suite-cap-3-wip/probe/` (its README.md says how). It needs a private PostgreSQL 18
  cluster on port 5494 with its data directory outside /tmp/claude-0 (`cluster.sh up <dir>`), the env `S`, `OUT`,
  `TP_REPO` (the merged tree), `SEED_REPO` (a worktree of the base fd14d89f, without the migration, with its own
  install) and `DRAFT` (the migration file's text), then the steps `base`, `seedR 2000`, `seedF 10000`, `run` for
  each seed in states `none` and `pr2`, and `cmp`: the dumps must be IDENTICAL row for row (20,635 and 102,907 rows on
  the previous bases), with the body hashes recorded per run.
- **Then:** the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth and its diff), both test
  files on PostgreSQL 18 (`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`), push through the hook from
  the hooked checkout, CI by subscription, one line to the orchestrator at green or at the first failure. If the base
  moves again before the founder's commit, do not chase it: tell the orchestrator.

## RESUME-BLOCK (final from W11, 2026-11-11 18:20 UTC; W11 has stood down and holds nothing)
**For the successor: the only work left on this item is the merge, then three records.**
- **Draft PR #143** (https://github.com/PureTideWater/PhysicalTherapy/pull/143), branch `co-001/ledger-function-bodies`,
  head **a3a32024b2a5030c87920a3e5ad9901f95632163**, base `claude/build-platform` at **91bc6b7c** (an ancestor of the
  head). No one is subscribed: subscribe first (`subscribe_pr_activity`, 143).
- **Waiting for the founder's "Commit suggestion"** on https://github.com/PureTideWater/PhysicalTherapy/pull/143#discussion_r4541570803
  (line 7551 of `docs/product/domain-model.md`; the orchestrator was sent the link and the founder's reading at 18:15
  UTC). The line it commits must read exactly:
  `Approved by: Tyler Williams  Date: 2026-11-11  Document SHA-256: \`47fae5d1e01a8417244275f6c56cb603a367c90595882e89a615485964c7d10e\``
- **CI on a3a32024:** every check green but `domain model` and `all green`, both on the blank approval line alone
  (checked in the jobs' logs). Both new test files green on CI's PostgreSQL 18.6.
- **The merge step, after the founder's commit (never before; never write the line or approvers.json; never approve):**
  1. `git fetch`; the PR's head is now the founder's commit on top of a3a32024. Check that commit touches ONLY the last
     line of `docs/product/domain-model.md` (`git diff a3a32024 <new head> --stat`: one file, one line) and that the
     line is the one above, hash 47fae5d1….
  2. CI on that new head: `domain model`, `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`
     green (the founder's APPROVED review of the latest commit is the approval of record, ADR 0063; if
     `approval-of-record` waits for his review, that is his to give: tell the orchestrator, do nothing else).
  3. Rule 2a: `origin/claude/build-platform` must be an ancestor of the head. If the base moved past 91bc6b7c, a base
     merge is a NEW COMMIT and dismisses the founder's approval: do not do it silently. Tell the orchestrator first;
     if it must be done: merge the base, fast checks, `db:domain-model --check --strict --require-approval` on a fresh
     database, both `ledger-lookups.db.test.ts` files, push, CI, and the founder approves again. If the new base
     touches `apps/worker/src/reconcile`, `packages/ledger`, `packages/db/src/authz` or adds a migration, re-run the
     proof at R 2,000 and F 10,000 first (kit: `lane-a-wip/schema-pr2/probe/`, `queue3.sh`; about 12 minutes).
     A migration that sorts before 20261113090000 and changes either body makes this one refuse: stop, tell the orchestrator.
  4. Mark the PR ready and merge it (a merge commit, as the lane merges), record the merge commit here and in
     `lanes/STATE.md` (the orchestrator's), unsubscribe, tell the orchestrator in one line.
- **Owed after the merge (none of it is in #143):**
  1. **Step 7b back to practice A's month** (D14's acceptance): a no-migration PR measured on the merged tree with the
     weekly run's own harness; CAS-51's and CAS-42.3's budgets, the Known gap line, ADR 0083's dated note. It must
     measure the ledger as A's pass finds it: if it holds about 160 to 80,000 never-analyzed entries when the pass
     plans, `ledger_line_net` is the slow one (ADR 0087's note of 2026-11-11). A's month here: 333.2 s and 317.1 s
     against the 360 s sizing bound, so the margin is small.
  2. **Candidate for schema PR 5's ledger freeze ask:** a `ledger_line_net` body that reads the line's entries in every
     planner state (today's granted body does on an empty or tiny never-analyzed ledger and with statistics, not on
     160 to 80,000 never-analyzed entries: `probe/plan-probe-1.txt`, `-2.txt`), beside `ledger_entry_within_evidence`
     (95 s of A's 333 s). The cause: the tenant policy's `practice_id = ANY(scope)` and the body's `practice_id =
     (line's practice)` are both counted as selective, so `ledger_entry_by_date` looks as good as `ledger_entry_by_line`.
  3. **Proposal, its own schema item:** a trigger refusing a change of `service_line.practice_id` (today only the
     application role's missing UPDATE privilege prevents it; the owner role could).
  4. **ADR 0093's status line** ("proposed" to "accepted") rides the next schema PR (PR 3), not this one.
  5. **Queues item 32** (the queue outbox table from #144) is unplaced in the schema plan: the next schema session
     says where it fits.
- **Local state W11 leaves:** nothing running; the private cluster and the seed worktree are removed; scratch
  databases dropped. After a restart the setup script puts the checkout on `claude/build-platform`: check
  `git status -sb` before any git command.

## The run of record (the tree the PR merges onto: base 3bff4fd6; `run-of-record-compare.txt`, `run-of-record-queue.log`)
Seeds migrated from the base without the migration; before = those bodies (hashes abbcba68…/f151e27e… recorded per
run), after = the placed migration applied as tp_owner in one transaction (834cdefc…/5d0a94c0… recorded per run).
| seed | pass before | pass after | `ledger_line_net` | `ledger_entry_rules` | dumps |
| --- | ---: | ---: | ---: | ---: | --- |
| spread R, 2,000 lines | 54.7 s | 18.8 s | 36.8 s to 3.1 s | 2.1 s to 1.3 s | IDENTICAL row for row, in order, `seq` included (20,635 rows) |
| F, 10,000 lines | 226.8 s | 76.0 s | 94.8 s to 2.2 s | 54.4 s to 3.9 s | IDENTICAL (102,907 rows) |
| A's month, 30,795 lines | 1,745.5 s | 333.2 s | 858.9 s to 7.4 s | 565.3 s to 15.5 s | IDENTICAL (316,770 rows); 30,795 approved, posted and recovered; 494,780,000 cents posted, in both |

Not a quiet container throughout: the delta reviews (psql only) and this session's pushes ran beside A's "after"
pass. The first run (below) is the quieter one for A's "after" (317.1 s).

## The proof on the final tree (head a3a32024, base 91bc6b7c; `run-of-record-2-compare.txt`)
#144 changed no migration, ledger or reconcile file but did change `packages/db/src/authz` (the transaction scope),
so the grant's two proof sizes were run again on the merged tree, seeds from 91bc6b7c without the migration:
spread R 2,000 lines 56.9 s to 20.7 s, IDENTICAL (20,635 rows); F 10,000 lines 260.8 s to 85.4 s, IDENTICAL (102,907
rows); body hashes recorded per run. A's month stands as measured on the previous base (below).

## Reviews, round 2 (delta; `review-database-delta.md`, `review-money-delta.md`): nothing blocking
Every finding checked, then applied as wording (ADR 0087, reconciliation-001, the test's comments, the description):
the match lookups are a sequential scan on a ledger analyzed while empty; the plan cache is what keeps a pass's first
plan; the slow state starts at about 160 entries; "refuses more, never less" narrowed; the owner role also runs
content loads; R's seed is analyzed-empty; a second superuser-only differing state named (an entry whose line is no
row, foreign key off); `compare.py` now requires the settle-order check to match (all three dumps re-compared).
Left as it is, with the reason in the description: the migration's own comment says "a few hundred to some tens of
thousands" (true of that range; it points to the ADR), since rewriting the migration needs the marker again.
Both test files: 14 of 14 green on the new bodies (13:05 UTC; the worker file's comments changed since, no code).

## Checks done
- **The grant's text (build start, plan section 2):** the two SQL blocks of the ask at the grant commit 38123394 and
  in the ask today are identical (sha256 of both extractions 34f4e868e44ed251…). The plan and the grant agree.
- **The base under the plan:** on edab4d4d both installed bodies are still migration 20261027090000's: prosrc SHA-256
  f151e27ea09f28c1… (`ledger_line_net`) and abbcba68f46fd135… (`ledger_entry_rules`). #126, #134, #136, #137, #140 and
  #141 changed neither. The granted `ledger_entry_rules` differs from the installed one in exactly the two statements.
- **Decision (W11, the safer reading of an exact grant):** the design's section 14.1 proposed marker comments
  (`-- plan-guard: …`) inside the two bodies for the plan test to cut statements by. They would change the granted
  bodies' text, so they are not used: the bodies are the ask's bytes, and the plan test finds each statement in the
  installed body itself (the whole SQL body of `ledger_line_net`; every read of `ledger_match` in `ledger_entry_rules`,
  exactly two expected), so an edited body is still what it plans.
- **The draft applied by hand** (as tp_owner, one transaction, on a database migrated to 20261111090000):
  `pg_get_functiondef` of each function equals the ask's block byte for byte; each function's pg_proc row is the same
  but its body (oid, owner, ACL, search_path, SECURITY INVOKER, volatility, strictness, language, cost); the triggers of
  ledger_entry are the same; new body hashes 5d0a94c0a294a732… (`ledger_line_net`) and 834cdefc070b08db…
  (`ledger_entry_rules`); a second apply is refused by the preflight. Locks taken: ACCESS SHARE on `ledger_entry` and
  `service_line` only (the SQL body's check), nothing a reader or writer waits for.
- **The proof tests on the base (no migration):** `apps/worker/src/reconcile/ledger-lookups.db.test.ts`, in its final
  form 7 pass and 4 fail (first form: 8 and 2). The four that fail are the plan guard's cases, as the ask requires it to fail first: `ledger_line_net`'s line read takes
  `ledger_entry_by_date` (expected `ledger_entry_by_line`), and `ledger_entry_rules`' correction lookup takes
  `ledger_match_standing` (expected `ledger_match_pkey`). The refusal tests (no match; another practice's match with
  both practices in scope; a reversed match on the entry path and on the correction path; a correction whose match the
  scope cannot read) and the cross-practice and net tests pass on the base. Log:
  `lane-a-wip/schema-pr2/plan-guard-fails-on-base-edab4d4d.log`.
- **Write-equality, first run (WIP tree = edab4d4d's code; before = the tree's migrations, after = the draft applied):**
  spread R, 2,000 lines: IDENTICAL row for row, in order, `seq` included (20,635 rows; settle entries in match `seq`
  order). F 10,000 and A's month: running (`lane-a-wip/schema-pr2/probe/`, queue log in the session's scratchpad).

## Reviews, round 1 (2026-11-11 11:45 UTC; reports `lane-a-wip/schema-pr2/review-database.md`, `review-money.md`)
Each finding was checked before any change.
- **DB 2 (plan), CONFIRMED and widened (`plan-probe` runs, W11):** as tp_app, generic plan, never-analyzed ledger. New
  `ledger_line_net`: `ledger_entry_by_line` at 0 to 120 entries; `ledger_entry_by_date` + Filter + Sort at 200 to
  80,000; `ledger_entry_by_line` at 100,000. Old body: `ledger_entry_by_date` up to 200, bitmap at 1,000,
  `ledger_entry_by_line` from 4,000. Analyzed with rows: both `ledger_entry_by_line`. Analyzed empty: sequential scans
  (both). The match lookups: `ledger_match_pkey` in every state (new). So the design's "whatever the statistics" is
  false, and in the middle state the new body is the slower one. Told to the orchestrator 11:50 UTC with the decision:
  build exactly the granted bodies (the grant's condition is unchanged money, which holds); state the limit in the
  migration's comment, ADR 0087's note and the PR description; the plan test holds the states where the claim is true
  (empty, and first rows). A body right in every state needs a new founder ruling (candidate: PR 5's ask).
- **DB 1 / money 1 (the invariant), CONFIRMED:** `tp_owner` may UPDATE `service_line.practice_id` (no guard trigger);
  `tp_app` may not; no migration or function does. Wording corrected in the draft, `equivalence.md` item 5 and
  reconciliation-001. Proposal outside the item: a guard trigger on `service_line.practice_id` (its own schema PR).
- **Money 2 (note), CONFIRMED:** a direct call with a NULL line under a malformed `app.practice_ids` gives 0 (old) and
  22P02 (new). Recorded in `equivalence.md` 5a; no code path.
- **Money 3, 4 (test gaps), ACCEPTED:** added a two-practice scope with the other practice first, and superuser-made
  corrections whose target is no row.
- **Money 5 (method), ACCEPTED:** the dumps cover a pass's writes (no correction, no refusal); said so in
  reconciliation-001 and to be said in the PR description.
- **DB 4 (note), ACCEPTED:** the plan test counts reads spelled FROM or JOIN, with or without the schema.
- **DB 3, 5 (notes):** analyzed-empty plans are sequential (recorded above); the generated function files come with
  the migration's placement.
- Next: run the reworked worker test on the base (plan group must fail, the rest pass); a delta review after the
  migration is placed reads only what changed since round 1.

## Write-equality, first run (edab4d4d's code; before = the tree's migrations, after = the draft applied)
| seed | pass before | pass after | `ledger_line_net` | `ledger_entry_rules` | dumps |
| --- | ---: | ---: | ---: | ---: | --- |
| spread R, 2,000 lines | 53.7 s | 19.0 s | 36.2 s to 3.1 s | 2.0 s to 1.3 s | IDENTICAL row for row, in order, `seq` included (20,635 rows) |
| F, 10,000 lines | 220.9 s | 79.2 s | 92.1 s to 2.2 s | 52.2 s to 4.0 s | IDENTICAL row for row, in order, `seq` included (102,907 rows) |
| A's month (F's shape, 30,795 lines) | 1,770.2 s | 317.1 s | 863.3 s to 7.1 s | 589.4 s to 15.0 s | IDENTICAL row for row, in order, `seq` included (316,770 rows); 30,795 approved, posted and recovered, 494,780,000 cents posted, in both |
| **the middle state:** F 10,000 on a ledger pre-filled with 20,000 never-analyzed entries of another tenant | 132.0 s | 168.5 s | 2.0 s to 90.8 s | 52.2 s to 4.1 s | same approved and posted cents (161,270,000 each); rows not dumped |

These are the first run, on the WIP tree. **The run of record is on the tree the PR merges onto (after #142).**

## Open
- The marker refusal (above).
