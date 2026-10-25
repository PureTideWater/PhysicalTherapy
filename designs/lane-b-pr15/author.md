# PR 15 design: the author's probe and notes (2026-10-25)

Design: /home/user/ops/designs/lane-b-pr15-ledger-tests.md. Base claude/build-platform at 49514e8. Worktree
`scratchpad/pr15-design/author-wt` (detached at origin/claude/build-platform, `pnpm install --frozen-lockfile
--prefer-offline`), removed afterwards. PG18 at localhost:5433, DATABASE_URL=postgres://postgres:test@localhost:5433/postgres.
Heavy runs under `flock /tmp/laneb-heavy.lock`. No commit, push or GitHub post. Synthetic data only.

## Probe: LED-12 as written ("reversal with a provider-level adjustment nets to no cash change")

Reading taken: the 835 sense. A remittance reverses (CLP02 22) the claim that recovered a case line's money and offsets
the reversal with a PLB of the opposite cash effect naming that claim (FB carried forward, or 72 authorized return), so
the remittance moves no cash; "nets to no cash change" read plainly: posted, deposited, recouped, recovered and the
line stage unchanged.

Fixture (temporary synth case LED-12, `pnpm synth --case LED-12`): LED-06's recovery pair (original 97110 x 2 allowed
70.00 against 100.00 expected; adjusted remittance: reversal of the original + corrected claim SYNCCNLED120002 allowed
and paid 100.00; posting and EFT exports of the 30.00 check), then per variant one later remittance. Test (temporary
`apps/worker/src/reconcile/led12-probe.db.test.ts`, LedgerWorld): from the recovered state (approved, posted, deposited
3000; recovered 3000 at the deposited proof level; line recovered; case resolved), load the variant, reconcile, assert
the plain reading with expect.soft. Description of the files as run: `probe/README.md`.

Observed (before -> after):

| Variant | Entries after | Totals after | Line / case | Notifications |
|---|---|---|---|---|
| P1 reversal -100.00 + PLB FB -100.00, BPR02 0.00 (NON) | + recouped -3000 (evidence: the reversal claim) | approved 3000, posted 3000, deposited 3000, recouped -3000, recovered 0, payer approved 3000 | recovered -> actionable; resolved -> awaiting_response | 2 recoupment |
| P2 reversal + PLB 72 -100.00, BPR02 0.00 | same as P1 | same | same | 2 |
| P3 reversal + FB beside another claim paying 50.00, BPR02 50.00 | same as P1 | same | same | 2 |
| P3b P3 then its 50.00 EFT row | no entry (a second deposit match, of the 50.00 remittance; the line's share of it is negative, skipped at postings.ts:372) | deposited 3000 unchanged | - | - |
| P5 P1 then FB +100.00 withheld from a 150.00 claim (BPR02 50.00) | no further entry | recouped stays -3000 | - | still 2 |
| P6 PLB WO 100.00 + FB -100.00, no claim, BPR02 0.00 | + recouped -3000 (the WO, capped at the approval) | recovered 0 | actionable | 2 |
| P4 original reversed + FB -70.00 before any approval | none | all 0 | actionable / open | 0 |
| P1 at the posted proof level | + recouped -3000 | recovered 3000 -> 0 | actionable | 2 |

PLB rows as stored: FB `forward_balance`, counted false; 72 `authorized_return`, counted true; WO `recoupment`.
Remittances: BPR02 7000 (original), 3000 (adjusted), 0 (P1/P2/P6), 5000 (P3).

Verdict: 5 failed (P1, P2, P3, P6, P1-posted: recouped, recovered and line stage changed), 2 passed (P3b, P4 vacuous).
LED-12 fails as written. Cause: remittances.ts:371-408 (recoupReversals: a reversal of the attached claim with no
correction in the same remittance takes back at once, PRD 13:548, ADR 0042:88-90) and remittances.ts:442 (only WO and
L6 are read; FB never an entry by rule, :33; 72 never read). Passes only the narrow reading (posted, deposited
unchanged; no cash entry). Stop and ask: L1 in the design, section 3.

## The design's tests for L1 (a), pre-validated on the frozen ledger

Patch: `scratchpad/pr15-design/pr15-design.patch` (sha256 2e223d057172d1323e2759e40141a9bde68ba64d0a3e3336f6dc148b385d3c2f),
per-file diffs in `final/`. Results:
- ledger.db.test.ts + ledger-oracle.db.test.ts: 48 passed (base 42).
- pnpm test: 298 files, 4,530 passed, 3 skipped; packages/ledger/src branches 100% (415/415). `unit-run.log`.
- vitest list: db +4 entries (it.each listed once), unit +1 (`db-base.txt`, `db-head.txt`, `unit-base.txt`, `unit-head.txt`).
- pnpm synth --all: 179 cases, final run 0 written / 458 unchanged; EMR 0 written. pnpm check:fixtures passes.
- pnpm test:oracle (pyx12 4.0.0 at /opt/py312-ci): 637 of 637 agree.
- pnpm typecheck passes; eslint on the 6 changed source files passes (after negateCents for a unary minus on Cents).
- Prettier: not enforced (the base files fail `prettier --check` too).

Regression probes (applied to apps/worker/src/reconcile/remittances.ts in the worktree, reverted, `git diff` empty after):
- m3: in recoupReversals' query, add `AND NOT EXISTS (SELECT 1 FROM provider_adjustment p WHERE p.remittance_id =
  v.remittance_id AND p.amount_cents < 0)` after the superseded clause (an offset reversal is not taken back, reading
  (b) without a ruling). Killed by 4: LED-12 FB, LED-12 72, LED-12 in-check, the oracle's LED-12 case.
- m1: providerAdjustments' query `a.category IN ('recoupment', 'interest', 'forward_balance', 'authorized_return')`
  (and widen AdjustmentRow.category): FB and 72 read as interest. Survives LED-12's main it (the reversal's take-back
  leaves no approval to weight the interest by, remittances.ts:524-527), killed by the adjustments-alone it.

Fixture SHA-256 at the validated run (LED-12; expected.json changes with the final row wording):
- adjusted.835 eb7c3bb02b36dd9b8dfc64a706f4f07dc4afe93bd9b64048343f6df9382298db
- adjustments-alone.835 2697b001c60ee2427d7d33e18e441502276b0801d48c11abd24c9a47c232705c
- eft-export.csv 1a64f04c6a5b52044fa80c9abb723df5e2c294019644d51c4da758f224b91d31
- forward-balance-withheld.835 8838a76cf767386c26c5a67e48c399820c9fbe4c457bf4d6888fa23fd266490c
- original.835 5c821057448aee562e47cd937dd27cd43cadb115ffea1537335f0fa680173128
- posting-export.csv 5369d4570b7cbcbcc994130913bd4e46ce49eba0133f3f5d68062190c4a60ebb
- reversal-in-check-eft-export.csv 522e20be408b4ca2305d5cbcde113096f13b58558e1c3b1e40c91b6b7f1d37a1
- reversal-in-check.835 c83dbdd9b8e1ce197d2ac9f3d686f6499a054daa03014b70d1066a7101b6c156
- reversal-refunded.835 8ab25748cc4838f733a629a71db61b9e76a4d91eec10ac3d36908403748ef113
- reversal.835 45515285237212d6cca103b41288c750176e47a2a64b1d15d244c28731b7b43a

## LED-13 verification notes

CO-09: "a later recoupment is a negative event against net recovery". LED-06's tests assert later (recoupment
2026-08-03 after the 2026-06-09 deposit), negative (recouped -1800), against net recovery (recovered 3000 -> 1200 by
exactly 1800, approved unchanged; ROI 1200; the property totals.test.ts:166-174), and the period attribution through the
digest (June 3000 kept, August -1800) and the Q3 statement (-1800). Implied only: the PLB recoupment row's own evidence
and date, the earlier rows' identity beyond stage and amount, and a pure period property. Closed by one DB `it` and one
fast-check property (design 6.2), both passing on the frozen ledger.

## Notes for the orchestrator (no edits made to /home/user/ops beyond the design file)

- LANES rule 8: L1 goes to the founder through the co-founder (no delegation recorded).
- The claim row reserves synth case LED-12 only; the design also adds registry case LED-13 (a no-file entry, as every
  matrix row has one).
- Until L1 is answered, PR 15 waits as a whole (one PR for both rows); Lane B's next item is the legal-surfaces PR or the
  infrastructure PRs once #42 merges.
- If L1 is (b), record "Handed to Lane A: the LED-12 ledger change (design section 2 as the evidence)" in LANES.md.
