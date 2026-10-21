import { OFFERED_DECLINED_REASONS, PAID_CLICKS, PROSPECT_DECLINED_REASONS, PROSPECT_SOURCES } from '@tp/db/runtime';
import { describe, expect, it } from 'vitest';

import { DECLINED_REASON_LABELS } from '../routes/console-onboarding';
import { PROSPECT_SOURCE_LABELS, PROSPECT_SOURCE_OPTIONS } from '../routes/onboarding';
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  NO_ATTRIBUTION,
  PAID_CLICK_PARAMETERS,
  attributionFromUrl,
  attributionValues,
  decodeAttribution,
  encodeAttribution,
  firstTouch,
  normaliseCampaignCode,
  paidClickKind,
  readAttribution,
} from './attribution';
import type { CookieJar } from './route';

/**
 * SCR-12, the attribution cookie (audit #57; the founder's ruling of 2026-10-20, decision 11; docs/adr/0062): campaign
 * codes normalised and shape-checked, the kind of paid click from a click-ID parameter's presence (never its value),
 * the cookie first-party, 30 days and first touch, and read back checked again. And the closed lists the forms offer:
 * how a prospect heard of us (decision 8) and why a request was declined (decision 9). SYNTHETIC values.
 */

const url = (query: string, path = '/screening') => new URL(`https://app.synthetic.test${path}?${query}`);

describe('campaign codes', () => {
  it('lower-cases and trims them, turns each run of white space or + into one hyphen, and keeps the shape every utm_* CHECK holds', () => {
    expect(normaliseCampaignCode('  Spring Webinar  ')).toBe('spring-webinar');
    expect(normaliseCampaignCode('APTA+Chapter++News')).toBe('apta-chapter-news');
    expect(normaliseCampaignCode('cpc')).toBe('cpc');
    expect(normaliseCampaignCode('fall_2026.v2')).toBe('fall_2026.v2');
    expect(normaliseCampaignCode('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('drops a code with an identifier’s shape: a member ID, a Medicare Beneficiary Identifier, a phone number, a date of birth, digits alone', () => {
    for (const raw of ['MBR123456789', 'mbr-123-456-789', '1EG4-TE5-MK73', '1eg4te5mk73', '555-867-5309', '555.867.5309', '1980-04-12', '19800412', '04/12/1980', '123-45-6789', '20261021', '42']) {
      expect(normaliseCampaignCode(raw), raw).toBeNull();
    }
    // A link's own labels keep their digits: a year, a version, a quarter.
    expect(normaliseCampaignCode('spring-2026')).toBe('spring-2026');
    expect(normaliseCampaignCode('q4-2026-webinar')).toBe('q4-2026-webinar');
    expect(normaliseCampaignCode('fall_2026.v2')).toBe('fall_2026.v2');
    // A name has no shape a check can see: it passes as normalised, and the database keeps an unlisted code as 'other' on every row.
    expect(normaliseCampaignCode('Jane Doe')).toBe('jane-doe');
    // A link that carries them sets none of them; read back from a cookie, they are dropped the same way.
    expect(attributionFromUrl(url('utm_source=mbr123456789&utm_campaign=1980-04-12'))).toBeNull();
    expect(decodeAttribution('s=mbr123456789&m=email&c=1eg4te5mk73')).toEqual({ source: null, medium: 'email', campaign: null, click: null });
  });

  it('drops anything that is not a code: empty, too long, an email address, a leading mark or another script', () => {
    for (const raw of [null, undefined, '', '   ', 'a'.repeat(65), 'jane.doe@synthetic.test', '-leading', '.dot', 'naïve', 'semi;colon', 'slash/path', 'percent%20']) {
      expect(normaliseCampaignCode(raw), String(raw)).toBeNull();
    }
  });
});

describe('the kind of paid click', () => {
  it('is named by the presence of a click-ID parameter, search before social, and never reads its value', () => {
    for (const name of PAID_CLICK_PARAMETERS.paid_search) {
      expect(paidClickKind(new URLSearchParams(`${name}=SYNTHETICCLICK123`))).toBe('paid_search');
      expect(paidClickKind(new URLSearchParams(`${name}=`))).toBe('paid_search');
    }
    for (const name of PAID_CLICK_PARAMETERS.paid_social) {
      expect(paidClickKind(new URLSearchParams(`${name}=SYNTHETICCLICK123`))).toBe('paid_social');
    }
    expect(paidClickKind(new URLSearchParams('fbclid=1&gclid=2'))).toBe('paid_search');
    expect(paidClickKind(new URLSearchParams('utm_source=x'))).toBeNull();
    expect(Object.keys(PAID_CLICK_PARAMETERS)).toEqual([...PAID_CLICKS]);
  });
});

describe('the cookie', () => {
  it('holds the three codes and the kind of click, never the click ID, and reads back as it was written', () => {
    const attribution = attributionFromUrl(url('utm_source=LinkedIn&utm_medium=Paid+Social&utm_campaign=Fall%20Launch&li_fat_id=SYNTHETICCLICK123'));
    expect(attribution).toEqual({ source: 'linkedin', medium: 'paid-social', campaign: 'fall-launch', click: 'paid_social' });
    const value = encodeAttribution(attribution ?? NO_ATTRIBUTION);
    expect(value).toBe('s=linkedin&m=paid-social&c=fall-launch&k=paid_social');
    expect(value).not.toContain('SYNTHETICCLICK123');
    expect(decodeAttribution(value)).toEqual(attribution);
    // As the browser sends it back URL-encoded, too.
    expect(decodeAttribution(encodeURIComponent(value))).toEqual(attribution);
    expect(attributionValues(decodeAttribution(value))).toEqual(['linkedin', 'paid-social', 'fall-launch', 'paid_social']);
  });

  it('leaves out what a URL does not carry, and carries nothing for a URL with neither a valid code nor a paid click', () => {
    expect(attributionFromUrl(url('gclid=SYNTHETIC'))).toEqual({ source: null, medium: null, campaign: null, click: 'paid_search' });
    expect(encodeAttribution({ source: null, medium: 'email', campaign: null, click: null })).toBe('m=email');
    expect(attributionFromUrl(url('utm_source=jane.doe%40synthetic.test'))).toBeNull();
    expect(attributionFromUrl(url('page=2'))).toBeNull();
  });

  it('reads back only codes: anything a browser sends that is not one is dropped', () => {
    expect(decodeAttribution(undefined)).toEqual(NO_ATTRIBUTION);
    expect(decodeAttribution('')).toEqual(NO_ATTRIBUTION);
    expect(decodeAttribution('%E0%A4%A')).toEqual(NO_ATTRIBUTION);
    expect(decodeAttribution('x'.repeat(513))).toEqual(NO_ATTRIBUTION);
    expect(decodeAttribution('s=Jane%20Doe&m=email&c=a%40b&k=gclid')).toEqual({ source: null, medium: 'email', campaign: null, click: null });
    const jar: CookieJar = { get: (name) => (name === ATTRIBUTION_COOKIE ? 's=search&k=paid_search' : undefined), set: () => undefined, delete: () => undefined };
    expect(readAttribution(jar, 'dev')).toEqual({ source: 'search', medium: null, campaign: null, click: 'paid_search' });
    // A production server reads none until the cookie's review is recorded (docs/product/legal-surfaces.md).
    expect(readAttribution(jar, 'production')).toEqual(NO_ATTRIBUTION);
    expect(readAttribution(jar, 'staging')).toEqual({ source: 'search', medium: null, campaign: null, click: 'paid_search' });
  });

  it('is neither set nor read on a production server until its review is recorded, and is everywhere else', () => {
    const with_ = url('utm_source=newsletter&utm_medium=email');
    expect(firstTouch({ method: 'GET', url: with_, hasCookie: false, environment: 'production' })).toBeNull();
    expect(firstTouch({ method: 'GET', url: with_, hasCookie: false, environment: 'staging' })).toBe('s=newsletter&m=email');
  });

  it('is set on a page GET with attribution and no cookie yet, for 30 days, and never on a POST, an asset, /api or over one already set', () => {
    expect(ATTRIBUTION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    const with_ = url('utm_source=newsletter&utm_medium=email');
    expect(firstTouch({ method: 'GET', url: with_, hasCookie: false, environment: 'dev' })).toBe('s=newsletter&m=email');
    expect(firstTouch({ method: 'GET', url: with_, hasCookie: true, environment: 'dev' })).toBeNull();
    expect(firstTouch({ method: 'POST', url: with_, hasCookie: false, environment: 'dev' })).toBeNull();
    expect(firstTouch({ method: 'GET', url: url('utm_source=x', '/api/screening/opened'), hasCookie: false, environment: 'dev' })).toBeNull();
    expect(firstTouch({ method: 'GET', url: url('utm_source=x', '/api'), hasCookie: false, environment: 'dev' })).toBeNull();
    expect(firstTouch({ method: 'GET', url: url('utm_source=x', '/_next/data/build/page.json'), hasCookie: false, environment: 'dev' })).toBeNull();
    expect(firstTouch({ method: 'GET', url: url('page=2'), hasCookie: false, environment: 'dev' })).toBeNull();
    expect(firstTouch({ method: 'GET', url: url('utm_source=x', '/apiary'), hasCookie: false, environment: 'dev' })).toBe('s=x');
  });
});

describe('the closed lists the forms offer', () => {
  it('asks how a prospect heard of us from the nine answers of decision 8, a blank first, in the list’s order', () => {
    expect(PROSPECT_SOURCES).toEqual(['search', 'billing_firm', 'colleague', 'association', 'event', 'social', 'paidwhole_email', 'article', 'other']);
    expect(Object.keys(PROSPECT_SOURCE_LABELS)).toEqual([...PROSPECT_SOURCES]);
    expect(PROSPECT_SOURCE_OPTIONS.map((option) => option.value)).toEqual(['', ...PROSPECT_SOURCES]);
    expect(PROSPECT_SOURCE_LABELS.other).toBe('Something else');
    expect(new Set(Object.values(PROSPECT_SOURCE_LABELS)).size).toBe(PROSPECT_SOURCES.length);
  });

  it('offers the eleven decline reasons of decision 9, never not_recorded, each with its own label', () => {
    expect(OFFERED_DECLINED_REASONS).toHaveLength(11);
    expect(OFFERED_DECLINED_REASONS).not.toContain('not_recorded');
    expect(PROSPECT_DECLINED_REASONS).toEqual([...OFFERED_DECLINED_REASONS, 'not_recorded']);
    expect(Object.keys(DECLINED_REASON_LABELS).sort()).toEqual([...PROSPECT_DECLINED_REASONS].sort());
    expect(new Set(Object.values(DECLINED_REASON_LABELS)).size).toBe(PROSPECT_DECLINED_REASONS.length);
  });
});
