import { AxeBuilder } from '@axe-core/playwright';
import { type Page, expect } from '@playwright/test';

/**
 * The accessibility check of the e2e suite (PRD 6, Cross-cutting requirements: "Accessibility
 * (keyboard navigation, labels, contrast) on every screen"; docs/adr/0045): axe-core's WCAG 2.1 A and
 * AA rules (labels, names, contrast, landmarks, headings, ARIA) on the page as it stands, every
 * violation reported with the rule and the elements. The page itself never loads anything from another
 * origin: axe is injected by Playwright for the test alone.
 */
export async function expectAccessible(page: Page, what: string): Promise<void> {
  expect(await axeViolations(page), `${what}: axe-core WCAG 2.1 AA violations`).toEqual([]);
}

/** axe-core's WCAG 2.1 A and AA violations on the page as it stands: each rule, its impact and its first five elements. */
async function axeViolations(page: Page): Promise<{ readonly rule: string; readonly impact: string | null | undefined; readonly nodes: readonly string[] }[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.map((violation) => ({ rule: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5) }));
}

/**
 * Keyboard navigation (PRD 6, Cross-cutting: keyboard navigation): from the top of the page, Tab moves
 * focus through the page's links and controls in order, each focus visible to the user (an outline
 * or ring), until it reaches the target, which Enter or Space can then use. The focused element is the document's
 * active element: inside a date field, Tab moves between its parts, where no element matches `:focus`.
 */
export async function tabTo(page: Page, target: { readonly role: 'link' | 'button'; readonly name: string | RegExp }, maxTabs = 120): Promise<void> {
  await page.locator('body').focus();
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      (wanted) => {
        const element = document.activeElement;
        if (element === null || element === document.body) {
          return { matches: false, visible: false };
        }
        const role = element.tagName === 'A' ? 'link' : element.tagName === 'BUTTON' ? 'button' : element.getAttribute('role');
        const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
        const pattern = wanted.pattern === null ? null : new RegExp(wanted.pattern);
        const style = getComputedStyle(element);
        return { matches: role === wanted.role && (pattern === null ? name === wanted.name : pattern.test(name)), visible: style.outlineStyle !== 'none' || style.boxShadow !== 'none' };
      },
      { role: target.role, name: typeof target.name === 'string' ? target.name : '', pattern: typeof target.name === 'string' ? null : target.name.source },
    );
    if (focused.matches) {
      expect(focused.visible, `the focus on ${String(target.name)} is visible`).toBe(true);
      return;
    }
  }
  throw new Error(`Tab never reached the ${target.role} ${String(target.name)}`);
}

export interface PhoneWidthOptions {
  /** False to leave axe-core out (a page whose accessibility another check covers). */
  readonly axe?: boolean;
  /**
   * The wide tables the route must show at 390 px, each by its name (exact): a visible table whose ScrollTable reads
   * data-scroll="overflows" and shows the caption that says it scrolls. So the route is proved populated and cut off,
   * the state axe's scrollable-region-focusable judges (it flags only a region whose content scrolls). A table that
   * fits at 390 px by design (three or fewer short columns, docs/adr/0078) is not named.
   */
  readonly tables?: readonly string[];
  /** Each check reports its failure and the call goes on (expect.soft), so one test reports every route that fails. */
  readonly soft?: boolean;
}

/**
 * The page at a phone's width (390 px): it does not scroll sideways (a wide table scrolls inside its own region); every
 * table on it sits in a ScrollTable (the rendered half of src/app/tables.test.ts's guard, for a table its source walk
 * cannot see); each table named in `tables` is there, overflowing and saying so; every scroller's role and tab stop
 * agree with what it measures; and then axe-core finds no violation, a scrollable region a keyboard cannot reach among
 * them. The scrollers are waited for before axe because a scroller that fitted at the width before becomes a region
 * only once its ResizeObserver has fired and React has committed. The viewport is put back as it was.
 */
export async function atPhoneWidth(page: Page, what: string, options: PhoneWidthOptions = {}): Promise<void> {
  const check = options.soft === true ? expect.configure({ soft: true }) : expect;
  const before = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await check.poll(() => page.evaluate(sidewaysScroll), { message: `${what}: no sideways scroll at 390 px` }).toEqual({ scrollWidth: 390, overflowing: [] });
    await check.poll(() => page.evaluate(tablesOutsideScrollers), { message: `${what}: every table in a ScrollTable` }).toEqual([]);
    for (const name of options.tables ?? []) {
      await check.poll(() => cutOff(page, name), { message: `${what}: the table “${name}” at 390 px, populated, cut off and saying it scrolls` }).toEqual([]);
    }
    await expectScrollersAgree(page, `${what}, at 390 px`, options);
    if (options.axe !== false) {
      check(await axeViolations(page), `${what}, at 390 px: axe-core WCAG 2.1 AA violations`).toEqual([]);
    }
  } finally {
    if (before !== null) {
      await page.setViewportSize(before);
    }
  }
}

/**
 * Waits until every scroller on the page agrees with what it measures (docs/adr/0078): a region with a tab stop while
 * its content overflows (sideways, or down for a text box), and a plain box while it fits, unless it holds focus
 * itself. Before hydration every scroller is a region, so a page that has not hydrated fails here, never in axe.
 */
export async function expectScrollersAgree(page: Page, what: string, options: { readonly soft?: boolean } = {}): Promise<void> {
  const check = options.soft === true ? expect.configure({ soft: true }) : expect;
  await check.poll(() => page.evaluate(scrollersAtOdds), { message: `${what}: each scroller a region with a tab stop while it overflows, and a plain box while it fits` }).toEqual([]);
}

/** What stops the named table from proving its route at a phone's width: none visible, or one outside a ScrollTable, not overflowing, or with no caption. */
async function cutOff(page: Page, name: string): Promise<string[]> {
  return page.getByRole('table', { name, exact: true }).evaluateAll((tables, wanted) => {
    if (tables.length === 0) {
      return [`no visible table named “${wanted}”`];
    }
    return tables.flatMap((table) => {
      const holder = table.closest('[data-slot="scroll-table"]');
      if (holder === null) {
        return ['not in a ScrollTable'];
      }
      const caption = holder.querySelector(':scope > [data-state="scrolls-sideways"]');
      return [
        ...(holder.getAttribute('data-scroll') === 'overflows' ? [] : [`data-scroll="${holder.getAttribute('data-scroll') ?? ''}"`]),
        ...(caption !== null && caption.getClientRects().length > 0 ? [] : ['no caption']),
      ];
    });
  }, name);
}

/**
 * Every table on the page that is not inside a ScrollTable, by its name, or by its first header and its parent when it
 * has none. React's streamed rendering leaves an empty hidden table at the end of the body for each run of rows it
 * streamed (the rows move into the page's own table): no data table, so not counted.
 */
function tablesOutsideScrollers(): string[] {
  return [...document.querySelectorAll('table')]
    .filter((table) => table.closest('[data-slot="scroll-table"]') === null)
    .filter((table) => !(table.hidden && table.querySelector('tr') === null))
    .map((table) => {
      const parent = table.parentElement;
      const where = parent === null ? 'nothing' : `${parent.tagName.toLowerCase()}.${[...parent.classList].slice(0, 4).join('.')}`;
      return table.getAttribute('aria-label') ?? table.querySelector('caption')?.textContent ?? table.getAttribute('aria-labelledby') ?? `a table headed “${(table.querySelector('th')?.textContent ?? '').trim()}” in ${where}`;
    });
}

/**
 * Each rendered scroller whose role and tab stop disagree with its measurement, by its name and what it measures. A
 * scroller in a closed disclosure is left out: Chromium skips laying out what a closed <details> holds
 * (content-visibility: hidden), so its sizes are stale until it opens, when the scroller measures itself again. A
 * difference of a pixel or less fits, as the component rounds (components/scroll-state.ts).
 */
function scrollersAtOdds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-scroller]')]
    .filter((scroller) => scroller.checkVisibility())
    .flatMap((scroller) => {
      const block = scroller.closest('[data-axis]')?.getAttribute('data-axis') === 'block';
      const overflows = block ? scroller.scrollHeight - scroller.clientHeight > 1 : scroller.scrollWidth - scroller.clientWidth > 1;
      const region = scroller.getAttribute('role') === 'region' && scroller.getAttribute('tabindex') === '0';
      const plain = !scroller.hasAttribute('role') && !scroller.hasAttribute('tabindex');
      if (overflows ? region : plain || (region && scroller === document.activeElement)) {
        return [];
      }
      const name = scroller.getAttribute('aria-label') ?? scroller.querySelector('table')?.getAttribute('aria-label') ?? 'a scroller';
      return [`${name}: ${overflows ? 'overflows' : 'fits'}, role ${scroller.getAttribute('role') ?? 'none'}, tabindex ${scroller.getAttribute('tabindex') ?? 'none'}`];
    });
}

/**
 * The page's scroll width and the elements that make it wider than the window: each one whose right edge passes the
 * window's, outside any element that scrolls or clips sideways, named by its tag, its test hooks and its first classes,
 * so a failure says what to fix.
 */
function sidewaysScroll(): { readonly scrollWidth: number; readonly overflowing: readonly string[] } {
  const width = window.innerWidth;
  const clipped = (element: Element): boolean => {
    for (let parent = element.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
      if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) {
        return true;
      }
    }
    return false;
  };
  const overflowing = [...document.body.querySelectorAll('*')]
    .filter((element) => element.getBoundingClientRect().right > width + 0.5 && !clipped(element))
    .filter((element) => ![...element.children].some((child) => child.getBoundingClientRect().right > width + 0.5))
    .slice(0, 5)
    .map((element) => {
      const hooks = [...element.attributes].filter((attribute) => attribute.name.startsWith('data-') || attribute.name === 'id').map((attribute) => `[${attribute.name}=${attribute.value}]`);
      const classes = [...element.classList].slice(0, 6).join('.');
      return `${element.tagName.toLowerCase()}${hooks.join('')}${classes === '' ? '' : `.${classes}`} (right ${String(Math.round(element.getBoundingClientRect().right))})`;
    });
  return { scrollWidth: document.documentElement.scrollWidth, overflowing };
}
