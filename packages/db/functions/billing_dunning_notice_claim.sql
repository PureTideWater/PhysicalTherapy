-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_dunning_notice_claim(uuid,text,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 62e38d39b0766391
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_dunning_notice_claim(target_invoice uuid, notice_stage text, recipient uuid)
 RETURNS TABLE(email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  PERFORM 1 FROM dunning_notice_recipient d
    WHERE d.invoice_id = target_invoice AND d.stage = notice_stage AND d.user_id = recipient AND d.state = 'pending' AND d.next_attempt_at <= now()
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT u.email FROM "user" u WHERE u.id = recipient;
END;
$function$;
ALTER FUNCTION public.billing_dunning_notice_claim(uuid,text,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_dunning_notice_claim(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_dunning_notice_claim(uuid,text,uuid) TO tp_billing;
