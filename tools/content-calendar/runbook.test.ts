import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CONTENT_CALENDAR } from '@tp/rules/calendar';
import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { RUNBOOK, calendarTable } from './render';

/**
 * docs/runbooks/content-updates.md lists the content calendar between `<!-- content-calendar -->` and
 * `<!-- /content-calendar -->`, held equal to CONTENT_CALENDAR here (audit #59; docs/adr/0071; test matrix RCC-08), as
 * tools/required-checks.ts holds the required checks' listings: a calendar change that leaves the runbook behind fails.
 */

const OPEN = '<!-- content-calendar -->';
const CLOSE = '<!-- /content-calendar -->';

/** The text between the one pair of markers, without the newlines next to them; problems when there is not exactly one pair. */
function marked(text: string): { table?: string; problems: string[] } {
  const opens = text.split(OPEN).length - 1;
  const closes = text.split(CLOSE).length - 1;
  if (opens !== 1 || closes !== 1) {
    return { problems: [`holds ${String(opens)} opening and ${String(closes)} closing markers: it must hold one of each`] };
  }
  const start = text.indexOf(OPEN) + OPEN.length;
  const end = text.indexOf(CLOSE);
  if (end < start) {
    return { problems: ['closes the listing before opening it'] };
  }
  return { table: text.slice(start, end).replace(/^\n/, '').replace(/\n$/, ''), problems: [] };
}

describe('the content-updates runbook', () => {
  const text = readFileSync(path.join(repositoryRoot, RUNBOOK), 'utf8');

  it('lists the calendar exactly, between its markers', () => {
    const { table, problems } = marked(text);
    expect(problems).toEqual([]);
    expect(table, 'regenerate the table with calendarTable(CONTENT_CALENDAR) from tools/content-calendar/render.ts').toBe(calendarTable(CONTENT_CALENDAR));
  });

  it('names every family in one row, and the target time to load', () => {
    for (const entry of CONTENT_CALENDAR) {
      expect(text.split(`\n| \`${entry.family}\` |`).length - 1, entry.family).toBe(1);
    }
    expect(text).toContain('## 3. Target time to load');
    expect(text).toContain('within 3 business days');
  });

  it('refuses markers that do not pair', () => {
    expect(marked('no markers').problems).toHaveLength(1);
    expect(marked(`${OPEN}\nx\n${CLOSE}\n${OPEN}`).problems).toHaveLength(1);
    expect(marked(`${CLOSE}\nx\n${OPEN}`).problems).toEqual(['closes the listing before opening it']);
    expect(marked(`${OPEN}\n| a |\n${CLOSE}`)).toEqual({ table: '| a |', problems: [] });
  });
});
