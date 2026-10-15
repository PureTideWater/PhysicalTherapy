# 0025. Parse 835s into typed loops, and hold each transaction set on its own

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 2 (the 835, as the parser must read it), 10 (pipeline steps 3 to 8 and 10, cases, errors and resilience), 18 (the 835 oracle); test matrix PAR-01 to PAR-30

## Context

Milestone 2 part B writes `packages/edi835`: a pure function from bytes, or a stream of chunks, to typed
events and a parse report, against the 005010X221A1 structure. Part A wrote the fixtures, the outcome each
must produce (`expected.json`) and the rules the writer, the oracle and the parser share (ADR 0021). The plan
leaves open how strict the structure check is, what a failure stops (the document or one payment), how a
streamed transaction can be loaded when the envelope that closes it is read later, where the code lists come
from when release 1 cannot be loaded, how far reversal linkage reaches inside a pure parser, and how the parser
is compared with pyx12.

## Decision

- **Tokenizing.** Delimiters come from each interchange's ISA (position 4, ISA11, ISA16 at 105, the terminator
  at 106); the header must be sixteen fixed-width elements with four distinct delimiters that are not letters,
  digits or spaces. A UTF-8 byte-order mark is skipped and reported; carriage returns, line feeds, tabs and
  spaces between segments are skipped unless they are delimiters, and a carriage return before a line-feed
  terminator is dropped. Text is decoded as UTF-8 incrementally, so a character split across chunks survives.
  A segment longer than 65,536 characters (`MAX_SEGMENT_LENGTH`; real 835 segments run to a few hundred) is
  EDI_SYNTAX `segment_too_long`, so input without terminators cannot fill memory.
- **Two kinds of failure.** What breaks the document stops it: input not beginning with ISA, an 837 or 277
  (EDI_NOT_835 at ST01, then GS01 HP, then GS08 005010X221A1; ISA12 must be 00501), a malformed header,
  envelope segment or envelope order, and truncation (EDI_SYNTAX at the segment the input ended in and the
  element being read, or at the trailer that never came). Everything inside ST..SE holds that transaction set
  only, and the next one is read: a missing required segment (EDI_SYNTAX `missing_segment`, the segment ID
  being the one missing and the index where it was due), a segment the loop does not allow, one repeated more
  often than its loop allows, a missing required element, a repeated element, an amount that is not a decimal
  with at most two places (through `parseAmount` in @tp/money), an invalid date, a malformed number, units
  not above zero, a BPR03 other than C or D, a DTM05 other than D8 or RD8. Every EDI_SYNTAX error names its
  reason (`SYNTAX_REASONS`).
- **Structure.** Loops come in the 005010X221A1 order (header, 1000A, 1000B, 2000, 2100, 2110, PLB); inside a
  loop the segments may come in any order, since each is unambiguous by its ID and qualifier. Required
  segments, element usage and data types follow pyx12's open-source 835 map (`src/spec.ts`); elements the
  structure does not use are ignored. DTM02 may be replaced by DTM05 D8 or RD8 with DTM06 in any DTM: PAR-23's
  tolerated "DTM 472 with a range" (ADR 0021).
- **Balance holds** follow ADR 0021 and are left out when the transaction set already has an EDI_SYNTAX hold
  (an unreadable amount reads as zero, so its difference would mislead). Hold reasons come in a fixed order:
  the transaction imbalance, control mismatches, syntax errors in segment order, then claim, line-charge and
  line imbalances in claim order.
- **Envelope errors and streaming.** A transaction event is emitted at its SE, so memory holds one
  transaction set (the report records the most segments held and the most characters buffered). A wrong GE or
  IEA count or control number, a GS06 repeated in its interchange, or a document error read later holds every
  transaction it encloses in the report; the event's `loadable` is provisional and the report's
  `transactions[].loadable` is final, so the loader writes inside one database transaction and commits after
  the report. A repeated ST02 in a group holds that transaction set. `parse835` takes a document of at most
  50 MB in memory; `parse835Stream` takes chunks of any size.
- **Code lists.** A `CodeListProvider` answers every code lookup. `releaseCodeLists(release, records)` reads
  CARC and RARC from a rule release's `carc` and `rarc` records, each active between its effective dates on
  the remittance's BPR16 date, and answers the structure's own sets (claim status, adjustment groups, provider
  adjustment reasons, payment methods and every qualifier) from `X12_835_CODE_SETS`, taken from pyx12's map.
  The release's `claim_status_code` records are the 276/277 claim status codes, which no 835 element uses.
  Tests use the SYNTHETIC release 900001 (`@tp/edi835/testing`), the only one this environment can load. An
  unknown code loads with an EDI_UNKNOWN_CODE flag at its position, never dropped.
- **Reversals** are linked inside their transaction set only, so memory stays bounded: a CLP02 22 claim names
  the payer claim control number it reverses (and the earlier claim with it, when there is one); a corrected
  claim names the claim it replaces from REF F8, or from the reversal it follows with the same patient
  control number, and links that reversal. The loader resolves every other link by payer claim control
  number.
- **Deduplication** is emitted and decided purely: the report's document SHA-256, each transaction set's key
  (sender, payee, ISA13, TRN02, BPR02; the loader adds the practice) and BPR16, `duplicateDocument` and
  `remittanceDecision`. The same key is a duplicate remittance (EDI_DUPLICATE at TRN02, zero rows); a
  different remittance with the payee, TRN02 and TRN03 of a known one loads for review, saying whether BPR16
  differs (the plan's "same trace on another day"; the plan is silent on the same day, read as review too).
  The second of two identical remittances in one document is held as EDI_DUPLICATE.
- **Messages never carry a value from the document** except what is shaped like a segment ID, a code, a count
  or a control number; anything else becomes "(not shown)", and a segment ID that is not one becomes ''.
- **The oracle.** `pnpm test:oracle` parses every file pyx12 reads (615 checks) with the parser too
  (`tools/test-oracle/parser.ts` builds the same `tp-oracle-835/1` summary from the parser's events). The two
  summaries must be equal, and the verdicts must match: where pyx12 accepts a file the parser may hold it only
  for what pyx12 does not check (balance, unknown codes); where pyx12 rejects one the parser must find the same
  kind of problem (not_835, missing_segment, control_count), unless the fixture states that the parser reads
  it (V05's repeated PLB, PAR-23's RD8).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Enforce pyx12's segment order inside each loop | Holds payments over a REF before a DTM, which changes no amount; the order between loops is what gives meaning |
| Stop the whole document at the first syntax error | One malformed payment would hold every other payment in a large file; the plan holds "a transaction that does not balance", not its neighbours |
| Wait for IEA before emitting any transaction | Memory would grow with the file, against "memory bounded per transaction set" |
| Link reversals across the whole document | A map of every claim in a 2 GB file; the loader looks claims up by control number anyway |
| Validate CLP02 against the release's claim_status_code records | Those are 277 codes (901, 902, 903 in the SYNTHETIC release); every 835 would flag status 1 |

## Consequences

- The intake job (milestone 3) streams documents above 50 MB, writes events inside one database transaction
  and commits only when the report says a transaction set loads; it applies `duplicateDocument` and
  `remittanceDecision` with what the practice holds.
- `packages/edi835` keeps 100% branch coverage; its tests compare every fixture's `expected.json` field for
  field, random SYNTHETIC files from packages/synth with random delimiters, line endings and holds, and the
  10,000-claim PAR-29 file in 64 KiB slices (about a second; the target is a minute).
- A pyx12 upgrade, a writer change or a parser change that moves any summary field or verdict fails
  `pnpm test:oracle`.

## Revisit when

Release 1 can be loaded (the code lists then come from it), a real-file twin (ADR 0024) shows a payer layout
the loop rules hold wrongly, or the loader needs links across transaction sets that the control number cannot
give.
