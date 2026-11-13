# Skeptic re-test of C-1 (review-2-cost.md)

**Verdict: REPRODUCED.** The cause is the one the review gives.

Script: /tmp/claude-0/skeptic-5b-C1/probe.mts. Results: at64k.jsonl and bisect.jsonl in the same folder. All data is synthetic.

## Method

- Readers: OLD (61600c7c) is /tmp/claude-0/m5b/s3/packages/model-gateway/src/redact.ts. NEW (ae0b6a3f) is /tmp/claude-0/m5b/head/packages/model-gateway/src/redact.ts.
- Production path: `r = redactLetterForScreen(letter, P, C)`, then `refused = holdsIdentifier(r.text, P, C, checkWorkOf(r))`. P and C are the synthetic patient and claim from the task.
- Letter: `Dear Jane Zephyra, member ID 76543210. See note¹.` followed by `Line <i>: CPT 97110 billed USD <45..94>.00 on 03/<01..28>/2025, allowed 38.12, paid in part.`, cut to L characters. L is the length of the whole letter.
- Variants: line endings are CR LF or LF. The mark is `¹`, `½`, or none (the control).
- Thresholds: a grid every 4,000 characters from 20,000 to 140,000, then bisection to 250 characters. Every series was monotone, with one switch from sent to refused.
- Cost of the final check: found by bisecting the `spent` argument of holdsIdentifier. The cost is the budget (420,000,000) minus the largest `spent` at which the check still sends, to within 0.1M.

## Thresholds (last sent / first refused, characters)

| Variant | OLD 61600c7c | NEW ae0b6a3f |
|---|---|---|
| `¹`, CR LF | 96,250 / 96,500 | **63,250 / 63,500** |
| `½`, CR LF | 96,250 / 96,500 | **63,250 / 63,500** |
| `¹`, LF | 133,250 / 133,500 | 97,750 / 98,000 |
| `½`, LF | 133,250 / 133,500 | 97,750 / 98,000 |
| control (no mark), CR LF | 129,000 / 129,250 | 129,000 / 129,250 (same) |
| control (no mark), LF | sent to 140,000 | sent to 140,000 (same) |

## Exact counts at L = 64,000

w = checkWorkOf(r). F = work of the final holdsIdentifier.

| Variant | OLD w | OLD F | OLD total | NEW w | NEW F | NEW total |
|---|---|---|---|---|---|---|
| `¹`, CR LF | 130,807,002 | 148.5M | 279.3M, sent | 275,316,534 | 148.5M | **423.8M, REFUSED** |
| `½`, CR LF | 130,809,490 | 148.5M | 279.3M, sent | 275,319,022 | 148.5M | **423.8M, REFUSED** |
| `¹`, LF | 127,410,590 | 75.0M | 202.4M, sent | 200,307,858 | 75.0M | 275.3M, sent |
| `½`, LF | 127,413,014 | 75.0M | 202.4M, sent | 200,310,282 | 75.0M | 275.3M, sent |
| control, CR LF | 64,378,706 | 144.5M | 208.9M, sent | 64,378,706 | 144.5M | 208.9M, sent |
| control, LF | 62,680,500 | 72.9M | 135.6M, sent | 62,680,500 | 72.9M | 135.6M, sent |

The output text was the same on OLD and NEW in every case. The redaction ran in every case (the member ID was replaced).

## Cause

- **The new charged check accounts for the whole difference.** NEW w minus OLD w is 144.51M with CR LF. That equals the full holdsIdentifier cost of a CR LF text of this length (control F is 144.5M). With LF the difference is 72.90M, which equals the LF control F (72.9M).
  - So the only added charge is one whole check: the check of the number-character reading, which is now charged at redact.ts 3903-3907 in refusedWithNumberCharactersAsOne.
  - OLD asked the same check (`holdsIdentifier(again.text, …, counted)`) without adding its work to the count.
- **The accounting is correct, not double-counted.** That check reads `again.text`, the reading with the mark written as one character. The caller's final check reads `r.text`. Each text is charged once.
- **CR LF doubling: confirmed.** holdsIdentifier reads the text again with each CR LF written as a line feed (redact.ts around 4221). This makes F about 2x with CR LF (148.5M against 75.0M) and makes the newly charged check about 2x as well.
  - With CR LF the mark adds 66.4M on OLD and 210.9M on NEW, so NEW crosses 420M at about 63.4k.
  - With LF, NEW still refuses from about 98k, against 133k on OLD. So the regression is not only a CR LF effect. CR LF is what pulls it below the 100,000-character promise by a wide margin.
- **The per-character figures match the review.** With CR LF, NEW w per character is 4,302 and F per character is 2,321. OLD w per character is 2,044. The control w per character is about 1,006.

## Small corrections to the review's wording

- The NEW threshold is 63,250 to 63,500 characters, not "about 62,000". The review's table is still consistent: it shows 62,000 sent and 64,000 refused.
- At 98,000 characters on OLD, the refusal is the final check passing the budget. OLD's w is about 200M there, and the final check needs about 228M. The review attributes it to OLD's uncounted check, which also starts from that count and also passes the budget. Either way the letter is refused, so the claim stands.
