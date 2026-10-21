/**
 * Mapping (MAP), contract (CON) and pricing (PRC) cases: the 835s their scenarios price and the
 * synthetic contract exhibits, with the scenario inputs that are not files and the outcomes that can
 * be stated before the milestone that asserts them. Expected amounts for PRC cases are the pricing
 * oracle's golden lines (fixtures/golden), not stated here.
 */
import { centsToString, sumCents } from '@tp/money';

import { type CalendarDate, addDays, calendarDate } from '../core/dates';
import { prettyJson } from '../core/json';
import { dollars } from '../x12/factory';
import { type Claim } from '../x12/model';
import { type CaseBuilder } from './builder';
import { CODE_WITHOUT_RVU, therapyClaim, therapyLine } from './common';
import { addExhibit, pageText } from './contracts';
import { type Basics, basics, file, oneRemittance } from './par';

const RELEASE = 900001;

function claimsOn(b: CaseBuilder, base: Basics, plan: string, specs: readonly { code: string; units?: number; modifiers?: string[]; date?: CalendarDate }[][], filingIndicator = '12'): Claim[] {
  return specs.map((lines, index) =>
    therapyClaim(b.world, {
      caseId: b.info.id,
      n: index + 1,
      plan,
      filingIndicator,
      lines: lines.map((spec) => therapyLine(b.world, { code: spec.code, units: spec.units, modifiers: spec.modifiers, date: spec.date ?? base.date })),
    }),
  );
}

function remitWith(b: CaseBuilder, claims: Claim[], description: string, base = basics(b), name = 'remit.835', n = 1): void {
  b.add835(name, file(b, oneRemittance(b, base, claims, n), n, base.paid), description);
}

/** The worked example's visit (PRD section 11): 97110 x 2, 97140 x 1, 97530 x 1 on one date. */
const WORKED_VISIT = [{ code: '97110', units: 2 }, { code: '97140' }, { code: '97530' }];

export function map01(b: CaseBuilder): void {
  const base = basics(b, 'M');
  const claims = claimsOn(b, base, 'SYNPLAN-UNMAPPED-01', [WORKED_VISIT, [{ code: '97112', units: 2 }]]);
  remitWith(b, claims, 'Claims from a payer and plan with no mapping.', base);
  b.scenario({ mappings: [], plan: 'SYNPLAN-UNMAPPED-01', payer: base.payer.name });
  b.outcome({
    pricing: 'refused for every line: NO_MAPPING',
    coverageWaiting: {
      lines: claims.reduce((total, item) => total + item.lines.length, 0),
      chargeCents: centsToString(sumCents(claims.map((item) => item.charge))),
      paidCents: centsToString(sumCents(claims.map((item) => item.paid))),
    },
  });
}

export function map02(b: CaseBuilder): void {
  const base = basics(b, 'M');
  const effective = calendarDate(2026, 4, 1);
  const before = calendarDate(2026, 3, 16);
  const after = calendarDate(2026, 4, 13);
  const claims = claimsOn(b, base, 'SYNPLAN-COMM-02', [
    [{ code: '97110', units: 2, date: before }],
    [{ code: '97110', units: 2, date: after }],
  ]);
  remitWith(b, claims, 'Two visits of the same plan, one before and one after the mapping takes effect.', { ...base, paid: addDays(after, 21) });
  b.scenario({ mapping: { plan: 'SYNPLAN-COMM-02', kind: 'contract', effectiveFrom: effective } });
  b.outcome({
    lines: [
      { claim: 0, line: 0, serviceDate: before, expected: 'NO_MAPPING' },
      { claim: 1, line: 0, serviceDate: after, expected: 'priced' },
    ],
  });
}

export function map03(b: CaseBuilder): void {
  const base = basics(b, 'M');
  remitWith(b, claimsOn(b, base, 'SYNPLAN-COMM-03', [WORKED_VISIT]), 'A visit priced under a mapping that is later corrected.', base);
  b.scenario({
    mappings: [
      { plan: 'SYNPLAN-COMM-03', kind: 'contract', contractVersion: 'SYNTHETIC version A', effectiveFrom: '2026-01-01', mappedFirst: true },
      { plan: 'SYNPLAN-COMM-03', kind: 'contract', contractVersion: 'SYNTHETIC version B', effectiveFrom: '2026-01-01', supersedes: 0 },
    ],
  });
  b.outcome({ newMapping: 'supersedes the first, which stays recorded', earlierRun: 'unchanged', rerun: 'offered with a diff' });
}

export function map04(b: CaseBuilder): void {
  const base = basics(b, 'M');
  remitWith(b, claimsOn(b, base, 'SYNPLAN-OON-04', [WORKED_VISIT, [{ code: '97530', units: 2 }]]), 'Claims from a plan mapped as no agreement.', base);
  b.scenario({ mapping: { plan: 'SYNPLAN-OON-04', kind: 'no_agreement', effectiveFrom: '2026-01-01' } });
  b.outcome({ unpricedReason: 'NO_AGREEMENT', lines: 'anomaly screening only' });
}

export function map05(b: CaseBuilder): void {
  const base = basics(b, 'M');
  remitWith(b, claimsOn(b, base, 'SYNPLAN-MA-05', [WORKED_VISIT], '16'), 'A Medicare Advantage visit from a plan mapped as MA non-contracted.', base);
  b.scenario({ mapping: { plan: 'SYNPLAN-MA-05', kind: 'ma_noncontracted', effectiveFrom: '2026-01-01' }, release: RELEASE, placeOfService: '11', locality: '01' });
  b.outcome({ method: 'PERCENT_OF_MEDICARE', percentage: '100', basis: 'CURRENT', flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true } });
}

const PAYER = 'SYNTHETIC PAYER C';
const PROVIDER = 'SYNTHETIC THERAPY GROUP 01';

export function con01(b: CaseBuilder): void {
  addExhibit(b, 'version-1', { title: 'SYNTHETIC Payer C agreement, version 1', payerName: PAYER, providerName: PROVIDER, version: '1', effectiveFrom: calendarDate(2026, 1, 1), effectiveTo: calendarDate(2026, 12, 31), compensation: ['Payer shall reimburse Covered Services at 110% of the Medicare Physician Fee Schedule in effect on the date of service.'] }, 'Version 1, effective 2026-01-01 through 2026-12-31');
  addExhibit(b, 'version-2', { title: 'SYNTHETIC Payer C agreement, version 2', payerName: PAYER, providerName: PROVIDER, version: '2', effectiveFrom: calendarDate(2026, 7, 1), effectiveTo: calendarDate(2027, 6, 30), compensation: ['Payer shall reimburse Covered Services at 115% of the Medicare Physician Fee Schedule in effect on the date of service.'] }, 'Version 2, effective 2026-07-01 through 2027-06-30');
  b.scenario({ versions: [{ file: 'version-1.pdf', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }, { file: 'version-2.pdf', effectiveFrom: '2026-07-01', effectiveTo: '2027-06-30' }] });
  b.outcome({ secondVersion: 'refused: its window overlaps version 1 from 2026-07-01 to 2026-12-31' });
}

export function con02(b: CaseBuilder): void {
  addExhibit(b, 'agreement', { title: 'SYNTHETIC Payer C agreement', payerName: PAYER, providerName: PROVIDER, version: '1', effectiveFrom: calendarDate(2026, 1, 1), compensation: ['Payer shall reimburse Covered Services at 105% of the Medicare Physician Fee Schedule in effect on the date of service.'] }, 'The base agreement, open-ended from 2026-01-01');
  addExhibit(b, 'amendment-1', { title: 'SYNTHETIC Payer C amendment 1', payerName: PAYER, providerName: PROVIDER, version: '2 (amendment 1)', effectiveFrom: calendarDate(2026, 7, 1), compensation: ['Effective 2026-07-01, Payer shall reimburse Covered Services at 108% of the Medicare Physician Fee Schedule in effect on the date of service.'] }, 'Amendment 1, effective 2026-07-01');
  b.outcome({ priorVersion: { effectiveTo: '2026-06-30', otherwise: 'unchanged' }, amendment: { effectiveFrom: '2026-07-01' } });
}

export function con03(b: CaseBuilder): void {
  addExhibit(b, 'agreement', { title: 'SYNTHETIC Payer C agreement', payerName: PAYER, providerName: PROVIDER, version: '1', status: 'signed off', effectiveFrom: calendarDate(2026, 1, 1), compensation: ['Payer shall reimburse Covered Services under the fee schedule in Exhibit A.'], feeSchedule: [{ code: '97110', amount: dollars('41.00') }, { code: '97140', amount: dollars('38.50') }] }, 'The document of a version that has been signed off');
  b.outcome({ edit: 'refused on the signed-off version', remedy: 'supersession: a new version' });
}

export function con05(b: CaseBuilder): void {
  const exhibit = addExhibit(b, 'agreement', { title: 'SYNTHETIC Payer C fee schedule agreement', payerName: PAYER, providerName: PROVIDER, version: '1', effectiveFrom: calendarDate(2026, 1, 1), compensation: ['Payer shall reimburse Covered Services under the fee schedule in Exhibit A, per unit.'], feeSchedule: [{ code: '97110', amount: dollars('44.00') }, { code: '97530', amount: dollars('47.25') }] }, 'A fee-schedule agreement the model reads');
  const proposal = {
    synthetic: true,
    purpose: 'proposeContractTerms',
    document: 'agreement.pdf',
    fields: [
      { field: 'effective_from', value: '2026-01-01', page: 1, quote: 'This version is effective 2026-01-01 and continues until amended.' },
      { field: 'rate.97110', value: '44.00', page: 3, quote: '97110  $44.00 per unit' },
      { field: 'rate.97530', value: '49.25', page: 3, quote: '97530  $49.25 per unit' },
    ],
  };
  b.addFile('proposal.json', prettyJson(proposal), 'json', 'A recorded SYNTHETIC model proposal: the 97530 quote does not appear on page 3.');
  b.outcome({ verifier: { fails: [{ field: 'rate.97530', page: 3 }], passes: ['effective_from', 'rate.97110'] }, specialist: 'sees the failed field' });
  b.note(`Page 3 reads: ${JSON.stringify(pageText(exhibit, 3))}.`);
}

export function con06(b: CaseBuilder): void {
  addExhibit(b, 'exhibit-a', { title: 'SYNTHETIC Payer C exhibit A', payerName: PAYER, providerName: PROVIDER, version: '1', effectiveFrom: calendarDate(2026, 1, 1), compensation: ['Payer shall reimburse Covered Services under the fee schedule below.'], feeSchedule: [{ code: '97110', amount: dollars('42.00') }] }, 'Exhibit A of version 1: 97110 at 42.00');
  addExhibit(b, 'exhibit-b', { title: 'SYNTHETIC Payer C exhibit B', payerName: PAYER, providerName: PROVIDER, version: '1', effectiveFrom: calendarDate(2026, 1, 1), compensation: ['Payer shall reimburse Covered Services under the fee schedule below.'], feeSchedule: [{ code: '97110', amount: dollars('45.50') }] }, 'Exhibit B of the same version: 97110 at 45.50');
  const base = basics(b, 'C');
  remitWith(b, claimsOn(b, base, 'SYNPLAN-COMM-C', [[{ code: '97110', units: 2 }]]), 'A 97110 line to price under the conflicting exhibits.', base);
  b.outcome({ unpricedReason: 'AMBIGUOUS_RATE', until: 'the specialist resolves the scope' });
}

export function con07(b: CaseBuilder): void {
  addExhibit(b, 'draft', { title: 'SYNTHETIC Payer C draft agreement', payerName: PAYER, providerName: PROVIDER, version: '1', status: 'draft', effectiveFrom: calendarDate(2026, 1, 1), compensation: ['Payer shall reimburse Covered Services at 110% of the Medicare Physician Fee Schedule in effect on the date of service.'] }, 'The document of a version still in draft');
  const base = basics(b, 'C');
  remitWith(b, claimsOn(b, base, 'SYNPLAN-COMM-C', [WORKED_VISIT]), 'A visit whose only version is a draft.', base);
  b.outcome({ pricing: 'refused: only signed_off versions price lines' });
}

interface PrcSpec {
  readonly plan: string;
  readonly filingIndicator?: string;
  readonly visits: readonly { code: string; units?: number; modifiers?: string[]; date?: CalendarDate }[][];
  readonly description: string;
  readonly scenario: Record<string, unknown>;
  readonly outcome?: Record<string, unknown>;
}

function prc(b: CaseBuilder, spec: PrcSpec): void {
  const base = basics(b, 'P');
  remitWith(b, claimsOn(b, base, spec.plan, spec.visits, spec.filingIndicator), spec.description, base);
  b.scenario({ release: RELEASE, placeOfService: '11', locality: '01', ...spec.scenario });
  b.outcome({ expectedAllowed: 'the golden lines in fixtures/golden (the pricing oracle) state the cents', ...spec.outcome });
}

const MA = { mapping: 'ma_noncontracted', method: 'PERCENT_OF_MEDICARE', percentage: '100', basis: 'CURRENT', conversionFactor: 'non_qualifying_apm', flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true } };
const COMMERCIAL_OFF = { apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: false };

export const prc01 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-MA-NC', filingIndicator: '16', visits: [WORKED_VISIT], description: 'MA non-contracted visit: 97110 x 2, 97140, 97530; no assistant modifier.', scenario: MA });
export const prc02 = (b: CaseBuilder) =>
  prc(b, { plan: 'SYNPLAN-MA-NC', filingIndicator: '16', visits: [[{ code: '97110', units: 2, modifiers: ['CQ'] }, { code: '97140' }, { code: '97530' }]], description: 'The same visit with CQ on the two 97110 units.', scenario: MA, outcome: { assistantReduction: 'applies to the two CQ units only' } });
export const prc03 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-COMM-110', visits: [WORKED_VISIT], description: 'The same visit under a commercial contract at 110% of current Medicare.', scenario: { mapping: 'contract', method: 'PERCENT_OF_MEDICARE', percentage: '110', basis: 'CURRENT', conversionFactor: 'non_qualifying_apm', flags: COMMERCIAL_OFF }, outcome: { amount: 'the unreduced sum times 1.10' } });
export const prc04 = (b: CaseBuilder) =>
  prc(b, { plan: 'SYNPLAN-COMM-2025', visits: [WORKED_VISIT], description: 'A visit under a contract locked to the 2025 fee schedule.', scenario: { mapping: 'contract', method: 'PERCENT_OF_MEDICARE', percentage: '100', basis: 'LOCKED:2025', conversionFactor: 'non_qualifying_apm', flags: COMMERCIAL_OFF, release: 900002, needs: '2025 SYNTHETIC relative values and conversion factor: release-synth-900002 adds them to release 900001' } });
export const prc05 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-COMM-FIX', visits: [[{ code: '97110', units: 2 }]], description: 'Two units under a fixed schedule.', scenario: { mapping: 'contract', method: 'FIXED_SCHEDULE', schedule: [{ code: '97110', amountCents: '4250' }], flags: COMMERCIAL_OFF }, outcome: { expectedAllowedCents: '8500' } });
export function prc06(b: CaseBuilder): void {
  const base = basics(b, 'P');
  const lowCharge = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-LESSER', lines: [therapyLine(b.world, { code: '97140', date: base.date, unitCharge: 3000n, allowed: 3000n, share: 'none' })] });
  remitWith(b, [lowCharge], 'A 97140 line charged 30.00, below the schedule amount.', base);
  b.scenario({ release: RELEASE, mapping: 'contract', method: 'LESSER_OF', schedule: [{ code: '97140', amountCents: '4500' }], chargeBasis: 'line charge', flags: COMMERCIAL_OFF });
  b.outcome({ expectedAllowedCents: '3000', winner: 'charge' });
}
export const prc07 = (b: CaseBuilder) =>
  prc(b, { plan: 'SYNPLAN-COMM-VISIT', visits: [[{ code: '97110' }, { code: '97140' }, { code: '97530' }]], description: 'Three included lines on one visit under a per-visit rate.', scenario: { mapping: 'contract', method: 'PER_VISIT', amountCents: '9500', includedCodes: ['97110', '97140', '97530'], flags: COMMERCIAL_OFF }, outcome: { lines: [{ line: 0, expectedAllowedCents: '9500' }, { line: 1, expectedAllowedCents: '0' }, { line: 2, expectedAllowedCents: '0' }] } });
export const prc08 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-COMM-APM', visits: [WORKED_VISIT], description: 'A visit under a record that names the qualifying-APM conversion factor.', scenario: { mapping: 'contract', method: 'PERCENT_OF_MEDICARE', percentage: '100', basis: 'CURRENT', conversionFactor: 'qualifying_apm', flags: COMMERCIAL_OFF }, outcome: { conversionFactor: 'qualifying_apm (SYNTHETIC 20.1000)' } });
export const prc09 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-MA-NC', filingIndicator: '16', visits: [[{ code: CODE_WITHOUT_RVU }]], description: `A ${CODE_WITHOUT_RVU} line: no SYNTHETIC relative value exists for it.`, scenario: MA, outcome: { unpricedReason: 'NO_PFS_VALUE' } });
export const prc10 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-MA-NC', filingIndicator: '16', visits: [[{ code: '97530', units: 6 }]], description: '97530 x 6, above its SYNTHETIC MUE of 5.', scenario: MA, outcome: { unpricedReason: 'MUE_EXCEEDED' } });
export const prc11 = (b: CaseBuilder) => prc(b, { plan: 'SYNPLAN-MA-NC', filingIndicator: '16', visits: [[{ code: '97140' }, { code: '97530' }]], description: '97140 and 97530 on the same day with no 59 or X modifier.', scenario: MA, outcome: { reviewFlag: 'NCCI procedure-to-procedure edit 97140 with 97530 (SYNTHETIC modifier indicator 1)' } });
export function prc12(b: CaseBuilder): void {
  const base = basics(b, 'P');
  const inGap = calendarDate(2026, 4, 15);
  remitWith(b, claimsOn(b, base, 'SYNPLAN-COMM-GAP', [[{ code: '97110', units: 2, date: inGap }]]), 'A line dated in the gap between two versions.', { ...base, paid: addDays(inGap, 25) });
  b.scenario({ release: RELEASE, versions: [{ effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31' }, { effectiveFrom: '2026-05-01', effectiveTo: null }], serviceDate: inGap });
  b.outcome({ unpricedReason: 'DATE_OUTSIDE_VERSIONS' });
}
export function prc13(b: CaseBuilder): void {
  const base = basics(b, 'P');
  const claims = (['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE'] as const).map((_rule, index) =>
    therapyClaim(b.world, { caseId: b.info.id, n: index + 1, plan: `SYNPLAN-ROUND-${String(index + 1)}`, lines: [therapyLine(b.world, { code: '97110', date: base.date })] }),
  );
  remitWith(b, claims, 'The same 97110 line in three plans whose rate records round differently.', base);
  b.scenario({ release: RELEASE, plans: [{ plan: 'SYNPLAN-ROUND-1', rounding: 'HALF_UP_CENT' }, { plan: 'SYNPLAN-ROUND-2', rounding: 'HALF_EVEN_CENT' }, { plan: 'SYNPLAN-ROUND-3', rounding: 'TRUNCATE' }], note: 'the rate that lands each line on a half cent is the golden worksheet\'s' });
  b.outcome({ expected: 'per rule, with the unrounded value kept; golden lines state the cents' });
}
export function prc14(b: CaseBuilder): void {
  const base = basics(b, 'P');
  const date = calendarDate(2026, 2, 9);
  const paid = calendarDate(2026, 3, 2);
  remitWith(b, claimsOn(b, base, 'SYNPLAN-MA-NC', [[{ code: '97110', units: 2, date }]], '16'), 'An underpaid line whose dispute window has passed by the triage date.', { ...base, date, paid });
  b.scenario({ release: RELEASE, ...MA, remittanceDate: paid, window: 'SYNTHETIC redetermination 111 days', triageDate: '2026-07-15' });
  b.outcome({ stage: 'validated, not actionable', reason: 'WINDOW_PASSED (the window closed 2026-06-21)' });
}
export function prc15(b: CaseBuilder): void {
  const base = basics(b, 'P');
  const over = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-FIX', lines: [therapyLine(b.world, { code: '97110', date: base.date, unitCharge: 9000n, allowed: 6000n })] });
  remitWith(b, [over], 'A 97110 line paid above its fixed schedule amount.', base);
  b.scenario({ release: RELEASE, mapping: 'contract', method: 'FIXED_SCHEDULE', schedule: [{ code: '97110', amountCents: '4250' }], flags: COMMERCIAL_OFF });
  b.outcome({ expectedAllowedCents: '4250', observedAllowedCents: '6000', varianceCents: '-1750', case: 'none' });
}
/**
 * PRC-21 (docs/adr/0064): a Medicare Advantage visit of a practice whose billing ZIP, 00012, needs its ZIP+4 under the
 * SYNTHETIC release 900006 (its ZIP+4 file: 0000-4999 in locality 01, 5000-8999 in locality 02, 9000-9999 not listed).
 * The ZIP+4 is the practice's setting, not in the 835. The golden claims G196-G199 state the cents.
 */
export const prc21 = (b: CaseBuilder) =>
  prc(b, {
    plan: 'SYNPLAN-MA-NC',
    filingIndicator: '16',
    visits: [WORKED_VISIT],
    description: 'The worked visit of a practice whose billing ZIP spans two localities; its ZIP+4 is a practice setting.',
    scenario: {
      ...MA,
      release: 900006,
      practice: { zip: '00012', zipPlusFour: '5000' },
      locality: '02, from the ZIP+4 file range 5000-8999 (the ZIP5 record names 01 and flags the ZIP)',
      needs: 'the SYNTHETIC ZIP+4 file and a second GPCI locality: release-synth-900006 adds them to release 900001',
    },
    outcome: {
      locality: '02, with the plus-four record and its range in the trace; recompute(trace) holds',
      withZipPlusFour0001: 'locality 01, the amount of the ZIP 00011',
      withoutZipPlusFour: 'ENGINE_ERROR locality_needs_zip_plus_four',
      withZipPlusFour9100: 'ENGINE_ERROR zip_plus_four_not_in_locality_map (no range lists it; never a guessed locality)',
    },
  });

export function prc19(b: CaseBuilder): void {
  const base = basics(b, 'P');
  remitWith(b, claimsOn(b, base, 'SYNPLAN-MA-NC', [[{ code: '97110', units: 2 }, { code: '97140' }], [{ code: '97530' }], [{ code: '97110' }]], '16'), 'Lines on the code whose relative value release 2 changes (97110) and on codes it does not.', base);
  b.scenario({ release: RELEASE, rerunRelease: 'a second SYNTHETIC release changing one 97110 relative value (fixtures/synthetic/rules)', ...MA });
  b.outcome({ diff: 'exactly the 97110 lines: claim 0 line 0 and claim 2 line 0' });
}
