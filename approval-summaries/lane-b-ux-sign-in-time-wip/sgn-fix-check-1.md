# sgn-fix-check-1 started; reading diff
Read full diff (UI, lib, e2e, docs). Checked: Start again one JSX node across zero (ok, test 2b), ArrivalNotice role=note no live region (ok, notice.test), first-render within ceil (ok), brand words (ok).
Findings (all nit):
1. step-timer.tsx:75-77 open phrase recomputed from each render's closesIn: a render in place (refused new password rewrites cookie -> Next refresh) flips "stays open for 3 minutes" to "closes within 3 minutes"; harness render-in-place test uses 240_000 so does not catch it.
2. register-key/page.tsx:33 closed-state note untested (e2e asserts warning only).
3. step-timer.tsx:189-193 Start again button has no pending feedback (no useFormStatus); slow network press shows nothing, second press re-posts.
DONE
