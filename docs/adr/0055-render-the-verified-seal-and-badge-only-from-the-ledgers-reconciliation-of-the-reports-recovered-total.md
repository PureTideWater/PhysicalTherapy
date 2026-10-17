# 0055. Render the Verified seal and badge only from the ledger's reconciliation of the report's recovered total

- **Status:** accepted
- **Date:** 2026-10-17
- **Deciders:** founder (engineering)
- **PRD sections:** 7 ("recovered" only beside stage five), 12 (the headline), 13 (Entries; ROI statement; proof
  level); docs/brand/BRAND.md, section 6; ADRs 0042, 0043, 0054

## Context

The brand's seal reads VERIFIED BY PAIDWHOLE and RECONCILED TO CASH, and its badge reads "Verified by PaidWhole". Both
are claims. The brand defines them: either mark renders only when every line in the report's recovered total has a
posted or deposited ledger entry net of recoupment and reversal; flagged, validated or actionable amounts never earn
it; and the definition line renders with the seal:

> Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off
> contract versions.

A mark that a template can set by hand, or that a caller can pass a literal `true` to, is not a claim the ledger
backs.

## Decision

`reportReconciliation()` in `@tp/ledger` (pure, 100% branch coverage) derives the fact from the report's own figures
and the practice's ledger. Its input is the report (kind and opaque ID), the proof level the report states its
recovered total under, the recovered total it states (null when it states none), the entries that total links, and
the ledger. The mark is earned only when, in order:

1. every linked entry is in the ledger (else `entry_not_in_ledger`), and none is linked twice (else
   `duplicate_entry`: an entry named twice would be counted twice);
2. every linked entry counts toward the proof level's stage (posted or deposited, the practice's setting the report
   was made under) or a recoupment of it, a reversal or adjustment counting toward the entry it corrects (else
   `entry_not_cash`: an approval, interest or the other stage refuses the mark);
3. the report states a recovered total above zero (else `no_recovered_total`);
4. no linked entry has been corrected since the report was made: every reversal or adjustment in the practice's
   ledger whose target is a linked entry is linked too (else `entry_corrected_since`). A correction takes the
   effective date of the entry it corrects, so one made before the report is in its period and among its links; one
   that is not linked came later (a wrong match undone, LED-07), and the cash the links give is no longer what the
   ledger holds for that line. The statement still recomputes from the entries it links; only the claim that it
   reconciles to cash is withdrawn;
5. the linked entries, net of their reversals and adjustments, give exactly that total (else `total_differs`);
6. every line in the total (by service line, or by case for an entry of the case as a whole) has a posted or
   deposited amount standing, net of its recoupments and reversals: a line whose entries net to zero adds nothing and
   is not in the total; a line whose recoupments exceed its cash, or with no cash among the linked entries, refuses
   the mark (`line_not_proved`);
7. the report's other entry-backed figures still recompute from their entries (`figuresMatch`, an ROI statement's
   interest and approved-but-not-posted from recomputeStatement; else `figures_differ`). The print job already refuses
   to print such a statement; the web page now withholds the seal from it too, so the two never disagree.

It returns `reconciledToCash`, typed `false | ReconciledToCash`, a branded `true` only this function produces (a literal
`true` does not typecheck in the web components or the report frame), with its `reason` and its `source`,
`ledger.reportReconciliation(<kind> <id>)`, which the rendered mark carries as `data-source`.

**Where it is called.** The ROI statement (web page and PDF) passes its stored recovered total, proof level, linked
entries, the practice's whole ledger as it stands when the page is read or the PDF printed, and whether its figures
match their entries. The audit report states recovered as zero and links no entries, so it never earns the mark; the coverage
report and the monthly summary state no recovered dollars, and a packet asks for money rather than proving any, so
none of them earns it either; each still asks the function rather than omitting the call. The seal prints bottom right
of a PDF's Paper cover with the definition line; a billing firm's white label (milestone 12) shows only the badge, in
its footer, through the same function.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Earn the mark when the report's recovered total is above zero | A total can include a line recouped beyond its cash, or a figure its entries no longer give |
| Earn it per line even with recoupment-only lines (a later recoupment of an earlier period's cash) | The total would then hold a negative no remittance in the report proves; the mark is withheld instead, and the next statement earns it |
| A boolean prop the caller sets | Nothing would stop a template or a test page from printing the claim |

## Consequences

- `reconciliation.test.ts` covers each reason and two properties (earned exactly when the stated total is positive and
  its proved lines give it; refused exactly when a linked posting was reversed or adjusted afterwards);
  `reconciliation-routes.db.test.ts` drives both production call sites from a stored statement: `statementOf` gives the
  seal for a statement over deposits, and withdraws it (`entry_corrected_since`) once a linked deposit's match is
  reversed, while the statement still recomputes; `printRoiStatement` prints the seal in the first case and not in the
  second; `brand.test.tsx` proves the web components render nothing when the fact is false and refuse a
  literal `true`; the worker's `brand.test.ts` proves a statement's cover omits the seal when the ledger says it does
  not reconcile and carries it, with its definition, when it does, in the HTML and in the printed PDF.
- A statement uses the proof level it was printed at; a later change of the practice's level does not move a printed
  statement's mark.

## Revisit when

A report gains a recovered total of its own (the audit report after the ledger runs, a firm's portfolio report in
milestone 12), or the brand's definition of the mark changes.
