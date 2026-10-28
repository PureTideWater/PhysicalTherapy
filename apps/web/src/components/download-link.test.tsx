import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shownRefusal } from '../lib/http/download-refusal-words';
import { DownloadLink, DownloadLinks, NoticePlace, type Said, attachmentFilename, fetchDownload, focusIsFree, isPlainClick, nextSaid, saveFile } from './download-link';

/**
 * A download fetched in place on a page that holds what a reload would lose (docs/adr/0079; test matrix DLR-04; UX
 * review of PR #78, UX-DLR-02, UX-DLR-16): the file saved under the route's own name, a refusal read from the JSON
 * outcome a script gets and said in the product's words, above the links or below them, the fetch said in a status
 * while it runs, anything else sent to the link as a navigation, and the link itself kept for a new tab or a page
 * without script. The click and the focus need a browser (the e2e runs them); the request, its reading, the save and
 * what the place says after each thing a link tells it are tested here. Written by hand.
 */

const DOCUMENT = '00000000-0000-4000-8000-0000000000d1';
const HREF = `/p/00000000-0000-4000-8000-0000000000a1/uploads/${DOCUMENT}/report?from=uploads`;

/** A fetch that answers once with this response, and the requests it was asked. */
function answering(response: Response | Error) {
  return vi.fn<typeof fetch>(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
}

function outcome(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the name a fetched file is saved under', () => {
  it('is the attachment’s filename, as handler.ts names every download', () => {
    expect(attachmentFilename(`attachment; filename="receipt-${DOCUMENT}.csv"`, HREF)).toBe(`receipt-${DOCUMENT}.csv`);
    expect(attachmentFilename('attachment; filename=packet.pdf', HREF)).toBe('packet.pdf');
    expect(attachmentFilename('ATTACHMENT;FILENAME="a b.csv"', HREF)).toBe('a b.csv');
  });

  it('is the link’s last path segment when the response names none, never its query', () => {
    expect(attachmentFilename(null, HREF)).toBe('report');
    expect(attachmentFilename('attachment', '/p/x/cases/y/packet/z/review/csv#files')).toBe('csv');
    expect(attachmentFilename('attachment; filename=""', HREF)).toBe('report');
  });
});

describe('a download fetched in place', () => {
  it('asks as a script does, so the route answers a refusal with its JSON outcome, never the 303', async () => {
    const fetcher = answering(outcome(429, { status: 'rate_limited', retryAfterSeconds: 125 }, { 'retry-after': '125' }));
    await fetchDownload(HREF, fetcher);
    expect(fetcher).toHaveBeenCalledWith(HREF, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  });

  it('is the file, under the route’s name, when the route sends an attachment', async () => {
    const response = new Response('row,reason\n1,EDI_SYNTAX\n', { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="receipt-${DOCUMENT}.csv"` } });
    const fetched = await fetchDownload(HREF, answering(response));
    expect(fetched.kind).toBe('file');
    if (fetched.kind === 'file') {
      expect(fetched.filename).toBe(`receipt-${DOCUMENT}.csv`);
      expect(await fetched.blob.text()).toBe('row,reason\n1,EDI_SYNTAX\n');
    }
  });

  it('is the refusal a page says, read from the outcome as closed codes: the wait in whole minutes, a field by its name', async () => {
    expect(await fetchDownload(HREF, answering(outcome(429, { status: 'rate_limited', retryAfterSeconds: 125 })))).toEqual({
      kind: 'refused',
      refusal: { status: 'rate_limited', fields: [], retryMinutes: 3 },
    });
    expect(await fetchDownload(HREF, answering(outcome(403, { status: 'forbidden', message: 'Viewer cannot export line-level PHI', roles: ['viewer'] })))).toEqual({
      kind: 'refused',
      refusal: { status: 'forbidden', fields: [], retryMinutes: null },
    });
    expect(await fetchDownload(HREF, answering(outcome(404, { status: 'not_found' })))).toEqual({ kind: 'refused', refusal: { status: 'not_found', fields: [], retryMinutes: null } });
    expect(await fetchDownload(HREF, answering(outcome(400, { status: 'invalid', issues: [{ field: 'from', message: 'Call 555-0100' }, { field: 'a.b', message: 'x' }] })))).toEqual({
      kind: 'refused',
      refusal: { status: 'invalid', fields: ['from'], retryMinutes: null },
    });
  });

  it('says its refusal in the product’s words, the same a page the 303 sent back says', async () => {
    const fetched = await fetchDownload(HREF, answering(outcome(429, { status: 'rate_limited', retryAfterSeconds: 125 })));
    expect(fetched.kind === 'refused' ? shownRefusal(fetched.refusal) : null).toEqual({
      status: 'rate_limited',
      retryMinutes: 3,
      title: 'Not downloaded',
      body: 'Too many downloads in a short time. Wait 3 minutes and try again.',
    });
  });

  it('goes to the link for anything the notice cannot settle: a session that ended, maintenance, a body that is not an outcome, a failed request, a success that is not a file', async () => {
    const navigate = { kind: 'navigate' };
    expect(await fetchDownload(HREF, answering(outcome(401, { status: 'unauthenticated' })))).toEqual(navigate);
    expect(await fetchDownload(HREF, answering(outcome(403, { status: 'mfa_required' })))).toEqual(navigate);
    expect(await fetchDownload(HREF, answering(outcome(503, { status: 'maintenance' })))).toEqual(navigate);
    expect(await fetchDownload(HREF, answering(new Response('<!doctype html><title>Bad gateway</title>', { status: 502, headers: { 'content-type': 'text/html' } })))).toEqual(navigate);
    expect(await fetchDownload(HREF, answering(new TypeError('Failed to fetch')))).toEqual(navigate);
    expect(await fetchDownload(HREF, answering(outcome(200, { receipts: [] })))).toEqual(navigate);
  });
});

describe('saving a fetched file', () => {
  it('clicks a hidden link to the file’s object URL that names it, once, and revokes the URL on the next task', () => {
    vi.useFakeTimers();
    const link = { href: '', download: '', hidden: false, click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append } });
    vi.stubGlobal('window', { setTimeout: (run: () => void) => setTimeout(run) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/file-1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const blob = new Blob(['row,reason\n']);
    saveFile(blob, `receipt-${DOCUMENT}.csv`);
    expect(create).toHaveBeenCalledWith(blob);
    expect(link).toMatchObject({ href: 'blob:http://localhost/file-1', download: `receipt-${DOCUMENT}.csv`, hidden: true });
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    // The browser takes the file from the click; the URL goes only after it.
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/file-1');
  });
});

describe('the click a download link takes over', () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

  it('is the primary button with no modifier; a new tab, a window, a save or a middle click stays the browser’s', () => {
    expect(isPlainClick(plain)).toBe(true);
    for (const asked of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      expect(isPlainClick({ ...plain, ...asked })).toBe(false);
    }
  });
});

/** The place's status as it renders while no file is fetched: mounted, empty, and out of the layout's flow. */
const IDLE = '<p role="status" class="text-sm text-muted-foreground empty:sr-only"></p>';

describe('where a refusal said in place may take the focus', () => {
  const body = { closest: () => null, querySelector: () => null };
  const on = (link: boolean) => ({ closest: (selector: string) => (link && selector === '[data-download-link]' ? {} : null), querySelector: () => null });
  /** A focused element with a download link inside it, or with none: the table's scroller, or another table's. */
  const around = (link: boolean) => ({ closest: () => null, querySelector: (selector: string) => (link && selector === '[data-download-link]' ? {} : null) });

  it('takes it from a download link or from nowhere, never from where the person moved on to', () => {
    expect(focusIsFree(null, body)).toBe(true);
    expect(focusIsFree(body, body)).toBe(true);
    expect(focusIsFree(on(true), body)).toBe(true);
    // The version form's narrative, typed in while the file was fetched, keeps the focus.
    expect(focusIsFree(on(false), body)).toBe(false);
  });

  it('takes it from the scroller that holds the link, where Safari leaves a click on a link in a table that overflows (docs/adr/0078)', () => {
    expect(focusIsFree(around(true), body)).toBe(true);
    // Another table's scroller, which the person moved to while the file was fetched, keeps the focus.
    expect(focusIsFree(around(false), body)).toBe(false);
  });
});

describe('a download link and the place its refusal is said', () => {
  it('is a plain link to the file, without download, so a new tab or a page without script still gets the 303 back to its page', () => {
    const markup = renderToStaticMarkup(
      <DownloadLinks>
        <DownloadLink className="underline" href={HREF}>
          Report
        </DownloadLink>
      </DownloadLinks>,
    );
    // The progress cursor shows only while the link is aria-busy, its file being fetched.
    expect(markup).toBe(`${IDLE}<a class="aria-busy:cursor-progress underline" href="${HREF}" data-download-link="">Report</a>`);
    // No download attribute (data-download-link is the link's own mark, not the attribute).
    expect(markup).not.toMatch(/\sdownload(?:[=\s>])/);
    expect(markup).not.toContain('aria-busy=');
  });

  it('says the notice the page arrived with until a download in place says its own, above the links', () => {
    const markup = renderToStaticMarkup(
      <DownloadLinks arrived={<p data-arrived>Arrived</p>}>
        <DownloadLink href={HREF}>Report</DownloadLink>
      </DownloadLinks>,
    );
    expect(markup).toBe(`${IDLE}<p data-arrived="true">Arrived</p><a class="aria-busy:cursor-progress" href="${HREF}" data-download-link="">Report</a>`);
  });

  it('says it below the links when they are in a page’s header (the reviewer checklist’s), and inside another one below its own links, the status the outer one’s', () => {
    const below = renderToStaticMarkup(
      <DownloadLinks arrived={<p data-arrived>Arrived</p>} below>
        <DownloadLink href={HREF}>Report</DownloadLink>
      </DownloadLinks>,
    );
    expect(below).toBe(`<a class="aria-busy:cursor-progress" href="${HREF}" data-download-link="">Report</a>${IDLE}<p data-arrived="true">Arrived</p>`);
    const inner = renderToStaticMarkup(
      <DownloadLinks>
        <DownloadLinks arrived={<p data-arrived>Arrived</p>} below>
          <DownloadLink href={HREF}>Report</DownloadLink>
        </DownloadLinks>
      </DownloadLinks>,
    );
    expect(inner).toBe(`${IDLE}<a class="aria-busy:cursor-progress" href="${HREF}" data-download-link="">Report</a><p data-arrived="true">Arrived</p>`);
  });

  it('leaves the place to the outer one when one is inside another (the Uploads screen’s, above its receipt list’s own), one status for both', () => {
    const markup = renderToStaticMarkup(
      <DownloadLinks arrived={<p data-arrived>Arrived</p>}>
        <section>
          <DownloadLinks>
            <DownloadLink href={HREF}>Report</DownloadLink>
          </DownloadLinks>
        </section>
      </DownloadLinks>,
    );
    expect(markup).toBe(`${IDLE}<p data-arrived="true">Arrived</p><section><a class="aria-busy:cursor-progress" href="${HREF}" data-download-link="">Report</a></section>`);
  });
});

describe('what the place says while a file is fetched in place (UX-DLR-16)', () => {
  const ARRIVED = <p data-arrived>Arrived</p>;
  const REFUSAL = shownRefusal({ status: 'rate_limited', fields: [], retryMinutes: 3 });
  const place = (said: Said | null) => renderToStaticMarkup(<NoticePlace said={said} arrived={ARRIVED} />);

  it('keeps its status mounted and empty while no file is fetched, the notice the page arrived with beside it', () => {
    expect(place(null)).toBe(`${IDLE}<p data-arrived="true">Arrived</p>`);
  });

  it('says the fetch in its status while it runs, in place of the notice before it, and clears it as the file is saved', () => {
    const fetching = nextSaid(null, { kind: 'fetching' });
    expect(place(fetching)).toBe('<p role="status" class="text-sm text-muted-foreground empty:sr-only">Downloading the file…</p>');
    const saved = nextSaid(nextSaid(fetching, { kind: 'said', notice: null }), { kind: 'fetched' });
    expect(place(saved)).toBe(IDLE);
  });

  it('clears the status as a refusal comes back, and the refusal’s alert takes the place', () => {
    const refused = nextSaid(nextSaid(nextSaid(null, { kind: 'fetching' }), { kind: 'said', notice: REFUSAL }), { kind: 'fetched' });
    const markup = place(refused);
    expect(markup.startsWith(`${IDLE}<div>`)).toBe(true);
    expect(markup).toMatch(/<div [^>]*role="alert"[^>]*data-download-refusal="rate_limited"/);
    expect(markup).toContain('Not downloaded');
    expect(markup).toContain('Too many downloads in a short time. Wait 3 minutes and try again.');
    expect(markup).not.toContain('Downloading');
    expect(markup).not.toContain('data-arrived');
    // The next attempt takes the place from the refusal while it runs.
    expect(place(nextSaid(refused, { kind: 'fetching' }))).toBe('<p role="status" class="text-sm text-muted-foreground empty:sr-only">Downloading the file…</p>');
  });

  it('says the fetch while any link inside is still fetching, and counts each refusal, so one in the same words is a new notice', () => {
    const both = nextSaid(nextSaid(null, { kind: 'fetching' }), { kind: 'fetching' });
    const first = nextSaid(nextSaid(both, { kind: 'said', notice: REFUSAL }), { kind: 'fetched' });
    expect(first).toEqual({ notice: REFUSAL, attempt: 1, fetching: 1 });
    expect(place(first)).toContain('Downloading the file…');
    expect(place(first)).toContain('data-download-refusal="rate_limited"');
    const second = nextSaid(nextSaid(first, { kind: 'said', notice: REFUSAL }), { kind: 'fetched' });
    expect(second).toEqual({ notice: REFUSAL, attempt: 2, fetching: 0 });
    expect(place(second).startsWith(`${IDLE}<div>`)).toBe(true);
    // A fetch that ends in a navigation says no outcome; the count never goes below none.
    expect(nextSaid(second, { kind: 'fetched' })).toEqual(second);
  });
});
