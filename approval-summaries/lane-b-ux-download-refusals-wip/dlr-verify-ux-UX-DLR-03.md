# Verify UX-DLR-03 (codes field aria-describedby via spread vs ux-forms FRM-04 test)
Status: started. Clone at scratchpad/verify-uxdlr03.
- Confirmed at 63aaa7f4: letter.tsx:143 <Input pattern={LETTER_CODES_PATTERN}> gets aria-describedby only via {...controlMarks(...)} (line 153), new file in #78; base had no pattern on letter-codes.
- Confirmed ux-forms head 4f0b526d form-hints.test.ts:40-58 counts only JsxAttribute names hint/aria-describedby. PR 74 and 78 both open (REST).
- Design R10: "Whichever PR merges second moves the letter onto components/field.tsx." ux-forms Field hint/error are string; letter's hint/message use <Figure> (R18 mono) so Field needs ReactNode or loses mono.
- Next: worktree verify-uxdlr03-forms (ux-forms head + letter.tsx overlay), install, run form-hints test before/after fix.
- letter.test.tsx:82,99 at 63aaa7f4 shows rendered aria-describedby is correct (hint; error+hint): the defect is the static test only.
- Fixed copy for testing: scratchpad/verify-uxdlr03-fix/letter.tsx (describedBy + invalidMarks split).
- Install running in verify-uxdlr03-forms (log scratchpad/verify-uxdlr03-install.log).
- RAN (vitest, unit project) form-hints.test.ts in verify-uxdlr03-forms: A ux-forms head alone 3/3 pass; B + letter.tsx@63aaa7f4 FAILS with ["components/coverage/letter.tsx:143 <Input>"]; C + fixed letter.tsx 3/3 pass. Overlay removed.
- Next: install in verify-uxdlr03 (63aaa7f4), run letter.test.tsx + tsc with fixed letter.tsx.
- RAN in verify-uxdlr03 (63aaa7f4): letter.test.tsx 9/9 pass at head and 9/9 with fixed letter.tsx; tsc --noEmit -p apps/web exit 0 and eslint clean with the fix. File restored, clone clean.
- No other pattern field in #78's .tsx (git grep), so letter.tsx:143 is the only FRM-04 failure the merged tree would show.
VERDICT: REAL, should-fix (CI red for whichever of #74/#78 merges second; rendered page correct). Finding's fix verified best: a spread-aware test would be weaker; moving onto Field (R10) needs ReactNode hint/error (ux-forms field.tsx:22-24 are string; R18 mono Figure asserted letter.test.tsx) so is later work. Done.
- Resumed run (2026-10-27): re-read letter.tsx:59-67,143-153 at 63aaa7f4 and form-hints.test.ts:40-58,17-20 at ux-forms 4f0b526d: unchanged, ALLOWED holds only app/console/support/page.tsx. REST: #74 open at 4f0b526d, #78 open, head now 53c7224f (one commit, tools/screening-capacity/watched-paths.txt only; letter.tsx unchanged, so finding still applies at head). Verdict unchanged: REAL, should-fix, fix as stated.
