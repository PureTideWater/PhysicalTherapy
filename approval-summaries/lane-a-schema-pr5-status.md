# Schema PR 5 (the ledger-freeze batch): status

## RESUME-BLOCK (W29, session_019i9ifE4gRYJeq78K4egWh3; updated 2026-11-12, after the note, before the reviews)
- **Brief:** revise the schema plan (step 1), design schema PR 5 exactly within the founder's grant of 2026-11-07 19:26 UTC
  (step 2), draft the second ask for everything beyond it, two bounded reviews of the note, one fix round. No PR, no
  migration file, no build unless the orchestrator says so. Base 93e137f9.
- **Done:** step 1 (the plan's "Revision 2026-11-12", build-ops f742dcfc); the note
  `designs/lane-a-ledger-freeze-batch.md`; the second ask, a draft,
  `approval-summaries/lane-a-ledger-freeze-ask-2-2026-11-12.md`.
- **Next:** two reviews of the note, `reviews/lane-a-ledger-freeze-batch-money.md` and
  `reviews/lane-a-ledger-freeze-batch-database.md`; verify each finding before changing the note; one fix round; then
  tell the orchestrator "plan revised; PR 5 designed" with the two paths.
- **Facts checked on the base (do not re-derive):** today's bodies are `49416713dd4d13dd` (`roi_links_valid`) and
  `5a8bc6319828acb2` (`roi_statement_rules`), as the ask says; the ask's Appendix A and D texts hash to
  `13c4dd46b9203095db8f26e124ed3652e5ec58bf5a46f0b28fd561b6cd1f2da4` and
  `ba8293836b9cd5aafd67dddf29d891f9f958059109c043f59f5223605ab42360` (computed from the ask's text); the writer is
  `apps/worker/src/reconcile/statements.ts` (`generateRoiStatement`, `OPEN_CASES_ACTIONABLE`); the figure's predicate is
  `apps/worker/src/triage/actionable-now.ts`; `case_line_once` is UNIQUE (service_line_id); a migration reads a
  forced-RLS table by `set_config('app.practice_ids', <all practices>, true)` and sets it back to `'{}'`
  (20261109090000_line_status_heads.sql:127-132).
- **Holds:** nothing running; no WIP ref yet; no counters taken.
