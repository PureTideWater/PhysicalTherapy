## PR 6b-2: what you are asked to approve

**New domain model SHA-256: `495398f72551e4c4f8ad2c3a01ba8702427f2ebdd790e8b7db7cb2aef2c7b37e`.** It replaces `c3065bf9…`, which no longer matches the schema. Your approving GitHub review of head `98a5e49` (PR #36) is the approval of record. The approval line is yours to commit; the build never writes it.

### What 6b-2 changes
- **For a practice:** each practice has one pricing location: its billing ZIP, plus the ZIP+4 where Medicare needs one. It is set at creation in the console and edited in Settings > Pricing settings.
  - A month that needs the location waits for it, then prices by itself.
  - The practice administrator, billing manager or firm principal confirms the location. Everyone who opens the practice now sees that confirmation.
  - The console shows the stored ZIP+4 and the current status, and its form starts from them.
  - The re-run diff says when each place-of-service split was approved.
- **For a prospect (free screening):** a ZIP that Medicare splits asks for the ZIP+4. If PaidWhole has not loaded that ZIP's ZIP+4 list, the prospect is told so first, instead of being sent to look up digits the screening can't use.
  - The result's heading shows the ZIP+4.
  - Medicare rows from quarters outside the loaded content are left out and counted.

### The schema in plain words
- **practice_site** (new table, one row per practice): the ZIP and ZIP+4, who last set them and when. Registered and forced like every table with a practice_id.
  - New this step: `confirmed_by` and `confirmed_at`, who confirmed the location and when (both set or both empty).
  - The "last changed" time now moves only when the ZIP or ZIP+4 actually changes.
- **pricing_run.place_of_service_split_id:** which approved split each run used.
- **screening_prospect.zip_plus_four** (kept 30 days, only when needed), plus three "left out" counts on screening_upload.
- **Functions:** the practice's setter `practice_set_location`, the console's setters, the status readers, and `pricing_run_split`, which now also returns the approval time.
  - New: **practice_confirm_location**, the only way to confirm. It refuses PaidWhole staff, anyone without the pricing-settings permission, a deleted practice, and a location that still needs something.
  - **console_practice_settings** now returns the ZIP+4, and **screening_result_summary** now returns the prospect's ZIP+4.
  - Every function keeps its fixed search path and exactly one grant, to the app role.
- **Permission** `pricing_settings.set`: practice administrator, billing manager and firm principal; denied to the reviewer (your Q5 (a)).
- **rule_record** accepts one new record type for the ZIP+4 file (your Q3 (a)).

### What proves it
- Each fix has a test that failed before the fix: 21 db tests and 3 unit tests.
- Full suite on the final code:
  - 4,276 unit tests, 38 golden, 630 oracle fixtures;
  - 9,001 database tests (the only failure is the approval check, which waits for your line; one restore drill is skipped because the local pg_dump is too old for PostgreSQL 18);
  - 51 end-to-end tests;
  - typecheck, lint, the freeze check and the build.
- Domain model: 0 problems, and Drizzle matches the database.

### What the review round and this step changed
- The review round found 23 real issues. All 23 are now fixed.
- This step made the 10 fixes that needed the unmerged migration, through the marker route you allowed for that one file:
  - the database now refuses a wrong confirmation itself;
  - billing managers and firm principals see their own confirmation;
  - re-saving the same ZIP no longer makes every run look out of date;
  - a deleted practice's location can't be set;
  - the console shows the ZIP+4;
  - the diff shows approval times;
  - the screening shows the ZIP+4 and the order of its questions is fixed;
  - the migration header lists the seventh deploy risk.
- The marker was removed right after the edits, and no other migration changed.

### Open items
1. Approve the hash above.
2. Q12: you, then counsel, confirm the sentences in the PR. This step adds three re-run-diff sentences naming the approval times, and one rare refusal.
3. Deploy: migrate, then the worker, then the web. Approve no new split until the new worker is running, or re-run the runs created during the window.
4. Follow-up: once the old image is gone, remove the old console save's ZIP branch.
5. Still open from before:
   - Q37 is with the specialist.
   - The production-size keyed-read time comes from CI.
   - Other routes still queue jobs before their save commits.
   - The data dictionary is unchanged under your D2 (a) ruling.
