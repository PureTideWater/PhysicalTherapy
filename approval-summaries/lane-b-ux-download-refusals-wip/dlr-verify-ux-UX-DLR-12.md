# UX-DLR-12 verify (accessible name of focused notice)
Status: started. Cloning to scratchpad/verify-uxdlr12.
## Checked (clone verify-uxdlr12 @63aaa7f4)
- download-refusal.tsx:66-79: Alert div role=alert tabIndex=-1 autoFocus, no aria-label/labelledby -> author name empty (fact true). Alert = packages/ui alert.tsx:18 (plain div). ActionForm summary action-form.tsx:93 same unnamed pattern.
- ARIA 1.2 alert: name from author, name NOT required. WCAG 4.1.2 targets UI components; a focus-target status container is not one; axe has no alert-name rule.
- GOV.UK Frontend CHANGELOG 4.4.0 (PR #2677): REMOVED aria-labelledby (and moved role=alert to inner wrapper) from the error summary because with labelledby JAWS 2022 on page-load focus read only the title; current GOV.UK markup = unnamed. So the fix cites a pattern GOV.UK abandoned; with labelledby the body (the next step) is left to aria-describedby (verbosity-dependent).
- 7 call sites; reports page renders one of two conditionally (no duplicate ids today).
- Leaning: NOT REAL (not a defect); fix would be a regression.
- Chrome probe (scratchpad/verify-uxdlr12-probe/axname.cjs, playwright 1.56.1, synthetic markup): PR shape focused via native autofocus, AX role=alert name="" live=assertive; proposed fix -> name=title, desc=body; GOV.UK v5 shape -> focused element is unnamed group too.
- No screen reader available here; no evidence any SR says only "alert" on focus to an unnamed container (they read its content; GOV.UK relies on this).
## Verdict: NOT REAL (not a defect). Do not apply the fix. DONE.
