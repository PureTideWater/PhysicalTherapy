# Status: materiality settings show stored cents as dollars (`co-001/materiality-cents`)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** built (wf_d44e963e-621, ~04:45-05:15; tests first, shown failing on c5195ee) and pushed; draft PR #54 opened ~05:20 and subscribed; payment-engine review running (wf_65664ff5-625); before/after shots running; UX review after the shots.
- **Branch / PR:** `co-001/materiality-cents`, cut from c5195ee, worktree /home/user/materiality-cents / #54 (draft), head c74d304 (4618e41 tests first, 4bfcb12 fix, c74d304 docs).
- **Migration:** none. No #42 file: the route (`apps/web/src/lib/routes/settings.ts`, a #42 file) already returns what
  the page needs and is not touched. `packages/money` unchanged (`formatCents(parseCents(…))` already exists).
- **Reserved numbers:** test-matrix CAS-38 and CAS-39; `packages/synth` CAS-38 and CAS-39. No ADR.
- **Choices (design §Decisions):** one shared helper `dollarsForInput` in `components/format.ts`, used by the defaults
  and cases pages; amounts shown through `<Money>`; the cards extracted to `components/settings/defaults.tsx` for
  unit tests; a sweep of apps/web for the same class of bug; no data repair (no real practice exists yet).
- **Design review (wf_1712850b-a63), all accepted:** F1 one module `lib/money-input.ts` (dollarsField + dollarsForInput), not a third copy; F2 property test against the shared schema; F3 a new defaults-routes db test; F4 the e2e in triage.spec.ts; F5 shared documents; F6 the PLB total on the upload receipt (same class of bug); F7 brand mono items; F8 the helper's domain and the 12-digit gap (Lane A); F9 line refs and the cases' snapshot.
- **Added by the orchestrator (~04:22):** the console model budget entered in dollars.
- **Local checks on c74d304:** typecheck 22; lint 1,495 files 0/0; lint:copy, lint:logs; unit 324 files 5,026 passed 3 skipped; synth clean; db (defaults, console, workbench routes) 35/35; generated route tests for the 9 touched routes 306; no money package affected.
- **Hand-overs to Lane A:** settings.ts (#42) to import dollarsField after #42 merges; the 12-digit stored vs 11-digit saved gap (readers, SQL setters, gateway).
- **Proposals:** a lint:copy rule against `$` before an interpolation; `<Money>` in a shared components/money.tsx; brand.spec.ts mono checks on these pages; a per-key field in the console models form.
- **Machine:** restarted again ~04:21 (PG18 restarted by the builder); the first before-capture failed on it and was retaken.
- **Safety net:** send_later 08:50 UTC (trig_012MWfJwXCJEX4TNFjtwos9i).
- **CI:** none yet.
- **Next:** shots; UX review; the fix round; CI; verification; merge.
