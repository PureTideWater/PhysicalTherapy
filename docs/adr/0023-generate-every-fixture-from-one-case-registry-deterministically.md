# 0023. Generate every fixture from one case registry, deterministically, and commit the output

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 16 (development data boundary), 17 (milestone 2), 18 (the case matrix); docs/product/test-matrix.md

## Context

Milestone 2 asks for generators for every case in the test matrix, `pnpm synth --case <id>` and
`pnpm synth --all` writing `fixtures/synthetic/<case>/`, and CI runs `pnpm synth --all` on every pull
request. Cases from later milestones (mapping, contracts, pricing, triage, ledger, jobs, model gateway,
security) need input files now but their outcomes are asserted later; some need no file at all.

## Decision

- **One registry** (`packages/synth/src/cases/registry.ts`) has an entry for every test-matrix row, checked
  word for word against `docs/product/test-matrix.md` by a test, plus thirty-five oracle variants (`V01` to `V35`,
  in `fixtures/synthetic/variants/<id>-<slug>/`; V32 to V35 came from the milestone 2 and 3 review: six CAS
  triples, B6 beside claim-level patient share, a line-feed terminator with a blank line after IEA, and values
  outside the structure's code sets). Each entry names the milestone that completes its expected
  outcome (`completesIn`), the existing tests that already assert it (`assertedBy`, checked to exist), and
  either generates files or states why it needs none (`noFileReason`). Every case directory holds an
  `expected.json` (`CaseExpectation`, `packages/synth/src/expected/types.ts`).
- **Deterministic.** Each case draws from its own seeded 32-bit generator (`tp-synth/<id>`); there is no
  clock, locale or `Math.random`; zips are stored (uncompressed) with a fixed timestamp so bytes do not depend
  on a zlib build; PDFs have no timestamps and a fixed ID; JSON keys keep their build order. A test
  regenerates everything in memory and requires the committed files to be byte-identical with no stale file,
  so CI's `pnpm synth --all` never dirties the tree. `--all` also removes files the registry no longer makes,
  only inside case directories it owns (never `cms/`, `rules/` or a README).
- **Synthetic by construction.** The writer always puts SYNTHSENDER in ISA06 and SYNTH in GS02, and the
  fixture writer refuses to write any X12 content, zip entries and byte-order-marked files included, whose
  sender is anything else. Identifiers are invented: NPIs start with 99 (no real NPI does), names say SYNTH,
  plans are `SYNPLAN-*`; amounts are bigint cents; dates fall in 2026, the SYNTHETIC release's year.
  Qualifier and code values the writer emits are those the open-source pyx12 map lists for 005010X221A1;
  no implementation-guide text is copied.
- **The 10,000-claim file (PAR-29)** is not committed. `writeLargeFixture()` (and `pnpm synth --large`)
  stream it into `fixtures/synthetic/PAR-29/generated/`, ignored by a `.gitignore` in that directory; its
  expected.json records the path, size, SHA-256, counts and the hash of its oracle summary (`generated`).
  The synth tests write it, so CI's oracle step finds it.
- **Later milestones' inputs.** MAP, PRC, CAS, LED and JOB cases get the 835s their scenarios need; LED cases
  also get posting exports (one synthetic practice-management layout, MM/DD/YYYY dates) and bank exports
  (ISO dates); CON and MOD cases get contract exhibits as text and as simple PDFs, and MOD proposals as
  recorded JSON. Scenario inputs that are not files (a mapping's effective date, a contract's method, a
  triage date) are in `scenario`; outcomes that can be stated now (ledger entries, variances under a fixed
  schedule, unpriced reasons) in `outcome`. Expected pricing amounts belong to the pricing oracle's golden
  lines (`fixtures/golden`), not here. MOD-03's 300 narrative cases wait for the packet-facts format of
  milestone 8.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Generate fixtures at test time only | Reviewers and later milestones read the files; CI must also prove the generator is stable |
| Deflated zips | Output differs between zlib builds and Node versions, breaking byte identity |
| A fixture per later-milestone case with invented formats for everything | Would fix formats (packet facts, proposal schema) before the milestone that owns them |

## Consequences

- Changing a generator changes committed fixtures in the same pull request; the regeneration test fails
  otherwise.
- The fixtures take about 5 MB, half of it PAR-27's 500-entry zip and its expected outcomes.
- `fast-check` comes from the root dev dependencies for packages/synth's property tests, as it does for
  apps/web, so the lockfile did not change.

## Revisit when

A milestone defines a format a case here only describes (packet facts, the model proposal schema): that
milestone's generator joins the registry entry.
