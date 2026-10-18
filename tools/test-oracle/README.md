# tools/test-oracle: the 835 oracle

`pnpm test:oracle` has pyx12 read every synthetic 835 fixture and fails on any disagreement with what the
fixture's `expected.json` says (PRD section 18; docs/adr/0022), then has packages/edi835 parse the same files
and fails on any disagreement between the two readings (docs/adr/0025).

## Running it

CI installs pyx12 with `pip install pyx12` and runs `pnpm test:oracle` with `python3`. Locally, install
pyx12 in a virtualenv **outside the source tree** (a virtualenv under `tools/` would be linted, read by the
log lint and flagged by the repository hygiene test) and point the oracle at it:

```sh
python3 -m venv ~/.venvs/tp-oracle && ~/.venvs/tp-oracle/bin/pip install pyx12
pnpm synth --large                     # the 10,000-claim PAR-29 file, ignored by git (pnpm test writes it too)
TP_ORACLE_PYTHON=~/.venvs/tp-oracle/bin/python3 pnpm test:oracle
```

It takes about a minute: about 600 checks (every 835 file, every X12 entry of the PAR-27 and PAR-28 zips,
and the 10,000-claim file).

## What it checks

`index.ts` reads every `fixtures/synthetic/**/expected.json` and, for every declared 835 (`files[].x12`),
X12 zip entry (`files[].zip.entries[].oracle`) and generated file (`generated[]`), runs
`python3 -I oracle.py` once over all of them and compares each result with the fixture's
`OracleExpectation`:

- `valid` must equal pyx12's verdict against its 005010X221A1 map (external remark codes excluded);
- every category in `rejections` must be among pyx12's (`not_835`, `map_not_found`, `control_count`,
  `missing_segment`, `segment`, `element`, `decode`, `other`);
- `summary`, when the fixture states one, must equal pyx12's summary field for field; where a fixture states
  only `summarySha256` (PAR-27's entries, PAR-29), the hashes must be equal.

It also fails when an X12 file under `fixtures/synthetic` is declared by no expected.json, or when a
generated file is missing.

Then `parser.ts` parses every one of the same files with packages/edi835 (the SYNTHETIC release 900001's code
lists) and builds the parser's summary in the same format from its typed events alone. For every file:

- where pyx12 produced a summary, the parser's must equal it field for field: every control number, count,
  BPR, TRN, party, claim, CAS total, reference, date, amount, line, remark, PLB item and balance, to the cent;
  where pyx12 could not read the file, the parser must not have read it either;
- where pyx12 accepts the file, the parser may hold it only for what pyx12 does not check (balance, unknown
  CARC and RARC); a structural hold (EDI_SYNTAX, EDI_NOT_835, EDI_CONTROL_MISMATCH) fails;
- where pyx12 rejects it, the parser must find the same kind of problem (`not_835` an EDI_NOT_835,
  `missing_segment` a document EDI_SYNTAX, `control_count` an EDI_CONTROL_MISMATCH) and hold something,
  unless the fixture's expected parse outcome is `loaded` (V05's repeated PLB and PAR-23's DTM 472 RD8, which
  the parser reads and pyx12 rejects);
- the parser's outcome must be the fixture's expected parse outcome, where it states one.

## oracle.py output (format `tp-oracle-run/1`)

```json
{"format": "tp-oracle-run/1", "pyx12": "4.0.0", "results": [
  {"file": "PAR-01/remit.835", "valid": true, "rejections": [], "errors": [],
   "summary": { "format": "tp-oracle-835/1", "bom": false, "interchanges": [ ... ] },
   "summarySha256": "<sha256 of json.dumps(summary, sort_keys=True, separators=(',', ':'))>"}]}
```

`errors` lists pyx12's own errors (`level`, `code`, `message`, `segment`, `line`). The summary format is
documented in `packages/synth/src/x12/summary.ts` (`OracleSummary`), the one the TypeScript side builds.
