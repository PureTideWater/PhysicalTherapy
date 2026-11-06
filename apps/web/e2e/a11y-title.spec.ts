import { type Page, expect, test } from '@playwright/test';

import { atPhoneWidth, expectAccessible } from './a11y';

/**
 * The window a page restarted in the browser leaves before it has a title (test matrix CI-19; the sign-in-time flake of
 * run 41885977909, CI-07): a server action's redirect is a client-side navigation, and the router commits the new page's
 * body, its address, its fields and its focus before the page's <title> is in the head. axe run inside that window
 * reports document-title (serious) on a page whose title is about to come. This spec opens the window on purpose, in the
 * test alone: the sign-in page's title is taken out of the head and put back `later` milliseconds afterwards, so axe
 * checks a page with no title unless the check waits for one first. With `stale`, the head holds that title in the
 * meantime, as it holds the page before's while a link the router follows is committing.
 */
async function titleLater(page: Page, later: number, stale = ''): Promise<string> {
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/\S/);
  const title = await page.title();
  await page.evaluate(
    ({ text, delay, before }) => {
      for (const element of document.head.querySelectorAll('title')) {
        element.remove();
      }
      if (before !== '') {
        const held = document.createElement('title');
        held.textContent = before;
        document.head.append(held);
      }
      setTimeout(() => {
        for (const old of document.head.querySelectorAll('title')) {
          old.remove();
        }
        const fresh = document.createElement('title');
        fresh.textContent = text;
        document.head.append(fresh);
      }, delay);
    },
    { text: title, delay: later, before: stale },
  );
  expect(await page.title(), 'the window is open: the page has no title, or the stale one').toBe(stale);
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

test('with the title the caller expects, axe waits for that title, not the page before’s (CI-19)', async ({ page }) => {
  const title = await titleLater(page, 2_000, 'Verification code | PaidWhole');
  await expectAccessible(page, 'Sign in, the page before’s title still in the head', { title });
  expect(await page.title(), 'the title axe checked under').toBe(title);
});
