-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_support_tickets(text,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 581668ca764c385c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_support_tickets(of_status text, at_most integer)
 RETURNS TABLE(ticket_id uuid, number bigint, requester_email text, organizations text[], screen text, category text, subject text, message text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('support_ticket.work'), false) THEN
    RAISE EXCEPTION 'the ticket queue is the support desk''s' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF of_status IS NOT NULL AND of_status NOT IN ('open', 'answered', 'closed') THEN
    RAISE EXCEPTION 'a ticket is open, answered or closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
    SELECT t.id, t.number, u.email,
           ARRAY(SELECT o.name FROM membership m JOIN organization o ON o.id = m.organization_id
                  WHERE m.user_id = t.requester_id AND (m.ends_at IS NULL OR m.ends_at > now()) ORDER BY o.name, o.id),
           t.screen, t.category, t.subject, t.message, t.status, t.created_at, t.status_changed_at
      FROM support_ticket t JOIN "user" u ON u.id = t.requester_id
     WHERE of_status IS NULL OR t.status = of_status
     ORDER BY t.created_at DESC, t.id
     LIMIT least(greatest(coalesce(at_most, 1), 1), 200);
END;
$function$;
ALTER FUNCTION public.console_support_tickets(text,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_support_tickets(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_support_tickets(text,integer) TO tp_app;
