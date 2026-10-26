# Status: materiality settings show stored cents as dollars (`co-001/materiality-cents`)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** fix round running (wf_521d97fc-8ba, from ~05:20): every review finding, the base merge (4d99df8, PR #46), the full local suite once; then one push.
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
- **Adversarial reviews, all accepted** (`approval-summaries/lane-b-materiality-cents-review-findings.json`):
  - payment engine (wf_65664ff5-625): "merge as is"; MC-M1 widen dollarsField to 10 whole digits so it covers every stored value; MC-M2 the boundary test proves each save wrote;
  - UX and brand (wf_02451cc1-591): "merge after fixes"; UX-1 accept "$5" and "5,000"; UX-2 refusals name visible labels; UX-3 the line page in dollars (formatUnroundedUsd, labelOf); UX-4 the PLB total's direction in words (withheld/added); UX-5 plural minutes; UX-6 a fieldset for the pursuit fields; UX-7 a full sentence naming the defaults; UX-8 the budget hint and table label; UX-9 the workbench refusal as a refusal; UX-10 upload counts mono and plural; UX-11 "does not balance by" a magnitude; UX-12 a MoneyField with mono inputs.
- **Screens:** before (4d99df8, pre-fix) and after (c74d304), 16 shots, published privately: https://claude.ai/artifact/VYpF3XkbtjAGYVQYwGJAnQ (capture spec `workflow-scripts/lane-b-materiality-cents-capture.spec.ts`). The UX baseline review file had not landed.
- **Base moved:** PR #46 (db-function-diffs) merged as 4d99df8 at ~05:00; merges cleanly; taken in the fix round.
- **Machine:** restarted again ~04:21 (PG18 restarted by the builder); the first before-capture failed on it and was retaken.
- **Safety net:** send_later 08:50 UTC (trig_012MWfJwXCJEX4TNFjtwos9i).
- **CI:** none yet.
- **Next:** shots; UX review; the fix round; CI; verification; merge.
