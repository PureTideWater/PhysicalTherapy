# PR 6b-2 (#36): the practice's pricing location and ZIP+4 in the screening, after its review round

**Bottom line:** the review round found 23 real problems. 13 are fixed and tested, 4 are fixed in part, and 6 are not fixed yet. Every one not fully fixed needs a change to the pull request's migration, and this session was not allowed to edit it. So **please do not approve the domain model yet**, unless you decide to move those fixes to a later pull request.

## What 6b-2 changes

- **For a practice:**
  - It gives its billing ZIP when it is created. Where Medicare needs it, it also gives the ZIP+4.
  - A new page, Settings > Pricing settings, shows in plain words whether Medicare can price that location. It also lists the months waiting on it.
  - The practice administrator, the billing manager and the firm principal can change the ZIP and confirm it. The reviewer cannot.
  - A month that can't be priced at a bad or incomplete ZIP waits with no prices kept, and nobody on the operator side is paged. Once the ZIP is fixed, the month prices by itself.
- **For a prospect (the free screening):**
  - The ZIP field takes a ZIP+4, but only asks for it where Medicare splits the ZIP.
  - Medicare rows from quarters PaidWhole hasn't loaded are left out and counted, not guessed.
- **Pricing math:** none. The engine is untouched; its ZIP+4 lookup was PR 6b-1.

## The schema in plain words

All of this is in one migration, written before this round:

- **`practice_site`, a new table.** One location per practice: the ZIP, the ZIP+4, and who set it.
  - It is locked to its practice like every practice table (forced row-level security).
  - The app can only read it. Writes go through two checked functions:
    - `practice_set_location()`, for a person holding the new permission;
    - `console_set_practice_location()`, for a platform administrator.
  - A practice cannot exist without one.
- **`pricing_settings.set`, a new permission** (your Q5 ruling). It is checked in the app and again in the database.
- **`pricing_run.place_of_service_split_id`, a new column.** Each pricing run records which approved place-of-service split it used, so a re-run can explain differences.
- **New status functions:**
  - `locality_status()` and `practice_location_status()` say whether a ZIP and ZIP+4 can be priced;
  - `rule_release_content_span()` says which quarters are loaded.
- **Screening columns:**
  - `screening_prospect.zip_plus_four`, kept 30 days and only when needed;
  - three counts on `screening_upload` for the rows left out.
- **`rule_record`'s type list gains `locality_map_plus_four`** (your Q3 exception). No rule data is written.

## What changed in this round

- **Fixed (13):**
  - a month could stay stuck after the ZIP was fixed;
  - the save's re-pricing job could start before the save was stored;
  - a run could judge one ZIP and price another;
  - a re-run could miss a new release's change for the new ZIP;
  - the save notice contradicted the page;
  - a table was unreachable by keyboard on a phone;
  - the brand-word check skipped the status sentences;
  - wording asked people to "check the four digits" when they may be right;
  - error messages weren't tied to their field;
  - the screening didn't say up front which quarters it covers;
  - confusing or overstated wording, and sentences missing from the list for you and counsel;
  - a test that only checked itself.

  Each has a test that fails without the fix, where a test can show it.
- **Fixed in part (4):**
  - the re-run diff now says when the earlier run had no split, but approval dates wait;
  - "priced before the location changed" is now judged by the ZIP each run actually used, but the stored timestamp still moves on a same-ZIP save;
  - "Confirm" is now refused in the app, but not yet in the database;
  - the seventh deploy-window effect is recorded in the ADR and the PR, but not yet in the migration's header.
- **Not fixed yet (6), all needing the migration:**
  - the database itself refusing a confirmation by someone without the permission;
  - a billing manager seeing their own confirmation;
  - a deleted practice's ZIP being writable;
  - the console showing the stored ZIP+4;
  - the screening result showing the ZIP+4;
  - not asking a prospect for a ZIP+4 PaidWhole can't use yet.
- **Your ruling on PR 5's trigger** ("if it is worth it then yes") is recorded as an accepted exception in reconciliation-001, ADR 0061 and ADR 0064. The trigger only takes a lock and changes no data. It stops a packet going out as current while its release is being withdrawn.

## What proves it

Local full suite on the final commit `c7f6f26` (pushed once; CI runs again):

- typecheck, lint, the copy check (483 files), the log check (957 files), the fixture check and regeneration: all pass.
- Freeze check: no engine file changes.
- Unit tests: 4,274 pass. Golden: 38 pass. Parser oracle: 630 files agree. verify-content: pass.
- Database tests on a fresh PostgreSQL 18: 8,994 pass. One fails as expected: the approval check, which waits for you. One is skipped because the local pg_dump is older than the database.
- Browser journeys (port 4901): 51 pass.
- Build: pass. actionlint: pass.
- Stryker: not applicable, since no changed file is in its lists.

## The SHA-256 you are asked to approve

`c3065bf937efd4ada6a034b48afe474176cd0b6fa39b6354dbab5c2fadf50f9a` is unchanged this round. Because the 6 open fixes change the schema, approving now only makes sense if you defer them. Otherwise a new hash follows.

## Open items

1. **Allow the migration edit** (the new-migration marker) so the 6 open fixes and the 4 partial ones can land. Then a new domain-model hash comes to you.
2. **Wording for you, then counsel (Q12):** the sentences marked (R) in the PR description, and the inferred "before {quarter}" wording.
3. **Deploy:** approve no new place-of-service split until the new worker is running. This is the seventh deploy-window effect.
4. **Q37** (a ZIP+4 Medicare's file doesn't list) is still with the specialist.
5. **Follow-up:** other screens still send their background jobs before saving completes.
