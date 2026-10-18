# 0022. Check every synthetic 835 with pyx12 through a normalized summary

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 10, 18 (three oracles: the 835 oracle; continuous integration); milestone 2 done check

## Context

PRD section 18 makes pyx12 the independent oracle for the parser: "the two must agree on every segment,
amount and balance", in CI, on synthetic fixtures. Milestone 2 part A builds the fixtures before the
parser exists, so the oracle first checks the fixtures themselves: that what packages/synth says a file
contains is what an independent X12 reader finds in its bytes. Part B adds the parser to the same
comparison. pyx12 4.0 validates a file against its 005010X221A1 map but does not balance amounts, refuses a
byte-order mark, and validates remark codes against its own copy of the external list, not the SYNTHETIC
code lists the fixtures use.

## Decision

- **`tools/test-oracle/oracle.py`** imports only the standard library and pyx12 and runs isolated
  (`python3 -I`). For each file, or `zip!entry`, it runs pyx12's validator with a callback that receives
  every segment with its map node, builds the normalized summary (format `tp-oracle-835/1`) from those
  segments and loop paths alone, computes every balance with `Decimal` under the rules of ADR 0021, and
  prints one JSON document (format `tp-oracle-run/1`): per file `valid`, `rejections`, pyx12's `errors`,
  `summary` and `summarySha256` (SHA-256 of the summary as `json.dumps(sort_keys=True,
  separators=(',', ':'))`).
- **Validity** is pyx12's own verdict with one exclusion: the external `remark_code` list
  (`exclude_external_codes`), because the fixtures' remark codes are SYNTHETIC by design; the parser checks
  them against the release. A leading UTF-8 byte-order mark is stripped before pyx12 reads the text and
  recorded as `bom: true`. pyx12's errors are sorted into categories: `not_835` (GS or ST is not an
  835), `map_not_found`, `control_count` (SE, GE or IEA counts and control numbers), `missing_segment`
  (missing trailers: a truncated file), `segment`, `element`, `decode`, `other`.
- **The summary** holds, per interchange, group and transaction: control numbers and counts, BPR (amount in
  cents, method, date), TRN, payer and payee identifiers, each claim's CLP fields, claim and line CAS summed
  by group and reason, claim and line references, dates and AMT amounts, each SVC line, LQ remarks, every
  PLB item, and the claim, line and transaction balance results. Amounts are integer cents as strings, dates
  ISO. `packages/synth/src/x12/summary.ts` builds the same summary from the writer's segments; the two
  implementations share no code.
- **`pnpm test:oracle`** (`tools/test-oracle/index.ts`) reads every `expected.json` under
  `fixtures/synthetic`, hands each declared 835 (and each X12 zip entry, and the generated PAR-29 file) to
  oracle.py, and fails on any disagreement: validity, a missing rejection category, any difference in the
  summary (or its hash where a fixture records only the hash), an X12 file no expected.json declares, or a
  generated file that is not there. The interpreter is `TP_ORACLE_PYTHON`, else `python3` (CI installs
  pyx12 with plain pip); locally it is a virtualenv outside the source tree, because a virtualenv under
  `tools/` would be linted, scanned by the log lint and flagged by the repository hygiene test.
- **Known pyx12 limitations are declared, not hidden.** pyx12 counts a second PLB segment as a second
  footer loop and rejects it although the PLB segment repeats; variant V05 keeps two PLB segments and its
  expected.json records the rejection (`valid: false`, `segment`) with the parser tolerating it, while its
  summary still has to match. PAR-23's DTM 472 RD8 file is the other declared rejection (ADR 0021).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Compare pyx12's XML output with the fixture | The XML is a dump of segments; the amounts, sums and balances would still need a second program |
| Use pyx12's bundled remark-code list | It is a snapshot of the real list; the fixtures use SYNTHETIC codes on purpose |
| Leave the large file out of the oracle | pyx12 reads its 10,000 claims in about 25 seconds; checking it costs less than not knowing |

## Consequences

- A writer bug shows up as an oracle disagreement before any parser code exists.
- Part B adds the parser's summary of each file, in the same format, to the comparison.
- A pyx12 upgrade that changes a verdict fails the build until the fixture's expectation is reviewed.

## Revisit when

pyx12 fixes the repeated-PLB limitation (V05's expectation then changes to valid), or the summary needs a
field the parser must agree on that it does not yet carry.
