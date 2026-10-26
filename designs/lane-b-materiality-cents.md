# Design: materiality settings show stored cents as dollars (LANES.md claim `co-001/materiality-cents`)

*Lane B, 2026-10-26 ~04:30 UTC. Branch `co-001/materiality-cents`, cut from `claude/build-platform` c5195ee. Status:
`approval-summaries/lane-b-materiality-cents-status.md`. Found by the UX baseline review; assigned by the orchestrator
(2026-10-26 ~04:21 UTC).*

## The bug (confirmed at c5195ee)
- `apps/web/src/lib/routes/settings.ts:295` (the defaults page's route; a #42 file, read-only here) returns the stored
  thresholds as canonical cents text: `centsToString(settings.lineMaterialityCents)`, so `'500'` for $5.00. The pursuit
  cost's staff rate is returned the same way (`staffRateCentsPerHour`).
- `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx` prints those strings after a dollar sign
  (`Now $500 per line and $25000 per case`; `$4500 an hour`), and pre-fills the three "(dollars)" fields with them.
- The save actions parse those fields as dollars (`settings.ts:269-272`: `^\d{1,9}(\.\d{1,2})?$`, then `parseAmount`).
  Saving the form unchanged multiplies the line and case thresholds and the staff rate by 100: triage then stops
  pursuing every line shortfall under $500 and every case under $25,000, and every case's pursuit cost is 100 times
  too high.
- The cases page does it right (`cases/page.tsx:22`, `formatCents(parseCents(...))`, and `<Money>` for display).

## No migration, no #42 file, no money-package change
The stored values are right; only the page's reading of them is wrong. The route (`settings.ts`) already returns what
the page needs, so it is not touched, which matters because it is a #42 file. `@tp/money` already has the conversion:
`formatCents(parseCents(text))` gives `'5.00'`, which the save's regex and `parseAmount` read back to exactly 500 cents.
So `packages/money` (a mutation-gated money package) is unchanged.

## Decisions (each the recommended option, taken without asking under the co-founder's rulings of 2026-10-25 ~21:34 UTC
and 2026-10-26 ~00:20 UTC)
1. **One shared helper for "stored cents to the dollars a person edits".** `dollarsForInput(centsText: string): string`
   in `apps/web/src/components/format.ts` (beside `utc` and `roleName`), `formatCents(parseCents(text))`, documented as
   the inverse of the save's `dollars` field. The defaults page and the cases page both use it (the cases page's local
   `dollars` helper goes), so the two pages that edit the same thresholds cannot drift again.
2. **Display through `<Money>`.** The defaults card's sentence shows each amount with the existing `<Money>`
   (`components/remittances/display.tsx`: `formatUsd`, mono face, tabular numerals, as brand rule "every money figure
   … in the mono font" requires): "Now $5.00 per line and $250.00 per case."; the pursuit line "$45.00 an hour, …".
3. **Pre-fill through the helper:** "Per line (dollars)" `5.00`, "Per case (dollars)" `250.00`, "Staff rate per hour
   (dollars)" `45.00`.
4. **The card components move into `apps/web/src/components/settings/defaults.tsx`** (synchronous, `formKeys` as a
   factory as #47 learned, so each form keeps its own request key), so their words and pre-fills are unit-tested with
   `renderToStaticMarkup`. The page keeps its data loading and passes the actions in.
5. **Sweep apps/web for the same class of bug** (a cents value printed, labelled or pre-filled as dollars, or a money
   figure shown outside `<Money>`/`formatUsd`): every page and component that reads a `*Cents`/`*_cents` value. Fix
   those of the same kind in this PR (inside files not in #42's list); list every place checked in the PR description;
   record anything in #42's files as a hand-over to Lane A.

6. **The console's model budget is entered in dollars** (the orchestrator's addition, ~04:22 UTC, from the UX review's
   words finding words-other-21). `/console/models` sets `model.daily_budget_cents` through one generic "Value" field
   whose hint reads "whole cents for a budget (500 is $5.00)": a platform administrator types cents where every screen
   shows dollars, and typing "5" sets a budget of five cents. The route is `apps/web/src/lib/routes/console-models.ts`
   (not a #42 file). Fix: for the budget key the field takes dollars and cents ("5.00"), converted with the same
   `parseAmount` the settings save uses, and still stored as whole cents in the flag's value; the hint says so; the
   table already shows dollars through `formatUsd`. Exact parse (no float), refused above the stored limit, and a test
   first that "5.00" stores 500 and "5" stores 500 (not 5).

## After the design review (wf_1712850b-a63, ~04:40 UTC: build with changes, no migration; F1 to F9 all accepted; `designs/lane-b-materiality-cents-review.json`)
These replace the text above where they differ:
- **F1, one module, not components/format.ts:** `apps/web/src/lib/money-input.ts` exports `dollarsField` (the one zod
  schema: trim, `^\d{1,9}(\.\d{1,2})?$`, `parseAmount`) and `dollarsForInput(centsText)` (`formatCents(parseCents(…))`),
  documented as each other's inverse over [0, 99,999,999,999] cents. Moved onto it in this PR: `workbench.ts:136`,
  `console/practice-settings.ts:33` and `:140` (`asDollars` keeps its guard), `cases/page.tsx:22`, the defaults page and
  the model budget. `settings.ts:271` (a #42 file) is handed to Lane A: import `dollarsField` once #42 merges.
- **F2:** the property test runs fast-check over `dollarsField.parse(dollarsForInput(String(c))) === c`.
- **F3:** CAS-39's db test is a new `apps/web/src/lib/routes/defaults-routes.db.test.ts` (CI-02's twelve generated files
  untouched), through `defaultsSettingsPage`, `settingsMaterialityAction` and `settingsPursuitAction`, with the
  boundaries 0, 1, 99, 100, 500, 4500, 25000 and 99,999,999,999 through the real settings.ts parser.
- **F4:** `apps/web/e2e/triage.spec.ts` (not #42's) gains the cases page's "100.00" pre-fill and a visit to Settings →
  Defaults ("$5.00 per line and $100.00 per case", fields 5.00 and 100.00, the figures in the mono face, an unchanged
  save keeps $100.00).
- **F5:** CAS-38 and CAS-39 in test-matrix.md (Cases, after the last CAS row), matrix.ts (same words) and registry.ts
  (`none(…)` with assertedBy).
- **F6, the same class of bug in uploads:** `uploads/[documentId]/page.tsx:83` shows the PLB total as `'$' + centsText`
  ("$-1.00", not mono); it renders `<Money>`; `receipt-labels.ts` `:257` and `:386` use `formatUsd(parseCents(…))`;
  `centsText` goes; a unit assertion for a negative PLB ("-$1.00").
- **F7, brand mono:** the defaults card's minutes in mono; `lines/[lineId]` `:69` and `:76` cents in mono spans (the
  unrounded value stays in cents beside the rounded `<Money>`); console `:91` and cases `:166` defaults from
  `DEFAULT_TRIAGE_SETTINGS` through `<Money>`; `workbench.ts:77` through `formatUsd`.
- **F8:** the helper's domain is [0, 99,999,999,999]; the 12-digit stored versus 11-digit saved gap goes to Lane A.
- **F9:** line references corrected (save at `settings.ts:271-275`, pursuit `:331`, `:341`); open cases keep the
  thresholds and pursuit cost snapshotted when they opened (`apps/worker/src/triage/execute.ts:374`); the PR gives a
  read-only query for synthetic environments listing practices whose thresholds are 100 times the defaults.

## Tests (CAS-38 to CAS-39, reserved in the claim)
| ID | Case | Assertion |
| --- | --- | --- |
| CAS-38 | The materiality and pursuit settings show stored cents as dollars | With a practice's thresholds at 500 and 25000 cents and a staff rate of 4500 cents an hour, Settings → Defaults says "$5.00 per line and $250.00 per case" and "$45.00 an hour", each in the mono face, and pre-fills its dollar fields with 5.00, 250.00 and 45.00; the cases page pre-fills the same thresholds with the same helper |
| CAS-39 | Saving the defaults form unchanged changes nothing | Submitting the materiality and pursuit forms with the values the page pre-fills keeps lineMaterialityCents 500, caseMaterialityCents 25000 and staffRateCentsPerHour 4500; for every amount, the helper's output read back through the save's dollars field gives the same cents |

Where: CAS-38 in `apps/web/src/components/settings/defaults.test.tsx` (unit) and the e2e or brand copy check
(the defaults page shows "$5.00"); CAS-39 in a db test through the routes (the route-test partition decides the file:
CI-02) and a property test of the helper against the save's parser. Both written first and shown failing on c5195ee.

## Reviews
- Payment engine (`.claude/agents/payment-engine-reviewer.md`): the cents/dollars round trip, the helper's edge cases
  (0, 1 cent, the save's 9-digit limit, negative values), and that triage reads the same cents.
- UX and brand: before and after screenshots of Settings → Defaults at 1280 px and 390 px, light and dark.

## Risks
- A practice that already saved the form unchanged holds 100-fold thresholds. No real practice exists yet (synthetic
  data only, pre-launch), so no data repair is built; the PR says so.
