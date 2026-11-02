-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_dunning_notice_failed(uuid,text,uuid,text,boolean,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9a19a46006e25479
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_dunning_notice_failed(target_invoice uuid, notice_stage text, recipient uuid, error_name text, permanent boolean, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  now_state text;
BEGIN
  UPDATE dunning_notice_recipient d
     SET attempts = d.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR d.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         failure_code = CASE WHEN coalesce(permanent, false) OR d.attempts + 1 >= 5
                             THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR d.attempts + 1 >= 5 THEN d.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[d.attempts + 1]) END
   WHERE d.invoice_id = target_invoice AND d.stage = notice_stage AND d.user_id = recipient AND d.state = 'pending'
  RETURNING d.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN dunning_notice_report_undelivered(target_invoice, notice_stage, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.billing_dunning_notice_failed(uuid,text,uuid,text,boolean,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_dunning_notice_failed(uuid,text,uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_dunning_notice_failed(uuid,text,uuid,text,boolean,text) TO tp_billing;
