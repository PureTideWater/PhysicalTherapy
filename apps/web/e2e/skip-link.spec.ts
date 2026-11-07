import { type Page, expect, test } from '@playwright/test';

import { personaEmail } from '../scripts/synthetic-personas';
import { expectAccessible } from './a11y';
import { practiceId, registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';

/**
 * The shell's skip link (test matrix CI-30; WCAG 2.4.1, Bypass Blocks). On a practice page, a console page and the
 * settings users page, at 1280 and 390 px, the first Tab from the top of the page shows "Skip to the content" in view,
 * Enter moves focus to main#content, and the next Tab lands on the first control inside main, past the header and the
 * rail. axe-core runs on the focused state. Each persona signs in here only (scripts/synthetic-personas.ts), so no
 * sign-in or hardware key is shared with a test that runs at once. Synthetic data only.
 */

const PRACTICE_ADMIN = 'skip-practice-admin';
const PLATFORM_ADMIN = 'skip-admin';
const WIDTHS = [1280, 390] as const;

/** Whether focus is inside main and on its first control in tab order (a visible, enabled element with a tab stop). */
function onFirstControlInMain(): { readonly inMain: boolean; readonly first: boolean } {
  const main = document.querySelector('main#content');
  const active = document.activeElement;
  if (main === null || active === null || active === main || !main.contains(active)) {
    return { inMain: false, first: false };
  }
  const selector = ['a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary', '[tabindex]'].join(', ');
  const stops = [...main.querySelectorAll<HTMLElement>(selector)].filter(
    (each) => each.tabIndex >= 0 && !(each as HTMLButtonElement).disabled && each.checkVisibility({ visibilityProperty: true }),
  );
  return { inMain: true, first: stops[0] === active };
}

/** Whether the element is clipped to nothing, as sr-only draws it: `clip: rect(0 0 0 0)` or a clip-path of inset(50%). */
function clippedAway(element: Element): boolean {
  const style = getComputedStyle(element);
  return /^rect\(0px,? 0px,? 0px,? 0px\)$/.test(style.clip) || style.clipPath === 'inset(50%)';
}

/** The element's padding as drawn: inline (left and right) and block (top and bottom), or "mixed" when the two sides differ. */
function padding(element: Element): { readonly inline: string; readonly block: string } {
  const style = getComputedStyle(element);
  return {
    inline: style.paddingLeft === style.paddingRight ? style.paddingLeft : 'mixed',
    block: style.paddingTop === style.paddingBottom ? style.paddingTop : 'mixed',
  };
}

async function expectSkipLink(page: Page, what: string): Promise<void> {
  for (const width of WIDTHS) {
    await test.step(`${what} at ${String(width)} px`, async () => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const link = page.getByRole('link', { name: 'Skip to the content', exact: true });
      // Hidden until it has focus: sr-only clips it to nothing, with no padding (its box styles apply only on focus).
      expect(await link.evaluate(clippedAway)).toBe(true);
      await page.locator('body').focus();
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(await link.evaluate(clippedAway)).toBe(false);
      // Shown with its padding, so the ring sits clear of the words and the link is a target at least 24 px tall.
      expect(await link.evaluate(padding)).toEqual({ inline: '12px', block: '8px' });
      expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
      await expect(link).toBeVisible();
      await expect(link).toBeInViewport();
      await expectAccessible(page, `${what}, the skip link focused at ${String(width)} px`);
      await page.keyboard.press('Enter');
      const main = page.locator('main#content');
      await expect(main).toBeFocused();
      await page.keyboard.press('Tab');
      await expect.poll(() => page.evaluate(onFirstControlInMain), { message: `${what}: the Tab after Enter lands on main’s first control` }).toEqual({ inMain: true, first: true });
    });
  }
}

test('a practice page and the settings users page start with a skip link to main (CI-30)', async ({ page }) => {
  test.setTimeout(120_000);
  const practice = await practiceId('north');
  const organization = await withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      'SELECT m.organization_id AS id FROM membership m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1 AND m.ends_at IS NULL',
      [personaEmail(PRACTICE_ADMIN)],
    );
    return rows[0]?.id ?? '';
  });
  expect(organization).not.toBe('');
  await signInWithTotp(page, PRACTICE_ADMIN);
  await page.goto(`/p/${practice}/cases`);
  await expectSkipLink(page, 'Cases');
  await page.goto(`/settings/organizations/${organization}/users`);
  await expectSkipLink(page, 'Users and roles');
});

test('a console page starts with a skip link to main (CI-30)', async ({ page }) => {
  test.setTimeout(120_000);
  await registerKeyAndSignIn(page, PLATFORM_ADMIN);
  await page.goto('/console/organizations');
  await expectSkipLink(page, 'Console organizations');
});
