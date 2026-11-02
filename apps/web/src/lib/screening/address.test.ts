import { describe, expect, it } from 'vitest';

import { ADDRESS_REFUSED, LOCAL_DOMAIN_RESOLVER, MAILBOX_UNCONFIRMED, type DomainResolver, type MxRecord, addressHint, checkMailDomain, editDistance, isSoftAddressMessage } from './address';
import { TLD_SNAPSHOT_VERSION, TOP_LEVEL_DOMAINS } from './tlds';

/**
 * The screening's address checks that run in the browser and again on the server (audit #76; docs/adr/0065, D9; test
 * matrix SCR-22): the typo hint for a large mail provider's domain, the warning for an ending not in use, and the DNS
 * check through a resolver given in its place. SYNTHETIC addresses at reserved or synthetic domains.
 */

describe('the typo hint', () => {
  it('suggests the provider for a near miss of a large mail provider\'s domain', () => {
    expect(addressHint('jane@gmial.com')).toMatchObject({ suggestion: 'jane@gmail.com', unknownEnding: null });
    expect(addressHint('jane@yaho.com').suggestion).toBe('jane@yahoo.com');
    expect(addressHint('jane@outlok.com').suggestion).toBe('jane@outlook.com');
    expect(addressHint('jane@hotmal.com').suggestion).toBe('jane@hotmail.com');
    expect(addressHint(' Jane@GMAIL.CON ').suggestion).toBe('jane@gmail.com');
    expect(addressHint('jane@gmial.com').message).toBe('Did you mean @gmail.com? Check the address, or keep it as typed.');
    // The message never names the address, so the server's issue carries none; the browser's button offers it whole.
    expect(addressHint('jane@gmial.com').message).not.toContain('jane');
  });

  it('says nothing for a listed provider or a practice\'s own domain far from every provider', () => {
    for (const address of ['jane@gmail.com', 'jane@yahoo.com', 'billing@harborpt.example', 'office@lakeside-therapy.test', 'jane@mail.com']) {
      expect(addressHint(address), address).toEqual({ suggestion: null, unknownEnding: null, message: null });
    }
  });

  it('warns of an ending not in use, and suggests a common ending one edit away', () => {
    expect(addressHint('office@harborpt.qqq')).toEqual({
      suggestion: null,
      unknownEnding: 'qqq',
      message: 'This address ends in “.qqq”, which is not a domain ending in use. Check it, or keep it as typed.',
    });
    expect(addressHint('office@harborpt.cmo')).toEqual({
      suggestion: 'office@harborpt.com',
      unknownEnding: 'cmo',
      message: 'This address ends in “.cmo”. Did you mean “.com”? Check it, or keep it as typed.',
    });
    expect(addressHint('office@harborpt.health').message).toBeNull();
  });

  it('marks its own messages, and the unconfirmed mailbox\'s, as ones the prospect may answer by keeping the address; never the refusal', () => {
    expect(isSoftAddressMessage(addressHint('jane@gmial.com').message ?? '')).toBe(true);
    expect(isSoftAddressMessage(addressHint('office@harborpt.qqq').message ?? '')).toBe(true);
    expect(isSoftAddressMessage(addressHint('office@harborpt.cmo').message ?? '')).toBe(true);
    expect(isSoftAddressMessage(MAILBOX_UNCONFIRMED)).toBe(true);
    expect(isSoftAddressMessage(ADDRESS_REFUSED)).toBe(false);
  });

  it('counts a swap of neighbours as one edit, and stops past its limit', () => {
    expect(editDistance('gmial.com', 'gmail.com', 2)).toBe(1);
    expect(editDistance('abc', 'abc', 1)).toBe(0);
    expect(editDistance('harborpt.example', 'gmail.com', 2)).toBe(3);
  });

  it('holds a dated snapshot of the endings in use, ASCII only', () => {
    expect(TLD_SNAPSHOT_VERSION).toMatch(/\d{4}-\d{2}-\d{2}$/);
    expect(TOP_LEVEL_DOMAINS.size).toBeGreaterThan(1_000);
    for (const tld of ['com', 'net', 'org', 'us', 'health', 'xn--p1ai']) {
      expect(TOP_LEVEL_DOMAINS.has(tld), tld).toBe(true);
    }
    expect([...TOP_LEVEL_DOMAINS].every((tld) => /^[a-z0-9-]+$/.test(tld))).toBe(true);
  });
});

/** A resolver whose answers are given per lookup: records, or an error code as node:dns throws it. */
function resolver(answers: { readonly mx?: readonly MxRecord[] | string; readonly a?: readonly string[] | string; readonly aaaa?: readonly string[] | string; readonly delayMs?: number }): DomainResolver {
  const answer = <T>(value: readonly T[] | string | undefined): Promise<readonly T[]> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (typeof value === 'string') {
          reject(Object.assign(new Error(value), { code: value }));
        } else {
          resolve(value ?? []);
        }
      }, answers.delayMs ?? 0);
    });
  return { resolveMx: () => answer(answers.mx), resolve4: () => answer(answers.a), resolve6: () => answer(answers.aaaa) };
}

describe('the DNS check', () => {
  it('refuses a domain that does not exist, a null MX, and one with no MX and no address', async () => {
    expect(await checkMailDomain(resolver({ mx: 'ENOTFOUND' }), 'nowhere.test')).toBe('refuse');
    expect(await checkMailDomain(resolver({ mx: [{ exchange: '', priority: 0 }] }), 'nomail.test')).toBe('refuse');
    expect(await checkMailDomain(resolver({ mx: 'ENODATA', a: 'ENODATA', aaaa: 'ENODATA' }), 'bare.test')).toBe('refuse');
  });

  it('accepts an MX, or failing one an A or AAAA record', async () => {
    expect(await checkMailDomain(resolver({ mx: [{ exchange: 'mx.harborpt.test', priority: 10 }] }), 'harborpt.test')).toBe('accept');
    expect(await checkMailDomain(resolver({ mx: 'ENODATA', a: ['192.0.2.10'], aaaa: 'ENODATA' }), 'aonly.test')).toBe('accept');
    expect(await checkMailDomain(resolver({ mx: [], aaaa: ['2001:db8::1'] }), 'v6only.test')).toBe('accept');
  });

  it('says unavailable, which the caller accepts, for a timeout or a server failure, within its one deadline', async () => {
    expect(await checkMailDomain(resolver({ mx: 'ETIMEOUT' }), 'slow.test')).toBe('unavailable');
    expect(await checkMailDomain(resolver({ mx: 'ESERVFAIL' }), 'broken.test')).toBe('unavailable');
    const started = Date.now();
    expect(await checkMailDomain(resolver({ mx: [{ exchange: 'mx.late.test', priority: 10 }], delayMs: 500 }), 'late.test', 50)).toBe('unavailable');
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('refuses .invalid with the stand-in development uses, and accepts every other domain', async () => {
    expect(await checkMailDomain(LOCAL_DOMAIN_RESOLVER, 'practice.invalid')).toBe('refuse');
    expect(await checkMailDomain(LOCAL_DOMAIN_RESOLVER, 'simulator.amazonses.com')).toBe('accept');
  });
});
