# check-K-W-1 (adversarial checker round 1, slices W1/W2)
Status: started 2026-11-07. Clone /home/user/ux42-K-W-1 at origin/co-001/wip-ux-forms-after-42 (dab7d237).
- [ ] clone + install
- [ ] read design sections 2,3,5,6,8,10 for W1/W2
- [ ] diff W1/W2 messages old vs new
- [ ] checks
- [x] clone at dab7d237 + pnpm install (frozen) under lock
- [x] read design 2.4-2.7, 3, 6, 9
- [x] W1/W2 source diffs read; sign-in diff = 4 message lines only (verified git diff 31a7345f..HEAD); PHI detector call sites identical (grep diff), packages/observability untouched
- candidate findings: (1) uploads.ts formatProblem lower-cased but uploader shows route issues verbatim as list sentences (uploader.tsx:350,612,871) beside "File 1 is empty."; (2) declaredTypeProblem "File N is not a CSV: ..." (csv-exports.ts:48) reaches addIssue in uploads.ts:239 but guard can't see (lib/uploads not scanned, imported callee unresolved); (3) console-onboarding.ts:224 signedOn still 'a date (YYYY-MM-DD)' vs console.ts:831 new words; (4) LOCATION_WAITING "billing ZIP code" vs product "billing ZIP"
- [ ] brand rules read; guard mutation test; run W tests
- [x] W unit tests + guard + brand-copy scan: 10 files 152/152 (scratchpad kw1/w-unit.log)
- [x] guard mutation: 9 violating edits (settings NO_AT, console max, sign-in code, correspondence phone, compliance caps+stop, screening no_rows colon+upload again, account.ts, reconciliation, mapping) -> all 9 caught + upload-again + direct-call cases (kw1/guard-mutated.log); reverted, tree clean
- [x] legal surfaces: no marked file's words changed; SCREENING_ZIP_MESSAGES/address.ts/BOUNCE untouched
- [x] W db tests (11 files: uploads, sign-in, console, settings, onboarding, screening routes, pricing, mapping, reruns, support-mail, billing) 224/224 on 5433 (kw1/w-db.log)
- [x] old-literal grep across apps/packages/tools at HEAD: no stale pin of a changed message (kw1/old.txt)
- [x] payers: old schema gives field payers.0 for a 121-char name (kw1/payers.mjs), new gives payers; no red log for it
- findings final: F1 uploads formatProblem (should); F2 ADR 0077 "only colons" overclaim vs Refused: step refusals (should); F3 ADR 0037:210 full stop stale (should); F4 payers behaviour change no red-first (should); F5-F7 nits; OK summary
- [x] clone removed; DONE
