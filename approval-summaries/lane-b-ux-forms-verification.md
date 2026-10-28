# PR #74 fresh-clone verification (wf_4be80bed-13f, 2026-10-28 ~02:58 to 03:17 UTC)

**Verdict: PASS.** Blockers: none.

## Head
Fresh clone at /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/verify-clone, checked out at 8cab9c9c…. That is the same commit as origin/co-001/ux-forms. Its merge-base with the base branch is a6e754fc…, which is the tip of claude/build-platform and the PR's base. pnpm install --frozen-lockfile under the lock exited 0, and the tree stayed clean before and after every step (git status shows 0 changes). At 03:04 UTC (git ls-remote) neither ref had moved: base a6e754f, head 8cab9c9. The PR is open and still a draft; GitHub reports mergeable=true and mergeable_state=clean.

## The description's claims
Description: my first read at about 02:48 got the older text (14,686 B, which says "ran again on the head, 34f7427"). PR updated_at is 02:47:22, so that read looks like a cached copy. The re-read at 02:54 gives the current body (15,549 B). It matches the prepared scratchpad/pr-body-2.md except for one trailing newline. It names the head 8cab9c9 and has the #79 merge-audit row. Everything below was checked against that current body.

TRUE: all 8 template headings are there, in order. All 6 "does not change" bullets are answered. The required-checks marker line and "The founder's approval" match the template word for word.

TRUE: git diff --name-only a6e754f 8cab9c9 lists 113 files. None is a migration, none is under packages/pricing, packages/ledger, content/ or .github, and docs/product/domain-model.md and approvers.json are unchanged. No package.json or lockfile changed, so there is no new dependency. No next.config, middleware or CSP file changed, and no added line writes a style attribute.

TRUE: ADR 0077 is new (status A). It amends ADR 0056 D6 (16 px controls below 48rem), and ADR 0056 and BRAND.md carry the amendment. It says the values are lost without JavaScript (Consequences and Not covered). It has D1 to D11 as the description summarises them. Its Not covered section has the StackedRows line for the 34th PR. D10's mark is an HMAC from sealer.sign under the purpose form-actor, as claimed (next.ts:98, seal.ts:35).

TRUE: FRM-01 to FRM-08 are identical (title and assertion) in docs/product/test-matrix.md and TEST_MATRIX in matrix.ts (scratchpad/verify-bin/frm-check.mts, log verify-logs/frm-check.log). Every registry assertedBy file exists (29 references over 8 rows).

TRUE against /home/user/ops/designs/lane-b-release-content-checks/pr42-files.txt: the PR shares only test-matrix.md, matrix.ts, registry.ts and watched-paths.txt with #42. watched.test.ts passes 6/6, so watched-paths.txt is what the generator writes.

TRUE: no model identifier in the 6,349 added lines. No new log call and no use of browser storage.

TRUE: no PHI-like data. The new fixtures FRM-01..08/expected.json hold no files. Test data uses SYNTHETIC names and synthetic.test or example.test emails. The probes W123456789, DOB 1961-04-12 and 919-555-0134 were already in onboarding-routes.db.test.ts at a6e754f, and check:fixtures passes.

TRUE: every commit the findings table names is an ancestor of 8cab9c9 (4f0b526, 3b94e23, a57fbf5, 001cdbf, 34f7427, 8cab9c9, and also e908c21, 085299b, 0dd1ba7 and ae26bf7). The defect fix (FormKeys added on the coverage page), the six-digit code accepting spaces and hyphens, aria-disabled, the "Emptied for your security" wording, removal of the labels prop and FORM_LABELS, and the "no payment method" reword are all in the diff.

TRUE (new body): #79 shares 30 files with the branch (diff 0dd1ba7..34f7427 against #79's own diff). The 8cab9c9 commit has the brand.css outline-offset -4px rule and the ADR 0077 line. There are 253 synth cases (218 plus 35 variants) and 62 e2e tests in 28 spec files, tables-phone.spec.ts included. The local suite counts on 8cab9c9 rest on the earlier merge79 run log and were not re-run here, except for what is listed under subset.

IMPRECISE (not a blocker): "7 conflicts resolved by hand". A fresh git merge-tree of 34f7427 with a6e754f reports 14 conflicted files: the 7 .tsx files resolved by hand, plus synthetic-personas.ts, ADR 0056, test-matrix.md, common.ts, matrix.ts, registry.ts and types.ts. All 14 keep both sides (combined lines: CASE_MODULES ending FRM, TBL; MODULE_NUMBER FRM 16 and TBL 17), so "both PRs kept in all 30 shared files" holds.

WEAK (not a blocker): U-UX-7 points at "(ADR 0077, Revisit when)" for a separator rule. That section names the words pass after #42 but not a separator rule.

## The local subset in the fresh clone
Clone at 8cab9c9, each step under flock /tmp/laneb-heavy.lock, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers. playwright-core 1.64.1 pins Chromium revision 1248, and FORMS_HARNESS_CHROMIUM was unset.

| Command | Result |
| --- | --- |
| pnpm typecheck | passed, 22 of 22 projects (cold, 83.6 s) |
| pnpm lint:copy | passed, 519 files |
| vitest unit, apps/web/src/components | 30 files, 326 passed, 0 skipped, 0 failed; browser tests ran: action-form.browser 37, split-form.browser 4 |
| vitest unit, packages/synth | 13 files, 185 passed (fixtures.test included) |

Extra checks while CI finished:

| Command | Result |
| --- | --- |
| pnpm lint | 1,639 files, 0 errors, 0 warnings |
| pnpm check:fixtures | passed, 333 guard files |
| pnpm lint:logs | passed, 1,064 files |
| unit tests of lib/http, lib/copy, lib/auth, packages/ui and app | 14 files, 174 passed |
| tools/screening-capacity/watched.test.ts | 6 of 6 |
| gitleaks 8.24.3 over a6e754f..8cab9c9 (remerge) | 10 commits, no leaks |
| db tests sign-in-routes, onboarding-routes and workbench-routes, on a fresh tp_verify74_db (5433, 44 migrations) | 3 files, 33 passed; the database was dropped afterwards |
| playwright --list | 62 tests in 28 files |

Logs are in scratchpad/verify-logs.

## CI on the head
22 check runs on 8cab9c9c…, all completed by 03:04:28 UTC, with no failure.

| Check | Conclusion |
| --- | --- |
| all green | success |
| mutation | success |
| screening-capacity gate | success |
| approval-of-record (x2) | success |
| static | success |
| lint | success |
| unit | success |
| db (1/4) | success |
| db (2/4) | success |
| db (3/4) | success |
| db (4/4) | success |
| domain model | success |
| build | success |
| images | success |
| e2e (1/2) | success, 31 passed, brand baselines regenerated from nothing and identical |
| e2e (2/2) | success, 31 passed |
| capacity | success |
| changes (mutation) | success |
| changes (screening-capacity) | success |
| stryker (${{ matrix.shard }}) | skipped by design: no money path changed |
| notify | skipped: only runs outside a PR |

"all green" (ci.yml:776) is an aggregate job: it needs static, lint, unit, db, domain-model, build, e2e and images, and passes only if all of them succeeded. The ruleset on claude/build-platform requires exactly all green, mutation, screening-capacity gate and approval-of-record, under the strict up-to-date policy, and all four are green. approval-of-record notes that APPROVAL_REVIEW_REQUIRED is unset, so no review is required yet.

No other workflow ran. release-dry-run and content-calendar only run on paths this PR does not touch.

The capacity run and the gate give two advisory warnings: "Sizing question (O9)", worst S4-2 at 57.0 s, above 44 s; and "Time (advisory)", S4 at 56.3, 57.0 and 55.4 s, above 48 s. The same warnings appear on base push 0dd1ba7 (52.2 s) and on 34f7427 (53.1 s). The free runner's times vary from 38 to 57 s on the same code, and this is tracked in issue #41 ("Revisit before launch"; the founder: a PR's time is only a warning). This PR does not change the screening consumer.
