# SEC-01 verify
- started; using sec-clone at e4e05a0d
- step-timer.tsx:170-178: Start again renders only when phase is warning or closed (said !== null).
- step-limits.ts: warning 60s (3-min steps), 120s (register_key 15 min). Server closes at deadline (pendingOf, sign-in.ts:225-231).
- signInPage (257-262) reads kept email only; never clears pending -> mechanism real.
- Key sign-in is email + key only (hardwareKeyOptions/beginKey), so a key registered on register_key = takeover. Real impact if done in window.
- Residual window after Start again <= warning (<=2 min register_key, <=1 min others); strictly smaller than walking away (pre-existing, up to 15 min).
- ADR 0081 rejected POST as "more surface for no gain" - premise (next first step clears) fails if nobody submits.
- VERDICT: real, severity overstated -> should-fix. Fix (POST action, clearPending only, form in StepTimer) is right.
