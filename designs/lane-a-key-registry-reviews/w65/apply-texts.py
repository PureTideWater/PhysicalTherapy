#!/usr/bin/env python3
"""W65 (from W64's, change 3 to the refined ruling 3 of 2026-11-13 03:55 UTC, change 5 added): applies the proved texts to a copy of 20261115090000_key_registry.sql (argv[1]), in place.
Used only on a scratch worktree for the proof; the real file is edited by the typed /new-migration.
Every replacement must match exactly once, or it stops."""
import sys
p = sys.argv[1]; s = open(p).read()
def sub(old, new, why):
    global s
    if s.count(old) != 1: sys.exit(f'{why}: expected one match, found {s.count(old)}')
    s = s.replace(old, new)

# ---- A1 (by reference: a1-trigger.sql.txt), section 6
A1 = open(sys.argv[2]).read().split('-- BEGIN SQL\n')[1].split('-- END SQL')[0]
A1 = A1.replace("REVOKE ALL ON FUNCTION user_removal_target_holds() FROM PUBLIC;\n", "")
anchor = "CREATE TRIGGER membership_removal_target_holds BEFORE UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_removal_target_holds();\n"
sub(anchor, anchor + A1.rstrip('\n') + '\n', 'A1')

# ---- 2 (B2): the reason, the trigger's guard, the two functions, the reserved action
sub("CHECK (reason IN ('membership_ended', 'password_reset_completed', 'password_reset_outcome_unknown', 'hardware_keys_removed')),",
    "CHECK (reason IN ('membership_ended', 'password_reset_completed', 'password_reset_outcome_unknown', 'hardware_keys_removed', 'password_reset_unrecorded')),", '2 reason')
sub("OR (NEW.action IN ('password_reset_completed', 'password_reset_outcome_unknown') AND NEW.actor_kind = 'user'",
    "OR (NEW.action IN ('password_reset_completed', 'password_reset_outcome_unknown', 'password_reset_unrecorded') AND NEW.actor_kind = 'user'", '2 when')
B2 = r'''
-- A reset the provider completed whose own transaction could not be recorded (docs/adr/0091 D15's gap): the account,
-- acting as itself, queues the provider's sign-out alone. It takes no lock on the account and ends no session, so it
-- can commit where the reset's transaction failed twice on a lock or on the session update. It writes its own audit
-- row (a reserved action, so only this function writes it) and the trigger above queues the row from it. While a
-- sign-out for this cause waits NEVER YET TRIED (no try counted, no lease) it writes nothing more: that first try is
-- still ahead, is due at once and covers this call too, so the outbox cannot be flooded. A row already tried does not
-- count: its try may predate this reset and its next one may be an hour away. True when this call queued one.
CREATE FUNCTION provider_sign_out_unrecorded_reset(request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = actor) THEN
    RAISE EXCEPTION 'only an account queues its own sign-out after a reset that was not recorded' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM provider_sign_out p
              WHERE p.user_id = actor AND p.reason = 'password_reset_unrecorded' AND p.done_at IS NULL AND p.gave_up_at IS NULL AND p.leased_until IS NULL AND p.attempts = 0) THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (actor, 'user', 'password_reset_unrecorded', 'user', actor, request);
  RETURN true;
END;
$$;

-- The same for the operator, where the database could not be reached at the reset (the incident runbook's step): the
-- account is named, the audit row is the system's, and the outbox row is written here, since the trigger's guard
-- passes only an account's own row. The same rule against a second waiting row. The sign-out's ID, or NULL when one
-- already waits.
CREATE FUNCTION operator_provider_sign_out_request(account uuid, request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  event uuid;
  at timestamptz;
  queued uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = account) THEN
    RAISE EXCEPTION 'no such account' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM provider_sign_out p
              WHERE p.user_id = account AND p.reason = 'password_reset_unrecorded' AND p.done_at IS NULL AND p.gave_up_at IS NULL AND p.leased_until IS NULL AND p.attempts = 0) THEN
    RETURN NULL;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'password_reset_unrecorded', 'user', account, 'operator', request)
  RETURNING id, audit_event.at INTO event, at;
  INSERT INTO provider_sign_out (user_id, reason, source_event_id, request_id, queued_at, next_attempt_at)
  VALUES (account, 'password_reset_unrecorded', event, request, at, at)
  RETURNING id INTO queued;
  RETURN queued;
END;
$$;
'''
anchor = "  EXECUTE FUNCTION audit_event_provider_sign_out();\n"
sub(anchor, anchor + B2, '2 functions')
sub("'provider_signed_out',\n                       'provider_sign_out_undelivered')", "'provider_signed_out',\n                       'provider_sign_out_undelivered', 'password_reset_unrecorded')", '2 reserved')

# ---- 3 (B1): late and given up by age
sub("     AND (p.attempts >= 5 OR (p.attempts >= 4 AND (p.leased_until IS NULL OR p.leased_until <= now())));",
    "     AND (p.attempts >= 5 OR (p.attempts >= 4 AND (p.leased_until IS NULL OR p.leased_until <= now())) OR p.queued_at <= now() - interval '15 minutes');\n  UPDATE provider_sign_out p SET late_reported_at = NULL\n   WHERE p.done_at IS NULL AND p.gave_up_at IS NULL AND p.late_reported_at <= now() - interval '24 hours';", '3 late')
sub("       AND (p.attempts >= 30 OR (p.attempts >= 4 AND p.queued_at <= now() - interval '24 hours'))",
    "       AND (p.attempts >= 30 OR (p.last_error_code IS NOT NULL AND p.queued_at <= now() - interval '24 hours'))", '3 gave up')
sub("""-- The sweep. Late: five tries, or four with no running lease. Given up: 30 tries with no running lease, or 24 hours
-- since it was queued and four tries with no running lease; a row never tried is never given up (after a long outage
-- it is claimed).""",
"""-- The sweep. Late: five tries, or four with no running lease, or 15 minutes since it was queued, whatever its tries
-- and whatever its lease (a slow provider with a backlog gives a row its first try late; the person is paged by the
-- row's age). Given up: 30 tries, or 24 hours since it was queued and at least one try the job ANSWERED as failed
-- (last_error_code is set only by operator_provider_sign_out_failed; a claim alone counts a try but may have sent
-- nothing, a worker stopped between the claim and the call), in both cases with no running lease. A row never tried is
-- NEVER given up, whatever its age: a sign-out the product promised is not dropped unattempted. After an outage it is
-- late and paged, the claim reaches the rows in the order they came due (an untried row is due from the moment it was
-- queued, so the oldest first), and a row a run does not reach stays late and is tried by a later run; only after its
-- own answered try can its age give it up. A row still waiting 24 hours after its LATE line was acknowledged owes the
-- line again (the acknowledgement is cleared), so a row no run reaches is paged every day, never once and then silent.""", '3 comment')

# ---- 4 (D7): no security event for a step judged with no beginning
sub("""    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_event e
                  WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                    AND e.purpose = 'key_registration_refused' AND e.at > at - interval '1 hour') THEN""",
"""    END IF;
  END IF;
  -- A step with no beginning carries no code (the arrival at the code screen): it is no guess and records nothing.
  IF began IS NULL THEN
    RETURN 'refused';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_event e
                  WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                    AND e.purpose = 'key_registration_refused' AND e.at > at - interval '1 hour') THEN""", '4')

# ---- 5 (A4): hardware_key_record counts its check
sub("""-- call without the one-time code of a usable opening. A digest already known fails on hardware_key_credential_once.
""",
"""-- call without the one-time code of a usable opening. A wrong code against a usable opening is a guess like the
-- judge's: it counts one try on the opening (the fifth spends it), records key_registration_refused at most once an
-- account and an hour, and the function RETURNS NO ROW instead of raising, so the count commits (a raise would roll
-- it back and leave this function an uncounted oracle for the code). The caller treats no row as the refusal and
-- removes the key at the provider. No code at all, or no usable opening, is no guess and still raises
-- hardware_key_registration_closed. A digest already known fails on hardware_key_credential_once.
""", '5 comment')
sub("""    IF opening IS NULL OR code_sha256 IS NULL
       OR NOT EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.id = opening AND sha256(r.registration_code_sha256) = sha256(code_sha256)) THEN
      RAISE EXCEPTION 'registration of a hardware key after a removal needs the code an administrator opened it with'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_closed';
    END IF;
""",
"""    IF opening IS NULL OR code_sha256 IS NULL THEN
      RAISE EXCEPTION 'registration of a hardware key after a removal needs the code an administrator opened it with'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_closed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.id = opening AND sha256(r.registration_code_sha256) = sha256(code_sha256)) THEN
      UPDATE hardware_key_removal r SET registration_code_tries = r.registration_code_tries + 1 WHERE r.id = opening;
      IF NOT EXISTS (SELECT 1 FROM audit_event e
                      WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                        AND e.purpose = 'key_registration_refused' AND e.at > at - interval '1 hour') THEN
        INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
        VALUES (at, 'system', 'security_event', 'user', actor, 'key_registration_refused', request);
      END IF;
      RETURN;
    END IF;
""", '5')

# ---- 6 (B6): the claim returns the cause's request_id
sub("CREATE FUNCTION operator_provider_sign_out_claim() RETURNS TABLE (sign_out_id uuid, account_id uuid, subject text, try smallint)",
    "CREATE FUNCTION operator_provider_sign_out_claim() RETURNS TABLE (sign_out_id uuid, account_id uuid, subject text, try smallint, cause_request_id text)", '6 sig')
sub("  RETURNING p.id, p.user_id, u.cognito_sub, p.attempts\n", "  RETURNING p.id, p.user_id, u.cognito_sub, p.attempts, p.request_id\n", '6 returning')

# ---- 7 (A5): a refused removal act leaves a security event
A5 = r'''
-- One security_event for the acting account when the database refused its act on a key removal: purpose
-- key_removal_refused_<why>, why a closed list (the refusals a person probing the two-person rule would meet). The
-- refusal itself raised and rolled back, so the route calls this in a transaction of its own. It names no other
-- account and no removal: the actor is the subject, so no account can be written about by another. At most one row
-- for an account and a reason in an hour. IDs only.
CREATE FUNCTION hardware_key_removal_refused(why text, request text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  what text;
BEGIN
  IF why IS NULL OR why NOT IN ('not_permitted', 'two_people', 'not_own_account', 'requester_left') THEN
    RAISE EXCEPTION 'unknown key removal refusal' USING ERRCODE = 'check_violation';
  END IF;
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = actor) THEN
    RAISE EXCEPTION 'only an account records its own refused act' USING ERRCODE = 'insufficient_privilege';
  END IF;
  what := 'key_removal_refused_' || why;
  IF EXISTS (SELECT 1 FROM audit_event e
              WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                AND e.purpose = what AND e.at > clock_timestamp() - interval '1 hour') THEN
    RETURN;
  END IF;
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES (clock_timestamp(), 'system', 'security_event', 'user', actor, what, request);
END;
$$;

'''
anchor = "-- For a platform administrator only: the open requests and those decided in the last 30 days."
sub(anchor, A5.lstrip('\n') + anchor, '7')

# ---- the lists: preflight, section 14
sub("'membership_removal_target_holds', 'audit_event_provider_sign_out'))) THEN",
    "'membership_removal_target_holds', 'audit_event_provider_sign_out', 'user_removal_target_holds',\n                                    'provider_sign_out_unrecorded_reset'))) THEN", 'preflight')
sub("  membership_end_marks_account(), membership_removal_target_holds(), audit_event_provider_sign_out(),\n",
    "  membership_end_marks_account(), membership_removal_target_holds(), audit_event_provider_sign_out(), user_removal_target_holds(),\n  provider_sign_out_unrecorded_reset(text), operator_provider_sign_out_request(uuid, text), hardware_key_removal_refused(text, text),\n", '14 revoke')
sub("  hardware_key_registration_open(uuid, uuid, bytea, text) TO tp_app;", "  hardware_key_registration_open(uuid, uuid, bytea, text), provider_sign_out_unrecorded_reset(text), hardware_key_removal_refused(text, text) TO tp_app;", '14 app')
sub("  operator_provider_sign_out_reported(uuid, text), operator_provider_sign_outs_expire(integer), operator_key_removals_expire(integer, text),\n  operator_key_notices_stale",
    "  operator_provider_sign_out_reported(uuid, text), operator_provider_sign_outs_expire(integer), operator_key_removals_expire(integer, text),\n  operator_provider_sign_out_request(uuid, text), operator_key_notices_stale", '14 operator')
open(p, 'w').write(s)
print('applied')
