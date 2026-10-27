import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SCALE_RELEASE_SHAPE, SCALE_THERAPY_CODES, scaleCodes, scaleZips } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { COMMANDS, WORKER_JOBS } from '../../infra/lib/constructs/compute';
import { heapFlag } from '../../infra/lib/heap';
import { repositoryRoot } from '../content-files';
import { SERVICE_COMMANDS, serviceCommand } from '../screening-capacity/containers';
import { HARNESS_LOGINS, type HarnessDirectories, workerEnvironment } from '../screening-capacity/env';
import { CAPACITY_CODES, CAPACITY_ZIP, FULL_SIZE, PERIOD, SMALL_SIZE, capacity835, practiceClaims, practiceNames, withHeapFlag } from './scenario';

/**
 * The weekly real-size test's worker and practices (audit #31; docs/adr/0071; test matrix RCC-07): the worker runs
 * production's command with the heap flag after node, and production's environment; the practices hold the shapes the
 * design names, every identifier SYNTHETIC.
 */

const quarterOf = (date: string) => Math.floor((Number.parseInt(date.slice(5, 7), 10) - 1) / 3) + 1;

describe('the worker the test runs', () => {
  it('runs production’s worker command, with heapFlag("worker") after node and nothing else changed', () => {
    expect(SERVICE_COMMANDS.worker).toEqual(COMMANDS.worker);
    expect(serviceCommand('worker')).toEqual(COMMANDS.worker);
    expect(withHeapFlag(serviceCommand('worker'), heapFlag('worker'))).toEqual(['node', '--max-old-space-size=560', '--enable-source-maps', 'dist/main.js']);
    expect(SERVICE_COMMANDS.worker.some((word) => word.startsWith('--max-old-space-size'))).toBe(false);
  });

  it('refuses a command that is not node’s, a second heap flag, or a flag that is not one', () => {
    expect(() => withHeapFlag(['tsx', 'src/main.ts'], heapFlag('worker'))).toThrow(RangeError);
    expect(() => withHeapFlag(['node', '--max-old-space-size=256', 'dist/main.js'], heapFlag('worker'))).toThrow(RangeError);
    expect(() => withHeapFlag(['node', 'dist/main.js'], '--inspect')).toThrow(RangeError);
  });

  it('imports no heap constant from the screening harness, so infra/lib/heap.ts joins no watched closure (B1)', () => {
    for (const file of ['tools/screening-capacity/containers.ts', 'tools/screening-capacity/env.ts']) {
      expect(readFileSync(path.join(repositoryRoot, file), 'utf8'), file).not.toMatch(/from '[^']*infra\/lib\/heap'/);
    }
  });

  it('gives the worker production’s practice jobs on the worker’s own login and the queue login, never the operator’s or the application’s', () => {
    const dirs = Object.fromEntries(['outbox', 'auditCopies', 'restoreDrill', 'supportMail', 'devAuth', 'documents', 'billing', 'modelOutputs', 'agreements', 'compliance'].map((name) => [name, `/data/${name}`])) as unknown as HarnessDirectories;
    const env = workerEnvironment('postgres://postgres:test@db:5432/tp', 'http://localhost:3000', dirs, 'c3ludGhldGlj');
    expect(env.WORKER_JOBS).toBe(WORKER_JOBS.worker);
    expect(new URL(env.DATABASE_URL ?? '').username).toBe(HARNESS_LOGINS.worker.username);
    expect(new URL(env.QUEUE_DATABASE_URL ?? '').username).toBe(HARNESS_LOGINS.queue.username);
    expect(env).not.toHaveProperty('OPERATOR_DATABASE_URL');
    expect(env).not.toHaveProperty('SCREENING_DATABASE_URL');
    expect(env).toMatchObject({ NODE_ENV: 'test', DOCUMENTS_DIR: '/data/documents', TP_KEY_PROVIDER: 'local', MAIL_OUTBOX_DIR: '/data/outbox' });
  });
});

describe('the practices', () => {
  it('sizes the full test as the design names it, and the smoke run smaller in every part', () => {
    expect(FULL_SIZE).toEqual({ measuredLines: 100_000, reportLines: 20_000, remittances: 4, claimsPerRemittance: 2_000 });
    expect(SMALL_SIZE.remittances).toBe(4);
    for (const key of ['measuredLines', 'reportLines', 'claimsPerRemittance'] as const) {
      expect(SMALL_SIZE[key]).toBeLessThan(FULL_SIZE[key]);
    }
    expect(PERIOD).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('locates the practices at a ZIP of the scale release that needs no ZIP+4, and draws codes from its first 400', () => {
    expect(scaleZips(SCALE_RELEASE_SHAPE).find((zip) => zip.zip === CAPACITY_ZIP)?.plusFour).toBe(false);
    expect(CAPACITY_CODES).toEqual(scaleCodes(SCALE_RELEASE_SHAPE).slice(0, 400));
  });

  it('gives A exactly its lines in claims of 1 to 6, on one or two dates, over every quarter of 2026, half therapy codes, half Medicare Advantage', () => {
    const claims = practiceClaims(FULL_SIZE.measuredLines, 'A');
    const lines = claims.flatMap((entry) => entry.lines);
    expect(lines).toHaveLength(100_000);
    expect(claims.every((entry) => entry.lines.length >= 1 && entry.lines.length <= 6)).toBe(true);
    expect(new Set(claims.map((entry) => entry.lines.length))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(claims.map((entry) => entry.claimNo)).toEqual(claims.map((_, index) => index + 1));
    // One or two dates a claim, and claims holding lines on the same date (the NCCI pairs the keyed read fetches).
    expect(claims.every((entry) => new Set(entry.lines.map((item) => item.serviceDate)).size <= 2)).toBe(true);
    expect(claims.some((entry) => new Set(entry.lines.map((item) => item.serviceDate)).size === 2)).toBe(true);
    expect(claims.filter((entry) => entry.lines.length > new Set(entry.lines.map((item) => item.serviceDate)).size).length).toBeGreaterThan(claims.length / 2);
    expect(lines.every((item) => item.serviceDate >= PERIOD.from && item.serviceDate <= PERIOD.to)).toBe(true);
    expect(new Set(lines.map((item) => quarterOf(item.serviceDate)))).toEqual(new Set([1, 2, 3, 4]));
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      expect(lines.filter((item) => quarterOf(item.serviceDate) === quarter).length, `Q${String(quarter)}`).toBeGreaterThan(20_000);
    }
    // Codes from the first 400, the therapy codes about half the lines (45% to 55%), with GP on them alone.
    const therapy: readonly string[] = SCALE_THERAPY_CODES;
    expect(lines.every((item) => CAPACITY_CODES.includes(item.code))).toBe(true);
    const share = lines.filter((item) => therapy.includes(item.code)).length / lines.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
    expect(new Set(lines.filter((item) => !therapy.includes(item.code)).map((item) => item.code)).size).toBeGreaterThan(350);
    expect(lines.every((item) => (therapy.includes(item.code) ? item.modifiers.join() === 'GP' : item.modifiers.length === 0))).toBe(true);
    expect(lines.every((item) => item.units >= 1 && item.units <= 3)).toBe(true);
    expect(claims.filter((entry) => entry.medicareAdvantage).length).toBe(Math.floor(claims.length / 2));
  });

  it('gives B its lines in the same shape, and generates both the same every time', () => {
    const claims = practiceClaims(FULL_SIZE.reportLines, 'B');
    expect(claims.flatMap((entry) => entry.lines)).toHaveLength(20_000);
    expect(practiceClaims(FULL_SIZE.reportLines, 'B')).toEqual(claims);
    expect(practiceClaims(FULL_SIZE.reportLines, 'A')).not.toEqual(claims);
    expect(practiceClaims(7, 'A').flatMap((entry) => entry.lines)).toHaveLength(7);
  });

  it('writes C’s 835s as SYNTHETIC remittances of their claims, each a payment of its own', () => {
    const files = [1, 2].map((index) => capacity835(index, 50).toString('latin1'));
    for (const text of files) {
      expect(text.startsWith('ISA*')).toBe(true);
      expect(text.match(/~\n?CLP\*/g)).toHaveLength(50);
      expect(text).toContain('SYNTHETIC');
      // Every patient and claim number the file names is a SYNTHETIC one.
      expect([...text.matchAll(/CLP\*([^*]+)\*/g)].every((match) => match[1]?.startsWith('SYNPCNCAP') === true)).toBe(true);
      expect([...text.matchAll(/NM1\*QC\*1\*([^*]+)\*/g)].every((match) => match[1]?.startsWith('SYNTHLAST') === true)).toBe(true);
    }
    // Each its own payment: its own trace and interchange control number.
    const trace = (text: string) => /TRN\*1\*([^*~]+)/.exec(text)?.[1];
    const isa13 = (text: string) => text.split('*')[13];
    expect(trace(files[0] ?? '')).not.toBe(trace(files[1] ?? ''));
    expect(isa13(files[0] ?? '')).not.toBe(isa13(files[1] ?? ''));
    expect(capacity835(1, 50).equals(capacity835(1, 50))).toBe(true);
  });

  it('names every row SYNTHETIC', () => {
    for (const label of ['A', 'B', 'C']) {
      const names = practiceNames(label);
      expect(names.payer).toMatch(/^SYNTHETIC /);
      for (const value of [names.payerId, names.medicareAdvantagePlan, names.contractPlan, names.claimPrefix, names.trace]) {
        expect(value, value).toMatch(/SYN/);
      }
    }
  });
});
