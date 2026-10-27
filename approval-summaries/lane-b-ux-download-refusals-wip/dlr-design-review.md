# dlr design review progress
Checked: design, UX-010, raw findings, handler.ts, downloadHandler uses (15 routes, design says 14), PW request headers (accept */*, no sec-fetch), e2e download events, download attrs, pages exist.
Findings so far:
- count 15 not 14 (nit)
- returnTo static but same route linked from multiple pages: reports list (:157,161,265,269), report review page (:44 pdf) -> propose closed `from` param
- pattern vs letterCodes diverge on non-ASCII ("ſ9711" accepted by letterCodes via toUpperCase) -> tighten letterCodes ASCII
- kept codes: attacker/typo text (member ID) echoed into URL+input; restrict kept codes
- uploads/[documentId]/page.tsx has no searchParams prop
TODO: next.ts loadPage/signInFor, strict schemas, coverage page params, co-001 branches, matrix/registry, brand, PermissionState, next.config/proxy, Response.redirect relative, optgroups.
- fields regex rejects camelCase (practiceId etc. from issuesOf path.join)
- monthly page params month no .catch -> keep invalid month = 404; keep only valid month
- forbidden words: roles managed by organization's administrator at /settings/organizations/[id]/users, not practice admin "Settings → Users"; console differs
- ux-forms (co-001/ux-forms, ADR 0077, FRM 16) changes 85 files incl compliance page, review page, reports/page, compliance.ts, field.tsx, form-issues.tsx, types.ts, common.ts: design understates overlap; letter form should follow FRM conventions
- fixtures: must add CASE_MODULES 'DLR' (expected/types.ts), MODULE_NUMBER DLR:18, registry none() entries, matrix.ts, test-matrix section, committed fixtures/synthetic/DLR-0N/expected.json (drift test)
- D1: restrict to Sec-Fetch-Dest document (download attr / Save link as => dest empty)
- BLOCKING: http.test.ts (#42) builds 4 download routes w/o returnTo (:296,:309,:320,:327) -> definition throw breaks them
- BLOCKING: autofocus skipped when URL fragment targets element (HTML flush autofocus candidates) -> D6 anchor+autoFocus contradict
- fixtures required (drift test fixtures.test.ts:91, registry ids :41)
- e2e: onboarding.spec has no letter test; use new spec
- urlPhiFindings (@tp/observability) should check Location
- next.ts untouched by open branches; no sign-in return path exists
Status: done, verdict build with changes, no migration.
