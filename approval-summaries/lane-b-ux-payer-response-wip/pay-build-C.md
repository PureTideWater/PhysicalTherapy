# pay-build-C progress (slice C: response + submission, server and page)
Started 2026-10-28. Reading design.
- Design read in full (1-9). Slice B's response-letter.tsx and uploader changes and uploadGate already present at start.
- Decision: ResponseLetters type defined in lib/packets/submissions.ts too (lib never imports components); proposal: B re-exports it from lib.
## Files
- [ ] lib/packets/submissions.ts
- [ ] lib/routes/submissions.ts
- [ ] submissions/page.tsx
- [ ] e2e/packets.spec.ts
- [ ] e2e/unattested.spec.ts
- [x] lib/packets/submissions.ts: ResponseLetters, RESPONSE_LETTERS_LISTED, RESPONSE_DOCUMENT, DOCUMENT_USE_LOCK, responseDocuments(scope,{practiceId,caseId,requestId}) grouped+audited, responseDocumentChoosable, documentsNamed (audited) -> ResponseView.document
- [x] lib/routes/submissions.ts: channel/kind/documentId messages; letters/upload/roles on page data; RESPONSE_LETTER_REFUSED; check before recordResponseOnce
- [x] submissions/page.tsx: Channel placeholder; card description; empty state gone; ResponseLetterField first (pageCsrfToken, roleNames(roles)); h3 "What the letter says"; Response own row + placeholder + RESPONSE_HINT; log links letter receipt (data-response-letter) + Hash; KIND_TEXT removed (LETTER_KIND_TEXT for log words)
- [x] e2e/unattested.spec.ts: Channel chosen
- [x] e2e/packets.spec.ts: header; Channel assert+choose; response step rewritten (4.6 steps 2-9, plus a positive control on /contracts in a second page before the record)
- eslint on 5 files: PASS (after making letterId const). Prettier not the repo's formatter (base files fail it too): ignored.
- apps/web tsc (hook): only error left = workbench-routes.db.test.ts:618 page.documents (slice E's file)
- pnpm typecheck (lock): 21/22 pass; apps/web fails ONLY at workbench-routes.db.test.ts:618 (page.documents; slice E's file, 4.5 says it reads page.letters.unused). Log: progress/pay-build-C-typecheck.log
- Slice B already re-exports ResponseLetters from lib/packets/submissions (my proposal done by B).
- Slice D's DOCUMENT_USE_LOCK (tagging.ts:48) is the same statement as mine: consistent key.
- db run 1 started (bg, lock): route-tests.4/5/6 (submissions page/log/respond) + unattested-submission-routes + pricing-current-routes. Log progress/pay-build-C-db1.log
- e2e runner: scratchpad/payC/e2e.sh <run> <args> (DB tp_e2e_payc, port 4791). Run after db run 1.
- db run 1 DONE: 5 files, 1785 tests PASSED (route-tests.4/5/6 incl. the respond sample with the seeded stored letter; unattested; pricing-current)
- lint:copy (lock): PASS (521 files)
- Next build ignores *.test.* type errors (runTypeCheck regex), so E's pending test file does not block the e2e build.
- e2e run-1 started: payC/e2e.sh run-1 e2e/packets.spec.ts e2e/unattested.spec.ts e2e/viewer-phi.spec.ts --workers=2 (log scratchpad/payC/e2e/run-1.log)
- e2e run-1 FAILED TO START: next build "Failed to type check" on workbench-routes.db.test.ts:618 (slice E's file; Next 16 here does NOT skip *.test.* errors, my earlier note was wrong). build log payC/e2e/build-1.log. e2e WAITS ON SLICE E updating :618 (page.letters.unused).
- slice E changed :618 (2026-10-28); e2e run-2 started (same specs)
- e2e run-2 DONE 06:40:15-06:42:58Z: 4/4 PASSED (packets milestone 8 incl. new response step 1.5m; packets deadline; unattested; viewer-phi). Log payC/e2e/run-2.log
- CLEANUP: DB tp_e2e_payc dropped, /tmp/tp-e2e-tp_e2e_payc-* removed; final pnpm typecheck (lock) PASSED 22/22; gitleaks 8.24.3 on 5 files: no leaks
## STATUS: COMPLETE
