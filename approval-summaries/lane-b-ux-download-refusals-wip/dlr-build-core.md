# dlr-build-core progress (builder: shared core, UX PR 5)
Worktree: /home/user/ux-download-refusals (no commits by me)
## Status
- [x] 1 route.ts ReturnPage/ReturnTo + CommonSpec.returnTo + Route.returnTo; invoke.ts Shape + common() copies (null when absent)
- [x] 2 lib/http/sign-in-for.ts (signInFor moved unchanged); next.ts imports it; guardMessage uses minutesWords (same words)
- [x] 3 handler.ts: isNavigation (exported), acceptRanges/prefersHtml, returnPageOf (catches throw), refusedNavigation 303; doc comments updated
- [x] 4 lib/http/download-refusal.ts: DOWNLOAD_REFUSALS, SIGNED_OUT_REFUSALS, REFUSED_FIELD, MAX_REFUSED_FIELDS, MAX_RETRY_MINUTES, minutesWords, safeReturnPath, refusalLocation, RefusedDownload, downloadRefusalParams, downloadRefusal, pagePath, returnPage, cameFrom, keptId, keptMonth, keptCodes, ReturnParams
- [x] 5 components/download-refusal.tsx: DownloadRefusal {refusal, surface?, invalid?, autoFocus?, className?}, downloadRefusalWords, DownloadSurface; scroll-mt-18 (h-14 header + 16px)
- [x] 6 letter.ts: letterCodes tests /^[0-9A-Za-z]{5}$/ before upper-casing; LETTER_CODES_PATTERN exported from letter.ts; letter.test.ts updated
- [ ] 7 download-refusal.test.ts (+ components/download-refusal.test.tsx)
- [ ] checks
- [ ] dlr-api.md
## Decisions/notes
- Words: invalid general body changed from D5 "Check the fields marked below" to "Reload the page and try again." (only link pages use the default; the letter overrides)
- refusalLocation drops any kept value with a PHI shape (textPhiFindings) beyond R08
- safeReturnPath is an allowlist: (/[A-Za-z0-9._~-]+)+ and resolved pathname unchanged on origin
## Commands run
- (typecheck hook runs after each Edit: passed after edits completed)
- tsc -p apps/web --noEmit: pass (no errors)
- vitest download-refusal.test.ts + letter.test.ts: 115 pass, 15 fail = exactly the R01 registry scan (every download route lacks returnTo until page builders add it)
- temp returnTo on payerLetter/exportEvidence/reportPdf (reverted with git checkout): those 3 scan cases pass
- vitest component test + letter + http.test.ts + registry.test.ts + partition.test.ts: 303/303 pass
- [x] 7 tests written (download-refusal.test.ts, components/download-refusal.test.tsx)
- vitest --project db contracts-routes.db.test.ts -t "payer and plan mapping and coverage": 4 pass (the letter route's db test, ASCII codes unchanged). (-t on the letter test alone fails: its setup is an earlier test in the block)
- eslint (11 files): 1 error (no-assign-module-variable: `module` in test) -> renamed to `exported`
- eslint (11 files) after fix: exit 0
- pnpm lint:copy: pass (517 files); pnpm lint:logs: pass (1057 files)
- tsc -p apps/web --noEmit (final): exit 0
- vitest unit (6 files: download-refusal, component, letter, http, registry, partition): 409 pass, 15 fail = the R01 scan only
- [x] dlr-api.md written
- vitest --project unit apps/web (68 files): 899 pass, 15 fail = the R01 scan only
## DONE (core). Next: page builders add returnTo to the 15 routes (scan then passes), pages, e2e, docs, synth.
