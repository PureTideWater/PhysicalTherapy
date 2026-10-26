-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2176280110c4aa2b
-- Trigger function of: packet.packet_belongs
CREATE OR REPLACE FUNCTION public.packet_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT app_actor_is_person() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.draft'), false) THEN
    RAISE EXCEPTION 'a packet is opened by a person who drafts packets' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id AND c.state <> 'closed_written_off') THEN
    RAISE EXCEPTION 'a packet is of a case of its practice that is not closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.packet_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_belongs() FROM PUBLIC;
