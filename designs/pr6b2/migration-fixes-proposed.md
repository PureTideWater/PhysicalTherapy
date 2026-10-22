# PR 6b-2: migration changes waiting on the new-migration marker (proposal, not applied, not tested)

The fix round of 2026-10-22 could not set `.claude/.allow-protected-edit` (the session's permission classifier refused
it), so these changes to the unmerged `packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql`
are not made. Each needs its failing-first db test, then `pnpm db:domain-model --out --strict` on a fresh PostgreSQL 18
database and a new SHA-256 for the founder.

1. Findings 1 and 8 (the confirmation in Postgres, readable by every role that opens the practice):
   - `practice_site` gains `confirmed_by uuid REFERENCES "user" (id)` and `confirmed_at timestamptz`, with
     `CONSTRAINT practice_site_confirmed CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))`; Drizzle schema too.
   - `practice_site_rules()`: an UPDATE may change those two columns; `updated_at` and `updated_by` move only when
     `(zip, zip_plus_four)` changes (finding 11: a same-value save keeps them; covers every writer).
   - `practice_set_location()`: guard adds `NOT user_is_internal(app_actor_id())` and an active practice (finding 2);
     the upsert sets `confirmed_by = app_actor_id(), confirmed_at = now()` (a person's save is their confirmation).
   - New `practice_confirm_location(target uuid) RETURNS text`, SECURITY DEFINER, the same guard; refuses unless
     `practice_location_status(target, current_rule_release(), NULL, NULL)` is `ready` or `locality_not_loaded`
     (`check_violation`, `CONSTRAINT = 'practice_site_settled'`; finding 9); sets the two columns; REVOKE ALL FROM
     PUBLIC, GRANT EXECUTE TO tp_app; listed in location.db.test.ts's function list.
   - `console_set_practice_location()`: on a change of ZIP or ZIP+4 clears the two columns.
   - Web: `confirmPricingLocationAction` calls `practice_confirm_location()`; `locationConfirmed()` reads
     `confirmed_at IS NOT NULL AND confirmed_at >= updated_at` from `practice_site` (no audit_event read); the route
     tests confirm as a billing manager and a firm principal; a db test refuses a viewer, an analyst, a support
     engineer, a reviewer and another practice's administrator.
2. Finding 2: `console_set_practice_settings()`'s `new_zip` branch requires `app_actor_is_person()` and an active
   practice, and clears the confirmation; follow-up recorded: drop that branch once the previous image is gone.
3. Finding 14 and the open item: `DROP FUNCTION console_practice_settings(uuid)`, recreated with `zip_plus_four`
   (after `zip`), REVOKE/GRANT to tp_app; the console page shows the stored ZIP+4 and the live status
   (`localityReading()`), prefills the field, and the redirect carries only `?location=saved`.
4. Finding 16 and the open item: `pricing_run_split(run)` returns `approved_at` too; the diff says "the split approved
   {date} and the one approved {date}".
5. Finding 21: `screening_result_summary()` returns `p.zip_plus_four` as its last column; the result heading shows
   "00012-5001".
6. Finding 22: in `submit_screening()`, after `locality_status()`: `IF location = 'zip_plus_four_needed' AND NOT
   EXISTS (SELECT 1 FROM rule_record r WHERE r.release_no = in_force AND r.record_type = 'locality_map_plus_four' AND
   r.key = jsonb_build_object('zip', zip5)) THEN location := 'locality_not_loaded'; END IF;` and SCR-15's e2e and db
   test then expect the not-loaded refusal for a bare 00012 under 900001.
7. Finding 7: the header's seventh deploy-window effect (ADR 0064 already records it).
