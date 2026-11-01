# sgn-revise progress (decisions made; design edits pending unless marked DONE)
Code checked at 83d71fd6. #42 open be63bdc2 219 files; dev-provider.test.ts, ADR 0077, hardware-key/page.tsx not #42's; legal-surfaces.md is #42's.
- R-01 applied: settle pending branch writes kept email (use from passwordSaved) BEFORE beginTotpSetup; 4.2 test 5b.
- R-02 applied: link one JSX position, no key; harness 2b.
- R-03 applied+improved: stacked-cell cue in the limit sentence's place (open/warning/closed phrases, one grid cell, inactive invisible+aria-hidden, no shift); assert cue in view at 390x500 field focused (harness 10, e2e 1, e2e 3); full words+link stay below; record remainder in 2.9; risk row 12 rewritten.
- R-04 applied: SignInNotice({reason, kept?, surface?}); key page words; hardware-key/page.tsx in 3.3; PR 7 starting point.
- R-05 applied: wrapper structure; region no box classes until warning/closed; height 0 test.
- R-06 answered: keep "within a minute" (house copy sent.ts:28; no digits rule in brand.md); fix 6.1's rule statement.
- R-07 applied: 0077:3 status.
- R-08 applied: risk row.
- R-09 applied: nav.responseStart correction only when location.href===nav entry name and no anchor yet.
- R-10 answered: no 7.2 proposal (tp_sign_in already seals address; legal-surfaces lists no strictly necessary cookies); 2.11 line.
- R-11 applied with skeptic answered: import type + Record<StepName,...> tables (exhaustive, like STEP_PAGES routes/sign-in.ts:58).
- R-12 applied: dev-provider.test.ts:83 uses constant, SGN-01; drop step-limits test 4.
- R-13 applied: guard active===null||body; not shared (takesFocus tied to refusal registry).
- R-14 answered: state needs out-of-app Cognito MFA reset; no code resets MFA; reviewer fix would drop correct numbering; risk row accepted.
- R-15 applied.
- design edits DONE for R-01..R-15 (2.1,2.4,2.6,2.9,2.10,2.11,3.x,4.x,5.3,6.x,8); remaining: section 9 table
- section 9 DONE
- ALL DONE; design 1719 lines; return summary next
