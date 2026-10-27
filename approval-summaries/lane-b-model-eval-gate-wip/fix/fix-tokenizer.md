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
