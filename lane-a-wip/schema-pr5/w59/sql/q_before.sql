SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
