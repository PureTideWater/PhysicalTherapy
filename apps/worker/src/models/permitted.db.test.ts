import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { parsePageText, serializePageText } from '@tp/contracts';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, documentPagesKey, openPool, provisionPracticeKey, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, asOwner, createMigratedDatabase, createTenantWorld, endPool } from '@tp/db/testing';
import { CORRECTION_FORMAT, CORRECTION_FORMAT_V1, type FieldTally, LocalDeterministicProvider, PROMPTS, ZERO_TALLY, asCounts, permittedRegressions } from '@tp/model-gateway';
import { SYNTHETIC_CONTRACT_PAGES, capturingLogger, registerOutput, syntheticContractOutput } from '@tp/model-gateway/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { DocumentStore } from '../storage/documents';
import { type PermittedEvaluationServices, evaluatePermitted } from './permitted';

/**
 * The evaluation on permitted examples inside the PHI boundary (PRD 14, Logging and evaluation; docs/adr/0054):
 * each practice's permitted contract-proposal examples are read in that practice's job scope and audited, the
 * document they correct is proposed again through the gateway (logged in model_call in the run's name), and the
 * proposal is tallied against the specialist's final records cited from that document, field by field (right, wrong
 * but verified, rejected, missed; docs/adr/0070). A call the gateway refused is counted apart, not as a miss. The
 * report (tp-model-eval-permitted/2) holds tallies, codes and example IDs, never a document's text. Everything here
 * is SYNTHETIC: an invented contract on the local deterministic provider.
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
const record = (code: string, cents: string) => ({ scope: { codes: [code], ...WINDOW }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: cents }, flags: {}, rounding: 'HALF_UP_CENT' });
/** A final's citation, as the version's approval writes it into a /2 correction: the document it cites, by ID. */
const cited = (documentId: string | null) => ({ citation: documentId === null ? null : { document_id: documentId, page: 2, quote: 'SYNTHETIC QUOTE', hash: randomBytes(32).toString('hex') } });
/** A field tally with only the counts named. */
const tally = (counts: Partial<FieldTally>): FieldTally => ({ ...ZERO_TALLY, ...counts });

/** A practice with a stored contract and a data-rights agreement; the local provider answers output for its pages (null: no answer is registered). */
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
  if (output !== null) {
    registerOutput(provider, 'proposeContractTerms', { documentId, documentSha256: sha256, kind: 'contract', pages: parsePageText(bytes), ambiguous: false }, output);
  }
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

/** A /2 correction of the document documentId, each record cited from it unless it states its own citation. */
const correction = (target: Practice, records: readonly object[], documentId = target.documentId, uncited = 0) => ({
  format: CORRECTION_FORMAT,
  document_id: documentId,
  contract_version_id: randomUUID(),
  decision: 'accepted_with_changes',
  changed_fields: ['candidates[1].amount'],
  uncited_finals: uncited,
  records: records.map((final) => ({ ...cited(documentId), ...final })),
});

let north: Practice;
let south: Practice;
let west: Practice;
let east: Practice;
let blank: Practice;
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
  east = await practice('PERMITTED EAST', syntheticContractOutput(), [...SYNTHETIC_CONTRACT_PAGES, 'SYNTHETIC SCHEDULE NOTE - INVENTED']);
  // A contract-plus-exhibit version: the exhibit's 97140 and a record entered with no citation are not the contract's expectation.
  ids.own = await example(east, correction(east, [record('97110', '3250'), { ...record('97140', '3025'), ...cited(randomUUID()) }, { ...record('97530', '4000'), ...cited(null) }], east.documentId, 1));
  // A /1 correction names no document in its citations, so all its finals are scored.
  ids.legacy = await example(east, { format: CORRECTION_FORMAT_V1, document_id: east.documentId, changed_fields: [], records: [{ ...record('97110', '3250'), citation: null }, { ...record('97140', '3025'), citation: null }] });
  // A document whose pages hold no text: the gateway refuses the call before it is made.
  blank = await practice('PERMITTED BLANK', null, ['', '']);
  ids.blank = await example(blank, correction(blank, [record('97110', '3250')]));
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

const services = (): PermittedEvaluationServices => ({ pool: app, documents, keys, provider, production: false, logger: capturingLogger() });

describe('the evaluation on permitted examples inside the PHI boundary', () => {
  it('replays each practice’s examples through the gateway and scores them field by field against the final records', async () => {
    const runId = randomUUID();
    const report = await evaluatePermitted(services(), { runId, practiceIds: [north.practiceId] });
    expect(report).toMatchObject({ format: 'tp-model-eval-permitted/2', provider: 'local', practices: 1, examples: 4, refused: 0, legacyUnfiltered: 0, uncitedFinals: 0, promptVersion: PROMPTS.proposeContractTerms.id, promptSha256: PROMPTS.proposeContractTerms.sha256 });
    expect(report.exampleIds).toEqual([ids.exact, ids.corrected, ids.gone, ids.unreadable].sort());
    // The run names itself and where it ran; no proposal here was of a contract marked ambiguous, so every example is the default model's.
    expect(report).toMatchObject({ runId, production: false, measured: 2 });
    expect(report.variants.default).toMatchObject({ modelId: PROMPTS.proposeContractTerms.models.local.default, exampleIds: report.exampleIds, measured: 2, total: report.total });
    expect(report.variants.ambiguous).toMatchObject({ examples: 0, exampleIds: [], measured: 0 });
    // exact: 2 records x 5 fields right; corrected: 9 right, 97140's amount wrong but verified; gone: 5 fields missed; unreadable: nothing.
    expect(report.fields.amount).toEqual(tally({ tp: 3, wrong: 1, missed: 1 }));
    expect(report.fields.codes).toEqual(tally({ tp: 4, missed: 1 }));
    expect(report.fields.effective_to).toEqual(tally({ tp: 4, missed: 1 }));
    expect(report.fields.percentage).toEqual(ZERO_TALLY);
    expect(report.total).toEqual(tally({ tp: 19, wrong: 1, missed: 5 }));
    // The counts of format /1 are derived from the tally, so precision and recall mean what they meant.
    expect(asCounts(report.fields.amount)).toEqual({ tp: 3, fp: 1, fn: 2 });
    expect(asCounts(report.total)).toEqual({ tp: 19, fp: 1, fn: 6 });
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
    expect([south1.examples, south1.problems, south1.total]).toEqual([1, [], tally({ tp: 5, extra: 5 })]);
  });

  it('gates a later run against an earlier one: the same answers pass, a worse answer regresses', async () => {
    const earlier = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [north.practiceId] });
    const again = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [north.practiceId] });
    expect(permittedRegressions(again, earlier)).toEqual([]);
    // A provider that answers nothing for these documents: every call fails, nothing is proposed.
    const silent = await evaluatePermitted({ ...services(), provider: new LocalDeterministicProvider() }, { runId: randomUUID(), practiceIds: [north.practiceId] });
    expect(silent.problems.map((problem) => problem.problem)).toEqual(['call_failed:no_fixed_output', 'call_failed:no_fixed_output', 'document_unavailable', 'expected_invalid']);
    expect(permittedRegressions(silent, earlier)).toEqual(expect.arrayContaining(['recall_regressed:default:all', 'recall_regressed:default:amount']));
  });

  it('scores a /2 example against its own document’s finals only, a /1 example against all of them, and counts each kind apart', async () => {
    const report = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [east.practiceId] });
    expect(report).toMatchObject({ examples: 2, problems: [], refused: 0, legacyUnfiltered: 1, uncitedFinals: 1 });
    // own: 97110's 5 fields right; the proposal's 97140 is not this document's, so its verified fields are extra (the exhibit's
    // 97140 and the uncited 97530 are neither missed nor matched). legacy: both records scored, 10 fields right.
    expect(report.total).toEqual(tally({ tp: 15, extra: 5 }));
    expect(report.fields.codes).toEqual(tally({ tp: 3, extra: 1 }));
  });

  it('counts a call the gateway refused apart from the tally: a refusal is not the model’s miss', async () => {
    const report = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [blank.practiceId] });
    expect(report).toMatchObject({ examples: 1, exampleIds: [ids.blank], refused: 1, problems: [{ exampleId: ids.blank, problem: 'refused:no_text' }] });
    expect(report.total).toEqual(ZERO_TALLY);
    // Nothing was sent, so nothing was logged as a call.
    expect(await asOwner(owner, [blank.practiceId], async () => (await owner.query<{ id: string }>('SELECT id FROM model_call WHERE practice_id = $1', [blank.practiceId])).rows)).toEqual([]);
    // Against an earlier run on the same example in which the call was made, the rise in refusals fails the gate.
    const earlier = { ...report, refused: 0, problems: [], variants: { ...report.variants, default: { ...report.variants.default, refused: 0 } } };
    expect(permittedRegressions(report, earlier)).toEqual(['refused_rose:default']);
  });

  it('scores an answer that does not parse as proposing nothing', async () => {
    const report = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [west.practiceId] });
    expect([report.problems, report.total]).toEqual([[{ exampleId: ids.west, problem: 'invalid_output' }], tally({ missed: 5 })]);
  });

  it('refuses the calls while the kill switch is on, and reports them as refused, apart from the tally', async () => {
    await owner.query("INSERT INTO feature_flag (key, scope, value) VALUES ('model.kill_switch', 'global', 'true'::jsonb)");
    try {
      const off = await evaluatePermitted(services(), { runId: randomUUID(), practiceIds: [south.practiceId] });
      // The gateway refused before any call: not the model's miss (record-permitted refuses such a run whole).
      expect(off.problems).toEqual([{ exampleId: ids.south, problem: 'refused:kill_switch' }]);
      expect([off.total, off.refused]).toEqual([ZERO_TALLY, 1]);
    } finally {
      await owner.query("DELETE FROM feature_flag WHERE key = 'model.kill_switch' AND scope = 'global'");
    }
  });
});
