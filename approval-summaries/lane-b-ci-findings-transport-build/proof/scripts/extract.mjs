// Writes the built workflow's notify and handoff steps' scripts, as the runner reads them, for prove.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const [yml, out] = process.argv.slice(2);
const { parse } = createRequire('/home/user/ci-findings-transport/tools/package.json')('yaml');
const jobs = parse(readFileSync(yml, 'utf8')).jobs;
writeFileSync(path.join(out, 'proposed-notify.sh'), jobs.notify.steps[0].run);
writeFileSync(path.join(out, 'proposed-handoff.sh'), jobs.handoff.steps[0].run);
console.log(JSON.stringify({ notifyEnv: jobs.notify.steps[0].env, handoffEnv: jobs.handoff.steps[0].env }));
