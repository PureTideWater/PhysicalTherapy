import { parsePageText } from '@tp/contracts';
import { type KeyProvider, type PracticeScope, type ScopeClient, type ScopePool, documentPagesKey, isUuid, loadPracticeCipher, readWithAudit, withJobScope } from '@tp/db/runtime';
import {
  CONTRACT_KINDS,
  type ContractTermsProposal,
  GatewayError,
  PERMITTED_FIELDS,
  InputRefusedError,
  ModelCallFailedError,
  ModelGateway,
  type ModelProvider,
  PhiBoundaryError,
  PostgresModelCallStore,
  type PermittedReport,
  type PermittedResult,
  correctionSchema,
  permittedReport,
  scorePermitted,
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
 * permitted.ts). Nothing the call proposes is written as a proposal or a rate record.
 *
 * What leaves the practice's scope is the report: counts, problem codes and example IDs, never a
 * document's text, a quote or a figure. A problem (the document unavailable, a refusal, a failed call,
 * an output that did not parse) scores the example as proposing nothing, so a run that could not read an
 * example shows as lower recall and fails the gate rather than passing it silently.
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

/** An example whose expectation does not parse scores nothing; its problem names it. */
const NOTHING = Object.fromEntries(PERMITTED_FIELDS.map((field) => [field, { tp: 0, fp: 0, fn: 0 }])) as PermittedResult['counts'];

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
  if (error instanceof InputRefusedError || error instanceof PhiBoundaryError) {
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
): Promise<{ readonly proposal: ContractTermsProposal | null; readonly problem: string | null }> {
  try {
    const { proposal } = await gateway.proposeContractTerms(context, { documentId, documentSha256: pages.sha256, kind: pages.kind, pages: pages.pages, ambiguous });
    return { proposal, problem: proposal === null ? 'invalid_output' : null };
  } catch (error) {
    return { proposal: null, problem: problemOf(error) };
  }
}

/** One practice's examples, proposed again and scored. */
export async function evaluatePracticeExamples(services: PermittedEvaluationServices, run: { readonly runId: string; readonly practiceId: string }): Promise<PermittedResult[]> {
  const { runId, practiceId } = run;
  const inScope = <T>(work: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withJobScope(services.pool, { jobId: runId, practiceId }, work);
  const requestId = `evaluate-permitted:${runId}`;
  const rows = await inScope((scope) => examples(scope, practiceId, requestId));
  const gateway = new ModelGateway({
    provider: services.provider,
    store: new PostgresModelCallStore(services.pool, { kind: 'job', jobId: runId }),
    logger: services.logger,
    production: services.production,
    ...(services.now === undefined ? {} : { now: services.now }),
  });
  const results: PermittedResult[] = [];
  for (const row of rows) {
    const parsed = correctionSchema.safeParse(row.expected);
    if (!parsed.success) {
      results.push({ exampleId: row.id, counts: NOTHING, problem: 'expected_invalid' });
      continue;
    }
    const correction = parsed.data;
    // The page text is read in its own transaction, which ends before the call is made.
    const pages = await inScope((scope) => documentPages(scope, services, practiceId, correction.document_id, requestId));
    const outcome = pages.ok ? await propose(gateway, { practiceId, requestKey: `eval:${runId}:${row.id}` }, correction.document_id, pages, row.ambiguous) : { proposal: null, problem: 'document_unavailable' };
    results.push({ exampleId: row.id, counts: scorePermitted(correction, outcome.proposal), problem: outcome.problem });
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
  return permittedReport(services.provider.kind, run.practiceIds.length, results);
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
