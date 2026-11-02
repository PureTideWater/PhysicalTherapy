# UXS-04 verify (clone scratchpad/uxs04-clone at e4e05a0d)
- register-key/page.tsx:26 StepTimer has no notes; base words (step-timer.tsx:76-77) say only "email is kept, and you type your password again".
- register_key pending only from SignInFlow.authenticated (lib/auth/sign-in.ts:146-149), reached only after TOTP (mfa or mfa_setup); start() -> provider.signIn(email,password) gives mfa_required for an enrolled user. So restart = password + code + register again. Confirmed.
- Design 6.1 departure row itself says restart "costs the password (and a new code)"; section 9 does not address it.
- Enroll restart asks no code (not yet enrolled), mfa/new-password: next step self-evident. Only register-key understated.
- Limit 900s, warning at 120s (13 min) -> finding's numbers right.
VERDICT: real, nit, fix right (notes prop as enroll does; update design 6.1, step-timer/e2e/tour expectations).
