# SGN build fixes (integrator round on SGN-SEC-01/02, N1, N2)
- SGN-SEC-01 real: pendingOf takes `now` (default services.now()), stepPage(pending, now); the four step pages take now once. DONE
- SGN-SEC-02 real: doc comment on clearKeptEmail. DONE
- N1 real: ADR 0081 Consequences sentence rewritten per registry (+ sign-in.db.test.ts SGN-04). DONE
- N2 real: harness PageKeys.restartHref optional; browser test SGN-02 rerenders with a hardware-key path, asserts href + no '@'. DONE
- Checks (rerun 2): tsc -p apps/web 0 errors; eslint 5 files clean; vitest unit 6 files 52/52 pass; PG18 :5433 was down (stale pid after restart), restarted with pg_ctl as postgres; db sign-in-routes + sign-in 26/26 pass. e2e not rerun (spec unchanged). DONE
