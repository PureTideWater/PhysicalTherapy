/**
 * Test matrix PAR-29 (PRD section 10: 10,000 claims a minute on one worker vCPU, memory bounded per
 * transaction set): the 10,000-claim fixture packages/synth generates, streamed through the parser in
 * 64 KiB slices as a file or object stream would arrive.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { type CaseExpectation, LARGE_CLAIMS, largeFixtureChunks } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { type ParseReport } from './types';
import { parse835Stream } from './stream';
import { releaseDirectoryCodeLists } from './testing';

const SLICE = 64 * 1024;
const expected = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/synthetic/PAR-29/expected.json'), 'utf8')) as CaseExpectation;

describe('the 10,000-claim fixture (PAR-29)', () => {
  it('parses within the target, every claim balanced, holding at most one transaction set at a time', async () => {
    const parts = [...largeFixtureChunks()];
    const file = Buffer.from(parts.join(''), 'utf8');
    const generated = expected.generated[0];
    expect(createHash('sha256').update(file).digest('hex')).toBe(generated?.sha256);
    expect(file.length).toBe(generated?.bytes);
    // The envelope header, twenty transaction sets, the trailers: the largest set bounds what is held.
    const largestSet = Math.max(...parts.slice(1, -1).map((part) => part.split('~').length - 1));
    const slices = Array.from({ length: Math.ceil(file.length / SLICE) }, (_, index) => file.subarray(index * SLICE, (index + 1) * SLICE));

    const codeLists = releaseDirectoryCodeLists();
    const started = performance.now();
    let claims = 0;
    let lines = 0;
    const payments: string[] = [];
    let report: ParseReport | undefined;
    for await (const item of parse835Stream(slices, { codeLists })) {
      if (item.type === 'transaction') {
        expect(item.transaction.loadable).toBe(true);
        expect(item.transaction.balance.claimsBalanced).toBe(true);
        claims += item.transaction.claims.length;
        lines += item.transaction.counts.lines;
        payments.push((item.transaction.payment?.amountCents ?? 0n).toString());
      } else if (item.type === 'report') {
        report = item.report;
      }
    }
    const seconds = (performance.now() - started) / 1000;

    expect(seconds, `parsed ${String(LARGE_CLAIMS)} claims in ${seconds.toFixed(1)} s`).toBeLessThan(60);
    const scenario = expected.scenario as { claims: number; lines: number; perTransaction: { bpr02Cents: string }[] };
    expect(claims).toBe(scenario.claims);
    expect(lines).toBe(scenario.lines);
    expect(payments).toEqual(scenario.perTransaction.map((item) => item.bpr02Cents));
    expect(report?.outcome).toBe('loaded');
    expect(report?.documentSha256).toBe(generated?.sha256);
    expect(report?.receipt.loaded).toEqual({ transactions: 20, claims: LARGE_CLAIMS, lines: scenario.lines });
    expect(report?.memory.peakTransactionSegments).toBe(largestSet);
    expect(report?.memory.peakBufferedCharacters).toBeLessThan(SLICE + 1024);
  }, 120_000);
});
