import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { openPool } from '@tp/db';

import { createProvider, readGatewayConfig } from '../src/config';
import { OperatorEvaluationStore } from '../src/postgres-store';
import { LocalDeterministicProvider } from '../src/providers/local';
import type { FieldTally } from '../src/tally';
import { BASELINE_PATH, gate, readBaseline, recordBaseline, recordPermitted, writeBaseline, writeRecorded } from './baseline';
import { FLOORS, readFloors } from './floors';
import { CONTRACT_VARIANTS, type ContractReport, type ContractVariant, type EvaluationReport, runEvaluation } from './harness';
import { registerReferences } from './reference';
import { asCounts, precision, ratioText, recall, tallyText } from './score';
import { type LoadedContractSet, loadContractSet, loadNarrativeSet } from './sets';

/**
 * `pnpm --filter @tp/model-gateway eval [--provider local|configured] [--only contracts|narratives]
 * [--variant default|ambiguous] [--floors <file>] [--report <file>] [--record [--new-set]]`
 * (docs/adr/0051, 0054 and 0070; docs/runbooks/model-evaluation.md).
 *
 * - local (the default, and what CI's golden test runs): the local deterministic provider answering
 *   with the sets' reference answers. It proves the path, not a model.
 * - configured: the provider the environment configures (MODEL_PROVIDER=bedrock or anthropic, with
 *   its region or key), for a prompt or model change. The sets are synthetic and every call names no
 *   practice, so the gateway lets them reach a real provider outside production; nothing of a
 *   practice's is read. With OPERATOR_DATABASE_URL set, each call is logged in model_call as an
 *   evaluation call (the operator role, no practice).
 *
 * - --variant ambiguous: the contracts are read by the larger model the contract prompt pins for
 *   contracts a specialist marks ambiguous; that model has its own baseline entry, never held to the
 *   default model's.
 * - --floors: a floors file other than the committed eval/floors.json (a person trying values out; only
 *   the committed file is what production and the recorded baseline are held to).
 *
 * Before gating, the local reference is run over the set's unfaithful cases (a handful of local calls),
 * so every provider is held, case by case, to no more wrong-but-verified fields there than a faithful
 * copier of the text as read scores. Prints each contract count (tp, wrong, extra, rejected with
 * rejected_right, rejected_extra, missed, widened), precision and recall overall and by layout, tier and page
 * text, the faithful wrong-but-verified, the conflicts and the twins, and the gate's answer against
 * eval/baseline.json; writes the full report (counts, codes, hashes and case IDs only) with --report;
 * exits 1 when the gate fails.
 *
 * --record writes this run's entries into the baseline and the report into eval/reports/<sha256>.json,
 * for a person to review and commit both; it refuses a run with any blocking problem. --new-set (with
 * --record) says the set changed on purpose: it is accepted only when the prompt version, its hash, the
 * provider, the model and the variant are the held entry's (the two-step re-baseline: the held model on
 * the new set first, then any new prompt or model against that entry). A real provider's contract
 * entry is recorded with `permitted: 'pending'`: production does not serve it until the next step.
 *
 * `pnpm --filter @tp/model-gateway eval record-permitted --report <file> [--against <file>]` records the
 * in-boundary permitted run (the worker's evaluate-permitted, report tp-model-eval-permitted/2, made in
 * production for the pending entries) on the contract entries of its provider, prompt version and
 * models, each variant on its own examples (./baseline.ts recordPermitted): it refuses a report that is
 * not /2 as the run wrote it, does not add up, was not run in production, names another prompt or other
 * models, did not measure the model for every example, or regresses against --against, variant by
 * variant (required once anything of the provider was ever served, and then a run of what was served),
 * and writes the reports' hashes and each variant's example count into the entries and the served
 * history of eval/baseline.json for a person to review and commit. It prints each variant it left
 * pending, and why. That commit serves the entries recorded (docs/adr/0070, Part 2; F5 (a)).
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string', default: 'local' },
    only: { type: 'string' },
    variant: { type: 'string', default: 'default' },
    floors: { type: 'string' },
    report: { type: 'string' },
    record: { type: 'boolean', default: false },
    'new-set': { type: 'boolean', default: false },
    against: { type: 'string' },
  },
});

const counts = tallyText;
const fractions = (tally: FieldTally) => `precision ${ratioText(precision(asCounts(tally)))}, recall ${ratioText(recall(asCounts(tally)))}`;
const ids = (list: readonly string[]) => (list.length === 0 ? 'none' : list.join(' '));

function contractLines(contracts: ContractReport): string[] {
  const faithful = Object.values(contracts.faithfulWrongVerified).reduce((sum, count) => sum + count, 0);
  const lines = [
    `contracts ${contracts.promptVersion} (${contracts.variant}) on ${contracts.modelId}: ${String(contracts.cases)} documents, ${fractions(contracts.total)}, quotes off their page ${String(contracts.quotesOffPage)}`,
    `  counts: ${counts(contracts.total)}`,
    `  wrong but verified on faithful cases: ${String(faithful)}`,
    `  conflict pairs: ${String(contracts.conflicts.expected)} expected; cases with any unflagged: ${ids(contracts.conflicts.unflagged)}`,
    `  twins: ${String(contracts.twins.pairs)}; differing ${ids(contracts.twins.differing)}; incomplete ${ids(contracts.twins.incomplete)}; canary in ${ids(contracts.twins.canary)}`,
  ];
  for (const [name, groups] of [
    ['layout', contracts.byLayout],
    ['tier', contracts.byTier],
    ['page text', contracts.byPageText],
  ] as const) {
    for (const [key, tally] of Object.entries(groups)) {
      lines.push(`  ${name} ${key}: ${fractions(tally)}; ${counts(tally)}`);
    }
  }
  return lines;
}

function summary(report: EvaluationReport): string {
  const lines = [`provider ${report.provider}`];
  if (report.contracts !== null) {
    lines.push(...contractLines(report.contracts));
  }
  if (report.narratives !== null) {
    const { narratives } = report;
    lines.push(`narratives ${narratives.promptVersion} on ${narratives.modelId}: ${String(narratives.passed)} of ${String(narratives.cases)} without a critical error`);
  }
  return lines.join('\n');
}

/** The local reference's report over the set's unfaithful cases: what a faithful copier of the text as read scores on each. */
async function referenceRun(contracts: LoadedContractSet | null, variant: ContractVariant): Promise<ContractReport | null> {
  const unfaithful = contracts?.cases.filter((item) => item.pageText === 'unfaithful') ?? [];
  if (contracts === null || unfaithful.length === 0) {
    return null;
  }
  const local = registerReferences(new LocalDeterministicProvider(), contracts.cases, []);
  return (await runEvaluation({ provider: local, contracts, narratives: null, variant, cases: new Set(unfaithful.map((item) => item.id)) })).contracts;
}

/** A report file's text, or an error naming the flag and the system's code (never the file's content). */
function readReportFile(flag: string, file: string): string {
  try {
    return readFileSync(path.resolve(file), 'utf8');
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'unreadable';
    throw new Error(`record-permitted: ${flag} could not be read (${code}); nothing is recorded`, { cause: error });
  }
}

/** record-permitted: the permitted run's verdict written into the pending entries it covers. */
function recordPermittedRun(): void {
  if (values.report === undefined) {
    throw new Error('record-permitted needs --report <the evaluate-permitted report>');
  }
  const report = { text: readReportFile('--report', values.report) };
  const against = values.against === undefined ? null : { text: readReportFile('--against', values.against) };
  const recorded = recordPermitted(readBaseline(), report, against, new Date().toISOString().slice(0, 10));
  writeBaseline(recorded.baseline);
  process.stdout.write(`record-permitted: recorded on the ${recorded.variants.join(' and ')} contract entries in ${path.relative(process.cwd(), BASELINE_PATH)}; review it before committing it\n`);
  for (const left of recorded.pending) {
    process.stdout.write(`record-permitted: the ${left.variant} entry stays pending (${left.reason}): its model is served only on a run of its own examples\n`);
  }
}

/** The evaluation over the synthetic sets, gated against the baseline, and recorded with --record. */
async function evaluate(): Promise<void> {
  if (!(CONTRACT_VARIANTS as readonly string[]).includes(values.variant)) {
    throw new Error('--variant is default or ambiguous');
  }
  if (values['new-set'] && !values.record) {
    throw new Error('--new-set is given with --record only');
  }
  const variant = values.variant as ContractVariant;
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
  const floors = values.floors === undefined ? FLOORS : readFloors(path.resolve(values.floors));
  const operatorUrl = process.env.OPERATOR_DATABASE_URL;
  const pool = operatorUrl === undefined || operatorUrl === '' ? null : openPool(operatorUrl, 2);
  try {
    const report = await runEvaluation({ provider, contracts, narratives, variant, ...(pool === null ? {} : { store: new OperatorEvaluationStore(pool) }) });
    const reference = await referenceRun(contracts, variant);
    process.stdout.write(`${summary(report)}\n`);
    if (values.report !== undefined) {
      writeFileSync(path.resolve(values.report), `${JSON.stringify(report, null, 2)}\n`);
    }
    const baseline = readBaseline();
    const newSet = values['new-set'];
    const options = { newSet, floors, reference };
    const result = gate(report, baseline, options);
    process.stdout.write(result.passed ? 'gate: passed\n' : `gate: FAILED\n${result.problems.map((problem) => `  ${JSON.stringify(problem)}`).join('\n')}\n`);
    if (newSet) {
      process.stdout.write('--new-set: the set is recorded as changed on purpose (same prompt, provider, model and variant only)\n');
    }
    if (values.record) {
      if (values.floors !== undefined) {
        throw new Error('--record holds a run to the committed eval/floors.json only; drop --floors');
      }
      const recorded = recordBaseline(baseline, report, new Date().toISOString().slice(0, 10), options);
      const written = writeRecorded(recorded);
      process.stdout.write(`recorded in ${path.relative(process.cwd(), BASELINE_PATH)} and ${path.relative(process.cwd(), written.report)}; review both before committing them\n`);
    } else if (!result.passed) {
      process.exitCode = 1;
    }
  } finally {
    await pool?.end();
  }
}

const [command, ...rest] = positionals;
if (rest.length > 0 || (command !== undefined && command !== 'record-permitted')) {
  throw new Error('the only subcommand is record-permitted');
}
if (command === 'record-permitted') {
  recordPermittedRun();
} else {
  if (values.against !== undefined) {
    throw new Error('--against is given with record-permitted only');
  }
  await evaluate();
}
