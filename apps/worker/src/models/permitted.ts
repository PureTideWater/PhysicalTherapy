import { readFile } from 'node:fs/promises';

import { parsePageText } from '@tp/contracts';
import { type KeyProvider, type PracticeScope, type ScopeClient, type ScopePool, documentPagesKey, isUuid, loadPracticeCipher, readWithAudit, withJobScope } from '@tp/db/runtime';
import {
  CONTRACT_KINDS,
  type ContractTermsProposal,
  GatewayError,
  InputRefusedError,
  ModelCallFailedError,
  ModelFeatureOffError,
  ModelGateway,
  type ModelProvider,
  PERMITTED_REPORT_FORMAT,
  PhiBoundaryError,
  PostgresModelCallStore,
  type PermittedReport,
  type PermittedResult,
  correctionSchema,
  earlierPermittedReportSchema,
  permittedReport,
  permittedRequestKey,
  type PatientRecordsCheck,
  permittedResult,
  practiceRecordsCheck,
} from '@tp/model-gateway';
import type { Logger } from '@tp/observability';

import { type DocumentStore, collect } from '../storage/documents';

/**
 * The evaluation on permitted real examples, inside the PHI boundary (PRD 14, Logging and evaluation:
 * the gate is field-level precision and recall with no regression, "run in CI on the synthetic subset
 * and in the PHI boundary on the rest"; docs/adr/0054).
 *
 * Run in production by the worker image's evaluate-permitted task (src/models/permitted-cli.ts), one
 * practice at a time in that practice's job scope as the application role, exactly as a practice job
 * reads: the practice's permitted examples of contract proposals (eval_example, source permitted, each
 * resting on its signed data-rights agreement), and for each the document the call read, its page text
 * as intake stored it, opened with the practice's key. Each document is proposed again through the
 * gateway with the current prompt and its pinned model (the larger one when the specialist had marked
 * the contract ambiguous), logged in model_call in the job's name and held to the practice's daily
 * budget like any call, and scored against the specialist's final records (@tp/model-gateway,
 * permitted.ts, with the tally the synthetic gate uses: right, wrong but verified, rejected and missed,
 * field by field, against the final records cited from the example's own document). Nothing the call
 * proposes is written as a proposal or a rate record.
 *
 * What leaves the practice's scope is the report (tp-model-eval-permitted/2): tallies, problem codes and
 * example IDs, each variant's apart (the default model's examples and the larger model's, the PR review's
 * M3), with the run's ID and whether it ran in production, never a document's text, a quote or a figure.
 * A problem (the document unavailable, a failed call, an output that did not parse) scores the example as
 * proposing nothing, so a run that could not read an example shows as lower recall and fails the gate
 * rather than passing it silently. A call the gateway refused before it was made (refused:<code>: an input
 * refused, or a feature or variant off or not evaluable, refused:not_evaluated) is counted apart, as
 * refused, not as the model's miss, and the gate fails a run in which refusals rose. Which outcomes
 * measured the model is the gateway package's allowlist (permittedOutcome): record-permitted refuses a run
 * with any other, so a run that never reached the model (outside production, every call refused
 * phi_boundary) serves nothing.
 *
 * The worker re-sends a practice's contracts with no web code involved, so it checks them against the
 * practice's records as the web does (docs/adr/0070, Part 3): one practice records check per practice per
 * run, built in the run's job scope for that practice (its proof that the run reaches the practice) on the
 * run's pool, with the run's ID as the screen's, so the screen's reads are the run's own, audited under the
 * run's request ID with purpose contract_screen. The check loads the practice's identifiers once and the run
 * reuses them for every example of that practice (one job, one request ID), never across practices or runs.
 * An example whose document names a patient of the practice is refused before the call (refused:names_patient)
 * and is an outcome the example itself causes: a rerun meets it again, and the specialist's correction was of
 * a document that should not have been filed as a contract. The gateway package's allowlist therefore counts
 * it as outside the model (OUTSIDE_MODEL_PROBLEMS: counted, kept, and no bar to recording the run), as it
 * counts refused:document_kind, while refused:screen_unavailable and refused:screen_failed (the practice holds
 * more identifiers than the check reads, or the check's read failed) are the run's setting, not the example's,
 * and stay unmeasured: such a run is refused whole by record-permitted, as a run refused by the kill switch is.
 */

export interface PermittedEvaluationServices {
  readonly pool: ScopePool<ScopeClient>;
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly provider: ModelProvider;
  /** NODE_ENV=production: only there does a practice's material reach a real provider. */
  readonly production: boolean;
  readonly logger: Logger;
  readonly now?: () => Date;
}

export interface PermittedRun {
  /** The run's ID: the job actor its reads and calls are recorded under, and part of each call's request key. */
  readonly runId: string;
  readonly practiceIds: readonly string[];
}

interface ExampleRow {
  readonly id: string;
  readonly practice_id: string;
  readonly expected: unknown;
  readonly ambiguous: boolean;
}

interface DocumentRow {
  readonly id: string;
  readonly practice_id: string;
  readonly kind: string;
  readonly sha256: string;
  readonly page_text_status: string | null;
  readonly page_count: number | null;
}

const AUDIT = { purpose: 'model_evaluation' } as const;

/** The practice's permitted contract-proposal examples, oldest first, with whether the proposal they correct was of an ambiguous contract. */
async function examples(scope: PracticeScope<ScopeClient>, practiceId: string, requestId: string): Promise<ExampleRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'eval_example', ...AUDIT, requestId },
    async (client) =>
      (
        await client.query<ExampleRow>(
          `SELECT e.id, e.practice_id, e.expected, coalesce((p.proposal ->> 'ambiguous') = 'true', false) AS ambiguous
             FROM eval_example e LEFT JOIN model_proposal p ON p.eval_example_id = e.id AND p.practice_id = e.practice_id
            WHERE e.practice_id = $1 AND e.source = 'permitted' AND e.purpose = 'proposeContractTerms'
            ORDER BY e.created_at, e.id`,
          [practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
}

type Pages = { readonly ok: true; readonly kind: (typeof CONTRACT_KINDS)[number]; readonly sha256: string; readonly pages: string[] } | { readonly ok: false };

/** The document's page text as intake stored it, when it is a clean contract or exhibit whose pages were read. */
async function documentPages(scope: PracticeScope<ScopeClient>, services: PermittedEvaluationServices, practiceId: string, documentId: string, requestId: string): Promise<Pages> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'source_document', ...AUDIT, requestId },
    async (client) =>
      (
        await client.query<DocumentRow>("SELECT id, practice_id, kind, sha256, page_text_status, page_count FROM source_document WHERE id = $1 AND practice_id = $2 AND scan_status = 'clean'", [
          documentId,
          practiceId,
        ])
      ).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  const kind = CONTRACT_KINDS.find((candidate) => candidate === row?.kind);
  if (row === undefined || kind === undefined || row.page_text_status !== 'ready') {
    return { ok: false };
  }
  const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
  const pages = parsePageText(await collect(services.documents.read(cipher, documentPagesKey(practiceId, documentId))));
  return pages.length === row.page_count ? { ok: true, kind, sha256: row.sha256, pages } : { ok: false };
}

/** The problem a gateway error is, as a code; anything else is not the model's and is rethrown. */
function problemOf(error: unknown): string {
  if (error instanceof ModelCallFailedError) {
    return `call_failed:${error.code}`;
  }
  // A feature (or the variant an example asks for) that is off or not yet evaluable for this provider is the
  // gateway's refusal before any call, not the model's miss: refused:not_evaluated, counted apart, so a run in
  // which more examples could not be called fails as refused_rose rather than reading as lower recall.
  if (error instanceof InputRefusedError || error instanceof PhiBoundaryError || error instanceof ModelFeatureOffError) {
    return `refused:${error.code}`;
  }
  if (error instanceof GatewayError) {
    return error.code;
  }
  throw error;
}

/** The document proposed again: the proposal, or the problem code when there is none. */
async function propose(
  gateway: ModelGateway,
  context: { readonly practiceId: string; readonly requestKey: string },
  documentId: string,
  pages: Extract<Pages, { ok: true }>,
  ambiguous: boolean,
  patientRecords: PatientRecordsCheck,
): Promise<{ readonly proposal: ContractTermsProposal | null; readonly problem: string | null }> {
  try {
    const { proposal } = await gateway.proposeContractTerms(context, { documentId, documentSha256: pages.sha256, kind: pages.kind, pages: pages.pages, ambiguous, patientRecords });
    return { proposal, problem: proposal === null ? 'invalid_output' : null };
  } catch (error) {
    return { proposal: null, problem: problemOf(error) };
  }
}

/** The variant an example's call asks for: the larger model's when the proposal it corrects was of a contract marked ambiguous. */
const variantOf = (row: ExampleRow) => (row.ambiguous ? 'ambiguous' : 'default');

/** One practice's examples, proposed again and scored. */
export async function evaluatePracticeExamples(services: PermittedEvaluationServices, run: { readonly runId: string; readonly practiceId: string }): Promise<PermittedResult[]> {
  const { runId, practiceId } = run;
  const inScope = <T>(work: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withJobScope(services.pool, { jobId: runId, practiceId }, work);
  const requestId = `evaluate-permitted:${runId}`;
  const rows = await inScope((scope) => examples(scope, practiceId, requestId));
  // The practice records check (docs/adr/0070, Part 3), one per practice per run: built in the run's own job scope
  // for the practice (its proof of reach, never read through), it reads in a job scope of its own on the run's
  // pool, as the run, once, and is reused for every example of the practice. Built at the first document to send,
  // so a practice with none is not read.
  let built: PatientRecordsCheck | undefined;
  const patientRecords = async (): Promise<PatientRecordsCheck> =>
    (built ??= await inScope(async (scope) =>
      practiceRecordsCheck({ authorizedBy: scope, pool: services.pool, cipher: await loadPracticeCipher(scope, services.keys, practiceId), practiceId, screenId: runId, requestId }),
    ));
  // The run may call the model for a key waiting only on this run (docs/adr/0070, Part 2; F5 (a)): the gateway
  // serves its evaluable set to this job's store, and to no other actor, for this run's own calls only (each
  // under permittedRequestKey; the PR review's N1).
  const gateway = new ModelGateway({
    provider: services.provider,
    store: new PostgresModelCallStore(services.pool, { kind: 'job', jobId: runId }),
    logger: services.logger,
    production: services.production,
    serving: 'evaluable',
    ...(services.now === undefined ? {} : { now: services.now }),
  });
  const results: PermittedResult[] = [];
  for (const row of rows) {
    const parsed = correctionSchema.safeParse(row.expected);
    if (!parsed.success) {
      // An expectation that does not parse scores nothing; its problem names it.
      results.push(permittedResult(row.id, null, { proposal: null, problem: 'expected_invalid' }, variantOf(row)));
      continue;
    }
    const correction = parsed.data;
    // The page text is read in its own transaction, which ends before the call is made.
    const pages = await inScope((scope) => documentPages(scope, services, practiceId, correction.document_id, requestId));
    const outcome = pages.ok
      ? await propose(gateway, { practiceId, requestKey: permittedRequestKey(runId, row.id) }, correction.document_id, pages, row.ambiguous, await patientRecords())
      : { proposal: null, problem: 'document_unavailable' };
    results.push(permittedResult(row.id, correction, outcome, variantOf(row)));
  }
  services.logger.info('permitted examples evaluated', { practice_id: practiceId, job_id: runId });
  return results;
}

/** The run over its practices, one after another: the report the gate compares. */
export async function evaluatePermitted(services: PermittedEvaluationServices, run: PermittedRun): Promise<PermittedReport> {
  const results: PermittedResult[] = [];
  for (const practiceId of run.practiceIds) {
    results.push(...(await evaluatePracticeExamples(services, { runId: run.runId, practiceId })));
  }
  return permittedReport(services.provider.kind, run.practiceIds.length, results, { runId: run.runId, production: services.production });
}

export interface PermittedArgs {
  readonly practiceIds: readonly string[];
  /** Where to write the report as well as standard output. */
  readonly report: string | null;
  /** An earlier run's report to compare against: any regression fails the run. */
  readonly against: string | null;
}

export class PermittedArgsError extends Error {
  override readonly name = 'PermittedArgsError';
}

export const PERMITTED_USAGE = 'usage: evaluate-permitted --practice <practice id> [--practice <practice id> ...] [--report <file>] [--against <earlier report>]';

/** The task's arguments: one or more practices (by ID, each once), and the report files. */
export function parsePermittedArgs(argv: readonly string[]): PermittedArgs {
  const practiceIds: string[] = [];
  let report: string | null = null;
  let against: string | null = null;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new PermittedArgsError(`${String(flag)} needs a value; ${PERMITTED_USAGE}`);
    }
    if (flag === '--practice') {
      const id = value.toLowerCase();
      if (!isUuid(id)) {
        throw new PermittedArgsError('--practice takes a practice ID (a UUID)');
      }
      if (!practiceIds.includes(id)) {
        practiceIds.push(id);
      }
    } else if (flag === '--report' && report === null) {
      report = value;
    } else if (flag === '--against' && against === null) {
      against = value;
    } else {
      throw new PermittedArgsError(`unexpected ${String(flag)}; ${PERMITTED_USAGE}`);
    }
  }
  if (practiceIds.length === 0) {
    throw new PermittedArgsError(`name at least one practice; ${PERMITTED_USAGE}`);
  }
  return { practiceIds, report, against };
}

/**
 * The earlier run's report given with --against, read before anything is called: a /2 report, or a
 * PermittedArgsError (exit 2). A /1 report is refused by its code, earlier_report_format: its counts
 * cannot tell a value the verifier rejected from a wrong one it verified, so the earlier side is run
 * again on the current code, rather than a whole run of model calls made only for the gate to refuse it
 * after. The message names the problem, never the file's content.
 */
export function parseEarlierReport(text: string): PermittedReport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PermittedArgsError('--against is not a permitted-run report (not JSON)');
  }
  const parsed = earlierPermittedReportSchema.safeParse(json);
  if (!parsed.success) {
    throw new PermittedArgsError(`--against is not a permitted-run report of format ${PERMITTED_REPORT_FORMAT}`);
  }
  if (parsed.data.format !== PERMITTED_REPORT_FORMAT) {
    throw new PermittedArgsError(`--against: earlier_report_format: the earlier report is ${parsed.data.format}; run the earlier prompt and model again on the current code for a ${PERMITTED_REPORT_FORMAT} report`);
  }
  return parsed.data;
}

/**
 * Refuses (PermittedArgsError, exit 2, before anything is called) a real provider configured outside
 * production: there the PHI boundary refuses every practice's example (refused:phi_boundary), so the run
 * would call nothing and its report would measure nothing (the PR review's S1). The local provider runs
 * anywhere (the database tests' runs, on synthetic examples).
 */
export function checkPermittedGateway(gateway: { readonly production: boolean; readonly provider: string }): void {
  if (!gateway.production && gateway.provider !== 'local') {
    throw new PermittedArgsError(`${gateway.provider} is configured outside production: a practice's examples reach a real provider only from a production deployment, so the run would measure nothing`);
  }
}

/**
 * The earlier run's report read from the file --against names, and parsed (parseEarlierReport). A file
 * that is missing or cannot be read is a PermittedArgsError too (exit 2, before anything is called), whose
 * message names the flag and the system's error code, never the path or the file's content.
 */
export async function readEarlierReport(file: string, read: (file: string) => Promise<string> = (name) => readFile(name, 'utf8')): Promise<PermittedReport> {
  let text: string;
  try {
    text = await read(file);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : 'unreadable';
    throw new PermittedArgsError(`--against: the earlier report could not be read (${code})`);
  }
  return parseEarlierReport(text);
}
