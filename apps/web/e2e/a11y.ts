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
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = results.violations.map((violation) => ({ rule: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5) }));
  expect(violations, `${what}: axe-core WCAG 2.1 AA violations`).toEqual([]);
}

/**
 * Keyboard navigation (PRD 6, Cross-cutting: keyboard navigation): from the top of the page, Tab moves
 * focus through the page's links and controls in order, each focus visible to the user (an outline
 * or ring), until it reaches the target, which Enter or Space can then use.
 */
export async function tabTo(page: Page, target: { readonly role: 'link' | 'button'; readonly name: string | RegExp }, maxTabs = 120): Promise<void> {
  await page.locator('body').focus();
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    const matches = await focused.evaluate(
      (element, wanted) => {
        const role = element.tagName === 'A' ? 'link' : element.tagName === 'BUTTON' ? 'button' : element.getAttribute('role');
        const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
        const pattern = wanted.pattern === null ? null : new RegExp(wanted.pattern);
        return role === wanted.role && (pattern === null ? name === wanted.name : pattern.test(name));
      },
      { role: target.role, name: typeof target.name === 'string' ? target.name : '', pattern: typeof target.name === 'string' ? null : target.name.source },
    );
    if (matches) {
      const visible = await focused.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
      });
      expect(visible, `the focus on ${String(target.name)} is visible`).toBe(true);
      return;
    }
  }
  throw new Error(`Tab never reached the ${target.role} ${String(target.name)}`);
}
