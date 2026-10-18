# 0024. Make twins only inside the production boundary, structurally identical and balanced

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 16 (development data boundary), 17 (how to work: debug with twins)

## Context

PRD section 16: a twin generator inside the production boundary turns a real file into a structurally
identical synthetic one (dates shifted, names and identifiers replaced, amounts perturbed) and only twins
leave. It must never run outside production, yet it has to be tested, and the tests may only use synthetic
input. A twin is for debugging the parser and the engine, so it must still parse the way the original did:
same loops, same balances, same holds.

## Decision

- **Interface.** `new TwinSession({ boundary, seed? }).twin(document)` (or `generateTwin`) takes the segment
  document a parser produces (`X12Document`: interchanges of segments of elements of components, with each
  interchange's delimiters) and returns one of the same shape, rendered with `renderDocument`. A session
  twins several files consistently, so a reversal in one file still names the twin of the claim it reverses
  in another.
- **Boundary.** `TwinBoundary.production(env)` exists only when `NODE_ENV` and `TP_ENVIRONMENT` are both
  `production` (staging also runs with `NODE_ENV=production`; the task definition that eventually runs the
  generator sets `TP_ENVIRONMENT`, milestone 11's compute). Anywhere else the only boundary is
  `TwinBoundary.syntheticInputOnly()`, under which the generator refuses any document whose ISA06 is not
  SYNTHSENDER or whose GS02 is not SYNTH; tests use it on the committed fixtures. Errors never carry a value
  from the input.
- **Transformation.** Every element has a role (`packages/synth/src/twin/roles.ts`): codes, qualifiers,
  counts and quantities are kept; identifiers, names, addresses and free text are replaced character class
  for character class (digits by digits, letters by letters, the same value always by the same twin value,
  never by a value already used); every date moves by one offset of 61 to 400 days earlier; ISA06 becomes
  SYNTHSENDER, ISA05 ZZ, GS02 SYNTH, ISA15 T, ISA02 and ISA04 blank. An element the table does not know is
  replaced. Amounts are scaled by a factor between 0.85 and 1.15 per claim (keyed by the payer claim control
  number, so a reversal scales exactly like its original) and per transaction, rounded half away from zero,
  then rebalanced: one CAS amount per line and per claim and one PLB amount absorb the rounding so every line,
  claim and transaction keeps exactly its original difference under ADR 0021 (a balanced file stays
  balanced, a held one keeps its exact difference); AMT B6, AMT AU and CLP05 follow when they equalled paid
  plus patient share; a zero check stays zero.
- **Seed.** Tests pass a seed; production draws one at random, so twins of the same file differ between runs.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Hash identifiers with a secret key | Changes their length and character class, so twins could fail element-length checks the original passed |
| Scale every amount independently | Breaks the balances, so the twin no longer reproduces the original's parse |
| Gate on NODE_ENV alone | Staging runs NODE_ENV=production too |

## Consequences

- Every committed 835 fixture is twinned in the tests: same segment and element shape, identical balance
  results; pyx12 accepts the twins exactly where it accepts the originals (checked by hand when the generator
  was written; the automated check is the TypeScript summary).
- Running it on a real file needs `TP_ENVIRONMENT=production` set on the production worker, and a job that
  hands the parsed document to it; both arrive with the intake work (milestones 3 and 11).

## Revisit when

A twin of a real file parses differently from the file (a role the table gets wrong), or the parser's own
document type replaces `X12Document` as the generator's input.
