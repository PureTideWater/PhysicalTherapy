/**
 * Shared pieces for the case generators: synthetic therapy lines priced with invented amounts, claims,
 * remittances and envelopes with control numbers unique across every fixture.
 */
import { type Cents, cents, subtractCents } from '@tp/money';

import { type CalendarDate, addDays, calendarDate } from '../core/dates';
import { type CaseModule } from '../expected/types';
import { type ClaimSpec, type LineSpec, type SynthWorld, claim, line } from '../x12/factory';
import { type Claim, type LineDates, type ServiceLine } from '../x12/model';

/** Codes with values in the SYNTHETIC fee schedule (fixtures/synthetic/cms/PPRRVU_SYNTHETIC.csv). */
export const TIMED_CODES = ['97110', '97112', '97116', '97140', '97530'] as const;
export const EVALUATION_CODES = ['97161', '97162', '97163', '97164'] as const;
/** A code the SYNTHETIC fee schedule has no value for (test matrix PRC-09). */
export const CODE_WITHOUT_RVU = '97150';

const MODULE_NUMBER: Record<CaseModule | 'VAR', number> = { PAR: 1, MAP: 2, CON: 3, PRC: 4, CAS: 5, LED: 6, SEC: 7, JOB: 8, MOD: 9, VAR: 10, SCR: 11, CI: 12, DBF: 13, BIL: 15 };

/**
 * ISA13 for the n-th interchange of a case: unique across every fixture, so no two cases' files are
 * duplicates of each other by remittance key.
 */
export function controlNumber(caseId: string, n: number): number {
  const variant = /^V(\d{2})$/.exec(caseId);
  const [module = 'VAR', number = '0'] = variant ? ['VAR', variant[1]] : caseId.split('-');
  const moduleNumber = MODULE_NUMBER[module as CaseModule] ?? MODULE_NUMBER.VAR;
  return moduleNumber * 10_000_000 + Number.parseInt(number, 10) * 10_000 + n;
}

/** A compact case key for identifiers: "PAR-08" -> "PAR08". */
export function caseKey(caseId: string): string {
  return caseId.replace('-', '');
}

export function traceNumber(caseId: string, n: number, method: 'ACH' | 'CHK' | 'NON' | 'FWT' | 'BOP' = 'ACH'): string {
  if (method === 'CHK') {
    // Check numbers are digits.
    return `88${String(controlNumber(caseId, n)).padStart(10, '0')}`;
  }
  return `SYNEFT${caseKey(caseId)}${String(n).padStart(3, '0')}`;
}

/** A service date in 2026 (the SYNTHETIC release's year), drawn from the case's seed. */
export function serviceDate(world: SynthWorld, from = calendarDate(2026, 2, 2), spanDays = 120): CalendarDate {
  return addDays(from, world.random.int(0, spanDays));
}

export function paymentDateAfter(world: SynthWorld, date: CalendarDate): CalendarDate {
  return addDays(date, world.random.int(18, 40));
}

export type ShareKind = 'coinsurance' | 'copay' | 'deductible' | 'none';

export interface TherapyLineSpec {
  readonly code: string;
  readonly units?: number;
  readonly modifiers?: readonly string[];
  readonly date?: CalendarDate;
  readonly dates?: LineDates;
  readonly share?: ShareKind;
  readonly b6?: boolean;
  /** Fixes the per-unit charge in cents (otherwise drawn). */
  readonly unitCharge?: bigint;
  /** Fixes the allowed amount in cents (otherwise about 70% of the charge). */
  readonly allowed?: bigint;
  readonly overrides?: Partial<LineSpec>;
}

/**
 * A therapy line with invented amounts: a per-unit charge, an allowed amount below it (the CO-45
 * difference) and a patient share (PR-2 coinsurance of 20%, a PR-3 copay or a PR-1 deductible).
 */
export function therapyLine(world: SynthWorld, spec: TherapyLineSpec): ServiceLine {
  const units = spec.units ?? 1;
  const unitCharge = spec.unitCharge ?? BigInt(world.random.int(55, 95)) * 100n;
  const charge = cents(unitCharge * BigInt(units));
  const allowed = cents(spec.allowed ?? (charge * BigInt(world.random.int(60, 80))) / 100n);
  let patientShare: { reason: string; amount: Cents }[] = [];
  switch (spec.share ?? 'coinsurance') {
    case 'coinsurance':
      patientShare = [{ reason: '2', amount: cents(allowed / 5n) }];
      break;
    case 'copay':
      patientShare = [{ reason: '3', amount: cents(allowed < 2000n ? allowed : 2000n) }];
      break;
    case 'deductible':
      patientShare = [{ reason: '1', amount: allowed }];
      break;
    case 'none':
      break;
  }
  const dates: LineDates = spec.dates ?? (spec.date ? { kind: 'single', date: spec.date } : { kind: 'none' });
  return line({
    code: spec.code,
    modifiers: spec.modifiers,
    units: String(units),
    charge,
    allowed,
    patientShare,
    dates,
    b6: spec.b6,
    ...spec.overrides,
  });
}

export interface TherapyClaimSpec extends Omit<ClaimSpec, 'patientControlNumber' | 'payerClaimControlNumber' | 'patient'> {
  readonly caseId: string;
  readonly n: number;
  readonly patient?: ClaimSpec['patient'];
  readonly patientControlNumber?: string;
  readonly payerClaimControlNumber?: string;
  /** The plan the synthetic fixtures carry in REF CE. */
  readonly plan?: string;
}

/** A claim with invented control numbers and patient, its plan in REF CE. */
export function therapyClaim(world: SynthWorld, spec: TherapyClaimSpec): Claim {
  const key = caseKey(spec.caseId);
  const refs = [...(spec.plan === undefined ? [] : [{ qualifier: 'CE', value: spec.plan }]), ...(spec.refs ?? [])];
  return claim({
    ...spec,
    patientControlNumber: spec.patientControlNumber ?? `SYNPCN${key}${String(spec.n).padStart(3, '0')}`,
    payerClaimControlNumber: spec.payerClaimControlNumber ?? `SYNCCN${key}${String(spec.n).padStart(4, '0')}`,
    patient: spec.patient ?? world.patient(),
    renderingProvider: spec.renderingProvider ?? world.renderingProvider(),
    refs,
  });
}

/** The difference that makes a line's paid amount one cent per unit off, for unbalanced fixtures. */
export function offBy(amount: Cents, delta: bigint): Cents {
  return subtractCents(amount, cents(-delta));
}
