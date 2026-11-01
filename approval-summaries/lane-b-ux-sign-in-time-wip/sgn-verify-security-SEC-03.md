# SEC-03 verify (skeptic) - DONE
Clone: scratchpad/sec-clone at e4e05a0d (reused).
Checked:
- sign-in.ts:177-179 invalid_password branch: from undefined -> {} meta -> writePending counts from now, stepClosesAt undefined. Code does what the finding says.
- Producers of invalid_password: only SignInFlow.newPassword (auth/sign-in.ts:188), from provider NewPasswordStep. start/beginKey/beginTotpSetup/etc never return it.
- Only route calling newPassword (sign-in.ts:311) passes `pending` from pendingOf as `from`; settle callers without from (start at 275, key options at 398) cannot receive invalid_password. beginTotpSetup recursion (167) forwards options incl. from.
- Hypothetical future caller has no prior step to extend; the fresh seal still expires pendingSeconds from now.
Verdict: not real today (unreachable); a hardening nit at most. Fix in finding (restart when from absent) is fine; a narrower option: type settle's invalid_password path to require from.
