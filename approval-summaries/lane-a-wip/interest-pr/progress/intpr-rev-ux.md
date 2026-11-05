# intpr-rev-ux (UX and brand review of PR #126, head c49367c5, base f7d609cc)
Started 2026-11-05. 
## Status
- [x] clone scratchpad/revint-ux at c49367c5, install rc 0
- [x] read brief, tour README (From another lane), design 6.3, 7
- [x] read UI diff (page.tsx, display.tsx, queries.ts, roi page, specialist.ts, statement-html.ts)
- [x] base-src (scratchpad/tour-int/base-src at f7d609cc + LED-23/24 fixtures copied in, untracked) install rc 0
- [x] capture spec written: tour-int/templates/{head-part,body-part}.ts -> tour-int/{base,head}/capture/interest.spec.ts; base port 4995 db tp_intpr_tour_1, head port 4996 db tp_intpr_tour_2; scripts tour-int/build-both.sh (build-only both, under lock), tour-int/drive.sh (reserve + run-int.sh per side)
- [x] builds base 06:09 head 06:10 rc 0
- [x] capture base 06:11-06:14 (39 shots, 0 skipped; base credits interest twice: W1 entries 240,300,240,300; base accepts the -0.01 adjustment), head 06:14-06:17 (39 shots, 0 skipped; adjust refused, focus to amount input). Servers stopped, ports 4995/4996 free.
- [x] dbs tp_intpr_tour_1/2 dropped 06:18, /tmp/tp-e2e-tp_intpr_tour_* removed
- [ ] shots, manifest under scratchpad/revint-ux-shots
- [ ] drop dbs
## Words checked (code)
- interestWords, ReportedInterest rows + note, totals note, ROI note (page + statement-html), ADJUSTMENT_CONSEQUENCE: = design 7 word for word
## Candidates
- C1 (should-fix?): ReportedInterest rows sit in the Interest column, same style and gap as the Interest list, no label of their own (display.tsx:173-181; page.tsx:217-220); the note "in the list above" (display.tsx:183) points to the nearest list, which is the AMT I rows; in the reported-only state there is no Interest list at all ("No interest paid." is a <p>), so "the list above" can only be the AMT I rows, counted nowhere. The only $ figure in the Interest column is the claim's reported amount (match rows carry none). Words = design 7 (fix needs section 7 amended). Verify by shot.
- refusal on amount = raw Postgres message (house pattern specialist.ts:154-158); says the rule, no next step (baseline class) -> polish at most
- codes (PLB L6)/(AMT I) in sans: house pattern (AMT B6, PLB WO) -> not a finding
## Findings so far
## Not seen
## Shots viewed (head and base): recon int-paid/reported-only/taken-back line crops 1280+390, totals tile, ledger-review refused 1280, adjust-open 390, ROI statement taken-back 1280, ROI list 1280, printed ROI p2 (head). facts.json: no page wider than 390 on either side; note contrast 6.43 light / 8.39 dark; head refusal focus -> amount input, role=alert summary "Not done / Fix the field listed here, then try again."
## Findings (as of 06:30)
F1 should-fix: reported AMT I rows not set apart from the Interest list (display.tsx:173-185, page.tsx:217-220); "in the list above" points at the AMT I rows; reported-only state has no Interest list. Shots head p.reconciliation.int-paid.1280(.line1), int-reported-only.1280/.390(.line1), int-taken-back.390.line1
F2 should-fix: Adjust offered on a paid interest entry of a line whose interest the payer took back: no input can succeed (floor below, entry's own amount above); refusal says "Fix the field listed here, then try again." (queries.ts:374-375; abstraction/ledger/page.tsx:78; db test asserts adjustable true). Shot head p.ledger-review.int-adjust-refused.1280/.390
F3 should-fix (worsens baseline UX-153): longer interest words now break the matched timestamp at its hyphen at 1280 ("2026-" / "11-05") (head p.reconciliation.int-paid.1280.line1; base whole) and split "(PLB" / "L6)" at 390 (head int-taken-back.390.line1). page.tsx:87 utc() no nowrap; display.tsx:160,178,183
F4 polish: ROI list "Interest" column (roi/page.tsx:71) now holds a net that can be negative (-$5.40, head p.roi.int-list.1280); statement calls it "Interest, net"
Pre-existing (not the change's): straight apostrophe in Postgres refusals beside curly in consequence (house); Recovered (deposited) -$54.00 on a reversal with nothing deposited (base too); quarterly Q3 statement written before the take-back shows $0.00.
## Next: manifest + copy shots to scratchpad/revint-ux-shots; cleanup (clones keep? remove base-src build); return
## 06:40 done
- tiles: tile.py (ops, read-only) base 130 tiles / head 135 tiles; copied to scratchpad/revint-ux-shots/{before,after} with png, tiles, pdf, pdfpng, facts, shots.json, ids.json; manifest.json (39 ids)
- pnpm lint:copy on c49367c5: rc 0, 585 files read
- cleanup: dbs 0 left, ports 4995/4996 free, tour-int/base-src removed, worktrees interest/ops/PhysicalTherapy/sc1b/ss01 0 changed
- F2 fix chosen: map constraint ledger_interest_line_floor in specialist.ts:154-158 to words with what happened + next step (section 7 amended; Postgres text kept)
DONE: returning structured result
