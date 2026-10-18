import { createHash } from 'node:crypto';

import { type PracticeCipher, type PracticeScope, REVERSAL_STATUS_CODE, type RemittanceProvenance, type ScopeClient } from '@tp/db/runtime';
import { type KnownRemittance, type LoadableRemittance, remittanceDecision } from '@tp/edi835';
import { type Cents, cents, negateCents } from '@tp/money';

import { type LoadPlan, type PersonIdentity, type PlanRefusal, type PlannedClaim, type PlannedExportRemittance, type PlannedRemittance, loadPlan, normalizeKeyPart } from './plan';

/**
 * The 835 loader (PRD 10, steps 8 and 9; What the loader never does; PRD 6, Canonical model and
 * matching; docs/adr/0027). It loads one loadable transaction set inside the job's transaction, which
 * withJobScope opened for exactly one practice, so every row it reads or writes is the practice's own:
 *
 * 1. The plan (plan.ts): a value that cannot be stored exactly holds the set; nothing is written.
 * 2. Deduplication, serialized per practice and trace number with a transaction-scoped advisory lock
 *    and backed by the unique key on remittance (PAR-30): a remittance the practice already holds
 *    under (sender, ISA13, TRN02, BPR02) is the same remittance from a second download, so zero rows
 *    load and the receipt links it to the original (PAR-07); so is the same payment (payee, TRN02,
 *    TRN03, BPR02 and BPR16) resent under a regenerated envelope (docs/adr/0031). A different
 *    remittance reusing a trace the payer already used for this payee loads and is surfaced for review
 *    against the earlier one (V25).
 * 3. The payer and each claim's plan into payer and plan, the mapping queue (J6); the patient and the
 *    insured into patient_ref, upserted by pseudonym, names and identifiers encrypted.
 * 4. remittance, claim, service_line, adjustment and provider_adjustment, amounts in integer cents,
 *    observed allowed and its basis per line, unknown codes flagged and never dropped.
 * 5. Reversals linked to the claim they reverse and originals superseded by their corrections, by the
 *    payer claim control number's keyed hash and the patient control number: the parser's own link
 *    inside the transaction set first, else the practice's earlier claims; a reversal loaded before its
 *    original is linked when the original arrives.
 *
 * It never infers a claim from a line, never merges practices (one practice per transaction, and the
 * database refuses a reference to another practice's row), and never loads what the parser held.
 *
 * A payment of a vendor ERA export (era/normalize.ts; docs/adr/0060) is written by the same steps from its plan,
 * with provenance era_export, under the same advisory locks, so an 835 and an export of one trace serialize. The
 * 835 is authoritative (reconciliation-001 D13 a). An export of a payment the practice holds loads nothing and is
 * linked to it: another export's with the export key (payee, trace, credit or debit, BPR02 and BPR16), or an 835's
 * (exportIsPaymentOf: every claim of the export is the 835's and the date or the amount agrees, or the payee, date
 * and amount agree, the amount BPR02 or BPR02 plus the PLB total, since an export carries no PLB). A later 835 of a payment first loaded from
 * an export is held for review (payment_loaded_from_export) by the same rule, never loaded beside it and never
 * replacing it, since priced lines are immutable (CLAUDE.md rule 3). Across sources and between exports the trace
 * is compared in its form (traceForm: upper case, leading zeros removed), as a spreadsheet re-save writes it; two
 * 835s keep the exact rules of docs/adr/0031. An export whose amount matches a payment that names another payer
 * and shares no claim with it is held (export_payment_other_payer), never called a repeat of it.
 * remittance_export_once and the remittance trigger back the exact keys.
 *
 * The locks are per practice and bucket of trace forms (TRACE_LOCK_BUCKETS of them, lockTraces): a document's
 * load takes the buckets of all its traces first, in ascending order (an 835's in DocumentParse.load, an export's
 * in era/load.ts), so loads sharing traces never wait on each other in a cycle and no transaction holds more than
 * TRACE_LOCK_BUCKETS advisory locks, however many payments it loads.
 */

export interface LoadContext {
  readonly scope: PracticeScope<ScopeClient>;
  readonly cipher: PracticeCipher;
  readonly practiceId: string;
  /** The document the transaction set came from. */
  readonly documentId: string;
}

export interface TransactionReview {
  /** The earlier remittance with the same trace. */
  readonly remittanceId: string;
  readonly reason: 'trace_reused_another_date' | 'trace_reused_same_date';
}

type Loaded = {
  readonly kind: 'loaded';
  readonly remittanceId: string;
  readonly claims: number;
  readonly lines: number;
  readonly review: TransactionReview | null;
};

export type TransactionLoad =
  | Loaded
  | { readonly kind: 'duplicate'; readonly remittanceId: string; readonly documentId: string }
  | { readonly kind: 'refused'; readonly at: PlanRefusal }
  /**
   * The payment was loaded first from an ERA export (D13 a): nothing of this 835 loads, and the receipt links the
   * export's remittance and document for a person to review.
   */
  | { readonly kind: 'held_for_review'; readonly remittanceId: string; readonly documentId: string; readonly reason: 'payment_loaded_from_export' };

/** What loading one payment of an ERA export did. */
export type ExportPaymentLoad =
  | Loaded
  /** The practice holds the payment already, from an 835 or another export: zero rows, linked to it. */
  | { readonly kind: 'duplicate'; readonly remittanceId: string; readonly documentId: string; readonly provenance: RemittanceProvenance }
  /**
   * A payment the practice holds has the same payee, trace, amount and date but names another payer and shares no
   * claim with it: nothing loads, and the receipt holds the payment for a person rather than call it a repeat.
   */
  | { readonly kind: 'held'; readonly reason: 'export_payment_other_payer'; readonly remittanceId: string; readonly documentId: string; readonly provenance: RemittanceProvenance };

interface KnownRow {
  readonly id: string;
  readonly source_document_id: string;
  readonly provenance: RemittanceProvenance;
  readonly st02: string | null;
  readonly sender_id: string | null;
  readonly payee_npi: string;
  readonly isa13: string | null;
  readonly trn02: string;
  readonly trn03: string | null;
  readonly bpr02_cents: string;
  readonly bpr_credit_debit: 'C' | 'D';
  readonly bpr16_date: string;
  readonly payer_name: string;
  readonly plb_total_cents: string;
}

/** An 835's row, whose envelope the database requires (remittance_x12_envelope). */
type X12Row = KnownRow & { readonly provenance: 'x12_835'; readonly sender_id: string; readonly isa13: string; readonly trn03: string };

/**
 * A trace (TRN02, or an export's check or EFT number) in the form the duplicate rules compare it in across sources and
 * between exports: its ASCII letters in upper case and its leading zeros removed, as a spreadsheet re-save may write
 * it. TRACE_FORM_SQL is the same in SQL, which remittance_by_trace_form indexes.
 */
export function traceForm(trn02: string): string {
  return trn02.replace(/[a-z]+/g, (letters) => letters.toUpperCase()).replace(/^0+/, '');
}

const TRACE_FORM_SQL = `ltrim(upper(trn02 COLLATE "C"), '0')`;

const KNOWN = `SELECT id, source_document_id, provenance, st02, sender_id, payee_npi, isa13, trn02, trn03, bpr02_cents::text AS bpr02_cents, bpr_credit_debit,
         bpr16_date::text AS bpr16_date, payer_name, plb_total_cents::text AS plb_total_cents
  FROM remittance WHERE practice_id = $1 AND ${TRACE_FORM_SQL} = $2 ORDER BY created_at, id`;

/** The most advisory locks a document's load takes for its traces: one per bucket of trace forms. */
export const TRACE_LOCK_BUCKETS = 64;

/** A trace's lock bucket: its form's SHA-256, modulo TRACE_LOCK_BUCKETS, so every form of one trace shares a bucket. */
export function traceBucket(trn02: string): number {
  return createHash('sha256').update(traceForm(trn02), 'utf8').digest().readUInt32BE(0) % TRACE_LOCK_BUCKETS;
}

function known(row: X12Row): KnownRemittance {
  return {
    id: row.id,
    key: { senderId: row.sender_id, payeeId: row.payee_npi, isa13: row.isa13, trn02: row.trn02, bpr02Cents: cents(BigInt(row.bpr02_cents)) },
    originatorId: row.trn03,
    paymentDate: row.bpr16_date,
  };
}

const isX12 = (row: KnownRow): row is X12Row => row.provenance === 'x12_835';

/** One payment as the cross-source rules compare it (its trace's form is the other's: KNOWN found it so). */
export interface PaymentFacts {
  readonly payeeId: string;
  /** BPR16, or an export's payment date. */
  readonly date: string;
  /** The payment signed: BPR02, negated for a debit. */
  readonly signedCents: bigint;
  /** An 835's PLB total; zero for an export, which carries none. */
  readonly plbCents: bigint;
  readonly payerName: string;
  /** Its claims' payer claim control numbers, by their keyed hash (claim.payer_claim_control_number_hash). */
  readonly claimHashes: ReadonlySet<string>;
}

/**
 * Whether an export's payment and an 835's, their traces of one form, are one payment (D13 a), and by what: 'claims'
 * when every claim of the export is a claim of the 835 and either the date or the amount agrees (the payee may be
 * named in another form, the export dated by its deposit; a payer's trace reused on another day for another amount
 * stays two payments, whatever claims it reverses); 'amount' when the payee and the date are the same and the
 * amount agrees; null when neither. The amount agrees when the export's is the 835's BPR02 (the export key, which the
 * remittance trigger also refuses) or BPR02 plus its PLB total (an export carries no PLB, so its amount is the
 * claims paid, as an 835 balances).
 */
export function exportIsPaymentOf(exported: PaymentFacts, x12: PaymentFacts): 'claims' | 'amount' | null {
  const amount = exported.signedCents === x12.signedCents || exported.signedCents === x12.signedCents + x12.plbCents;
  const date = exported.date === x12.date;
  if ((amount || date) && exported.claimHashes.size > 0 && [...exported.claimHashes].every((hash) => x12.claimHashes.has(hash))) {
    return 'claims';
  }
  return exported.payeeId === x12.payeeId && date && amount ? 'amount' : null;
}

/** The export duplicate key (D12 a) between two exports, their traces of one form: payee, the signed payment and its date. */
export function sameExportKey(a: PaymentFacts, b: PaymentFacts): boolean {
  return a.payeeId === b.payeeId && a.date === b.date && a.signedCents === b.signedCents;
}

/** Whether two payments name one payer, or share a claim (so the payer is one, whatever its name's form). */
export function onePayer(a: PaymentFacts, b: PaymentFacts): boolean {
  return normalizeKeyPart(a.payerName) === normalizeKeyPart(b.payerName) || [...a.claimHashes].some((hash) => b.claimHashes.has(hash));
}

const signedOf = (creditDebit: 'C' | 'D', bpr02: bigint): bigint => (creditDebit === 'D' ? -bpr02 : bpr02);

function factsOfRow(row: KnownRow, claimHashes: ReadonlySet<string> | undefined): PaymentFacts {
  return {
    payeeId: row.payee_npi,
    date: row.bpr16_date,
    signedCents: signedOf(row.bpr_credit_debit, BigInt(row.bpr02_cents)),
    plbCents: BigInt(row.plb_total_cents),
    payerName: row.payer_name,
    claimHashes: claimHashes ?? new Set(),
  };
}

/** A remittance of the same payee and trace (in its form), another payment: loaded and surfaced for review against it (V25). */
function traceReview(rows: readonly KnownRow[], remittance: PlannedRemittance): TransactionReview | null {
  const earlier = rows.find((row) => row.payee_npi === remittance.payeeId && traceForm(row.trn02) === traceForm(remittance.trn02));
  return earlier === undefined ? null : { remittanceId: earlier.id, reason: earlier.bpr16_date === remittance.bpr16Date ? 'trace_reused_same_date' : 'trace_reused_another_date' };
}

const text = (value: Cents | null): string | null => (value === null ? null : value.toString());

/**
 * The per-practice locks a load takes before it reads the remittances of its traces, held to the end of the
 * document's transaction: one per bucket of the traces' forms, in ascending bucket order, an 835's and an export's
 * alike, so the duplicate rules see each other's rows. A document takes all its traces' buckets first (a lock its
 * transaction already holds is taken again at once), so two loads never wait on each other in a cycle and a
 * transaction holds at most TRACE_LOCK_BUCKETS of them.
 */
export async function lockTraces(client: ScopeClient, practiceId: string, traces: Iterable<string>): Promise<void> {
  for (const bucket of [...new Set([...traces].map(traceBucket))].sort((a, b) => a - b)) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':remittance-traces:' || $2, 0))", [practiceId, String(bucket)]);
  }
}

class Loader {
  private readonly client: ScopeClient;

  constructor(
    private readonly context: LoadContext,
    private readonly plan: LoadPlan,
  ) {
    this.client = context.scope.client;
  }

  /**
   * One loader at a time per practice and trace bucket, an 835's or an export's alike: the duplicate and trace
   * checks see every remittance committed before them (PAR-30), and the unique keys and the trigger back them.
   * Returns the practice's remittances whose trace has this one's form, oldest first.
   */
  async known(): Promise<KnownRow[]> {
    const { practiceId } = this.context;
    const { trn02 } = this.plan.remittance;
    await lockTraces(this.client, practiceId, [trn02]);
    return (await this.query<KnownRow & Record<string, unknown>>(KNOWN, [practiceId, traceForm(trn02)])).rows;
  }

  /** The claims' payer claim control number hashes of each remittance given, by remittance. */
  async claimHashesOf(remittanceIds: readonly string[]): Promise<Map<string, Set<string>>> {
    const found = new Map<string, Set<string>>(remittanceIds.map((id) => [id, new Set<string>()]));
    if (remittanceIds.length === 0) {
      return found;
    }
    const { rows } = await this.query<{ remittance_id: string; hash: string }>(
      'SELECT remittance_id, payer_claim_control_number_hash AS hash FROM claim WHERE practice_id = $1 AND remittance_id = ANY ($2::uuid[])',
      [this.context.practiceId, remittanceIds],
    );
    for (const row of rows) {
      found.get(row.remittance_id)?.add(row.hash);
    }
    return found;
  }

  /** This plan's payment as the cross-source rules compare it. */
  facts(): PaymentFacts {
    const r = this.plan.remittance;
    return {
      payeeId: r.payeeId,
      date: r.bpr16Date,
      signedCents: signedOf(r.creditDebit, r.bpr02Cents),
      plbCents: r.plbTotalCents,
      payerName: r.payerName,
      claimHashes: new Set(this.plan.claims.map((claim) => this.context.cipher.lookupHash('claim.payer_claim_control_number', claim.payerClaimControlNumber))),
    };
  }

  private query<R extends Record<string, unknown>>(sql: string, values: unknown[]): Promise<{ rows: R[] }> {
    return this.client.query<R>(sql, values);
  }

  /** The payer row for the remittance's payer identifier, created on first sight (the mapping queue). */
  private async payer(): Promise<string> {
    const { payerIdRaw, nameRaw } = this.plan.payer;
    const values = [this.context.practiceId, payerIdRaw];
    await this.query('INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, $2, $3) ON CONFLICT (practice_id, payer_id_raw) DO NOTHING', [...values, nameRaw]);
    const { rows } = await this.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 AND payer_id_raw = $2', values);
    return (rows[0] as { id: string }).id;
  }

  /** Each claim's plan under the payer, created on first sight; plan key to plan ID. */
  private async plans(payerId: string): Promise<Map<string, string>> {
    // Sorted, so concurrent loads of one practice take the unique index's locks in the same order.
    const keys = [...new Set(this.plan.claims.map((claim) => claim.planKey))].sort();
    const values = [this.context.practiceId, payerId, keys];
    await this.query('INSERT INTO plan (practice_id, payer_id, plan_key) SELECT $1, $2, key FROM unnest($3::text[]) AS key ORDER BY key ON CONFLICT (practice_id, payer_id, plan_key) DO NOTHING', values);
    const { rows } = await this.query<{ id: string; plan_key: string }>('SELECT id, plan_key FROM plan WHERE practice_id = $1 AND payer_id = $2 AND plan_key = ANY ($3::text[])', values);
    return new Map(rows.map((row) => [row.plan_key, row.id]));
  }

  /** Every person the claims name, upserted by pseudonym; pseudonym to patient_ref ID. */
  private async people(): Promise<Map<string, string>> {
    const { cipher } = this.context;
    const merged = new Map<string, PersonIdentity>();
    for (const person of this.plan.claims.flatMap((claim) => (claim.insured === null ? [claim.patient] : [claim.patient, claim.insured]))) {
      const seen = merged.get(person.key);
      merged.set(
        person.key,
        seen === undefined ? person : { ...seen, memberId: seen.memberId ?? person.memberId, groupNumber: seen.groupNumber ?? person.groupNumber },
      );
    }
    const encrypt = (column: 'patient_ref.last_name' | 'patient_ref.first_name' | 'patient_ref.member_id' | 'patient_ref.group_number', value: string | null) =>
      value === null ? null : cipher.encrypt(column, value);
    const rows = [...merged.values()]
      .map((person) => ({
        pseudonym: cipher.lookupHash('patient_ref.pseudonym', person.key),
        last_name: encrypt('patient_ref.last_name', person.lastName),
        first_name: encrypt('patient_ref.first_name', person.firstName),
        member_id: encrypt('patient_ref.member_id', person.memberId),
        group_number: encrypt('patient_ref.group_number', person.groupNumber),
      }))
      // In pseudonym order, so concurrent loads of one practice lock patient references in the same order.
      .sort((a, b) => (a.pseudonym < b.pseudonym ? -1 : a.pseudonym > b.pseudonym ? 1 : 0));
    // Upserted: a person seen before keeps their record; an identifier it lacked is filled in.
    await this.query(
      `INSERT INTO patient_ref (practice_id, pseudonym, last_name, first_name, member_id, group_number)
       SELECT $1, p.pseudonym, p.last_name, p.first_name, p.member_id, p.group_number
         FROM jsonb_to_recordset($2::jsonb) AS p (pseudonym text, last_name text, first_name text, member_id text, group_number text)
        ORDER BY p.pseudonym
       ON CONFLICT (practice_id, pseudonym) DO UPDATE
          SET member_id = coalesce(patient_ref.member_id, EXCLUDED.member_id), group_number = coalesce(patient_ref.group_number, EXCLUDED.group_number)
        WHERE (patient_ref.member_id IS NULL AND EXCLUDED.member_id IS NOT NULL) OR (patient_ref.group_number IS NULL AND EXCLUDED.group_number IS NOT NULL)`,
      [this.context.practiceId, JSON.stringify(rows)],
    );
    const found = await this.query<{ id: string; pseudonym: string }>('SELECT id, pseudonym FROM patient_ref WHERE practice_id = $1 AND pseudonym = ANY ($2::text[])', [
      this.context.practiceId,
      rows.map((row) => row.pseudonym),
    ]);
    return new Map(found.rows.map((row) => [row.pseudonym, row.id]));
  }

  private async insertRemittance(payerId: string, review: TransactionReview | null): Promise<string> {
    const r = this.plan.remittance;
    // An export invents no envelope: its receiver, ISA13, GS06, ST02, TRN03 and payee qualifier stay null.
    const x12 = r.provenance === 'x12_835' ? r : null;
    const { rows } = await this.query<{ id: string }>(
      `INSERT INTO remittance (practice_id, source_document_id, provenance, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit,
         bpr_method, bpr16_date, payer_name, payer_id, payee_npi, payee_id_qualifier, production_date, balance_diff_cents, claim_count, plb_total_cents, status,
         review_reason, review_of_remittance_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'loaded', $23, $24) RETURNING id`,
      [
        this.context.practiceId,
        this.context.documentId,
        r.provenance,
        r.senderId,
        x12?.receiverId ?? null,
        x12?.isa13 ?? null,
        x12?.gs06 ?? null,
        x12?.st02 ?? null,
        r.trn02,
        x12?.trn03 ?? null,
        r.bpr02Cents.toString(),
        r.creditDebit,
        r.method,
        r.bpr16Date,
        r.payerName,
        payerId,
        r.payeeId,
        x12?.payeeIdQualifier ?? null,
        r.productionDate,
        r.balanceDiffCents.toString(),
        r.claimCount,
        r.plbTotalCents.toString(),
        review?.reason ?? null,
        review?.remittanceId ?? null,
      ],
    );
    return (rows[0] as { id: string }).id;
  }

  private async insertClaims(remittanceId: string, people: Map<string, string>): Promise<Map<number, string>> {
    const { cipher } = this.context;
    const pseudonym = (person: PersonIdentity) => people.get(cipher.lookupHash('patient_ref.pseudonym', person.key)) as string;
    const rows = this.plan.claims.map((claim) => ({
      claim_no: claim.claimNo,
      patient_control_number: cipher.encrypt('claim.patient_control_number', claim.patientControlNumber),
      payer_claim_control_number: cipher.encrypt('claim.payer_claim_control_number', claim.payerClaimControlNumber),
      payer_claim_control_number_hash: cipher.lookupHash('claim.payer_claim_control_number', claim.payerClaimControlNumber),
      claim_status_code: claim.statusCode,
      charge_cents: claim.chargeCents.toString(),
      paid_cents: claim.paidCents.toString(),
      patient_resp_cents: text(claim.patientRespCents),
      filing_indicator: claim.filingIndicator,
      facility_type: claim.facilityType,
      frequency_code: claim.frequencyCode,
      patient_ref_id: pseudonym(claim.patient),
      insured_ref_id: claim.insured === null ? null : pseudonym(claim.insured),
      service_from: claim.serviceFrom,
      service_to: claim.serviceTo,
      allowed_cents: text(claim.allowedCents),
      received_on: claim.receivedOn,
      interest_cents: text(claim.interestCents),
    }));
    const { rows: inserted } = await this.query<{ id: string; claim_no: number }>(
      `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
         charge_cents, paid_cents, patient_resp_cents, filing_indicator, facility_type, frequency_code, patient_ref_id, insured_ref_id, service_from, service_to, allowed_cents,
         received_on, interest_cents)
       SELECT $1, $2, c.claim_no, c.patient_control_number, c.payer_claim_control_number, c.payer_claim_control_number_hash, c.claim_status_code, c.charge_cents,
              c.paid_cents, c.patient_resp_cents, c.filing_indicator, c.facility_type, c.frequency_code, c.patient_ref_id, c.insured_ref_id, c.service_from, c.service_to,
              c.allowed_cents, c.received_on, c.interest_cents
         FROM jsonb_to_recordset($3::jsonb) AS c (claim_no integer, patient_control_number text, payer_claim_control_number text, payer_claim_control_number_hash text,
              claim_status_code text, charge_cents bigint, paid_cents bigint, patient_resp_cents bigint, filing_indicator text, facility_type text, frequency_code text,
              patient_ref_id uuid, insured_ref_id uuid, service_from date, service_to date, allowed_cents bigint, received_on date, interest_cents bigint)
       RETURNING id, claim_no`,
      [this.context.practiceId, remittanceId, JSON.stringify(rows)],
    );
    return new Map(inserted.map((row) => [row.claim_no, row.id]));
  }

  private async insertLines(claimIds: Map<number, string>, plans: Map<string, string>): Promise<Map<string, string>> {
    const rows = this.plan.claims.flatMap((claim) =>
      claim.lines.map((line) => ({
        claim_id: claimIds.get(claim.claimNo) as string,
        line_no: line.lineNo,
        procedure_qualifier: line.procedureQualifier,
        procedure_code: line.procedureCode,
        modifiers: line.modifiers,
        revenue_code: line.revenueCode,
        charge_cents: line.chargeCents.toString(),
        paid_cents: line.paidCents.toString(),
        units: line.units,
        original_units: line.originalUnits,
        service_date: line.serviceDate,
        service_date_to: line.serviceDateTo,
        place_of_service: line.placeOfService,
        line_allowed_cents: text(line.lineAllowedCents),
        observed_allowed_cents: line.observedAllowedCents.toString(),
        observed_allowed_basis: line.observedAllowedBasis,
        observed_allowed_allocated: line.observedAllowedAllocated,
        patient_share_cents: line.patientShareCents.toString(),
        rendering_npi: line.renderingNpi,
        payer_plan_key: plans.get(claim.planKey) as string,
      })),
    );
    if (rows.length === 0) {
      return new Map();
    }
    const { rows: inserted } = await this.query<{ id: string; claim_id: string; line_no: number }>(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, revenue_code, charge_cents, paid_cents, units,
         original_units, service_date, service_date_to, place_of_service, line_allowed_cents, observed_allowed_cents, observed_allowed_basis, observed_allowed_allocated,
         patient_share_cents, rendering_npi, payer_plan_key)
       SELECT $1, l.claim_id, l.line_no, l.procedure_qualifier, l.procedure_code, l.modifiers, l.revenue_code, l.charge_cents, l.paid_cents, l.units, l.original_units,
              l.service_date, l.service_date_to, l.place_of_service, l.line_allowed_cents, l.observed_allowed_cents, l.observed_allowed_basis, l.observed_allowed_allocated,
              l.patient_share_cents, l.rendering_npi, l.payer_plan_key
         FROM jsonb_to_recordset($2::jsonb) AS l (claim_id uuid, line_no integer, procedure_qualifier text, procedure_code text, modifiers text[], revenue_code text,
              charge_cents bigint, paid_cents bigint, units numeric, original_units numeric, service_date date, service_date_to date, place_of_service text,
              line_allowed_cents bigint, observed_allowed_cents bigint, observed_allowed_basis text, observed_allowed_allocated boolean, patient_share_cents bigint,
              rendering_npi text, payer_plan_key uuid)
       RETURNING id, claim_id, line_no`,
      [this.context.practiceId, JSON.stringify(rows)],
    );
    return new Map(inserted.map((row) => [`${row.claim_id}:${String(row.line_no)}`, row.id]));
  }

  private async insertAdjustments(claimIds: Map<number, string>, lineIds: Map<string, string>): Promise<void> {
    const rows = this.plan.claims.flatMap((claim) => {
      const claimId = claimIds.get(claim.claimNo) as string;
      const row = (lineId: string | null) => (item: PlannedClaim['adjustments'][number]) => ({
        claim_id: claimId,
        service_line_id: lineId,
        group_code: item.groupCode,
        reason_code: item.reasonCode,
        unknown_code: item.unknownCode,
        amount_cents: item.amountCents.toString(),
        quantity: item.quantity,
        position: item.position,
      });
      return [...claim.adjustments.map(row(null)), ...claim.lines.flatMap((line) => line.adjustments.map(row(lineIds.get(`${claimId}:${String(line.lineNo)}`) as string)))];
    });
    if (rows.length === 0) {
      return;
    }
    await this.query(
      `INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, unknown_code, amount_cents, quantity, position)
       SELECT $1, a.claim_id, a.service_line_id, a.group_code, a.reason_code, a.unknown_code, a.amount_cents, a.quantity, a.position
         FROM jsonb_to_recordset($2::jsonb) AS a (claim_id uuid, service_line_id uuid, group_code text, reason_code text, unknown_code boolean, amount_cents bigint,
              quantity numeric, position integer)`,
      [this.context.practiceId, JSON.stringify(rows)],
    );
  }

  private async insertProviderAdjustments(remittanceId: string): Promise<void> {
    const rows = this.plan.providerAdjustments.map((item) => ({
      position: item.position,
      provider_id: item.providerId,
      reason_code: item.reasonCode,
      reference: item.reference,
      amount_cents: item.amountCents.toString(),
      fiscal_period_date: item.fiscalPeriodDate,
      category: item.category,
    }));
    if (rows.length === 0) {
      return;
    }
    await this.query(
      `INSERT INTO provider_adjustment (practice_id, remittance_id, position, provider_id, reason_code, reference, amount_cents, fiscal_period_date, category)
       SELECT $1, $2, p.position, p.provider_id, p.reason_code, p.reference, p.amount_cents, p.fiscal_period_date, p.category
         FROM jsonb_to_recordset($3::jsonb) AS p (position integer, provider_id text, reason_code text, reference text, amount_cents bigint, fiscal_period_date date,
              category text)`,
      [this.context.practiceId, remittanceId, JSON.stringify(rows)],
    );
  }

  /**
   * The practice's earlier claim with this payer claim control number and patient control number that
   * matches `filter`, latest payment first; never one of this remittance's own claims.
   */
  private async earlier(remittanceId: string, payerClaimControlNumber: string, patientControlNumber: string, filter: string, values: unknown[]): Promise<string | null> {
    const { cipher, practiceId } = this.context;
    const { rows } = await this.query<{ id: string; patient_control_number: string }>(
      `SELECT c.id, c.patient_control_number FROM claim c JOIN remittance r ON r.id = c.remittance_id
        WHERE c.practice_id = $1 AND c.payer_claim_control_number_hash = $2 AND c.remittance_id <> $3 AND c.claim_status_code <> '${REVERSAL_STATUS_CODE}' AND ${filter}
        ORDER BY r.bpr16_date DESC, c.created_at DESC, c.id`,
      [practiceId, cipher.lookupHash('claim.payer_claim_control_number', payerClaimControlNumber), remittanceId, ...values],
    );
    return rows.find((row) => cipher.decrypt('claim.patient_control_number', row.patient_control_number) === patientControlNumber)?.id ?? null;
  }

  /** Reversals to the claims they reverse, originals to their corrections, and earlier orphan reversals to new originals. */
  private async link(remittanceId: string, claimIds: Map<number, string>): Promise<void> {
    const reversed = new Map<number, string>();
    for (const claim of this.plan.claims) {
      if (claim.reversal === null) {
        continue;
      }
      const original =
        claim.reversal.reversedClaimNo === null
          ? await this.earlier(remittanceId, claim.payerClaimControlNumber, claim.patientControlNumber, 'c.charge_cents = $4 AND NOT EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)', [
              negateCents(claim.chargeCents).toString(),
            ])
          : (claimIds.get(claim.reversal.reversedClaimNo) ?? null);
      if (original !== null) {
        await this.query('UPDATE claim SET reversal_of_claim_id = $2 WHERE id = $1 AND reversal_of_claim_id IS NULL', [claimIds.get(claim.claimNo), original]);
        reversed.set(claim.claimNo, original);
      }
    }
    for (const claim of this.plan.claims) {
      if (claim.correction === null) {
        continue;
      }
      const { payerClaimControlNumber, reversalClaimNo } = claim.correction;
      const original =
        (reversalClaimNo === null ? undefined : reversed.get(reversalClaimNo)) ??
        (await this.earlier(remittanceId, payerClaimControlNumber, claim.patientControlNumber, 'c.superseded_by_claim_id IS NULL', []));
      if (original !== null) {
        await this.query('UPDATE claim SET superseded_by_claim_id = $2 WHERE id = $1 AND superseded_by_claim_id IS NULL', [original, claimIds.get(claim.claimNo)]);
      }
    }
    await this.adoptOrphanReversals(remittanceId, claimIds, new Set(reversed.values()));
  }

  /** Reversals loaded before the claim they reverse: linked now that it has arrived (out-of-order uploads). */
  private async adoptOrphanReversals(remittanceId: string, claimIds: Map<number, string>, reversedHere: ReadonlySet<string>): Promise<void> {
    const { cipher, practiceId } = this.context;
    // This set's claims that no reversal reverses yet.
    const originals = this.plan.claims.filter((claim) => claim.statusCode !== REVERSAL_STATUS_CODE && !reversedHere.has(claimIds.get(claim.claimNo) as string));
    if (originals.length === 0) {
      return;
    }
    const { rows } = await this.query<{ id: string; hash: string; patient_control_number: string; charge_cents: string }>(
      `SELECT c.id, c.payer_claim_control_number_hash AS hash, c.patient_control_number, c.charge_cents::text AS charge_cents
         FROM claim c JOIN remittance r ON r.id = c.remittance_id
        WHERE c.practice_id = $1 AND c.claim_status_code = '${REVERSAL_STATUS_CODE}' AND c.reversal_of_claim_id IS NULL AND c.remittance_id <> $2
          AND c.payer_claim_control_number_hash = ANY ($3::text[]) AND r.bpr16_date >= $4::date
        ORDER BY r.bpr16_date, c.created_at, c.id`,
      [practiceId, remittanceId, originals.map((claim) => cipher.lookupHash('claim.payer_claim_control_number', claim.payerClaimControlNumber)), this.plan.remittance.bpr16Date],
    );
    const taken = new Set<string>();
    for (const orphan of rows) {
      const pcn = cipher.decrypt('claim.patient_control_number', orphan.patient_control_number);
      const original = originals.find(
        (claim) =>
          !taken.has(claim.payerClaimControlNumber) &&
          cipher.lookupHash('claim.payer_claim_control_number', claim.payerClaimControlNumber) === orphan.hash &&
          claim.patientControlNumber === pcn &&
          negateCents(claim.chargeCents).toString() === orphan.charge_cents,
      );
      if (original !== undefined) {
        taken.add(original.payerClaimControlNumber);
        await this.query('UPDATE claim SET reversal_of_claim_id = $2 WHERE id = $1 AND reversal_of_claim_id IS NULL', [orphan.id, claimIds.get(original.claimNo)]);
      }
    }
  }

  async write(review: TransactionReview | null): Promise<Loaded> {
    const payerId = await this.payer();
    const plans = await this.plans(payerId);
    const people = await this.people();
    const remittanceId = await this.insertRemittance(payerId, review);
    const claimIds = await this.insertClaims(remittanceId, people);
    const lineIds = await this.insertLines(claimIds, plans);
    await this.insertAdjustments(claimIds, lineIds);
    await this.insertProviderAdjustments(remittanceId);
    await this.link(remittanceId, claimIds);
    return { kind: 'loaded', remittanceId, claims: claimIds.size, lines: lineIds.size, review };
  }
}

/** Loads one loadable transaction set inside the job's transaction (see the module comment). */
export async function loadTransaction(context: LoadContext, remittance: LoadableRemittance): Promise<TransactionLoad> {
  const planned = loadPlan(remittance);
  if (planned.kind === 'refused') {
    return { kind: 'refused', at: planned.at };
  }
  const r = planned.plan.remittance;
  const loader = new Loader(context, planned.plan);
  const rows = await loader.known();
  // The X12 decision first, over the 835s of this exact trace alone: the unique key (the data dictionary's, without
  // the payee), then the parser's decision (a resend under a new envelope is the same payment, ADR 0031).
  const x12 = rows.filter(isX12).filter((row) => row.trn02 === r.trn02);
  const same = x12.find((row) => row.sender_id === r.senderId && row.isa13 === r.isa13 && row.bpr02_cents === r.bpr02Cents.toString());
  const decision = remittanceDecision(remittance, x12.map(known));
  const original = same ?? (decision.outcome === 'duplicate_remittance' ? x12.find((row) => row.id === decision.duplicateOf) : undefined);
  if (original !== undefined) {
    return { kind: 'duplicate', remittanceId: original.id, documentId: original.source_document_id };
  }
  // Then the exports of the trace's form: the same payment loaded first from an export is held for review, never
  // loaded beside it, whether its amount was the claims paid (a PLB) or its claims are this 835's.
  const exports = rows.filter((row) => row.provenance === 'era_export');
  const claims = await loader.claimHashesOf(exports.map((row) => row.id));
  const mine = loader.facts();
  const exported = exports.find((row) => exportIsPaymentOf(factsOfRow(row, claims.get(row.id)), mine) !== null);
  if (exported !== undefined) {
    return { kind: 'held_for_review', remittanceId: exported.id, documentId: exported.source_document_id, reason: 'payment_loaded_from_export' };
  }
  const review: TransactionReview | null =
    decision.outcome === 'review_trace_reused'
      ? { remittanceId: decision.sameTraceAs, reason: decision.anotherDate ? 'trace_reused_another_date' : 'trace_reused_same_date' }
      : // An export of the payee's trace with another amount or date: this 835 loads for review against it, as an export would.
        traceReview(exports, r);
  return loader.write(review);
}

/**
 * Loads one payment of an ERA export from its plan inside the document's transaction (see the module comment):
 * zero rows when the practice holds the payment already, from an 835 or an export; held when the payment it matches
 * by amount names another payer and shares no claim with it; else its rows, surfaced for review when the payee's
 * trace was used for another payment (another amount, or another date).
 */
export async function loadExportPayment(context: LoadContext, plan: LoadPlan<PlannedExportRemittance>): Promise<ExportPaymentLoad> {
  const loader = new Loader(context, plan);
  const rows = await loader.known();
  const claims = await loader.claimHashesOf(rows.map((row) => row.id));
  const mine = loader.facts();
  for (const row of rows) {
    const theirs = factsOfRow(row, claims.get(row.id));
    const match = row.provenance === 'era_export' ? (sameExportKey(mine, theirs) ? 'amount' : null) : exportIsPaymentOf(mine, theirs);
    if (match === null) {
      continue;
    }
    const linked = { remittanceId: row.id, documentId: row.source_document_id, provenance: row.provenance };
    return match === 'amount' && !onePayer(mine, theirs) ? { kind: 'held', reason: 'export_payment_other_payer', ...linked } : { kind: 'duplicate', ...linked };
  }
  return loader.write(traceReview(rows, plan.remittance));
}
