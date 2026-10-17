-- The console's model controls and an invitation check that names no other organization (PRD 6, Admin console:
-- "feature flags"; PRD 14, Operational limits: "per-practice daily budgets with alerts; a kill switch"; PRD 19,
-- Monitoring: "model-call cost per practice against budget"; PRD 3, tenancy; docs/adr/0055).
--
-- - console_model_spend(day): for platform administrators who manage feature flags, each practice's model calls
--   and their cost on one UTC day, in counts and integer millionths of a cent; no call, input or output is named.
--   The console sets each practice's budget beside it (set_feature_flag, as the kill switch and the letter reader).
-- - invitation_email_in_use(organization, email): whether an address already has an account anywhere, asked by an
--   administrator of the organization inviting it before the identity provider is called. The settings screen
--   answers one way for every address in use, here or elsewhere, so it never tells an organization that another
--   one knows a person.
--
-- Runs as tp_owner. Safe with the previous image running: two new functions, read by this image alone.

-- Each practice's model calls and their cost on a UTC day. Every active practice is in scope for the one query, and
-- the caller's scope is put back after it (as console_contract_queue does); for feature_flag.manage only.
CREATE FUNCTION console_model_spend(spend_day date) RETURNS TABLE (practice_id uuid, organization_id uuid, name text, calls integer, spent_unrounded numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator reads model spend' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT p.id, p.organization_id, p.name,
           coalesce(c.calls, 0)::integer,
           coalesce(c.spent, 0)::numeric(18, 6)
      FROM practice p
      LEFT JOIN LATERAL (
        SELECT count(*) AS calls, sum(m.cost_unrounded) AS spent FROM model_call m
         WHERE m.practice_id = p.id AND m.created_at >= spend_day::timestamp AT TIME ZONE 'UTC' AND m.created_at < (spend_day + 1)::timestamp AT TIME ZONE 'UTC'
      ) c ON true
     WHERE p.status = 'active'
     ORDER BY coalesce(c.spent, 0) DESC, p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$$;

-- Whether an address already has an account (any organization's, or the company's): asked by the organization's own
-- administrators (user.invite) before an invitation is sent. Yes or no; never whose.
CREATE FUNCTION invitation_email_in_use(target_organization uuid, address text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT coalesce(app_actor_organization_permitted(target_organization, 'user.invite'), false) THEN
    RAISE EXCEPTION 'an organization''s administrator invites its people' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN EXISTS (SELECT 1 FROM "user" u WHERE lower(u.email) = lower(btrim(address)));
END;
$$;

REVOKE ALL ON FUNCTION console_model_spend(date), invitation_email_in_use(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_model_spend(date), invitation_email_in_use(uuid, text) TO tp_app;
