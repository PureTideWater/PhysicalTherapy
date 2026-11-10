import { randomUUID } from 'node:crypto';

import { SYNTHETIC_PM_EXPORT_V1 } from '@tp/ledger';

import type { JobContext } from '../../jobs/handlers';
import type { Practice } from '../../price/test-support/pricing-world';
import { reconcilePractice } from '../pass';
import { setLedgerSettings } from '../settings';
import { LED_PLAN, LedgerWorld, ledSettings } from './ledger-world';
import { type CheckText, type ClaimText, caseLinesOf, checkPayment, eftExport, line, loadChecks, postingExport, writeOff } from './pass-world';

/**
 * CAS-49.3's and CAS-49.6's fixed worlds (SUITE-CAP-3 D3; design section 7; docs/adr/0087): a few case lines of one case,
 * built through the job code as CAS-49.1's generated worlds are (835s from LED-06's SYNTHETIC envelope loaded by the
 * parse job, priced under a signed-off fixed schedule, triaged, reconciled; exports staged as intake leaves them; a
 * person's write-off as the Triage page writes it). Synthetic data only: every number says SYN and is invented here.
 */

const CODE = '97110';
const ORIGINAL_PAID_CENTS = 7000n;
const EXPECTED_CENTS = 10000n;

/** A planned case line: its claim's numbers and its service date. */
interface Planned {
  readonly key: string;
  readonly pcn: string;
  readonly ccn: string;
  readonly member: string;
  readonly date: string;
}

/** A case line of a fixed world. */
export interface FixedLine {
  readonly serviceLineId: string;
  readonly caseLineId: string;
  readonly caseId: string;
}

const original = (item: Planned): ClaimText => ({ pcn: item.pcn, ccn: item.ccn, status: '1', member: item.member, lines: [line(CODE, item.date, ORIGINAL_PAID_CENTS)] });
const reversal = (item: Planned): ClaimText => ({ pcn: item.pcn, ccn: item.ccn, status: '22', member: item.member, lines: [line(CODE, item.date, ORIGINAL_PAID_CENTS)] });
const correction = (item: Planned): ClaimText => ({ pcn: item.pcn, ccn: `${item.ccn}A`, status: '1', member: item.member, corrects: item.ccn, lines: [line(CODE, item.date, EXPECTED_CENTS)] });
/** A claim of the line's patient, code and date under a new payer claim control number: found by patient control number only. */
const patientClaim = (item: Planned): ClaimText => ({ pcn: item.pcn, ccn: `SYNCCNP${item.ccn.slice(7)}`, status: '1', member: item.member, lines: [line(CODE, item.date, EXPECTED_CENTS)] });
/** A line-level posting row of `trace` for the line's full expected amount. */
const posting = (item: Planned, trace: string) => ({ postedOn: '2026-06-12', trace, reference: item.pcn, code: CODE, date: item.date, amountCents: EXPECTED_CENTS });

/** A practice at the posted proof level with one case of the planned lines (one code, so one case), priced and triaged. */
async function start(w: LedgerWorld, label: string, tag: string, keys: readonly string[]): Promise<{ practice: Practice; planned: Map<string, Planned>; lines: Map<string, FixedLine>; load: (checks: readonly CheckText[]) => Promise<void> }> {
  const practice = await w.practice(`${label} ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
  await w.manual(practice, async ({ scope }) => {
    await setLedgerSettings(scope, { practiceId: practice.practiceId, proofLevel: 'posted', postingTemplate: SYNTHETIC_PM_EXPORT_V1, requestId: `test-${randomUUID()}` });
  }, practice.world.adminUserId);
  let control = 497_000_000;
  const load = async (checks: readonly CheckText[]) => {
    control += 1;
    await loadChecks(w, practice, control, checks);
  };
  const planned = new Map(
    keys.map((key, index) => {
      const number = `${tag}${String(index + 1).padStart(4, '0')}`;
      return [key, { key, pcn: `SYNPCNS${number}`, ccn: `SYNCCNS${number}`, member: `SYNMBRS${number}`, date: `2026-03-${String(2 + index).padStart(2, '0')}` }];
    }),
  );
  await load([{ trace: `SYNEFTS${tag}ORIG`, paidOn: '2026-04-06', claims: [...planned.values()].map(original) }]);
  const contract = await w.triage.fixedContract(practice, { schedule: [{ code: CODE, amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
  const runId = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
  await w.triage.triage(practice, runId);
  const triaged = await caseLinesOf(w, practice);
  const ids = await w.rows<{ id: string; service_line_id: string }>(practice, 'SELECT id, service_line_id FROM case_line');
  const lines = new Map<string, FixedLine>();
  for (const item of planned.values()) {
    const found = triaged.find((row) => row.pcn === item.pcn && row.claimCcn === item.ccn);
    const caseLineId = ids.find((row) => row.service_line_id === found?.serviceLineId)?.id;
    if (found === undefined || caseLineId === undefined) {
      throw new Error('a planned line was not triaged into a case');
    }
    lines.set(item.key, { serviceLineId: found.serviceLineId, caseLineId, caseId: found.caseId });
  }
  return { practice, planned, lines, load };
}

/**
 * The job context with every stage event the pass would write dropped (the statement answers as if it wrote nothing):
 * the ledger then stands ahead of the lines' stages, which a real pass reaches only inside its own transaction, between
 * its entries and its stage sync. CAS-49.3's setup only; never a product path.
 */
function withoutStageEvents(context: JobContext): JobContext {
  return {
    ...context,
    transaction: (run) =>
      context.transaction((scope) => {
        const client = scope.client;
        const query = (text: string | { text: string; values?: unknown[] }, values?: unknown[]) =>
          /^\s*INSERT INTO line_status\b/.test(typeof text === 'string' ? text : text.text) ? Promise.resolve({ rows: [], rowCount: 0 }) : client.query(text as string, values);
        const proxied = new Proxy(client, {
          get(target, property, receiver) {
            if (property === 'query') {
              return query;
            }
            const value: unknown = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
        });
        Object.defineProperty(scope, 'client', { value: proxied, configurable: true, writable: true });
        return run(scope);
      }),
  };
}

/** Three lines of one case for one writer of stage events: p (to payer approved then recovered), q (another line), r (a recovered line moved back). */
export interface StageTrio {
  readonly p: string;
  readonly q: string;
  readonly r: string;
}

export interface StageWorld {
  readonly world: LedgerWorld;
  readonly practice: Practice;
  /** The lines CAS-49.3 writes as the reconcile job (in no one's name). */
  readonly job: StageTrio;
  /** The lines it writes as a person (the manual actions' finish()). */
  readonly person: StageTrio;
}

/**
 * CAS-49.3's world: two trios of case lines whose ledger stands ahead of their stages. Each p's entries put it at
 * recovered while its stage is actionable (approved, posted and deposited in a pass whose stage events were dropped),
 * each q's at payer approved or beyond while its stage is actionable, and each r is recovered (posted at the posted
 * level) while its entries, once the practice proves recovery by deposit, leave it at payer approved.
 */
export async function buildStageWorld(adminUrl: string): Promise<StageWorld> {
  const w = await LedgerWorld.open(adminUrl);
  try {
    const keys = ['p1', 'q1', 'r1', 'p2', 'q2', 'r2'];
    const { practice, planned, lines, load } = await start(w, 'CAS-49.3', '49', keys);
    const at = (key: string) => planned.get(key) as Planned;
    // r: approved in its own check and posted, so recovered at the posted level, with the stage events written.
    await load([{ trace: 'SYNEFTS49H2', paidOn: '2026-05-12', claims: ['r1', 'r2'].flatMap((key) => [reversal(at(key)), correction(at(key))]) }]);
    await w.stageExport(practice, 'CAS-49/stage-postings-r.csv', 'posting_export', postingExport(['r1', 'r2'].map((key) => posting(at(key), 'SYNEFTS49H2'))));
    await w.reconcile(practice);
    // The proof level raised: r now falls short of recovered (no deposit), its stage still recovered.
    await w.manual(practice, async ({ scope }) => {
      await setLedgerSettings(scope, { practiceId: practice.practiceId, proofLevel: 'deposited', requestId: `test-${randomUUID()}` });
    }, practice.world.adminUserId);
    // p and q approved in one check, p posted, the check deposited: reconciled with its stage events dropped.
    const h1: CheckText = { trace: 'SYNEFTS49H1', paidOn: '2026-05-11', claims: ['p1', 'q1', 'p2', 'q2'].flatMap((key) => [reversal(at(key)), correction(at(key))]) };
    await load([h1]);
    await w.stageExport(practice, 'CAS-49/stage-postings-p.csv', 'posting_export', postingExport(['p1', 'p2'].map((key) => posting(at(key), h1.trace))));
    await w.stageExport(practice, 'CAS-49/stage-deposits.csv', 'eft_export', eftExport([{ depositedOn: '2026-05-13', trace: h1.trace, amountCents: checkPayment(h1) }]));
    await reconcilePractice(withoutStageEvents(w.jobContext(practice)), w.services, practice.practiceId);
    const id = (key: string) => (lines.get(key) as FixedLine).serviceLineId;
    return { world: w, practice, job: { p: id('p1'), q: id('q1'), r: id('r1') }, person: { p: id('p2'), q: id('q2'), r: id('r2') } };
  } catch (error) {
    await w.close();
    throw error;
  }
}

export interface CrossingWorld {
  readonly world: LedgerWorld;
  readonly practice: Practice;
  /** The written-off line the reopen crosses the pass at: the last of the case's event lines by service line. */
  readonly reopened: FixedLine;
}

/**
 * CAS-49.6's world (design section 7, review rounds 1 and 2): one case C whose lines a-f were approved in the history
 * (payer approved), the one of them last by service line (L) then written off by the billing manager. The pass finds
 * waiting a posting export with a line-level row for each of a-f (so each moves to recovered in the pass, L last of
 * them in the stage write) and an 835 with a claim for line m's patient, code and date (so the search decrypts and
 * matches, and m moves to payer approved) and one for L's (which would pair with L were it open: a retry that re-read L
 * as reopened would match it, and differ from the reference). The pass writes no payer response or submission on C, so
 * nothing but the stage write's case refresh updates C (payer_response_refresh_case and submission_refresh_case would).
 */
export async function buildCrossingWorld(adminUrl: string): Promise<CrossingWorld> {
  const w = await LedgerWorld.open(adminUrl);
  try {
    const approved = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { practice, planned, lines, load } = await start(w, 'CAS-49.6', '46', [...approved, 'm']);
    const at = (key: string) => planned.get(key) as Planned;
    const h1: CheckText = { trace: 'SYNEFTS46H1', paidOn: '2026-05-11', claims: approved.flatMap((key) => [reversal(at(key)), correction(at(key))]) };
    await load([h1]);
    await w.reconcile(practice);
    // L: the approved line last by service line (UUID order, as syncLineStages orders its events).
    const last = approved.reduce((a, b) => ((lines.get(a) as FixedLine).serviceLineId > (lines.get(b) as FixedLine).serviceLineId ? a : b));
    const reopened = lines.get(last) as FixedLine;
    await writeOff(w, practice, [reopened.serviceLineId]);
    await load([{ trace: 'SYNEFTS46P1', paidOn: '2026-06-08', claims: [patientClaim(at('m')), patientClaim(at(last))] }]);
    await w.stageExport(practice, 'CAS-49/crossing-postings.csv', 'posting_export', postingExport(approved.map((key) => posting(at(key), h1.trace))));
    return { world: w, practice, reopened };
  } catch (error) {
    await w.close();
    throw error;
  }
}
