# Status: materiality settings show stored cents as dollars (`co-001/materiality-cents`)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** MERGED. PR #54 merged as 7ef421b (2026-10-26 ~09:00 UTC) with method merge and expectedHeadSha 4a2ee32, after its fresh-clone verification passed and every required check was green on that head; the branch already held the base (4d99df8).
- **Branch / PR:** `co-001/materiality-cents` (remote kept; worktree and local branch removed) / #54, merged.
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
- **CI on 4a2ee32 (final):** every check green; unit 327 files, 5,098 passed, 1 skipped; db 120 files, 9,069 passed, 1 skipped; e2e 51 passed (no flake). Push runs on 7ef421b: ci, mutation and screening-capacity all success.
- **Full local suite on 4a2ee32:** typecheck 22; lint 1,502 files 0/0; lint:copy, lint:logs, verify-content, engine freeze, check:fixtures; synth clean (203 cases); unit 327 files 5,096 passed 3 skipped; golden 188; oracle 637; test:db six shards 120 files 9,069 passed 1 skipped; build + stamp + e2e 51/51 (triage.spec's CAS-38 step included); no money package affected (`approval-summaries/lane-b-materiality-cents-fix-suite.md`).
- **After shots retaken at 4a2ee32;** gallery version 2.
- **Fresh-clone verification (wf_4b2d6b9c-0c3; cut off by the 5-hour limit ~06:35, resumed ~08:55 after the machine restart and setup-container.sh):** pass (`approval-summaries/lane-b-materiality-cents-verify.md`); its wording note (the defaults page's save still in settings.ts) fixed in the description before merge.
- **After the merge:** unsubscribed from #54; the 08:50 check-in deleted; main checkout fast-forwarded to 7ef421b and installed; worktrees `/home/user/materiality-cents` and `/home/user/screens` removed with the local branch; tp_e2e_screens dropped; nothing running.
- **For the orchestrator:** done (merged 7ef421b). Used test-matrix and synth CAS-38, CAS-39; no ADR. Hand-overs to Lane A and proposals are above.
- **Next:** none for this item.
