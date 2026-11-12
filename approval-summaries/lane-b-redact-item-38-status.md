# Queues item 38: MOD-15's property and fast-check seed 1596478644 (W37, acting Lane B)

## RESUME-BLOCK (final; 2026-11-12 about 12:25 UTC)
- **Merged as #159 (f7b777d3, 2026-11-12 ~12:24 UTC)**, method merge, expected head 2fa01985; every required check green
  (all green, mutation, screening-capacity gate, approval-of-record); the base was still a97d73e4 and #156's head
  ac8500fc at the merge. Verified with git ls-remote: claude/build-platform is f7b777d3 and holds 2fa01985.
- Local record: the full suite ran once on the first commit (test:db not locally: no PostgreSQL the suite accepts on
  this machine; CI's db jobs passed). One review, one fix round of two used.
- Holds nothing: unsubscribed from #159, the check-in cancelled. Nothing to resume. See "For the queue" below.

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

## Review (`lane-b-redact-item-38-review.md`)
- N1 taken: the comment says the oracle still fails a letter in which a number only a fresh match takes stays as written.
- N2 taken: the pin's [SSN] literals are marked as today's reading of a label through the call's own number.
- N4 taken: a failure message on the refused branch's last assertion.
- N5: the formatter warns on this file on the base too and is no part of `pnpm lint`; no action.

## For the queue
- N3 (not verified, not built): the allowance does not ask why the screen's label is lower. It could be tied to an
  earlier span of the call's own ([MEMBER_ID] or [CLAIM_n]) if that holds for every reach of the label read through.
  Harm is bounded today: the span is hidden and the letter refused.
- A plain ten that passes the NPI check ("2095550184") after "SSN" and the call's own member ID is [SSN] in a sent
  letter and as written in the screen's text of a refused one: the design's, seen while probing, recorded only.
