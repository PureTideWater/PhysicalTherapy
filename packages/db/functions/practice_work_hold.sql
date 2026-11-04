-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_work_hold(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2fbac4271482d173
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_work_hold(target_practice uuid)
 RETURNS TABLE(source text, organization_id uuid, organization_kind text, cause text, reason text, since timestamp with time zone, stopped text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH owner AS (
    SELECT o.id, o.kind, o.status, o.status_reason, o.status_since, s.standing, s.suspended_since,
           o.id = ANY ((SELECT app_actor_organization_ids())::uuid[]) AS member
      FROM practice p JOIN organization o ON o.id = p.organization_id JOIN billing_standing s ON s.organization_id = o.id
     WHERE p.id = target_practice
  ), owner_hold AS (
    -- D6: a non-member learns that work is on hold and whether it restarts, never why.
    SELECT 'owner'::text AS source, id, kind,
           CASE WHEN status = 'closed' THEN 'closed'
                WHEN NOT member AND (status = 'suspended' OR standing = 'suspended') THEN 'on_hold'
                WHEN status = 'suspended' THEN 'suspended'
                WHEN standing = 'suspended' THEN 'nonpayment' END AS cause,
           CASE WHEN member AND status = 'suspended' THEN status_reason END AS reason,
           CASE WHEN status IN ('suspended', 'closed') THEN status_since WHEN standing = 'suspended' THEN suspended_since END AS since,
           NULL::text[] AS stopped
      FROM owner
  ), paths AS (
    -- The person's own paths and roles here; none for a job, whose actor is never a person.
    SELECT a.role, g.organization_id AS grantee, coalesce(a.via = 'grant' AND o.status IN ('suspended', 'closed'), false) AS held
      FROM effective_practice_access() a
      LEFT JOIN "grant" g ON a.via = 'grant' AND g.id = a.grant_id
      LEFT JOIN organization o ON o.id = g.organization_id
     WHERE a.practice_id = target_practice AND app_actor_is_person()
  ), roles AS (
    SELECT coalesce(array_agg(DISTINCT role), '{}') AS every,
           coalesce(array_agg(DISTINCT role) FILTER (WHERE NOT held), '{}') AS unheld
      FROM paths
  ), stops AS (
    -- The run-starting work the person's roles allow, but not without the held grants (D1).
    SELECT coalesce(array_agg(u.wanted ORDER BY u.n), '{}') AS stopped
      FROM roles CROSS JOIN unnest(run_starting_permissions()) WITH ORDINALITY AS u(wanted, n)
     WHERE roles_permit(roles.every, u.wanted) AND NOT roles_permit(roles.unheld, u.wanted)
  ), grantee_hold AS (
    SELECT 'grantee'::text, o.id, o.kind, o.status, o.status_reason, o.status_since, stops.stopped
      FROM paths x JOIN organization o ON o.id = x.grantee CROSS JOIN stops
     WHERE x.held AND cardinality(stops.stopped) > 0
     ORDER BY o.status = 'suspended' DESC, o.id
     LIMIT 1
  )
  SELECT * FROM owner_hold WHERE cause IS NOT NULL
  UNION ALL
  SELECT * FROM grantee_hold WHERE NOT EXISTS (SELECT 1 FROM owner_hold WHERE cause IS NOT NULL)
$function$;
ALTER FUNCTION public.practice_work_hold(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_work_hold(uuid) FROM PUBLIC;
