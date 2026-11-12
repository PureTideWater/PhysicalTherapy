# Queues item 38: MOD-15's property and fast-check seed 1596478644 (W37, acting Lane B)

## RESUME-BLOCK (kept current; last written 2026-11-12, after the first commit)
- Branch `co-001/redact-item-38` cut from the base a97d73e4; one commit, 1fd9fddb (test file only).
  WIP ref `co-001/wip-redact-item-38` holds it. No PR yet.
- Done: reproduced on a97d73e4; diagnosis (below); the oracle corrected; the seed's case pinned; the pin fails under the
  old oracle and passes under the new; the seed and 41 other seeds pass (400 runs each); the redaction suites of
  packages/model-gateway and packages/redact pass (6 files, 3,192 tests); eslint on the file and typecheck pass.
- Running: the full local suite, once (lint, lint:logs, verify-content, test, test:golden, test:db); one adversarial
  review of the delta, report in `approval-summaries/lane-b-redact-item-38-review.md`.
- Next: verify each review finding before any fix (two rounds at most); open the draft PR into claude/build-platform
  from `.github/pull_request_template.md`; subscribe; before the last push merge the base and check
  `git ls-remote origin refs/pull/156/head` (ac8500fc on 2026-11-12); mark ready; merge on green with the head SHA.
- Holds: nothing yet (no subscription, no check-in).

## Reproduced
On a97d73e4 (item 26 merged), `fc.assert(sendsNoSsnOrPhone, { numRuns: 400, seed: 1596478644 })` fails after 131 runs,
shrunk 128 times, at `expect(screened.text).toBe(rebuilt + text.slice(kept))`. Synthetic twins only.

## What differs
The letter holds a survivor, so the check refuses it. It then holds "SSN", the call's own member ID, and on the next
line a phone number with an extension, an invisible character inside each group.
- The shaped pattern takes the number as a phone (a settled match).
- The bare ten is also read as an SSN under the label, through the member ID before it: a match marked fresh.
- `redactionSpans` and `redactLetter` apply every match: ssn outranks phone, so `[SSN]`.
- `redactLetterForScreen` applies a fresh match only in a letter the check does not refuse without it
  (`appliedMatches`): in this refused letter it writes `[PHONE]`.
Same span, a placeholder either way. Without the survivor the letter is sent and all three entries write `[SSN]`.

## Decision: the test's expectation was wrong, not the label
- The rule that a refused letter keeps the matches as they stood is the design's (appliedMatches; the fresh-match rule
  came on 2026-11-11). The property's equality was written before it and asked for more than the design gives.
- The safer option: no redaction code changes. Changing which label the screen writes would mean applying part of a
  match the design withholds in a refused letter, in the most sensitive module, for a text that is never sent.
- The oracle is not skipped or widened beyond the one difference seen: redactLetter equals the spans' text, always; the
  screen's text equals it in every letter not refused; in a refused letter every span is replaced where it stands, by
  its own placeholder or by `[PHONE]` for an `[SSN]`, and nothing else may differ. Run counts and timeouts unchanged.

## For the queue
- None yet.
