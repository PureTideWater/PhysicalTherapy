import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { parsePageText, serializePageText } from '@tp/contracts';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, documentPagesKey, openPool, provisionPracticeKey, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, asOwner, createMigratedDatabase, createTenantWorld } from '@tp/db/testing';
import { CORRECTION_FORMAT, LocalDeterministicProvider, PROMPTS, permittedRegressions } from '@tp/model-gateway';
import { SYNTHETIC_CONTRACT_PAGES, capturingLogger, registerOutput, syntheticContractOutput } from '@tp/model-gateway/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { DocumentStore } from '../storage/documents';
import { type PermittedEvaluationServices, evaluatePermitted } from './permitted';

/**
 * The evaluation on permitted examples inside the PHI boundary (PRD 14, Logging and evaluation; docs/adr/0054):
 * each practice's permitted contract-proposal examples are read in that practice's job scope and audited, the
 * document they correct is proposed again through the gateway (logged in model_call in the run's name), and the
 * proposal is scored against the specialist's final records, field by field. The report holds counts, codes and
 * example IDs, never a document's text. Everything here is SYNTHETIC: an invented contract on the local
 * deterministic provider.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
const keys = LocalKeyProvider.random();
const documents = new DocumentStore(new MemorySealedBytes());
const provider = new LocalDeterministicProvider();

interface Practice {
  readonly world: TenantWorld;
  readonly practiceId: string;
  readonly documentId: string;
  readonly agreementId: string;
}

// The final records of the synthetic contract as a specialist would approve them; a window ends the day after its last day.
const WINDOW = { effective_from: '2026-01-01', effective_to: '2027-01-01' };
const record = (code: string, cents: string) => ({ scope: { codes: [code], ...WINDOW }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: cents }, flags: {}, rounding: 'HALF_UP_CENT', citation: null });

async function practice(label: string, output: unknown = syntheticContractOutput(), contractPages: readonly string[] = SYNTHETIC_CONTRACT_PAGES): Promise<Practice> {
  const world = await createTenantWorld(owner, label);
  const key = await provisionPracticeKey(keys, world.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
  const documentId = randomUUID();
  const bytes = serializePageText(contractPages);
  await documents.write(key.cipher, documentPagesKey(world.practiceId, documentId), Readable.from([bytes]));
  const agreementId = randomUUID();
  await asOwner(owner, [world.practiceId], async () => {
    await owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status, page_text_status, page_count)
       VALUES ($1, $2, 'contract', $3, 100, 'application/pdf', $4, 'clean', now(), 'stored', 'ready', $5)`,
      [documentId, world.practiceId, createHash('sha256').update(`SYNTHETIC CONTRACT ${label}`).digest('hex'), world.adminUserId, contractPages.length],
    );
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, $3, 'data_rights', '1', now() - interval '1 day', 'SYNTHETIC SIGNER', $4, $5)`,
      [agreementId, world.organizationId, world.practiceId, `agreements/${agreementId}`, randomBytes(32).toString('hex')],
    );
  });
  const sha256 = (await owner.query<{ sha256: string }>('SELECT sha256 FROM source_document WHERE id = $1', [documentId])).rows[0]?.sha256 ?? '';
  // The pages as intake stored them, as the run reads them back: the local provider answers that input.
  registerOutput(
    provider,
    'proposeContractTerms',
    { documentId, documentSha256: sha256, kind: 'contract', pages: parsePageText(bytes), ambiguous: false },
    output,
  );
  return { world, practiceId: world.practiceId, documentId, agreementId };
}

async function example(target: Practice, expected: object): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [target.practiceId], () =>
    owner.query(
      "INSERT INTO eval_example (id, source, purpose, input_ref, expected, practice_id, permission_ref) VALUES ($1, 'permitted', 'proposeContractTerms', $2, $3::jsonb, $4, $5)",
      [id, `model_call:${randomUUID()}`, JSON.stringify(expected), target.practiceId, target.agreementId],
    ),
  );
  return id;
}

const correction = (target: Practice, records: readonly object[], documentId = target.documentId) => ({
  format: CORRECTION_FORMAT,
  document_id: documentId,
  contract_version_id: randomUUID(),
  changed_fields: ['candidates[1].amount'],
  records,
});

let north: Practice;
let south: Practice;
let west: Practice;
const ids: Record<string, string> = {};

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  north = await practice('PERMITTED NORTH');
  south = await practice('PERMITTED SOUTH');
  // As the model proposed: every field right.
  ids.exact = await example(north, correction(north, [record('97110', '3250'), record('97140', '3025')]));
  // The specialist changed 97140's amount: the model's is wrong there.
  ids.corrected = await example(north, correction(north, [record('97110', '3250'), record('97140', '3000')]));
  // A document no longer readable, and an expectation in a format the run does not read.
  ids.gone = await example(north, correction(north, [record('97110', '3250')], randomUUID()));
  ids.unreadable = await example(north, { format: 'tp-eval-correction/0', records: [] });
  ids.south = await example(south, correction(south, [record('97110', '3250')]));
  // A model answer that is not the purpose's schema (the local provider answers by the pages it is sent, so these differ).
  west = await practice('PERMITTED WEST', { candidates: 'none' }, [...SYNTHETIC_CONTRACT_PAGES, 'SYNTHETIC ADDENDUM - INVENTED']);
  ids.west = await example(west, correction(west, [record('97110', '3250')]));
}, 120_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

const services = (): PermittedEvaluationServices => ({ pool: app, documents, keys, provider, production: false, logger: capturingLogger() });

describe('the evaluation on permitted examples inside the PHI boundary', () => {
  it('replays each practice’s examples through the gateway and scores them field by field against the final records', async () => {
    const runId = randomUUID();
    const report = await evaluatePermitted(services(), { runId, practiceIds: [north.practiceId] });
    expect(report).toMatchObject({ format: 'tp-model-eval-permitted/1', provider: 'local', practices: 1, examples: 4, promptVersion: PROMPTS.proposeContractTerms.id, promptSha256: PROMPTS.proposeContractTerms.sha256 });
    // exact: 2 records x 5 fields right; corrected: 9 right, 97140's amount wrong; gone: 5 fields missed; unreadable: nothing.
    expect(report.fields.amount).toEqual({ tp: 3, fp: 1, fn: 2 });
    expect(report.fields.codes).toEqual({ tp: 4, fp: 0, fn: 1 });
    expect(report.fields.effective_to).toEqual({ tp: 4, fp: 0, fn: 1 });
    expect(report.fields.percentage).toEqual({ tp: 0, fp: 0, fn: 0 });
    expect(report.total).toEqual({ tp: 19, fp: 1, fn: 6 });
    expect(report.problems).toEqual([
      { exampleId: ids.gone, problem: 'document_unavailable' },
      { exampleId: ids.unreadable, problem: 'expected_invalid' },
    ]);
    // The report holds no document text.
    const text = JSON.stringify(report);
    expect(SYNTHETIC_CONTRACT_PAGES.some((page) => page.split('\n').some((line) => text.includes(line)))).toBe(false);
    expect(text).not.toContain('Therapeutic exercise');

    // Each call is logged in the practice, in the run's name; the reads are audited under the run.
    const calls = await asOwner(owner, [north.practiceId], async () =>
      (await owner.query<{ actor_kind: string; actor_id: string; outcome: string }>('SELECT actor_kind, actor_id, outcome FROM model_call WHERE practice_id = $1 ORDER BY created_at', [north.practiceId])).rows,
    );
    expect(calls).toEqual([
      { actor_kind: 'service', actor_id: runId, outcome: 'completed' },
      { actor_kind: 'service', actor_id: runId, outcome: 'completed' },
    ]);
    const audited = await asOwner(owner, [north.practiceId], async () =>
      (
        await owner.query<{ object_type: string; n: string }>(
          "SELECT object_type, count(*)::text AS n FROM audit_event WHERE actor_id = $1 AND purpose = 'model_evaluation' AND action = 'read' GROUP BY object_type ORDER BY object_type",
          [runId],
        )
      ).rows,
    );
    expect(audited).toEqual([
      { object_type: 'eval_example', n: '4' },
      { object_type: 'source_document', n: '2' },
    ]);
  });

  it('reads only the practices named, each in its own scope', async () => {
    const both = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [north.practiceId, south.practiceId] });
    expect([both.practices, both.examples]).toEqual([2, 5]);
    const south1 = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [south.practiceId] });
    // The south contract's final records hold 97110 only: the proposal's 97140 row is wrong whole.
    expect([south1.examples, south1.problems, south1.total]).toEqual([1, [], { tp: 5, fp: 5, fn: 0 }]);
  });

  it('gates a later run against an earlier one: the same answers pass, a worse answer regresses', async () => {
    const earlier = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [north.practiceId] });
    const again = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [north.practiceId] });
    expect(permittedRegressions(again, earlier)).toEqual([]);
    // A provider that answers nothing for these documents: every call fails, nothing is proposed.
    const silent = await evaluatePermitted({ ...services(), provider: new LocalDeterministicProvider() }, { runId: randomUUID(), practiceIds: [north.practiceId] });
    expect(silent.problems.map((problem) => problem.problem)).toEqual(['call_failed:no_fixed_output', 'call_failed:no_fixed_output', 'document_unavailable', 'expected_invalid']);
    expect(permittedRegressions(silent, earlier)).toEqual(expect.arrayContaining(['recall_regressed:all', 'recall_regressed:amount']));
  });

  it('scores an answer that does not parse as proposing nothing', async () => {
    const report = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [west.practiceId] });
    expect([report.problems, report.total]).toEqual([[{ exampleId: ids.west, problem: 'invalid_output' }], { tp: 0, fp: 0, fn: 5 }]);
  });

  it('refuses the calls while the kill switch is on, and reports them as off', async () => {
    await owner.query("INSERT INTO feature_flag (key, scope, value) VALUES ('model.kill_switch', 'global', 'true'::jsonb)");
    try {
      const off = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [south.practiceId] });
      expect(off.problems).toEqual([{ exampleId: ids.south, problem: 'kill_switch' }]);
      expect(off.total).toEqual({ tp: 0, fp: 0, fn: 5 });
    } finally {
      await owner.query("DELETE FROM feature_flag WHERE key = 'model.kill_switch' AND scope = 'global'");
    }
  });
});
