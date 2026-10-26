-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_platform_permitted(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3760f234506890ad
-- Trigger function of: (none)
-- Called by policy: agreement.agreement_recorded_by_signers
-- Called by policy: compliance_record.compliance_record_read
-- Called by policy: compliance_record.compliance_record_recorded
-- Called by policy: invitation.invitation_administrators_and_invitee
-- Called by policy: invoice.invoice_owners_read
-- Called by policy: membership.membership_administrators_insert
-- Called by policy: prospect_request.prospect_request_platform_read
-- Called by policy: prospect_request.prospect_request_platform_review
-- Called by policy: status_component.status_component_managed
-- Called by policy: status_incident.status_incident_opened_by_platform
-- Called by policy: status_incident_update.status_incident_update_posted_by_platform
-- Called by policy: subscription.subscription_owners_read
-- Called by policy: support_grant.support_grant_platform_administrators_insert
-- Called by policy: support_ticket.support_ticket_read
-- Called by policy: support_ticket.support_ticket_worked
-- Called by policy: terms_acceptance.terms_acceptance_self_and_platform_read
-- Called by policy: terms_version.terms_version_published_by_platform
-- Called by policy: usage_snapshot.usage_snapshot_owners_read
CREATE OR REPLACE FUNCTION public.app_actor_platform_permitted(wanted text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT roles_permit(coalesce((SELECT array_agg(DISTINCT m.role) FROM app_actor_memberships() m WHERE m.organization_kind = 'internal'), '{}'), wanted)
$function$;
ALTER FUNCTION public.app_actor_platform_permitted(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_platform_permitted(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_platform_permitted(text) TO tp_app;
