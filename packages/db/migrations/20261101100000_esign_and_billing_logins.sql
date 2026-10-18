-- The e-signature webhook's own role (PRD 6, Agreements; CLAUDE.md: "Check in the handler and in Postgres";
-- docs/adr/0053 and 0055).
--
-- record_esigned_agreement() records an agreement (a BAA or a data-rights addendum among them) for any customer
-- organization, from an event whose signature only the web app can check. Until now the application role could
-- call it from any request. Now only tp_esign may (created by the role bootstrap: NOLOGIN, owns nothing), and only
-- the e-signature webhook's own login may SET ROLE to it; that login is used by no other route.
--
-- Billing's role (tp_billing) is no longer one the application role may switch to (the role bootstrap revokes
-- the membership); the webhook route and the organization's billing screens reach it through billing's own login,
-- the platform jobs through the operator's. Nothing here changes a table.
--
-- Runs as tp_owner. Safe with the previous image running only until the new image's logins exist: the previous
-- image's webhooks call the function as the application role, which this refuses (the migration runs before any
-- service moves to the new release, and a webhook Stripe or the vendor cannot deliver is retried).

REVOKE EXECUTE ON FUNCTION record_esigned_agreement(text, text, uuid, uuid, text, text, timestamptz, text, text, text) FROM tp_app;
GRANT EXECUTE ON FUNCTION record_esigned_agreement(text, text, uuid, uuid, text, text, timestamptz, text, text, text) TO tp_esign;
