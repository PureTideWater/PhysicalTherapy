# ss-build progress (co-001/ux-suspended-standing, /home/user/ux-suspended-standing)
- [x] ops pulled; designs/lane-b-ux-review.md absent (nothing added)
- [ ] step 1 tests first
- [ ] step 2 fix, docs
- [ ] step 3 checks
## Decisions taken (step 1 in progress)
- standingKind home: packages/billing/src/standing.ts, exported as @tp/billing/standing (NOT @tp/worker/billing: public.ts and account.ts are in the screening import closure -> a new file there changes #42's watched-paths.txt; apps/worker/package.json is #42's). account.ts must NOT import it. Console sort by kind done in web consoleBillingPage handler (stable sort over account.ts order).
- firm: billing suspended -> kind past_due (no run refused for a firm before M12); words make no run claim for firms.
- AccountStanding {kind,label,tone,title,notice,alert,nextSteps[{action,href,detail}],billingHold{kind,since,invoice},formsNote,planRefusal}; component components/billing/account-standing.tsx (AccountStandingSummary) with data-standing.
- seed: web SeedOrganization + 'suspended_group'; persona 'suspended-admin' (practice_admin); seed.ts creates SYNTHETIC SUSPENDED GROUP status suspended after seedSyntheticTenancy (packages/db untouched).
- support: supportRequestPage returns defaultCategory ('billing' for from=billing), test in onboarding-routes.db.test.ts.
- DB URL: postgres://postgres:test@localhost:5433/postgres
- [x] step 1 committed (tests first). Failures on base: standing.test 21/30 fail; account-standing.test 14/14; billing-routes.db 4 fail (holdingInvoice null x2, suspension prop present, closed org subscribe ok); onboarding support category missing; seed.db passes (fixture). e2e not run.
- NOTE: prettier (no repo config) reformatted commit 95c44ff by mistake; restoring files and amending. NEVER run prettier here.
- [x] commit amended: 057d4d9f tests first: one account standing on the billing page (BIL-05, BIL-06)
- step 2 code written (standing.ts, account.ts, billing.ts, component, billing page, console page, practice home, support.ts/page). Next: typecheck, db tests, docs rows, commit.
- [x] step 2 committed (fix + docs): 938f9916 Add BIL-05 and BIL-06 to the test matrix: one account standing, and a suspended organization's billing page 01f290db A suspended organization never reads "In good standing": one account standing on the billing page 
- [x] step 3: unit 493 pass; db billing-routes/seed/onboarding/worker billing 42 pass; route-tests 4,5,8,11 2298 pass; typecheck pass (web tsc clean); eslint clean; lint:copy clean; synth --all no change (BIL-05/06 expected.json committed in docs commit); verify-content pass. e2e not run. Only #42 files touched: test-matrix.md, matrix.ts, registry.ts (rows only). DONE — report remains.
