# SEC-02 verify (done)
- Clone sec-clone at e4e05a0d.
- Confirmed: lib/auth/sign-in.ts:137-141 authenticated() returns refused('no_account') for a disabled account after a valid code; routes/sign-in.ts:199-201 returns the error and clears neither cookie. Unchanged from base for pending; kept email is new in this PR.
- ADR 0081 D6 lists where the kept email ends (session, lock, key required/registered, any first step); disabled-mid-attempt is not listed, so code follows ADR; mismatch only with pending.ts:14 "ends wherever the attempt does".
- Exposure = the ADR's already-accepted residual for an abandoned step (consequences, lines 150-153): own address, same browser, <=18/30 min, gone on next first-step submit.
- Verdict: real mechanically, severity nit (not should-fix). Fix as proposed is fine.
