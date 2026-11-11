# Schema PR 2: the ledger lookups (SUITE-CAP-3's two ledger-function bodies, under the founder's grant of 2026-11-06)

Lane A, W11 (https://claude.ai/code/session_019i9ifBgvfeZAe47vuU7EUC), from 2026-11-11 11:22 UTC. Plan:
`approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` section 2. Grant: `approval-summaries/founder-asks-2026-10-27.md`,
"Decided 2026-11-06"; the granted text: `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md` at 38123394.

## RESUME-BLOCK (current at 2026-11-11 12:40 UTC)
- **State:** building on a WIP ref; **BLOCKED on one step**: the migration file is not in `packages/db/migrations`.
  This session's permission classifier refused the new-migration marker route (the one shell command that sets
  `.claude/.allow-protected-edit`, writes the file and removes the marker in a trap). Per `lanes/acting-lane-a-brief.md`:26
  the part is stopped, the orchestrator was told (11:31 UTC), and nothing routes around it. Everything else proceeds.
- **WIP ref:** `co-001/wip-ledger-function-bodies` (cut from edab4d4d). PR branch, when it opens: `co-001/ledger-function-bodies`.
  It must not open before #142 merges (one schema PR at a time); then merge the base, place the migration, regenerate
  `domain-model.md` and `packages/db/functions`, re-run the dumps on that tree, open the draft PR.
- **The migration's draft:** `approval-summaries/lane-a-wip/schema-pr2/migration-draft-20261113090000_ledger_lookups.sql`,
  written by `mk-draft.sh` beside it (comments from the script, the two statements cut byte for byte from the ask's SQL
  blocks). To place it (whoever is permitted), one command from the checkout's root, then check the marker is gone:
  `touch .claude/.allow-protected-edit; trap 'rm -f .claude/.allow-protected-edit' EXIT; cp /home/user/ops/approval-summaries/lane-a-wip/schema-pr2/migration-draft-20261113090000_ledger_lookups.sql packages/db/migrations/20261113090000_ledger_lookups.sql`
- **Done on the WIP ref (5 commits on edab4d4d):** both test files, reconciliation-001's freeze-list entry, ADR 0087's
  dated note (figures, the plan-state table, the middle-state measurement). typecheck, lint (the two files), lint:copy,
  lint:logs and check:fixtures pass. The worker test on the base: the 4 plan cases fail as required, 7 pass. The
  `packages/db` test has never run (it reads the migration file). The PR description's draft:
  `lane-a-wip/schema-pr2/pr-description-draft.md`. The every-state body is a candidate for schema PR 5's ask (the
  orchestrator logged it, 11:50 UTC).
- **Measurement kit:** `lane-a-wip/schema-pr2/probe/` (cluster.sh, queue.sh, run.sh, run-fill.sh, dump.py, compare.py)
  plus SUITE-CAP-3's `probe/common.mts, pass.mts, seed.mts` and `probe-rev/seedF.mts`, copied into one scratch folder;
  private cluster on port 5494 at /root/pr2-pg (`cluster.sh up /root/pr2-pg`); queue: `S=<scratch> TP_REPO=<checkout>
  DRAFT=<the migration's text> queue.sh "seedR 2000" "run cap3_r_2000_seed none w1" "run cap3_r_2000_seed pr2 w1"
  "cmp cap3_r_2000 w1" "seedF 10000" … "seedF 30795" …` (about 50 minutes; A's month before is 30 of them).
  For the run of record, seed from a checkout WITHOUT the migration (the base), state `pr2` applies the placed file.
- **Next steps, in order:** (1) the migration placed; (2) `pnpm test:db` files `apps/worker/src/reconcile/ledger-lookups.db.test.ts`
  and `packages/db/src/ledger-lookups.db.test.ts` green; (3) ADR 0087's dated note with the re-measured figures;
  (4) the two adversarial reviews: round 1 done on the draft (below); a delta review once the migration is placed; (5) wait for #142's merge (W10 tells the orchestrator); (6) base merge,
  generators, dumps re-run, full local suite once, push, draft PR, the suggested approval line, subscribe.

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
- **The proof tests on the base (no migration):** `apps/worker/src/reconcile/ledger-lookups.db.test.ts`, 8 pass, 2 fail.
  The two that fail are the plan guard, as the ask requires it to fail first: `ledger_line_net`'s line read takes
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
