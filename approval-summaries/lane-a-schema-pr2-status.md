# Schema PR 2: the ledger lookups (SUITE-CAP-3's two ledger-function bodies, under the founder's grant of 2026-11-06)

Lane A, W11 (https://claude.ai/code/session_019i9ifBgvfeZAe47vuU7EUC), from 2026-11-11 11:22 UTC. Plan:
`approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` section 2. Grant: `approval-summaries/founder-asks-2026-10-27.md`,
"Decided 2026-11-06"; the granted text: `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md` at 38123394.

## RESUME-BLOCK (current at 2026-11-11 11:40 UTC)
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
- **Next steps, in order:** (1) the migration placed; (2) `pnpm test:db` files `apps/worker/src/reconcile/ledger-lookups.db.test.ts`
  and `packages/db/src/ledger-lookups.db.test.ts` green; (3) ADR 0087's dated note with the re-measured figures;
  (4) the two adversarial reviews (database, tenancy and plan; payment engine and ledger), reports in
  `approval-summaries/lane-a-wip/schema-pr2/`; (5) wait for #142's merge (W10 tells the orchestrator); (6) base merge,
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

## Open
- The marker refusal (above).
