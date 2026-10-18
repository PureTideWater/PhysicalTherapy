-- The data-rights agreement a reviewer's correction rests on (PRD 14: "Reviewer corrections become evaluation
-- examples under the data-rights terms"; docs/adr/0048 and 0052).
--
-- When a contract version is approved, each corrected model proposal of it becomes an evaluation example under the
-- practice's signed data-rights agreement, which eval_example names (permission_ref, checked by data_rights_permit).
-- The person approving is the contract specialist, under a support grant: the agreement policies keep the group's
-- agreements from them, so the example was never written. practice_data_rights_agreement(practice) answers, for a
-- practice in the transaction's scope only, with the ID of its signed data-rights agreement (the practice's own, or
-- its organization's for all of its practices, as data_rights_permit reads them; the latest signed), or null. It
-- returns the ID alone, never the agreement.
--
-- Runs as tp_owner. Safe with the previous image running: a new function; the previous image never calls it.

CREATE FUNCTION practice_data_rights_agreement(target_practice uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT a.id FROM agreement a JOIN practice p ON p.id = target_practice
   WHERE practice_in_scope(target_practice)
     AND a.kind = 'data_rights' AND a.signed_at <= now()
     AND (a.practice_id = p.id OR (a.practice_id IS NULL AND a.organization_id = p.organization_id))
   ORDER BY a.signed_at DESC, a.id
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION practice_data_rights_agreement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_data_rights_agreement(uuid) TO tp_app;
