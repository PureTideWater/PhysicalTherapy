-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- invitation_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3ee00363f7b466b1
-- Trigger function of: invitation.invitation_rules
CREATE OR REPLACE FUNCTION public.invitation_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.membership_id, NEW.user_id, NEW.invited_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.membership_id, OLD.user_id, OLD.invited_by, OLD.created_at) THEN
    RAISE EXCEPTION 'an invitation names its organization, membership, user and inviter for good' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'an accepted invitation stays accepted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.invitation_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.invitation_rules() FROM PUBLIC;
