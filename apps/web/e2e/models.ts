import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createContract, createDraftVersion } from '@tp/contracts';
import { LocalKeyProvider, appDevLoginUrl, developmentMasterKey, loadPracticeCipher, openPool, withPracticeScope } from '@tp/db';
import { LOCAL_OUTPUT_FORMAT, type ModelPurpose, type RequestInputs, localOutputKey, requestFor } from '@tp/model-gateway';
import { draftNarrative } from '@tp/packets';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { packetDraftInputs } from '@tp/worker/packets';

import { evidenceFor } from '../src/lib/contracts/evidence';
import { CONTRACT_PAGES, storeContractDocument } from '../src/lib/routes/test-support/contract-world';
import { E2E_DOCUMENTS_DIR, E2E_MODEL_OUTPUTS_DIR, e2eDatabaseUrl } from './env';
import { withDatabase } from './helpers';
import { userId } from './journeys';

/**
 * The model features' journey setup on the e2e database (synthetic data only). The server runs the
 * gateway on the local deterministic provider, which answers a request only with the output written
 * for its exact key (the SHA-256 of the prompt version and the input as the gateway frames it): here
 * the journey computes the input the server will send, from the same records the server reads (the
 * document's page text as intake stored it; the packet content the next version would hold), and
 * writes the output it expects the model to give. A request the journey did not foresee proposes
 * nothing.
 */

export const MODELS_PRACTICE = 'SYNTHETIC OTHER PRACTICE MODELS';
export const Q97110 = '97110 Therapeutic exercise $32.00 per unit';
export const Q97140 = '97140 Manual therapy $30.50 per unit';

const keys = new LocalKeyProvider(developmentMasterKey());
const documents = new DocumentStore(new LocalSealedBytes(E2E_DOCUMENTS_DIR));

async function withPool<T>(run: (pool: ReturnType<typeof openPool>) => Promise<T>): Promise<T> {
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

/** Writes the model's answer to the request the gateway will send for this input. */
export function expectModelOutput<K extends ModelPurpose>(purpose: K, input: RequestInputs[K], output: unknown): void {
  const key = localOutputKey(requestFor(purpose, input));
  writeFileSync(path.join(E2E_MODEL_OUTPUTS_DIR, `${key}.json`), JSON.stringify({ format: LOCAL_OUTPUT_FORMAT, output }));
}

export interface DraftContract {
  readonly versionId: string;
  readonly documentId: string;
  /** What the gateway is given when the specialist asks for a proposal of the document. */
  readonly input: RequestInputs['proposeContractTerms'];
}

/**
 * A new SYNTHETIC contract with the practice's first payer (contract-world's invented agreement, its
 * page text stored as intake stores it, a closing line naming the contract so each document's bytes
 * are its own), and its first version as a draft naming the document, made by the billing manager.
 */
export async function draftContract(practiceId: string, managerKey: string, title: string): Promise<DraftContract> {
  const pages = CONTRACT_PAGES.map((page, index) => (index === CONTRACT_PAGES.length - 1 ? [...page, title] : page));
  const manager = await userId(managerKey);
  const specialist = await userId('models-specialist');
  return withPool(async (pool) => {
    const cipher = await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, (scope) => loadPracticeCipher(scope, keys, practiceId));
    const payerId = await withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [practiceId])).rows[0]?.id ?? '');
    const documentId = await withDatabase((client) => storeContractDocument({ owner: client, app: pool, documents, cipher, practiceId, payerId, customerId: manager, specialistId: specialist }, pages));
    const versionId = await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, async (scope) => {
      const context = { scope, requestId: `e2e-${randomUUID()}` };
      const contract = await createContract(context, { practiceId, payerId, title });
      return (await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId] })).versionId;
    });
    const input = await withPracticeScope(pool, { actorId: specialist, practiceIds: [practiceId] }, async (scope) => {
      const pages = await evidenceFor(scope, documents, cipher, practiceId, `e2e-${randomUUID()}`).pages(documentId);
      if (!pages.ok) {
        throw new Error('the synthetic contract’s pages were not stored');
      }
      const sha256 = (await scope.client.query<{ sha256: string }>('SELECT sha256 FROM source_document WHERE id = $1', [documentId])).rows[0]?.sha256 ?? '';
      return { documentId, documentSha256: sha256, kind: 'contract' as const, pages: pages.pages };
    });
    return { versionId, documentId, input };
  });
}

/** One fixed-schedule candidate as the model writes it: each field with the page and the words it comes from. */
export function fixedCandidate(code: string, quote: string, amount: string) {
  return {
    label: `SYNTHETIC ${code}`,
    method: { value: 'FIXED_SCHEDULE', page: 2, quote },
    codes: { written: [code], page: 2, quote },
    modifiers: null,
    places_of_service: null,
    amount: { written: amount, page: 2, quote },
    percentage: null,
    fee_schedule_year: null,
    lesser_of_schedule: null,
    flags: null,
    rounding: null,
    effective_from: null,
    effective_to: null,
  };
}

/**
 * The narrative the model is expected to give for the case's next version (no prompt-pay state, no
 * attached document): the code-built draft of the same facts, which the verifier passes. Returns it.
 */
export async function expectNarrative(practiceId: string, caseId: string, drafterKey: string): Promise<string> {
  const drafter = await userId(drafterKey);
  const inputs = await withPool((pool) =>
    withPracticeScope(pool, { actorId: drafter, practiceIds: [practiceId] }, (scope) =>
      packetDraftInputs(scope, keys, { practiceId, caseId, promptPayState: null, attachedDocumentIds: [], requestId: `e2e-${randomUUID()}` }),
    ),
  );
  const narrative = draftNarrative(inputs.content);
  expectModelOutput('draftPacketNarrative', inputs, { paragraphs: narrative.split('\n\n') });
  return narrative;
}

/** The practice's model calls: purpose and the reviewer's decision, oldest first. */
export async function modelCalls(practiceId: string): Promise<{ purpose: string; reviewer_decision: string | null }[]> {
  return withDatabase(async (client) => (await client.query<{ purpose: string; reviewer_decision: string | null }>('SELECT purpose, reviewer_decision FROM model_call WHERE practice_id = $1 ORDER BY created_at, id', [practiceId])).rows);
}
