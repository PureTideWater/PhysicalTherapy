import { randomUUID } from 'node:crypto';

import { withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { SYNTHETIC_PM_EXPORT_V1 } from '@tp/ledger';
import { cents, formatCents } from '@tp/money';
import fc from 'fast-check';

import { parseHandler } from '../../parse/job';
import type { Practice } from '../../price/test-support/pricing-world';
import type { Scope } from '../ledger';
import { reverseMatch } from '../manual';
import { setLedgerSettings } from '../settings';
import { LED_PLAN, LedgerWorld, ledSettings } from './ledger-world';

/**
 * CAS-49's generated worlds (SUITE-CAP-3 D13; docs/adr/0087): a practice's history and one pass of new evidence, built
 * through the job code (835s loaded by the parse job, priced under a signed-off fixed schedule, triaged into cases,
 * reconciled; exports staged as intake leaves them; a person's actions through the manual services), so every row the
 * pass reads is one the product wrote. Synthetic data only: every 835 is written here from LED-06's SYNTHETIC envelope,
 * every number says SYN, and every patient and claim number is invented per run.
 *
 * A world is drawn from a seed (fast-check) and holds, across its two or three cases, every shape section 7 of the
 * design names for CAS-49.1: corrections found by payer claim control number and claims found by patient control
 * number, a correction chain of three, reversals with and without their correction in the same remittance, a PLB WO
 * recoupment, a decrease taking an approval back, a payer response accepting an amount (confirmed, then paid) and
 * no-change reprocessings (the submission's response), claims of the same code and date for another patient, a
 * person's unmatch, a written-off line and a closed case, claim-level, line-level and partial check-level postings, EFT
 * deposits alone and batched, a claim-level PR (the patient's share), interest (AMT I and a PLB L6), each candidate
 * filter biting alone (the line's own remittance, a claim loaded before the line's, an 835 held for review, a reversal,
 * a claim already a case line, a case line with no service date), claims loaded in one transaction, a second practice
 * with the same numbers, export rows never matched and a posting match a person reversed, a claim reference naming
 * another remittance's claim, and a control-number candidate that pairs with no line beside a patient-number claim that
 * would pair (review round 3). The proof level is fixed by the run's index (review round 5): even runs stay at posted;
 * odd runs are raised to deposited after the history and before the pass, and hold a recovered line moved back with no
 * reversal (the proof-level note) and one whose deposit match a person reversed while its posting stood (the reversal
 * note).
 */

/** The schedule every case's code is priced at: 50.00 a unit, so a two-unit line is expected at 100.00. */
const CODES = ['97110', '97112', '97140'] as const;
/** A code no contract prices: a correction carrying it pairs with no case line. */
const UNPAIRED_CODE = '97530';

/** What a case line of the main case meets in the history and in the pass (several shapes per role). */
export type Role =
  | 'idle'
  | 'control'
  | 'patient'
  | 'patientTwice'
  | 'controlThenPatient'
  | 'unpairedControl'
  | 'patientShare'
  | 'interestAmt'
  | 'interestL6'
  | 'chainOfThree'
  | 'decrease'
  | 'noChange'
  | 'reversalAlone'
  | 'withholding'
  | 'unmatched'
  | 'writtenOff'
  | 'postClaim'
  | 'postLine'
  | 'postingReversed'
  | 'otherRemittanceReference'
  | 'ownRemittance'
  | 'loadedBefore'
  | 'held'
  | 'caseLineTwin'
  | 'otherPatient'
  | 'otherPractice'
  | 'noDate'
  | 'moveBackProof'
  | 'moveBackReversal';

/** Roles every world holds at least once (the raised runs add the two move-backs). */
const EVERY_WORLD: readonly Role[] = [
  'control',
  'patient',
  'patientTwice',
  'controlThenPatient',
  'unpairedControl',
  'patientShare',
  'interestAmt',
  'interestL6',
  'chainOfThree',
  'decrease',
  'noChange',
  'reversalAlone',
  'withholding',
  'unmatched',
  'writtenOff',
  'postClaim',
  'postLine',
  'postingReversed',
  'otherRemittanceReference',
  'ownRemittance',
  'loadedBefore',
  'held',
  'caseLineTwin',
  'otherPatient',
  'otherPractice',
  'noDate',
];
const RAISED_ONLY: readonly Role[] = ['moveBackProof', 'moveBackReversal'];
/** The roles the rest of the main case's lines are drawn from. */
const FILLER: readonly Role[] = ['idle', 'idle', 'control', 'control', 'patient', 'decrease', 'reversalAlone', 'postClaim', 'postLine', 'noChange', 'patientShare'];

export interface WorldPlan {
  readonly run: number;
  readonly seed: number;
  /** Even runs keep the product default (posted); odd runs raise it to deposited before the pass. */
  readonly raised: boolean;
  /** The main case's lines, by role, in the order they are numbered. */
  readonly roles: readonly Role[];
  /** The pass's checks (two to five). */
  readonly checks: number;
  /** Whether the closed case (a third code, every line written off) is in the world. */
  readonly closedCase: boolean;
  /** Lines of the responded case (the second code): a submission accepted in full, then confirmed or no change. */
  readonly respondedLines: number;
}

/** A world's plan from its seed: the run's index fixes the proof level, the seed draws the sizes and the roles. */
export function worldPlan(run: number, seed: number, size: { readonly min: number; readonly max: number } = { min: 40, max: 400 }): WorldPlan {
  const raised = run % 2 === 1;
  const fixed = [...EVERY_WORLD, ...(raised ? RAISED_ONLY : [])];
  const arbitrary = fc.record({
    total: fc.integer({ min: Math.max(size.min, fixed.length + 10), max: Math.max(size.max, fixed.length + 10) }),
    checks: fc.integer({ min: 2, max: 5 }),
    closedCase: fc.boolean(),
    respondedLines: fc.integer({ min: 3, max: 6 }),
    filler: fc.array(fc.constantFrom(...FILLER), { minLength: size.max, maxLength: size.max }),
    order: fc.array(fc.integer(), { minLength: size.max + fixed.length, maxLength: size.max + fixed.length }),
  });
  const [drawn] = fc.sample(arbitrary, { seed, numRuns: 1 });
  if (drawn === undefined) {
    throw new Error('the generator drew no world');
  }
  const extra = drawn.total - fixed.length - drawn.respondedLines - (drawn.closedCase ? 3 : 0);
  const pool = [...fixed, ...drawn.filler.slice(0, Math.max(extra, 0))];
  // A seeded shuffle, so a role's line number (and so its claims' load order) differs between worlds.
  const keyed = pool.map((role, index) => ({ role, key: drawn.order[index] ?? index, index }));
  keyed.sort((a, b) => a.key - b.key || a.index - b.index);
  return { run, seed, raised, roles: keyed.map((item) => item.role), checks: drawn.checks, closedCase: drawn.closedCase, respondedLines: drawn.respondedLines };
}

// ---------------------------------------------------------------------------------------------------------------------
// 835 text (LED-06's SYNTHETIC envelope and header)
// ---------------------------------------------------------------------------------------------------------------------

interface LineText {
  readonly code: string;
  /** Null: no DTM 472 (the claim's statement dates carry the service). */
  readonly date: string | null;
  readonly chargeCents: bigint;
  readonly paidCents: bigint;
  readonly allowedCents: bigint;
}

interface ClaimText {
  readonly pcn: string;
  readonly ccn: string;
  /** 1 an original or correction, 22 a reversal (its amounts negated here). */
  readonly status: '1' | '22';
  readonly lines: readonly LineText[];
  /** The claim it corrects (REF F8). */
  readonly corrects?: string;
  /** A claim-level PR (the patient's share), taken from CLP04. */
  readonly patientShareCents?: bigint;
  /** AMT I: interest the payer paid on the claim. */
  readonly interestCents?: bigint;
  readonly member: string;
}

interface CheckText {
  readonly trace: string;
  readonly paidOn: string;
  readonly claims: readonly ClaimText[];
  /** PLB items: WO (a recoupment, positive) or L6 (interest, negative), each naming a payer claim control number. */
  readonly adjustments?: readonly { readonly code: 'WO' | 'L6'; readonly reference: string; readonly amountCents: bigint }[];
}

/** Dollars as the 835 and the exports write them, formatted from integer cents (never through a float; CLAUDE.md rule 2). */
const money = (amountCents: bigint) => formatCents(cents(amountCents));
const x12Date = (date: string) => date.replaceAll('-', '');

function claimSegments(claim: ClaimText): string[] {
  const sign = claim.status === '22' ? -1n : 1n;
  const charge = claim.lines.reduce((sum, line) => sum + line.chargeCents, 0n);
  const linesPaid = claim.lines.reduce((sum, line) => sum + line.paidCents, 0n);
  const share = claim.patientShareCents ?? 0n;
  // AMT I is reported beside CLP04, never in it (LED-16's two-lines-adjusted.835).
  const paid = linesPaid - share;
  const frequency = claim.status === '22' ? '8' : claim.corrects === undefined ? '1' : '7';
  const datesOf = claim.lines.map((line) => line.date).filter((date): date is string => date !== null);
  const statement = claim.lines.some((line) => line.date === null) ? (datesOf[0] ?? '2026-03-02') : null;
  return [
    `CLP*${claim.pcn}*${claim.status}*${money(sign * charge)}*${money(sign * paid)}*${money(sign * share)}*12*${claim.ccn}*11*${frequency}`,
    ...(share === 0n ? [] : [`CAS*PR*1*${money(sign * share)}`]),
    `NM1*QC*1*SYNTHLASTQ*SYNTHFIRSTQ****MI*${claim.member}`,
    'NM1*82*1*SYNTHPTJSF3*SYNTHETIC****XX*9923720335',
    `REF*CE*${LED_PLAN.slice(3)}`,
    ...(claim.corrects === undefined ? [] : [`REF*F8*${claim.corrects}`]),
    ...(statement === null ? [] : [`DTM*232*${x12Date(statement)}`, `DTM*233*${x12Date(statement)}`]),
    ...(claim.interestCents === undefined ? [] : [`AMT*I*${money(sign * claim.interestCents)}`]),
    ...claim.lines.flatMap((line) => [
      `SVC*HC:${line.code}*${money(sign * line.chargeCents)}*${money(sign * line.paidCents)}**2`,
      ...(line.date === null ? [] : [`DTM*472*${x12Date(line.date)}`]),
      `CAS*CO*45*${money(sign * (line.chargeCents - line.paidCents))}`,
      `AMT*B6*${money(sign * line.allowedCents)}`,
    ]),
  ];
}

/** BPR02 of a check: its claims' CLP04 less its PLB amounts. */
function checkPayment(check: CheckText): bigint {
  const claims = check.claims.reduce((sum, claim) => {
    const sign = claim.status === '22' ? -1n : 1n;
    const linesPaid = claim.lines.reduce((inner, line) => inner + line.paidCents, 0n);
    return sum + sign * (linesPaid - (claim.patientShareCents ?? 0n));
  }, 0n);
  return claims - (check.adjustments ?? []).reduce((sum, item) => sum + item.amountCents, 0n);
}

/** One interchange of one transaction per check, from LED-06's SYNTHETIC envelope. */
function interchange(control: number, checks: readonly CheckText[]): Buffer {
  const isa13 = String(control).padStart(9, '0');
  const gs06 = String(control);
  const transactions = checks.flatMap((check, index) => {
    const st02 = String(index + 1).padStart(4, '0');
    const date = x12Date(check.paidOn);
    const body = [
      `ST*835*${st02}`,
      `BPR*C*${money(checkPayment(check))}*C*ACH*CCP*01*991731009*DA*SYNACCT840590*1SYN00000L**01*995115309*DA*SYNACCT302747*${date}`,
      `TRN*1*${check.trace}*1SYN00000L`,
      `DTM*405*${date}`,
      'N1*PR*SYNTHETIC PAYER L',
      'N3*782 SYNTHETIC PAYER WAY',
      'N4*SYNTHVILLE*NC*00013',
      'REF*2U*SYNPAYERL',
      'PER*BL*SYNTHETIC EDI HELP DESK*TE*5555550709',
      'N1*PE*SYNTHETIC THERAPY GROUP 01*XX*9987349542',
      'N3*235 SYNTHETIC CLINIC ROAD',
      'N4*SYNTHTOWN*NC*00011',
      'REF*TJ*999053678',
      'LX*1',
      ...check.claims.flatMap(claimSegments),
      ...(check.adjustments === undefined || check.adjustments.length === 0
        ? []
        : [`PLB*9987349542*20261231*${check.adjustments.map((item) => `${item.code}:${item.reference}*${money(item.amountCents)}`).join('*')}`]),
    ];
    return [...body, `SE*${String(body.length + 1)}*${st02}`];
  });
  const segments = [
    `ISA*00*          *00*          *ZZ*SYNTHSENDER    *ZZ*SYNTHRECEIVER  *260406*0915*^*00501*${isa13}*0*T*:`,
    `GS*HP*SYNTH*SYNTHRCV*20260406*0915*${gs06}*X*005010X221A1`,
    ...transactions,
    `GE*${String(checks.length)}*${gs06}`,
    `IEA*1*${isa13}`,
  ];
  return Buffer.from(`${segments.join('~\n')}~\n`, 'latin1');
}

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

interface PostingRowText {
  readonly postedOn: string;
  readonly trace: string;
  readonly reference?: string;
  readonly code?: string;
  readonly date?: string;
  readonly amountCents: bigint;
}

/** A posting export in the SYNTHETIC PM EXPORT v1 template (LED-06's header). */
function postingExport(rows: readonly PostingRowText[]): Buffer {
  const header = 'Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch,Payee ID';
  const lines = rows.map((row) => `${usDate(row.postedOn)},${row.trace},SYNTHETIC PAYER L,${row.reference ?? ''},${row.code ?? ''},${row.date === undefined ? '' : usDate(row.date)},${money(row.amountCents)},SYNBATCH-Q,SYNTHSENDER`);
  return Buffer.from(`${[header, ...lines].join('\r\n')}\r\n`, 'utf8');
}

interface EftRowText {
  readonly depositedOn: string;
  readonly trace: string;
  readonly amountCents: bigint;
  readonly batch?: string;
}

/** A bank's EFT export (LED-05's layout). */
function eftExport(rows: readonly EftRowText[]): Buffer {
  const header = 'Date,Description,Trace Number,Amount,Batch Reference,Originator ID';
  const lines = rows.map((row) => `${row.depositedOn},SYNTHETIC PAYER L HCCLAIMPMT,${row.trace},${money(row.amountCents)},${row.batch ?? ''},SYNTHSENDER`);
  return Buffer.from(`${[header, ...lines].join('\r\n')}\r\n`, 'utf8');
}

// ---------------------------------------------------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------------------------------------------------

/** A case line of the world: its numbers, code and date, and the role it plays. */
export interface PlannedLine {
  readonly n: number;
  readonly role: Role | 'responded' | 'closed';
  readonly code: string;
  readonly date: string | null;
  readonly pcn: string;
  readonly ccn: string;
  readonly member: string;
}

/** A world built up to the pass: its database, the practice, and what the pass will find waiting. */
export interface BuiltWorld {
  readonly plan: WorldPlan;
  readonly world: LedgerWorld;
  readonly practice: Practice;
  readonly lines: readonly PlannedLine[];
  /** The pass's checks: each one's trace and payment. */
  readonly passChecks: readonly { readonly trace: string; readonly paymentCents: bigint }[];
}

const ORIGINAL_PAID_CENTS = 7000n;
const EXPECTED_CENTS = 10000n;
const CHARGE_CENTS = 15000n;

const line = (code: string, date: string | null, paidCents: bigint, chargeCents = CHARGE_CENTS): LineText => ({ code, date, chargeCents, paidCents, allowedCents: paidCents });

/** Builds the plan's world through the job code, up to (not including) the measured pass. */
export async function buildWorld(adminUrl: string, plan: WorldPlan): Promise<BuiltWorld> {
  const w = await LedgerWorld.open(adminUrl);
  try {
    return await build(w, plan);
  } catch (error) {
    await w.close();
    throw error;
  }
}

async function build(w: LedgerWorld, plan: WorldPlan): Promise<BuiltWorld> {
  const tag = `${String(plan.run).padStart(2, '0')}`;
  const practice = await w.practice(`CAS-49 run ${tag} ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
  await w.manual(practice, async ({ scope }) => {
    await setLedgerSettings(scope, { practiceId: practice.practiceId, proofLevel: 'posted', postingTemplate: SYNTHETIC_PM_EXPORT_V1, requestId: `test-${randomUUID()}` });
  }, practice.world.adminUserId);
  const parse = parseHandler(w.triage.pricing.parseServices);
  let control = 490_000_000 + plan.run * 1_000;
  const load = async (target: Practice, checks: readonly CheckText[]) => {
    control += 1;
    const documentId = await w.triage.pricing.stage(target, 'CAS-49/generated.835', interchange(control, checks));
    await parse({ practice_id: target.practiceId, document_id: documentId }, w.jobContext(target));
  };

  // The case lines: the main case on the first code, the responded case on the second, the closed case on the third.
  const lines: PlannedLine[] = [];
  const add = (role: PlannedLine['role'], code: string, date: string | null) => {
    const n = lines.length + 1;
    const number = `${tag}${String(n).padStart(4, '0')}`;
    lines.push({ n, role, code, date, pcn: `SYNPCNQ${number}`, ccn: `SYNCCNQ${number}`, member: `SYNMBRQ${number}` });
  };
  const dayOf = (n: number) => `2026-03-${String(2 + (n % 25)).padStart(2, '0')}`;
  for (const role of plan.roles) {
    add(role, CODES[0], role === 'noDate' ? null : dayOf(lines.length + 1));
  }
  for (let index = 0; index < plan.respondedLines; index += 1) {
    add('responded', CODES[1], dayOf(lines.length + 1));
  }
  if (plan.closedCase) {
    for (let index = 0; index < 3; index += 1) {
      add('closed', CODES[2], dayOf(lines.length + 1));
    }
  }
  const byRole = (role: PlannedLine['role']) => lines.filter((item) => item.role === role);
  const one = (role: Role) => byRole(role)[0] as PlannedLine;
  const original = (item: PlannedLine, paidCents = ORIGINAL_PAID_CENTS): ClaimText => ({ pcn: item.pcn, ccn: item.ccn, status: '1', member: item.member, lines: [line(item.code, item.date, paidCents)] });
  const reversal = (item: PlannedLine, ccn: string, paidCents: bigint): ClaimText => ({ pcn: item.pcn, ccn, status: '22', member: item.member, lines: [line(item.code, item.date, paidCents)] });
  const correction = (item: PlannedLine, suffix: string, paidCents: bigint, corrects = item.ccn, code = item.code): ClaimText => ({
    pcn: item.pcn,
    ccn: `${item.ccn}${suffix}`,
    status: '1',
    member: item.member,
    corrects,
    lines: [line(code, item.date, paidCents)],
  });
  /** A claim of the line's patient, code and date under a new payer claim control number: found by patient control number only. */
  const patientClaim = (item: PlannedLine, suffix: string, paidCents: bigint): ClaimText => ({ pcn: item.pcn, ccn: `SYNCCNP${item.ccn.slice(7)}${suffix}`, status: '1', member: item.member, lines: [line(item.code, item.date, paidCents)] });

  // Before the originals: a claim of one line's patient, code and date, paid in full (loaded before the line's claim).
  await load(practice, [{ trace: `SYNEFTQ${tag}PRIOR`, paidOn: '2026-03-30', claims: [patientClaim(one('loadedBefore'), 'B', EXPECTED_CENTS)] }]);

  // The originals, in one file of two checks (one transaction, so one created_at): the case-line twin's second claim
  // and the other patient's claim of a line's code and date are in the second check; the own-remittance claim beside
  // its line's in the first. Each paid in full is priced at no shortfall and is never a case line.
  const twin = one('caseLineTwin');
  const otherPatient = one('otherPatient');
  const ownRemittance = one('ownRemittance');
  const firstCheck = lines.map((item) => original(item));
  firstCheck.push({ ...patientClaim(ownRemittance, 'O', EXPECTED_CENTS) });
  const secondCheck: ClaimText[] = [
    { pcn: twin.pcn, ccn: `${twin.ccn}T`, status: '1', member: twin.member, lines: [line(twin.code, twin.date, ORIGINAL_PAID_CENTS)] },
    { pcn: `SYNPCNX${otherPatient.pcn.slice(7)}`, ccn: `SYNCCNX${otherPatient.ccn.slice(7)}`, status: '1', member: `SYNMBRX${otherPatient.member.slice(7)}`, lines: [line(otherPatient.code, otherPatient.date, EXPECTED_CENTS)] },
  ];
  await load(practice, [
    { trace: `SYNEFTQ${tag}ORIG1`, paidOn: '2026-04-06', claims: firstCheck },
    { trace: `SYNEFTQ${tag}ORIG2`, paidOn: '2026-04-06', claims: secondCheck },
  ]);
  const contract = await w.triage.fixedContract(practice, { schedule: CODES.map((code) => ({ code, amountCents: '5000' })), effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
  const runId = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
  await w.triage.triage(practice, runId);

  // Each planned line's case line (the twin's second claim is a case line of its own, read by its claim's number).
  const caseLines = await caseLinesOf(w, practice);
  const serviceLineOf = (item: PlannedLine): string => {
    const found = caseLines.find((row) => row.pcn === item.pcn && row.claimCcn === item.ccn);
    if (found === undefined) {
      throw new Error(`a planned line (${item.role}) was not triaged into a case`);
    }
    return found.serviceLineId;
  };
  const caseOf = (item: PlannedLine): string => caseLines.find((row) => row.serviceLineId === serviceLineOf(item))?.caseId as string;
  const present = (role: Role) => byRole(role);

  // The history: an approving remittance (H1) for the lines whose pass takes an approval back, posts or reverses, and
  // one of its own (H2) for the line whose deposit a person reverses; then exports of postings and deposits, among them
  // rows that match nothing, reconciled; then a person's unmatches and write-offs, and the responded case's packet.
  const approvedInHistory: Role[] = ['decrease', 'reversalAlone', 'withholding', 'chainOfThree', 'postLine', 'postingReversed', 'moveBackProof'];
  const h1: ClaimText[] = [];
  for (const role of approvedInHistory) {
    for (const item of present(role)) {
      h1.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'A', EXPECTED_CENTS));
    }
  }
  for (const item of present('unmatched')) {
    h1.push(patientClaim(item, 'U', EXPECTED_CENTS));
  }
  const h2 = present('moveBackReversal').flatMap((item) => [reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'A', EXPECTED_CENTS)]);
  const historyChecks: CheckText[] = [{ trace: `SYNEFTQ${tag}HIST1`, paidOn: '2026-05-11', claims: h1 }, ...(h2.length === 0 ? [] : [{ trace: `SYNEFTQ${tag}HIST2`, paidOn: '2026-05-12', claims: h2 }])];
  await load(practice, historyChecks);
  const historyPostings: PostingRowText[] = [
    ...present('postingReversed').map((item) => ({ postedOn: '2026-05-14', trace: `SYNEFTQ${tag}HIST1`, reference: item.pcn, amountCents: EXPECTED_CENTS })),
    ...present('moveBackProof').map((item) => ({ postedOn: '2026-05-14', trace: `SYNEFTQ${tag}HIST1`, reference: item.pcn, code: item.code, date: item.date as string, amountCents: EXPECTED_CENTS })),
    ...present('moveBackReversal').map((item) => ({ postedOn: '2026-05-14', trace: `SYNEFTQ${tag}HIST2`, reference: item.pcn, code: item.code, date: item.date as string, amountCents: EXPECTED_CENTS })),
    // A row of a check that never arrives: never matched, read again by every pass.
    { postedOn: '2026-05-14', trace: `SYNEFTQ${tag}NEVER`, amountCents: 1234n },
  ];
  const historyDeposits: EftRowText[] = [
    ...(h2.length === 0 ? [] : [{ depositedOn: '2026-05-13', trace: `SYNEFTQ${tag}HIST2`, amountCents: checkPayment(historyChecks[1] as CheckText) }]),
    { depositedOn: '2026-05-13', trace: `SYNEFTQ${tag}NEVER`, amountCents: 4321n },
  ];
  await w.stageExport(practice, 'CAS-49/history-postings.csv', 'posting_export', postingExport(historyPostings));
  await w.stageExport(practice, 'CAS-49/history-deposits.csv', 'eft_export', eftExport(historyDeposits));
  await w.reconcile(practice);

  const matchOf = async (sql: string, values: unknown[]): Promise<string> => {
    const [row] = await w.rows<{ id: string }>(practice, sql, values);
    if (row === undefined) {
      throw new Error('the history wrote no match the world expected');
    }
    return row.id;
  };
  for (const item of present('unmatched')) {
    await unmatch(w, practice, await matchOf("SELECT id FROM ledger_match WHERE kind = 'claim' AND service_line_id = $1 AND reversed_at IS NULL", [serviceLineOf(item)]));
  }
  for (const item of present('postingReversed')) {
    await unmatch(w, practice, await matchOf("SELECT m.id FROM ledger_match m JOIN ledger_entry e ON e.match_id = m.id WHERE m.kind = 'posting' AND e.service_line_id = $1 AND m.reversed_at IS NULL", [serviceLineOf(item)]));
  }
  for (const item of present('moveBackReversal')) {
    await unmatch(w, practice, await matchOf("SELECT m.id FROM ledger_match m JOIN ledger_entry e ON e.match_id = m.id WHERE m.kind = 'deposit' AND e.service_line_id = $1 AND m.reversed_at IS NULL", [serviceLineOf(item)]));
  }
  await writeOff(w, practice, [...present('writtenOff'), ...byRole('closed')].map(serviceLineOf));
  const responded = byRole('responded');
  const submitted = responded.length === 0 ? null : await w.submit(practice, caseOf(responded[0] as PlannedLine), '2026-05-20');
  if (submitted !== null) {
    // Accepted after the history's last reconcile: the pass approves it, and a remittance in the same pass confirms it.
    await w.respond(practice, submitted.submissionId, { kind: 'accepted', amountCents: (EXPECTED_CENTS - ORIGINAL_PAID_CENTS) * BigInt(responded.length), receivedOn: '2026-05-25' });
  }
  if (plan.raised) {
    await w.manual(practice, async ({ scope }) => {
      await setLedgerSettings(scope, { practiceId: practice.practiceId, proofLevel: 'deposited', requestId: `test-${randomUUID()}` });
    }, practice.world.adminUserId);
  }

  // The pass's new evidence: one file of `checks` checks (one transaction, so its claims share one created_at), an 835
  // held for review, the second practice's claim, and the exports of postings and deposits.
  const passChecks: ClaimText[][] = Array.from({ length: plan.checks }, () => []);
  const plb: { code: 'WO' | 'L6'; reference: string; amountCents: bigint }[][] = Array.from({ length: plan.checks }, () => []);
  const last = plan.checks - 1;
  // The first check holds only lines approved in it with no other posting, so its partial postings are capped by nothing.
  const firstOnly = new Set<Role>(['control', 'patientShare', 'interestAmt']);
  let spread = 0;
  const elsewhere = () => 1 + (spread++ % Math.max(plan.checks - 1, 1));
  const at = (index: number) => passChecks[Math.min(index, last)] as ClaimText[];
  const passPostings: PostingRowText[] = [];
  for (const item of lines) {
    const role = item.role;
    const into = role !== 'responded' && role !== 'closed' && firstOnly.has(role) ? at(0) : at(elsewhere());
    switch (role) {
      case 'control':
      case 'writtenOff':
      case 'closed':
      case 'postClaim':
      case 'otherRemittanceReference':
        into.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'C', EXPECTED_CENTS));
        break;
      case 'patient':
        into.push(patientClaim(item, 'P', EXPECTED_CENTS));
        break;
      case 'noDate':
        into.push(patientClaim(item, 'P', EXPECTED_CENTS));
        break;
      case 'patientTwice':
        into.push(patientClaim(item, 'P', EXPECTED_CENTS), patientClaim(item, 'Q', EXPECTED_CENTS + 500n));
        break;
      case 'controlThenPatient':
        at(0).push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'C', EXPECTED_CENTS));
        at(1).push(patientClaim(item, 'P', EXPECTED_CENTS + 1000n));
        break;
      case 'unpairedControl':
        // A correction whose code the payer changed: found by control number, pairs with no line; the patient's claim beside it would pair.
        at(0).push(correction(item, 'Z', EXPECTED_CENTS, item.ccn, UNPAIRED_CODE));
        at(1).push(patientClaim(item, 'P', EXPECTED_CENTS));
        break;
      case 'patientShare':
        into.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), { ...correction(item, 'C', EXPECTED_CENTS), patientShareCents: 1000n });
        break;
      case 'interestAmt':
        into.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), { ...correction(item, 'C', EXPECTED_CENTS), interestCents: 500n });
        break;
      case 'interestL6':
        into.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'C', EXPECTED_CENTS));
        (plb[1 % plan.checks] as { code: 'WO' | 'L6'; reference: string; amountCents: bigint }[]).push({ code: 'L6', reference: `${item.ccn}C`, amountCents: -500n });
        break;
      case 'chainOfThree':
        into.push(reversal(item, `${item.ccn}A`, EXPECTED_CENTS), correction(item, 'B', EXPECTED_CENTS + 1000n, `${item.ccn}A`));
        break;
      case 'decrease':
        into.push(reversal(item, `${item.ccn}A`, EXPECTED_CENTS), correction(item, 'B', EXPECTED_CENTS - 2000n, `${item.ccn}A`));
        break;
      case 'noChange':
        into.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'C', ORIGINAL_PAID_CENTS));
        break;
      case 'responded':
        into.push(reversal(item, item.ccn, ORIGINAL_PAID_CENTS), correction(item, 'C', item.n % 2 === 0 ? ORIGINAL_PAID_CENTS : EXPECTED_CENTS));
        break;
      case 'reversalAlone':
        into.push(reversal(item, `${item.ccn}A`, EXPECTED_CENTS));
        break;
      case 'withholding':
        (plb[1 % plan.checks] as { code: 'WO' | 'L6'; reference: string; amountCents: bigint }[]).push({ code: 'WO', reference: `${item.ccn}A`, amountCents: 1000n });
        break;
      case 'idle':
      case 'unmatched':
      case 'postLine':
      case 'postingReversed':
      case 'moveBackProof':
      case 'moveBackReversal':
      case 'ownRemittance':
      case 'loadedBefore':
      case 'held':
      case 'caseLineTwin':
      case 'otherPatient':
      case 'otherPractice':
        // Nothing new of their own in the pass's checks: their history, exports or filter-biting claims are elsewhere.
        break;
    }
  }
  // A check that holds only take-backs would pay nothing: each such check also pays another patient's claim in full, on
  // a date no case line has (read by nobody's search).
  for (const [index, claims] of passChecks.entries()) {
    const paying = { trace: '', paidOn: '', claims, adjustments: plb[index] ?? [] };
    const short = checkPayment(paying);
    if (short <= 0n) {
      const number = `${tag}F${String(index + 1)}`;
      const paid = EXPECTED_CENTS - short;
      claims.push({ pcn: `SYNPCNF${number}`, ccn: `SYNCCNF${number}`, status: '1', member: `SYNMBRF${number}`, lines: [line(CODES[0], '2026-03-31', paid, paid + CHARGE_CENTS)] });
    }
  }
  const passTrace = (index: number) => `SYNEFTQ${tag}PASS${String(index + 1)}`;
  const checkTexts: CheckText[] = passChecks.map((claims, index) => ({
    trace: passTrace(index),
    paidOn: `2026-06-${String(8 + index).padStart(2, '0')}`,
    claims,
    adjustments: plb[index] ?? [],
  }));
  await load(practice, checkTexts);
  const traceOfClaim = (ccn: string) => passTrace(checkTexts.findIndex((check) => check.claims.some((claim) => claim.ccn === ccn)));
  // An 835 held for review (docs/adr/0060: the payment was first loaded from an ERA export of another payer): loaded,
  // then marked held as the loader marks it, as a superuser, since only that export's path makes the state.
  const held = present('held');
  await load(practice, [{ trace: `SYNEFTQ${tag}HELD`, paidOn: '2026-06-07', claims: held.map((item) => patientClaim(item, 'H', EXPECTED_CENTS)) }]);
  await w.superuser("UPDATE remittance SET status = 'held', held_reason = 'export_payment_other_payer' WHERE practice_id = $1 AND trn02 = $2", [practice.practiceId, `SYNEFTQ${tag}HELD`]);
  // A case line with no service date (design section 7: the patient search's IS NOT DISTINCT FROM branch). The parser
  // never writes one: a line with no DTM 472 takes the claim's statement dates (edi835 lineDates), so the noDate line
  // and its patient-number claim in the pass are written with statement dates only, and their service lines' dates
  // are then cleared as a superuser, as the held 835's state is made above, leaving claim.service_from set, which the
  // pricing already read (PRICEABLE_LINE's coalesce(l.service_date, c.service_from) gives the same date either way).
  // A state the pass reads but today's parser never writes: the one row the world sets by hand (slice 1's verification).
  const noDate = new Set(present('noDate').map((item) => item.pcn));
  const datelessClaims = (await claimsOf(w, practice)).filter((claim) => noDate.has(claim.pcn)).map((claim) => claim.id);
  if (datelessClaims.length < 2 * noDate.size) {
    throw new Error('the noDate lines lack their claims');
  }
  await w.superuser('UPDATE service_line SET service_date = NULL, service_date_to = NULL WHERE practice_id = $1 AND claim_id = ANY ($2::uuid[])', [practice.practiceId, datelessClaims]);
  const otherPractice = await w.practice(`CAS-49 run ${tag} other ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
  await load(otherPractice, [{ trace: `SYNEFTQ${tag}OTHER`, paidOn: '2026-06-08', claims: present('otherPractice').map((item) => patientClaim(item, 'P', EXPECTED_CENTS)) }]);

  // Postings: two partial check-level rows of the first check (no claim reference), a claim-level and a line-level row,
  // and a claim-level row naming a claim of another check than its own.
  // Two amounts that split no line's share evenly, so the cents each row takes depend on which is posted first (5.2).
  const firstPayment = checkPayment(checkTexts[0] as CheckText);
  // Bigint division truncates, which is the floor on the positive payment it is taken of.
  if (firstPayment > 100n) {
    const third = firstPayment / 3n + 7n;
    const quarter = firstPayment / 4n + 3n;
    passPostings.push({ postedOn: '2026-06-12', trace: passTrace(0), amountCents: third }, { postedOn: '2026-06-12', trace: passTrace(0), amountCents: quarter });
  }
  for (const item of present('postClaim')) {
    passPostings.push({ postedOn: '2026-06-12', trace: traceOfClaim(`${item.ccn}C`), reference: item.pcn, amountCents: EXPECTED_CENTS });
  }
  for (const item of present('postLine')) {
    passPostings.push({ postedOn: '2026-06-12', trace: `SYNEFTQ${tag}HIST1`, reference: item.pcn, code: item.code, date: item.date as string, amountCents: EXPECTED_CENTS });
  }
  for (const item of present('otherRemittanceReference')) {
    passPostings.push({ postedOn: '2026-06-12', trace: traceOfClaim(`${item.ccn}C`) === passTrace(0) ? passTrace(1) : passTrace(0), reference: item.pcn, amountCents: EXPECTED_CENTS });
  }
  // Deposits: the first check alone, the rest in one bank batch.
  const passDeposits: EftRowText[] = checkTexts.map((check, index) => ({
    depositedOn: '2026-06-11',
    trace: check.trace,
    amountCents: checkPayment(check),
    ...(index === 0 || checkTexts.length < 3 ? {} : { batch: 'SYNBATCHQ' }),
  }));
  await w.stageExport(practice, 'CAS-49/pass-postings.csv', 'posting_export', postingExport(passPostings));
  await w.stageExport(practice, 'CAS-49/pass-deposits.csv', 'eft_export', eftExport(passDeposits));

  return { plan, world: w, practice, lines, passChecks: checkTexts.map((check) => ({ trace: check.trace, paymentCents: checkPayment(check) })) };
}

/** The practice's case lines with their claims' patient control numbers (decrypted in memory, never logged). */
export async function caseLinesOf(w: LedgerWorld, practice: Practice): Promise<{ readonly caseId: string; readonly serviceLineId: string; readonly pcn: string; readonly claimCcn: string; readonly code: string }[]> {
  const rows = await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query<{ case_id: string; service_line_id: string; pcn: string; ccn: string; code: string }>(
      `SELECT cl.case_id, cl.service_line_id, c.patient_control_number AS pcn, c.payer_claim_control_number AS ccn, l.procedure_code AS code
         FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id JOIN claim c ON c.id = l.claim_id WHERE cl.practice_id = $1`,
      [practice.practiceId],
    ),
  );
  return rows.rows.map((row) => ({
    caseId: row.case_id,
    serviceLineId: row.service_line_id,
    pcn: practice.cipher.decrypt('claim.patient_control_number', row.pcn),
    claimCcn: practice.cipher.decrypt('claim.payer_claim_control_number', row.ccn),
    code: row.code,
  }));
}

/** The practice's claims with their patient control numbers (decrypted in memory, never logged). */
async function claimsOf(w: LedgerWorld, practice: Practice): Promise<{ readonly id: string; readonly pcn: string }[]> {
  const rows = await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query<{ id: string; pcn: string }>('SELECT c.id, c.patient_control_number AS pcn FROM claim c WHERE c.practice_id = $1', [practice.practiceId]),
  );
  return rows.rows.map((row) => ({ id: row.id, pcn: practice.cipher.decrypt('claim.patient_control_number', row.pcn) }));
}

/** Reverses a match as the billing manager, with a reason (a person's unmatch). */
export async function unmatch(w: LedgerWorld, practice: Practice, matchId: string): Promise<void> {
  await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId, reason: 'SYNTHETIC: matched to the wrong line' }));
}

/** Writes off case lines as the billing manager (the Triage page's write-off), in the request's scope. */
export async function writeOff(w: LedgerWorld, practice: Practice, serviceLineIds: readonly string[]): Promise<void> {
  await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    (scope as Scope).client.query("UPDATE case_line SET written_off_reason = 'not_worth_pursuit', written_off_by = app_actor_id() WHERE service_line_id = ANY ($1::uuid[])", [serviceLineIds]),
  );
}

export { checkPayment, eftExport, interchange, postingExport };
export type { CheckText, ClaimText, EftRowText, PostingRowText };
