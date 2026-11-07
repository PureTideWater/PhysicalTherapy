\set ON_ERROR_STOP on
CREATE TABLE priced_line (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, service_line_id uuid NOT NULL, variance_cents bigint, current boolean NOT NULL);
CREATE TABLE "case" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, state text NOT NULL, opened_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE case_line (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, case_id uuid NOT NULL, service_line_id uuid NOT NULL UNIQUE, priced_line_id uuid NOT NULL, written_off_reason text);
CREATE TABLE line_status (practice_id uuid NOT NULL, service_line_id uuid NOT NULL, seq bigint NOT NULL, stage text NOT NULL);
CREATE FUNCTION priced_line_pricing_check(target uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE WHEN current THEN 'current' ELSE 'priced_again' END FROM priced_line WHERE id = target $$;
SELECT setseed(0.42);
INSERT INTO "case" (practice_id, state, opened_at) SELECT 'aaaaaaaa-0000-4000-8000-000000000001', (ARRAY['open','awaiting_response','packet_ready','resolved','closed_written_off'])[1 + floor(random()*5)::int], now() - g * interval '1 day' FROM generate_series(1,40) g;
INSERT INTO priced_line (practice_id, service_line_id, variance_cents, current) SELECT 'aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), 100 + floor(random()*9000)::bigint, random() < 0.8 FROM generate_series(1,2000);
INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id, written_off_reason)
  SELECT p.practice_id, (SELECT id FROM "case" ORDER BY id OFFSET (abs(hashtext(p.id::text)) % 40) LIMIT 1), p.service_line_id, p.id, CASE WHEN random() < 0.1 THEN 'not_worth_pursuit' END FROM priced_line p;
INSERT INTO line_status SELECT practice_id, service_line_id, 1, 'flagged' FROM case_line;
INSERT INTO line_status SELECT practice_id, service_line_id, 2, 'actionable' FROM case_line WHERE random() < 0.95;
INSERT INTO line_status SELECT practice_id, service_line_id, 3, (ARRAY['payer_approved','recovered'])[1 + floor(random()*2)::int] FROM case_line WHERE random() < 0.15;
