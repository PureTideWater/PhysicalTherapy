-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_work_refusal(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 02f4e7cfee7444d5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_work_refusal(target_practice uuid, wanted text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN h.source = 'owner' AND h.cause = 'suspended' THEN 'PaidWhole has suspended your organization, so no new work starts at this practice until PaidWhole reinstates your organization; everything here stays readable'
    WHEN h.source = 'owner' AND h.cause = 'closed' THEN 'the practice''s organization is closed, so no new work starts here; everything here stays readable'
    WHEN h.source = 'owner' AND h.cause = 'nonpayment' THEN 'an invoice of your organization has been unpaid for 30 days since its payment failed, so no new work starts at this practice until it is paid; everything here stays readable'
    WHEN h.source = 'owner' AND h.cause = 'on_hold' THEN 'the PaidWhole account of the practice''s organization is on hold, so no new work starts here; everything here stays readable'
    WHEN h.source = 'grantee' AND (wanted IS NULL OR wanted = ANY (h.stopped)) AND h.cause = 'suspended' THEN 'PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice''s records'
    WHEN h.source = 'grantee' AND (wanted IS NULL OR wanted = ANY (h.stopped)) AND h.cause = 'closed' THEN 'your organization is closed, so you start no new work here through its grant'
  END
    FROM practice_work_hold(target_practice) h
$function$;
ALTER FUNCTION public.practice_work_refusal(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_work_refusal(uuid,text) FROM PUBLIC;
