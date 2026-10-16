-- Milestone 11, the support desk's queue and the evidence checklist's workforce (docs/adr/0053).
--
-- - console_support_tickets(): the tickets the desk works (PRD 19, Support: "a support address that creates a
--   ticket"), each with who asked by email and the organizations they belong to, so the desk can answer and, when
--   PHI is needed, open a support grant for the right practice. A support engineer reads no user row under its
--   policy, so the desk's read is this definer function, which checks support_ticket.work first.
-- - compliance_workforce(): the internal workforce (everyone with a current membership of the internal
--   organization, not disabled), for the SOC 2 Type I checklist's yearly training and device attestations (PRD 16,
--   Workforce: "Attestations"), for platform administrators with compliance.manage.

CREATE FUNCTION console_support_tickets(of_status text, at_most integer) RETURNS TABLE (
  ticket_id uuid, number bigint, requester_email text, organizations text[], screen text, category text, subject text, message text,
  status text, created_at timestamptz, status_changed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
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
$$;

CREATE FUNCTION compliance_workforce() RETURNS TABLE (user_id uuid, email text, roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('compliance.manage'), false) THEN
    RAISE EXCEPTION 'the workforce list is the platform administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, array_agg(DISTINCT m.role ORDER BY m.role)
      FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
     WHERE o.kind = 'internal' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
     GROUP BY u.id, u.email
     ORDER BY lower(u.email), u.id;
END;
$$;

REVOKE ALL ON FUNCTION console_support_tickets(text, integer), compliance_workforce() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_support_tickets(text, integer), compliance_workforce() TO tp_app;
