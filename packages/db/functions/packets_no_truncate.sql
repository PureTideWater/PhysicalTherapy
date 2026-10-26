-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packets_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d55baaa259f73fa7
-- Trigger function of: packet.packet_no_truncate
-- Trigger function of: packet_version.packet_version_no_truncate
-- Trigger function of: payer_response.payer_response_no_truncate
-- Trigger function of: submission.submission_no_truncate
CREATE OR REPLACE FUNCTION public.packets_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: packets, submissions and responses keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.packets_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packets_no_truncate() FROM PUBLIC;
