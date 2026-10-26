# 0072. Word every calculation from its stored trace in one renderer, and render the fee schedule worksheet at review and export

- **Status:** accepted (`co-001/figures-in-words`, combined audit #38). Adds to
  [0061](0061-verify-a-deadline-only-from-signed-off-evidence-refuse-an-unverified-export-in-sql-and-attest-the-export-over-its-hashes.md)
  D2 ("how its expected amount is computed"); reverses none of its rulings.
- **Date:** 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined audit on 2026-10-20; the co-founder, on the
  wording, under the founder's delegation of 2026-10-25; the build (Lane B)
- **PRD sections:** 2 (what the engine must get right), 7 (screens), 11 (the engine and its trace), 12 (packets), 16
  (security and compliance); Change Order 001 CO-05, CO-06 and CO-11; test matrix CAS-30 to CAS-34

## Context

Audit #38 found that no screen and no packet explained a figure in words:

- The line trace page printed each step as `JSON.stringify` in a `<pre>`, the method and the unpriced reason as bare
  codes and the unrounded amount as raw cents. A role without `phi.read` saw no steps at all.
- The review page and the payer's PDF worded the calculation two ways, from two vocabularies: the PDF refused a code
  without words, the web fell back to `labelOf`. The reviewer did not read what the payer reads.
- The packet's calculation (`lineCalculation`) copies only step amounts, so the RVUs, GPCIs, locality, setting and
  conversion factor of a percent-of-Medicare or Medicare Advantage line were in the trace but in no packet. A payer
  could not check the amount against CMS's own fee schedule.

The constraints: CLAUDE.md rule 1 (code computes every number; a model never produces a dollar amount) and rule 3
(every expected amount traces to a signed-off rate record and a numbered release); the engine freeze (no non-test
file under `packages/pricing/src` changes, `tools/engine-freeze`); the stored packet format `tp-packet/2`, whose
content Postgres pins line by line to `priced_line_calculation(trace)`; ADR 0061 D2's payer copy (no record ID,
SHA-256, verification, code without words or internal note); and no migration without the founder's domain-model
approval (CO-02).

## Decision

**One renderer, in `packages/packets/src/explain/`.** `explainLine(trace, citation, audience)` turns a parsed stored
trace and its citation (the signed-off rate record's page, or 42 CFR 422.214 for a Medicare Advantage non-contracted
line) into a summary sentence and one block of sentences per step. `feeScheduleWorksheets(lines, audience)` builds
one worksheet per distinct set of fee-schedule records (RVU, locality, ZIP+4, GPCI and conversion-factor SHA-256s,
with the setting and the percentage). Both are pure and deterministic, import only `@tp/money`, `@tp/pricing`'s
parser and types and their own files (a purity test reads the imports), and are served browser-safe at the
`@tp/packets/explain` subpath. `explainPacket(content, traces, audience)` at the package root binds them to a packet.
The package is a money package: copy-linted, in the payment-engine review, and mutation-tested in its own Stryker
shard, `packets-explain`.

**Words only from stored values.** The renderer never adds, subtracts, multiplies, divides, rounds, negates or
compares a value by size. A figure is a trace value (or the citation's) through a display form that changes its
form, never its value (`dollars`, `exact_dollars`, `percent`, `per_rvu`, `verbatim`), or the length of an array the
trace holds (`count`, the one derivation). Words are chosen by a value's kind or by string equality of values the
engine wrote. A sentence is a list of segments; a text segment holds no digit, so no number hides in a template.
Every figure carries its source path, and `explain/slots.ts` is a hand-written table of the one path each slot may
print. No model is involved anywhere.

**Three audiences.** `internal` (roles with `phi.read`, dates shown), `viewer` (no date of any kind; the window's
length and start only) and `payer` (no date, window, release, rule record, flag that is off, NCCI or MUE note, or
code but the seven of `PAYER_CODES`, each written out). The review page and the PDF both take
`explainPacket(..., 'payer')`, so the reviewer reads exactly what the payer reads. A flag that is off reads only as
"Not applied (flag off)", never as the contract's position, and a Medicare Advantage line's reductions are
Medicare's, never a contract's or rate record's. The year is worded from the fee schedule's lookup, and a
`year_basis` label that disagrees with it refuses the line.

**The worksheet is rendered, not stored (C2 (a)).** It is rendered at review and export from `priced_line.trace`;
the packet content and its format do not change, and there is no migration. Its **figures** are bound to the
approval: each line's `calculation.trace_sha256` is inside the approved content (`approved_sha256`), `priced_line`
is immutable, and `explainPacket` refuses (`ExplainBindingError`) a trace whose SHA-256 differs, a missing trace, a
line priced by another rate record than the contract citation's, and a line that is not Medicare Advantage
non-contracted under the regulation citation. Its **words** are bound by a code-held `WORDS_VERSION`, the SHA-256 of
every word table, the slot table and `RENDERER_REVISION` (`version.test.ts` holds the literal equal to it):

- the builder and the review show it in their Internal record cards;
- the approve and export-request forms post the version the page was rendered with, and the handlers refuse
  another, writing nothing;
- the export request puts it in the `packet_export` job payload, and the job refuses a payload whose version is
  absent or differs, as a print failure.

**The price of C2 (a), the gap no code-only guard closes:** a version approved under one renderer, then a deploy that
changes the words, then the export requested under the new one. The requester reads and sends the new words, which
the approver never read. Closing it needs the approval to store the words version it was given:
`approved_words_version` and `export_words_version` on `packet_version`, a migration and so Lane A's, recommended.
Until then a deploy that changes the words is released when no approved version waits for export.

**No 100% figure.** The worksheet prints the trace's RVUs, GPCIs, conversion factor, percentage and per-part amounts
(already at the percentage). It prints no fee-schedule amount at 100%, no geographically adjusted RVU and no total
RVU: the trace holds none of them, and deriving one would be the renderer doing arithmetic. Its CMS sentence says
how to check the inputs in CMS's look-up tool and why CMS's amount differs.

**Fail closed, one rule everywhere.** A code a closed list has no words for throws `ExplainWordsError(list)`; a trace
the sentence forms cannot word throws `ExplainShapeError(what)`. Neither carries a value. The PDF records a print
failure and prints nothing; the builder and the review show the refusal and the approval is refused with the same
reason; the line page shows the notice. No surface falls back to a code or to `labelOf`.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A stored worksheet, `tp-packet/3` | Needs a migration through `packet_content_valid`, the deadline-status column and trigger and `priced_line_calculation`, the founder's domain-model approval, and turns every `/2` version into `inputs_differ`. The render-time worksheet has the same binding for its figures. Switch if the founder wants the database itself to check the worksheet. |
| An extra content key under `tp-packet/2` | A key the database never checks, inside content it otherwise checks line by line. |
| A renderer in `apps/web` and another in `apps/worker` | Today's two vocabularies; neither under the mutation gate or the payment-engine review. |
| A model-written explanation | CLAUDE.md rule 1: a model never produces or restates a dollar amount. Words from code need no verifier. |
| Recording the words version in the approval and export audit events | `audit_event` has no detail column and the attestation's jsonb is closed by a CHECK, so it is DDL. The stored column above is the better form of it. |

## Consequences

- The line page, the packet builder, the packet review and the payer's PDF word every calculation one way. The CSV
  does not change (ADR 0061 D3). PR 13's Calculations tab builds on `explainLine`, and PR 12's calculation manifest
  states each line's words as `explainPacket` renders them (`docs/product/reconciliation-001.md`, the amendments of
  2026-10-26).
- A wording change is a reviewed change: it moves `WORDS_VERSION`, the golden pins under
  `packages/packets/src/explain/__golden__/` and the unit tests in the same diff. A sentence-form change with no word
  table change raises `RENDERER_REVISION` by hand.
- Reading the trace for a viewer widens what the server reads for them, not what it sends: `pricedLineWords()`'s
  return type has no trace field, and the loader test checks the viewer's serialised page data.
- A line whose year label disagrees with its lookup (Lane A's open engine defect 2) cannot be worded or printed until
  that fix lands. That is the intended result.
- **The checks that prove it:** CAS-30 to CAS-34. Every figure is checked three ways over every golden claim and
  generated traces (by its source path, by parsing the words against the trace's leaves, and by its slot's path),
  every golden claim's words are pinned in three audiences, the web loaders' words deep-equal `explainPacket`'s, the
  printed PDF's text holds `explainPacket`'s payer sentences, and each words-version guard has its refusal test.

## Revisit when

- PR 12 adds the calculation manifest, which carries each line's words.
- Lane A stores the words version of the approval and the export, which closes the gap above.
- The founder wants the worksheet stored (`tp-packet/3`).
- The closed list's SECONDARY_PAYER meaning is fixed through the content pipeline, so the words may quote it again.
