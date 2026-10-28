# dlr-fix-docs progress (records builder)
- started 2026-10-27; nothing edited yet
- read: findings, verdicts, ADR 0079, design §3-6, dlr-fix-api.md, progress of core (DONE), letter (DONE), downloads (e2e run 1 in flight at 20:34)
- read code as built: forget-refusal, refusal-notice, download-refusal(.tsx, -words.ts, .ts keptCodes), download-link, letter(+marks, +contract-check), receipts, uploader, packet/review/reports-review pages, e2e steps
- facts for the ADR: equal-permission return pages' Forbidden branches have NO ForgetRefusal (9 pages; downloads builder left them); reports review checklist + packet page export-history links are plain links (state lost on a refused file, as before); zip's ReceiptList downloads in place (own DownloadLinks)
- matrix/test-matrix/registry are #42 files; DLR rows are ours. Plan: DLR-04 assertion changed in substance -> update both; DLR-03 maybe
- NEXT: edit ADR 0079 (header, D3, D4 refinement, D5 sub-bullets, alternatives, consequences, not verified, revisit when)
- ADR 0079 edited (first pass): header deciders; D3 opening (words module), wait (waitMinutes), kept values (SEC-01); table row upload report (UX-DLR-13); D4 refinement (UX-DLR-02 DownloadLink + beforeunload); D5 split into The notice (UX-DLR-08) / Out of the address bar (UX-DLR-01, SEC-02, UX-DLR-14) / A page the person cannot open (UX-DLR-05) / Coverage's letter (UX-DLR-03,04,06,07,09,10,15); alternatives (+9); consequences (R16 rewrite, plain links, 9 equal-permission pages, crafted link + guard heuristic, tests); not verified (+2, UX-DLR-12 note); revisit (UX-DLR-11 merge note, DownloadLink pages, UX-DLR-13)
- NEXT: proofread ADR; test-matrix DLR-04 (+DLR-03?) + matrix.ts; synth --all under lock
- ADR proofread pass 1 done (D4 focus note, D5 'A page the person cannot open' rewritten, analyst wording, guard heuristic, revisit wording)
- test-matrix.md + matrix.ts DLR-04 assertion replaced identically (script scratchpad/dlr-docs/dlr04.py); DLR-01..03 unchanged (no substance change); registry.ts untouched
- NEXT: pnpm synth --all under lock; confirm only fixtures/synthetic/DLR-04/expected.json changes; fixtures test
- 20:44 pnpm synth --all (flock): exit 0; "240 case(s); 1 file(s) written, 631 unchanged, 0 removed" + EMR "0 written, 16 unchanged"; git: only fixtures/synthetic/DLR-04/expected.json changed (1 line)
- 20:45 vitest --project unit packages/synth/src (flock): 13 files, 185 passed (incl. fixtures.test 'holds every row of test-matrix.md word for word')
- eslint matrix.ts exit 0; tsc packages/synth exit 0; tsc apps/web exit 0
- NEXT: lint:copy (docs?) check; re-read downloads progress at end; final proofread; report
- 20:4x downloads builder DONE (e2e run 2 passed); ADR matches what was built (DownloadLink on receipts' Report + export review PDF/CSV; ForgetRefusal on packet, export review, reports review Forbidden; 9 equal-permission pages without it, recorded in Consequences)
- final proofread done; files changed by this part: ADR 0079, docs/product/test-matrix.md (DLR-04), packages/synth/src/cases/matrix.ts (DLR-04), fixtures/synthetic/DLR-04/expected.json (generated)
## DONE (records part). No commit, no push.
