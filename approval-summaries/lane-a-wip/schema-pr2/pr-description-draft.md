<!-- DRAFT (W11, 2026-11-11). Title: The ledger's two lookups: new bodies for ledger_line_net and ledger_entry_rules under the founder's freeze exception of 2026-11-06 (schema batching plan PR 2; ADR 0087 amended)
The Domain model section's summary, the Checks table and every figure marked RE-RUN are filled on the tree the PR merges onto. -->

## What changes

One migration, `20261113090000_ledger_lookups.sql`, gives two ledger functions the new bodies the founder granted on 2026-11-06, exactly as he read them (byte for byte; the migration refuses to run over any other starting body):

- `ledger_line_net`, the per-line sum each new ledger entry is checked against, finds a line's entries by the line's practice and the line.
- `ledger_entry_rules`, the checks on each new entry, finds the entry's match by the match's primary key alone, and tests the practice and "not reversed" after the read. Two statements change; the rest is unchanged word for word.

Nobody using the product sees a change: every amount, stage, refusal message and recovered total is what it was. What changes is how long a large reconcile pass takes on a new ledger.

**For the founder to read before approving (three things):**

1. **The speed-up is real where it was measured, and it is not unconditional.** Re-measured on this base (SYNTHETIC rows, one run each):

   | Practice shape and size | Pass before | Pass after | What the pass wrote |
   | --- | ---: | ---: | --- |
   | Spread R, 2,000 lines | 54.7 s | 18.8 s | identical, 20,635 rows |
   | F, one case, 10,000 lines | 226.8 s | 76.0 s | identical, 102,907 rows |
   | Practice A's month, 30,795 lines | 1,745.5 s | 333.2 s | identical, 316,770 rows |

   All three start on an empty ledger, as a new deployment's first passes do (F's and practice A's never analyzed; spread R's analyzed while empty, where both bodies scan the ledger and the new one scans it once a call, not three times). This pull request's database review found a state the design did not: when the ledger already holds about 160 to some tens of thousands of entries and the database has still never analyzed it, the new `ledger_line_net` is planned the slow way and today's body is not. Measured in that state (a ledger already holding 20,000 never-analyzed entries), F at 10,000 lines passes in 132.0 s before and 168.5 s after. The design's sentence that the right index is taken "whatever the statistics" was wrong. In production the state lasts about a minute (automatic analysis runs after the first fifty committed entries, and with statistics both bodies are planned the fast way), and no amount depends on it. A body that is fast in every state would be a different body, so it needs a new ruling from you: it is recorded as a candidate for the next ledger freeze ask. This pull request builds exactly what you granted and nothing beside it.
2. **Where the two `ledger_line_net` bodies could answer differently.** Only if a ledger entry's practice were not its service line's practice (or its service line did not exist, which the foreign key refuses and only a superuser can force). The application cannot create that (it cannot change a service line, and the rules and the tenant policy refuse such an entry). The database owner role (which migrations and content loads run as) or a superuser could, by moving a service line to another practice by hand; no migration, content load or function does. The new body would then count only the entries that carry the line's new practice, so none of those stored before the move, where today's body counts every entry of the line it can read; for a line moved once and left so, the ledger would then refuse more. The ask said only a superuser could reach such a state; the owner role can too. A guard that refuses that change is proposed as its own item.
3. **What the row-for-row comparison does and does not prove.** It compares everything a reconcile pass writes, before against after, in order, `seq` included. A pass writes approvals and postings: no correction and no refusal. Those are proved by tests that pass on the old bodies and on the new (no match; another practice's match with both practices in scope; a reversed match on the entry path and on the correction path; a correction whose match cannot be read; a line's sums in a two-practice scope; corrections whose target is no row, which count as nothing), by LED-01 to LED-18 and LED-23 to LED-25, and by the ledger oracle.

Moving the weekly run's step 7b back to practice A's month is **not** in this pull request: it follows with no migration, measured on the merged tree.

## Why

SUITE-CAP-3 (#134) left the ledger's own checks as most of a large reconcile pass; these two were the largest. Granted: the founder's ledger freeze exception of 2026-11-06, about 22:40 UTC, relayed by the co-founder ("Yes to freeze exception from Tyler."), for the two bodies as written in the ask. The schema batching plan, PR 2; ADR 0087 (dated note of 2026-11-11).

## What it does not change

- Pricing engine (`packages/pricing`): nothing.
- Ledger (`packages/ledger`): nothing. No amount, stage, entry, refusal or recovered total changes; `packages/ledger/src` and the worker are untouched.
- Database schema and migrations: one new migration replacing two function bodies. No table, column, index, trigger, policy or grant changes; both functions keep their identity, owner, grants, `search_path` and SECURITY INVOKER. No other ledger function changes (`ledger_entry_within_evidence`, `ledger_line_stage` and the interest trigger are not part of the exception). No applied migration is edited.
- Content releases (`content/`): nothing.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: the document is regenerated (Appendix C's two function hashes change) and its approval line is blank until the founder commits the suggested line; `approvers.json` is untouched.
- CI and the GitHub settings: nothing.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

| Command | Result |
| --- | --- |
| RE-RUN | RE-RUN |

## Reviewer agents' findings

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Security (database, tenancy and plan) | The new `ledger_line_net` is planned through `ledger_entry_by_date` on a never-analyzed ledger of a few hundred to some tens of thousands of entries; "whatever the statistics" is false | Confirmed and measured (plans at eleven sizes; a pass in that state). Not a defect of correctness. The bodies are fixed by the grant: the limit is stated in the migration's comment, ADR 0087's note and above; the plan test holds the two states a first pass plans in; a body right in every state is a candidate for the next freeze ask |
| Security | The owner role can move a service line to another practice (no guard), after which the two bodies differ; the argument said "superuser only" | Confirmed. Wording corrected in the migration's comment, reconciliation-001 and ADR 0087; no migration or function does it; a guard trigger proposed as its own schema item |
| Security | The plan test finds only reads spelled `FROM ledger_match` | Fixed: FROM or JOIN, with or without the schema |
| Security | After ANALYZE of an empty ledger every lookup is a sequential scan, the match lookups too (round 2: "no such state" was too wide) | Recorded in ADR 0087's table and note (spread R's seed is that state; measured 54.7 s to 18.8 s) |
| Security (round 2) | Two comments said the planner learns nothing of a pass's rows; what keeps the first plan is the plan cache. The lower bound of the slow state is about 160 entries, not "a few hundred" | Fixed in the test's comment, ADR 0087 and reconciliation-001. The migration's own comment says "a few hundred to some tens of thousands", which is true of that range and points to the ADR for the measured bounds; the migration is not rewritten for it |
| Payment engine (round 2) | "Refuses more, never less" held only for a line moved once; the owner role also runs content loads; two measurements' starting state misdescribed; the comparison printed but did not compare the settle-order check | Fixed: wording in ADR 0087, reconciliation-001 and above; the comparison now requires the check to match (re-run on every dump) |
| Payment engine (round 2) | Not tested: a reversal of a reversal, an adjustment chain three deep, entries on a line that is no row | Not a defect: each needs a superuser to store. For the first two, both bodies read at most two levels by the same expression and round 1's side-by-side run agreed. The third is a state where the bodies differ (the old one counts such entries, the new one does not); it needs the foreign key switched off and is named above and in ADR 0087 |
| Payment engine | Same invariant finding as above (the owner role) | As above |
| Payment engine | A direct call with no line while `app.practice_ids` is not a uuid array: 0 before, an error after | Not a defect: the trigger never passes a NULL line, no code calls the function directly and every scope helper writes a uuid array. Recorded |
| Payment engine | The net tests ran in a one-practice scope: a body using the scope's first practice would pass | Fixed: a two-practice scope with the other practice listed first |
| Payment engine | No test has a correction whose target is missing | Fixed: a reversal, an adjustment and an adjustment of an adjustment whose target is no row (superuser-made) each count as nothing |
| Payment engine | The dumps exercise no correction and no refusal | Stated above and in reconciliation-001; those are held by the tests |

## Freeze exception

Yes: the ledger's semantics are frozen, and this changes two ledger function bodies under the exception the founder granted on 2026-11-06 at about 22:40 UTC for exactly these two bodies (recorded in `docs/product/reconciliation-001.md`, "Ledger semantics", and ADR 0087's dated note). It changes nothing the exception does not name.

## Domain model

RE-RUN (`pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`, pasted whole)

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.
