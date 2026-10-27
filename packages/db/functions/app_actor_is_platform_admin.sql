-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_is_platform_admin()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e2e7c04621feca40
-- Trigger function of: (none)
-- Called by policy: agreement.agreement_parties
-- Called by policy: agreement.agreement_read_by_parties
-- Called by policy: membership.membership_administrators_update
-- Called by policy: membership.membership_self_and_administrators
-- Called by policy: organization.organization_members
-- Called by policy: organization.organization_platform_admin_insert
-- Called by policy: organization.organization_platform_admin_update
-- Called by policy: practice.practice_platform_admin_insert
-- Called by policy: support_grant.support_grant_created_by_platform_administrator
-- Called by policy: support_grant.support_grant_platform_administrators_read
-- Called by policy: support_grant.support_grant_read_by_practice_and_platform
-- Called by policy: support_grant_notice.support_grant_notice_read_by_practice_and_platform
-- Called by policy: support_grant_notice_recipient.support_grant_notice_recipient_read_by_practice_and_platform
-- Called by policy: user.user_invited_by_administrators
-- Called by policy: user.user_self_and_administrators
-- Called by policy: user.user_self_and_platform_admin_update
CREATE OR REPLACE FUNCTION public.app_actor_is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM app_actor_memberships() WHERE organization_kind = 'internal' AND role = 'platform_admin')
$function$;
ALTER FUNCTION public.app_actor_is_platform_admin() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_is_platform_admin() TO tp_app;
