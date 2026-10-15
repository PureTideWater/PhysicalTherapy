import { readFileSync } from 'node:fs';

import { cents } from '@tp/money';

import { render835, x12Expectation } from './cases/builder';
import { type CalendarDate, addDays, parseCalendarDate } from './core/dates';
import { prettyJson, sha256 } from './core/json';
import { assertSyntheticX12 } from './write';
import { SynthWorld, claim, line, remittance, singleTransactionFile } from './x12/factory';

/**
 * The synthetic end-to-end audit (milestone 6): a declarative inputs file
 * (fixtures/synthetic/audit/<id>/inputs.json, tp-audit-inputs/1) names the practice's triage
 * settings, the payer, the plans with their contracts or "no agreement", and groups of lines with
 * their codes, units, charges and allowed amounts; this module builds the remittance (an 835 with the
 * synthetic sender) from it. The application loads that 835 and prices, triages and reports it; the
 * independent worksheet (tools/audit-worksheet) computes the expected report from the same inputs,
 * never from the 835 or the application's code. Synthetic data only.
 */

export const AUDIT_INPUTS_FORMAT = 'tp-audit-inputs/1';

export interface AuditContract {
  readonly effective_from: string;
  readonly dispute_window_days: number;
  readonly schedule: readonly { readonly code: string; readonly amount_cents: string }[];
}

export interface AuditPlan {
  readonly key: string;
  readonly mapping: 'contract' | 'no_agreement';
  readonly contract?: AuditContract;
}

export interface AuditGroup {
  readonly plan: string;
  readonly code: string;
  readonly units: number;
  readonly unit_charge_cents: string;
  readonly allowed_cents: string;
  readonly count: number;
  readonly first_service_date: string;
  readonly note: string;
}

export interface AuditInputs {
  readonly format: typeof AUDIT_INPUTS_FORMAT;
  readonly id: string;
  readonly synthetic: true;
  readonly practice: { readonly settings: Readonly<Record<string, string | number>> };
  readonly judged_on: string;
  readonly stable: { readonly from: string; readonly to: string };
  readonly payer: { readonly key: string; readonly name: string };
  readonly remittance: { readonly payment_date: string; readonly isa13: number; readonly trace: string };
  readonly run: { readonly from_month: string; readonly to_month: string };
  readonly plans: readonly AuditPlan[];
  readonly groups: readonly AuditGroup[];
}

export class AuditInputsError extends Error {
  override readonly name = 'AuditInputsError';
}

/** One line of the audit as the inputs' rules expand it (one claim each). */
export interface AuditLine {
  readonly payerClaimControlNumber: string;
  readonly plan: string;
  readonly code: string;
  readonly units: number;
  readonly unitChargeCents: bigint;
  readonly allowedCents: bigint;
  readonly serviceDate: CalendarDate;
}

const MODIFIERS = ['GP'] as const;

function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new AuditInputsError(message);
  }
}

const isCents = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);

/** Reads and checks an inputs file. */
export function readAuditInputs(file: string): AuditInputs {
  const inputs = JSON.parse(readFileSync(file, 'utf8')) as AuditInputs;
  check(inputs.format === AUDIT_INPUTS_FORMAT, `${file}: not ${AUDIT_INPUTS_FORMAT}`);
  check(inputs.synthetic, `${file}: the inputs must say they are synthetic`);
  check(inputs.payer.name.startsWith('SYNTHETIC '), `${file}: the payer's name must say SYNTHETIC`);
  check(inputs.payer.name === `SYNTHETIC PAYER ${inputs.payer.key}`, `${file}: the payer's name is the synthetic world's for its key`);
  const plans = new Set(inputs.plans.map((plan) => plan.key));
  for (const plan of inputs.plans) {
    check(plan.mapping !== 'contract' || plan.contract !== undefined, `${file}: plan ${plan.key} is mapped to a contract without one`);
    for (const rate of plan.contract?.schedule ?? []) {
      check(isCents(rate.amount_cents), `${file}: plan ${plan.key} ${rate.code}: amount_cents is integer cents as text`);
    }
  }
  for (const group of inputs.groups) {
    check(plans.has(group.plan), `${file}: a group names the unknown plan ${group.plan}`);
    check(Number.isInteger(group.units) && group.units >= 1 && Number.isInteger(group.count) && group.count >= 1, `${file}: units and count are positive integers`);
    check(isCents(group.unit_charge_cents) && isCents(group.allowed_cents), `${file}: amounts are integer cents as text`);
    check(BigInt(group.allowed_cents) <= BigInt(group.unit_charge_cents) * BigInt(group.units), `${file}: a line is allowed no more than it charged`);
    check(BigInt(group.allowed_cents) % 5n === 0n, `${file}: the allowed amount divides by five (the coinsurance is one fifth)`);
  }
  return inputs;
}

/** The lines the inputs describe, in their order: claims numbered from 1, dates from each group's first (modulo 20 days). */
export function auditLines(inputs: AuditInputs): AuditLine[] {
  const key = inputs.id.replace('-', '').replace('AUDIT', 'AUD');
  const lines: AuditLine[] = [];
  for (const group of inputs.groups) {
    const first = parseCalendarDate(group.first_service_date);
    for (let index = 0; index < group.count; index += 1) {
      lines.push({
        payerClaimControlNumber: `SYNCCN${key}${String(lines.length + 1).padStart(4, '0')}`,
        plan: group.plan,
        code: group.code,
        units: group.units,
        unitChargeCents: BigInt(group.unit_charge_cents),
        allowedCents: BigInt(group.allowed_cents),
        serviceDate: addDays(first, index % 20),
      });
    }
  }
  return lines;
}

/** The audit's files: its remittance (one interchange, one transaction, one claim per line, the synthetic sender) and the expected.json the 835 oracle reads. */
export function auditFiles(inputs: AuditInputs): { readonly remit: Uint8Array; readonly expected: string } {
  const world = new SynthWorld(`tp-synth/${inputs.id}`);
  const key = inputs.id.replace('-', '');
  const paid = parseCalendarDate(inputs.remittance.payment_date);
  const claims = auditLines(inputs).map((item, index) =>
    claim({
      patientControlNumber: `SYNPCN${key}${String(index + 1).padStart(4, '0')}`,
      payerClaimControlNumber: item.payerClaimControlNumber,
      patient: world.patient(),
      renderingProvider: world.renderingProvider(),
      refs: [{ qualifier: 'CE', value: item.plan }],
      lines: [
        line({
          code: item.code,
          modifiers: MODIFIERS,
          units: String(item.units),
          charge: cents(item.unitChargeCents * BigInt(item.units)),
          allowed: cents(item.allowedCents),
          patientShare: [{ reason: '2', amount: cents(item.allowedCents / 5n) }],
          dates: { kind: 'single', date: item.serviceDate },
          b6: true,
        }),
      ],
    }),
  );
  const remittance835 = remittance(
    {
      payer: world.payer(inputs.payer.key),
      payee: world.payee('01'),
      claims,
      paymentDate: paid,
      trace: inputs.remittance.trace,
      originatorId: world.originatorId(inputs.payer.key),
      productionDate: addDays(paid, -1),
    },
    world,
  );
  const file = singleTransactionFile(remittance835, { isa13: inputs.remittance.isa13, date: paid });
  const rendered = render835(file);
  assertSyntheticX12(rendered.bytes, `${inputs.id}/remit.835`);
  const expected = {
    case: inputs.id,
    synthetic: true,
    description: 'The synthetic end-to-end audit’s remittance, built by packages/synth from inputs.json (src/audit.ts); the 835 oracle reads it like every fixture. The expected report is expected-report.json and expected-lines.csv, written by tools/audit-worksheet.',
    files: [
      {
        path: 'remit.835',
        sha256: sha256(rendered.bytes),
        bytes: rendered.bytes.length,
        kind: 'x12',
        description: `${String(claims.length)} claims of one line each, one payer, the plans of inputs.json.`,
        x12: x12Expectation(file, rendered, false),
      },
    ],
  };
  return { remit: rendered.bytes, expected: prettyJson(expected) };
}
