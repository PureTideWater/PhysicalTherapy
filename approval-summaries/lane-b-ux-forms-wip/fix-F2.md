# fix-F2 progress (fix round after the two reviews)
Findings: S-SEC-3, U-A11Y-1, U-A11Y-3, U-UX-1, U-UX-2, U-UX-8, U-UX-9 item 3 (+ item 4: terms Version hint, my file)
Worktree /home/user/ux-forms (shared; never git add/commit/stash/checkout/reset).

## Plan (decided after reading code)
- S-SEC-3 password-field.tsx: Omit 'type'|'spellCheck'|'autoCorrect'|'autoCapitalize'|'ref'; move ref,type,data-secret,
  spellCheck,autoCorrect,autoCapitalize AFTER {...props} (verifier: only the 3 spelling attrs; I also hold type, data-secret
  and ref: a caller's ref would drop the submit-time hide listener). fields.test.tsx: @ts-expect-error lines + cast spread.
- U-A11Y-3 button.tsx outline: aria-pressed:border-foreground aria-pressed:bg-secondary; components.test.tsx asserts the
  classes; forms-keep-input FRM-07 step asserts the pressed toggle's border colour differs and comes back.
- U-A11Y-1 field.tsx Hint text-xs -> text-sm; coverage letter form's hand-written hint -> Field (hint id-linked).
- U-UX-1 styles.css: form:not(.flex-col, .flex-col-reverse):has(> [data-slot='refusal-summary']) + corrected comment.
- U-UX-2: coverage letter form grid-cols-1, Payer -> SelectField, Contract raw select in min-w-0 wrapper + max-w-full,
  codes -> Field; status row form flex-wrap; cases filter form wrappers min-w-0 + selects max-w-full (long payer/email).
- U-UX-8: SelectField showChosen, MEASURED (line only while the select cuts the chosen text: hidden one-option copy of
  the select, clientWidth compare), aria-hidden, under the select; on cases/reports run, compliance What/Policy/Member,
  contracts forms Contract.
- U-UX-9 item 3: SHA-256 hints curly (compliance, terms, orgs) + orgs "vendor’s"; item 4 terms Version hint words.
- e2e: packets.spec.ts submissions refused at 390 (no sideways scroll), coverage letter form at 390, cases triage-run
  chosen line; forms-keep-input console status row at 390 (loaded + refused row via stale token).
- Scratch proof at 390 with the compiled CSS: scratchpad/f2-proof/.

## Done (code)
- S-SEC-3 password-field.tsx: Omit +spellCheck/autoCorrect/autoCapitalize/ref; ref,type,data-secret,spelling after {...props}; doc comment.
  fields.test.tsx: new test (expectTypeOf not.toHaveProperty x5 + cast spread runtime). inForm(locked) param added for F1's
  context change (FormIssuesContext now requires locked) + locked note assertion.
- U-A11Y-3 button.tsx outline aria-pressed:border-foreground aria-pressed:bg-secondary (+comment); components.test.tsx test.
- U-A11Y-1 field.tsx Hint text-sm; coverage letter codes -> Field with hint; orgs upload note text-sm.
- U-UX-1 styles.css form:not(.flex-col, .flex-col-reverse):has(...) + comment.
- U-UX-2 styles.css @layer base: select{max-width:100%} :where(:has(> select)){min-width:0} (systemic; raw selects anywhere);
  coverage letter form grid-cols-1 + SelectField (payer, contract with NEW optgroup support) + Field; status row flex-wrap.
- U-UX-8 field.tsx: SelectField showChosen (measured with a hidden one-option copy; layout effect; change/reset/RO/resize/fonts),
  ChoiceGroup options; showChosen on cases triage-run, reports report-run, compliance What/Policy/Member, contracts Payer/Contract,
  coverage letter Payer/Contract.
- U-UX-9 item 3: SHA-256 hints curly (compliance, terms, orgs); orgs "vendor’s"; item 4 terms Version hint words.
## e2e assertions (written)
- packets.spec.ts: submissions refused -> atPhoneWidth(approver) (FRM-08); new step after the Cases-by-reference step:
  cases triage-run chosen line (none at 1280, full "(release N)" at 390) + atPhoneWidth Cases; coverage letter contract
  select: no line, choose contract -> line = title, back to None named -> no line; atPhoneWidth Coverage. Header sentence.
- forms-keep-input.spec.ts: FRM-07 Show's border colour = body text colour while pressed, back to quiet after; incident
  test: new final step atPhoneWidth console status, stale-token row refusal (summary above select), atPhoneWidth again.
## Next
- checks: pnpm typecheck, eslint (my files), pnpm lint:copy, unit (fields, components), browser (action-form.browser), e2e (forms-keep-input, packets)
## Proof at 390 (scratchpad/f2-proof; compiled app CSS of the worktree, IBM Plex Sans, Chromium 141.0.7390.37 = pinned 1194)
Right edge per section (card border at 374; page 390 = no sideways scroll):
- old CSS+old markup: page 627; S1 submissions col form 627, S2 default col form 623, S4 coverage 404, S5 status 382, S6 cases filter 503
- new CSS+new markup: page 390; all <= 374; row form S3 still wraps (summary above select)
- new CSS alone (old markup): page 390, S5 382 (status needs flex-wrap markup); old wrap rule alone (new markup): 627 -> cause proven
- cutChoice: at 390 (16 px) run labels cut ("release 900001" and "release 3"), "Q1" not; at 1280 (14 px) none.
## Checks (16:2x)
- pnpm typecheck: pass (22 projects). expectTypeOf control: .not.toHaveProperty('autoComplete') fails tsc (TS2554) -> the 5 assertions bite; control removed.
- eslint (15 changed files): clean. pnpm lint:copy: pass (517 files).
- vitest unit: fields.test.tsx + components.test.tsx + action-form.browser.test.tsx: 61/61 pass (Chromium 1194, not skipped);
  upload-form, screening forms, brand, action-form tests: 40/40.
- e2e: next (scratchpad/bin/e2e.sh f2-run1 0 e2e/forms-keep-input.spec.ts e2e/packets.spec.ts)
- e2e f2-run1 started (bg; log scratchpad/e2e-logs/f2-run1.log; builds the shared tree incl. other fixers' WIP).
## Proposals to report (not my files)
- design 3.5 (line 478) + 12 #8: narrowed selector and why; 12.1 rows: pressed look (5.3/D8), Hint 14 px, select guard,
  showChosen (measured, aria-hidden, under the select), optgroups in SelectField, terms Version hint words, SHA-256 hints ’.
- test-matrix FRM-08: add "no page scrolls sideways at 390 px" (synth matrix.ts must match word for word).
- submissions/page.tsx response-document SelectField: showChosen (date + SHA-256 prefix cut at 390).
- split-form.tsx:106 hint text-xs -> text-sm (Hint); reference-search.tsx hint; upload-form.tsx is #42 (leave).
- orgs page "keeps it under an opaque key": internal word (UX-9 spirit) - wording for the copy owner.
- e2e f2-run1 16:23:26-16:27:03Z: 8/8 passed (forms-keep-input 6/6 incl. FRM-07 pressed look + console status 390 step;
  packets 2/2 incl. submissions refused at 390, Cases chosen line, Coverage letter chosen line + 390). Tree built with
  other fixers' WIP at that moment.
## STATUS: COMPLETE (return written)
