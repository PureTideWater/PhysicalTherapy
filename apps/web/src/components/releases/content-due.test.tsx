import { CONTENT_CALENDAR, type ContentCalendar, contentDue } from '@tp/rules/calendar';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ContentDue } from '../../lib/routes/rule-releases';
import { ContentDueSection, NOTHING_DUE, dueStatus } from './content-due';

/**
 * The console's Content due (audit #59; docs/adr/0071; test matrix RCC-08; fix round 2 of PR #49, UX-1, UX-2, UX-7,
 * UX-11, UX-12, UX-14): every item due is shown, commands or not, with its title as a heading, its sentences and its
 * next step; the calendar's review is said once; dates never break; the command blocks are named and reachable. The
 * items come from contentDue() over SYNTHETIC states written by hand.
 */

const window = (from: string, to: string | null) => ({ windows: [{ from, to }], newestFrom: from, newestRetrieved: '2026-09-01' });

const family = (id: ContentDue['families'][number]['family'], changes: Partial<ContentDue['families'][number]> = {}): ContentDue['families'][number] => ({
  family: id,
  title: CONTENT_CALENDAR.find((entry) => entry.family === id)?.title ?? id,
  loadedThrough: null,
  open: false,
  partly: false,
  loadedFrom: null,
  loaded: true,
  ...changes,
});

const text = (html: string) => html.replaceAll(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

describe('Content due on the console', () => {
  it('shows every item, with or without commands: its title as a heading, its sentences, its next step, then its commands (UX-1)', () => {
    // No release published, every calendar entry unreviewed: two items with no commands.
    const items = contentDue(CONTENT_CALENDAR, { releaseNo: null, inForce: {} }, '2026-11-20');
    expect(items.map((item) => [item.stage, item.commands.length])).toEqual([
      ['no_release', 0],
      ['calendar_unreviewed', 0],
    ]);
    const html = renderToStaticMarkup(<ContentDueSection due={{ releaseNo: null, items, families: [family('fee_schedule', { loaded: false })], problems: [] }} />);
    expect(html.match(/<h3 /g)).toHaveLength(2);
    expect(html).toContain('<h3 class="font-medium">No rule release is published</h3>');
    expect(html).toContain('<h3 class="font-medium">Content calendar: entries not reviewed</h3>');
    expect(text(html)).toContain('No rule release is published, so no content is judged here, only the calendar itself.');
    expect(text(html)).toContain('Prepare the first release from the drafts at L2 or higher (Drafts and prepared releases, below) and open its pull request; CI publishes it when the pull request merges.');
    // The unreviewed entries as a list, once, with the next step; never a word on each row.
    expect(html.match(/<li /g)).toHaveLength(CONTENT_CALENDAR.length);
    expect(text(html)).toContain('Review each entry listed against its source page, then set its review in a pull request, as section 5 of docs/runbooks/content-updates.md says.');
    expect(html).not.toContain('calendar entry not reviewed');
    expect(html).toContain(`<td class="py-1">${NOTHING_DUE}</td>`);
    // No separate "No rule release is published." paragraph beside the item.
    expect(html.match(/No rule release is published/g)).toHaveLength(2);
  });

  it('gives a family item its source and next step, keeps its date whole, and names its command block for the keyboard (UX-1, UX-2, UX-11)', () => {
    const reviewed: ContentCalendar = CONTENT_CALENDAR.map((entry) => ({ ...entry, review: { by: 'Synthetic Reviewer', on: '2026-10-01' } }));
    const items = contentDue(reviewed, { releaseNo: 4, inForce: { ncci_mue: window('2026-01-01', '2026-12-31') } }, '2027-01-05').filter((item) => item.family === 'ncci_mue');
    expect(items.map((item) => item.stage)).toEqual(['ended']);
    const html = renderToStaticMarkup(<ContentDueSection due={{ releaseNo: 4, items, families: [family('ncci_mue', { loadedThrough: '2026-12-31' })], problems: ['content/drafts/x.json: not JSON'] }} />);
    const [item] = items;
    expect(html).toContain(`<h3 class="font-medium">${item?.title ?? ''}</h3>`);
    expect(text(html)).toContain(item?.lines[0] ?? 'missing');
    expect(html).toContain('href="https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits"');
    expect(text(html)).toContain('Download every period the commands name from CMS, Medicare NCCI Medically Unlikely Edits (MUEs) and run them now: lines after 2026-12-31 are not priced until a release in force loads it.');
    expect(html).toContain('<span class="whitespace-nowrap font-mono tabular-nums">2026-12-31</span>');
    expect(html).toContain(`role="region" aria-label="Commands: ${item?.title ?? ''}" tabindex="0"`);
    expect(html).toContain('role="region" aria-label="Drafts and prepared releases that cannot be read" tabindex="0" data-state="due-problems"');
    expect(html.match(/focus-visible:ring-2/g)).toHaveLength(2);
    expect(text(html)).toContain('Run the commands from the root of the content checkout');
    // The family's cell is its row's header (UX-12).
    expect(html).toContain('<th scope="row" class="py-1 pr-3 font-normal">Medicare unit limits (MUE)</th>');
    expect(html).toContain('<td class="py-1">ended 2026-12-31</td>');
  });

  it('says "partly loaded" for a family some of whose contents are loaded, as the Releases page does (UX-7)', () => {
    const reviewed: ContentCalendar = CONTENT_CALENDAR.map((entry) => ({ ...entry, review: { by: 'Synthetic Reviewer', on: '2026-10-01' } }));
    const items = contentDue(reviewed, { releaseNo: 4, inForce: { locality_map: window('2026-01-01', '2026-12-31') } }, '2026-11-20').filter((item) => item.family === 'zip_locality');
    expect(items.map((item) => item.stage)).toEqual(['not_loaded']);
    const partly = family('zip_locality', { loaded: false, partly: true });
    expect(dueStatus(partly, items)).toBe('partly loaded');
    expect(dueStatus(family('zip_locality', { loaded: false }), items)).toBe('not loaded');
    const html = renderToStaticMarkup(<ContentDueSection due={{ releaseNo: 4, items, families: [partly], problems: [] }} />);
    expect(html).toContain('<td class="py-1 pr-3">partly loaded</td><td class="py-1">partly loaded</td>');
    expect(text(html)).toContain('Only part of ZIP code to Medicare locality is loaded: locality_map_plus_four has no window yet, so lines that need it are not priced.');
  });

  it('reads "Nothing is due." and "Nothing due" on every row when nothing is (UX-14)', () => {
    const html = renderToStaticMarkup(<ContentDueSection due={{ releaseNo: 4, items: [], families: [family('fee_schedule', { open: true })], problems: [] }} />);
    expect(html).toContain('Nothing is due.');
    expect(html).toContain('<td class="py-1 pr-3">in force, no end date</td><td class="py-1">Nothing due</td>');
    expect(html).not.toContain('—');
    expect(html).not.toContain('<h3');
  });
});
