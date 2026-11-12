// W59: prints the writer's query before (step 1's head: the figure alone) and after (7b05fd87: the figure and the
// list), from the repository's own constants, and the note's one-pass form (4.1, NOT built) for comparison.
import fs from 'node:fs';
import { ACTIONABLE_NOW, ACTIONABLE_NOW_LINE, LATEST_STAGE } from '/home/user/PhysicalTherapy/apps/worker/src/triage/actionable-now';
import { OPEN_CASES_ACTIONABLE } from '/home/user/PhysicalTherapy/apps/worker/src/reconcile/statements';
const out = process.argv[2] as string;
const tail = `FROM "case" c\n      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')\n      ORDER BY c.opened_at, c.id`;
const before = `SELECT c.id, ${ACTIONABLE_NOW('c')}::text AS actionable_cents\n       ${tail}`;
const after = OPEN_CASES_ACTIONABLE.replace('$1', ":'A'");
const onepass = `SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, ${ACTIONABLE_NOW_LINE('x', 'st.stage')} AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL ${LATEST_STAGE('x')} st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id`;
fs.writeFileSync(`${out}/q_before.sql`, before + '\n'); fs.writeFileSync(`${out}/q_after.sql`, after + '\n'); fs.writeFileSync(`${out}/q_onepass.sql`, onepass + '\n');
