# i126d-rv-money-1 progress
started; clone at r4-money-1, HEAD 0755a533b4966d3c9576bda8fe2f44d3a9ae322f
## checked
## found

- read: interest.ts (ledger), interest-chains.ts, remittances.ts interest path, LED-23/24 synth, todo/contested/fix-round
- hypothesis H1: mayYetHold (b) only sees claim matches standing at the pass; a later person's match (matchClaimAction) of the take-back chain's claim to a line the payment already reached -> take-back unwritable -> above cash. To verify.
- FOUND H1 (confirmed, db test zz-h1 in clone, log progress/i126d-rv-money-1-h1.log): P (C with other CLP01, no F8, L6 -5.40 naming C) -> X (B auto-matched L1/L2 + reversal of C linked, L6 -0.60) -> person matchClaimByHand(C, L1/L2) -> reconcile: interest 1140 vs cash 600, stable. mayYetHold false at X's pass (C root not reversal, no claim match yet).
- checked: Stryker money-ledger on head 0755a533 CI: interest.ts 100% (336 killed, 0 survived); survivors only in untouched files.
- checked: 0755a533 comment/test-name only; 8ea33e13 code diff; 8a6d0f26 holdings equivalence (held/lineHeld same as old heldInterest; new entries added after addInterestMatch).
- checked: order-independence property hardcodes mayYetHold true in both passes -> cannot see H1 (fold into H1).
- checked: 7dcca319 header/runbook/ADR comment-only, accurate; LED-01..18 fixtures, golden, pricing, packets unchanged; remittances.ts hunks all in interest path.
- candidate F-B: waiting is silent (no count/log/screen); screen note display.tsx:187 says interest counted as a check pays it (PLB L6); (b) holds unrelated patients' payments forever when take-back chain was lowered by a specialist (cut short, nothing more can arrive). verifying unit-level.
- FOUND F-B (unit-confirmed, zz-fb.test.ts.txt): take-back cut short (holding lowered to 3.00 of 5.40, chain keeps case-line claim match) -> another patient's +6.00 on L3 never written over 4 passes; nothing records/shows it; display.tsx:187 note contradicts.
- evidence copied to progress/i126d-rv-money-1-*.txt; db tp_i126d_rvmoney1_1 dropped; clone removed.
- DONE: findings H1 (should-fix), F-B (should-fix).
