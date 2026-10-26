# PR #47 fix round: review and full suite

Worktree /home/user/bank-account-first, branch co-001/bank-account-first. Nothing pushed.

## Commits (5ca2263..HEAD)

- 56007bd4 Set each live subscription's default to the new method, and model a subscription's own default in the simulator (S2, S3). This is the fixer's commit.
- b15d45ff Give each simulator form its own request key, and fix the billing page's notices, words and theme (S1, S4, UX-1 to UX-11). This is the fixer's commit.
- 422344bd Name the bank after a comma on the on-file line, and say BIL-04's renewal runs on the simulator itself (UX-8, S3). This is my commit from the adversarial re-read.

Final head: 422344bd.

## What the adversarial re-read found (fixed in 422344bd)

1. **UX-8 was only partly applied.** The review asked for no double parenthesis. The fixer's line still read "On file: bank account (ACH) ending in 6789 (Synthetic Test Bank)". It now reads "..., Synthetic Test Bank". Changed in payment-method-card.tsx (onFile and its docstring), billing.test.tsx, e2e/billing.spec.ts and ADR 0073 decision 5.
2. **The BIL-04 row overstated its evidence (S3).** The row opens "Through the routes on the simulator", but the renewal clause is proven only by packages/billing/src/local.test.ts, because no route advances the simulator. The clause now reads "; and on the simulator itself, a renewal of its plan is charged to the bank account, even when the subscription carried the card as its own default". The wording is identical in test-matrix.md and matrix.ts, and synth rewrote BIL-04/expected.json.
3. **Tidying.** I rewrapped two over-long lines in ADR 0073 and the header comment of e2e/billing.spec.ts.

Everything else in the dispositions matches the code, the tests and the docs (ADR 0073, the runbook, test-matrix.md, matrix.ts and registry.ts):
- No old wording is left anywhere: "Replace it with", "Adding one replaces", "ACH debit) or", "enter its code", `default_payment_method: ''`, "ACH bank account", "ending 6789/4242".
- Dark mode in @tp/ui is only `[data-theme="dark"]` or `.dark`. That is exactly what brandAppearance detects.

## Dispositions

- S1: Fixed (b15d45ff). Each form gets its own key through the `formKeys: () => ReactNode` factory, and BIL-03 asserts that the 3 keys are distinct.
- S2: Fixed (56007bd4). Each live subscription's default is set to the new method and never cleared. A subscription already on that method is skipped, whether stored as a string or expanded. Canceled and incomplete_expired subscriptions are skipped.
- S3: Fixed (56007bd4 and b15d45ff; wording narrowed in 422344bd). The simulator models a subscription's own default. local.test.ts has the renewal and precedence tests, and the fixer showed the precedence test fails without the update. The BIL-04 row now says the renewal is shown on the simulator itself.
- S4: Fixed (b15d45ff). microdepositType is carried through. A missing or non-https verification URL is now an error.
- UX-1: Fixed (b15d45ff). The notice's last sentence depends on methodOnFile.
- UX-2: Fixed (b15d45ff). The text differs for descriptor_code and amounts, and the notice always links Stripe's page.
- UX-3: Fixed (b15d45ff). The notices use role="status" and tabIndex -1, and are focused on mount.
- UX-4: Fixed (b15d45ff). "(opens in a new tab)" is read on the verification link and the invoice link.
- UX-5: Fixed (b15d45ff). The button reads "Replace with a bank account (ACH) or card".
- UX-6: Fixed (b15d45ff). data-plan="needs-method" shows the prices and the sentence, and there is no form. Covered by e2e and a source test.
- UX-7: Fixed (b15d45ff). labelOf is the fallback, 'unknown' shows no brand, and eftpos_au reads "eftpos Australia".
- UX-8: Fixed (b15d45ff and 422344bd). One term (PAYMENT_METHOD_NAME), the "On file:" line in medium weight, "ending in", and now no double parenthesis.
- UX-9: Fixed (b15d45ff). The preference line shows with nothing or a card on file. data-notice="replaces" shows with any method on file.
- UX-10: Fixed (b15d45ff). The Test mode div has role="group".
- UX-11: Fixed (b15d45ff). elementsAppearance is built from the live tokens, with night under dark and no literal colors.

## Base

`git fetch origin claude/build-platform` shows 6ddd587c, which has not moved. There was nothing to merge.

## Full local suite on 422344bd

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24 and PG18 on 5433.

To test the head as committed, I set aside the uncommitted change to packages/synth/src/cases/common.ts (MODULE_NUMBER BIL 13 -> 15), which is not this lane's. Its patch is saved at /tmp/claude-0/-home-user-PhysicalTherapy/4b2d015a-84c8-5610-8630-1a03db5b4a46/scratchpad/common-ts-foreign.patch. I restored it afterwards with `git apply`, so it is still uncommitted, as found.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass. The lockfile is up to date. |
| pnpm check:fixtures | Pass. 248 files read, 2,817 searched. |
| pnpm typecheck | Pass. 22 projects (23 s). |
| pnpm lint | Pass. 1,490 files in 3 groups, 0 errors, 0 warnings (87 s). |
| pnpm lint:copy | Pass. 492 files. |
| pnpm lint:logs | Pass. 998 files. |
| pnpm verify-content | Pass. |
| tsx tools/engine-freeze/check.ts 6ddd587 | Pass. No non-test pricing change, nothing let through, no problems. |
| pnpm synth --all, then git diff --exit-code | Pass. 196 cases: 0 written, 479 unchanged. EMR: 16 unchanged. The tree is clean. |
| pnpm test | Pass. 322 files: 5,013 passed, 3 skipped (183 s). |
| pnpm test:golden | Pass. 4 files, 188 tests. |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 637 (626 valid, 11 malformed), and edi835 agrees. |
| pnpm db:migrate (5433) | Applied 44 migrations. The database had none applied beforehand. |
| pnpm test:db --shard=1/6 | Pass. 20 files, 2,416 passed (150 s). |
| pnpm test:db --shard=2/6 | Pass. 20 files, 768 passed, 1 skipped (62 s). |
| pnpm test:db --shard=3/6 | Pass. 20 files, 2,492 passed (129 s). |
| pnpm test:db --shard=4/6 | Pass. 20 files, 1,802 passed (104 s). |
| pnpm test:db --shard=5/6 | Pass. 19 files, 1,382 passed (170 s). |
| pnpm test:db --shard=6/6 | Pass. 19 files, 190 passed (65 s). |
| test:db total | 118 files, the same as `vitest list --project db`: 9,050 passed, 1 skipped, 0 failed. |
| pnpm build | Pass (61 s). |
| build-stamp.ts --write HEAD | Stamped 422344bd. |
| E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr47 E2E_PORT=3147 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 26 passed (283 s), including both billing.spec tests. The stamp read "the build is 422344bd…'s". |
| same, --shard=2/2 | Pass. 25 passed (212 s). The screening spec passed, so no flake re-run was needed. |
| e2e total | 51 passed, 0 failed. I dropped tp_e2e_pr47 afterwards and left tp_e2e_screens as found. |
| tsx tools/stryker/affected.ts --event pull_request --base 6ddd587 | No shards: money, pricing, ledger and packets are all not affected. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed". |
| Model identifiers in git diff 6ddd587 HEAD and in the messages | None, apart from the attribution lines. |

Before committing I also ran a targeted check: vitest on components/billing and packages/synth (14 files, 171 passed), and eslint on the changed files (clean).

## Proposals

- Update /home/user/ops/designs/lane-b-bank-account-first.md, which this lane may not edit:
  - the button label: "Replace with a bank account (ACH) or card"
  - the on-file line: "On file: Visa card ending in 4242" / "On file: bank account (ACH) ending in 6789, <bank>"
  - the description: "A bank account (ACH) or a card..."
  - the replace line: "A new payment method replaces the one on file."
  - the rule that a new default becomes each live subscription's own default
- Find out who made the uncommitted common.ts change (BIL 13 -> 15) in this worktree, and commit or revert it.
- Add a test-mode route or e2e control that advances the simulator clock, so that BIL-04's renewal can be shown through the routes.
- Make the simulator emit customer.subscription.updated when setDefaultPaymentMethod changes a subscription's default, as Stripe does.
- In staging test mode, check by hand that the Payment Element accepts the resolved rgb() colors and the focus variables, light and dark.
