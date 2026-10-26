-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_note_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f03b3369f30abb6f
-- Trigger function of: line_note.line_note_references_in_practice
CREATE OR REPLACE FUNCTION public.line_note_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a note belongs to a service line of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.line_note_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.line_note_references_in_practice() FROM PUBLIC;
