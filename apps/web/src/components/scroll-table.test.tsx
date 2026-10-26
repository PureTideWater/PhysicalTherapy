import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ScrollTable } from './scroll-table';

describe('a wide table’s sideways scroller', () => {
  const html = renderToStaticMarkup(
    <ScrollTable label="Run lines">
      <table aria-label="Run lines">
        <thead>
          <tr>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
      </table>
    </ScrollTable>,
  );

  it('is a named region the keyboard reaches, and the containing block of a visually hidden header cell, so that cell never widens the page (UX confirm of PR #50, NEW-A)', () => {
    expect(html).toMatch(/^<div role="region" aria-label="Run lines, scrolls sideways" tabindex="0" class="relative min-w-0 max-w-full overflow-x-auto /);
  });

  it('says nothing of scrolling until the browser measures the table wider than the scroller (UX confirm, N3)', () => {
    expect(html).not.toContain('data-state="scrolls-sideways"');
  });
});
