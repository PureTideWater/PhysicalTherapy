import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { frameData, ownFocus, regionProps, scrollState, stateChanged } from './scroll-state';
import { ScrollBox, ScrollTable } from './scroll-table';

/**
 * The scrollers (docs/adr/0078; test matrix TBL-01; UX-011, UX-079 (a); the design review's DR-01 and DR-03). The unit
 * project has no DOM and nothing in node lays out, so the server markup is rendered here and the state that follows a
 * measurement is a pure function, tested on its own; the browser suite measures the live scroller.
 */

const table = (
  <table aria-label="Run lines">
    <thead>
      <tr>
        <th>
          <span className="sr-only">Open</span>
        </th>
      </tr>
    </thead>
  </table>
);

const serverTable = () => renderToStaticMarkup(<ScrollTable label="Run lines">{table}</ScrollTable>);
const serverBox = () => renderToStaticMarkup(<ScrollBox label="Release notes">notes</ScrollBox>);

/** A 900 px table in a 600 px scroller, scrolled by `offset`; a table that fits; the state before any measurement. */
const wide = (offset: number) => scrollState({ scrollSize: 900, clientSize: 600, offset });
const fitting = () => scrollState({ scrollSize: 600, clientSize: 600, offset: 0 });
const unmeasured = () => scrollState(null);

describe('a wide table’s sideways scroller, as the server renders it', () => {
  it('is a named region the keyboard reaches before any script runs, inside a frame that does not scroll, the containing block of a visually hidden header cell, with its table as its direct child (UX confirm of PR #50, NEW-A)', () => {
    const html = serverTable();
    expect(html).toMatch(
      /^<div data-slot="scroll-table" data-scroll="unmeasured" class="min-w-0 max-w-full"><div class="pw-scroll-frame"><div role="region" aria-label="Run lines, scrolls sideways" tabindex="0" data-scroller="" class="relative min-w-0 max-w-full overflow-x-auto [^"]*"><table aria-label="Run lines">/,
    );
    // A sideways swipe that reaches the table's edge stays in the table, never the browser's back gesture.
    expect(html).toMatch(/data-scroller="" class="[^"]*\boverscroll-x-contain\b/);
  });

  it('says nothing of scrolling and draws no fade until the browser measures the table wider than the scroller (UX confirm, N3)', () => {
    const html = serverTable();
    expect(html).toContain('data-scroll="unmeasured"');
    expect(html).not.toContain('data-state="scrolls-sideways"');
    expect(html).not.toContain('Scroll sideways for more columns.');
    expect(html).not.toMatch(/data-edge-(start|end)/);
  });

  it('is drawn from classes and data attributes alone, never a style attribute, which the CSP refuses', () => {
    expect(serverTable()).not.toContain('style=');
    expect(serverBox()).not.toContain('style=');
  });

  it('leaves its focus indicator to the frame’s outline in brand.css: no ring and no removed outline in the markup, so forced colours and the fades never hide it (DR-03)', () => {
    for (const markup of [serverTable(), serverBox()]) {
      expect(markup).toContain('class="pw-scroll-frame');
      expect(markup).not.toContain('outline-none');
      expect(markup).not.toMatch(/\bring-/);
    }
  });

  it('refuses an empty label, so no region is ever nameless', () => {
    expect(() => renderToStaticMarkup(<ScrollTable label="">{table}</ScrollTable>)).toThrow(/label/);
    expect(() => renderToStaticMarkup(<ScrollTable label=" ">{table}</ScrollTable>)).toThrow(/label/);
    expect(() => renderToStaticMarkup(<ScrollBox label="">notes</ScrollBox>)).toThrow(/label/);
  });
});

describe('the scroller’s state, from one measurement', () => {
  it('is unmeasured, with no edge, until the browser has measured it', () => {
    expect(unmeasured()).toEqual({ overflow: 'unmeasured', start: false, end: false });
  });

  it('fits when the content is no larger than the box, or larger by 1 px or less (rounding at a zoom factor, not overflow)', () => {
    expect(fitting()).toEqual({ overflow: 'fits', start: false, end: false });
    expect(scrollState({ scrollSize: 601, clientSize: 600, offset: 0 })).toEqual({ overflow: 'fits', start: false, end: false });
    expect(scrollState({ scrollSize: 600.6, clientSize: 600, offset: 0 })).toEqual({ overflow: 'fits', start: false, end: false });
  });

  it('overflows from 2 px, with content past the end edge only while scrolled to the start', () => {
    expect(scrollState({ scrollSize: 602, clientSize: 600, offset: 0 })).toEqual({ overflow: 'overflows', start: false, end: true });
    expect(wide(0)).toEqual({ overflow: 'overflows', start: false, end: true });
    // Scrolled by a pixel or less is still the start.
    expect(wide(1)).toEqual({ overflow: 'overflows', start: false, end: true });
  });

  it('has content past both edges in the middle, and past the start edge only at the end', () => {
    expect(wide(150)).toEqual({ overflow: 'overflows', start: true, end: true });
    expect(wide(300)).toEqual({ overflow: 'overflows', start: true, end: false });
    // Within a pixel of the end is the end.
    expect(wide(299.5)).toEqual({ overflow: 'overflows', start: true, end: false });
  });

  it('reads a right-to-left scroller’s negative offset as its magnitude', () => {
    expect(wide(-150)).toEqual(wide(150));
    expect(wide(-300)).toEqual(wide(300));
  });

  it('changes only when what the page shows changes, so a scroll within the middle re-renders nothing', () => {
    expect(stateChanged(wide(150), wide(160))).toBe(false);
    expect(stateChanged(wide(0), wide(150))).toBe(true);
    expect(stateChanged(wide(150), wide(300))).toBe(true);
    expect(stateChanged(unmeasured(), fitting())).toBe(true);
    expect(stateChanged(fitting(), scrollState({ scrollSize: 400, clientSize: 400, offset: 0 }))).toBe(false);
  });
});

describe('the scroller’s role, name and tab stop', () => {
  const region = { role: 'region', 'aria-label': 'Cases, scrolls sideways', tabIndex: 0 };

  it('are a region named "<label>, scrolls sideways" with a tab stop while unmeasured (the server and the first client render) and while the content overflows', () => {
    expect(regionProps(unmeasured(), false, 'Cases', ', scrolls sideways')).toEqual(region);
    for (const state of [wide(0), wide(150), wide(300)]) {
      expect(regionProps(state, false, 'Cases', ', scrolls sideways')).toEqual(region);
    }
  });

  it('are nothing while the content fits: no role, no name that says it scrolls, no idle tab stop (UX-011)', () => {
    expect(regionProps(fitting(), false, 'Cases', ', scrolls sideways')).toEqual({});
  });

  it('stay while the scroller itself holds focus, so a resize never pulls focus from under the person (WCAG 2.4.3, 2.4.7)', () => {
    expect(regionProps(fitting(), true, 'Cases', ', scrolls sideways')).toEqual(region);
  });

  it('count only the scroller’s own focus: a link or control focused inside a fitting table brings back nothing (DR-01)', () => {
    const scroller = {};
    const link = {};
    // React's onFocus and onBlur bubble: focus on a link inside reaches the scroller's handler with the link as its target.
    expect(ownFocus({ target: scroller, currentTarget: scroller })).toBe(true);
    expect(ownFocus({ target: link, currentTarget: scroller })).toBe(false);
    expect(regionProps(fitting(), ownFocus({ target: link, currentTarget: scroller }), 'Cases', ', scrolls sideways')).toEqual({});
  });

  it('name a fixed-height text box "<label>, scrolls"', () => {
    expect(regionProps(unmeasured(), false, 'Release notes', ', scrolls')).toEqual({ role: 'region', 'aria-label': 'Release notes, scrolls', tabIndex: 0 });
  });
});

describe('the scroller’s data attributes, which the fades, the specs and the rendered guard read', () => {
  it('always carry data-scroll, and data-edge-start or data-edge-end only while content lies past that edge', () => {
    expect(frameData(unmeasured())).toEqual({ 'data-scroll': 'unmeasured' });
    expect(frameData(fitting())).toEqual({ 'data-scroll': 'fits' });
    expect(frameData(wide(0))).toEqual({ 'data-scroll': 'overflows', 'data-edge-end': '' });
    expect(frameData(wide(150))).toEqual({ 'data-scroll': 'overflows', 'data-edge-start': '', 'data-edge-end': '' });
    expect(frameData(wide(300))).toEqual({ 'data-scroll': 'overflows', 'data-edge-start': '' });
  });
});

describe('a fixed-height text box’s scroller, as the server renders it', () => {
  it('is a region named "<label>, scrolls" with a tab stop, on the block axis, its data attributes passed to the region, a pre in the muted tone by default', () => {
    const html = renderToStaticMarkup(
      <ScrollBox label="What the content checker found" data-state="check-failed">
        {'line one\nline two'}
      </ScrollBox>,
    );
    expect(html).toMatch(
      /^<div data-slot="scroll-box" data-axis="block" data-scroll="unmeasured" class="min-w-0 max-w-full"><div class="pw-scroll-frame [^"]*"><pre role="region" aria-label="What the content checker found, scrolls" tabindex="0" data-scroller="" data-state="check-failed" class="[^"]*">line one\nline two<\/pre><\/div><\/div>$/,
    );
    const [, frame = '', box = ''] = /<div class="(pw-scroll-frame [^"]*)"><pre [^>]*class="([^"]*)"/.exec(html) ?? [];
    // The frame holds the border, so the fades are drawn inside it; the fades' surface is the box's own.
    expect(frame.split(' ')).toEqual(expect.arrayContaining(['overflow-hidden', 'rounded-md', 'border', '[--pw-scroll-surface:var(--pw-bg-raised)]']));
    // The box wraps its text and so scrolls on the block axis only, never sideways.
    expect(box.split(' ')).toEqual(expect.arrayContaining(['max-h-96', 'overflow-auto', 'bg-muted', 'p-3', 'whitespace-pre-wrap', 'wrap-anywhere', 'font-mono', 'text-xs']));
    expect(html).not.toMatch(/data-edge-(start|end)/);
  });

  it('takes the taller height, the faint tone with its own surface for the fades, and a div for a page of text', () => {
    const html = renderToStaticMarkup(
      <ScrollBox label="Page 2 of the contract" height="lg" tone="faint" as="div" data-page-text="">
        <span>Text</span>
      </ScrollBox>,
    );
    expect(html).toContain('<div role="region" aria-label="Page 2 of the contract, scrolls" tabindex="0" data-scroller="" data-page-text="" class="');
    const [, frame = '', box = ''] = /<div class="(pw-scroll-frame [^"]*)"><div [^>]*class="([^"]*)"/.exec(html) ?? [];
    expect(frame.split(' ')).toContain('[--pw-scroll-surface:color-mix(in_srgb,var(--pw-bg-raised)_30%,var(--pw-bg))]');
    expect(box.split(' ')).toEqual(expect.arrayContaining(['max-h-[32rem]', 'bg-muted/30', 'whitespace-pre-wrap', 'wrap-anywhere', 'font-mono']));
    expect(box.split(' ')).not.toContain('max-h-96');
    expect(box.split(' ')).not.toContain('bg-muted');
  });
});
