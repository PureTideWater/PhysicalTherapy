import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JobActorIsPersonError, type PracticeScope, type ScopeClient, readDatabaseUrl, withJobScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { cents } from '@tp/money';
import { addDays, nextDisputeWindow } from '@tp/packets';
import { type CaseDispute, deriveCaseState } from '@tp/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEADLINE_RELEASE, type Practice, RELEASE } from '../price/test-support/pricing-world';
import { nextLevelDeadline } from '../triage/deadline';
import { DocumentStore, type WrittenDocument } from '../storage/documents';
import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { PacketExportFileIntegrityError, downloadPacketExport, packetExportDownloads } from './downloads';
import { PacketExportIntegrityError, exportPacketVersion } from './export';
import { exportReadiness } from './readiness';
import { PacketRefusedError } from './records';
import {
  PacketRuleError,
  acceptedPayerResponses,
  approvePacketVersion,
  attestPacketExport,
  confirmRegulation,
  exportsAwaitingAttestation,
  followUpsDue,
  logSubmission,
  packetOfCase,
  packetVersionOf,
  recordPayerResponse,
  regulationsAwaiting,
  remindFollowUps,
  requestPacketExport,
  singleUserApprovals,
  submissionLog,
  writePacketVersion,
} from './services';
import { PacketWorld } from './test-support/packet-world';
import { grantedReviewer } from './test-support/reviewer';

/**
 * Packets against PostgreSQL through the workflow services and the export job's own code (PRD 12; PRD
 * 5, J9 and J10; test matrix CAS-08 to CAS-15, LED-01; PRD 8's invariant: a packet_version with
 * verifier_passed = false cannot have an approval). Each case is a practice of its own: its SYNTHETIC CAS
 * fixture is parsed by the parse_835 job, its plan mapped to a signed-off fixed-schedule contract (97110
 * at 50.00 per unit), a run priced by the price job and triaged into one case.
 */

let w: PacketWorld;

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const CAS08_NARRATIVE = readFileSync(fileURLToPath(new URL('../../../../fixtures/synthetic/CAS-08/narrative-draft.txt', import.meta.url)), 'utf8');
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;

interface Setup {
  readonly practice: Practice;
  readonly caseId: string;
  /** A second billing manager: the practice has two people who approve packets. */
  readonly second: string;
}

async function cas08(label: string): Promise<Setup> {
  const practice = await w.practice(label);
  const caseId = await w.caseOf(practice, 'CAS-08/remit.835', 'CE:SYNPLAN-FIX-ONE', MARCH);
  return { practice, caseId, second: await w.person(practice, 'billing_manager') };
}

const write = (setup: Setup, actorId: string, options: { narrative?: string; basedOn?: string | null; promptPayState?: string | null; asOf?: string } = {}) =>
  w.as(setup.practice, actorId, (scope) =>
    writePacketVersion(scope, w.keys, {
      practiceId: setup.practice.practiceId,
      caseId: setup.caseId,
      basedOnVersionId: options.basedOn ?? null,
      ...(options.narrative === undefined ? {} : { narrative: options.narrative }),
      promptPayState: options.promptPayState ?? null,
      requestId: 'test-write',
      ...(options.asOf === undefined ? {} : { asOf: options.asOf }),
    }),
  );

const approve = (setup: Setup, actorId: string, versionId: string, versionSha256: string) =>
  w.as(setup.practice, actorId, (scope) => approvePacketVersion(scope, { practiceId: setup.practice.practiceId, versionId, versionSha256, requestId: 'test-approve' }));

const submit = (setup: Setup, versionId: string, submittedOn = w.today(), followUpOn: string | null = null) =>
  w.as(setup.practice, setup.practice.manager, (scope) =>
    logSubmission(scope, w.keys, { practiceId: setup.practice.practiceId, versionId, submittedOn, channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-1', followUpOn, requestId: 'test-submit' }),
  );

async function documentOf(practice: Practice): Promise<string> {
  const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query<{ id: string }>(
      `INSERT INTO source_document (practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
       VALUES ($1, 'payer_letter', $2, 100, 'application/pdf', $3, 'clean', now(), 'stored') RETURNING id`,
      [practice.practiceId, createHash('sha256').update(practice.practiceId).digest('hex'), practice.manager],
    ),
  );
  return (rows[0] as { id: string }).id;
}

const respond = (setup: Setup, submissionId: string, response: { kind: 'accepted' | 'partial' | 'denied' | 'info_requested' | 'reprocessed_no_change'; amountCents?: bigint; denialCategory?: string; reopensCase?: boolean; documentId: string }) =>
  w.as(setup.practice, setup.practice.manager, (scope) =>
    recordPayerResponse(scope, w.keys, {
      practiceId: setup.practice.practiceId,
      submissionId,
      kind: response.kind,
      amountCents: response.amountCents === undefined ? null : cents(response.amountCents),
      documentId: response.documentId,
      receivedOn: w.today(),
      denialCategory: response.denialCategory ?? null,
      notes: 'SYNTHETIC note on the response',
      reopensCase: response.reopensCase ?? false,
      requestId: 'test-respond',
    }),
  );

async function caseState(setup: Setup): Promise<{ state: string; deadline_on: string | null }> {
  const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ state: string; deadline_on: string | null }>('SELECT state, deadline_on::text FROM "case" WHERE id = $1', [setup.caseId]));
  return rows[0] as { state: string; deadline_on: string | null };
}

/**
 * An approved, exported and attested version of the case's code-built draft: approved by the second
 * billing manager, exported by the job, attested by the practice's reimbursement reviewer (D16).
 */
async function exported(setup: Setup): Promise<{ versionId: string; pdfSha256: string; csvSha256: string }> {
  const version = await write(setup, setup.practice.manager);
  await approve(setup, setup.second, version.versionId, version.contentSha256);
  const outcome = await w.export(setup.practice, version.versionId);
  if (outcome.outcome !== 'exported') {
    throw new Error(`not exported: ${outcome.outcome === 'not_exportable' ? outcome.reason : outcome.outcome}`);
  }
  await w.attest(setup.practice, version.versionId);
  return { versionId: version.versionId, pdfSha256: outcome.pdfSha256, csvSha256: outcome.csvSha256 };
}

/**
 * A job writing a version's export directly (as the export job's UPDATE does, with the version's own passing
 * report unless one is named): what the database refuses, whatever the worker checked.
 */
function jobExport(setup: Setup, versionId: string, packetId: string, report: string | null = 'verifier_report'): Promise<unknown> {
  const key = `practices/${setup.practice.practiceId}/packets/${packetId}/${randomUUID()}`;
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, (scope) =>
    scope.client.query(
      `UPDATE packet_version SET export_pdf_key = $2, export_csv_key = $3, export_sha256 = $4, export_csv_sha256 = $4, export_verifier_report = ${report === null ? 'NULL' : report} WHERE id = $1`,
      [versionId, `${key}.pdf`, `${key}.csv`, 'a'.repeat(64)],
    ),
  );
}

async function refusal(attempt: Promise<unknown>): Promise<Error> {
  const error = await attempt.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, 'the step should have been refused').toBeInstanceOf(Error);
  return error as Error;
}

describe('CAS-08: a narrative with a figure not in the input', () => {
  it('fails the verifier, which the version stores, and its approval is blocked; the code-built draft passes and is approved', async () => {
    const setup = await cas08('CAS-08');
    const failing = await write(setup, setup.practice.manager, { narrative: CAS08_NARRATIVE });
    expect(failing.verifier.passed).toBe(false);
    const figures = failing.verifier.mismatches.filter((item) => item.code === 'figure_not_in_input').map((item) => CAS08_NARRATIVE.slice(item.start, item.end));
    expect(figures).toEqual(['1234.56']);
    const stored = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: failing.versionId, requestId: 'test-read' }));
    expect(stored).toMatchObject({ verifierPassed: false, narrative: CAS08_NARRATIVE, current: true });
    expect(JSON.stringify(stored?.verifier)).not.toContain('1234.56');

    const blocked = await refusal(approve(setup, setup.second, failing.versionId, failing.contentSha256));
    expect(blocked).toBeInstanceOf(PacketRuleError);
    expect(blocked.message).toBe('a packet version the verifier failed cannot be approved');

    // PRD 8, Invariants: the CHECK holds even with every trigger off.
    const invariant = await refusal(w.superuser('UPDATE packet_version SET approved_by = $2, approved_at = now(), approved_sha256 = content_sha256 WHERE id = $1', [failing.versionId, setup.second]));
    expect(invariant.message).toContain('packet_version_approval_needs_verifier');

    const passing = await write(setup, setup.practice.manager, { basedOn: failing.versionId });
    expect(passing).toMatchObject({ versionNo: 2, verifier: { passed: true, mismatches: [] } });
    await expect(approve(setup, setup.second, passing.versionId, passing.contentSha256)).resolves.toMatchObject({ approvedAlone: false });
  });
});

describe('CAS-09: the drafter attempts approval', () => {
  it('refuses the person who drafted or last edited a packet, and an analyst, and admits another approver', async () => {
    const setup = await cas08('CAS-09');
    const analyst = await w.person(setup.practice, 'analyst');
    const third = await w.person(setup.practice, 'billing_manager');
    const first = await write(setup, setup.practice.manager);
    const drafter = await refusal(approve(setup, setup.practice.manager, first.versionId, first.contentSha256));
    expect(drafter.message).toBe('the person who drafted or last edited a packet cannot approve it');
    // The second billing manager edits: now neither the drafter nor the last editor may approve.
    const edited = await write(setup, setup.second, { basedOn: first.versionId });
    expect((await refusal(approve(setup, setup.second, edited.versionId, edited.contentSha256))).message).toBe('the person who drafted or last edited a packet cannot approve it');
    expect((await refusal(approve(setup, setup.practice.manager, edited.versionId, edited.contentSha256))).message).toBe('the person who drafted or last edited a packet cannot approve it');
    expect((await refusal(approve(setup, analyst, edited.versionId, edited.contentSha256))).message).toBe('a packet is approved by a person who approves packets, in their own name');
    // An approval names the hash of the version it approves.
    expect((await refusal(approve(setup, third, edited.versionId, first.contentSha256))).message).toBe('an approval names the hash of the version it approves');
    const approved = await approve(setup, third, edited.versionId, edited.contentSha256);
    expect(approved).toMatchObject({ approvedAlone: false });
    // Approved once: the same approval again changes nothing, and nobody else approves it again.
    await expect(approve(setup, third, edited.versionId, edited.contentSha256)).resolves.toEqual(approved);
    const another = await w.person(setup.practice, 'billing_manager');
    expect((await refusal(approve(setup, another, edited.versionId, edited.contentSha256))).message).toContain('approved once');
  });

  it('lets an analyst draft and a billing manager approve', async () => {
    const setup = await cas08('CAS-09-analyst');
    const analyst = await w.person(setup.practice, 'analyst');
    const version = await write(setup, analyst);
    await expect(approve(setup, setup.practice.manager, version.versionId, version.contentSha256)).resolves.toMatchObject({ approvedAlone: false });
  });
});

describe('CAS-10: a single-user practice', () => {
  it('lets the only approver approve their own version only 24 hours after writing it, with the audit flag', async () => {
    const practice = await w.practice('CAS-10');
    const caseId = await w.caseOf(practice, 'CAS-08/remit.835', 'CE:SYNPLAN-FIX-ONE', MARCH);
    const setup: Setup = { practice, caseId, second: practice.manager };
    const version = await write(setup, practice.manager);
    const early = await refusal(approve(setup, practice.manager, version.versionId, version.contentSha256));
    expect(early.message).toBe('with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written');
    await w.backdate(version.versionId, 25);
    await expect(approve(setup, practice.manager, version.versionId, version.contentSha256)).resolves.toMatchObject({ approvedAlone: true });
    const flagged = await w.as(practice, practice.manager, (scope) => singleUserApprovals(scope, { practiceId: practice.practiceId }));
    expect(flagged.map((item) => [item.versionId, item.caseId, item.hoursWaited >= 24])).toEqual([[version.versionId, caseId, true]]);
    const { rows: events } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ action: string; purpose: string }>("SELECT action, purpose FROM audit_event WHERE object_id = $1 AND action = 'packet_approved_alone'", [version.versionId]),
    );
    expect(events).toEqual([{ action: 'packet_approved_alone', purpose: 'single_user_practice' }]);
  });
});

describe('CAS-11: identifiers in a draft', () => {
  it('holds placeholders only, refuses a version holding an identifier, and inserts the canonical identifiers at export only', async () => {
    const setup = await cas08('CAS-11');
    const version = await write(setup, setup.practice.manager, { narrative: 'Claim {{claim_control_number:1}} of {{patient_name:1}} was paid short of the contract [3].' });
    expect(version.verifier.passed).toBe(true);
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) =>
      scope.client.query<{ line_table: Record<string, unknown>[]; narrative: string; content: Record<string, unknown> }>('SELECT line_table, narrative, content FROM packet_version WHERE id = $1', [version.versionId]),
    );
    const row = rows[0] as { line_table: Record<string, unknown>[]; narrative: string; content: Record<string, unknown> };
    expect(row.line_table.map((line) => line.claim_control_number)).toEqual(['{{claim_control_number:1}}', '{{claim_control_number:2}}', '{{claim_control_number:3}}']);
    expect(row.narrative).toMatch(/^enc:v1:/);
    expect(JSON.stringify(row.content)).not.toMatch(/SYNCCNCAS08|SYNPCNCAS08/);

    // A version whose schedule holds an identifier is refused, for every role.
    const tampered = { ...row.content, lines: (row.content.lines as Record<string, unknown>[]).map((line, index) => (index === 0 ? { ...line, claim_control_number: 'SYNCCNCAS080001' } : line)) };
    const refused = await refusal(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `INSERT INTO packet_version (practice_id, packet_id, version_no, content, narrative, content_sha256, verifier_passed, verifier_report, drafted_by)
           SELECT practice_id, packet_id, 2, $2, narrative, content_sha256, verifier_passed, verifier_report, drafted_by FROM packet_version WHERE id = $1`,
          [version.versionId, JSON.stringify(tampered)],
        ),
      ),
    );
    expect(refused.message).toContain('packet_version_content_valid');

    await approve(setup, setup.second, version.versionId, version.contentSha256);
    expect(await w.export(setup.practice, version.versionId)).toMatchObject({ outcome: 'exported' });
    const detail = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: version.versionId, requestId: 'test-read' }));
    const csv = (await w.stored(setup.practice, detail?.exportCsvKey ?? '')).toString('utf8');
    expect(csv).toContain('SYNCCNCAS080001');
    expect(csv).toContain('SYNCCNCAS080003');
    expect(csv.split('\r\n')[0]).toBe(
      'row,payer_claim_control_number,patient_control_number,patient_name,member_id,service_date,procedure_code,modifiers,units,expected,observed,variance,paid,paid_on,received_on,interest,trace_ref,window_ends_on,deadline_status,deadline_source,calculation_method,unrounded,rounded,patient_share,trace_sha256',
    );
    // The version itself still holds only placeholders.
    expect(detail?.content.lines.map((line) => line.claim_control_number)).toEqual(['{{claim_control_number:1}}', '{{claim_control_number:2}}', '{{claim_control_number:3}}']);
    expect(detail?.narrative).toContain('{{claim_control_number:1}}');
  });
});

describe('CAS-12: the export', () => {
  it('needs an approved version, stores the PDF and CSV sealed with their SHA-256 on the version, and the submission log shows them', async () => {
    const setup = await cas08('CAS-12');
    const version = await write(setup, setup.practice.manager);
    const queued: unknown[] = [];
    const queue = { send: (...args: unknown[]) => Promise.resolve(String(queued.push(args))) } as never;
    expect((await refusal(w.as(setup.practice, setup.practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: setup.practice.practiceId, versionId: version.versionId, requestId: 'r' })))).message).toBe(
      'exporting a packet needs its current version approved',
    );
    expect(await w.export(setup.practice, version.versionId)).toEqual({ outcome: 'not_exportable', reason: 'not_approved' });
    // Only the export job records an export: a person is refused.
    const person = await refusal(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `UPDATE packet_version SET export_pdf_key = $2, export_csv_key = $2, export_sha256 = $3, export_csv_sha256 = $3, export_verifier_report = verifier_report WHERE id = $1`,
          [version.versionId, `practices/${setup.practice.practiceId}/packets/${version.packetId}/${version.versionId}.pdf`, 'a'.repeat(64)],
        ),
      ),
    );
    expect(person.message).toMatch(/approved|export job/);

    await approve(setup, setup.second, version.versionId, version.contentSha256);
    await w.as(setup.practice, setup.practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: setup.practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(queued).toHaveLength(1);
    expect(JSON.stringify(queued[0])).toContain('packet_export');

    // Submitting before the export is refused.
    expect((await refusal(submit(setup, version.versionId))).message).toBe('a packet is submitted once it is exported');

    const outcome = await w.export(setup.practice, version.versionId);
    if (outcome.outcome !== 'exported') {
      throw new Error('not exported');
    }
    // A replay changes nothing (JOB-01).
    expect(await w.export(setup.practice, version.versionId)).toEqual({ outcome: 'already_exported' });
    const detail = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    // The verifier ran again over what was printed, and its report is stored with the export (CO-05).
    expect(outcome.verifier).toMatchObject({ format: 'tp-packet-verifier/2', passed: true, narrative_sha256: version.verifier.narrative_sha256 });
    expect(detail).toMatchObject({ exportSha256: outcome.pdfSha256, exportCsvSha256: outcome.csvSha256, exportVerifier: outcome.verifier, deadlineStatus: 'verified', attestedBy: null });
    // The stored hash is the SHA-256 of the exported file's bytes, read back through the document store.
    const pdf = await w.stored(setup.practice, detail?.exportPdfKey ?? '');
    const csv = await w.stored(setup.practice, detail?.exportCsvKey ?? '');
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(outcome.pdfSha256);
    expect(createHash('sha256').update(csv).digest('hex')).toBe(outcome.csvSha256);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // D16: a submission waits for the reimbursement reviewer's attestation, in the service and in Postgres.
    expect((await refusal(submit(setup, version.versionId))).message).toBe('a packet is submitted once a reimbursement reviewer has attested its export');
    const unattested = await refusal(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
           VALUES ($1, $2, $3, $4, 'fax', app_actor_id(), $4, $5, $6)`,
          [setup.practice.practiceId, setup.caseId, version.versionId, w.today(), outcome.pdfSha256, outcome.csvSha256],
        ),
      ),
    );
    expect(unattested.message).toBe('a packet is submitted once a reimbursement reviewer has attested its export');
    await w.attest(setup.practice, version.versionId);

    const logged = await submit(setup, version.versionId);
    expect(logged).toMatchObject({ exportSha256: outcome.pdfSha256, exportCsvSha256: outcome.csvSha256, disputeLevel: 1 });
    const log = await w.as(setup.practice, setup.practice.manager, (scope) => submissionLog(scope, w.keys, { practiceId: setup.practice.practiceId, caseId: setup.caseId, requestId: 'r' }));
    expect(log.map((entry) => [entry.exportSha256, entry.exportCsvSha256, entry.reference, entry.channel])).toEqual([[outcome.pdfSha256, outcome.csvSha256, 'SYNTHETIC-PORTAL-REF-1', 'payer_portal']]);
    // A submission naming another export's hash is refused.
    const wrong = await refusal(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
           VALUES ($1, $2, $3, $4, 'fax', app_actor_id(), $4, $5, $5)`,
          [setup.practice.practiceId, setup.caseId, version.versionId, w.today(), 'b'.repeat(64)],
        ),
      ),
    );
    expect(wrong.message).toBe('a submission carries the SHA-256 of the export it sent');
  });
});

describe('the verifier against what a narrative shows and the case’s own records (CAS-08, CAS-11; docs/adr/0047)', () => {
  const cp = (...points: number[]) => String.fromCodePoint(...points);
  const codesOf = (version: { verifier: { mismatches: readonly { code: string }[] } }) => version.verifier.mismatches.map((item) => item.code);

  it('fails a narrative naming the case’s patient or member, or hiding a figure, and keeps it from approval', async () => {
    const setup = await cas08('verifier-review');
    // A patient's name (CAS-08's first claim, SYNTHETIC) in any case, and a member ID without its placeholder.
    const named = await write(setup, setup.practice.manager, { narrative: 'Synthlastsbgcde Synthfirstgqv, a member of the plan, was underpaid [3].' });
    expect(named.verifier.passed).toBe(false);
    expect(codesOf(named)).toEqual(['identifier_in_narrative', 'identifier_in_narrative']);
    expect(JSON.stringify(named.verifier).toLowerCase()).not.toContain('synthlast');
    expect((await refusal(approve(setup, setup.second, named.versionId, named.contentSha256))).message).toBe('a packet version the verifier failed cannot be approved');
    const member = await write(setup, setup.practice.manager, { narrative: 'Member SYNMBR80014496 was underpaid [3].', basedOn: named.versionId });
    expect(codesOf(member)).toContain('identifier_in_narrative');
    // A fullwidth amount is read as the amount it shows, and stored as it reads (NFKC).
    const fullwidth = `The payer withheld $${[...'1,234.56'].map((char) => (/\d/.test(char) ? cp(0xff10 + Number.parseInt(char, 10)) : char === ',' ? cp(0xff0c) : char === '.' ? cp(0xff0e) : char)).join('')} [3].`;
    const read = await write(setup, setup.practice.manager, { narrative: fullwidth, basedOn: member.versionId });
    expect(codesOf(read)).toEqual(['figure_not_in_input']);
    const stored = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: read.versionId, requestId: 'r' }));
    expect(stored?.narrative).toBe('The payer withheld $1,234.56 [3].');
    // A zero-width space splitting a figure is a hidden character.
    const split = await write(setup, setup.practice.manager, { narrative: `The payer paid 1${cp(0x200b)}11 claims short [3].`, basedOn: read.versionId });
    expect(codesOf(split)).toContain('hidden_character');
    expect(split.verifier.passed).toBe(false);
  });

  it('approves only a version the current verifier passed', async () => {
    const setup = await cas08('verifier-format');
    const version = await write(setup, setup.practice.manager);
    await w.superuser(`UPDATE packet_version SET verifier_report = jsonb_set(verifier_report, '{format}', '"tp-packet-verifier/1"') WHERE id = $1`, [version.versionId]);
    expect((await refusal(approve(setup, setup.second, version.versionId, version.contentSha256))).message).toBe(
      'a packet version is approved only once the current verifier has passed it; write the version again',
    );
    const again = await write(setup, setup.practice.manager, { basedOn: version.versionId });
    await expect(approve(setup, setup.second, again.versionId, again.contentSha256)).resolves.toMatchObject({ approvedAlone: false });
  });

  it('records an export’s keys only under the version’s own practice and packet', async () => {
    const setup = await cas08('export-keys');
    const other = await cas08('export-keys-other');
    const version = await write(setup, setup.practice.manager);
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    const job = (keyOf: (packetId: string) => string) =>
      withJobScope(w.app, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, async (scope) => {
        const { rows } = await scope.client.query<{ packet_id: string }>('SELECT packet_id FROM packet_version WHERE id = $1', [version.versionId]);
        const key = keyOf(rows[0]?.packet_id ?? '');
        return scope.client.query(
          'UPDATE packet_version SET export_pdf_key = $2, export_csv_key = $3, export_sha256 = $4, export_csv_sha256 = $4, export_verifier_report = verifier_report WHERE id = $1',
          [version.versionId, `${key}.pdf`, `${key}.csv`, 'a'.repeat(64)],
        );
      });
    // Another tenant's key space, and another packet's of the same practice: refused.
    await expect(job((packetId) => `practices/${other.practice.practiceId}/packets/${packetId}/${randomUUID()}`)).rejects.toMatchObject({ code: '23514', constraint: 'packet_version_export_keys_its_own' });
    await expect(job(() => `practices/${setup.practice.practiceId}/packets/${randomUUID()}/${randomUUID()}`)).rejects.toMatchObject({ code: '23514', constraint: 'packet_version_export_keys_its_own' });
    expect(await w.export(setup.practice, version.versionId)).toMatchObject({ outcome: 'exported' });
  });

  it('logs a submission of the current version only, or of one sent before an edit replaced it (CAS-13)', async () => {
    const setup = await cas08('submission-current');
    const first = await exported(setup);
    const second = await write(setup, setup.second, { basedOn: first.versionId, narrative: 'The payer paid these lines short of the contract [3].' });
    // Sent today, after the edit: the approval it carried was cleared, so it is refused, by the service and by Postgres.
    expect((await refusal(submit(setup, first.versionId))).message).toBe("a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit");
    const direct = await refusal(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
           VALUES ($1, $2, $3, $4, 'fax', app_actor_id(), $4, $5, $6)`,
          [setup.practice.practiceId, setup.caseId, first.versionId, w.today(), first.pdfSha256, first.csvSha256],
        ),
      ),
    );
    expect(direct.message).toBe("a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit");
    // Sent the day before the edit (the export dated earlier, as a migration would): logged.
    await w.superuser("UPDATE packet_version SET exported_at = now() - interval '3 days' WHERE id = $1", [first.versionId]);
    await expect(submit(setup, first.versionId, addDays(w.today(), -1))).resolves.toMatchObject({ caseId: setup.caseId });
    expect(second.versionNo).toBe(2);
  });

  it('reminds the case’s people once when a follow-up has come with no response (CAS-14)', async () => {
    const setup = await cas08('follow-up-reminder');
    const version = await exported(setup);
    const logged = await submit(setup, version.versionId, w.today(), w.today());
    const remind = () => withJobScope(w.app, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, (scope) => remindFollowUps(scope, { practiceId: setup.practice.practiceId, asOf: w.today() }));
    const told = await remind();
    expect(told).toBeGreaterThanOrEqual(2);
    expect(await remind()).toBe(0);
    const { rows } = await asOwner(w.owner, [setup.practice.practiceId], () =>
      w.owner.query<{ user_id: string; counts: unknown; totals_cents: unknown }>("SELECT user_id, counts, totals_cents FROM notification WHERE practice_id = $1 AND kind = 'follow_up' AND subject_id = $2 ORDER BY user_id", [
        setup.practice.practiceId,
        logged.submissionId,
      ]),
    );
    // The case has no owner, so the practice's people are told: counts only.
    expect(rows).toHaveLength(told);
    expect(rows.map((row) => row.user_id)).toEqual(expect.arrayContaining([setup.practice.manager, setup.second]));
    expect(new Set(rows.map((row) => JSON.stringify([row.counts, row.totals_cents])))).toEqual(new Set([JSON.stringify([{ days_waiting: 0 }, {}])]));
    // A person never reads the recipients.
    await expect(w.as(setup.practice, setup.practice.manager, (scope) => remindFollowUps(scope, { practiceId: setup.practice.practiceId, asOf: w.today() }))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('CO-05: the export runs the verifier again over what it prints, and records the hash of the bytes it wrote', () => {
  it('refuses a narrative that fails the verifier now (an identifier of the case in it), and Postgres refuses an export without the passing report', async () => {
    const setup = await cas08('export-verifier');
    const version = await write(setup, setup.practice.manager, { narrative: 'The payer paid these lines short of the contract [3].' });
    expect(version.verifier.passed).toBe(true);
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    // Without the verifier's passing report over the version's narrative, Postgres refuses the export.
    const without = await refusal(jobExport(setup, version.versionId, version.packetId, null));
    expect(without.message).toBe("a packet version is exported with the verifier's passing report over the narrative it rendered");
    const failing = JSON.stringify({ ...version.verifier, passed: false, mismatches: [{ code: 'figure_not_in_input', kind: 'amount', sentence: 0, start: 0, end: 3 }] });
    expect((await refusal(jobExport(setup, version.versionId, version.packetId, `'${failing}'::jsonb`))).message).toBe("a packet version is exported with the verifier's passing report over the narrative it rendered");
    const other = JSON.stringify({ ...version.verifier, narrative_sha256: 'b'.repeat(64) });
    expect((await refusal(jobExport(setup, version.versionId, version.packetId, `'${other}'::jsonb`))).message).toBe("a packet version is exported with the verifier's passing report over the narrative it rendered");
    // The first line's patient is renamed on the record (a SYNTHETIC correction) to a word the narrative holds:
    // the export's verifier, run again against today's identifiers, fails it, and nothing is written.
    const line = version.content.lines[0];
    const { rows } = await asOwner(w.owner, [setup.practice.practiceId], () =>
      w.owner.query<{ id: string }>('SELECT c.patient_ref_id AS id FROM service_line sl JOIN claim c ON c.id = sl.claim_id WHERE sl.id = $1', [line?.service_line_id]),
    );
    await w.superuser('UPDATE patient_ref SET last_name = $2 WHERE id = $1', [rows[0]?.id, setup.practice.cipher.encrypt('patient_ref.last_name', 'PAID')]);
    expect(await w.export(setup.practice, version.versionId)).toEqual({ outcome: 'not_exportable', reason: 'verifier_failed' });
    const detail = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(detail).toMatchObject({ exportSha256: null, exportVerifier: null, exportedAt: null });
  });

  it('fails when the store seals other bytes than the export printed, and records nothing', async () => {
    const setup = await cas08('export-integrity');
    const version = await write(setup, setup.practice.manager);
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    class Lying extends DocumentStore {
      override async write(...args: Parameters<DocumentStore['write']>): Promise<WrittenDocument> {
        const written = await super.write(...args);
        return { ...written, sha256: 'f'.repeat(64) };
      }
    }
    const lying = { ...w.services, documents: new Lying(new MemorySealedBytes()) };
    await expect(exportPacketVersion(w.triage.pricing.jobContext(setup.practice.practiceId), lying, setup.practice.practiceId, version.versionId)).rejects.toBeInstanceOf(PacketExportIntegrityError);
    const detail = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(detail).toMatchObject({ exportSha256: null, exportedAt: null });
    // The honest store's export records the SHA-256 of exactly the bytes it sealed.
    const outcome = await w.export(setup.practice, version.versionId);
    expect(outcome.outcome).toBe('exported');
  });
});

describe('CO-05: an unverified deadline blocks the export (D17)', () => {
  it('states each line’s deadline unverified with its cause, and refuses the export in the worker, the handler and Postgres, whatever the version states', async () => {
    const practice = await w.practice('deadline-uncited');
    const { caseId, opened } = await w.previousImageCase(practice, 'CAS-08/remit.835', 'CE:SYNPLAN-FIX-ONE', MARCH);
    // Triage itself opens no case for lines whose deadline is not verified.
    expect(opened).toBe(0);
    const setup: Setup = { practice, caseId, second: await w.person(practice, 'billing_manager') };
    const version = await write(setup, practice.manager);
    expect(version.verifier.passed).toBe(true);
    if (version.content.format !== 'tp-packet/2') {
      throw new Error('tp-packet/2 expected');
    }
    expect(version.content.deadline).toMatchObject({ basis: 'line_windows', status: 'unverified', lines_verified: 0, lines: 3, causes: ['CONTRACT_WINDOW_UNCITED'], sources: [] });
    expect(version.content.lines.map((line) => [line.deadline.status, line.deadline.source, line.deadline.cause, line.deadline.ends_on === line.window_ends_on])).toEqual([
      ['unverified', 'contract', 'CONTRACT_WINDOW_UNCITED', true],
      ['unverified', 'contract', 'CONTRACT_WINDOW_UNCITED', true],
      ['unverified', 'contract', 'CONTRACT_WINDOW_UNCITED', true],
    ]);
    const stored = await w.as(practice, practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(stored?.deadlineStatus).toBe('unverified');
    // A version cannot state its deadline verified when the database does not derive it so.
    const claimed = { ...version.content, deadline: { ...version.content.deadline, status: 'verified' }, lines: version.content.lines.map((line) => ({ ...line, deadline: { ...line.deadline, status: 'verified', cause: null } })) };
    const stated = await refusal(
      w.as(practice, practice.manager, (scope) =>
        scope.client.query(
          `INSERT INTO packet_version (practice_id, packet_id, version_no, content, narrative, content_sha256, verifier_passed, verifier_report, drafted_by)
           SELECT practice_id, packet_id, 2, $2, narrative, content_sha256, verifier_passed, verifier_report, drafted_by FROM packet_version WHERE id = $1`,
          [version.versionId, JSON.stringify(claimed)],
        ),
      ),
    );
    expect(stated).toMatchObject({ code: '23514' });
    // Approval is a person's judgement of the version; the export is held to the deadline.
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    expect(await w.export(practice, version.versionId)).toEqual({ outcome: 'not_exportable', reason: 'deadline_unverified' });
    const queue = { send: () => Promise.resolve('queued') } as never;
    expect((await refusal(w.as(practice, practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: practice.practiceId, versionId: version.versionId, requestId: 'r' })))).message).toBe(
      'a packet version whose deadline is not verified is not exported',
    );
    expect((await refusal(jobExport(setup, version.versionId, version.packetId))).message).toBe('a packet version whose deadline is not verified is not exported');
    const after = await w.as(practice, practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(after).toMatchObject({ exportSha256: null, exportedAt: null, exportVerifier: null });
    expect((await refusal(submit(setup, version.versionId))).message).toBe('a packet is submitted once it is exported');
  });
});

describe('D16: the reimbursement reviewer attests the export over its SHA-256', () => {
  it('is attested once, after the export, over its two files, by a reviewer under a support grant in their own name; never by a billing manager, the drafter or the approver', async () => {
    const setup = await cas08('attestation');
    const { practice } = setup;
    const reviewer = await w.reviewer(practice);
    const attest = (actorId: string, files: { pdf: string; csv: string }) =>
      w.as(practice, actorId, (scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId: version.versionId, pdfSha256: files.pdf, csvSha256: files.csv, requestId: 'r' }));
    const version = await write(setup, practice.manager);
    // Internal users approve nothing (docs/adr/0041): the reviewer is refused the approval.
    expect(await refusal(approve(setup, reviewer, version.versionId, version.contentSha256))).toMatchObject({ code: '42501' });
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    // Before the export there is nothing to attest.
    expect((await refusal(attest(reviewer, { pdf: 'a'.repeat(64), csv: 'a'.repeat(64) }))).message).toBe('a packet version is attested once its export is made');
    const outcome = await w.export(practice, version.versionId);
    if (outcome.outcome !== 'exported') {
      throw new Error('not exported');
    }
    const files = { pdf: outcome.pdfSha256, csv: outcome.csvSha256 };
    // The reviewer downloads both files first, each checked against its SHA-256 (the owner's addition of 2026-10-18).
    await w.download(practice, reviewer, version.versionId);
    expect(await w.as(practice, reviewer, (scope) => exportsAwaitingAttestation(scope, { practiceId: practice.practiceId }))).toMatchObject([
      { versionId: version.versionId, caseId: setup.caseId, exportSha256: files.pdf, exportCsvSha256: files.csv, lines: 3 },
    ]);
    // A billing manager who approves packets does not attest: the service refuses, and Postgres in SQL.
    expect(await refusal(attest(setup.second, files))).toMatchObject({ name: 'PermissionDeniedError' });
    const signed = (pdf: string, csv: string, checklist: readonly string[] = ['figures', 'deadline', 'calculation', 'identifiers', 'files', 'independent']) =>
      JSON.stringify({ format: 'tp-attestation/1', checklist, pdf_sha256: pdf, csv_sha256: csv });
    const direct = (actorId: string, attestation: string) =>
      w.as(practice, actorId, (scope) => scope.client.query('UPDATE packet_version SET attested_by = $2, attestation = $3 WHERE id = $1', [version.versionId, actorId, attestation]));
    expect(await refusal(direct(setup.second, signed(files.pdf, files.csv)))).toMatchObject({ code: '42501' });
    // In their own name, over the export's files, with no words.
    expect(await refusal(w.as(practice, reviewer, (scope) => scope.client.query('UPDATE packet_version SET attested_by = $2, attestation = $3 WHERE id = $1', [version.versionId, setup.second, signed(files.pdf, files.csv)])))).toMatchObject({ code: '42501' });
    expect((await refusal(attest(reviewer, { pdf: 'f'.repeat(64), csv: files.csv }))).message).toBe('the files reviewed are not this export’s; open the review again');
    expect(await refusal(direct(reviewer, signed('f'.repeat(64), files.csv)))).toMatchObject({ code: '23514', constraint: 'packet_version_attestation_names_its_export' });
    expect(await refusal(direct(reviewer, signed(files.pdf, files.csv, ['figures', 'SYNTHLAST SYNTHFIRST'])))).toMatchObject({ code: '23514', constraint: 'packet_version_attestation_holds_no_words' });
    // The person who approved it never attests it (here made the reviewer's own approval, triggers off).
    await w.superuser('UPDATE packet_version SET approved_by = $2 WHERE id = $1', [version.versionId, reviewer]);
    expect((await refusal(attest(reviewer, files))).message).toBe('the person who drafted, wrote or approved a packet does not attest its export');
    await w.superuser('UPDATE packet_version SET approved_by = $2 WHERE id = $1', [version.versionId, setup.second]);
    const attested = await attest(reviewer, files);
    expect(attested.attested).toBe(true);
    // Once: the same attestation again changes nothing, its time is the database's, and the reviewer edits nothing else.
    expect(await attest(reviewer, files)).toEqual({ attestedAt: attested.attestedAt, attested: false });
    expect(await refusal(direct(reviewer, signed(files.pdf, files.csv, ['figures'])))).toMatchObject({ code: '23514' });
    expect(await refusal(w.as(practice, reviewer, (scope) => scope.client.query('UPDATE packet_version SET attested_at = now() WHERE id = $1', [version.versionId])))).toMatchObject({ code: '42501' });
    const detail = await w.as(practice, practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(detail).toMatchObject({ attestedBy: reviewer, attestation: { format: 'tp-attestation/1', pdf_sha256: files.pdf, csv_sha256: files.csv } });
    expect(await w.as(practice, reviewer, (scope) => exportsAwaitingAttestation(scope, { practiceId: practice.practiceId }))).toEqual([]);
    await expect(submit(setup, version.versionId)).resolves.toMatchObject({ exportSha256: files.pdf, exportCsvSha256: files.csv });
  });
});

describe('D16: the reviewer attests only after downloading both files of that export (the owner’s addition of 2026-10-18; ADR 0061, F9)', () => {
  const SQL_WORDS = "a packet's export is attested once its reviewer has downloaded both its PDF and its CSV, each checked against its SHA-256";
  const signed = (files: { pdf: string; csv: string }) =>
    JSON.stringify({ format: 'tp-attestation/1', checklist: ['figures', 'deadline', 'calculation', 'identifiers', 'files', 'independent'], pdf_sha256: files.pdf, csv_sha256: files.csv });

  /** The attestation refused in the handler (the service the attest route runs) and, its check bypassed, in Postgres. */
  async function refusedInBothLayers(practice: Practice, reviewer: string, versionId: string, files: { pdf: string; csv: string }): Promise<void> {
    const handler = await refusal(w.as(practice, reviewer, (scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId, pdfSha256: files.pdf, csvSha256: files.csv, requestId: 'r' })));
    expect(handler).toMatchObject({ name: 'PacketRefusedError', reason: 'export_not_downloaded' });
    const sql = await refusal(
      w.as(practice, reviewer, (scope) => scope.client.query('UPDATE packet_version SET attested_by = app_actor_id(), attestation = $2 WHERE id = $1', [versionId, signed(files)])),
    );
    expect(sql).toMatchObject({ code: '23514', message: SQL_WORDS });
  }

  async function exportedVersion(setup: Setup, basedOn: string | null = null) {
    const version = await write(setup, setup.practice.manager, basedOn === null ? {} : { basedOn, narrative: 'The payer paid these lines short of the contract [3].' });
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    const outcome = await w.export(setup.practice, version.versionId);
    if (outcome.outcome !== 'exported') {
      throw new Error('not exported');
    }
    return { versionId: version.versionId, files: { pdf: outcome.pdfSha256, csv: outcome.csvSha256 } };
  }

  const downloadEvents = async (practice: Practice, versionId: string) =>
    (
      await asOwner(w.owner, [practice.practiceId], () =>
        w.owner.query<{ action: string; actor_id: string }>(
          "SELECT action, actor_id FROM audit_event WHERE object_id = $1 AND action IN ('packet_export_pdf_downloaded', 'packet_export_csv_downloaded') ORDER BY at, action",
          [versionId],
        ),
      )
    ).rows;

  it('is refused with no download, with only the PDF, with only the CSV and with another person’s downloads, in the handler and in Postgres', async () => {
    const setup = await cas08('attest-downloads');
    const { practice } = setup;
    const { versionId, files } = await exportedVersion(setup);
    const grant = () => grantedReviewer(w.owner, practice.practiceId);
    // No download.
    const none = await grant();
    await refusedInBothLayers(practice, none, versionId, files);
    expect(await w.as(practice, none, (scope) => packetExportDownloads(scope, { versionId }))).toEqual([]);
    // Only the PDF; only the CSV.
    const pdfOnly = await grant();
    await w.download(practice, pdfOnly, versionId, ['pdf']);
    expect(await w.as(practice, pdfOnly, (scope) => packetExportDownloads(scope, { versionId }))).toEqual(['pdf']);
    await refusedInBothLayers(practice, pdfOnly, versionId, files);
    const csvOnly = await grant();
    await w.download(practice, csvOnly, versionId, ['csv']);
    await refusedInBothLayers(practice, csvOnly, versionId, files);
    // Another person's downloads of both files (the billing manager's, and another reviewer's: pdfOnly and csvOnly together) are not the attester's.
    await w.download(practice, practice.manager, versionId);
    await refusedInBothLayers(practice, none, versionId, files);
    expect(await w.as(practice, practice.manager, (scope) => packetExportDownloads(scope, { versionId }))).toEqual(['pdf', 'csv']);
    expect((await downloadEvents(practice, versionId)).map((event) => event.actor_id).sort()).toEqual([pdfOnly, csvOnly, practice.manager, practice.manager].sort());
    // The attester's own two downloads, after the export: attested.
    await w.download(practice, none, versionId);
    await expect(w.as(practice, none, (scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId, pdfSha256: files.pdf, csvSha256: files.csv, requestId: 'r' }))).resolves.toMatchObject({ attested: true });
  });

  it('is refused for downloads of another version, and a new export needs its own downloads', async () => {
    const setup = await cas08('attest-other-version');
    const { practice } = setup;
    const reviewer = await w.reviewer(practice);
    const first = await exportedVersion(setup);
    // The reviewer downloads the first export's two files, then a later version is written, approved and exported.
    await w.download(practice, reviewer, first.versionId);
    const second = await exportedVersion(setup, first.versionId);
    expect(second.files).not.toEqual(first.files);
    expect(await w.as(practice, reviewer, (scope) => packetExportDownloads(scope, { versionId: second.versionId }))).toEqual([]);
    await refusedInBothLayers(practice, reviewer, second.versionId, second.files);
    await w.download(practice, reviewer, second.versionId);
    await expect(
      w.as(practice, reviewer, (scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId: second.versionId, pdfSha256: second.files.pdf, csvSha256: second.files.csv, requestId: 'r' })),
    ).resolves.toMatchObject({ attested: true });
  });

  it('records no download whose bytes fail the SHA-256 check, so the attestation is refused', async () => {
    const setup = await cas08('attest-tampered');
    const { practice } = setup;
    const reviewer = await w.reviewer(practice);
    const { versionId, files } = await exportedVersion(setup);
    // The store hands back other bytes than the export sealed (a forged or damaged object).
    class Tampered extends DocumentStore {
      override async *read(): AsyncIterable<Buffer> {
        await Promise.resolve();
        yield Buffer.from('SYNTHETIC bytes that are not the export\n');
      }
    }
    await w.download(practice, reviewer, versionId, ['pdf']);
    const tampered = { documents: new Tampered(new MemorySealedBytes()), keys: w.keys };
    await expect(w.as(practice, reviewer, (scope) => downloadPacketExport(scope, tampered, { practiceId: practice.practiceId, versionId, file: 'csv', requestId: 'r' }))).rejects.toBeInstanceOf(
      PacketExportFileIntegrityError,
    );
    expect(await downloadEvents(practice, versionId)).toEqual([{ action: 'packet_export_pdf_downloaded', actor_id: reviewer }]);
    await refusedInBothLayers(practice, reviewer, versionId, files);
  });

  it('cannot be evidenced under a job’s actor (its own ID, of either kind, or naming the reviewer under it), nor for a version not exported, a person who may not read it or another practice', async () => {
    const setup = await cas08('attest-job-evidence');
    const { practice } = setup;
    const reviewer = await w.reviewer(practice);
    const { versionId, files } = await exportedVersion(setup);
    const jobId = randomUUID();
    const insert = (actorId: string, actorKind: string, action: string, objectId = versionId) =>
      `INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id) VALUES ('${actorId}', '${actorKind}', '${action}', 'packet_version', '${objectId}', '${practice.practiceId}', 'line_export', 'r')`;
    const asJob = (sql: string) => withJobScope(w.app, { jobId, practiceId: practice.practiceId }, (scope) => scope.client.query(sql));
    for (const action of ['packet_export_pdf_downloaded', 'packet_export_csv_downloaded']) {
      // Under the job's own ID, whatever kind it names, and in the reviewer's name: the job is no person, and
      // writes only in its own name (the trigger refuses before the audit log's INSERT policy is checked).
      for (const [actorId, kind] of [[jobId, 'user'], [jobId, 'service'], [reviewer, 'user']] as const) {
        expect(await refusal(asJob(insert(actorId, kind, action)))).toMatchObject({ code: '42501', message: "a packet export's download is recorded for the person it was served to, in their own name" });
      }
    }
    // The download function itself, run in the job's scope, records nothing and fails.
    expect(await refusal(withJobScope(w.app, { jobId, practiceId: practice.practiceId }, (scope) => downloadPacketExport(scope, w.services, { practiceId: practice.practiceId, versionId, file: 'pdf', requestId: 'r' })))).toMatchObject({
      code: '42501',
    });
    expect(await downloadEvents(practice, versionId)).toEqual([]);
    expect(await withJobScope(w.app, { jobId, practiceId: practice.practiceId }, (scope) => packetExportDownloads(scope, { versionId }))).toEqual([]);
    await refusedInBothLayers(practice, reviewer, versionId, files);
    // A person who may not read the export, and a version not exported, record no download either.
    const viewer = await w.person(practice, 'viewer');
    expect(await refusal(w.as(practice, viewer, (scope) => scope.client.query(insert(viewer, 'user', 'packet_export_pdf_downloaded'))))).toMatchObject({ code: '42501' });
    // Nor does a person of the practice record one in the reviewer's name.
    expect(await refusal(w.as(practice, practice.manager, (scope) => scope.client.query(insert(reviewer, 'user', 'packet_export_pdf_downloaded'))))).toMatchObject({ code: '42501' });
    const unexported = await write(setup, practice.manager, { basedOn: versionId, narrative: 'The payer paid these lines short of the contract [3].' });
    expect(await refusal(w.as(practice, reviewer, (scope) => scope.client.query(insert(reviewer, 'user', 'packet_export_pdf_downloaded', unexported.versionId))))).toMatchObject({ code: '23514' });
    // A reviewer of another practice reads none of this practice's evidence.
    const other = await w.practice('attest-job-evidence-other');
    const outsider = await w.reviewer(other);
    expect(await w.as(other, outsider, (scope) => packetExportDownloads(scope, { versionId }))).toEqual([]);
  });

  it('cannot be forged on the worker’s own login, whatever the job sets app.actor_id to: no download event, no evidence read and no attestation (a compromised worker; the owner’s ruling of 2026-10-18)', async () => {
    const setup = await cas08('attest-worker-login');
    const { practice } = setup;
    const reviewer = await w.reviewer(practice);
    // The export job itself runs on the worker's login (w.export), so the job's own work is untouched.
    const { versionId, files } = await exportedVersion(setup);
    const jobId = randomUUID();
    const PERSON_ONLY = { code: '42501', message: "a packet export's download is recorded by the web request that served it, never on the worker's login" };
    /** On the worker's login, through withJobScope as every job reaches the database, then app.actor_id set to the reviewer. */
    const asReviewerOnWorkerLogin = <T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>) =>
      withJobScope(w.worker, { jobId, practiceId: practice.practiceId }, async (scope) => {
        await scope.client.query("SELECT set_config('app.actor_id', $1, true)", [reviewer]);
        // What made the forgery work on a shared login: the database now takes the job's transaction for the reviewer's.
        expect((await scope.client.query<{ person: boolean; job: boolean }>('SELECT app_actor_is_person() AS person, app_session_is_job() AS job')).rows).toEqual([{ person: true, job: true }]);
        return run({ ...scope, kind: 'practice', actorId: reviewer, actorKind: 'user' });
      });
    const insert = (action: string) =>
      `INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id) VALUES (app_actor_id(), 'user', '${action}', 'packet_version', '${versionId}', '${practice.practiceId}', 'line_export', 'forged')`;
    for (const action of ['packet_export_pdf_downloaded', 'packet_export_csv_downloaded']) {
      // A raw event in the reviewer's name, and the same after SET ROLE tp_app (session_user does not change).
      expect(await refusal(asReviewerOnWorkerLogin((scope) => scope.client.query(insert(action))))).toMatchObject(PERSON_ONLY);
      expect(await refusal(asReviewerOnWorkerLogin(async (scope) => scope.client.query(`SET LOCAL ROLE tp_app; ${insert(action)}`)))).toMatchObject(PERSON_ONLY);
    }
    // The download function itself, its hash check passing, records nothing on the worker's login.
    for (const file of ['pdf', 'csv'] as const) {
      expect(await refusal(asReviewerOnWorkerLogin((scope) => downloadPacketExport(scope, w.services, { practiceId: practice.practiceId, versionId, file, requestId: 'forged' })))).toMatchObject(PERSON_ONLY);
    }
    // The marker cannot be taken off or put on: the worker's login may not SET ROLE to it or leave it.
    expect(await refusal(asReviewerOnWorkerLogin((scope) => scope.client.query('SET LOCAL ROLE tp_job')))).toMatchObject({ code: '42501' });
    expect(await refusal(asReviewerOnWorkerLogin((scope) => scope.client.query('REVOKE tp_job FROM CURRENT_USER')))).toMatchObject({ code: '42501' });
    expect(await downloadEvents(practice, versionId)).toEqual([]);
    // The review page reads no download for the reviewer, and the honest reviewer's attestation is refused in both layers.
    expect(await w.as(practice, reviewer, (scope) => packetExportDownloads(scope, { versionId }))).toEqual([]);
    await refusedInBothLayers(practice, reviewer, versionId, files);

    // Once the reviewer has downloaded both files in their own requests, the worker's login still reads no evidence
    // and still cannot attest in their name.
    await w.download(practice, reviewer, versionId);
    expect(await asReviewerOnWorkerLogin((scope) => packetExportDownloads(scope, { versionId }))).toEqual([]);
    expect(
      await refusal(asReviewerOnWorkerLogin((scope) => scope.client.query('UPDATE packet_version SET attested_by = app_actor_id(), attestation = $2 WHERE id = $1', [versionId, signed(files)]))),
    ).toMatchObject({ code: '42501', message: "a packet's export is attested in its reviewer's own request, never on the worker's login" });
    // The attest service refuses it first: a job's scope holds no role in the practice, whatever its actor.
    expect(await refusal(asReviewerOnWorkerLogin((scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId, pdfSha256: files.pdf, csvSha256: files.csv, requestId: 'forged' })))).toMatchObject({
      name: 'PermissionDeniedError',
    });
    const { rows } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ attested_by: string | null }>('SELECT attested_by FROM packet_version WHERE id = $1', [versionId]));
    expect(rows).toEqual([{ attested_by: null }]);
    // The reviewer's own request, on the web's login, attests.
    await expect(w.as(practice, reviewer, (scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId, pdfSha256: files.pdf, csvSha256: files.csv, requestId: 'r' }))).resolves.toMatchObject({ attested: true });
  });

  it('refuses a job scope whose job ID names a person, on either login, before the job runs', async () => {
    const setup = await cas08('attest-job-person-id');
    const { practice } = setup;
    const reviewer = await w.reviewer(practice);
    const { versionId } = await exportedVersion(setup);
    for (const pool of [w.worker, w.app]) {
      let ran = false;
      const attempt = withJobScope(pool, { jobId: reviewer, practiceId: practice.practiceId }, async (scope) => {
        ran = true;
        return downloadPacketExport(scope, w.services, { practiceId: practice.practiceId, versionId, file: 'pdf', requestId: 'r' });
      });
      await expect(attempt).rejects.toBeInstanceOf(JobActorIsPersonError);
      expect(ran).toBe(false);
    }
    expect(await downloadEvents(practice, versionId)).toEqual([]);
  });
});

describe('CAS-13: an edit after approval', () => {
  it('is a new version that clears the approval; the old one never changes and is no longer exported', async () => {
    const setup = await cas08('CAS-13');
    const first = await write(setup, setup.practice.manager);
    await approve(setup, setup.second, first.versionId, first.contentSha256);
    // Writing on a stale version is refused.
    await expect(write(setup, setup.second, { basedOn: null })).rejects.toBeInstanceOf(PacketRefusedError);
    const second = await write(setup, setup.second, { basedOn: first.versionId, narrative: 'The payer paid these lines short of the contract [3].' });
    const packet = await w.as(setup.practice, setup.practice.manager, (scope) => packetOfCase(scope, { practiceId: setup.practice.practiceId, caseId: setup.caseId }));
    expect(packet).toMatchObject({ currentVersionId: second.versionId });
    const current = await w.as(setup.practice, setup.practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: second.versionId, requestId: 'r' }));
    expect(current).toMatchObject({ approvedBy: null, current: true, versionNo: 2 });
    expect(await w.export(setup.practice, first.versionId)).toEqual({ outcome: 'not_exportable', reason: 'not_current' });
    // A version never changes once written, for the owner too.
    for (const sql of ["UPDATE packet_version SET content = content || '{\"requested_action\": \"SYNTHETIC\"}' WHERE id = $1", "UPDATE packet_version SET verifier_passed = NOT verifier_passed WHERE id = $1", 'DELETE FROM packet_version WHERE id = $1']) {
      const error = await refusal(asOwner(w.owner, [setup.practice.practiceId], () => w.owner.query(sql, [first.versionId]), setup.practice.manager));
      expect(error.message).toMatch(/never changes|never deleted|verifier/);
    }
  });
});

describe('CAS-14: a submission with no response in 45 days', () => {
  it('follows up 45 days after it was submitted, until a response comes', async () => {
    const setup = await cas08('CAS-14');
    const version = await exported(setup);
    const logged = await submit(setup, version.versionId);
    expect(logged.followUpOn).toBe(addDays(w.today(), 45));
    const due = (asOf: string) => w.as(setup.practice, setup.practice.manager, (scope) => followUpsDue(scope, { practiceId: setup.practice.practiceId, asOf }));
    expect(await due(addDays(w.today(), 44))).toEqual([]);
    expect(await due(addDays(w.today(), 45))).toEqual([{ caseId: setup.caseId, submissionId: logged.submissionId, submittedOn: w.today(), followUpOn: logged.followUpOn, daysWaiting: 45 }]);
    await respond(setup, logged.submissionId, { kind: 'info_requested', documentId: await documentOf(setup.practice) });
    expect(await due(addDays(w.today(), 45))).toEqual([]);
  });
});

describe('CAS-15: an interest line where a state rule applies', () => {
  it('states interest from the SYNTHETIC state ZZ record as its own line, never inside expected', async () => {
    const practice = await w.practice('CAS-15');
    const caseId = await w.caseOf(practice, 'CAS-15/remit.835', 'CE:SYNPLAN-FIX-ZZ', { from: '2026-02-01', to: '2026-02-28' });
    const setup: Setup = { practice, caseId, second: await w.person(practice, 'billing_manager') };
    const version = await write(setup, practice.manager, { promptPayState: 'ZZ', asOf: '2026-05-01' });
    const { content } = version;
    expect(content.pattern.expected_cents).toBe('10000');
    expect(content.lines[0]).toMatchObject({ expected_cents: '10000', received_on: '2026-03-02', paid_on: '2026-05-01' });
    expect(content.interest).toMatchObject({ state: 'ZZ', release_no: 900001, days_to_pay: 33, annual_rate_percent: '9', computed: true, total_cents: '57' });
    expect(content.interest?.lines[0]).toMatchObject({ due_on: '2026-04-04', days_late: 27 });
    expect(version.verifier.passed).toBe(true);
    const { rows } = await w.as(practice, practice.manager, (scope) =>
      scope.client.query<{ interest_cents: string; expected: string }>(
        `SELECT v.interest_cents::text, (SELECT sum((l ->> 'expected_cents')::bigint) FROM jsonb_array_elements(v.line_table) l)::text AS expected FROM packet_version v WHERE v.id = $1`,
        [version.versionId],
      ),
    );
    expect(rows).toEqual([{ interest_cents: '57', expected: '10000' }]);
    // A state the release holds no rule for: the line says so, as an evidence gap.
    const none = await write(setup, practice.manager, { promptPayState: 'QQ', basedOn: version.versionId });
    expect(none.content.interest).toMatchObject({ state: 'QQ', computed: false, total_cents: null, reasons: ['prompt_pay_rule_missing'] });
    expect(none.content.evidence_gaps).toEqual([{ code: 'prompt_pay_rule_missing', row: null }]);
  });
});

describe('submissions, payer responses and the case states they derive (PRD 8; PRD 12)', () => {
  const dispute = (response: CaseDispute['response'], reopened = false): CaseDispute => ({ response, reopened });

  it('moves the case through submitted, awaiting a response and resolved, the way @tp/triage derives it', async () => {
    const setup = await cas08('states');
    expect(await caseState(setup)).toMatchObject({ state: 'open' });
    const version = await exported(setup);
    const logged = await submit(setup, version.versionId);
    const lines = [{ writtenOff: false, stage: 'actionable' as const }];
    expect((await caseState(setup)).state).toBe('submitted');
    expect(deriveCaseState(lines, dispute(null))).toBe('submitted');
    const document = await documentOf(setup.practice);
    await respond(setup, logged.submissionId, { kind: 'info_requested', documentId: document });
    expect((await caseState(setup)).state).toBe('awaiting_response');
    expect(deriveCaseState(lines, dispute('info_requested'))).toBe('awaiting_response');
    // The practice answers with the same export: submitted again, then the payer accepts part of it.
    const again = await submit(setup, version.versionId);
    expect((await caseState(setup)).state).toBe('submitted');
    await respond(setup, again.submissionId, { kind: 'partial', amountCents: 3000n, documentId: document });
    expect((await caseState(setup)).state).toBe('partially_resolved');
    expect(deriveCaseState(lines, dispute('partial'))).toBe('partially_resolved');
    // The payer has answered: no further submission of this dispute.
    expect((await refusal(submit(setup, version.versionId))).message).toBe('the payer has answered this dispute; only a denial that reopens the case starts the next level');
    const accepted = await w.as(setup.practice, setup.practice.manager, (scope) => acceptedPayerResponses(scope, { practiceId: setup.practice.practiceId, caseId: setup.caseId }));
    expect(accepted.map((item) => [item.kind, item.amountCents, item.lines.length])).toEqual([['partial', 3000n, 3]]);
  });

  it('resolves on an acceptance and on a denial that does not reopen the case; a response needs its document and the latest submission', async () => {
    const setup = await cas08('states-resolved');
    const version = await exported(setup);
    const logged = await submit(setup, version.versionId);
    const document = await documentOf(setup.practice);
    const noDocument = await refusal(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        recordPayerResponse(scope, w.keys, { practiceId: setup.practice.practiceId, submissionId: logged.submissionId, kind: 'denied', amountCents: null, documentId: null, receivedOn: w.today(), requestId: 'r' }),
      ),
    );
    expect(noDocument.message).toContain('payer_response_evidence');
    await respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'medical_necessity', documentId: document });
    expect((await caseState(setup)).state).toBe('resolved');
    expect(deriveCaseState([{ writtenOff: false, stage: 'actionable' }], dispute('denied'))).toBe('resolved');
    // A reopen with no next window known (the contract states no appeal levels) is refused.
    expect((await refusal(respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'medical_necessity', reopensCase: true, documentId: document }))).message).toBe(
      'no next dispute window is known for this case, so the denial cannot reopen it',
    );
  });

  it('reopens the case for a second-level dispute within the next window after a denial with a reason', async () => {
    const setup = await cas08('second-level');
    // The contract's appeal levels: 60 days for the first appeal (set as a migration would, triggers off).
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ version: string }>("SELECT pattern_key ->> 'contract_version_id' AS version FROM \"case\" WHERE id = $1", [setup.caseId]));
    await w.superuser(`UPDATE contract_version SET appeal_levels = '[{"level": 1, "days": 60}]' WHERE id = $1`, [rows[0]?.version]);
    const first = await exported(setup);
    const logged = await submit(setup, first.versionId);
    const document = await documentOf(setup.practice);
    const reopened = await respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'bundling', reopensCase: true, documentId: document });
    expect(reopened.nextWindowEndsOn).toBe(addDays(w.today(), 60));
    // @tp/packets holds the same rule the database computed the window by.
    expect(nextDisputeWindow({ kind: 'contract', appealLevels: [{ level: 1, days: 60 }] }, 1, w.today())).toEqual({ level: 2, endsOn: reopened.nextWindowEndsOn });
    expect(await caseState(setup)).toEqual({ state: 'awaiting_response', deadline_on: addDays(w.today(), 60) });
    expect(deriveCaseState([{ writtenOff: false, stage: 'actionable' }], dispute('denied', true))).toBe('awaiting_response');
    // The level-one export cannot be the second-level submission.
    expect((await refusal(submit(setup, first.versionId))).message).toBe("a submission sends a version of the case's dispute level");
    const second = await write(setup, setup.practice.manager, { basedOn: first.versionId });
    expect(second.content.dispute_level).toBe(2);
    expect(second.content.requested_action).toMatch(/^Dispute level 2\./);
    // D17: the next level's window is the contract's appeal level, which cites no evidence, so its deadline is
    // not verified and the second-level packet is not exported (CO-05); its lines' own windows stay verified.
    expect(second.content.format === 'tp-packet/2' ? second.content.deadline : null).toMatchObject({
      basis: 'next_level_window',
      ends_on: reopened.nextWindowEndsOn,
      status: 'unverified',
      causes: ['NEXT_LEVEL_UNCITED'],
    });
    expect(second.content.format === 'tp-packet/2' ? second.content.lines.map((line) => line.deadline.status) : []).toEqual(['verified', 'verified', 'verified']);
    await approve(setup, setup.second, second.versionId, second.contentSha256);
    expect(await w.export(setup.practice, second.versionId)).toEqual({ outcome: 'not_exportable', reason: 'deadline_unverified' });
    // The handler refuses it too, and so does Postgres, whatever a job writes.
    const queue = { send: () => Promise.resolve('queued') } as never;
    expect((await refusal(w.as(setup.practice, setup.practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: setup.practice.practiceId, versionId: second.versionId, requestId: 'r' })))).message).toBe(
      'a packet version whose deadline is not verified is not exported',
    );
    expect((await refusal(jobExport(setup, second.versionId, second.packetId))).message).toBe('a packet version whose deadline is not verified is not exported');
    expect((await refusal(submit(setup, second.versionId))).message).toBe('a packet is submitted once it is exported');
    expect((await caseState(setup)).state).toBe('awaiting_response');
  });

  it('judges a later level’s export by the window the reopening denial gave, never by the lines’ first-level windows (readiness)', async () => {
    const setup = await cas08('second-level-window');
    // An appeal level longer than the lines' own windows (ten years from the payment date), so the first-level windows end first.
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ version: string }>("SELECT pattern_key ->> 'contract_version_id' AS version FROM \"case\" WHERE id = $1", [setup.caseId]));
    await w.superuser(`UPDATE contract_version SET appeal_levels = '[{"level": 1, "days": 4000}]' WHERE id = $1`, [rows[0]?.version]);
    const first = await exported(setup);
    const logged = await submit(setup, first.versionId);
    const reopened = await respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'bundling', reopensCase: true, documentId: await documentOf(setup.practice) });
    const next = reopened.nextWindowEndsOn ?? '';
    const second = await write(setup, setup.practice.manager, { basedOn: first.versionId });
    expect(second.content.dispute_level).toBe(2);
    await approve(setup, setup.second, second.versionId, second.contentSha256);
    const lineEnds = (await w.as(setup.practice, setup.practice.manager, (scope) =>
      scope.client.query<{ ends: string }>('SELECT max(window_ends_on)::text AS ends FROM priced_line WHERE id = ANY ($1::uuid[])', [second.content.lines.map((line) => line.priced_line_id)]),
    )).rows[0]?.ends ?? '';
    expect(lineEnds < next).toBe(true);
    const reasons = async (asOf: string) => {
      const readiness = await w.as(setup.practice, setup.practice.manager, (scope) => exportReadiness(scope.client, { practiceId: setup.practice.practiceId, versionId: second.versionId, asOf }));
      return readiness?.outcome === 'refused' ? readiness.reasons : [];
    };
    // After every line's first-level window, before the next level's: no window has passed for this level (its deadline is the
    // contract's appeal level, which cites no evidence, so it is unverified).
    expect(await reasons(addDays(lineEnds, 1))).toEqual(['deadline_unverified']);
    // After the next level's window: that is this level's passed window, said as the next level's, never as a line's.
    expect(await reasons(addDays(next, 1))).toEqual(['next_window_passed', 'deadline_unverified']);
  });

  it('closes written off when every line is, and takes no new version or submission then', async () => {
    const setup = await cas08('closed');
    const version = await write(setup, setup.practice.manager);
    await w.as(setup.practice, setup.practice.manager, (scope) =>
      scope.client.query("UPDATE case_line SET written_off_reason = 'not_worth_pursuit', written_off_by = app_actor_id() WHERE case_id = $1", [setup.caseId]),
    );
    expect((await caseState(setup)).state).toBe('closed_written_off');
    await expect(write(setup, setup.practice.manager, { basedOn: version.versionId })).rejects.toMatchObject({ reason: 'case_closed' });
    expect((await refusal(approve(setup, setup.second, version.versionId, version.contentSha256))).message).toContain('changed since this version was written');
  });

  it('lets the recovery ledger’s job record a reprocessed remittance with no change, in no one’s name, and nothing else', async () => {
    const setup = await cas08('job-response');
    const version = await exported(setup);
    const logged = await submit(setup, version.versionId);
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ id: string }>("SELECT id FROM remittance WHERE practice_id = $1 AND status = 'loaded' LIMIT 1", [setup.practice.practiceId]));
    const remittanceId = (rows[0] as { id: string }).id;
    const asJob = (kind: 'reprocessed_no_change' | 'accepted') =>
      w.triage.pricing.jobContext(setup.practice.practiceId).transaction((scope) =>
        recordPayerResponse(scope, w.keys, {
          practiceId: setup.practice.practiceId,
          submissionId: logged.submissionId,
          kind,
          amountCents: kind === 'accepted' ? cents(100n) : null,
          documentId: null,
          remittanceId: kind === 'reprocessed_no_change' ? remittanceId : null,
          receivedOn: w.today(),
          requestId: 'job',
        }),
      );
    expect((await refusal(asJob('accepted'))).message).toContain('payer_response');
    await expect(asJob('reprocessed_no_change')).resolves.toMatchObject({ caseState: 'resolved', nextWindowEndsOn: null });
    const { rows: recorded } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ recorded_by: string | null; remittance_id: string }>('SELECT recorded_by, remittance_id FROM payer_response'));
    expect(recorded).toEqual([{ recorded_by: null, remittance_id: remittanceId }]);
  });

  it('LED-01: a packet submitted and answered writes no ledger entry and moves no line past actionable', async () => {
    const setup = await cas08('LED-01');
    const version = await exported(setup);
    const logged = await submit(setup, version.versionId);
    await respond(setup, logged.submissionId, { kind: 'accepted', amountCents: 9000n, documentId: await documentOf(setup.practice) });
    const { rows: stages } = await w.as(setup.practice, setup.practice.manager, (scope) =>
      scope.client.query<{ stage: string }>('SELECT DISTINCT ON (service_line_id) stage FROM line_status ORDER BY service_line_id, seq DESC'),
    );
    expect(new Set(stages.map((row) => row.stage))).toEqual(new Set(['actionable']));
    const { rows: entries } = await asOwner(w.owner, [setup.practice.practiceId], () => w.owner.query<{ entries: string }>('SELECT count(*)::text AS entries FROM ledger_entry'));
    expect(entries).toEqual([{ entries: '0' }]);
    expect((await caseState(setup)).state).toBe('resolved');
  });
});

describe('a Medicare Advantage non-contracted case', () => {
  it('cites the regulation, and is approved only once a contract specialist confirms it applies', async () => {
    // The SYNTHETIC release's fee schedule pays the Medicare Advantage fixtures' lines in full, so the
    // CAS-08 case stands in: its pattern is set to a non-contracted Medicare Advantage plan's (as
    // triage would record one), with triggers off.
    const setup = await cas08('MA');
    await w.superuser(`UPDATE "case" SET rate_record_id = NULL, pattern_key = pattern_key || '{"mapping_kind": "ma_noncontracted", "contract_version_id": null, "rate_record_id": null}' WHERE id = $1`, [setup.caseId]);
    const { practice } = setup;
    const version = await write(setup, practice.manager);
    expect(version.content.citation).toMatchObject({ kind: 'regulation', reference: '42 CFR 422.214' });
    expect(version.content.requested_action).toContain('Original Medicare');
    expect(version.verifier.passed).toBe(true);
    expect((await refusal(approve(setup, setup.second, version.versionId, version.contentSha256))).message).toBe('a contract specialist confirms the regulation applies to the case before its packet is approved');
    // A billing manager is refused by the service, and by the database in SQL.
    expect((await refusal(w.as(practice, setup.second, (scope) => confirmRegulation(scope, { practiceId: practice.practiceId, versionId: version.versionId, requestId: 'r' })))).message).toMatch(
      /cannot answer pricing questions/,
    );
    expect(
      (await refusal(w.as(practice, setup.second, (scope) => scope.client.query('UPDATE packet_version SET regulation_confirmed_by = app_actor_id() WHERE id = $1', [version.versionId])))).message,
    ).toBe("a regulation's application to a case is confirmed by a contract specialist, in their own name");
    const waiting = await w.as(practice, w.specialist, (scope) => regulationsAwaiting(scope, { practiceId: practice.practiceId }));
    expect(waiting).toMatchObject([{ versionId: version.versionId, caseId: setup.caseId, reference: '42 CFR 422.214', lines: 3, claims: 3 }]);
    await w.as(practice, w.specialist, (scope) => confirmRegulation(scope, { practiceId: practice.practiceId, versionId: version.versionId, requestId: 'r' }));
    expect(await w.as(practice, w.specialist, (scope) => regulationsAwaiting(scope, { practiceId: practice.practiceId }))).toEqual([]);
    await expect(approve(setup, setup.second, version.versionId, version.contentSha256)).resolves.toMatchObject({ approvedAlone: false });
    // A contract citation takes no confirmation.
    const contract = await cas08('MA-contract');
    const cited = await write(contract, contract.practice.manager);
    expect((await refusal(w.as(contract.practice, w.specialist, (scope) => confirmRegulation(scope, { practiceId: contract.practice.practiceId, versionId: cited.versionId, requestId: 'r' })))).message).toBe(
      'a regulation citation is confirmed once, before approval',
    );
  });
});

describe('CO-05: a version of an earlier dispute level than the case’s (D17: after a reopened denial the deadline is the next window’s)', () => {
  /** A contract case whose first appeal level is 60 days, exported, attested and submitted at level 1. */
  async function submittedFirstLevel(label: string) {
    const setup = await cas08(label);
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ version: string }>("SELECT pattern_key ->> 'contract_version_id' AS version FROM \"case\" WHERE id = $1", [setup.caseId]));
    await w.superuser(`UPDATE contract_version SET appeal_levels = '[{"level": 1, "days": 60}]' WHERE id = $1`, [rows[0]?.version]);
    const first = await exported(setup);
    const logged = await submit(setup, first.versionId);
    return { setup, first, logged, document: await documentOf(setup.practice) };
  }

  it('is approved, but its export is refused in the worker, the handler and Postgres once a denial has reopened the case', async () => {
    const { setup, first, logged, document } = await submittedFirstLevel('stale-level-export');
    // An edit written while the dispute is with the payer: still the first level.
    const stale = await write(setup, setup.practice.manager, { basedOn: first.versionId, narrative: 'The payer paid these lines short of the contract [3].' });
    expect(stale.content.dispute_level).toBe(1);
    await respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'bundling', reopensCase: true, documentId: document });
    // The case is at level 2 now; the version states level 1's deadline (its lines' windows, verified).
    expect(stale.content.format === 'tp-packet/2' ? stale.content.deadline : null).toMatchObject({ basis: 'line_windows', status: 'verified' });
    await expect(approve(setup, setup.second, stale.versionId, stale.contentSha256)).resolves.toMatchObject({ approvedAlone: false });
    expect(await w.export(setup.practice, stale.versionId)).toEqual({ outcome: 'not_exportable', reason: 'not_case_level' });
    const queue = { send: () => Promise.resolve('queued') } as never;
    const words = "only a version of the case's dispute level is exported; write the packet again at this level";
    expect((await refusal(w.as(setup.practice, setup.practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: setup.practice.practiceId, versionId: stale.versionId, requestId: 'r' })))).message).toBe(words);
    expect((await refusal(jobExport(setup, stale.versionId, stale.packetId))).message).toBe(words);
    // A version written now is of level 2, with the next window's deadline (the contract's appeal level: not verified).
    const current = await write(setup, setup.practice.manager, { basedOn: stale.versionId });
    expect(current.content.format === 'tp-packet/2' ? current.content.deadline : null).toMatchObject({ basis: 'next_level_window', status: 'unverified', causes: ['NEXT_LEVEL_UNCITED'] });
  });

  it('exported at its level before the denial, is not attested once the denial has reopened the case', async () => {
    const { setup, first, logged, document } = await submittedFirstLevel('stale-level-attest');
    const stale = await write(setup, setup.practice.manager, { basedOn: first.versionId, narrative: 'The payer paid these lines short of the contract [3].' });
    await approve(setup, setup.second, stale.versionId, stale.contentSha256);
    const outcome = await w.export(setup.practice, stale.versionId);
    if (outcome.outcome !== 'exported') {
      throw new Error('the level-one edit is exported while its level is the case’s');
    }
    await respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'bundling', reopensCase: true, documentId: document });
    const reviewer = await w.reviewer(setup.practice);
    await w.download(setup.practice, reviewer, stale.versionId);
    const attempt = (actorId: string) =>
      w.as(setup.practice, actorId, (scope) => attestPacketExport(scope, { practiceId: setup.practice.practiceId, versionId: stale.versionId, pdfSha256: outcome.pdfSha256, csvSha256: outcome.csvSha256, requestId: 'r' }));
    expect((await refusal(attempt(reviewer))).message).toBe("only a version of the case's dispute level is attested");
    expect((await refusal(submit(setup, stale.versionId))).message).toBe('a packet is submitted once a reimbursement reviewer has attested its export');
  });
});

describe('D16: the attester took no part in any version of the packet', () => {
  it('refuses the writer of an earlier version and the approver of an earlier version, as it refuses the first drafter', async () => {
    const setup = await cas08('attester-took-part');
    const { practice } = setup;
    const third = await w.person(practice, 'billing_manager');
    const reviewer = await w.reviewer(practice);
    const first = await write(setup, practice.manager);
    await approve(setup, setup.second, first.versionId, first.contentSha256);
    const middle = await write(setup, setup.second, { basedOn: first.versionId, narrative: 'The payer paid these lines short of the contract [3].' });
    const last = await write(setup, practice.manager, { basedOn: middle.versionId });
    await approve(setup, third, last.versionId, last.contentSha256);
    const outcome = await w.export(practice, last.versionId);
    if (outcome.outcome !== 'exported') {
      throw new Error('not exported');
    }
    await w.download(practice, reviewer, last.versionId);
    const attest = () =>
      w.as(practice, reviewer, (scope) => attestPacketExport(scope, { practiceId: practice.practiceId, versionId: last.versionId, pdfSha256: outcome.pdfSha256, csvSha256: outcome.csvSha256, requestId: 'r' }));
    const words = 'the person who drafted, wrote or approved a packet does not attest its export';
    // The reviewer as the writer of the middle version, and then as the approver of the first (each set as a migration would, triggers off).
    await w.superuser('UPDATE packet_version SET drafted_by = $2 WHERE id = $1', [middle.versionId, reviewer]);
    expect(await refusal(attest())).toMatchObject({ code: '42501', message: words });
    await w.superuser('UPDATE packet_version SET drafted_by = $2 WHERE id = $1', [middle.versionId, setup.second]);
    await w.superuser('UPDATE packet_version SET approved_by = $2 WHERE id = $1', [first.versionId, reviewer]);
    expect(await refusal(attest())).toMatchObject({ code: '42501', message: words });
    await w.superuser('UPDATE packet_version SET approved_by = $2 WHERE id = $1', [first.versionId, setup.second]);
    await expect(attest()).resolves.toMatchObject({ attested: true });
  });
});

describe('CO-05: a version states its deadline and calculations as its inputs give them', () => {
  it('is refused when written with another figure, date or source than its trace, its contract window and its lines give, and its export is refused when its content was changed since', async () => {
    const setup = await cas08('stated-inputs');
    const { practice } = setup;
    const version = await write(setup, practice.manager);
    if (version.content.format !== 'tp-packet/2') {
      throw new Error('tp-packet/2 expected');
    }
    const content = version.content;
    const [line] = content.lines;
    const [source] = content.deadline.sources;
    if (line === undefined || source?.kind !== 'contract_window') {
      throw new Error('a line and its contract window expected');
    }
    const calculationWords = /states each line's calculation as its stored trace has it/;
    const deadlineWords = /states the day its deadline ends and its lines as its inputs give them/;
    const evidenceWords = /names the evidence its deadline rests on as it stands/;
    const exactlyWords = /names exactly the evidence its lines' windows rest on, each once/;
    const forgeries = {
      step: { ...content, lines: content.lines.map((item, index) => (index === 0 ? { ...item, calculation: { ...item.calculation, steps: [{ step: 'base', amount_cents: '12345' }] } } : item)) },
      unrounded: { ...content, lines: content.lines.map((item, index) => (index === 0 && item.calculation.rounding !== null ? { ...item, calculation: { ...item.calculation, rounding: { ...item.calculation.rounding, unrounded_cents: '12345.4' } } } : item)) },
      release: { ...content, lines: content.lines.map((item, index) => (index === 0 ? { ...item, calculation: { ...item.calculation, release_no: 900099 } } : item)) },
      ends_on: { ...content, deadline: { ...content.deadline, ends_on: '2037-01-01' } },
      lines_verified: { ...content, deadline: { ...content.deadline, lines_verified: content.deadline.lines_verified - 1 } },
      quote: { ...content, deadline: { ...content.deadline, sources: [{ ...source, quote: 'SYNTHETIC FORGED QUOTE 5000 days' }] } },
      page: { ...content, deadline: { ...content.deadline, sources: [{ ...source, page: 9 }] } },
      days: { ...content, deadline: { ...content.deadline, sources: [{ ...source, days: 5000 }] } },
      verifier: { ...content, deadline: { ...content.deadline, sources: [{ ...source, verified_by: setup.second }] } },
      missing: { ...content, deadline: { ...content.deadline, sources: [] } },
      twice: { ...content, deadline: { ...content.deadline, sources: [source, source] } },
    };
    const refusedWith: Readonly<Record<keyof typeof forgeries, RegExp>> = {
      step: calculationWords,
      unrounded: calculationWords,
      release: calculationWords,
      ends_on: deadlineWords,
      lines_verified: deadlineWords,
      quote: evidenceWords,
      page: evidenceWords,
      days: evidenceWords,
      verifier: evidenceWords,
      missing: exactlyWords,
      twice: exactlyWords,
    };
    for (const [name, forged] of Object.entries(forgeries) as [keyof typeof forgeries, unknown][]) {
      const error = await refusal(
        w.as(practice, practice.manager, (scope) =>
          scope.client.query(
            `INSERT INTO packet_version (practice_id, packet_id, version_no, content, narrative, content_sha256, verifier_passed, verifier_report, drafted_by)
             SELECT practice_id, packet_id, 2, $2, narrative, content_sha256, verifier_passed, verifier_report, drafted_by FROM packet_version WHERE id = $1`,
            [version.versionId, JSON.stringify(forged)],
          ),
        ),
      );
      expect(error, name).toMatchObject({ code: '23514' });
      expect(error.message, name).toMatch(refusedWith[name]);
    }
    // The version as written states its inputs; changed since (as only a superuser with triggers off could), the export prints nothing.
    await approve(setup, setup.second, version.versionId, version.contentSha256);
    await w.superuser('UPDATE packet_version SET content = $2 WHERE id = $1', [version.versionId, JSON.stringify(forgeries.quote)]);
    expect(await w.export(practice, version.versionId)).toEqual({ outcome: 'not_exportable', reason: 'inputs_differ' });
    await w.superuser('UPDATE packet_version SET content = $2 WHERE id = $1', [version.versionId, JSON.stringify({ ...content, lines: content.lines.map((item, index) => (index === 0 ? { ...item, calculation: { ...item.calculation, trace_sha256: 'c'.repeat(64) } } : item)) })]);
    expect(await w.export(practice, version.versionId)).toEqual({ outcome: 'not_exportable', reason: 'inputs_differ' });
    await w.superuser('UPDATE packet_version SET content = $2 WHERE id = $1', [version.versionId, JSON.stringify(content)]);
    expect(await w.export(practice, version.versionId)).toMatchObject({ outcome: 'exported' });
  });
});

// Last in the file: it loads release 900005 (from then on the release in force) and withdraws it at its end.
describe('a Medicare Advantage case’s next dispute level (the regulation’s reconsideration window, D17 a)', () => {
  it('is verified only from a reconsideration record at L2 or above that gives the stored end, and not before the specialist confirms the Medicare Advantage route (Q34), so no such packet is exported, in SQL and in TypeScript alike', async () => {
    const setup = await cas08('MA-next-level');
    const { practice } = setup;
    await w.superuser(`UPDATE "case" SET rate_record_id = NULL, pattern_key = pattern_key || '{"mapping_kind": "ma_noncontracted", "contract_version_id": null, "rate_record_id": null}' WHERE id = $1`, [setup.caseId]);
    const confirm = (versionId: string) => w.as(practice, w.specialist, (scope) => confirmRegulation(scope, { practiceId: practice.practiceId, versionId, requestId: 'r' }));
    const first = await write(setup, practice.manager);
    await confirm(first.versionId);
    await approve(setup, setup.second, first.versionId, first.contentSha256);
    const exportedFirst = await w.export(practice, first.versionId);
    expect(exportedFirst).toMatchObject({ outcome: 'exported' });
    await w.attest(practice, first.versionId);
    const logged = await submit(setup, first.versionId);
    // The denial is recorded under 900001: the reconsideration window's end comes from its L1 record.
    const reopened = await respond(setup, logged.submissionId, { kind: 'denied', denialCategory: 'bundling', reopensCase: true, documentId: await documentOf(practice) });
    expect(reopened.nextWindowEndsOn).toBe(addDays(w.today(), 171));
    const both = async (minimumLevel: 'L2' | 'L3' = 'L2') =>
      w.as(practice, practice.manager, async (scope) => ({
        sql: (await scope.client.query<{ status: string }>('SELECT case_next_window_deadline_status($1, $2) AS status', [setup.caseId, minimumLevel])).rows[0]?.status,
        ts: (await nextLevelDeadline(scope.client, setup.caseId, minimumLevel)).verification,
      }));
    const agree = (seen: Awaited<ReturnType<typeof both>>) => {
      expect(seen.ts.status).toBe(seen.sql);
      return seen;
    };
    expect(agree(await both())).toMatchObject({ sql: 'unverified', ts: { cause: 'RECORD_BELOW_LEVEL', level: 'L1', endsOn: reopened.nextWindowEndsOn } });
    const atL1 = await write(setup, practice.manager, { basedOn: first.versionId });
    expect(atL1.content.format === 'tp-packet/2' ? atL1.content.deadline : null).toMatchObject({ basis: 'next_level_window', status: 'unverified', causes: ['RECORD_BELOW_LEVEL'], ends_on: reopened.nextWindowEndsOn });
    await confirm(atL1.versionId);
    await approve(setup, setup.second, atL1.versionId, atL1.contentSha256);
    expect(await w.export(practice, atL1.versionId)).toEqual({ outcome: 'not_exportable', reason: 'deadline_unverified' });

    // Release 900005 holds the same reconsideration window at L2 and the record in force gives the stored end, but no Medicare Advantage
    // deadline is verified until the contract specialist confirms which dispute route applies (golden QUESTIONS Q34; best-option audit #5):
    // it waits for the route at L2, and is below the level at L3.
    await w.triage.pricing.loadDeadlineRelease();
    expect(agree(await both())).toMatchObject({ sql: 'unverified', ts: { cause: 'MA_ROUTE_UNCONFIRMED', level: 'L2', endsOn: reopened.nextWindowEndsOn } });
    expect(agree(await both('L3'))).toMatchObject({ sql: 'unverified', ts: { cause: 'RECORD_BELOW_LEVEL' } });
    // The version written under 900001 is still refused for its deadline.
    expect(await w.export(practice, atL1.versionId)).toEqual({ outcome: 'not_exportable', reason: 'deadline_unverified' });

    // An end another record gave (as one of 60 days would have, in a release in force when the denial was recorded and gone since): the
    // record in force now gives another end, so it is not the record the date came from, whatever its level (set as a migration would).
    const { rows } = await w.as(practice, practice.manager, (scope) => scope.client.query<{ id: string }>('SELECT id FROM payer_response WHERE submission_id = $1', [logged.submissionId]));
    await w.superuser('UPDATE payer_response SET next_window_ends_on = $2 WHERE id = $1', [rows[0]?.id, addDays(w.today(), 60)]);
    expect(agree(await both())).toMatchObject({ sql: 'unverified', ts: { cause: 'NEXT_LEVEL_DIFFERS', level: 'L2', endsOn: addDays(w.today(), 60) } });
    expect(agree(await both('L3'))).toMatchObject({ sql: 'unverified', ts: { cause: 'NEXT_LEVEL_DIFFERS' } });
    await w.superuser('UPDATE payer_response SET next_window_ends_on = $2 WHERE id = $1', [rows[0]?.id, reopened.nextWindowEndsOn]);

    // Written now, the level-2 version states its deadline unverified, waiting for the route; approved after the regulation's confirmation, it is
    // refused in the job, in the handler and in SQL, so no Medicare Advantage packet is exported until the route is confirmed.
    const atL2 = await write(setup, practice.manager, { basedOn: atL1.versionId });
    expect(atL2.content.format === 'tp-packet/2' ? atL2.content.deadline : null).toMatchObject({ basis: 'next_level_window', status: 'unverified', causes: ['MA_ROUTE_UNCONFIRMED'], ends_on: reopened.nextWindowEndsOn });
    await confirm(atL2.versionId);
    await approve(setup, setup.second, atL2.versionId, atL2.contentSha256);
    expect(await w.export(practice, atL2.versionId)).toEqual({ outcome: 'not_exportable', reason: 'deadline_unverified' });
    const queue = { send: () => Promise.resolve('queued') } as never;
    expect((await refusal(w.as(practice, practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: practice.practiceId, versionId: atL2.versionId, requestId: 'r' })))).message).toBe(
      'a packet version whose deadline is not verified is not exported',
    );
    const packetId = (await w.as(practice, practice.manager, (scope) => scope.client.query<{ packet_id: string }>('SELECT packet_id FROM packet_version WHERE id = $1', [atL2.versionId]))).rows[0]?.packet_id ?? '';
    expect((await refusal(jobExport(setup, atL2.versionId, packetId))).message).toBe('a packet version whose deadline is not verified is not exported');
    expect(await w.as(practice, practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: practice.practiceId, versionId: atL2.versionId, requestId: 'r' }))).toMatchObject({
      exportSha256: null,
      exportedAt: null,
    });

    // 900005 withdrawn: 900001 is in force again, and its L1 record verifies nothing.
    await w.triage.pricing.withdraw(DEADLINE_RELEASE);
    const { rows: inForce } = await w.as(practice, practice.manager, (scope) => scope.client.query<{ release: number }>('SELECT current_rule_release() AS release'));
    expect(inForce[0]?.release).toBe(RELEASE);
    expect(agree(await both())).toMatchObject({ sql: 'unverified', ts: { cause: 'RECORD_BELOW_LEVEL', level: 'L1' } });
  });
});
