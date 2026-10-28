# dlr-merge74: merge claude/build-platform (165c5993: #74) into co-001/ux-download-refusals, then UX-DLR-11

Started 2026-10-28. Worktree /home/user/ux-download-refusals, branch at f47437eb, clean before the merge.

## Steps
- [x] fetch + merge --no-ff --no-commit
- [x] resolve conflicts
- [x] check auto-merged files both PRs changed
- [x] regenerate (install, watched.ts, synth --all)
- [x] typecheck/eslint/unit tests
- [x] commit merge (8f7d18d4, parents f47437eb 165c5993)
- [ ] UX-DLR-11 move (letter onto FieldError, drop scroll-mt-18, ADR 0079)
- [ ] commit UX-DLR-11

## Commands and results
- git fetch origin claude/build-platform: origin/claude/build-platform = 165c5993; merge-base a6e754fc.
- Both sides changed 16 files (list: progress/dlr-merge74-both.txt).
- git merge --no-ff --no-commit origin/claude/build-platform: MERGE IN PROGRESS. 10 conflicts:
  synthetic-personas.ts, packet/[versionId]/review/page.tsx, packet/page.tsx, coverage/page.tsx,
  reports/[reportId]/review/page.tsx, reports/page.tsx, uploads/uploader.tsx, lib/http/next.ts,
  synth common.ts, synth expected/types.ts.
  Auto-merged (both changed, to check): console/compliance/page.tsx, lib/routes/compliance.ts, test-matrix.md,
  synth matrix.ts, registry.ts, watched-paths.txt (generated: regenerate).

## Conflicts and resolutions
- packages/synth/src/cases/common.ts: MODULE_NUMBER holds FRM: 16, TBL: 17, DLR: 18 (both).
- packages/synth/src/expected/types.ts: CASE_MODULES ... 'RCC', 'FRM', 'TBL', 'DLR' (both).
- apps/web/scripts/synthetic-personas.ts: doc comment names the forms journey's five (#74) then the refusals pair (ours);
  the rows: refusals-manager/-viewer (ours) then the five forms-* (#74).
- apps/web/src/lib/http/next.ts: signInFor stays moved to ./sign-in-for (ours, R17); guardMessage is #74's (not exported,
  rate_limited only, CSRF is STALE in refusedInput) with ours' minutesWords; #74's cache/Sealer imports, form actor mark,
  STALE/refusedInput kept. Nothing else imported guardMessage (grep).
- components/uploads/uploader.tsx: imports both (ours ReportFrom + DownloadLinks; #74's Hint); rest auto-merged.
- coverage/page.tsx: imports: no Button/Field/SelectField (the letter's form lives in PayerLetter), CheckboxField and
  CheckboxGroup kept (#74's evidence checklist); the letter's CardContent is ours (PayerLetter). #74's letter intent
  (SelectField showChosen, grid-cols-1, Field hint) is carried into letter.tsx: grid-cols-1 and the 14 px hint in the
  merge (FRM-04 D9), the controls onto SelectField/FieldError in the UX-DLR-11 commit.
- packet/page.tsx, packet/[versionId]/review/page.tsx, reports/[reportId]/review/page.tsx, reports/page.tsx: import
  conflicts only; both sides' imports kept (DownloadLink(s)/DownloadRefusal/ForgetRefusal and #74's field components);
  bodies auto-merged with both (verified by grep: CheckboxGroup/TextAreaField/SelectField/Field and DownloadLinks,
  ?from=, ForgetRefusal present).
- Auto-merged, both changed, checked: console/compliance/page.tsx (#74 showChosen/hints/curly quotes + ours DownloadLinks/
  DownloadLink/ForgetRefusal: disjoint, both present); lib/routes/compliance.ts (#74 messages + ours returnTo: disjoint);
  test-matrix.md, synth matrix.ts, registry.ts: FRM (16), TBL (17), DLR (18) sections/rows whole, in that order.
- All 10 conflicts resolved and staged; no markers left (grep).

## Regenerate (merged tree)
- flock pnpm install --frozen-lockfile --config.modules-cache-max-age=0: exit 0, "Lockfile is up to date", nothing written.
- pnpm exec tsx tools/screening-capacity/watched.ts --write: exit 0, 538 lines, nothing changed.
- flock pnpm synth --all (background): exit 0, 257 cases, 0 written, 649 unchanged, 0 removed; EMR formats 0 written.
- flock tsc --noEmit (apps/web) on the resolved merge, letter untouched: exit 0.
- FOUND: #74's apps/web/e2e/packets.spec.ts (FRM-08 step) asserts Coverage's letter shows [data-slot="chosen-text"] for the
  contract select at 390 px: #74's showChosen on the letter's selects is behaviour the merge must keep -> the letter's
  selects become SelectField (showChosen) IN THE MERGE; SelectField renders no data-payer on options, so
  LetterContractCheck takes an owners map (contract id -> payer id) in the merge. The marks stay LetterError in the
  merge (passed as aria-invalid/aria-describedby props); UX-DLR-11 then moves them onto FieldError.
- Baseline unit run on the resolved merge (letter untouched; 11 files: form-hints, fields, form-issues, action-form,
  action-form.browser, letter, download-refusal, download-link, lib/http next, download-refusal, download-refusal-words):
  1 failed / 316 passed: form-hints.test.ts "writes no description a control names at 12 px":
  components/coverage/letter.tsx:204 #letter-codes-hint (text-xs). #74's D9 rule meets this PR's hint: fixed in the
  merge (text-sm, as Hint writes it).
- Merge-side letter edits (uncommitted, part of the merge): letter.tsx selects -> SelectField (showChosen; className
  SELECT kept; this PR's aria-describedby/aria-invalid/autoFocus props and LetterError kept), form grid-cols-1 (#74),
  codes hint text-sm (D9); letter-contract-check.tsx: ContractChoice reads value, watchLetterContract/LetterContractCheck
  take owners (contractOwners: contract id -> payer id, Object.hasOwn); letter.test.tsx: data-payer markup assertion ->
  optgroup markup + contractOwners; FakeContract by value; a value the list does not name / prototype keys never held.
- eslint (17 files: resolved + both-changed + letter files) --max-warnings=0: exit 0.
- tsc apps/web after letter merge edits: exit 0.
- Unit rerun on the merge state (25 files incl. components/uploads and packages/synth): 504 passed, 0 failed.
- db tests (seed.db.test.ts for the personas) not run: no local Postgres (pg_isready: no response). e2e not run here.
- git commit -F (hooks ran, no --no-verify): 8f7d18d4, parents f47437eb + 165c5993.

## UX-DLR-11 (in progress)
Decision: the selects are #74's SelectField given `error` (FieldError and describedBy inside; showChosen kept, which
#74's packets.spec.ts needs); the codes input is hand-written beside FieldError with form-issues' describedBy (Field
does not fit: its hint is a string and the hint sets the example codes in mono, UX-DLR-09; FRM-04's pattern check
reads only `hint`/`aria-describedby` on the element, so a Field with `describedBy` would fail it). Field's own
`error` works in a plain GET form: useFieldIssue reads the default context (no issues), so `error` decides.
Edits (uncommitted):
- letter.tsx: SelectField error/autoFocus (no className: SelectField's look, no scroll-mt-18, no hand mark);
  codes Input aria-invalid + aria-describedby={describedBy(id, {error, also: 'letter-codes-hint'})} own attribute,
  FieldError, hint at text-sm under it; LetterError, SELECT, local describedBy/invalidMarks removed.
- letter-marks.tsx: LetterMarks hides FieldError's whole line ([data-field-error] closest to the message).
- refusal-notice.tsx: RefusalAlert drops cn('scroll-mt-18'); download-refusal.tsx doc. scroll-padding-top =
  calc(3.5rem + 1rem) = 72 px = scroll-mt-18 (4.5rem); header h-14 (3.5rem). Only other scroll-m* in apps/web/src:
  settings/billing page's scroll-mt-20 (PR #56, not this PR's, not touched).
- letter.test.tsx: fieldErrorLine helper (icon svg aria-hidden, span aria-hidden "Error:", message alone in
  {id}-error, text-sm text-destructive); no scroll-m* on controls; error before hint.
- download-refusal.test.tsx: reads packages/ui styles.css html scroll-padding-top rule; notice has no scroll-m*.
- e2e download-refusals.spec.ts: descriptions without "Error: "; the FieldError line shows "Error:"; the whole
  line hides on clearing.
- ADR 0079: D4 notice sentence, D5 letter paragraph, Consequences (LetterMarks hides the line), Revisit when (move
  done; the trigger left is a shared field that clears its own mark).
- tsc apps/web (incl. e2e) after the move: exit 0. eslint --max-warnings=0 on the 8 touched files: exit 0.
- unit run 3: letter.test.tsx 3 failed (my fieldErrorLine regex expected data-field-error="" ; React writes
  data-field-error="true" for the boolean) -> regex takes any value; rerun letter: 18/18.
- unit run 5 (11 files: form-hints, fields, form-issues, action-form, action-form.browser, letter, download-refusal,
  download-link, lib/http download-refusal, download-refusal-words, next): 317 passed.
- watched.ts --write after the move: 538 lines, unchanged. eslint on letter files again: exit 0.
- No hand-edited file is a #42 file; no migration, nothing under packages/pricing, no model identifier added.
- git commit -F (hooks ran): 036989af "Coverage's letter: each refused control is marked as every field of ADR 0077 is
  ... (UX-DLR-11; docs/adr/0079)". Tree clean. Not pushed (task: do NOT push).

## Done
- [x] UX-DLR-11 move (letter onto SelectField error / FieldError + describedBy, drop scroll-mt-18, ADR 0079)
- [x] commit UX-DLR-11 (036989af)
