import { type Page, expect, test } from '@playwright/test';

import { atPhoneWidth, expectAccessible } from './a11y';

/**
 * The window a page restarted in the browser leaves before it has a title (test matrix CI-19; the sign-in-time flake of
 * run 41885977909, CI-07): a server action's redirect is a client-side navigation, and the router commits the new page's
 * body, its address, its fields and its focus before the page's <title> is in the head. axe run inside that window
 * reports document-title (serious) on a page whose title is about to come. This spec opens the window on purpose, in the
 * test alone: the sign-in page's title is taken out of the head and put back `later` milliseconds afterwards, so axe
 * checks a page with no title unless the check waits for one first.
 */
async function titleLater(page: Page, later: number): Promise<string> {
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/\S/);
  const title = await page.title();
  await page.evaluate(
    ({ text, delay }) => {
      for (const element of document.head.querySelectorAll('title')) {
        element.remove();
      }
      setTimeout(() => {
        const element = document.createElement('title');
        element.textContent = text;
        document.head.append(element);
      }, delay);
    },
    { text: title, delay: later },
  );
  expect(await page.title(), 'the window is open: the page has no title').toBe('');
  return title;
}

test('axe waits for a page’s title, so a page restarted in the browser is not checked before it has one (CI-19)', async ({ page }) => {
  const title = await titleLater(page, 2_000);
  await expectAccessible(page, 'Sign in, its title still to come');
  await expect(page).toHaveTitle(title);
});

test('at a phone’s width too, axe waits for a page’s title (CI-19, TBL-03)', async ({ page }) => {
  const title = await titleLater(page, 2_000);
  await atPhoneWidth(page, 'Sign in, its title still to come');
  await expect(page).toHaveTitle(title);
});
