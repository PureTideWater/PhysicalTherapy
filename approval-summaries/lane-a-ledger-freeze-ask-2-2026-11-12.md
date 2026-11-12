# Ledger follow-ups after schema PR 5: a second, short ask (DRAFT for the orchestrator to bring to the founder)

From Lane A (W29), 2026-11-12. Base `claude/build-platform` 93e137f9 (#143). Synthetic data only. Nothing here is in
schema PR 5, which is built exactly as granted on 2026-11-07 (Appendices A and D). Each question stands alone; any
combination can be answered; a grant covers only the exact text shown; no answer blocks PR 5 or any launch item.

**Ready to answer now:** Q1 (a reading of the first grant), Q2 (the service-line guard, exact text), Q3 (a product
yes or no). **Not ready, shown so you know it is coming:** the `ledger_line_net` body for every planner state, which
has no measured text yet, and the "remove" step, which is asked the day PR 5 merges.

## Q1. If PR 5's proof faults one question's text, does your grant cover the fallback the first ask named?

- **What:** the first ask said a fault traced to Q3's text would be "treated as your no" and Appendix B built in place
  of A. The record of your answer says the grant covers "exactly Appendix A ... and Appendix D". These can be read two
  ways.
- **Why ask:** Lane A does not read a grant generously. Today it takes the narrow reading: only A and D.
- **The text you would be granting:** Appendix B of `approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`
  (body `c50446070bb177d8`: A without the `coalesce`, so `{}` stays accepted), to be built only if PR 5's preflight or
  tests fault Q3's `coalesce` and nothing else.
- **If you say no, or nothing:** on any fault in A or D the migration is not built, PR 5 does not open, the chain moves
  to the next schema PR, and you get a new ask with a corrected text. Before launch no statement is stored in
  production, so the only known way Q3 can fault (a stored `{}`) cannot happen there.
- **Lane A recommends no.** A fault in a granted text is worth your second look, and the cost of waiting is nil.

## Q2. May a trigger refuse a change of a service line's practice?

- **What:** a new trigger on `service_line` that refuses any UPDATE changing `practice_id`.
- **Why:** the `ledger_line_net` body you granted for #143 finds a line's entries by the line's practice, and its proof
  says "a service line never changes practice". Today only a missing privilege holds that: the application's role has
  no UPDATE on `service_line`, but the owner role (migrations, or a person with the owner's credentials) could change
  it by hand, and that function would then count none of the line's entries, silently. A trigger makes the database
  refuse it for every role.
- **It is not a ledger freeze exception:** `service_line` is not one of the five frozen tables, and no ledger table,
  function, amount or stage changes. It comes to you because it guards the proof of a function you granted; your
  approval of record on its schema PR is the gate either way.
- **The exact text:**

```sql
CREATE FUNCTION service_line_keeps_practice() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'a service line keeps its practice' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION service_line_keeps_practice() FROM PUBLIC;
CREATE TRIGGER service_line_keeps_practice
  BEFORE UPDATE OF practice_id ON service_line
  FOR EACH ROW WHEN (OLD.practice_id IS DISTINCT FROM NEW.practice_id)
  EXECUTE FUNCTION service_line_keeps_practice();
```

- **Cost and lock, to be measured in its design:** `CREATE TRIGGER` takes a lock on `service_line` that makes writers
  (the 835 load) wait while it is held, for milliseconds; it is taken with `NOWAIT` under the runner's retry, as schema
  PR 1 did, so it never queues behind a long load. Nothing is read or rewritten. An UPDATE that does not name
  `practice_id` never fires it.
- **Where it lands:** in "PR 5b" (the ledger follow-ups), or, if this is the only thing granted, riding the screening
  key's schema PR (Queues item 35), reviewed by the database and money lenses.
- **If you say no:** nothing changes; the assumption stays held by privileges alone, and the comment in migration
  20261113090000 keeps saying so.
- **Lane A recommends yes.**

## Q3. Do you want each chain's interest on its lines (ADR 0084's D19, the open alternative)?

- **What:** today, when a line already holds interest from one payment chain, a payment of another chain writes
  nothing on that line (D19, chosen inside your grant of 2026-10-27): recovered interest reads low by the share kept
  off, never above the cash. The alternative is one interest entry per PLB L6, line and chain, so those shares sit on
  their lines.
- **This is a product yes or no, not yet a text.** The alternative changes `ledger_entry`'s rules (the trigger
  `ledger_entry_within_interest` and what `interest.ts` writes), so it needs a new ledger freeze exception with its
  exact bodies, and no such text is designed.
- **If you say yes:** Lane A designs it (a design note, two money reviews, measurements) and returns with the exact
  function texts as its own ask; nothing is built on this yes alone.
- **If you say no:** D19 stays as built and the alternative is closed in ADR 0084, so nobody reopens it.
- **Lane A's recommendation:** no for now. The shortfall is bounded, never overstates, and happens only when a payer
  pays interest twice on one line through a renumbered correction; no synthetic case in the matrix shows a practice
  losing a dollar of recovered principal to it. Worth reopening if a real remittance shows it more than rarely.

## Not asked yet: `ledger_line_net` reading a line's entries in every planner state

- **What is known** (#143's record, `approval-summaries/lane-a-wip/schema-pr2/probe/plan-probe-1.txt` and `-2.txt`): the
  body you granted reads a line's entries through the right index on an empty or tiny never-analyzed ledger and on an
  analyzed one, but not when a pass plans on 40,000 to 80,000 entries never analyzed (it reads the practice's entries
  by date and sorts). The earlier body was the reverse. Beside it, `ledger_entry_within_evidence` is 95 s of practice
  A's 333 s.
- **Why there is no text to grant:** no body has been measured that holds in all three states, and a ledger function's
  text is not put to you before its measurement and its row-for-row equality dumps exist. A session with the probe kit
  (about 12 minutes a run) designs it; the ask then carries the exact body, its hash and the dumps.
- **What happens meanwhile:** nothing waits on it. Step 7b goes back to practice A's month after PR 5 merges and
  records which state A's pass finds; the margin (333.2 s and 317.1 s against 360 s) is small, and that measurement
  says how soon this is needed.

## Coming the day PR 5 merges: the "remove" step

As the first ask said: `roi_statement_rules` refusing a new statement that does not carry the line list, so production
never accepts an unchecked actionable figure. Its own exception and exact text, wanted before the launch tag; it also
removes the fast way out the first ask's Risk section describes, which is yours to weigh then.
