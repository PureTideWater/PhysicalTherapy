# PR #54 fix round: re-read, base merge and full suite

Worktree /home/user/materiality-cents, branch co-001/materiality-cents. Nothing pushed, no branch switched, no rebase.

## Commits (c74d304..HEAD)

- 755122e8 Settings amounts in dollars, after review: "$5" and "1,250.00" accepted, labels in refusals, money fields, PLB direction in words. This is the fixer's commit.
- c23441fb Settings amounts in dollars, after review: comments and a test title say what the code does. This is my commit from the adversarial re-read.
- 4a2ee323 Merge claude/build-platform (4d99df80, PR #46 database-function diffs) into co-001/materiality-cents: no conflicts, both lanes' rows kept (LANES.md rule 6).

Final head: 4a2ee323.

## What the adversarial re-read found (fixed in c23441fb)

1. **The MoneyField docstring overstated what it does.** It said "The save reads it with dollarsField". Settings → Defaults uses MoneyField, but its save is still #42's settings.ts parser, which refuses "$5" and "1,250.00". The docstring now says what holds on every page: pre-filled with dollarsForInput, the field reads back through the save as the same cents (CAS-39).
2. **The MODEL_VALUE_LENGTH comment did not match its value.** It called 24 "the largest budget written with $ and commas", but its example "$ 9,999,999,999.99" has 18 characters. It now says "room for" that example and gives the 18 characters.
3. **A receipt test title was stale.** The title still said "say a negative provider adjustment as -$1.00", while the test now asserts "added $1.00 to the payment". The title now reads "say which way the provider adjustments moved the payment, and by how much; none is not said".

Checks: vitest receipt-labels and defaults, 27/27 passed; eslint on the 3 files is clean.

Everything else in the dispositions matches the code, the tests and the docs:
- The balance-direction wording (UX-11) matches the parser's sign in all four scopes:
  - transaction: claims − PLB − payment (transaction.ts:908)
  - claim: charge − CAS − line CAS − paid
  - claim_lines: Σ line charges − claim charge
  - line: charge − CAS − paid (balance.ts:71-75)
- The PLB direction (UX-4) agrees with transaction.ts:908.
- formatUnroundedUsd on the line page (UX-3) only receives decimal text. trace.ts decimalText validates it, and the engine writes it as before.toString(), so the page cannot throw.
- In practice-settings.ts, all four console money fields read dollarsField: lineMateriality, caseMateriality, anomalyThreshold and staffRatePerHour. UX-12's "4 console fields" is correct.
- CAS-38's wording is identical in test-matrix.md, matrix.ts and fixtures/synthetic/CAS-38/expected.json. CAS-39 is still accurate.
- No old wording is left in this PR's files: "Now $", "provider adjustments of", "a save can store", "dollars and cents, such as 5.00". The only remaining "dollars and cents, such as 5.00" is in #42's settings.ts:274, which is the hand-over.
- Of #42's files, the diff touches only test-matrix.md and matrix.ts, which are allowed. settings.ts, console.ts and registry.ts are untouched by this lane. Nothing changed under packages/money, pricing, ledger or db.

## Dispositions

- MC-M1: Fixed (755122e8). dollarsField covers [0, 999,999,999,999] cents with an optional "$" and exact comma groups. DOLLARS_MESSAGE is shared. The property test runs to the 12-digit maximum.
- MC-M2: Fixed (755122e8). saveUnchanged removes the five keys and checks they are gone, then checks the save wrote them back. The boundary loop stays at 99,999,999,999, because #42's settings.ts parser takes no more.
- UX-1: Fixed (755122e8), together with MC-M1.
- UX-2: Fixed (755122e8). The defaults cards, the cases page, the console models form and the console practice settings all name refused fields by label. A unit test checks that no camelCase key appears. Docstring corrected in c23441fb.
- UX-3: Fixed (755122e8). The line page shows the unrounded amount through formatUnroundedUsd and adjustment names through labelOf.
- UX-4: Fixed (755122e8). The receipt and the upload page say "withheld from" or "added to" the payment. Test title corrected in c23441fb.
- UX-5: Fixed (755122e8). Added the Counted component: "1 minute a packet".
- UX-6: Fixed (755122e8). The three pursuit fields are in a fieldset, with the rule as its description.
- UX-7: Fixed (755122e8). The card now states the thresholds and the defaults. The e2e triage.spec now ran and passed (shard 2).
- UX-8: Fixed (755122e8). The hint says dollars and the flag name has no unit. The form split is a proposal. Length comment corrected in c23441fb.
- UX-9: Fixed (755122e8). below_materiality is raised under REFUSED_FIELD.
- UX-10: Fixed (755122e8). The parse-report counts use Counted.
- UX-11: Fixed (755122e8). An imbalance is given as its size, with the direction in words for each scope. Signs verified, as above.
- UX-12: Fixed (755122e8). MoneyField is used for every dollar-only input this PR touches.

## Base

origin/claude/build-platform is at 4d99df80 (PR #46, database-function diffs). The merge (4a2ee323) used --no-ff and resolved automatically with no conflicts.
- Files this PR also changes: docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts. All three keep CAS-38, CAS-39 and DBF-01..05.
- The merge also brought in common.ts (DBF: 13), types.ts (CASE_MODULES + DBF) and the DBF fixtures.
- pnpm-lock.yaml and package.json are unchanged, and the merge touches no file under apps/web.

## Full local suite on 4a2ee323

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24 and PG18 on 5433.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass. Already up to date. |
| pnpm check:fixtures | Pass. 248 files read, 3,176 searched. |
| pnpm typecheck | Pass. 22 projects. |
| pnpm lint | Pass. 1,502 files in 3 groups, 0 errors, 0 warnings (84 s). |
| pnpm lint:copy | Pass. 495 files. |
| pnpm lint:logs | Pass. 1,003 files. |
| pnpm verify-content | Pass. |
| tsx tools/engine-freeze/check.ts 4d99df80 (merge base) | Pass. No non-test pricing change, no problems. |
| pnpm synth --all, then git diff --exit-code | Pass. 203 cases: 0 written, 486 unchanged. EMR: 8 formats, 16 unchanged. The tree is clean. |
| pnpm test | Pass. 327 files: 5,096 passed, 3 skipped (190 s). |
| pnpm test:golden | Pass. 4 files, 188 tests. |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 637 (626 valid, 11 malformed), and edi835 agrees. |
| pnpm db:migrate (5433, fresh database tp_mcs_migrate, dropped afterwards) | Applied 44 migrations. None were applied beforehand. |
| pnpm test:db --shard=1/6 | Pass. 20 files, 2,416 passed (131 s). |
| pnpm test:db --shard=2/6 | Pass. 20 files, 778 passed, 1 skipped (97 s). |
| pnpm test:db --shard=3/6 | Pass. 20 files, 2,479 passed (173 s). |
| pnpm test:db --shard=4/6 | Pass. 20 files, 1,810 passed (110 s). |
| pnpm test:db --shard=5/6 | Pass. 20 files, 1,393 passed (199 s). |
| pnpm test:db --shard=6/6 | Pass. 20 files, 193 passed (67 s). |
| test:db total | 120 files, the same as `vitest list --project db`: 9,069 passed, 1 skipped, 0 failed. |
| pnpm build | Pass. |
| build-stamp.ts --write 4a2ee323f88d… | Stamped 4a2ee323. The web server read "the build is 4a2ee323…'s". |
| E2E_ADMIN_URL=…5433 E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr54 E2E_PORT=3154 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 26 passed (4.3 min). |
| same, --shard=2/2 | Pass. 25 passed (4.0 min). Both screening.spec and triage.spec passed; triage.spec is the CAS-38 locator updated by the fixer, which had not been run before. No flake re-run was needed. |
| e2e total | 51 passed, 0 failed. I dropped tp_e2e_pr54 afterwards and left tp_e2e_screens as found. |
| tsx tools/stryker/affected.ts --event pull_request --base 4d99df80 | No shards: money, pricing, ledger and packets are all not affected. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed". |
| Model identifiers in git diff 4d99df80 HEAD and in the messages | None, apart from the attribution lines. |

About the e2e database: PG16 on 5432, the e2e default, was down. So e2e used PG18 on 5433 through E2E_ADMIN_URL, which matches CI, instead of starting PG16.

## Proposals

- The PR #54 description (scratchpad pr54-body.md) was written before the fix round. Refresh it with the dollar-input range ($, commas, 10 whole digits), DOLLARS_MESSAGE, MoneyField and Counted, and the PLB and imbalance wording.
- Carried over from the fixer:
  - On the remittance page, give the 'Provider adjustments' direction through providerAdjustments().
  - flows-other-10: split the console models form by flag.
  - Lane A: settings.ts adopts dollarsField after #42, and the CAS-39 loop adds 999,999,999,999.
  - Route PATTERN_NOT_WAITING through REFUSED_FIELD.
  - brand-10: a <Figures> component.
