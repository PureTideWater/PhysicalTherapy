import { randomUUID } from 'node:crypto';

import { withJobScope, withPracticeScope } from '@tp/db';
import { createLogger } from '@tp/observability';

import type { JobContext } from '../../jobs/handlers';
import type { Practice } from '../../price/test-support/pricing-world';
import type { Scope } from '../ledger';
import { type PrintOutcome, type StatementPrintServices, printRoiStatement } from '../print';
import { NO_BILLING, NO_TIME_LOG, generateRoiStatement } from '../statements';
import type { LedgerWorld } from './ledger-world';

/**
 * For the readers' tests (schema PR 5; the design note's T9, T10 and T12): the same statement stored twice, once with
 * the lines its actionable figure counted (five keys in `links`) and once without (four keys, as every statement before
 * the list), so what a reader shows of the one can be compared with what it shows of the other; and a scope that records
 * the statement rows a reader's query received. SYNTHETIC fixtures only.
 */

/** The four keys a reader receives, whatever the statement stores. */
export const FOUR_KEYS = ['actionable_open', 'approved_unposted', 'interest', 'recovered'] as const;

/** The reader's select before the readers shipped four keys (print.ts, `STATEMENT_COLUMNS`, with `s.links` whole): the previous image's. */
export const PREVIOUS_STATEMENT_COLUMNS = `s.id, s.period_from::text AS period_from, s.period_to::text AS period_to, s.proof_level, s.fees_cents::text AS fees_cents, s.recovered_cents::text AS recovered_cents,
  s.interest_cents::text AS interest_cents, s.approved_unposted_cents::text AS approved_unposted_cents, s.actionable_open_cents::text AS actionable_open_cents,
  s.pursuit_hours::text AS pursuit_hours, s.links, s.document_key, s.generated_by, s.generated_at`;

/**
 * A jsonb expression's scalars as exact text, objects and arrays left whole (so a bigint cents column reaches JS as
 * '9000', never as a float): `to_jsonb(s)` alone gives numbers, which node-postgres parses into doubles.
 */
export const EXACT_SCALARS = (jsonb: string): string =>
  `(SELECT jsonb_object_agg(e.key, CASE WHEN jsonb_typeof(e.value) IN ('object', 'array') THEN e.value ELSE to_jsonb(e.value #>> '{}') END) FROM jsonb_each(${jsonb}) e)`;

/** SYNTHETIC LED-06 worked through: approved, posted, deposited, then reopened by the payer's recoupment (entries behind recovered, and an actionable line). */
export async function recoupedLedSix(led: LedgerWorld, label: string): Promise<Practice> {
  const practice = await led.practice(label);
  await led.caseFor(practice, 'LED-06/original.835');
  await led.load(practice, 'LED-06/adjusted.835');
  await led.reconcile(practice);
  await led.reconcile(practice, { documentId: await led.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
  await led.reconcile(practice, { documentId: await led.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
  await led.load(practice, 'LED-06/recoupment.835');
  await led.reconcile(practice);
  return practice;
}

export interface Twins {
  /** The statement with the lines listed. */
  readonly five: string;
  /** The same statement without the list. */
  readonly four: string;
  /** How many lines the first lists. */
  readonly lines: number;
}

/**
 * The job's statement of the period as today's writer stores it, then two copies of that row in the manager's name,
 * written by one statement and so at one time: one whole, one without the list. The database checks both as it checks any statement.
 */
export async function statementTwins(led: Pick<LedgerWorld, 'app'>, practice: Practice, period: { readonly periodFrom: string; readonly periodTo: string }): Promise<Twins> {
  const { practiceId } = practice;
  const generated = await withJobScope(led.app, { jobId: randomUUID(), practiceId }, (scope) =>
    generateRoiStatement(scope, { practiceId, ...period, requestId: `test-${randomUUID()}` }, { fees: NO_BILLING, pursuitHours: NO_TIME_LOG }),
  );
  if (generated === null) {
    throw new Error('the statement was not written');
  }
  // As the manager, since the database stores a person's statement only from that person (roi_statement_rules()).
  const rows = await withPracticeScope(led.app, { actorId: practice.manager, practiceIds: [practiceId] }, async (scope) =>
    (
      await scope.client.query<{ id: string; whole: boolean; lines: number | null }>(
        `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by)
         SELECT s.practice_id, s.period_from, s.period_to, s.proof_level, s.fees_cents, s.recovered_cents, s.interest_cents, s.approved_unposted_cents, s.actionable_open_cents, s.pursuit_hours,
                CASE WHEN v.whole THEN s.links ELSE s.links - 'actionable_open_lines' END, $2
           FROM roi_statement s CROSS JOIN (VALUES (true), (false)) v(whole)
          WHERE s.id = $1
         RETURNING id, links ? 'actionable_open_lines' AS whole, jsonb_array_length(links -> 'actionable_open_lines') AS lines`,
        [generated.statementId, practice.manager],
      )
    ).rows,
  );
  const five = rows.find((row) => row.whole);
  const four = rows.find((row) => !row.whole);
  if (five === undefined || four === undefined) {
    throw new Error('the twins were not written');
  }
  return { five: five.id, four: four.id, lines: five.lines ?? -1 };
}

/** A statement row as a reader's query received it. */
export type ReceivedRow = Record<string, unknown> & { readonly links: Record<string, unknown> };

type Query = (...values: unknown[]) => Promise<{ readonly rows?: readonly Record<string, unknown>[] }>;

/** The scope, its client recording into `received` every row with `links` that a SELECT from roi_statement returns. */
export function spied<S extends Scope>(scope: S, received: ReceivedRow[]): S {
  const real = scope.client as unknown as { readonly query: Query };
  const client = new Proxy(real, {
    get(target, property) {
      if (property !== 'query') {
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? (value as (...values: unknown[]) => unknown).bind(target) : value;
      }
      return async (...values: unknown[]) => {
        const result = await target.query(...values);
        const [text] = values;
        if (typeof text === 'string' && text.startsWith('SELECT') && text.includes('FROM roi_statement s')) {
          for (const row of result.rows ?? []) {
            if (typeof row.links === 'object' && row.links !== null) {
              received.push(row as ReceivedRow);
            }
          }
        }
        return result;
      };
    },
  });
  return Object.create(scope, { client: { value: client, enumerable: true } }) as S;
}

export interface Print {
  readonly outcome: PrintOutcome;
  /** What the job gave the PDF renderer. */
  readonly html: readonly string[];
  /** The statement rows the job's query received. */
  readonly received: readonly ReceivedRow[];
}

/** The print job on one statement, its PDF a SYNTHETIC stand-in, recording the rows it read and the HTML it printed. */
export async function printWatched(app: LedgerWorld['app'], services: Omit<StatementPrintServices, 'pdf'>, practiceId: string, statementId: string): Promise<Print> {
  const jobId = randomUUID();
  const html: string[] = [];
  const received: ReceivedRow[] = [];
  const context: JobContext = {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, (scope) => work(spied(scope, received))),
    enqueue: () => Promise.resolve(null),
    lastAttempt: false,
  };
  const pdf = new TextEncoder().encode('%PDF-1.7\n% SYNTHETIC stand-in\n');
  const outcome = await printRoiStatement(
    context,
    {
      ...services,
      pdf: {
        render: (page: string) => {
          html.push(page);
          return Promise.resolve(pdf);
        },
      },
    },
    practiceId,
    statementId,
  );
  return { outcome, html, received };
}
