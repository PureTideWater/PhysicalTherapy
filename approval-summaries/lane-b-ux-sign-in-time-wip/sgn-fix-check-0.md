# sgn-fix-check-0 (security lens) - done
- Read diff vs e4e05a0d: routes/sign-in.ts, auth/sign-in.ts, actions.ts, step-timer.tsx, pages, db test.
- OK: POST form, origin-checked public action, clearPending keeps kept email, abandon releases grant once, seal outlives step limit so closed steps still release; SEC-02 clearSignIn on no_account; nothing new in URL/log.
- Finding F1 (should-fix): restartSignIn shares the 'mfa' bucket (10/5min per pending step, 30/5min per address) with answerMfa and both key ceremonies; a refused restart redirects to ?reason=restarted with the step still live (Back reopens it, grant held). actions.ts restartStep + sign-in.ts restartSignIn.
