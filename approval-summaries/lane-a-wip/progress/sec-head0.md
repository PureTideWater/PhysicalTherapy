# Interest credited once: the PLB L6 is the interest, AMT I says whose it is (Lane A; handed over by PR 15b)

Design contract, 2026-10-27, against `claude/build-platform` at e908c21, with PR 6b-4 (#42, `co-001/pr-06b-mail-streams`)
read at its fix round's head 6f23c42b (GitHub still shows 098636e3) for every function and generated file this item
shares with it. GitHub's `claude/build-platform` has since moved to 085299bd (#76: six test files, none of this item's).
Revised the same day after the design review (section 15 records each finding and what changed).

- **Lane:** A (a schema pull request; LANES.md rule 2). **Branch:** `co-001/ledger-interest-once`, cut from the latest
  `claude/build-platform` after #42 merges and after the founder grants the freeze exception of section 10.
- **Reserved (LANES.md claim row):** ADR 0084; test-matrix LED-23 to LED-25; `packages/synth` cases LED-23 to LED-25
  (module 6, LED). Fixture release 900008 is not needed and stays free.
- **Handed over by:** PR 15b (#51, merged as c355633). LANES.md "Handed to Lane A", 2026-10-26, four ledger items:
  interest credited twice, N1 (the interest "allocated" flag), a sequence for `ledger_match`'s order within one
  reconcile, and an index on `claim.superseded_by_claim_id`. Status: `approval-summaries/lane-b-pr15b-status.md`.
- **Scouts' notes:** `scratchpad/progress/design-interest-database.md` and `design-interest-application.md`. **The
  review:** `scratchpad/progress/design-interest-review.md` (its probes in `scratchpad/probes/review/`). **The
  author's probes:** `scratchpad/probes/author/` (run 1) and `scratchpad/probes/author/run2/` (after the review); each
  command and its output is quoted where it is used below.
- **Short names:** `rem` = `apps/worker/src/reconcile/remittances.ts`; `rled` = `apps/worker/src/reconcile/ledger.ts`;
  `wq` = `apps/web/src/lib/reconciliation/queries.ts`; `page` = `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`;
  `ledger_mig` = `packages/db/migrations/20261023120000_recovery_ledger.sql`; a **chain** is a claim with its reversals
  and corrections (D3).

---

## 0. Summary

**The defect.** A payer that pays interest on a claim sends it twice in the 835, as the implementation guide asks: the
claim's AMT I (the amount of interest that claim earned, which is information only) and a PLB L6 at the end of the
check (the money). The reconcile credits both, so the practice's interest figure, the totals tile and the ROI
statement's "Interest, net" show twice what the payer paid. The author's probe reproduces it on the guide's own shape:
1080 cents credited for 540 cents of cash. Two more paths over-credit the same way: one PLB L6 split again over its
lines at a later reconcile (840 cents credited for 540 of cash, probe R), and an AMT I with no money behind it at all
(credited although the check excludes it). Recovered is never touched, because interest is never in recovered.

**What this PR does.**
- The PLB L6 is the interest. An interest entry's evidence is always the PLB L6 that paid it or took it back; the
  claims' AMT I only say which claim (and so which case lines) the money is for. Interest that appears only once as
  money (an L6 with no AMT I) is credited. An AMT I with no L6 behind it is shown beside the line as reported, and
  counted nowhere until a check pays it.
- A PLB L6 that names no claim (payers' guides list L6 among the codes whose reference need not name one, and the guide
  lets one L6 carry the net interest of a whole remittance) is shared among that remittance's claims by their AMT I,
  netted per chain, so a reversal and its correction cancel and another patient's interest is never taken. When the
  remittance's L6s equal its AMT I, as the guide requires, each claim gets exactly its AMT I. Today such an L6 is never
  credited. A reference that carries several identifiers names the claim whose control number is among them.
- One PLB L6 is never credited past what it moved, however many reconciles run and whatever later uploads change about
  whom it names, in code and in Postgres; a valid reconcile is never refused by that bound.
- A PLB L6 that takes interest back becomes a negative interest entry against the lines that hold that chain's
  interest, never below zero on a line. Today it is dropped.
- N1: an entry is flagged allocated only when its amount is one of two or more parts of a pro-rata split.
- `ledger_match.seq`: the order the ledger made its matches in. Every reader orders by it instead of by
  `matched_at`, which every match of one reconcile shares, and the match's random ID.
- An index on `claim.superseded_by_claim_id` for the correction chain's lookups, unless SUITE-CAP-1 merges it first.
- During the deploy and after a rollback, the previous image's reconcile credits no interest and otherwise runs as
  before; the current image then credits the interest once.

**Migration: yes, one** (section 5). It changes a CHECK on `ledger_match` and one on `ledger_entry`, adds
`ledger_match.seq` and its index, recreates `ledger_match_rules()`, adds one trigger function on `ledger_entry`, and
adds `claim_by_superseded` if SUITE-CAP-1 has not. It regenerates `docs/product/domain-model.md` and
`packages/db/functions`.

**One pull request** for all four handed-over items (section 3.5). The PR 15b case close ("payer corrected; balance is
the patient's") is not a ledger item and stays with PR 8's case schema, as LANES.md already places it.

**The founder decides two things** (section 10): the ledger freeze exception, whose exact scope section 10 lists (it
can be granted together with SUITE-CAP-1's Q1), and the domain model's approval by its SHA-256 on the pull request's
latest commit. Nothing else here is the founder's.

---
