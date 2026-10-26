# Status: materiality settings show stored cents as dollars (`co-001/materiality-cents`)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** design reviewed (wf_1712850b-a63, ~04:40: build with changes, no migration, F1 to F9 accepted); model budget added (orchestrator, ~04:22); builders next.
- **Branch / PR:** `co-001/materiality-cents`, cut from c5195ee, worktree /home/user/materiality-cents / no PR yet.
- **Migration:** none. No #42 file: the route (`apps/web/src/lib/routes/settings.ts`, a #42 file) already returns what
  the page needs and is not touched. `packages/money` unchanged (`formatCents(parseCents(…))` already exists).
- **Reserved numbers:** test-matrix CAS-38 and CAS-39; `packages/synth` CAS-38 and CAS-39. No ADR.
- **Choices (design §Decisions):** one shared helper `dollarsForInput` in `components/format.ts`, used by the defaults
  and cases pages; amounts shown through `<Money>`; the cards extracted to `components/settings/defaults.tsx` for
  unit tests; a sweep of apps/web for the same class of bug; no data repair (no real practice exists yet).
- **Findings:** none yet.
- **CI:** none yet.
- **Next:** design review (one adversarial reviewer), then tests first, then the fix.
