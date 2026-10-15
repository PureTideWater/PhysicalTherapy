# fixtures/golden

**NO REAL PHI, ever.** Golden lines are built on synthetic claims and fixture contracts only.

The pricing oracle (PRD section 18): service lines whose expected allowed amount a reimbursement specialist
computed by hand from the published fee-schedule files and the fixture contracts, each recorded with the
worksheet that produced it, before the engine code for that branch exists.

- `pnpm test:golden` runs every `*.golden.test.ts` against these lines; a difference of one cent fails.
- `pnpm test:golden --report` also writes every difference to `fixtures/golden/.report` (ignored by git); the
  `/golden-diff` skill reads it and explains each changed cent. It never edits a golden line.
- Changing a golden line is a human step with the specialist's worksheet attached, reviewed like code.
- Synthetic reference values used by a golden line say SYNTHETIC in their source metadata and are never
  presented as CMS data.
