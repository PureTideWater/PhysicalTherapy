import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shownRefusal } from '../lib/http/download-refusal-words';
import { DownloadLink, DownloadLinks, attachmentFilename, fetchDownload, isPlainClick, saveFile } from './download-link';

/**
 * A download fetched in place on a page that holds what a reload would lose (docs/adr/0079; test matrix DLR-04; UX
 * review of PR #78, UX-DLR-02): the file saved under the route's own name, a refusal read from the JSON outcome a
 * script gets and said in the product's words, above the links or below them, anything else sent to the link as a
 * navigation, and the link itself kept for a new tab or a page without script. The click and the focus need a browser
 * (the e2e runs them); the request, its reading and the save are tested here. Written by hand.
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

describe('a download link and the place its refusal is said', () => {
  it('is a plain link to the file, without download, so a new tab or a page without script still gets the 303 back to its page', () => {
    const markup = renderToStaticMarkup(
      <DownloadLinks>
        <DownloadLink className="underline" href={HREF}>
          Report
        </DownloadLink>
      </DownloadLinks>,
    );
    expect(markup).toBe(`<a class="underline" href="${HREF}">Report</a>`);
    expect(markup).not.toContain('download');
  });

  it('says the notice the page arrived with until a download in place says its own, above the links', () => {
    const markup = renderToStaticMarkup(
      <DownloadLinks arrived={<p data-arrived>Arrived</p>}>
        <DownloadLink href={HREF}>Report</DownloadLink>
      </DownloadLinks>,
    );
    expect(markup).toBe(`<p data-arrived="true">Arrived</p><a href="${HREF}">Report</a>`);
  });

  it('says it below the links when they are in a page’s header (the reviewer checklist’s), inside another one too', () => {
    const below = renderToStaticMarkup(
      <DownloadLinks arrived={<p data-arrived>Arrived</p>} below>
        <DownloadLink href={HREF}>Report</DownloadLink>
      </DownloadLinks>,
    );
    expect(below).toBe(`<a href="${HREF}">Report</a><p data-arrived="true">Arrived</p>`);
    const inner = renderToStaticMarkup(
      <DownloadLinks>
        <DownloadLinks arrived={<p data-arrived>Arrived</p>} below>
          <DownloadLink href={HREF}>Report</DownloadLink>
        </DownloadLinks>
      </DownloadLinks>,
    );
    expect(inner).toBe(below);
  });

  it('leaves the place to the outer one when one is inside another (the Uploads screen’s, above its receipt list’s own)', () => {
    const markup = renderToStaticMarkup(
      <DownloadLinks arrived={<p data-arrived>Arrived</p>}>
        <section>
          <DownloadLinks>
            <DownloadLink href={HREF}>Report</DownloadLink>
          </DownloadLinks>
        </section>
      </DownloadLinks>,
    );
    expect(markup).toBe(`<p data-arrived="true">Arrived</p><section><a href="${HREF}">Report</a></section>`);
  });
});
