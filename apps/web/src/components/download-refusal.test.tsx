import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DOWNLOAD_REFUSALS, downloadRefusal } from '../lib/http/download-refusal';
import { DownloadRefusal, downloadRefusalWords } from './download-refusal';

/**
 * A refused download's notice, rendered as the pages render it (docs/adr/0079; test matrix DLR-01, DLR-04): the
 * product's words for each closed code, focused on arrival and clear of the sticky header, and never a word from the
 * URL. Written by hand.
 */

/** The markup's text, as a reader meets it. */
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', '’')
    .replace(/\s+/g, ' ')
    .trim();

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
    expect(markup).toContain('scroll-mt-18');
    expect(markup).toContain(`data-download-refusal="${status}"`);
    const words = refusal === null ? undefined : downloadRefusalWords(refusal);
    expect(text(markup)).toBe(`${words?.title ?? ''} ${words?.body ?? ''}`);
    // A next step in each: try again, reload, or who manages roles.
    expect(words?.body).toMatch(/try again|Reload the page|administrator|billing page/);
  });

  it('names the role’s limit as the product does, and the console’s own on the evidence export', () => {
    const forbidden = downloadRefusal({ refused: 'forbidden' });
    expect(text(renderToStaticMarkup(<DownloadRefusal refusal={forbidden} />))).toBe(
      'Not available to your role Your role cannot download this file. Users and roles are managed by your organization’s administrator.',
    );
    expect(text(renderToStaticMarkup(<DownloadRefusal refusal={forbidden} surface="console" />))).toBe('Not available to your role Only a platform administrator can download the evidence export.');
  });

  it('says the wait in minutes as a refused form does, and a few minutes when the link carries none', () => {
    const wait = (retry?: string) => text(renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'rate_limited', ...(retry === undefined ? {} : { retry }) })} />));
    expect(wait('1')).toContain('Wait 1 minute and try again.');
    expect(wait('3')).toContain('Wait 3 minutes and try again.');
    expect(wait()).toContain('Wait a few minutes and try again.');
    expect(renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'rate_limited', retry: '3' })} />)).toContain('data-retry-minutes="3"');
  });

  it('takes the page’s own words for an invalid refusal, and leaves the focus to a refused field when told to', () => {
    const invalid = downloadRefusal({ refused: 'invalid', fields: 'codes' });
    const markup = renderToStaticMarkup(<DownloadRefusal refusal={invalid} invalid="Check the procedure codes marked below." autoFocus={false} />);
    expect(text(markup)).toBe('Not downloaded Check the procedure codes marked below.');
    expect(markup).not.toContain('autofocus');
    // The page's words replace an invalid refusal's only.
    expect(text(renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'not_found' })} invalid="Check the procedure codes marked below." />))).not.toContain('procedure codes');
  });

  it('never says a word the URL carries: an unknown field, code or wait reads the general words', () => {
    const markup = renderToStaticMarkup(<DownloadRefusal refusal={downloadRefusal({ refused: 'invalid', fields: 'Your_account_is_locked,codes', retry: '5' })} />);
    expect(markup).not.toMatch(/locked|Your_account|codes|5/);
    expect(text(markup)).toBe('Not downloaded This file could not be made from what was asked. Reload the page and try again.');
  });
});
