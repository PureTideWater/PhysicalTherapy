# Lane B, Queues item 41 (MOD-27): status

<!-- RESUME-BLOCK
PAUSED by the orchestrator's message (the co-founder's word, 2026-11-14 about 01:10 UTC). Do nothing until it says "go".
Branch co-001/redact-item-41 (from claude/build-platform 6299c550), local only; WIP ref co-001/wip-redact-item-41 at
  b009d863 (verified with git ls-remote). Three commits: a7afc887 variant k; f521e358 the render view, the intake log
  event and the synthetic PDF; b009d863 stage 2 (S-5 and ruling (f)). No uncommitted edits. No PR, no merge.
Green on b009d863: the six redact test files of packages/model-gateway (4,088 tests) and pnpm typecheck. Green on
  f521e358 (stage 1) only, NOT rerun on stage 2: pnpm lint, lint:logs, check:fixtures, synth --all, packages/synth,
  observability, redact and packets tests, apps/worker intake/pages.test.ts. apps/web unit run: 2 failures in a pg-boss
  lock_timeout test and 99 files that need a database, not looked into (none touches this item's files).
Running when paused: nothing. No subagent, no check-in scheduled.
NOT DONE: the bar's measurements for either stage (gen40, gate, unseen sweep). Only the note's widening script was run
  on the product's reader (results under Stage 2 below).
The orchestrator's ruling (queued 01:01 UTC, read at 01:33 after the pause). NONE of its five points is applied yet:
  1. No fallback on "the joined reading is refused" (variant j's rule). Nothing to change: k has none.
  2. Do not hand-pin six exceptions (b009d863 does: SENT_AS_THE_LINE_BREAK_TWIN and the R3-4 test in
     redact.leaks.test.ts; remove them). Restate the property over the whole recorded corpus: for every letter L that
     holds a C1, the head refuses L, OR the head's outcome for L equals its outcome for L's line-break twin AND the base
     does not refuse that twin; with no C1, item 34's property is unchanged. The base's verdict on each twin has to be
     recorded from the base tree (4d40557f, as lay41.sh lays it), as BASE_REFUSED was. List the five fuzz letters and
     R3-4 here, each with why the base refused it (expected: the U+0085 itself). If the base refuses any twin, k must
     refuse that letter: stop and report.
  3. The fallback must be by span, not by a count of placeholders (storedFoundOnlyJoined in b009d863 counts, so this
     is a code change): fall back to the unmended reading whenever a STORED identifier's match in the joined text has a
     removed C1 strictly inside its span. Tests first, with: stored claim 7654 and stored member ID 76543210, text
     7654<U+0085>3210 (expected refused, or the whole run replaced, never 3210 in clear); the same shape for a date of
     birth, and for a name part that is also a whole stored name.
  4. Item 40's moved pins are accepted; each moved row must assert that no fragment of the value is in clear (some
     rows in b009d863 assert only "refused or as its twin": add the fragment assertion), and the count of moved rows
     goes in this file. The unseen sweep's bar stays at 0 sent in clear.
  5. For item 41's reviews (a later session): an unstored SSN or phone split by a C1. The note says reading 1 already
     refuses it; the reviewers must try to break that.
NEXT STEP, exactly, after "go": (1) apply the ruling's points 2, 3 and 4 above, tests first; (2) rebuild the measurement root:
  bash designs/lane-b-redact-item-41/scripts/lay41.sh <root> from a copy of that scripts directory, then copy
  packages/redact/src/redact.ts and confusables.ts into <root>/prod/packages/model-gateway/src (stage 1: git show
  f521e358:...) and <root>/prod2/... (the head); (3) run the copy's measure41.sh <root> with
  PAIRS="base:prod head:prod prod:prod2" for steps gen40 and gate, and UNSEEN_TREES=prod2 for step unseen; compare
  gen40's head:prod summary with measure/generated-set-40-head-head-k.summary.json; (4) write the counts under "The bar";
  (5) pnpm test, lint, lint:logs; push the WIP ref; report stage 2's end.
-->

## Stage 1

- Variant k is inside the reader's entries (`redactionSpans`, `redactLetter`, `redactLetterForScreen`). A letter with no C1
  character takes the path it took. `holdsIdentifier`, the budget, the WORK constants and the 3 s rows are unchanged.
- A letter the breaks reading is chosen for is read twice, not three times: the breaks reading is the one returned.
- Named cost, ruling asked: the property "a letter the base refuses stays refused" (redact.leaks.test.ts, BASE_REFUSED)
  no longer holds for six letters that hold U+0085: seed 301 places 4437, 7667, 14701; seed 302 places 15982, 17696; and
  review 3's row R3-4. Each is sent exactly as its line-break twin is sent, every stored value replaced. They are pinned
  as named exceptions; every other recorded letter is still refused.
- Item 40's pins that said "refused" for a C1 inside a number, a date, a name or a phone or Social Security number now
  say "refused, or sent as the line-break twin": the reader takes these across a line break and replaces the whole.
- The Windows-1252 view (`mendExtracted`) lives in the web app (apps/web/src/lib/contracts/mend.ts) and is called only by
  `CitedPageView`. No package that stores, hashes or sends can import it.
- Intake logs `page text holds a C1 character` once per code point when it stores a document's pages: `practice_id`,
  `document_id`, `control_character_code` ("U+0085") and `occurrence_count`. Two fields were added to the allowlist
  (packages/observability/src/fields.ts); `pnpm lint:logs` passes.
- The synthetic PDF exists: `writeMisdecodedPdf` in packages/synth gives the font a ToUnicode map from each byte to the
  code point of the same number, and the product's reader (pdf.js) extracts U+0085, U+0092, U+0093, U+0094 and U+0096
  from fixtures/synthetic/MOD-27/letter-misdecoded.pdf. Page 1 is sent with every stored value replaced; page 2, whose
  date of birth a C1 splits, is refused. Not a blocker.
- test-matrix.md has a new row MOD-27 (and its mirror in packages/synth). Item 39 may add a row beside it: expect a
  one-line merge conflict there.

## Stage 2

- S-5: `periodAt` skips `\p{Cc}` and `\p{Cf}` before an initial's period; "/", ":", "·" and "。" join initials.
- Ruling (f)'s partial fix: `Name.X.` is taken when X has its own period; an undotted capital after an initial already
  taken is taken, except A, I and O.
- The note's widening script on the product's reader: S-5 alone hides 512 of 540; with (f) 528 of 540 (the 16 more are
  `Name/J/Q`, whose last initial (f) takes). The 12 left are a comma and then a joiner after the name (`Zephyra,/J/Q`).
- Sentence starts: 10 of 25 change, the ten the note lists, word for word. Named costs, pinned in
  redact.initials.test.ts: `Zephyra. J. Smith called` and `Zephyra J. Q is the code` hide a letter that may not be the
  patient's.
- Three rows of item 40 (`Zephyra. J. Smith, PT`, `Jane Zephyra. Q. Ostrander, DPT`, `Maria Lopez. M. Okafor, PT`) sent
  another person's initial standing; they are now pinned as the same named cost in redact.leaks.test.ts.

## The bar

Not measured yet (paused before the gate runs).
