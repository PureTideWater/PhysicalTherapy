# pay-revise progress (design revision for UX PR 10 review)
Started 2026-10-28. Design: /home/user/ops/designs/lane-b-ux-payer-response.md
Backup of original design: /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/pay-design.before-revise.md
## Status
- [x] read design (1161 lines), review.md (273 lines), pay-review.md, pay-author.md
- [x] verify code for each finding (all confirmed; see notes)
- [ ] edit design per finding (mark each [x] when its edits are in the file)
- [ ] add section 9 "Review and dispositions"
## Verified facts (this run)
- field.tsx:188-192 ChoiceGroup + optgroup :274; S1 test reuses letter in ONE case (:616 fax, :633 portal, :644 accepted).
- form-issues.tsx:332-349 touched only on 'input'; uploader onDrop :279-283 (no input event); uploader pending :249-252 counts only SENT files -> (c) must report uploading too.
- workbench.ts:92,:117 advisory locks; contracts services.ts:269 'contract_version:' lock; recordPayerResponse runs in web scope (same txn); tagDocument -> createDraftVersion/attach (version names doc).
- uploader h2 :314, batch CardTitle h2 :415 (CardTitle h2 only, card.tsx:19-21).
- case_rules.sql: lines decide first; ELSE resolved (denied w/o reopen -> resolved too).
- #75 871faff: CHOOSE_KIND_PLACEHOLDER disabled (:93-94,:349-350), controlled select, OUTSIDE a form; initialKind keeps Uploads' 835 (:76-80).
- #42 46974a2, 217 files: intersection = test-matrix.md, matrix.ts, registry.ts only (reconciliation.ts NOT #42's). New open PR #83 (ux-screening-result-tables): shares only the 3 docs; changes e2e/a11y.ts (+55) which 4.7 calls.
- #78 also creates uploader.test.tsx.
- permissions.ts:200-204 specialist no practice.open; abstraction version page rate_record.edit shows pages (abstraction.ts:130-158).
- payer_response_belongs.sql doc check :39-41, remittance :42-44.
- formatBytes(2 GiB)="2.0 GiB"; receipt page h1 "Receipt {id8}" (uploads/[documentId]/page.tsx:269).
- case lines: inserted actionable (window known+open, windowRuleComputed) or struck window_passed -> no-window branch unreachable (actionable.ts:59-65).
- tour: CONTRACT_UPLOAD regex :616 matches card TITLE -> do not change title; error act :2445-2459; notice :2460.
- reconciliation.ts:114 BAA-only gate (not #42's; reconciliation/page.tsx is #75's, route file is not).
## Dispositions (decided)
- S1 APPLY: three optgroups (no response yet / this case's / other cases'), ordered by group then newest, limit 50; route unchanged; duplicate-chosen words for other case; CAS-48 + 4.5 + 4.4.
- S2 APPLY: field dispatches bubbling 'input' from its select when a batch appears and when it chooses; (c) redefined: size/inFlight/settled (inFlight includes waiting+uploading); harness drop-only test.
- S3 APPLY: ADR consequences corrected; 2.8, 8.1 residual stated; Lane A item 5 -> security item; PR description; stored-not-chosen words say where it goes.
- S4 APPLY: 'document_use:' advisory xact lock first in responseDocumentChoosable + refuseResponseLetter; Lane A triggers same key; 8.1 row.
- S5 APPLY (+): headingLevel?: 2|3 on Uploader (opt-in) -> h3; PLUS an h3 "What the letter says" before Response so fields are not captured by "This batch"; test.
- S6 APPLY (amended): "Every response is recorded for good. Accepted marks the case Resolved and Partially accepted marks it Partially resolved, unless a line has already reached Payer approved. At the next reconcile, the recovery ledger approves up to the amount below on the lines this submission asked for (Payer approved). Nothing is recovered until it is posted or deposited."
- S7 APPLY: "...its line under This batch says why."
- S8 APPLY: stored-listing (field's own refresh in a transition; custom validity kept with its own words) and stored-not-listed (validity cleared; reload words); harness case.
- S9 APPLY: harness adds Amount Field; Enter in Amount.
- S10 APPLY: tour act selects letter index 1 first; 4.8/6.2 say so; "(6.3)" -> 6.2.
- S11 APPLY (reconciled): D1 refined: enabled placeholder for a select in a form; a controlled select outside any form that holds its own action (#75 kind) may disable it; ADR names #75; 7.3 item 1 adds Uploads' 835 default (#75 keeps on purpose); Waiting on orchestrator.
- S12 APPLY: kinds map at contracts/page.tsx:217 labels payer_letter "Payer’s terms or policy letter"; title/heading kept (tour regex, #75); 7.3 item 4 removed.
- N1-N16: all APPLY (N9 keep defensive branch, unit-only; N11 note; N12 take reconciliation.ts into uploadGate; N15 cap after notice).
## Edits done (in design file)
- [x] header: #42 46974a2/217, "Revised after the review" para; contents 9; intro mentions S12 relabel
- [x] N1 (1.5 item 3), N2 (1.5 item 1)
- [x] S11 part 1: 2.1 "Where the rule applies, and #75's kind select"
- [x] N9: 2.2 "The no-window branch is defensive"
- [x] S6: 2.4 hint + clause table
- [x] S5: 2.5.1 order + Headings para (h3 "What the letter says"), 2.5.4 (e) headingLevel
- [x] S1 part: 2.5.1 ResponseLetters groups + optgroups; N7 "(uploaded here)"; N10 status line from first render; N13 hint by canUpload&&gate; N4 "2.0 GiB" + (d) single sentence
- [x] S8: 2.5.2 stored-listing/stored-not-listed rows; S2: 2.5.2 "form marks itself touched" + 2.5.3 bullet + (c) redefined size/inFlight/settled; N11 focus/announcements para
- [x] 2.5.4 decision "all five"
NEXT: 2.5.6 (N5 log link), 2.5.7 (S4 lock, N8, S12), 2.5.8 (N12), 2.6 (S1, S4), 2.7, 2.8, 2.9, sec 3..8, sec 9
- [x] N5 2.5.6 link words; S4 2.5.7 lock bullet; S12 2.5.7 relabel (CONTRACT_KIND_LABELS); N12 2.5.8 reconciliation.ts
- [x] S1 2.6 groups + why; S4 2.6 lock in responseDocumentChoosable; 2.7 rows (S1 x2, S4, S5 x2, S11)
- [x] 2.8: S2 file-name row, S1 new row, S4 in contract-source row, S3 residual row
NEXT: 2.9 (S1 money note), sec 3 files, 3.7 (#75 S11, #78, #83, #42), 3.8, sec 4, 5.1 ADR, 6, 7.2/7.3, 8, 9
- [x] 2.9 S1 note; sec 3 preamble (#42 217); 3.2 (uploader a-e, harness Amount S9, reconciliation.ts N12); 3.3; 3.4 (S12, S4); 3.6 size ~750; 3.7 (#75 S11, #78, #83 new, #42 sha, ids check: no CAS-45..48, no ADR 0085); 3.8 (S4, S3)
NEXT: sec 4 (4.1 CAS-46/47/48 text; 4.4 items; 4.5 S1/S4; 4.6; 4.7 N11/S5; 4.8 S10), 5.1 ADR, 6, 7.2/7.3, 8 (N16), 9
- [x] 4.1 CAS-46/47/48 rows; 4.2 CAS-48 assertedBy + browser test; 4.4 items 1-13 (S9, S2, S5, S8, S1, N7, N10, N13); 4.5 (S1 group test, S4 lock test via pg_locks, :618 shape)
NEXT: 4.6 e2e, 4.7 (N11, S5), 4.8 (S10), 5.1 ADR, 6, 7.2/7.3, 8 (N16), 9
- [x] 4.6 e2e steps 2,5,7,8; 4.7 (N11, S5 headings asserted, #83); 4.8 (S10 tour act; (6.3) removed)
NEXT: 5.1 ADR (D1 S11, D3 S2/S5, D4 S4, Consequences S3, Not covered), 6.1 strings, 6.2 shots (S10, N15), 7.2 (S4, S3), 7.3 (S11, N14, remove 3&4), 8.1 (N16, S3, S4), 8.2, 9
- [x] 5.1 ADR: intro (six selects, #75), D1 refined (S11), D3 (S1 groups, S2, S5, N10), D4 (S4 lock, S12), Consequences (S3), Not covered, Revisit
NEXT: 6.1 strings, 6.2 shots (S10, N15), 7.2 (S4, S3), 7.3 (S11, N14, remove 3&4), 8.1 (N16, S3, S4), 8.2, 9
- [x] 6.1 strings (S1 groups, N7, N13 hints, S8 states/bubbles, S1 dup-other, N6, S7, S3, N4, S5 h3, S6 hint, N5 log, S12 kinds, N8 tagging, N12 recon panel, N9 defensive); 6.2 (S10 error shot, default, contracts, N15 cap placement)
NEXT: 7.2 (S4 item 4, S3 item 5), 7.3 (S11 item 1, N14 item 2, remove 3&4), 8.1 (N16, S3, S4, rows), 8.2, 9
- [x] 7.2 items 4 (S4 same key) and 5 (S3 security); 7.3 (S11 six selects incl Uploads kind, N14 item 2, old 3&4 taken here)
NEXT: 8.1 rows (S3 residual, S4 lock, N16 cites, S1, S8, #83), 8.2 (orchestrator: S11 #75, uploader five, reconciliation.ts, S12 contracts page; Lane A item 5 security), then section 9 table, then final consistency grep
- [x] 8.1 rows (S3, S4, S8, S1, N16 cites, #75 merge tests); 8.2 orchestrator (i)-(v) + Lane A security; new 3.9 PR description (S3)
NEXT: stale-term grep + fix; section 9 table; final read of changed parts
- [x] section 9 written (S1-S12, N1-N16, found while revising, reserved numbers)
NEXT: final verification pass (grep markdown table pipes, headings, read changed areas once)
- [x] final checks: tables consistent (python), no model names, header + sec 9 departures list aligned. DONE (1499 lines). Remaining: return summary.
