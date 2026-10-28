import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DOWNLOAD_REFUSALS, downloadRefusal, downloadRefusalParams } from '../lib/http/download-refusal';
import { DownloadRefusal, NOT_DOWNLOADED, type ShownRefusal, downloadRefusalWords, shownRefusal } from './download-refusal';
import { REFUSAL_QUERY_KEYS, forgetRefusalUrl, pageOfRefusal } from './forget-refusal';
import { RefusalAlert, heldRefusal } from './refusal-notice';

/**
 * A refused download's notice, rendered as the pages render it (docs/adr/0079; test matrix DLR-01, DLR-04): the
 * product's words for each closed code, each titled "Not downloaded", focused on arrival and clear of the sticky header,
 * and never a word from the URL; once shown, the refusal and the page's own return-only keys leave the address bar
 * while the notice holds through a refresh of the same page. The effects need a browser (the e2e runs them); their URLs
 * and the notice they hold are pure, and tested here. Written by hand.
 */

/** The markup's text, as a reader meets it. */
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', '’')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The stylesheet's page-wide rule that keeps what takes the focus clear of the sticky header (h-14, 3.5rem) with a
 * 16 px gap (packages/ui styles.css; ADR 0077 D4), which the notice relies on in place of a margin of its own.
 */
const STYLES = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/ui/src/styles.css'), 'utf8');

describe('the notice of a refused download', () => {
  it('renders nothing when there is no refusal', () => {
    expect(renderToStaticMarkup(<DownloadRefusal refusal={null} />)).toBe('');
    expect(renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'Call 555-0100' })} />)).toBe('');
  });

  it.each(DOWNLOAD_REFUSALS)('says %s as an alert that takes the focus on arrival, clear of the sticky header', (status) => {
    const refusal = downloadRefusal({ refused: status, fields: 'codes', retry: '3' });
    const markup = renderToStaticMarkup(<DownloadRefusal refusal={refusal} />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('autofocus=""');
    // Clear of the header by the page's scroll-padding-top alone: a margin of its own would add to it (UX-DLR-11).
    expect(STYLES).toMatch(/\nhtml \{\n {2}scroll-padding-top: calc\(3\.5rem \+ 1rem\);\n\}/);
    expect(markup).not.toMatch(/\bscroll-m/);
    expect(markup).toContain(`data-download-refusal="${status}"`);
    const words = refusal === null ? undefined : downloadRefusalWords(refusal);
    expect(text(markup)).toBe(`${words?.title ?? ''} ${words?.body ?? ''}`);
    // The outcome first, as every refusal of an attempt says it ("Not done"); the cause and the next step follow.
    expect(words?.title).toBe(NOT_DOWNLOADED);
    expect(refusal === null ? undefined : downloadRefusalWords(refusal, 'console').title).toBe('Not downloaded');
    // A next step in each, on this page (a reload would not help: the refusal leaves the URL once shown).
    expect(words?.body).toMatch(/try again|again from this page|This page lists|administrator|billing page/i);
    expect(words?.body).not.toMatch(/Reload/);
  });

  it('says a role’s refusal as a refusal, with who to ask, and the console’s own words on the evidence export', () => {
    const forbidden = downloadRefusal({ refused: 'forbidden' });
    expect(text(renderToStaticMarkup(<DownloadRefusal refusal={forbidden} />))).toBe(
      'Not downloaded Your role cannot download this file. Ask your organization’s administrator, who manages users and roles.',
    );
    expect(text(renderToStaticMarkup(<DownloadRefusal refusal={forbidden} surface="console" />))).toBe('Not downloaded Only a platform administrator can download the evidence export.');
    // PermissionState's title stays the standing page state's own.
    expect(renderToStaticMarkup(<DownloadRefusal refusal={forbidden} />)).not.toContain('Not available to your role');
  });

  it('says the wait in minutes as a refused form does, and a few minutes when the link carries none', () => {
    const wait = (retry?: string) => text(renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'rate_limited', ...(retry === undefined ? {} : { retry }) })} />));
    expect(wait('1')).toContain('Wait 1 minute and try again.');
    expect(wait('3')).toContain('Wait 3 minutes and try again.');
    expect(wait()).toContain('Wait a few minutes and try again.');
    expect(renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'rate_limited', retry: '3' })} />)).toContain('data-retry-minutes="3"');
  });

  it('never says a word the URL carries: an unknown field, code or wait reads the general words', () => {
    const markup = renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'invalid', fields: 'Your_account_is_locked,codes', retry: '5' })} />);
    expect(markup).not.toMatch(/locked|Your_account|codes|5/);
    expect(text(markup)).toBe('Not downloaded This file could not be made from what was asked. Try the download again from this page.');
  });

  it('takes from the address bar exactly the keys the refusal is read from, and no other', () => {
    expect([...REFUSAL_QUERY_KEYS].sort()).toEqual(Object.keys(downloadRefusalParams.shape).sort());
  });

  it('looks the same said in place: a download fetched on the page says its refusal with the notice’s own alert', () => {
    for (const status of DOWNLOAD_REFUSALS) {
      const refusal = downloadRefusal({ refused: status, fields: 'codes', retry: '3' });
      if (refusal === null) {
        throw new Error(status);
      }
      const notice = shownRefusal(refusal, 'console');
      expect(notice).toEqual({ status, retryMinutes: refusal.retryMinutes, ...downloadRefusalWords(refusal, 'console') });
      expect(renderToStaticMarkup(<RefusalAlert notice={notice} className="mt-2" />)).toBe(renderToStaticMarkup(<DownloadRefusal refusal={refusal} surface="console" className="mt-2" />));
    }
  });

  it('renders the same notice when it names the page’s own keys to forget', () => {
    const refusal = downloadRefusal({ refused: 'rate_limited', retry: '3' });
    expect(renderToStaticMarkup(<DownloadRefusal refusal={refusal} forget={['payer', 'contract', 'codes']} />)).toBe(renderToStaticMarkup(<DownloadRefusal refusal={refusal} />));
    expect(renderToStaticMarkup(<DownloadRefusal refusal={null} forget={['list']} />)).toBe('');
  });
});

describe('the address bar once a refusal is shown', () => {
  const LETTER_KEPT = ['payer', 'contract', 'codes'];

  it('takes out the refusal’s keys and the page’s own it names, and keeps every other parameter and the fragment', () => {
    const coverage = 'https://app.synthetic.test/p/P/coverage?refused=rate_limited&retry=3&payer=A&contract=B&codes=97110&page=2#c';
    expect(forgetRefusalUrl(coverage, LETTER_KEPT)).toBe('/p/P/coverage?page=2#c');
    expect(forgetRefusalUrl(coverage)).toBe('/p/P/coverage?payer=A&contract=B&codes=97110&page=2#c');
    expect(forgetRefusalUrl('https://app.synthetic.test/p/P/reports?refused=not_found&list=documents&documents=2', ['list'])).toBe('/p/P/reports?documents=2');
    expect(forgetRefusalUrl('https://app.synthetic.test/p/P/reports?refused=forbidden')).toBe('/p/P/reports');
  });

  it('replaces nothing when the URL holds none of them', () => {
    expect(forgetRefusalUrl('https://app.synthetic.test/p/P/reports?page=2')).toBeNull();
    expect(forgetRefusalUrl('https://app.synthetic.test/p/P/reports?page=2', ['list'])).toBeNull();
  });

  it('reads the same page before the refusal leaves the URL and after, and another page for other parameters', () => {
    const arrived = pageOfRefusal('/p/P/coverage', 'refused=rate_limited&retry=3&payer=A&codes=97110&page=2', LETTER_KEPT);
    expect(pageOfRefusal('/p/P/coverage', 'page=2', LETTER_KEPT)).toBe(arrived);
    expect(pageOfRefusal('/p/P/coverage', 'page=3', LETTER_KEPT)).not.toBe(arrived);
    expect(pageOfRefusal('/p/P/coverage', 'refused=rate_limited&page=2&payer=A')).not.toBe(arrived);
    expect(pageOfRefusal('/p/P/cases/C/packet', 'refused=not_found&version=V1')).not.toBe(pageOfRefusal('/p/P/cases/C/packet', 'version=V2'));
  });
});

describe('the notice held through a refresh of its page', () => {
  const NOTICE: ShownRefusal = { status: 'rate_limited', retryMinutes: 3, title: NOT_DOWNLOADED, body: 'Too many downloads in a short time. Wait 3 minutes and try again.' };
  const PAGE = '/p/P/uploads?';

  it('holds the notice the page arrived with while the person stays on that page, and lets it go on another', () => {
    const arrived = heldRefusal(null, NOTICE, PAGE);
    expect(arrived).toEqual({ notice: NOTICE, page: PAGE });
    // The same render again, and a refresh once the refusal has left the URL: the same held notice, so no state is set.
    expect(heldRefusal(arrived, { ...NOTICE }, PAGE)).toBe(arrived);
    expect(heldRefusal(arrived, null, PAGE)).toBe(arrived);
    // Other parameters of the page (a version link), or another page: let go.
    expect(heldRefusal(arrived, null, '/p/P/uploads?page=2')).toBeNull();
    expect(heldRefusal(null, null, PAGE)).toBeNull();
  });

  it('takes a new refusal’s notice in place of the one held', () => {
    const arrived = heldRefusal(null, NOTICE, PAGE);
    const forbidden: ShownRefusal = { status: 'forbidden', retryMinutes: null, title: NOT_DOWNLOADED, body: 'Your role cannot download this file.' };
    expect(heldRefusal(arrived, forbidden, PAGE)).toEqual({ notice: forbidden, page: PAGE });
    expect(heldRefusal(arrived, { ...NOTICE, retryMinutes: 5 }, PAGE)).toEqual({ notice: { ...NOTICE, retryMinutes: 5 }, page: PAGE });
    expect(heldRefusal(arrived, NOTICE, '/p/P/uploads?page=2')).toEqual({ notice: NOTICE, page: '/p/P/uploads?page=2' });
  });
});
