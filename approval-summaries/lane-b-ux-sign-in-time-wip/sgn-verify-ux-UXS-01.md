# UXS-01 verify
- clone uxs01-clone at e4e05a0d
- Checked sign-in.ts :185-188, :246, :431-434 at e4e05a0d; base bce57f16 has the same RESTART/'expired' -> /sign-in?reason=step_expired for the key step, words "That sign-in step expired. Start again from your email and password." -> pre-existing, not a regression.
- Key step limit 180 s = Cognito 3 min authSession that already returned 'expired' at base: reachability unchanged.
- Misdirected staff member: password + TOTP -> authenticated() refuses hardware_key_required -> /sign-in/hardware-key?reason=hardware_key_required. Detour, not dead end.
- Design 2.6 + section 9 R-04 (upheld by both skeptics) deliberately defer the redirect fix to UX PR 7; PR body :85 records it. Section 9 wins.
- Residual nit: deferral names components/hardware-key.tsx; the redirect lives in lib/routes/sign-in.ts (PR 7 touches it per design 3.5).
- Verdict: not real as a should-fix of PR #92 (not a defect of this PR).
