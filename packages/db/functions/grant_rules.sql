-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- grant_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1daf6a68e1b51eac
-- Trigger function of: grant.grant_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.grant_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'group' AND organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'firm' THEN
      RAISE EXCEPTION 'a grant goes to a practice group or a firm; internal access is a support grant' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT user_is_practice_admin(NEW.practice_id, NEW.approved_by_user_id) THEN
      RAISE EXCEPTION 'a grant is approved by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM agreement a
       WHERE a.id = NEW.agreement_id AND a.kind IN ('baa', 'engagement')
         AND (
           (a.organization_id = NEW.organization_id AND (a.practice_id IS NULL OR a.practice_id = NEW.practice_id))
           OR (a.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = NEW.practice_id) AND a.practice_id = NEW.practice_id)
         )
    ) THEN
      RAISE EXCEPTION 'a grant rests on a BAA or engagement letter of the grantee, or of the practice''s group naming the practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revoked_by IS NOT NULL AND NOT user_is_practice_admin(NEW.practice_id, NEW.revoked_by) THEN
      RAISE EXCEPTION 'a grant is revoked by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.practice_id, NEW.scope, NEW.starts_at, NEW.ends_at, NEW.approved_by_user_id, NEW.agreement_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.practice_id, OLD.scope, OLD.starts_at, OLD.ends_at, OLD.approved_by_user_id, OLD.agreement_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a grant never changes after approval; revoke it and approve a new one' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at, NEW.revoked_by) IS DISTINCT FROM (OLD.revoked_at, OLD.revoked_by) THEN
    RAISE EXCEPTION 'a grant is revoked once' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_by IS NOT NULL AND OLD.revoked_by IS NULL AND NOT user_is_practice_admin(NEW.practice_id, NEW.revoked_by) THEN
    RAISE EXCEPTION 'a grant is revoked by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.grant_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.grant_rules() FROM PUBLIC;
