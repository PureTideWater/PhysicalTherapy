\set ON_ERROR_STOP off
CREATE ROLE tp_owner; CREATE ROLE tp_app;
CREATE FUNCTION public.practice_in_scope(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.app_actor_is_person() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.app_actor_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.app_actor_permitted(p uuid, perm text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.ledger_entry (id uuid PRIMARY KEY, practice_id uuid NOT NULL, amount_cents bigint NOT NULL);
CREATE TABLE public.priced_line (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, service_line_id uuid NOT NULL, variance_cents bigint);
CREATE TABLE public."case" (id uuid PRIMARY KEY, practice_id uuid NOT NULL);
CREATE TABLE public.case_line (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, case_id uuid NOT NULL, service_line_id uuid NOT NULL UNIQUE, priced_line_id uuid NOT NULL);
\i roi_links_valid.proposed.sql
\i roi_statement_rules.proposed.sql
CREATE TABLE public.roi_statement (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, period_from date NOT NULL DEFAULT '2026-01-01', period_to date NOT NULL DEFAULT '2026-12-31',
  proof_level text NOT NULL DEFAULT 'deposited', fees_cents bigint NOT NULL DEFAULT 0, recovered_cents bigint NOT NULL DEFAULT 0, interest_cents bigint NOT NULL DEFAULT 0, approved_unposted_cents bigint NOT NULL DEFAULT 0,
  actionable_open_cents bigint NOT NULL, pursuit_hours numeric(9,2) NOT NULL DEFAULT 0, links jsonb NOT NULL CONSTRAINT roi_statement_links CHECK (roi_links_valid(links)),
  generated_by uuid, generated_at timestamptz NOT NULL DEFAULT now(), document_key text, pdf_sha256 text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER roi_statement_rules BEFORE INSERT OR UPDATE OR DELETE ON roi_statement FOR EACH ROW EXECUTE FUNCTION roi_statement_rules();
INSERT INTO "case" VALUES ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001');
INSERT INTO priced_line (id, practice_id, service_line_id, variance_cents) SELECT ('11111111-0000-4000-8000-00000000000' || g)::uuid, 'aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), 3000 FROM generate_series(1,3) g;
INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) SELECT practice_id, 'cccccccc-0000-4000-8000-000000000001', service_line_id, id FROM priced_line;
INSERT INTO ledger_entry VALUES ('22222222-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1200);
-- a: the writer's five-key statement: accepted.
INSERT INTO roi_statement (practice_id, recovered_cents, actionable_open_cents, links) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 1200, 9000,
 '{"recovered":["22222222-0000-4000-8000-000000000001"],"interest":[],"approved_unposted":[],"actionable_open":["cccccccc-0000-4000-8000-000000000001"],"actionable_open_lines":["11111111-0000-4000-8000-000000000001","11111111-0000-4000-8000-000000000002","11111111-0000-4000-8000-000000000003"]}');
-- b: LED-11's refusal (recovered 3000 against 1200 linked, links copied, actionable 0): the recovered message first.
INSERT INTO roi_statement (practice_id, recovered_cents, actionable_open_cents, links) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 3000, 0,
 '{"recovered":["22222222-0000-4000-8000-000000000001"],"interest":[],"approved_unposted":[],"actionable_open":["cccccccc-0000-4000-8000-000000000001"],"actionable_open_lines":["11111111-0000-4000-8000-000000000001","11111111-0000-4000-8000-000000000002","11111111-0000-4000-8000-000000000003"]}');
-- c: actionable off by one cent: refused with the new message.
INSERT INTO roi_statement (practice_id, recovered_cents, actionable_open_cents, links) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 1200, 8999,
 '{"recovered":["22222222-0000-4000-8000-000000000001"],"interest":[],"approved_unposted":[],"actionable_open":["cccccccc-0000-4000-8000-000000000001"],"actionable_open_lines":["11111111-0000-4000-8000-000000000001","11111111-0000-4000-8000-000000000002","11111111-0000-4000-8000-000000000003"]}');
-- d: four keys (the previous image): accepted at any actionable figure, as today.
INSERT INTO roi_statement (practice_id, recovered_cents, actionable_open_cents, links) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 1200, 12345,
 '{"recovered":["22222222-0000-4000-8000-000000000001"],"interest":[],"approved_unposted":[],"actionable_open":["cccccccc-0000-4000-8000-000000000001"]}');
-- e: the PDF record (an UPDATE) on the four-key and five-key rows: accepted.
UPDATE roi_statement SET document_key = 'practices/aaaaaaaa-0000-4000-8000-000000000001/reports/' || id || '/' || gen_random_uuid() || '.pdf', pdf_sha256 = repeat('a', 64);
SELECT actionable_open_cents, links ? 'actionable_open_lines' AS five, document_key IS NOT NULL AS printed FROM roi_statement ORDER BY 1;
