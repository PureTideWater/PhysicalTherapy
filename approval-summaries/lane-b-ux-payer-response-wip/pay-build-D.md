# pay-build-D progress (slice D: the contract side, design 3.4 with 2.5.7)
Started 2026-10-28. No earlier progress file.
- Design read in full (sections 1-9).
## Files
- [x] lib/contracts/contract-queries.ts: NOT_A_RESPONSE_LETTER exported (doc), added to listContractDocuments WHERE; its doc says "no payer response names"
- [x] lib/contracts/tagging.ts: DOCUMENT_USE_LOCK (same statement as slice C's private one in lib/packets/submissions.ts), RESPONSE_LETTER_NOT_A_SOURCE (6.1 words), refuseResponseLetter(scope, practiceId, documentId) lock-then-check, InputError on documentId; tagDocument calls it after its document check; header doc sentence
- [x] lib/routes/abstraction.ts: amend + supersede call refuseResponseLetter when documentId given (before amendVersion/supersedeVersion); successorInput doc
- [x] lib/routes/contracts.ts: CONTRACT_DOCUMENT_KINDS doc; CONTRACT_KIND_LABELS; RESPONSE_LETTER_ELSEWHERE; ContractUploadSettings.gate: UploadGate, kinds carry `label` (so slice E's db test can assert page.upload.kinds label); contractsPage gate = uploadGate(scope, practiceId); header doc
- [x] app/p/[practiceId]/contracts/page.tsx: description + {RESPONSE_LETTER_ELSEWHERE}; kinds={upload.kinds}; KIND_NAMES import removed; doc
## Notes
- Edit hook typecheck reported e2e/packets.spec.ts(596,6) TS1472 (slice C's file, in progress) - not mine.
- Slice C's e2e/packets.spec.ts:602 already asserts option[value=payer_letter] text 'Payer’s terms or policy letter' - consistent.
## NEXT: pnpm typecheck (lock), eslint on 5 files, lint:copy, db tests contracts-routes / abstraction / models-routes, scratch db check of refusal+lock (delete after)
- RUN pnpm typecheck #1 (lock): only errors in slice E's workbench-routes.db.test.ts:618 (page.documents -> letters). None in slice D files.
- RUN eslint on 5 slice-D files: clean. lint:copy: pass (521 files). lint:logs: pass.
- RUN db contracts-routes + models-routes: 28/28 passed.
- Route-test partitions holding slice D routes: 2 (practice.contracts), 3 (.contract), 5 (.contracts.tag), 6 (abstraction.amend), 7 (abstraction.supersede), 8 (practice.abstraction), 10 (abstraction.tag)
- TEMP scratch db test apps/web/src/lib/routes/pay-build-d-scratch.db.test.ts (NOT a deliverable) -> DELETE IT if found on resume
- RUN scratch db check: 4/4 passed: (1) response letter A (world's responseDocumentId, recorded via recordResponseAction) leaves contractsPage.untagged (total -1) and abstractionPage.documents (specialist under support grant); terms letter T stays in both; upload.kinds labels [Contract, Exhibit, Payer’s terms or policy letter]; contractsPage gate == uploadGate. (2) tagContractDocument (manager), startAbstraction (specialist), amendVersionAction and supersedeVersionAction (specialist, signed-off version) naming A -> {status:'invalid', issues:[{field:'documentId', message: RESPONSE_LETTER_NOT_A_SOURCE}]}, uppercase ID too; no contract/version written; T still tagged ok. (3)(4) race: owner txn holds document_use lock on L and inserts a payer_response naming L; tag (and amend) on L waits (pg_locks shows the advisory lock not granted), and after commit is refused, no version names L.
- MUTATION: lock key changed to 'document_usX:' -> race test fails (no waiter seen). Reverted at once (grep confirms; statement identical to slice C's).
- Scratch file DELETED.
- e2e run-1 starting 2026-10-28T06:36:39Z: payD/e2e.sh run-1 e2e/contracts.spec.ts (E2E_DATABASE tp_e2e_payd, port 4784; log scratchpad/payD/e2e/run-1.log)
- RUN route-tests partitions 2,3,5,6,7,8,10 with -t "practice\.contracts|practice\.abstraction": 624 passed (3432 skipped by filter).
- RUN db coverage-in-effect + viewer-phi: 13/13 passed.
- RUN unit form-hints, type-scale, tables, http, registry, partition, tools/brand-copy: 344/344 passed.
- gitleaks 8.24.3 (.gitleaks.toml) on the 5 files: no leaks. #42 (46974a2, 217 files, REST): none of the 5 files.
- e2e run-1 NOT RUN: next build type-checks the test files and fails on slice E's workbench-routes.db.test.ts:618 (as slice C found, payC/e2e/build-1.log). contracts.spec.ts (the existing e2e over the Contracts panel) WAITS ON SLICE E. Slice C's packets.spec.ts step 8 asserts the label and sentence (CAS-48).
- RUN pnpm typecheck #2 (lock): only slice E's workbench-routes.db.test.ts:618 (2 errors). None in slice D files.
## STATUS: COMPLETE except e2e (waits on slice E). Proposal: one exported DOCUMENT_USE_LOCK (tagging.ts) imported by lib/packets/submissions.ts.
