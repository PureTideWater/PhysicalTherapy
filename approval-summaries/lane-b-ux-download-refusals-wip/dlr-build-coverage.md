# dlr-build-coverage progress (builder: Coverage + e2e, UX PR 5)
Worktree: /home/user/ux-download-refusals (no commits by me)
## Status
- [ ] 1 lib/routes/coverage.ts payerLetter returnTo
- [ ] 2 coverage/page.tsx letter form
- [ ] 3 e2e/download-refusals.spec.ts
- [ ] checks
## Commands run
- [x] 1 coverage.ts: payerLetter returnTo = returnPage(coveragePage.path, params, {payer: keptId, contract: keptId, codes: keptCodes}); doc comment added; issue message unchanged
- [x] 2 (draft) letter form moved to NEW components/coverage/letter.tsx (PayerLetter), page.tsx renders it in CardContent flex gap-3, reads searchParams once
  - marks: invalid fields payer/contract/codes; not_found -> payer; notice (DownloadRefusal) only when nothing marked (or no payers)
  - improvement: field wrappers min-w-0, selects max-w-full (as SelectField), aria-invalid:border-destructive on selects; codes input mono tabular
- e2e plan: own practice 'SYNTHETIC OTHER PRACTICE DOWNLOADS' via journeyPractice; new personas refusals-manager / refusals-viewer (other_group) in scripts/synthetic-personas.ts;
  upload CAS-08 via browser + local worker; signedOffSchedule; insert 2nd payer SYNTHETIC PAYER DLR (owner SQL); letter steps; pricedAndTriaged; generate report via UI; viewer goto csv
- [x] 2 done: NEW components/coverage/letter.test.tsx (9 tests, markup-based; no DOM env in repo)
- cmds: tsc -p apps/web --noEmit: exit 0 | vitest letter.test.tsx: 9 pass | vitest download-refusal.test.ts: 119 pass, 8 fail = reports routes only (another builder, in progress); payerLetter scan case passes | eslint 4 files: exit 0
- NOTE: other builders edit the same worktree concurrently (packets, uploads, compliance, reports pending)
- [ ] 3 e2e: next
- [x] personas added: scripts/synthetic-personas.ts refusals-manager (other_group billing_manager), refusals-viewer (other_group viewer); doc comment extended
- [x] 3 draft: apps/web/e2e/download-refusals.spec.ts written (one journey test, 6 steps); tsc exit 0
- e2e run 1 started (bg): E2E_DATABASE=tp_e2e_dlr E2E_PORT=3197 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers flock lock playwright test e2e/download-refusals.spec.ts --workers=1; log progress/dlr-e2e-run1.log
  - expected: viewer step (reports CSV) fails until the reports builder adds returnTo to reportCsv + DownloadRefusal on the report page
- e2e run 1 (15:13-15:16 UTC, exit 1): steps 1-5 PASSED (letter codes refusal kept/marked/focused + 303 headers + axe 1280 + atPhoneWidth 390; contract refusal; not_found payer; pattern blocks ABC; good letter downloads). Step 6 FAILED as expected: viewer's /reports/<id>/csv navigation landed on '/' -> /p/<other practice> (reportCsv had no returnTo when built; reports builder in progress)
- e2e run 2 (15:17-15:19 UTC): 1 passed (1.7m; test 24.2s) - all six steps incl. viewer forbidden notice focused on /reports/<id>?refused=forbidden, axe, script 403 JSON
- spec made retry-safe (uploadedEarlier/untilLoaded as viewer-phi.spec); eslint 6 files exit 0; tsc exit 0
- next: e2e run 3 to confirm; seed.db.test for the personas
- e2e run 3 (15:20-15:22 UTC, retry-safe spec): 1 passed (1.5m; test 22.3s)
- vitest --project db scripts/seed.db.test.ts: 1 pass | contracts-routes.db.test.ts -t "payer and plan mapping and coverage": 4 pass
- vitest 5 files (letter.test.tsx, download-refusal.test.ts, download-refusal.test.tsx, letter.test.ts, registry.test.ts): 392 pass (reports builder done: scan all green)
- lint:copy pass (517), lint:logs pass (1058); first lint:copy ran without the lock (light)
- cleanup: dropped tp_e2e_dlr, removed its tmp dirs; port 3197 free
## DONE (coverage + e2e)
