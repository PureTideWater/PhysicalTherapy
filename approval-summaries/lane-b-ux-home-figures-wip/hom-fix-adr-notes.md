# ADR 0082 sentences from the money part (hom-fix-money)

## engine-r2-R1 (Recovered tile's since-date), for Decision 8 (or wherever the tile's "to date, since" is decided)
"To date" is dated from the first recovery that still stands: the earliest entry recovered to date sums that is an original entry, never a reversal or an adjustment, and never one reversed since (a wrong match undone). A ledger whose recoveries were all reversed has no such date, so the tile reads "nothing posted yet" (or "nothing deposited yet"), never "since" the undone entry's date. (recoveredPeriods in apps/worker/src/reconcile/statements.ts; the design's F8 and HOM-02 now read "since its first counted entry that stands".)

## engine-r1-E2, one sentence for Decision 8
practiceLedgerTotals and recoveredPeriods total entries through one pure function, ledgerTotalsOver (statements.ts), so the tile's to-date and quarter figures cannot drift from every other period total.

## engine-r3-R2, for Consequences (verdict's sentence) and a Lane A follow-up
A line that a partial recoupment put back to actionable counts its whole variance in the figure, in the case's stored ask and in a packet, until Lane A defines a line's remaining ask (follow-up).
Follow-up (Lane A, an additive migration): a SQL function line_remaining_ask_cents(case_line) returning greatest(variance_cents - the line's standing net approved (approved entries less recouped entries and less the reversals of those approvals), 0), used at once in ACTIONABLE_NOW/ACTIONABLE_NOW_OF, in case_rules() for actionable_cents and in the packet builder's per-line ask (packets/records.ts, html.ts, csv.ts); golden cases for a partial recoupment on a deposited line (asks 1800) and on a line approved but not yet deposited (asks 1800, not 3000).

## engine-r1-E1 (no ADR change needed)
Decision 1's promise ("never for a resolved case's payer approved or recovered lines") is now pinned by HOM-01's measured test: a written-off line and a line a person reopened to validated each stay out of the check. If the ADR names HOM-01's test, it may add: "measured with one line written off and one moved off actionable".

## Design / test-matrix wording (for whoever owns them)
- Design F8 and test-matrix HOM-02: "since its first counted entry" becomes "since its first counted entry that stands".

# ADR 0082 sentences from the screens part (hom-fix-screens)

## engine-r1-E3 with ux-r1-UX-R1-01, for Decision 5 (replace its last sentence) and Consequences line 147
Decision 5, in place of "...and is negative when nothing is left to pursue.":
"The case page's "Net expected value" becomes `netExpectedValue(actionableNowCents, pursuitCost)`, the audit report's rule already, only on a case still being worked with a line in the actionable figure and a pursuit estimate; it is negative there when pursuit is not worth it. On a resolved or closed case it is not shown: nothing is being pursued, so the page reads "— (the case is resolved or closed; nothing is left to pursue)". With no pursuit estimate it reads "— (not estimated)". On a case still being worked whose figure holds no line it shows no amount and says why: "Not computed: no line is in the actionable figure now (out of the figure: …)", or "Not computed: every line is written off" (CaseSummary.netExpectedState, netExpectedOf in apps/web/src/lib/triage/queries.ts)."
Consequences line 147, in place of "The case page's net expected value can be negative: nothing left to pursue costs the pursuit.":
"The case page's net expected value can be negative on a case still being worked whose remaining lines are worth less than the pursuit; it is never shown as the whole pursuit cost lost on a resolved or closed case, or on a case with no line in the figure."
Follow-up (predates this PR): the audit report's per-case "Net expected" column (apps/worker/src/report/content.ts:906, html.ts:215) gets the same rule.

## engine-r1-E4 (session disposition: put it in ADR 0082, list reconciliation-001 as a follow-up after #42)
(The docs part owns this; nothing from the screens part.)

## ux-r1-UX-R1-02 and ux-r3-ux-r3-02 (Payer approved notes), if the ADR quotes the notes
Both Payer approved notes now say the figure is cumulative ("to date") and give the proof level's rule, never a status: Reconciliation "what payers agreed to pay to date, never the patient’s share; only deposited cash counts as recovered" (as long as the old note, so the six tiles keep one height; the Deposited tile beside it says how much has come); the home "what payers agreed to pay to date on the lines they corrected, deposited or not, never the patient’s share; only deposited cash counts as recovered" ("posted" at the posted proof level). The old "counted as recovered only once it is deposited" read as money still to come beside a smaller Recovered after a takeback. (Design line 198 and F6 change the same way.)

## ux-r3-ux-r3-01 (Recovered tile before its first entry), for Decision 8 / design D7 lines 161-162 and row 313
Before its first counted entry the tile reads "to date, none yet: cash posted, …" at either proof level (no cash verb in the period, since the cash words follow it). NOTE to the money part's engine-r2-R1 sentence above: replace its "nothing posted yet" (or "nothing deposited yet") with "none yet". Also the comment at apps/web/src/lib/dashboard/queries.ts:62 still says ("nothing posted yet" or "nothing deposited yet"): it should say ("none yet") — that file is not the screens part's.

## ux-r2-ux-r2-03 (proof level's words)
proofLevelWords('posted') is now "posted, proved by the posting export, as no deposit data is supplied" (no parentheses of its own, so "$0.00 (cash posted, …)" never nests). It shows on the home tile, Reconciliation, the case page, the ROI list and detail and the posting template page.

## ux-r1-UX-R1-04 (quarter key whole)
The Recovered tile's quarter key renders in a whitespace-nowrap span (ADR 0078 Decision 1), as WholeDates keeps a date. Follow-up: widen WholeDates (components/dates.tsx) to quarter keys, /(\d{4}-(?:\d{2}-\d{2}|Q[1-4]))/, for the anomalies page (:49, :192) and reports/display.tsx:224; optional e2e at 820 px.

## ux-r1-UX-R1-05 / ux-r2-ux-r2-02 / ux-r2-ux-r2-06 (line words)
The out-of-figure causes are listed in words ("… current and 2 lines moved on past actionable") and sit in parentheses on the case page and packet builder ("0 of the 3 lines not written off (out of the figure: …), as of 2026-11-01."); a written-off case reads "no line (all 3 lines written off)" on its page and "none (all 3 written off)" on Cases, never "0 of 0"; every count is in the mono face (<Counted/>). PR body lines 34-35's example words change to the same form.

## ux-r1-UX-R1-07 (ROI note)
ACTIONABLE_OPEN_NOTE now ends "The figure is not recomputed later from the cases it counted." (one wording for the web page, the PDF and a statement with no case). ADR line 101 needs no change.

## ux-r3-ux-r3-03 (ROI case links)
The ROI statement page names each case link by its place, "Case 1 of 3". Follow-ups: the PDF (apps/worker/src/reconcile/statement-html.ts:117) still prints raw case ids; naming by payer and plan needs statement.links.actionableOpen to carry them.

## ux-r1-UX-R1-03 / ux-r2-ux-r2-01 (HOM-04, test matrix HOM-02 and HOM-04) — for the docs part
- test-matrix HOM-04 (and synth matrix.ts HOM-04 text): name the exact words the browser world gives: Actionable "$0.00", "what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current", and $0.00 on Cases, the case page and the statement.
- test-matrix HOM-02 (docs/product/test-matrix.md:386 and packages/synth/src/cases/matrix.ts:545): "no read text of the home, Reconciliation, the case page or the statement says stage five" becomes "… says a stage number (stage five, stage-five or stage 5), except the home's help (components/help.ts, a #42 file; follow-up after #42)"; "or nothing yet at the proof level" becomes "or none yet".
- PR body line 111: the browser journey gives $0.00 with 1 line out of the figure (pricing no longer current); the db test (reconciliation-routes.db.test.ts:420) gives $30.00 on 1 line.
- Follow-up after #42: components/help.ts:10 "stage-five"; reconciliation.spec.ts pins it as the one known exception and fails once it is removed.
