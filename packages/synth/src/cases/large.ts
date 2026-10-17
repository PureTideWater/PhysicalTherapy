/**
 * The 10,000-claim fixture (test matrix PAR-29): twenty transaction sets of five hundred claims in
 * one interchange. It is generated when a test needs it, into fixtures/synthetic/PAR-29/generated/
 * (ignored by git), transaction by transaction, so neither the generator nor a streaming parser needs
 * the whole file in memory. expected.json records its size, hash and counts.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { centsToString, parseCents, sumCents } from '@tp/money';

import { addDays, calendarDate, toIsaDate, toX12Date } from '../core/dates';
import { SYNTH_GS02, SYNTH_ISA06 } from '../identity';
import { interchangeControl, paymentAmount, transactionBody } from '../x12/build835';
import { SynthWorld, remittance } from '../x12/factory';
import { TRANSACTION_VERSION } from '../x12/model';
import { DEFAULT_DELIMITERS, type X12Segment, seg, segmentText } from '../x12/segments';
import { summarize835 } from '../x12/summary';
import { canonicalJson, sha256 as sha256Of } from '../core/json';
import { assertSyntheticX12 } from '../write';
import { TIMED_CODES, controlNumber, therapyClaim, therapyLine, traceNumber } from './common';

export const LARGE_CASE = 'PAR-29';
export const LARGE_TRANSACTIONS = 20;
export const LARGE_CLAIMS_PER_TRANSACTION = 500;
export const LARGE_CLAIMS = LARGE_TRANSACTIONS * LARGE_CLAIMS_PER_TRANSACTION;
/** Relative to fixtures/synthetic. */
export const LARGE_FIXTURE_PATH = 'PAR-29/generated/remit-10000-claims.835';

export interface LargeTransactionFacts {
  readonly st02: string;
  readonly claims: number;
  readonly lines: number;
  readonly bpr02Cents: string;
}

export interface LargeFixtureFacts {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** SHA-256 of the canonical JSON of its oracle summary (what pyx12's reading must hash to). */
  readonly summarySha256: string;
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly paidCents: string;
  readonly perTransaction: readonly LargeTransactionFacts[];
}

function text(segments: readonly X12Segment[]): string {
  return segments.map((segment) => segmentText(segment, DEFAULT_DELIMITERS) + DEFAULT_DELIMITERS.segment + '\n').join('');
}

/** The file as text chunks: the envelope header, each transaction set, the trailers. */
export function* largeFixtureChunks(facts?: LargeTransactionFacts[]): Generator<string> {
  for (const segments of largeFixtureSegments(facts)) {
    yield text(segments);
  }
}

/** The file as segment groups: the envelope header, each transaction set, the trailers. */
export function* largeFixtureSegments(facts?: LargeTransactionFacts[]): Generator<X12Segment[]> {
  const world = new SynthWorld(`tp-synth/${LARGE_CASE}`);
  const date = calendarDate(2026, 6, 1);
  const isa13 = controlNumber(LARGE_CASE, 1);
  yield [
    seg('ISA', '00', ' '.repeat(10), '00', ' '.repeat(10), 'ZZ', SYNTH_ISA06, 'ZZ', 'SYNTHRECEIVER'.padEnd(15, ' '), toIsaDate(date), '0600', DEFAULT_DELIMITERS.repetition, '00501', interchangeControl(isa13), '0', 'T', DEFAULT_DELIMITERS.component),
    seg('GS', 'HP', SYNTH_GS02, 'SYNTHRCV', toX12Date(date), '0600', String(isa13), 'X', TRANSACTION_VERSION),
  ];
  const payee = world.payee('01');
  for (let t = 0; t < LARGE_TRANSACTIONS; t += 1) {
    const payer = world.payer(['A', 'B', 'C', 'D'][t % 4] ?? 'A');
    const claims = Array.from({ length: LARGE_CLAIMS_PER_TRANSACTION }, (_, index) => {
      const serviceDate = addDays(calendarDate(2026, 1, 5), (t * 7 + index) % 140);
      return therapyClaim(world, {
        caseId: LARGE_CASE,
        n: t * LARGE_CLAIMS_PER_TRANSACTION + index + 1,
        plan: `SYNPLAN-LARGE-${String((t % 4) + 1)}`,
        lines: Array.from({ length: 1 + (index % 3) }, (_, lineIndex) => therapyLine(world, { code: TIMED_CODES[(index + lineIndex) % TIMED_CODES.length] ?? '97110', units: 1 + ((index + lineIndex) % 3), date: serviceDate })),
      });
    });
    const remit = remittance({ payer, payee, claims, paymentDate: addDays(date, -t), trace: traceNumber(LARGE_CASE, t + 1, t % 2 === 0 ? 'ACH' : 'CHK'), originatorId: world.originatorId(payer.name.slice(-1)), method: t % 2 === 0 ? 'ACH' : 'CHK' }, world);
    const st02 = String(t + 1).padStart(4, '0');
    const body = transactionBody(remit);
    facts?.push({ st02, claims: claims.length, lines: claims.reduce((total, item) => total + item.lines.length, 0), bpr02Cents: centsToString(paymentAmount(remit)) });
    yield [seg('ST', '835', st02), ...body, seg('SE', String(body.length + 2), st02)];
  }
  yield [seg('GE', String(LARGE_TRANSACTIONS), String(isa13)), seg('IEA', '1', interchangeControl(isa13))];
}

/** Generates the file in memory, chunk by chunk, and returns what expected.json records. */
export function largeFixtureFacts(): LargeFixtureFacts {
  const hash = createHash('sha256');
  const perTransaction: LargeTransactionFacts[] = [];
  const segments: X12Segment[] = [];
  let bytes = 0;
  for (const group of largeFixtureSegments(perTransaction)) {
    const chunk = text(group);
    hash.update(chunk);
    bytes += Buffer.byteLength(chunk);
    segments.push(...group);
  }
  const summary = summarize835({ interchanges: [{ delimiters: DEFAULT_DELIMITERS, segments }] });
  return {
    path: LARGE_FIXTURE_PATH,
    sha256: hash.digest('hex'),
    bytes,
    summarySha256: sha256Of(canonicalJson(summary)),
    transactions: perTransaction.length,
    claims: perTransaction.reduce((total, item) => total + item.claims, 0),
    lines: perTransaction.reduce((total, item) => total + item.lines, 0),
    paidCents: centsToString(sumCents(perTransaction.map((item) => parseCents(item.bpr02Cents)))),
    perTransaction,
  };
}

/**
 * Writes the large fixture under `syntheticRoot` (fixtures/synthetic) unless a file with the
 * expected hash is already there, and returns its path. Tests call this; it is never committed.
 */
export async function writeLargeFixture(syntheticRoot: string, expectedSha256?: string): Promise<string> {
  const target = path.join(syntheticRoot, LARGE_FIXTURE_PATH);
  if (expectedSha256 !== undefined && existsSync(target)) {
    const current = createHash('sha256').update(readFileSync(target)).digest('hex');
    if (current === expectedSha256) {
      return target;
    }
  }
  mkdirSync(path.dirname(target), { recursive: true });
  const stream = createWriteStream(target);
  let first = true;
  for (const chunk of largeFixtureChunks()) {
    if (first) {
      // The first chunk is the envelope header (ISA and GS): the fixture guard's sender check reads it.
      assertSyntheticX12(new Uint8Array(Buffer.from(chunk)), LARGE_FIXTURE_PATH);
      first = false;
    }
    if (!stream.write(chunk)) {
      await new Promise<void>((resolve) => stream.once('drain', () => resolve()));
    }
  }
  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.once('error', reject);
  });
  return target;
}
