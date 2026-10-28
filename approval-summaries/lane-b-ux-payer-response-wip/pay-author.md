# pay-author progress (design author, UX PR 10 co-001/ux-payer-response)
Started 2026-10-28. Output: /home/user/ops/designs/lane-b-ux-payer-response.md
## Status
- [x] read inputs
- [x] section 1 defects (written to design file)
- [x] section 2 decisions (2.1-2.9 written)
- [x] section 3 files/slices
- [x] section 4 tests
- [x] section 5 docs (ADR 0085 outline)
- [x] section 6 strings/screenshots
- [x] section 7 no migration/proposals
- [x] section 8 risks (complete; verified)
## Notes
- Verified @165c599: submissions/page.tsx :268 desc, :271-276 empty state, :277 ActionForm, :282-292 row, :283 Response, :284 Received on, :293-308 Document; :75 Channel; :388 '(with its document)'.
- routes/submissions.ts: :106 documents read canLog; :195 PERSON_RESPONSE_KINDS; :225 kind enum; :227 documentId opaqueId; :235-238 amount rule; :248-251 submission check; sample :270 uses refs.responseDocumentId (packet-world.ts:117-121: clean stored payer_letter -> passes new check).
- lib/packets/submissions.ts responseDocuments :330-338, query :332-334 (no status filter). recordResponseOnce :364-376.
- contract-queries.ts CONTRACT_KINDS :16; SELECTIONS :340-344; listContractDocuments :347-359 where :348.
- payer_response_belongs.sql: practice check at :39-41 (scout B's :44-46 wrong). payer_response RLS tenant only (migr 20261023090000:874-880), select open to every role in scope.
- intake.ts: clean verdict :249 before settle/claimBytes :250-251; claimBytes :124-139 dedupe across kinds.
- uploader.tsx: props :56-72; kind state :142; request :205-207; settledAll+refresh :253-259; kind select :319-340; input multiple :379-394; Choose files type=button :395; Retry no type :435; batch card :413; receipts :453-458. post() makes own requestKey :97.
- limits.ts payer_letter pdf+zip :42; uploadsPage gate :107-117.
- DECISION so far: take uploader (a)-(d) under standing rule, flag vs prs.json leavesOut.
- case page: write-off details :216-226, Reason :222, Window ends :187, written-off line :203, reopen :227-237. triage.ts WRITE_OFF_CONSEQUENCE :455-456, writeOffLineAction :464-495 (input :471, caseLineState :478, branch :482-490), reopen check :517-519. queries.ts caseLineState :678-690 (window_passed :681), caseDetail :592, :631-632. cases.ts WRITE_OFF_REASONS :93, TEXT :96-102, writeOffSchema :105-111.
- case_rules.sql :53-71 (partial :67-68, ELSE resolved :69-70; lines decide first :53-58). responses.ts approveFromResponses :46-86 (written-off skipped :54-55).
- abstraction.ts: tag :159-174 (tagDocument), amend :395-415, supersede :417-440 take documentId. tagging.ts doc check :40-46 -> NotFoundError. No detach path in web.
- workbench-routes.db.test.ts: WINDOW test :313-331; submissions block :598-652 REUSES one letter for several responses -> predicate must NOT exclude letters named by responses.
- open PRs: #75 (uploader rewrite: startingKind, KindField w/ required, held files + Upload button; also contracts/page.tsx), #78 (uploader leave guard, receipts.tsx, uploads.ts), #81/#82 shared docs only. #42 open at 6f23c42 (REST).
- DECISIONS: (1) enabled empty first option + defaultValue="" (both selects + Document + Channel). (2) one pure module lib/cases/write-off.ts (reasonsFor + refusal msgs) used by page+route. (3) response doc predicate = top-level, payer_letter|other, clean, stored, no contract_version names it; ONE fragment for list+handler; messages: contract-source specific + generic. (4) tagging refuses a doc a response names (tagging.ts) + amend/supersede (abstraction.ts). (5) uploader inside form, client ResponseLetterField child of ActionForm (no beforeSubmit; setCustomValidity while scanning + status line). (6) letter group FIRST in form. (7) uploader: one-kind no select, Retry type=button, onSettled, single. 
- MORE DECISIONS: Channel included ('Choose the channel'; e2e packets.spec:401-407 + unattested.spec:115 pick channel). One generic doc refusal msg 'choose the payer’s letter from the list, or upload it here'; empty doc 'choose the payer’s letter' via z.uuid(msg). Strict separation both ways (response excludes contract sources; tag/amend/supersede refuse response letters); edge -> Waiting on someone (product) + risk. Uploader: (a) one kind no select (b) Retry type=button (c) onSettled (d) single; NO headingLevel (proposal for UX PR 47). Gate: extract uploadGate() in lib/routes/uploads.ts, used by uploads, submissions, contracts (contracts panel gains suspension). Contracts page pointer sentence (contracts/page.tsx, #75 overlap rule 6). Log names each response's letter with receipt link (audited reads purpose case_review). New files: lib/cases/write-off.ts(+test), components/packets/response-letter.tsx(+browser test), harness fixture. All db tests in workbench-routes.db.test.ts (specialistOf helper). Write-off hint when WP not offered. ADR 0085 warranted (D1-D4).
- Packet attachable list (lib/packets/queries.ts:183-191) same no-status defect -> proposal.
- Tour: p.abstraction.default (tour.spec.ts:2145) changes (PACKETS letter leaves); p.submissions shots 2442-2459; p.case write-off-open 2312-2315. New cap: p.submissions interaction:letter-scanning (no worker -> stays received). notReached no-letter.
- NEXT: write design file sections 1..8.
- VERIFY PASS done: pr42 intersection = 3 shared docs only; no file in two slices; citations corrected (packets.spec ranges, tour :2326/:2453, uploads.ts:117/:131, field.tsx:233, matrix.ts:170-181).
- Design file complete: /home/user/ops/designs/lane-b-ux-payer-response.md (~1160 lines). Remaining: return summary.
