-- The daily model budget holds against concurrent calls (PRD 14, Operational limits: "per-practice daily budgets
-- with alerts"; test matrix MOD-05; docs/adr/0054).
--
-- model_budget_hold: what a practice's model calls in flight may still cost. Before a call, the gateway takes a
-- transaction-scoped advisory lock on the practice, reads the day's logged spend (model_call.cost_unrounded) and
-- every hold not yet expired in one statement, refuses the call when they reach the budget, and otherwise holds the
-- most the call can cost (its token limit and an upper bound of its input at the model's price). The call's log row
-- is written and its hold deleted in one transaction; a call that ends without a row deletes its hold; a hold whose
-- process died expires after the gateway's longest call. So calls made at once are held to the budget as calls made
-- one after another are: at most the one call that crosses it can take the day past it.
--
-- Practice-scoped with the tenant policy and in the PHI table registry, as every practice table is, though it holds
-- no PHI (an amount and two times). The application role, which a person's request and a practice job both use,
-- reads, places and deletes holds of the practices in its scope; nothing else changes one.
--
-- Runs as tp_owner. Safe with the previous image running: a new table; the previous image never reads it.

CREATE TABLE model_budget_hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- In cents with six places, as model_call.cost_unrounded.
  held_unrounded numeric(18, 6) NOT NULL CHECK (held_unrounded >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT model_budget_hold_expires_after CHECK (expires_at > created_at)
);
CREATE INDEX model_budget_hold_by_practice ON model_budget_hold (practice_id, expires_at);

ALTER TABLE model_budget_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_budget_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY model_budget_hold_tenant ON model_budget_hold
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

REVOKE ALL ON model_budget_hold FROM PUBLIC;
GRANT SELECT, DELETE ON model_budget_hold TO tp_app;
GRANT INSERT (practice_id, held_unrounded, expires_at) ON model_budget_hold TO tp_app;

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('model_budget_hold', '20261031090000_model_budget_holds', 'model_budget_hold_tenant');
