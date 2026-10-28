# UX-DLR-11 verify (skeptic) - DONE
Clone: scratchpad/verify-uxdlr11/repo at 63aaa7f4 (read only). PR #74 = co-001/ux-forms @ 4f0b526d, open, same base e908c214.

## Checked
- letter.tsx:70-76 LetterError = <p id=letter-<c>-error class="text-xs text-destructive">Error: {msg}</p>; no icon, not bold. Crop crops/letter-codes-1280.png confirms.
- #74 form-issues.tsx:108-118 FieldError = div text-sm, ErrorIcon, aria-hidden bold "Error:", <p id=-error> message alone. Unchanged since 17bbb709 (10-26 09:52), so design R10 (10-27 02:10) misread 0077 D3 ("reads Error: then the message").
- Base e908c214 field.tsx:11-17 FieldError = text-xs, no "Error:", no icon -> at 63aaa7f4 the letter matches the base size; it diverges only once #74 merges.
- #74 touches coverage/page.tsx only in the checklist review form (CheckboxGroup); not the letter. letter.tsx is new in #78, so #74 gets no conflict pointing at it.
- ADR 0079 (in this PR) :126-128 and Revisit-when :194-195 already record: letter moves onto field.tsx and the notice's scroll-margin-top gives way when 0077 lands. Omits the letter controls' scroll-mt-18 (letter.tsx:79, :152). PR body has no explicit #74 overlap line.
- Scroll stacking: #74 styles.css:119-121 html scroll-padding-top calc(3.5rem+1rem)=72px; scroll-mt-18 = 72px (Tailwind 4). Chromium probe (verify-uxdlr11/probe/probe2.mjs, 1280x800 and 390x844):
  - focus()/Shift+Tab (the path autoFocus uses): center-if-needed -> margin only 415/437 px from top, both 451/473: 36 px lower, not 144.
  - letter-like position (field 217-241 px above page end, measured from shots: codes 1909/2126, 3331/3572; payer 1773/2110; contract 1841/2110): clamped at max scroll -> identical (556/600) in every combination.
  - scrollIntoView({block:'start'}) does stack (144 vs 72) but nothing in the PR start-aligns these elements (no fragment on the 303 per R02; no scrollIntoView in download-refusal.tsx, forget-refusal.tsx, coverage/*).
- Tests that assert the current markup: letter.test.tsx:100,101,117,118,130; download-refusal.test.tsx:34; e2e download-refusals.spec.ts:106-109,128,139 (finding names only spec:107-109).

## Verdict
Real, nit (as rated), narrowed: the error-markup divergence after #74 is real; the 144 px scroll claim does not happen for focus (36 px in Chromium, 0 for the letter) and its cleanup is already in ADR 0079. Better fix: do not copy FieldError into letter.tsx now; whichever merges second moves the letter onto #74's FieldError/describedBy and drops scroll-mt-18 + updates the tests listed; in #78 now add a #74 overlap line in the PR body and add the letter controls to ADR 0079 :194-195.
