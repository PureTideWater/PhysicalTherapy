import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { openPool } from '@tp/db';
import { GatewayConfigError, createProvider, permittedRegressions, readGatewayConfig, unservedCount } from '@tp/model-gateway';
import { createLogger } from '@tp/observability';

import { WorkerConfigError, readIntakeConfig, readWorkerConfig } from '../config';
import { intakeServices } from '../intake/wiring';
import { PermittedArgsError, evaluatePermitted, parseEarlierReport, parsePermittedArgs } from './permitted';

/**
 * The evaluate-permitted task (dist/evaluate-permitted.js; docs/adr/0054): run from the worker image in
 * production, with the worker's own configuration (the application login, the documents bucket and the
 * key, the model path), against the practices named. It writes the report (tp-model-eval-permitted/2:
 * tallies, codes and example IDs only) to standard output and to --report, and with --against an earlier
 * run's report it prints each regression and exits 1 when there is one: the gate for a prompt or model
 * change on the permitted examples. The earlier report must be /2; a /1 report is refused before anything
 * is called (earlier_report_format), so the earlier side is run again on the current code. Exit 2 is a
 * usage or configuration problem, that refusal among them; nothing was called.
 *
 * The configuration is read for the evaluable set (docs/adr/0070, Part 2; F5 (a)): a contract entry whose
 * synthetic evaluation is recorded and which waits only on this run is not served to anyone, but this run
 * may call the model for it, so the run it waits on can be made. The configuration is refused (exit 2)
 * only when nothing is even evaluable; the gateway the run builds serves that set to the run's job alone.
 */
const logger = createLogger({ base: { worker_id: randomUUID() } });

let pool;
try {
  const args = parsePermittedArgs(process.argv.slice(2));
  const worker = readWorkerConfig();
  const intake = readIntakeConfig();
  const gateway = readGatewayConfig(process.env, { serving: 'evaluable' });
  const unevaluable = unservedCount(gateway, 'evaluable');
  if (unevaluable > 0) {
    logger.warn('some model features are off: they have not passed their evaluation for the configured model', { error_code: 'MODEL_FEATURES_NOT_EVALUATED', record_count: unevaluable });
  }
  // Read and checked before any call: an earlier report of format /1 is refused here (earlier_report_format), not after a whole run.
  const earlier = args.against === null ? null : parseEarlierReport(await readFile(args.against, 'utf8'));
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
