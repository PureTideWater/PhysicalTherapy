import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ERA_FORMAT_IDS, type EraFormatId } from '@tp/db';
import type { CodeListProvider } from '@tp/edi835';
import { inCodeSet } from '@tp/edi835';
import { parseCsv } from '@tp/ledger';
import { negateCents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import type { LoadPlan, PlannedExportRemittance } from '../plan';
import { findEraExportFormat } from './formats';
import { ERA_EXPORT_HELD_REASONS, ERA_EXPORT_MAX_BYTES, type EraExportHold, type EraExportNormalized, type LoadableEraPayment, MAX_AMOUNT_CENTS, normalizeEraExport, readDate } from './normalize';

/**
 * The ERA export normalizer against packages/synth's four vendor fixtures (fixtures/synthetic/emr/<id>/; docs/adr/0059
 * and 0060): each reads into one plan per payment whose lines are the manifest's canonical rows to the cent, and each
 * held reason holds what it says, naming a column by the format's header and a row by number, never a cell's value.
 */

const EMR = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/emr');

interface ManifestRow {
  readonly senderId: string;
  readonly payerName: string;
  readonly payeeId: string;
  readonly trace: string;
  readonly paymentDate: string;
  readonly paymentCents: string;
  readonly paymentMethod: string;
  readonly patientControlNumber: string;
  readonly payerClaimNumber: string;
  readonly claimStatus: string;
  readonly plan: string | null;
  readonly serviceDate: string;
  readonly placeOfService: string | null;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string | null;
  readonly chargeCents: string;
  readonly allowedCents: string | null;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string;
  readonly contractualAdjustmentCents: string;
  readonly otherAdjustmentCents: string;
  readonly adjustmentCodes: readonly string[];
}

interface Manifest {
  readonly format: string;
  readonly checks: readonly { readonly trace: string; readonly paymentCents: string; readonly rows: number }[];
  readonly files: readonly { readonly path: string }[];
  readonly rows: readonly ManifestRow[];
}

const manifestOf = (id: string): Manifest => JSON.parse(readFileSync(path.join(EMR, id, 'manifest.json'), 'utf8')) as Manifest;
const bytesOf = (id: string): Uint8Array => new Uint8Array(readFileSync(path.join(EMR, id, 'era-export.csv')));

/** Every CARC known, as a release would hold the synthetic codes. */
const KNOWN: CodeListProvider = { release: 900001, has: (list, code) => (list === 'carc' || list === 'rarc' ? true : inCodeSet(list, code)) };

const normalize = (id: EraFormatId, bytes: Uint8Array = bytesOf(id), codeLists: CodeListProvider = KNOWN): EraExportNormalized => normalizeEraExport({ bytes, formatId: id, codeLists });

function payments(result: EraExportNormalized): LoadableEraPayment[] {
  if (result.kind !== 'payments') {
    throw new Error('the export was held whole');
  }
  return result.payments.filter((payment): payment is LoadableEraPayment => payment.kind === 'loadable');
}

/** A plan's lines as the manifest's canonical rows, read back from the plan (amounts in cents as text). */
function canonicalRows(plan: LoadPlan<PlannedExportRemittance>): ManifestRow[] {
  const r = plan.remittance;
  return plan.claims.flatMap((claim) =>
    claim.lines.map((line) => {
      const of = (groups: readonly string[]) => line.adjustments.filter((item) => groups.includes(item.groupCode));
      const total = (groups: readonly string[]) => of(groups).reduce((sum, item) => sum + item.amountCents, 0n).toString();
      return {
        senderId: r.senderId ?? '',
        payerName: r.payerName,
        payeeId: r.payeeId,
        trace: r.trn02,
        paymentDate: r.bpr16Date,
        paymentCents: (r.creditDebit === 'D' ? negateCents(r.bpr02Cents) : r.bpr02Cents).toString(),
        paymentMethod: r.method ?? '',
        patientControlNumber: claim.patientControlNumber,
        payerClaimNumber: claim.payerClaimControlNumber,
        claimStatus: claim.statusCode,
        plan: claim.planKey.replace(/^PLAN:/, ''),
        serviceDate: line.serviceDate ?? '',
        placeOfService: line.placeOfService,
        procedureCode: line.procedureCode,
        modifiers: line.modifiers,
        units: line.units,
        chargeCents: line.chargeCents.toString(),
        allowedCents: line.lineAllowedCents === null ? null : line.lineAllowedCents.toString(),
        paidCents: line.paidCents.toString(),
        patientResponsibilityCents: total(['PR']),
        contractualAdjustmentCents: total(['CO']),
        otherAdjustmentCents: total(['OA', 'PI']),
        adjustmentCodes: [...line.adjustments].sort((a, b) => a.position - b.position).flatMap((item) => item.reasonCode.split('+').map((reason) => `${item.groupCode}-${reason}`)),
      };
    }),
  );
}

/** The fixture's table, changed by `edit`, written back as CSV (cells quoted where they must be). */
function edited(id: EraFormatId, edit: (table: string[][]) => string[][]): Uint8Array {
  const table = edit(parseCsv(readFileSync(path.join(EMR, id, 'era-export.csv'), 'utf8')));
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return new TextEncoder().encode(`${table.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`);
}

const WEBPT: EraFormatId = 'webpt_billing_era_v0';
/** The webpt fixture's column index for a header. */
const col = (header: string): number => (findEraExportFormat(WEBPT)?.columns ?? []).findIndex((column) => column.header === header);
/** Sets one cell of a data row (from 1). */
const setCell = (row: number, header: string, value: string) => (table: string[][]) => table.map((cells, index) => (index === row ? cells.map((cell, at) => (at === col(header) ? value : cell)) : cells));

function held(result: EraExportNormalized): readonly EraExportHold[] {
  if (result.kind !== 'held') {
    throw new Error('the export was not held whole');
  }
  return result.reasons;
}

/** The holds of the held payments, and how many payments still load. */
function paymentHolds(result: EraExportNormalized): { readonly holds: readonly EraExportHold[]; readonly loadable: number } {
  if (result.kind !== 'payments') {
    throw new Error('the export was held whole');
  }
  return { holds: result.payments.flatMap((payment) => (payment.kind === 'held' ? payment.reasons : [])), loadable: payments(result).length };
}

describe('normalizeEraExport: the four vendor formats', () => {
  it.each(ERA_FORMAT_IDS.map((id) => [id]))('reads %s into one plan per payment, its lines equal to the manifest to the cent', (id) => {
    const manifest = manifestOf(id);
    const result = normalize(id);
    const loadable = payments(result);
    expect(result.kind === 'payments' && result.payments.every((payment) => payment.kind === 'loadable')).toBe(true);
    expect(loadable.map((payment) => ({ trace: payment.plan.remittance.trn02, rows: payment.rows }))).toEqual(manifest.checks.map((check) => ({ trace: check.trace, rows: check.rows })));
    expect(loadable.flatMap((payment) => canonicalRows(payment.plan))).toEqual(manifest.rows);
    // Positions follow the payments' first rows.
    expect(loadable.map((payment) => payment.position)).toEqual(manifest.checks.map((_, index) => index + 1));
    let first = 1;
    for (const payment of loadable) {
      expect(payment.firstRow).toBe(first);
      first += payment.rows;
    }
    for (const payment of loadable) {
      const r = payment.plan.remittance;
      expect({ provenance: r.provenance, balance: r.balanceDiffCents, plb: r.plbTotalCents, productionDate: r.productionDate, claims: r.claimCount }).toEqual({
        provenance: 'era_export',
        balance: 0n,
        plb: 0n,
        productionDate: null,
        claims: payment.plan.claims.length,
      });
      expect(payment.plan.payer).toEqual({ payerIdRaw: `NAME:${r.payerName}`, nameRaw: r.payerName });
      expect(payment.plan.providerAdjustments).toEqual([]);
      for (const claim of payment.plan.claims) {
        expect(claim.chargeCents).toBe(claim.lines.reduce((sum, line) => sum + line.chargeCents, 0n));
        expect(claim.paidCents).toBe(claim.lines.reduce((sum, line) => sum + line.paidCents, 0n));
        expect({ resp: claim.patientRespCents, filing: claim.filingIndicator, facility: claim.facilityType, allowed: claim.allowedCents, insured: claim.insured, adjustments: claim.adjustments }).toEqual({
          resp: null,
          filing: null,
          facility: null,
          allowed: null,
          insured: null,
          adjustments: [],
        });
        // No name and no member ID: the patient is keyed by the patient control number alone.
        expect(claim.patient).toEqual({ key: `pcn|${claim.patientControlNumber}`, lastName: null, firstName: null, memberId: null, groupNumber: null });
        for (const line of claim.lines) {
          // The place of service the 835 twin's CLP08 gives (the manifest's), so a percent-of-Medicare term prices it.
          expect({ basis: line.observedAllowedBasis, observed: line.observedAllowedCents, allocated: line.observedAllowedAllocated, qualifier: line.procedureQualifier, pos: line.placeOfService, revenue: line.revenueCode, rendering: line.renderingNpi }).toEqual({
            basis: 'paid_plus_pr',
            observed: line.paidCents + line.patientShareCents,
            allocated: false,
            qualifier: 'HC',
            pos: '11',
            revenue: null,
            rendering: null,
          });
          expect(line.chargeCents).toBe(line.paidCents + line.adjustments.reduce((sum, item) => sum + item.amountCents, 0n));
        }
      }
    }
  });

  it('reads every format to the same plans: the rows are the same payments in four layouts', () => {
    const [first, ...rest] = ERA_FORMAT_IDS.map((id) => payments(normalize(id)).map((payment) => payment.plan));
    for (const plans of rest) {
      expect(plans).toEqual(first);
    }
  });

  it('links a reversal and the corrected claim that follows it with the same patient control number (PAR-08)', () => {
    const correction = payments(normalize(WEBPT)).find((payment) => payment.plan.remittance.trn02 === 'SYNEFTPAR08002');
    expect(correction?.plan.claims.map((claim) => ({ status: claim.statusCode, reversal: claim.reversal, correction: claim.correction }))).toEqual([
      { status: '22', reversal: { reversedClaimNo: null }, correction: null },
      { status: '1', reversal: null, correction: { payerClaimControlNumber: 'SYNCCNPAR080001', reversalClaimNo: 1 } },
    ]);
    expect(correction?.plan.claims[0]?.chargeCents).toBe(-23500n);
  });

  it('keeps the export’s Allowed figure beside observed allowed on the paid-plus-PR basis (PAR-12), and a group’s reasons joined (PAR-13)', () => {
    const plans = payments(normalize(WEBPT)).map((payment) => payment.plan);
    const b6 = plans.find((plan) => plan.remittance.trn02 === 'SYNEFTPAR12001')?.claims[0]?.lines[0];
    expect(b6).toMatchObject({ lineAllowedCents: 11440n, observedAllowedCents: 11440n, observedAllowedBasis: 'paid_plus_pr', paidCents: 9152n, patientShareCents: 2288n });
    const split = plans.find((plan) => plan.remittance.trn02 === 'SYNEFTPAR13001')?.claims[0]?.lines;
    expect(split?.map((line) => line.adjustments)).toEqual([
      [
        { groupCode: 'CO', reasonCode: '45', unknownCode: false, amountCents: 5000n, quantity: null, position: 1 },
        { groupCode: 'PR', reasonCode: '1+2+3', unknownCode: false, amountCents: 7600n, quantity: null, position: 2 },
      ],
      [
        { groupCode: 'CO', reasonCode: '45', unknownCode: false, amountCents: 3000n, quantity: null, position: 1 },
        { groupCode: 'PR', reasonCode: '1+3', unknownCode: false, amountCents: 4000n, quantity: null, position: 2 },
      ],
    ]);
    // Decimal units and four modifiers (PAR-22).
    expect(plans.find((plan) => plan.remittance.trn02 === 'SYNEFTPAR22001')?.claims[0]?.lines.map((line) => ({ units: line.units, modifiers: line.modifiers }))).toEqual([
      { units: '1.5', modifiers: ['59', 'KX', 'CQ', 'CO'] },
      { units: '0.25', modifiers: ['KX'] },
    ]);
  });

  it('keeps a negative payment’s sign as a debit (a take-back), the amount unsigned', () => {
    const negative = edited(WEBPT, (table) =>
      table.map((cells, index) =>
        index === 1 ? cells.map((cell, at) => ([col('Check Amount'), col('Paid Amount'), col('Billed Amount'), col('Contractual Adjustment'), col('Patient Responsibility')].includes(at) ? `-${cell}` : cell)) : cells,
      ),
    );
    const debit = payments(normalize(WEBPT, negative)).find((payment) => payment.firstRow === 1);
    expect(debit?.plan.remittance).toMatchObject({ creditDebit: 'D', bpr02Cents: 8800n, trn02: 'SYNEFTPAR01001' });
    expect(debit?.plan.claims[0]?.paidCents).toBe(-8800n);
  });

  it('flags a reason code not in the release’s CARC list on the payment date, as the 835 path flags it', () => {
    const only45: CodeListProvider = { release: 900001, has: (list, code) => (list === 'carc' ? code === '45' : list === 'rarc' || inCodeSet(list, code)) };
    const result = normalize(WEBPT, bytesOf(WEBPT), only45);
    expect(result.kind === 'payments' ? result.unknownCodes : null).toEqual(['carc:1', 'carc:2', 'carc:3']);
    const line = payments(result)[0]?.plan.claims[0]?.lines[0];
    expect(line?.adjustments.map((item) => [item.groupCode, item.unknownCode])).toEqual([
      ['CO', false],
      ['PR', true],
    ]);
  });

  it('matches headers trimmed and in any case, ignores other columns and a byte-order mark', () => {
    const loose = edited(WEBPT, (table) => table.map((cells, index) => (index === 0 ? [...cells.map((cell) => ` ${cell.toUpperCase()} `), 'Notes'] : [...cells, 'ignored'])));
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...loose]);
    expect(payments(normalize(WEBPT, withBom)).map((payment) => payment.plan)).toEqual(payments(normalize(WEBPT)).map((payment) => payment.plan));
  });

  it('reads only real calendar dates in the format’s date format', () => {
    expect(readDate('02/28/2026', 'MM/DD/YYYY')).toBe('2026-02-28');
    expect(readDate('2026-02-28', 'YYYY-MM-DD')).toBe('2026-02-28');
    expect(readDate('02/30/2026', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('2026-02-28', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('2/8/2026', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('2026-13-01', 'YYYY-MM-DD')).toBeNull();
    expect(readDate('1899-12-31', 'YYYY-MM-DD')).toBeNull();
  });
});

describe('normalizeEraExport: what it holds, by the closed list', () => {
  it('holds the whole document it cannot read as the format', () => {
    expect(held(normalize(WEBPT, new Uint8Array([0x43, 0x68, 0xff, 0xfe, 0x0a])))).toEqual([{ reason: 'export_unreadable', column: null, row: null, payment: null }]);
    expect(held(normalize(WEBPT, new TextEncoder().encode('a,"unclosed\n')))).toEqual([{ reason: 'export_unreadable', column: null, row: null, payment: null }]);
    expect(held(normalize(WEBPT, new Uint8Array()))).toEqual([{ reason: 'export_empty', column: null, row: null, payment: null }]);
    expect(held(normalize(WEBPT, edited(WEBPT, (table) => table.slice(0, 1))))).toEqual([{ reason: 'export_empty', column: null, row: null, payment: null }]);
    expect(held(normalize(WEBPT, new Uint8Array(ERA_EXPORT_MAX_BYTES + 1)))).toEqual([{ reason: 'export_too_large', column: null, row: null, payment: null }]);
    const noCpt = edited(WEBPT, (table) => table.map((cells) => cells.filter((_, at) => at !== col('CPT Code'))));
    expect(held(normalize(WEBPT, noCpt))).toEqual([{ reason: 'export_column_missing', column: 'CPT Code', row: null, payment: null }]);
    // A percent-of-Medicare term prices by the place of service, so an export without its column is held, never guessed.
    const noPlace = edited(WEBPT, (table) => table.map((cells) => cells.filter((_, at) => at !== col('Place of Service'))));
    expect(held(normalize(WEBPT, noPlace))).toEqual([{ reason: 'export_column_missing', column: 'Place of Service', row: null, payment: null }]);
    const twice = edited(WEBPT, (table) => table.map((cells, index) => [...cells, index === 0 ? 'units' : '1']));
    expect(held(normalize(WEBPT, twice))).toEqual([{ reason: 'export_column_repeated', column: 'Units', row: null, payment: null }]);
  });

  it('reads an optional column’s absence as no value: the sender, method, modifiers and Allowed', () => {
    const bare = edited(WEBPT, (table) => table.map((cells) => cells.filter((_, at) => ![col('ERA Sender ID'), col('Payment Method'), col('Modifiers'), col('Allowed Amount')].includes(at))));
    const plan = payments(normalize(WEBPT, bare))[0]?.plan;
    expect(plan?.remittance).toMatchObject({ senderId: null, method: null });
    expect(plan?.claims[0]?.lines[0]).toMatchObject({ modifiers: [], lineAllowedCents: null });
  });

  it('reads a blank place of service as none, as an 835 claim without CLP08, and keeps the others', () => {
    const plans = payments(normalize(WEBPT, edited(WEBPT, setCell(1, 'Place of Service', '')))).map((payment) => payment.plan);
    expect(plans[0]?.claims[0]?.lines[0]?.placeOfService).toBeNull();
    expect(plans.slice(1).flatMap((plan) => plan.claims.flatMap((claim) => claim.lines.map((line) => line.placeOfService)))).toEqual(Array(16).fill('11'));
  });

  it('holds the whole document when a payment’s key cannot be read on a row, naming the column and the row', () => {
    expect(held(normalize(WEBPT, edited(WEBPT, setCell(3, 'Check/EFT Number', ''))))).toEqual([{ reason: 'export_value_missing', column: 'Check/EFT Number', row: 3, payment: null }]);
    expect(held(normalize(WEBPT, edited(WEBPT, setCell(5, 'Check Date', '13/40/2026'))))).toEqual([{ reason: 'export_value_unreadable', column: 'Check Date', row: 5, payment: null }]);
    expect(held(normalize(WEBPT, edited(WEBPT, setCell(2, 'Check Amount', '$108.00'))))).toEqual([{ reason: 'export_value_unreadable', column: 'Check Amount', row: 2, payment: null }]);
    expect(held(normalize(WEBPT, edited(WEBPT, setCell(1, 'Payee ID', ''))))).toEqual([{ reason: 'export_value_missing', column: 'Payee ID', row: 1, payment: null }]);
    // An amount past MAX_AMOUNT_CENTS is unreadable, never passed on to fail in the database with its value.
    expect(held(normalize(WEBPT, edited(WEBPT, setCell(1, 'Check Amount', '10000000000.01'))))).toEqual([{ reason: 'export_value_unreadable', column: 'Check Amount', row: 1, payment: null }]);
    expect(held(normalize(WEBPT, edited(WEBPT, setCell(1, 'Check Amount', '-123456789012345678901.00'))))).toEqual([{ reason: 'export_value_unreadable', column: 'Check Amount', row: 1, payment: null }]);
  });

  it('reads an amount up to MAX_AMOUNT_CENTS and holds each amount column past it, naming the column', () => {
    expect(MAX_AMOUNT_CENTS).toBe(1_000_000_000_000n);
    // The largest amount it reads: PAR-01's one line billed ten billion dollars (paid that less its 50.00 CO and 22.00 PR).
    const largest = edited(WEBPT, (table) =>
      table.map((cells, index) => (index === 1 ? cells.map((cell, at) => (at === col('Check Amount') || at === col('Paid Amount') ? '9999999928.00' : at === col('Billed Amount') ? '10000000000.00' : cell)) : cells)),
    );
    const plan = payments(normalize(WEBPT, largest))[0]?.plan;
    expect(plan?.claims[0]?.lines[0]?.chargeCents).toBe(MAX_AMOUNT_CENTS);
    expect(plan?.remittance.bpr02Cents).toBe(999_999_992_800n);
    for (const header of ['Billed Amount', 'Allowed Amount', 'Paid Amount', 'Patient Responsibility', 'Contractual Adjustment', 'Other Adjustment']) {
      const { holds, loadable } = paymentHolds(normalize(WEBPT, edited(WEBPT, setCell(1, header, '123456789012345678901.00'))));
      expect(holds, header).toEqual([{ reason: 'export_value_unreadable', column: header, row: 1, payment: 1 }]);
      expect(loadable, header).toBe(6);
    }
  });

  /** Row 1 is PAR-01's payment (payment 1); rows 2 and 3 are PAR-08's original (payment 2). */
  it.each([
    ['a blank units cell', setCell(1, 'Units', ''), { reason: 'export_value_missing', column: 'Units', row: 1, payment: 1 }],
    ['a blank procedure code', setCell(1, 'CPT Code', ''), { reason: 'export_value_missing', column: 'CPT Code', row: 1, payment: 1 }],
    ['a blank service date', setCell(1, 'Date of Service', ''), { reason: 'export_value_missing', column: 'Date of Service', row: 1, payment: 1 }],
    ['a blank plan', setCell(1, 'Plan', ''), { reason: 'export_value_missing', column: 'Plan', row: 1, payment: 1 }],
    ['a blank payer claim number', setCell(1, 'Payer Claim Number', ''), { reason: 'export_value_missing', column: 'Payer Claim Number', row: 1, payment: 1 }],
    ['a blank payer name', setCell(1, 'Payer Name', ''), { reason: 'export_value_missing', column: 'Payer Name', row: 1, payment: 1 }],
    ['units of zero', setCell(1, 'Units', '0'), { reason: 'export_value_unreadable', column: 'Units', row: 1, payment: 1 }],
    ['units past numeric(9,3)', setCell(1, 'Units', '1.2345'), { reason: 'export_value_unreadable', column: 'Units', row: 1, payment: 1 }],
    ['a procedure code that is not five letters or digits', setCell(1, 'CPT Code', '9711'), { reason: 'export_value_unreadable', column: 'CPT Code', row: 1, payment: 1 }],
    ['a date that is not a calendar date', setCell(1, 'Date of Service', '02/30/2026'), { reason: 'export_value_unreadable', column: 'Date of Service', row: 1, payment: 1 }],
    ['five modifiers', setCell(1, 'Modifiers', 'GP,59,KX,CQ,CO'), { reason: 'export_value_unreadable', column: 'Modifiers', row: 1, payment: 1 }],
    ['a claim status outside CLP02’s set', setCell(1, 'Claim Status', '99'), { reason: 'export_value_unreadable', column: 'Claim Status', row: 1, payment: 1 }],
    ['an adjustment group outside CAS01’s set', setCell(1, 'Adjustment Codes', 'XX-45,PR-2'), { reason: 'export_value_unreadable', column: 'Adjustment Codes', row: 1, payment: 1 }],
    ['an amount with three places', setCell(1, 'Paid Amount', '88.001'), { reason: 'export_value_unreadable', column: 'Paid Amount', row: 1, payment: 1 }],
    ['an unreadable Allowed figure', setCell(1, 'Allowed Amount', 'n/a'), { reason: 'export_value_unreadable', column: 'Allowed Amount', row: 1, payment: 1 }],
    ['a place of service that is not two digits', setCell(1, 'Place of Service', '1'), { reason: 'export_value_unreadable', column: 'Place of Service', row: 1, payment: 1 }],
    ['a place of service in words', setCell(1, 'Place of Service', 'Office'), { reason: 'export_value_unreadable', column: 'Place of Service', row: 1, payment: 1 }],
    ['a payer name that changes inside a payment', setCell(3, 'Payer Name', 'SYNTHETIC PAYER B'), { reason: 'export_payment_inconsistent', column: 'Payer Name', row: 3, payment: 2 }],
    ['a sender that changes inside a payment', setCell(3, 'ERA Sender ID', 'SYNTHOTHER'), { reason: 'export_payment_inconsistent', column: 'ERA Sender ID', row: 3, payment: 2 }],
    ['a plan that changes inside a claim', setCell(3, 'Plan', 'SYNPLAN-COMM-02'), { reason: 'export_claim_inconsistent', column: 'Plan', row: 3, payment: 2 }],
    ['a line whose charge is not its paid and adjustments', setCell(1, 'Billed Amount', '160.01'), { reason: 'export_line_unbalanced', column: 'Billed Amount', row: 1, payment: 1 }],
    ['a contractual total with no CO code', setCell(1, 'Adjustment Codes', 'PR-2'), { reason: 'export_adjustment_unattributed', column: 'Contractual Adjustment', row: 1, payment: 1 }],
    ['other codes of two groups', setCell(1, 'Adjustment Codes', 'CO-45,PR-2,OA-23,PI-94'), { reason: 'export_adjustment_unattributed', column: 'Adjustment Codes', row: 1, payment: 1 }],
  ] as const)('holds the payment of %s, naming its column and row, and loads the others', (_name, edit, hold) => {
    const { holds, loadable } = paymentHolds(normalize(WEBPT, edited(WEBPT, edit)));
    expect(holds).toEqual([hold]);
    expect(loadable).toBe(manifestOf(WEBPT).checks.length - 1);
  });

  it('holds a payment whose lines do not total its payment', () => {
    // PAR-01's payment, one row: its amount changed is a new key with nothing else in it.
    const { holds, loadable } = paymentHolds(normalize(WEBPT, edited(WEBPT, setCell(1, 'Check Amount', '89.00'))));
    expect(holds).toEqual([{ reason: 'export_payment_unbalanced', column: 'Check Amount', row: 1, payment: 1 }]);
    expect(loadable).toBe(6);
  });

  it('names a column and a row, never a cell’s value, and every reason is on the closed list', () => {
    const values = ['SYNPCNPAR01001', 'SYNCCNPAR010001', '9900639797', 'SYNTHETIC PAYER A', 'SYNEFTPAR01001', '160.00'];
    const results = [
      normalize(WEBPT, edited(WEBPT, setCell(1, 'Units', ''))),
      normalize(WEBPT, edited(WEBPT, setCell(1, 'Billed Amount', '160.01'))),
      normalize(WEBPT, edited(WEBPT, setCell(3, 'Payer Name', 'SYNTHETIC PAYER B'))),
      normalize(WEBPT, edited(WEBPT, setCell(5, 'Check Date', '13/40/2026'))),
    ];
    for (const result of results) {
      const holds = result.kind === 'held' ? result.reasons : result.payments.flatMap((payment) => (payment.kind === 'held' ? payment.reasons : []));
      expect(holds.length).toBeGreaterThan(0);
      for (const hold of holds) {
        expect(ERA_EXPORT_HELD_REASONS).toContain(hold.reason);
        expect(hold.column === null || findEraExportFormat(WEBPT)?.columns.some((column) => column.header === hold.column)).toBe(true);
      }
      const text = JSON.stringify(holds);
      for (const value of [...values, '160.01', '13/40/2026', 'SYNTHETIC PAYER B']) {
        expect(text).not.toContain(value);
      }
    }
  });
});
