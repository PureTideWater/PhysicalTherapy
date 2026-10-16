import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { openPool } from '@tp/db';

import { createProvider, readGatewayConfig } from '../src/config';
import { OperatorEvaluationStore } from '../src/postgres-store';
import { LocalDeterministicProvider } from '../src/providers/local';
import { BASELINE_PATH, gate, readBaseline, recordBaseline } from './baseline';
import { type EvaluationReport, runEvaluation } from './harness';
import { registerReferences } from './reference';
import { precision, ratioText, recall } from './score';
import { loadContractSet, loadNarrativeSet } from './sets';

/**
 * `pnpm --filter @tp/model-gateway eval [--provider local|configured] [--only contracts|narratives]
 * [--report <file>] [--record]` (docs/adr/0051).
 *
 * - local (the default, and what CI's golden test runs): the local deterministic provider answering
 *   with the sets' reference answers. It proves the path, not a model.
 * - configured: the provider the environment configures (MODEL_PROVIDER=bedrock or anthropic, with
 *   its region or key), for a prompt or model change. The sets are synthetic and every call names no
 *   practice, so the gateway lets them reach a real provider outside production; nothing of a
 *   practice's is read. With OPERATOR_DATABASE_URL set, each call is logged in model_call as an
 *   evaluation call (the operator role, no practice).
 *
 * Prints the scores and the gate's answer against eval/baseline.json, writes the full report (counts,
 * codes and case IDs only) with --report, and exits 1 when the gate fails. --record writes this run's
 * results into the baseline for a person to review and commit; it refuses a run that regresses.
 */

const { values } = parseArgs({
  options: {
    provider: { type: 'string', default: 'local' },
    only: { type: 'string' },
    report: { type: 'string' },
    record: { type: 'boolean', default: false },
  },
});

function summary(report: EvaluationReport): string {
  const lines = [`provider ${report.provider}`];
  if (report.contracts !== null) {
    const { contracts } = report;
    lines.push(
      `contracts ${contracts.promptVersion} on ${contracts.modelId}: ${String(contracts.cases)} documents, precision ${ratioText(precision(contracts.total))}, recall ${ratioText(recall(contracts.total))}, quotes off their page ${String(contracts.quotesOffPage)}`,
    );
    for (const [layout, counts] of Object.entries(contracts.byLayout)) {
      lines.push(`  ${layout}: precision ${ratioText(precision(counts))}, recall ${ratioText(recall(counts))}`);
    }
  }
  if (report.narratives !== null) {
    const { narratives } = report;
    lines.push(`narratives ${narratives.promptVersion} on ${narratives.modelId}: ${String(narratives.passed)} of ${String(narratives.cases)} without a critical error`);
  }
  return lines.join('\n');
}

const contracts = values.only === 'narratives' ? null : await loadContractSet();
const narratives = values.only === 'contracts' ? null : loadNarrativeSet();
let provider;
if (values.provider === 'local') {
  provider = registerReferences(new LocalDeterministicProvider(), contracts?.cases ?? [], narratives?.cases ?? []);
} else if (values.provider === 'configured') {
  const config = readGatewayConfig(process.env);
  if (config.provider === 'local') {
    throw new Error('--provider configured needs MODEL_PROVIDER=bedrock or anthropic; use --provider local for the reference answers');
  }
  provider = createProvider(config);
} else {
  throw new Error('--provider is local or configured');
}
const operatorUrl = process.env.OPERATOR_DATABASE_URL;
const pool = operatorUrl === undefined || operatorUrl === '' ? null : openPool(operatorUrl, 2);
try {
  const report = await runEvaluation({ provider, contracts, narratives, ...(pool === null ? {} : { store: new OperatorEvaluationStore(pool) }) });
  process.stdout.write(`${summary(report)}\n`);
  if (values.report !== undefined) {
    writeFileSync(path.resolve(values.report), `${JSON.stringify(report, null, 2)}\n`);
  }
  const baseline = readBaseline();
  const result = gate(report, baseline);
  process.stdout.write(result.passed ? 'gate: passed (no regression; no narrative failure)\n' : `gate: FAILED\n${result.problems.map((problem) => `  ${JSON.stringify(problem)}`).join('\n')}\n`);
  if (values.record) {
    const updated = recordBaseline(baseline, report, new Date().toISOString().slice(0, 10));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(updated, null, 2)}\n`);
    process.stdout.write(`recorded in ${path.relative(process.cwd(), BASELINE_PATH)}; review the change before committing it\n`);
  } else if (!result.passed) {
    process.exitCode = 1;
  }
} finally {
  await pool?.end();
}
