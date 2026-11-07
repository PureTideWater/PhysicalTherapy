# scout-upload progress
Started 2026-11-07. Base 31a7345f.
## Done
- (none yet)
## Next
- read upload-form.tsx, design 7.8/3.4/3.5/3.7/4.1/5.1/12, status, ActionForm/form-issues/field, tests, e2e, 4b branch
## Done (step 1)
- read upload-form.tsx (394 lines @31a7345f), design 7.8, 3.4-3.7, 4.1, 5.1, 5.4, 12.1-12.4, status "Left for others"
- findings so far: FIELD_NAMES :119-128 (design said :55-64); startTransition :263 after await read() :244; button disabled :388 with "Sending…"; reading line :345 outside status region :347; "Not sent" alert :372 not tied to input :322-330 (aria-describedby only hint); no focus on file refusal; UploadRefusal prints state.error :176 (no stale handling); hints 12px text-xs :331,:341
## Done (step 2)
- read action-form.tsx, form-issues.tsx (useGuardedSubmit :227-294, RefusalSummary :549, RefusalLead :624, resolveKey data-issue-for :425), field.tsx (Field, Hint :68, CheckboxField uncontrolled)
- screening action: runAction(screeningSubmit) public route; no csrfToken, no requestKey -> stale only from csrf_refused = cross-origin (invoke.ts:382); no duplicate; no FormKeys -> person mark inert (personOf null)
- route issue keys: input (paused/closed/bounce), upload (UPLOAD_UNREADABLE etc), contactEmail, zip, state, practiceName, heardFrom, referringFirm
- tests: upload-form.test.tsx (UploadRefusal pins :105-130, old lead "Check the fields marked below."), e2e screening.spec.ts :255-277 (file-refused), :735-780 (ZIP refusal, [data-state=error], focus, describedby), mail-cutoff.spec.ts :90-98, screening-phone.spec.ts :147
- form-hints.test.ts SMALL_ALLOWED :82-86 holds upload-form.tsx
- 4b = co-001/ux-screening-result-words, not pushed (other machine); its files: anomalies.tsx, labels.ts, labels.test.ts, result-summary.tsx, result.test.tsx, e2e/screening.spec.ts (:509, :517 only), test-matrix/matrix TBL-08
- #126: test-matrix.md, matrix.ts, registry.ts, tools/screening-capacity/watched-paths.txt; #129: test-matrix.md, matrix.ts. upload-form.tsx is a watched path (capacity gate runs); no new module keeps watched-paths unchanged
## Next
- check wording items (brand.md), Alert/Input in ui, pending/useFormStatus claim, compose report
## Done (step 3) - report composed, returned to orchestrator
- extra findings: dropped connection today throws to app/error.tsx (no useGuardedSubmit); press while reading re-parses (read() called twice) and setReading(false) of an older read clears the flag early; "Choose the file to screen." sits under "Fix the file and choose it again:"; e2e :242 pins data-slot="template-hint", unit :101 pins id screening-template-rules; registry: tests can go under FRM-03/04/05 via action-form.browser.test.tsx (no counter)
- STATUS: COMPLETE
