// Extracts the content calendar's notify and handoff step scripts, as the runner receives them, from a workflow file
// into the proof's work directory: work/proposed-notify.sh and work/proposed-handoff.sh. Run as
//   node proof/scripts/extract.mjs <content-calendar.yml> proof/work <a file inside the repository, to resolve yaml from>
// Synthetic data only; it reads the workflow and writes two scripts.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [workflow, work, from] = process.argv.slice(2);
if (!workflow || !work || !from) throw new Error('usage: extract.mjs <content-calendar.yml> <work dir> <resolve-from file>');
const { parse } = createRequire(path.resolve(from))('yaml');
const jobs = parse(readFileSync(workflow, 'utf8')).jobs;
for (const [job, file] of [['notify', 'proposed-notify.sh'], ['handoff', 'proposed-handoff.sh']]) {
  const steps = jobs[job]?.steps ?? [];
  if (steps.length !== 1 || typeof steps[0].run !== 'string') throw new Error(`${job}: expected one run step`);
  writeFileSync(path.join(work, file), steps[0].run);
  console.log(`${file} ${createHash('sha256').update(steps[0].run).digest('hex')} (${job}, ${Buffer.byteLength(steps[0].run)} B)`);
}
