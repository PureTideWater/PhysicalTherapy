-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_fees_paid(uuid,date,date)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a9a64e6bfca4d954
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_fees_paid(target_practice uuid, period_from date, period_to date)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  owner_organization uuid;
  total bigint;
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT p.organization_id INTO owner_organization FROM practice p WHERE p.id = target_practice;
  IF owner_organization IS NULL THEN
    RETURN 0;
  END IF;
  SELECT coalesce(sum(s.amount_paid_cents / s.practices + CASE WHEN s.position <= s.amount_paid_cents % s.practices THEN 1 ELSE 0 END), 0)::bigint
    INTO total
    FROM (
      SELECT i.amount_paid_cents, p.id AS practice_id,
             row_number() OVER (PARTITION BY i.id ORDER BY p.created_at, p.id) AS position,
             count(*) OVER (PARTITION BY i.id) AS practices
        FROM invoice i
        JOIN practice p ON p.organization_id = i.organization_id AND p.created_at <= i.paid_at AND (p.deleted_at IS NULL OR p.deleted_at > i.paid_at)
       WHERE i.organization_id = owner_organization AND i.status = 'paid'
         AND (i.paid_at AT TIME ZONE 'UTC')::date BETWEEN period_from AND period_to
    ) s
   WHERE s.practice_id = target_practice;
  RETURN total;
END;
$function$;
ALTER FUNCTION public.practice_fees_paid(uuid,date,date) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_fees_paid(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_fees_paid(uuid,date,date) TO tp_app;
