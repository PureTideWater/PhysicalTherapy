import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { forgetRefusalUrl, pageOfRefusal } from '../forget-refusal';
import { MappingNotice, NOTICE_KEY, heldNotice } from './held-notice';

/**
 * A mapping screen's notice is said once (PR #95 review UX-7: "notices never replay on refresh or Back") and is a note,
 * never an alert (C-2). Its hold across a router refresh is heldNotice, a pure function; the address bar's rewrite is
 * forgetRefusalUrl with the notice key, which keeps every other parameter (the list's filters). Every ID is SYNTHETIC.
 */

// Outside the app router both hooks are null; the static render below reads them as the page ''.
vi.mock('next/navigation', () => ({ usePathname: () => null, useSearchParams: () => null }));

const MAPPED = { key: 'mapped', title: 'Mapped', text: 'The plan is mapped from the date given.' };
const PRICED = { key: 'priced_again', title: 'Re-runs created', text: 'Accept each on its page after its list of changes.' };
const LIST = '/p/00000000-0000-4000-8000-0000000000c1/mapping';

describe('a mapping screen’s notice (UX-7, C-2)', () => {
  it('is a note (role="status"), never an alert, with its key, title and text', () => {
    const html = renderToStaticMarkup(<MappingNotice notice={MAPPED} />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('data-notice="mapped"');
    expect(html).toContain('Mapped');
    expect(html).toContain('The plan is mapped from the date given.');
    expect(renderToStaticMarkup(<MappingNotice notice={null} />)).toBe('');
  });

  it('leaves the address bar once shown, keeping the list’s view and payer (UX-7)', () => {
    expect(forgetRefusalUrl(`https://app.example${LIST}?view=all&payer=00000000-0000-4000-8000-0000000000a1&notice=priced_again`, NOTICE_KEY)).toBe(
      `${LIST}?view=all&payer=00000000-0000-4000-8000-0000000000a1`,
    );
    expect(forgetRefusalUrl(`https://app.example${LIST}?view=all`, NOTICE_KEY)).toBeNull();
  });

  it('is held through a router refresh that drops it while the person stays on the page, and let go elsewhere or on a reload (UX-7)', () => {
    const page = pageOfRefusal(LIST, 'view=all&notice=priced_again', NOTICE_KEY);
    // The page is the same with the notice and without it, so a refresh after the rewrite keeps the notice held.
    expect(pageOfRefusal(LIST, 'view=all', NOTICE_KEY)).toBe(page);
    const shown = heldNotice(null, PRICED, page);
    expect(shown).toEqual({ notice: PRICED, page });
    expect(heldNotice(shown, null, page)).toBe(shown);
    expect(heldNotice(shown, PRICED, page)).toBe(shown);
    // Another filter or another page lets it go; a reload starts with nothing held and no notice in the URL.
    expect(heldNotice(shown, null, pageOfRefusal(LIST, 'view=mapped', NOTICE_KEY))).toBeNull();
    expect(heldNotice(null, null, page)).toBeNull();
    // A new notice replaces the held one.
    expect(heldNotice(shown, MAPPED, page)).toEqual({ notice: MAPPED, page });
  });
});
