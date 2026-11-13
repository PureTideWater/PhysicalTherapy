// W60: prints the writer's query before PR 5 (the figure alone), as built by step 2 (the plain path: the figure and
// the list as two subqueries; the tests' PLAIN_PATH_OPEN_CASES) and as built now (the one-pass form, the repository's
// OPEN_CASES_ACTIONABLE), from the repository's own constants.
import fs from 'node:fs';
import { OPEN_CASES_ACTIONABLE } from '/home/user/PhysicalTherapy/apps/worker/src/reconcile/statements';
import { FOUR_KEY_OPEN_CASES } from '/home/user/PhysicalTherapy/apps/worker/src/reconcile/test-support/four-key-writer';
import { PLAIN_PATH_OPEN_CASES } from '/home/user/PhysicalTherapy/apps/worker/src/reconcile/test-support/plain-path-writer';
const out = process.argv[2] as string;
const text = (sql: string) => sql.replace('$1', ":'A'") + '\n';
fs.writeFileSync(`${out}/q_before.sql`, text(FOUR_KEY_OPEN_CASES)); fs.writeFileSync(`${out}/q_after.sql`, text(PLAIN_PATH_OPEN_CASES)); fs.writeFileSync(`${out}/q_onepass.sql`, text(OPEN_CASES_ACTIONABLE));
