#!/bin/bash
# W59: m_links: the statement the writer would store for practice A (the after query's cases, figures and line IDs,
# the cases in the query's order), with and without the list. Built by the scratch superuser; tp_app reads it.
A=$1
echo '\set ON_ERROR_STOP on'; echo "\\set A $A"
echo "DROP TABLE IF EXISTS m_links; CREATE TABLE m_links (tag text PRIMARY KEY, links jsonb NOT NULL, cents bigint NOT NULL); GRANT SELECT ON m_links TO tp_app;"
echo "CREATE TEMP TABLE m_open AS SELECT row_number() OVER () AS ord, q.* FROM ("; cat sql/q_after.sql; echo ") q;"
cat <<'SQL'
INSERT INTO m_links SELECT t.tag, jsonb_build_object('recovered', '[]'::jsonb, 'interest', '[]'::jsonb, 'approved_unposted', '[]'::jsonb,
         'actionable_open', (SELECT jsonb_agg(id ORDER BY ord) FROM m_open))
       || CASE WHEN t.tag = 'five' THEN jsonb_build_object('actionable_open_lines', (SELECT coalesce(jsonb_agg(l ORDER BY o.ord, u.i), '[]') FROM m_open o CROSS JOIN LATERAL unnest(o.line_ids) WITH ORDINALITY u(l, i))) ELSE '{}'::jsonb END,
       (SELECT sum(actionable_cents::bigint) FROM m_open)
  FROM (VALUES ('five'), ('four')) t(tag);
SELECT 'links: ' || tag || ' cases ' || jsonb_array_length(links -> 'actionable_open') || ' lines ' || coalesce(jsonb_array_length(links -> 'actionable_open_lines')::text, '-') || ' cents ' || cents || ' bytes ' || octet_length(links::text) FROM m_links ORDER BY tag;
SQL
