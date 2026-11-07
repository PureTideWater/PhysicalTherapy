# verify bceda579 (fresh clone)  started 2026-11-07T10:57:14Z
## 1 clone
- fresh clone /home/user/vx-ufa42; origin/co-001/ux-forms-after-42 = bceda579; base 8a722f80 ancestor; 71 commits. PR draft, base claude/build-platform @8a722f80.
## 2 CI on bceda579
- 35 check runs: 34 success, notify skipped (screening-capacity.yml notify: failure() && not pull_request -> by design).
- required: all green, mutation, screening-capacity gate, approval-of-record (x2, both success; "needs no review of record", APPROVAL_REVIEW_REQUIRED unset).
- unit 482 files, 10031 passed | 2 skipped (PR: 10029 + 4 skipped locally; same 10033 total; 2 Chromium-only tests ran in CI).
- db 3291/2256/3315/1010 = 9872 passed, 0 skipped (PR 9871 + 1 skipped; same total).
- e2e 42+42=84 + baseline step 5 brand (writes to temp baselines by design). skip-link.spec CI-30 ran.
- mutation packets 99.11% 9895/9983, 88 recorded equivalents, gate passed (matches PR). capacity verdict pass (time advisory, by design).
- warnings: sha256sum icudtl.dat I/O error is deliberate fixture in tools/ci/browser-build.test.ts:445; others benign.
## 3 diff (87 files, +2653/-606, matches PR)
- no migration, lockfile, .gitleaksignore, content/releases, approvers.json, domain-model change. No model id, no 835 segments, no PHI-shaped data (dates are synthetic test/ADR dates).
- legal surfaces: only marked files touched are screening/page.tsx and upload-form.tsx; marked blocks byte-identical before/after; retention.ts, address.ts, result-summary, convert-form, results/* untouched.
- convert-form refusal words change via screeningConvert route: declared in PR decision 11 and the changed-strings table; no result-screen file edited.
- last commit bceda579 = 2 files (routes.ts + its db test), as PR says.
- CI-30 identical in test-matrix.md, matrix.ts, fixture expected.json; registry.ts entry cites skip-link.spec.ts + a11y.ts; spec cites CI-30 twice; ran green in e2e (2/2).
## 4 local (fresh clone, under lock)
- pnpm install --frozen-lockfile ok; pnpm typecheck: 23 projects passed.
- vitest unit: components/screening, components/form-issues, lib/routes/messages.test.ts, settings/user-rows.test.tsx: 9 files, 149 passed, 0 skipped.
- own probe (temporary zz-probe.browser.test.tsx on the in-repo Chromium harness, screeningUpload form): (a) no file chosen -> summary shown, focus on file field/summary, all four typed values kept, no action call, page URL unchanged; (b) server refusal of contactEmail -> focus #field-contactEmail, values and ready file kept; (c) form-level refusal -> values kept. Every request and navigation URL checked: no typed value (encoded or not). 2/2 passed. No-JS path: SSR test (method=post, no action attr) + e2e FRM-06 green in CI.
- spot: users-page Members/Invitations in ScrollTable; row controls name member by email (sr-only / aria-label); shell SkipLink to main#content; BRAND.md one rule bullet.
## 5 clone removed. Verdict: pass, no blocking, no should.
