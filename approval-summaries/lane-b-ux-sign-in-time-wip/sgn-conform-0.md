# sgn-conform-0 server/security lens: started
Read design 2.1-2.7, 2.11, 3.1, 4.2, 9. Reviewed diffs: step-limits.ts, pending.ts, sessions.ts, sign-in.ts, dev-provider.ts, routes/sign-in.ts, db tests, notice/page.
Verified OK: R-01 order (kept email before beginTotpSetup), clearSignIn on session/lock/hkr/key_registered/first-step non-pending, expired keeps kept email, hardwareKeyOptions clears kept email, pendingOf server clock, no logs, no email in URL/error, watched-paths regenerated (schemas.ts already watched).
Findings: (nit) stepPage re-reads now() so closesIn may be <=0 at boundary vs pendingOf's now; (nit) clearKeptEmail has no doc comment.
