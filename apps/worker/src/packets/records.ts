import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type Cents, parseCents } from '@tp/money';
import {
  type AssemblyInput,
  type AssemblyLine,
  type ContractCitation,
  type DeadlineInput,
  type DeadlineSource,
  type LineCalculation,
  type LineDeadline,
  type PacketCitation,
  type PacketContentV2,
  type PacketDeadline,
  type PromptPayRecord,
  type RegulationCitation,
  canonicalJson,
  lineCalculation,
  lineDeadline,
  packetDeadline,
} from '@tp/packets';
import { type PricingTrace, parseTrace } from '@tp/pricing';
import type { DeadlineVerification } from '@tp/triage';

import type { PricingCheckCause } from '../price/pricing-check';
import { lineDeadlines, nextLevelDeadline } from '../triage/deadline';

/**
 * Reading a case and its approved records for a packet (PRD 12, The packet: "assembled from the
 * approved records only"), in the caller's scope. Every line is a case line not written off whose
 * pricing is still current (audit item #4, the database's priced_line_pricing_check(): its priced line is
 * still its pricing in effect, its rule release is not withdrawn, and its contract version is still signed off
 * and covers its service date). A packet is written, approved, exported and attested only on the pricing in
 * effect, and nothing refreshes a case automatically yet (PR 11 will): a case with a stale line is refused with
 * the lines and the cause, and the remedy is to write those lines off on the case page or to wait. A contract
 * pattern cites its signed-off version's verified rate record (its
 * document, page, quoted clause and page hash); a Medicare Advantage non-contracted pattern cites the
 * regulation the rules reference names. The figures are the database's; @tp/packets assembles them.
 *
 * tp-packet/2 (CO-05, D17): each line's deadline is what @tp/triage's deadlineVerification() derives from
 * its stored trace and the evidence behind its window (the worker's lineDeadlines), and its calculation
 * summary is copied from that trace; after a reopened denial, the next level's window (nextLevelDeadline).
 * The evidence the deadlines rest on is listed: a contract version's cited window and the release records
 * the windows came from, with their level.
 */

export const PACKET_REFUSALS = [
  'case_not_found',
  'case_closed',
  'no_open_lines',
  'pricing_changed',
  'not_underpaid',
  'version_not_signed_off',
  'rate_record_not_verified',
  'citation_missing',
  'unknown_pattern',
  'document_not_found',
  'state_invalid',
  'narrative_too_long',
  'stale_version',
  'version_not_found',
  'export_not_downloaded',
] as const;
export type PacketRefusal = (typeof PACKET_REFUSALS)[number];

/** A packet cannot be written as asked: the code says why (no value, no identifier). */
export class PacketRefusedError extends Error {
  override readonly name = 'PacketRefusedError';

  constructor(
    readonly reason: PacketRefusal,
    message: string,
  ) {
    super(message);
  }
}

/** The regulation the rules reference cites for a Medicare Advantage non-contracted line. */
export const MA_NONCONTRACTED_CITATION: RegulationCitation = {
  kind: 'regulation',
  method: 'MA_NONCONTRACTED',
  reference: '42 CFR 422.214',
  statement:
    'A provider with no contract with the Medicare Advantage plan must accept, as payment in full, the amount it could have collected under Original Medicare; the plan owes that amount.',
};

export interface AssemblyRequest {
  readonly practiceId: string;
  readonly caseId: string;
  readonly asOf: string;
  /** The state whose prompt-pay statute the person says applies to the payer; null for none. */
  readonly promptPayState: string | null;
  /** Documents of the practice the person attaches to the evidence list. */
  readonly attachedDocumentIds: readonly string[];
  readonly requestId: string;
}

interface CaseRow {
  readonly id: string;
  readonly state: string;
  readonly pattern_key: { readonly mapping_kind?: string; readonly behavior?: string; readonly contract_version_id?: string | null } & Record<string, unknown>;
  readonly payer_id: string;
  readonly plan_id: string;
  readonly rate_record_id: string | null;
}

interface LineRow {
  readonly service_line_id: string;
  readonly practice_id: string;
  readonly priced_line_id: string;
  readonly pricing_run_id: string;
  readonly release_no: number;
  /** priced_line_pricing_check(): 'current', or why the line's pricing is no longer current. */
  readonly pricing_check: string;
  /** The line's place in the case's schedule as the case page numbers it ("Line 2 of 7"), and the case's line count. */
  readonly position: number;
  readonly total_lines: number;
  readonly expected_allowed_cents: string | null;
  readonly observed_allowed_cents: string;
  readonly variance_cents: string | null;
  readonly window_ends_on: string | null;
  readonly claim_id: string;
  readonly service_date: string;
  readonly procedure_code: string;
  readonly modifiers: readonly string[] | null;
  readonly units: string;
  readonly paid_cents: string;
  readonly patient_ref_id: string;
  readonly received_on: string | null;
  readonly paid_on: string;
  readonly document_id: string;
  readonly document_sha256: string | null;
  readonly trace: unknown;
}

/** Why a case line's pricing is no longer current, in words (priced_line_pricing_check()'s causes). */
const STALE_PRICING_WORDS: Readonly<Record<PricingCheckCause, string>> = {
  PRICING_NOT_IN_EFFECT: 'priced again since it joined the case',
  RELEASE_WITHDRAWN: 'its rule release was withdrawn since it was priced',
  CONTRACT_VERSION_NOT_SIGNED_OFF: 'its contract version is no longer signed off',
  CONTRACT_VERSION_NOT_IN_FORCE: 'its contract version no longer covers its service date',
};

/**
 * The refusal of a case with lines whose pricing is no longer current: which lines (as the case page numbers
 * them) and why, that a packet goes out only on the pricing in effect, and what to do, since nothing refreshes the
 * case yet. Positions and codes' words only: no value, no identifier.
 */
function stalePricingMessage(stale: readonly LineRow[]): string {
  const named = [...stale]
    .sort((a, b) => a.position - b.position)
    .map((row) => `line ${String(row.position)} of ${String(row.total_lines)} (${STALE_PRICING_WORDS[row.pricing_check in STALE_PRICING_WORDS ? (row.pricing_check as PricingCheckCause) : 'PRICING_NOT_IN_EFFECT']})`);
  const lines = named.length === 1 ? (named[0] as string) : `${named.slice(0, -1).join(', ')} and ${named.at(-1) as string}`;
  const them = stale.length === 1 ? 'it' : 'them';
  return `${lines} ${stale.length === 1 ? 'is' : 'are'} no longer priced current; a packet is written, approved, exported and attested only on the pricing in effect, and nothing refreshes the case automatically yet: write ${them} off on the case page to send the packet without ${them}, or wait`;
}

/** A line's deadline as the loader derived it; a line it could not see is unverified (fails closed). */
function deadlineOf(deadlines: ReadonlyMap<string, DeadlineVerification>, pricedLineId: string): DeadlineInput {
  const found = deadlines.get(pricedLineId);
  return found === undefined ? { status: 'unverified', source: null, endsOn: null, cause: null } : asInput(found);
}

const required = (value: string | null, reason: PacketRefusal, message: string): Cents => {
  if (value === null) {
    throw new PacketRefusedError(reason, message);
  }
  return parseCents(value);
};

/** The case, under its packet lock: one packet version of a case is written at a time. */
export async function lockedCase(client: ScopeClient, practiceId: string, caseId: string): Promise<CaseRow> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('packet:' || $1::text, 0))", [caseId]);
  const { rows } = await client.query<CaseRow>(`SELECT c.id, c.state, c.pattern_key, c.payer_id, c.plan_id, c.rate_record_id FROM "case" c WHERE c.id = $1 AND c.practice_id = $2`, [
    caseId,
    practiceId,
  ]);
  const found = rows[0];
  if (found === undefined) {
    throw new PacketRefusedError('case_not_found', 'no such case in this practice');
  }
  if (found.state === 'closed_written_off') {
    throw new PacketRefusedError('case_closed', 'the case is closed written off');
  }
  return found;
}

async function caseLines(scope: PracticeScope<ScopeClient>, request: AssemblyRequest): Promise<LineRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'service_line', purpose: 'packet_build', requestId: request.requestId },
    async (client) =>
      (
        await client.query<LineRow>(
          `WITH positions AS (
             SELECT x.id, row_number() OVER (ORDER BY coalesce(xl.service_date, xc.service_from), xl.line_no, x.id)::integer AS position, count(*) OVER ()::integer AS total_lines
               FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id JOIN claim xc ON xc.id = xl.claim_id
              WHERE x.case_id = $2 AND x.practice_id = $1
           )
           SELECT cl.service_line_id, cl.practice_id, cl.priced_line_id, p.pricing_run_id, run.release_no,
                  priced_line_pricing_check(cl.priced_line_id) AS pricing_check, pos.position, pos.total_lines,
                  p.expected_allowed_cents::text, p.observed_allowed_cents::text, p.variance_cents::text, p.window_ends_on::text,
                  sl.claim_id, coalesce(sl.service_date, c.service_from)::text AS service_date, sl.procedure_code, sl.modifiers, sl.units::text,
                  sl.paid_cents::text, c.patient_ref_id, c.received_on::text, r.bpr16_date::text AS paid_on, r.source_document_id AS document_id, d.sha256 AS document_sha256,
                  p.trace
             FROM case_line cl
             JOIN priced_line p ON p.id = cl.priced_line_id
             JOIN pricing_run run ON run.id = p.pricing_run_id
             JOIN service_line sl ON sl.id = cl.service_line_id
             JOIN claim c ON c.id = sl.claim_id
             JOIN remittance r ON r.id = c.remittance_id
             LEFT JOIN source_document d ON d.id = r.source_document_id
             JOIN positions pos ON pos.id = cl.id
            WHERE cl.case_id = $2 AND cl.practice_id = $1 AND cl.written_off_reason IS NULL
            ORDER BY cl.service_line_id`,
          [request.practiceId, request.caseId],
        )
      ).rows,
    (row) => ({ objectId: row.service_line_id, practiceId: row.practice_id }),
  );
}

async function contractCitation(client: ScopeClient, practiceId: string, rateRecordId: string): Promise<{ readonly citation: ContractCitation; readonly documents: { documentId: string; sha256: string | null }[] }> {
  const { rows } = await client.query<{
    readonly method: ContractCitation['method'] | 'UNSUPPORTED';
    readonly parameters: Record<string, unknown>;
    readonly evidence: { readonly document_id?: string; readonly page?: number; readonly quote?: string; readonly hash?: string };
    readonly verified_by: string | null;
    readonly version_id: string;
    readonly version_no: number;
    readonly effective_from: string;
    readonly effective_to: string | null;
    readonly status: string;
    readonly source_document_ids: readonly string[];
    readonly contract_id: string;
    readonly title: string;
  }>(
    `SELECT rr.method, rr.parameters, rr.evidence, rr.verified_by, v.id AS version_id, v.version_no, v.effective_from::text, v.effective_to::text, v.status,
            v.source_document_ids, k.id AS contract_id, k.title
       FROM rate_record rr JOIN contract_version v ON v.id = rr.contract_version_id JOIN contract k ON k.id = v.contract_id
      WHERE rr.id = $1 AND rr.practice_id = $2`,
    [rateRecordId, practiceId],
  );
  const record = rows[0];
  if (record === undefined) {
    throw new PacketRefusedError('citation_missing', 'the case names a rate record this practice does not hold');
  }
  if (record.status !== 'signed_off') {
    throw new PacketRefusedError('version_not_signed_off', 'the contract version is no longer signed off');
  }
  if (record.verified_by === null) {
    throw new PacketRefusedError('rate_record_not_verified', 'the rate record is not verified');
  }
  const { document_id: documentId, page, quote, hash } = record.evidence;
  if (documentId === undefined || page === undefined || quote === undefined || hash === undefined || record.method === 'UNSUPPORTED') {
    throw new PacketRefusedError('citation_missing', 'the rate record has no citation');
  }
  const documentIds = [documentId, ...record.source_document_ids];
  const { rows: documents } = await client.query<{ id: string; sha256: string | null }>('SELECT id, sha256 FROM source_document WHERE practice_id = $1 AND id = ANY ($2::uuid[])', [practiceId, documentIds]);
  const sha = (id: string) => documents.find((item) => item.id === id)?.sha256 ?? null;
  return {
    citation: {
      kind: 'contract',
      contract_id: record.contract_id,
      contract_title: record.title,
      contract_version_id: record.version_id,
      version_no: record.version_no,
      effective_from: record.effective_from,
      effective_to: record.effective_to,
      rate_record_id: rateRecordId,
      method: record.method,
      parameters: record.parameters,
      document_id: documentId,
      document_sha256: sha(documentId),
      page,
      quote,
      page_sha256: hash,
    },
    documents: record.source_document_ids.map((id) => ({ documentId: id, sha256: sha(id) })),
  };
}

const asInput = (verification: Pick<DeadlineVerification, 'status' | 'source' | 'endsOn' | 'cause'>): DeadlineInput => ({
  status: verification.status,
  source: verification.source,
  endsOn: verification.endsOn,
  cause: verification.cause,
});

/**
 * The evidence the lines' windows rest on: each contract version's cited window (its document, page,
 * quote and page hash, and who verified it), and each release record a window came from, with its level.
 * A version that cites no window adds none: its lines' deadlines say so.
 */
async function deadlineSources(client: ScopeClient, practiceId: string, traces: readonly PricingTrace[], deadlines: ReadonlyMap<string, DeadlineVerification>, pricedLineIds: readonly string[]): Promise<DeadlineSource[]> {
  const versionIds = [...new Set(traces.filter((trace) => trace.steps.window?.source === 'contract').flatMap((trace) => (trace.agreement?.contract_version_id === null || trace.agreement === null ? [] : [trace.agreement.contract_version_id])))];
  const { rows: versions } = await client.query<{
    id: string;
    dispute_window_days: number | null;
    dispute_window_evidence: { readonly document_id: string; readonly page: number; readonly quote: string; readonly hash: string } | null;
    dispute_window_verified_by: string | null;
    dispute_window_verified_at: Date | null;
  }>(
    `SELECT id, dispute_window_days, dispute_window_evidence, dispute_window_verified_by, dispute_window_verified_at
       FROM contract_version WHERE practice_id = $1 AND id = ANY ($2::uuid[]) AND dispute_window_evidence IS NOT NULL ORDER BY id`,
    [practiceId, versionIds],
  );
  const sources: DeadlineSource[] = versions.flatMap((version) =>
    version.dispute_window_evidence === null
      ? []
      : [
          {
            kind: 'contract_window' as const,
            contract_version_id: version.id,
            days: version.dispute_window_days,
            document_id: version.dispute_window_evidence.document_id,
            page: version.dispute_window_evidence.page,
            quote: version.dispute_window_evidence.quote,
            hash: version.dispute_window_evidence.hash,
            verified_by: version.dispute_window_verified_by,
            verified_at: version.dispute_window_verified_at?.toISOString() ?? null,
          },
        ],
  );
  const records = new Map<string, DeadlineSource>();
  traces.forEach((trace, index) => {
    const record = trace.steps.window?.record ?? null;
    if (trace.steps.window?.source !== 'release' || record === null) {
      return;
    }
    const level = deadlines.get(pricedLineIds[index] ?? '')?.level ?? null;
    records.set(`${String(trace.release.number)}:${record.sha256}`, { kind: 'release_record', release_no: trace.release.number, sha256: record.sha256, program: record.key.program ?? null, level });
  });
  return [...sources, ...records.values()];
}

async function promptPayRecord(client: ScopeClient, releaseNo: number, state: string, asOf: string): Promise<PromptPayRecord | null> {
  const { rows } = await client.query<{ value: Record<string, unknown>; effective_from: string; effective_to: string | null; sha256: string }>(
    `SELECT value, effective_from::text, effective_to::text, sha256 FROM rule_record
      WHERE release_no = $1 AND record_type = 'state_prompt_pay' AND key ->> 'state' = $2 AND effective_from <= $3::date
      ORDER BY effective_from DESC LIMIT 1`,
    [releaseNo, state, asOf],
  );
  const record = rows[0];
  if (record === undefined) {
    return null;
  }
  const value = record.value as {
    readonly days_to_pay: number;
    readonly day_basis: string;
    readonly interest: { readonly annual_rate_percent: string | null };
    readonly exclusions: readonly string[];
    readonly statute: string;
  };
  return {
    state,
    release_no: releaseNo,
    sha256: record.sha256,
    effective_from: record.effective_from,
    effective_to: record.effective_to,
    days_to_pay: value.days_to_pay,
    day_basis: value.day_basis,
    annual_rate_percent: value.interest.annual_rate_percent,
    exclusions: value.exclusions,
    statute: value.statute,
  };
}

/** Everything @tp/packets assembles a version from, read in the caller's scope. */
export async function loadAssembly(scope: PracticeScope<ScopeClient>, request: AssemblyRequest): Promise<AssemblyInput> {
  const { client } = scope;
  if (request.promptPayState !== null && !/^[A-Z]{2}$/.test(request.promptPayState)) {
    throw new PacketRefusedError('state_invalid', 'a state is its two-letter code');
  }
  const found = await lockedCase(client, request.practiceId, request.caseId);
  const rows = await caseLines(scope, request);
  if (rows.length === 0) {
    throw new PacketRefusedError('no_open_lines', 'the case has no line that is not written off');
  }
  const stale = rows.filter((row) => row.pricing_check !== 'current');
  if (stale.length > 0) {
    throw new PacketRefusedError('pricing_changed', stalePricingMessage(stale));
  }
  const traces = rows.map((row) => parseTrace(row.trace));
  const pricedLineIds = rows.map((row) => row.priced_line_id);
  const deadlines = await lineDeadlines(client, pricedLineIds);
  const lines = rows.map(
    (row, index): AssemblyLine => ({
      serviceLineId: row.service_line_id,
      claimId: row.claim_id,
      pricedLineId: row.priced_line_id,
      pricingRunId: row.pricing_run_id,
      patientKey: row.patient_ref_id,
      serviceDate: row.service_date,
      procedureCode: row.procedure_code,
      modifiers: (row.modifiers ?? []).filter((modifier) => modifier !== ''),
      units: row.units,
      expectedCents: required(row.expected_allowed_cents, 'not_underpaid', 'a line of the case has no expected amount'),
      observedCents: parseCents(row.observed_allowed_cents),
      varianceCents: required(row.variance_cents, 'not_underpaid', 'a line of the case has no variance'),
      paidCents: parseCents(row.paid_cents),
      paidOn: row.paid_on,
      receivedOn: row.received_on,
      windowEndsOn: row.window_ends_on,
      deadline: deadlineOf(deadlines, row.priced_line_id),
      calculation: lineCalculation(traces[index] as PricingTrace),
    }),
  );
  if (lines.some((line) => line.varianceCents <= 0n)) {
    throw new PacketRefusedError('not_underpaid', 'a line of the case is not paid below its expected amount');
  }

  let citation: PacketCitation;
  let contractDocuments: { documentId: string; sha256: string | null }[] = [];
  if (found.rate_record_id !== null) {
    const contract = await contractCitation(client, request.practiceId, found.rate_record_id);
    citation = contract.citation;
    contractDocuments = contract.documents;
  } else if (found.pattern_key.mapping_kind === 'ma_noncontracted') {
    citation = MA_NONCONTRACTED_CITATION;
  } else {
    throw new PacketRefusedError('unknown_pattern', 'the case pattern names neither a rate record nor a Medicare Advantage non-contracted plan');
  }

  const releaseNos = [...new Set(rows.map((row) => row.release_no))].sort((a, b) => a - b);
  const { rows: releases } = await client.query<{ release_no: number; manifest_sha256: string }>('SELECT release_no, manifest_sha256 FROM rule_release WHERE release_no = ANY ($1::integer[]) ORDER BY release_no', [releaseNos]);
  const newest = releaseNos.at(-1) ?? 0;

  const { rows: identity } = await client.query<{ name: string; npi: string | null; tax_id_last4: string | null; payer_name: string; payer_id_raw: string; plan_key: string; plan_name: string | null }>(
    `SELECT pr.name, pr.npi, pr.tax_id_last4, py.name_raw AS payer_name, py.payer_id_raw, pl.plan_key, pl.name AS plan_name
       FROM practice pr, payer py, plan pl WHERE pr.id = $1 AND py.id = $2 AND pl.id = $3`,
    [request.practiceId, found.payer_id, found.plan_id],
  );
  const who = identity[0];
  if (who === undefined) {
    throw new PacketRefusedError('case_not_found', 'the case’s payer and plan are not this practice’s');
  }

  const attached = [...new Set(request.attachedDocumentIds)];
  const { rows: attachedRows } = await client.query<{ id: string; sha256: string | null }>('SELECT id, sha256 FROM source_document WHERE practice_id = $1 AND id = ANY ($2::uuid[]) ORDER BY id', [request.practiceId, attached]);
  if (attachedRows.length !== attached.length) {
    throw new PacketRefusedError('document_not_found', 'an attached document is not a document of this practice');
  }

  const { rows: level } = await client.query<{ level: number }>('SELECT 1 + case_reopened_levels($1) AS level', [request.caseId]);
  const disputeLevel = level[0]?.level ?? 1;
  const next = disputeLevel > 1 ? await nextLevelDeadline(client, request.caseId) : null;

  const remittances = new Map<string, { documentId: string; sha256: string | null; paidOn: string }>();
  for (const row of rows) {
    remittances.set(row.document_id, { documentId: row.document_id, sha256: row.document_sha256, paidOn: row.paid_on });
  }

  return {
    asOf: request.asOf,
    disputeLevel,
    practice: { practice_id: request.practiceId, name: who.name, npi: who.npi, tax_id_last4: who.tax_id_last4 },
    payer: { payer_id: found.payer_id, name: who.payer_name, payer_id_raw: who.payer_id_raw, plan_id: found.plan_id, plan_key: who.plan_key, plan_name: who.plan_name },
    citation,
    releases,
    behavior: found.pattern_key.behavior ?? 'BELOW_CONTRACT_RATE',
    lines,
    interest: request.promptPayState === null ? null : { state: request.promptPayState, releaseNo: newest, record: await promptPayRecord(client, newest, request.promptPayState, request.asOf) },
    contractDocuments,
    remittances: [...remittances.values()],
    attachedDocuments: attachedRows.map((row) => ({ documentId: row.id, sha256: row.sha256 })),
    nextLevelDeadline: next === null ? null : asInput({ ...next.verification, endsOn: next.endsOn }),
    deadlineSources: await deadlineSources(client, request.practiceId, traces, deadlines, pricedLineIds),
  };
}

/** What a tp-packet/2 version states of its lines' deadlines and calculations and of its own deadline. */
export interface StatedDeadlines {
  readonly lines: readonly { readonly deadline: LineDeadline; readonly calculation: LineCalculation }[];
  readonly deadline: PacketDeadline;
}

/**
 * A tp-packet/2 version's deadlines and calculations stated again from its inputs as they stand now, as
 * loadAssembly states them when the version is written: each line's calculation copied again from its stored
 * trace (with the trace's SHA-256), each line's deadline and the version's derived again, and their sources
 * read again. Null when a line the version names cannot be read or priced nothing.
 */
export async function restatedDeadlines(client: ScopeClient, practiceId: string, caseId: string, content: PacketContentV2): Promise<StatedDeadlines | null> {
  const pricedLineIds = content.lines.map((line) => line.priced_line_id);
  const { rows } = await client.query<{ id: string; trace: unknown }>('SELECT id::text AS id, trace FROM priced_line WHERE practice_id = $1 AND id = ANY ($2::uuid[])', [practiceId, pricedLineIds]);
  const stored = new Map(rows.map((row) => [row.id, row.trace]));
  let traces: PricingTrace[];
  let calculations: LineCalculation[];
  try {
    traces = pricedLineIds.map((id) => {
      if (!stored.has(id)) {
        throw new Error('a line of the version cannot be read');
      }
      return parseTrace(stored.get(id));
    });
    calculations = traces.map((trace) => lineCalculation(trace));
  } catch {
    return null;
  }
  const deadlines = await lineDeadlines(client, pricedLineIds);
  const next = content.dispute_level > 1 ? await nextLevelDeadline(client, caseId) : null;
  const lines = pricedLineIds.map((id, index) => ({ deadline: lineDeadline(deadlineOf(deadlines, id)), calculation: calculations[index] as LineCalculation }));
  const deadline = packetDeadline(
    {
      disputeLevel: content.dispute_level,
      nextLevelDeadline: next === null ? null : asInput({ ...next.verification, endsOn: next.endsOn }),
      deadlineSources: await deadlineSources(client, practiceId, traces, deadlines, pricedLineIds),
    },
    lines,
  );
  return { lines, deadline };
}

/**
 * Whether a version states its deadlines and calculations exactly as its inputs give them now (CO-05: the export
 * prints no figure, date or count absent from its inputs). A tp-packet/1 version states none, so never.
 */
export async function statesItsInputs(client: ScopeClient, practiceId: string, caseId: string, content: PacketContentV2 | { readonly format: 'tp-packet/1' }): Promise<boolean> {
  if (content.format !== 'tp-packet/2') {
    return false;
  }
  const restated = await restatedDeadlines(client, practiceId, caseId, content);
  if (restated === null) {
    return false;
  }
  const stated: StatedDeadlines = { lines: content.lines.map((line) => ({ deadline: line.deadline, calculation: line.calculation })), deadline: content.deadline };
  return canonicalJson(stated) === canonicalJson(restated);
}
