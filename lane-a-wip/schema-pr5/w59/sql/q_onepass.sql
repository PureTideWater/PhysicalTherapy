SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
