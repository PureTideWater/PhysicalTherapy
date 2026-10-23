import { randomBytes } from 'node:crypto';

import type { ScopeClient, ScopePool } from '@tp/db/runtime';
import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { Sealer } from '../auth/seal';
import type { DomainResolver } from './address';
import { type AddressCheckServices, type AddressInsights, LOCAL_ADDRESS_INSIGHTS, type MailboxVerdicts, VALIDATION_BUCKET, checkScreeningAddress, localAddressChecks, validationVerdict } from './validation';

/**
 * SES's validation of a screening's address and the day's cap, beside the DNS check (audit #76; docs/adr/0065, D9 step
 * 3; the founder's Q1 (g) of 2026-10-21; test matrix SCR-22): each row of D9's table, verdict by verdict; a timeout or
 * an error accepts; past the cap the call is not made and MAIL_VALIDATION_CAP_REACHED is logged; the two checks run
 * together, so the added time is one timeout; and no log line names the address or its domain. The rate limiter's table
 * is stood in for by a counter. SYNTHETIC addresses.
 */

const ADDRESS = 'jane.prospect@harborpt.test';

/** A pool whose one query is rate_limit_take: allowed while fewer than `cap` validations were taken. */
function counterPool(): { pool: ScopePool<ScopeClient>; taken: () => number; buckets: string[] } {
  let taken = 0;
  const buckets: string[] = [];
  const client = {
    query: (_sql: string, values: readonly unknown[]) => {
      buckets.push(String(values[0]));
      taken += 1;
      return Promise.resolve({ rows: [{ allowed: taken <= Number(values[2]) }] });
    },
    release: () => undefined,
  };
  return { pool: { connect: () => Promise.resolve(client) } as unknown as ScopePool<ScopeClient>, taken: () => taken, buckets };
}

const ACCEPTING: DomainResolver = { resolveMx: () => Promise.resolve([{ exchange: 'mx.harborpt.test', priority: 10 }]), resolve4: () => Promise.resolve([]), resolve6: () => Promise.resolve([]) };
const REFUSING: DomainResolver = { resolveMx: () => Promise.reject(Object.assign(new Error('nx'), { code: 'ENOTFOUND' })), resolve4: () => Promise.resolve([]), resolve6: () => Promise.resolve([]) };
const TIMING_OUT: DomainResolver = { resolveMx: () => new Promise(() => undefined), resolve4: () => Promise.resolve([]), resolve6: () => Promise.resolve([]) };

function insights(verdicts: MailboxVerdicts | 'error' | 'hang', calls: string[] = []): AddressInsights {
  return {
    verdicts: (address, signal) => {
      calls.push(address);
      if (verdicts === 'error') {
        return Promise.reject(new Error('ThrottlingException'));
      }
      if (verdicts === 'hang') {
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return Promise.resolve(verdicts);
    },
  };
}

function context(checks: AddressCheckServices, kept = false) {
  const lines: string[] = [];
  const counter = counterPool();
  return {
    lines,
    counter,
    run: () => checkScreeningAddress(ADDRESS, { checks, pool: counter.pool, sealer: new Sealer(randomBytes(32)), logger: createLogger({ sink: (line) => lines.push(line) }), kept }),
  };
}

describe('D9\'s table, verdict by verdict', () => {
  it('refuses on LOW validity, syntax, DNS records or mailbox', () => {
    for (const key of ['isValid', 'hasValidSyntax', 'hasValidDnsRecords', 'mailboxExists'] as const) {
      expect(validationVerdict({ isValid: 'HIGH', hasValidSyntax: 'HIGH', hasValidDnsRecords: 'HIGH', mailboxExists: 'HIGH', [key]: 'LOW' }), key).toBe('refuse');
    }
  });

  it('warns on MEDIUM validity or mailbox, and accepts otherwise; the role, disposable and random verdicts are not read', () => {
    expect(validationVerdict({ isValid: 'MEDIUM', mailboxExists: 'HIGH' })).toBe('warn');
    expect(validationVerdict({ isValid: 'HIGH', mailboxExists: 'MEDIUM' })).toBe('warn');
    expect(validationVerdict({ isValid: 'HIGH', hasValidSyntax: 'MEDIUM', hasValidDnsRecords: 'MEDIUM', mailboxExists: 'HIGH' })).toBe('accept');
    expect(validationVerdict({})).toBe('accept');
  });
});

describe('the address checks together', () => {
  it('accepts, warns and refuses as the validation says, unless the prospect kept a warned address', async () => {
    expect(await context({ resolver: ACCEPTING, insights: insights({ isValid: 'HIGH', mailboxExists: 'HIGH' }), dailyCap: 5 }).run()).toBe('accept');
    expect(await context({ resolver: ACCEPTING, insights: insights({ isValid: 'HIGH', mailboxExists: 'MEDIUM' }), dailyCap: 5 }).run()).toBe('warn');
    expect(await context({ resolver: ACCEPTING, insights: insights({ isValid: 'HIGH', mailboxExists: 'MEDIUM' }), dailyCap: 5 }, true).run()).toBe('accept');
    expect(await context({ resolver: ACCEPTING, insights: insights({ isValid: 'LOW' }), dailyCap: 5 }, true).run()).toBe('refuse');
  });

  it('refuses what DNS refuses, whatever SES says, and counts the call made beside it', async () => {
    const run = context({ resolver: REFUSING, insights: insights({ isValid: 'HIGH', mailboxExists: 'HIGH' }), dailyCap: 5 });
    expect(await run.run()).toBe('refuse');
    expect(run.counter.taken()).toBe(1);
    expect(run.counter.buckets).toEqual([VALIDATION_BUCKET]);
  });

  it('accepts when the validation fails or times out, logging MAIL_VALIDATION_UNAVAILABLE, and when DNS does not answer, logging MAIL_DOMAIN_CHECK_UNAVAILABLE', async () => {
    const failed = context({ resolver: ACCEPTING, insights: insights('error'), dailyCap: 5 });
    expect(await failed.run()).toBe('accept');
    expect(failed.lines.map((line) => (JSON.parse(line) as { error_code?: string }).error_code)).toEqual(['MAIL_VALIDATION_UNAVAILABLE']);
    const silent = context({ resolver: TIMING_OUT, insights: insights('hang'), dailyCap: 5 });
    const started = Date.now();
    expect(await silent.run()).toBe('accept');
    // The two run together: one 2-second timeout, not two.
    expect(Date.now() - started).toBeLessThan(3_500);
    expect(silent.lines.map((line) => (JSON.parse(line) as { error_code?: string }).error_code).sort()).toEqual(['MAIL_DOMAIN_CHECK_UNAVAILABLE', 'MAIL_VALIDATION_UNAVAILABLE']);
  });

  it('makes no call past the day\'s cap, logging MAIL_VALIDATION_CAP_REACHED, and still checks DNS', async () => {
    const calls: string[] = [];
    const run = context({ resolver: ACCEPTING, insights: insights({ isValid: 'LOW' }, calls), dailyCap: 2 });
    expect(await run.run()).toBe('refuse');
    expect(await run.run()).toBe('refuse');
    expect(await run.run()).toBe('accept');
    expect(calls).toHaveLength(2);
    expect(run.lines.map((line) => (JSON.parse(line) as { error_code?: string }).error_code)).toEqual(['MAIL_VALIDATION_CAP_REACHED']);
    const refused = context({ resolver: REFUSING, insights: insights({ isValid: 'HIGH' }), dailyCap: 1 });
    await refused.run();
    expect(await refused.run()).toBe('refuse');
  });

  it('names neither the address nor its domain in any log line', async () => {
    const runs = [
      context({ resolver: TIMING_OUT, insights: insights('hang'), dailyCap: 5 }),
      context({ resolver: ACCEPTING, insights: insights('error'), dailyCap: 5 }),
      context({ resolver: ACCEPTING, insights: insights({ isValid: 'HIGH' }), dailyCap: 0 + 1 }),
    ];
    for (const run of runs) {
      await run.run();
      await run.run();
      expect(run.lines.join('\n')).not.toMatch(/@|harborpt/);
    }
  });

  it('answers with the stand-ins after the delay the capacity harness gives (the plan\'s G1)', async () => {
    const started = Date.now();
    expect(await context(localAddressChecks(5, 200)).run()).toBe('accept');
    expect(Date.now() - started).toBeGreaterThanOrEqual(190);
    expect((await LOCAL_ADDRESS_INSIGHTS.verdicts('invalid.mailbox@harborpt.test', new AbortController().signal)).mailboxExists).toBe('LOW');
    expect(validationVerdict(await LOCAL_ADDRESS_INSIGHTS.verdicts('unconfirmed.mailbox@harborpt.test', new AbortController().signal))).toBe('warn');
  });
});
