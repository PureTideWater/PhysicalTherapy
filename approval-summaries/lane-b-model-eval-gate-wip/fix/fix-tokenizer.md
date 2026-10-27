# fix-tokenizer progress (PART tokenizer; PR #75 fix round)

Started 2026-10-27. Worktree /home/user/contract-phi-check (clean at start, head 9b7eadfe).

## Status
- [ ] read findings F1 F2 F5 N3 N1(tokenizer) - in progress
- [x] read findings; scratch clone for integrated checks: scratchpad/phi/clones/fix-tokenizer (at 9b7eadfe, installed)
- [x] set v2 pages dumped: scratchpad/phi/tok/pages.json; alternatives measured: scratchpad/phi/tok/measure-1.txt
  - twin refusals 0 for head, f2, u0 (./_* no spaces), u1 (with spaces); u1 adds 77,754 prose runs over u0 (rejected)
  - new classes: decimal 1453 ids 0/0; slash dates as PCNs 267 ids 0 with rules / 9 without; as member IDs 17/17
- decision: U (universal ./_* exactly, no spaces) + P (practice's own stored separators) + F2 (invisibles ignored in gaps, minus is a dash)
- F5 design: someIdentifierRun(text, options, accept): per line NFKC, lazy token regex, ring of token starts, lengths filter, early exit
- N3: 000-area collides with the repo's synthetic TIN shape (00-NNNNNNN); plan 9xx area with group 00-49 (never SSN, ITIN or ATIN); 11-char IDs hold one of B/L/S/Z (never MBI)
- [x] redact.ts rewritten in W (JOIN widened, invisibles, storedSeparators, runIndex, someIdentifierRun streaming+hash index, identifierRuns via it; identifierPattern widened)
- [x] redact.test.ts rewritten in W; test-support/screen-bound.ts added (child bound through pagesName)
- [x] at head (clone C): 13 of 26 fail (log progress/fix-tokenizer-redact-head.log); in W: 25 pass + bound test pending patient-records request
- bench: scratchpad/phi/tok/bench-results.txt (16 MiB: head OOM at 560; new prose 0.9 s, dense 1.5 s twin, 6.9 s every-length)
- NOTE: Write tool turns \uXXXX into literal chars: post-process with python (done for redact.test.ts)

## Resumed 2026-10-27 19:15 UTC (second run)
- verified: W redact.ts/redact.test.ts/screen-bound.ts == clone C copies; request (tok/request/apply.py) applies cleanly to W's current patient-records.ts (records part's F3/F4/F7 edits)
- set v2 facts: decimals compact to <= 5 digits (decimal class vacuous at floors); 279 slashed tokens, all dates M/D/YYYY; no '_' or '*' runs
- N3: 000-area rejected (set v2 TINs are 00-NNNNNNN: 67 start 00-0, i.e. 000NNNNNN); use 9xx + group 00 (never SSN: area 9xx and group 00; never ITIN/ATIN: group 00)
- TODO now: requests.md section; contract-terms.ts doc comment; patient-twins (N3 + classes decimal/slashDate + separator twin); gate.golden; synth regen; mutation (N1); docs; report
- [x] requests.md: tokenizer section appended (patient-records.ts screenSet joins/index + pagesName streaming; apply.py)
- [x] clone C synced to W (19:19) + request applied: redact.test + patient-records.test 54/54 pass (bound: prose 806 ms, dense 1549 ms, heap 42->65 MiB at 96 MiB old space)
- [x] contract-terms.ts doc comment (screenContractPages' tokenizer reference) updated
- [x] patient-twins.ts: N3 (9NN00NNNN, 11-char holds B/L/S/Z), separators param on screenTwinIdentifiers, classes slashDate/dateMemberId/decimal; patient-twins.test.ts new (not yet run)
- measurements: tok/measure-2.txt, tok/measure-3.txt, surface (below)
  - twin ruled/pcn6/pcn10: 0 head and new; twin NO rules: head 0, new 3 (V03,L02,L04: slash dates as 8-digit PCNs; the date rule removes them)
  - N3: area000 holds 5 set-v2 TINs and refuses 3 docs (rejected); 9NN00: 0
  - classes new vs head (with/without rules): slashDate 0/9 vs 0/0; dateMemberId 17/24 vs 0/7; decimal 0/0 (kept 0: set v2 decimals <=5 digits); others unchanged; noSlash variant == head
  - separator twin [. / _ * # : + ,]: joins [#,:,+,,], ruled 0, pcn6 0, pcn10 0, noRules 3 (same as plain twin)
  - digit-only runs (non-date) distinct: 6-digit 16 -> 96, 7: 1046 -> 1206, 8: 0 -> 6, 10: 519 -> 525
  - DECISION: keep universal '/' (fail closed; clearinghouse-stripped stored values printed with '/'); report extending the date rule to unpadded M/D/YYYY as a founder option
- [x] gate.golden.test.ts: MEASURED + 3 classes, twin withoutRules pin, separator-twin test (60 s timeouts). Clone C: after 57/57 (progress/fix-tokenizer-golden-after.log); before (head redact + W patient-records w/o request, new twins+test): 3 failed (progress/fix-tokenizer-golden-before.log)
- [x] patient-twins.test.ts: 7/7 after; at head twins 4 failed (12,079 ITIN/ATIN-shaped, 2 MBI-shaped) progress/fix-tokenizer-twins-head.log
- [x] FIXED: previous Write lost NBSP in redact.test.ts (lines 77, 84, 159): restored from head bytes
- unit in C: redact + patient-records + twins 61/61
- NEXT: mutation (tok/mutants-tok.py), synth regen, lint/tsc, docs, report
- [x] synth regen in C (W's state): --case MOD-12 0 written/9 unchanged; --all 0 written/637 unchanged, EMR 16 unchanged (progress/fix-tokenizer-synth.log): no fixture change
- mutants running: tok/mut/mutants-tok.py -> progress/fix-tokenizer-mutants.log (C's redact.ts mutated meanwhile; orig at tok/mut/redact.orig.ts)
- [x] mutants (progress/fix-tokenizer-mutants.log, -2.log): 44 run; killed all but 3 behaviour-equivalent: indexStarts prefilter (perf: dense 16 MiB every-length 7 s vs 20 s without), runKey mixing (perf), '\n' line split (memory only; results identical). Fixed survivors: 'line start' (runStart now reset only at a line's first token), 'compact: marks kept' (new test: U+01F0 upper-cases to J + caron)
- [x] runKey simplified (length no longer mixed: equivalent); screen-bound prose now carries NBSP (per-line NFKC exercised)
- [x] final bench: tok/bench-results2.txt (head OOM at 560 for 16 MiB prose/sheet/dense; new 128: prose 0.73 s, sheet 0.75 s, dense 1.5 s, dense-long 1.5 s, every 6.9-7.7 s (bench-results3), first-hit 12 ms; 4 MiB prose head 512 ms/177 MiB vs 203 ms/40 MiB; 4 MiB dense head 4.45 s/406 MiB vs 0.38 s/54 MiB)
- [x] tokenizer-docs.md written (update F5 table with bench-results2)
- running: tsc/eslint/unit in C -> progress/fix-tokenizer-checks.log; then golden again; then tokenizer.md report
- [x] C (W 19:50 state + request): tsc model-gateway 0, tsc synth 0; eslint my 8 files clean (fixed screen-bound float literals + useless assignment); unit model-gateway + synth/screen 491/491 (before last edits), redact+brand scan 38/38 after; brand-colors scan: '#AB12#' was a hex color -> '#ZZ12#'; lint:logs clean
- [x] golden 57/57 final; db gateway+patient-records 32/32; db web models-routes + worker permitted 24/24
- LEFT: tokenizer.md report; fix − literal in docs; final W diff review
- [x] final before run of redact.test.ts (head redact + W patient-records): 13 failed/14 passed of 27, bound OOM (progress/fix-tokenizer-redact-head.log); after 27/27
- [x] fix/tokenizer.md (report) and fix/tokenizer-docs.md written. DONE except returning the report.
