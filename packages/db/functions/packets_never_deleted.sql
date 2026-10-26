-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packets_never_deleted()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0444f4a36978439f
-- Trigger function of: packet.packet_never_deleted
-- Trigger function of: packet_version.packet_version_never_deleted
-- Trigger function of: payer_response.payer_response_never_deleted
-- Trigger function of: submission.submission_never_deleted
CREATE OR REPLACE FUNCTION public.packets_never_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% rows are never deleted: packets, submissions and responses keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.packets_never_deleted() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packets_never_deleted() FROM PUBLIC;
