# Skeptic H: wall-time limits on the near-budget tests (e17c1192)

Verdict: REPRODUCED

## Static check
- The diff ($S/item40.diff) adds no timeout to any test: no `{ timeout }`, no trailing `}, N)`, no 20_000 or LONG constant on any added line.
- Every `{ timeout: 20_000 }` in packages/model-gateway and packages/redact tests is the same on head and base, 4 each:
  - redact.leaks.test.ts:2562 on head (2557 on base), 'counts the wider reading's initials on the check's work budget ...'
  - functions/denial-letter.test.ts:72 'leaves no identifier in any letter ... (property)'
  - functions/denial-letter.test.ts:439 on head (437 on base) 'counts the same work for the same letter in every run ...'
  - functions/denial-letter.test.ts:452 on head (450 on base) 'holds one budget for the redaction and the check together ...'
- vitest.config.ts: the `unit` project (lines 86-95) sets no testTimeout. Only the `db` project sets 30_000. So the unit tests keep vitest's 5 s default.
- The three tests have no limit: redact.leaks.test.ts:2863 'the row nearest the budget is read to its end and sent', :3041 '... with one U+0085 added is refused by the count', :3047 '... with one U+0085 added goes back as the mark alone, its count past the budget'. The input is `${NEAR_THE_BUDGET}\u0085` with BUDGET_PATIENT and BUDGET_CLAIMS. All data is synthetic.

## Timing on a 4-core box (`npx vitest run src/redact.leaks.test.ts -t 'row nearest the budget'`)
- One run: 3900 ms, 3620 ms and 3683 ms. All 3 pass, at 72 to 78% of 5 s.
- Two runs in parallel: 2 of 3 fail in both runs with "Test timed out in 5000ms".
  - Run 1: 8331 ms and 6855 ms failed, 4860 ms passed.
  - Run 2: 10396 ms and 7393 ms failed, 3785 ms passed.
- Logs: $S/skeptic/H/solo.out, par1.out, par2.out.

## Corrected severity
This is a reliability problem in the tests, not a privacy problem. No identifier is ever sent in clear: the assertions hold whenever the tests finish. "should" is right, and it is close to "must" for CI. Under modest contention (two copies on 4 cores) the timeouts reproduce every time, not now and then. Vitest's own parallelism across files in the unit project gives that kind of load.

## Mechanism
The finding is right. On base the leaks file has its one 20 s test and the near-budget row does not exist. On head the work that sits just under CHECK_WORK_BUDGET takes ~3.7-3.9 s on one core. It has no explicit limit, so it inherits the 5 s default.

## Which four tests the design means
I could not find the design text that names the four tests, so this is inference. The likely four are the three near-budget tests above plus one more new test that pays the full budgeted reading. The best candidate is 'a letter that holds such a character is charged its further reading and that reading's check in full', or 'a letter with such a character is charged its further reading in full ...'. I did not time either.
