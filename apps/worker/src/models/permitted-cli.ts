import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { openPool } from '@tp/db';
import { GatewayConfigError, createProvider, permittedRegressions, permittedReportSchema, readGatewayConfig } from '@tp/model-gateway';
import { createLogger } from '@tp/observability';

import { WorkerConfigError, readIntakeConfig, readWorkerConfig } from '../config';
import { intakeServices } from '../intake/wiring';
import { PermittedArgsError, evaluatePermitted, parsePermittedArgs } from './permitted';

/**
 * The evaluate-permitted task (dist/evaluate-permitted.js; docs/adr/0054): run from the worker image in
 * production, with the worker's own configuration (the application login, the documents bucket and the
 * key, the model path), against the practices named. It writes the report (counts, codes and example IDs
 * only) to standard output and to --report, and with --against an earlier run's report it prints each
 * regression and exits 1 when there is one: the gate for a prompt or model change on the permitted
 * examples. Exit 2 is a usage or configuration problem; nothing was called.
 */
const logger = createLogger({ base: { worker_id: randomUUID() } });

let pool;
try {
  const args = parsePermittedArgs(process.argv.slice(2));
  const worker = readWorkerConfig();
  const intake = readIntakeConfig();
  const gateway = readGatewayConfig();
  const earlier = args.against === null ? null : permittedReportSchema.parse(JSON.parse(await readFile(args.against, 'utf8')));
  const services = intakeServices(intake);
  pool = openPool(worker.databaseUrl, 2);
  const report = await evaluatePermitted(
    { pool, documents: services.documents, keys: services.keys, provider: createProvider(gateway), production: gateway.production, logger },
    { runId: randomUUID(), practiceIds: args.practiceIds },
  );
  const text = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(text);
  if (args.report !== null) {
    await writeFile(args.report, text);
  }
  if (earlier !== null) {
    const regressions = permittedRegressions(report, earlier);
    process.stdout.write(regressions.length === 0 ? 'evaluate-permitted: no regression against the earlier run.\n' : `evaluate-permitted: regressed: ${regressions.join(', ')}\n`);
    if (regressions.length > 0) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  if (!(error instanceof PermittedArgsError || error instanceof WorkerConfigError || error instanceof GatewayConfigError)) {
    throw error;
  }
  // These messages are written by this codebase and name a flag or a variable, never a value.
  process.stderr.write(`evaluate-permitted: ${error.message}\n`);
  process.exitCode = 2;
} finally {
  await pool?.end();
}
