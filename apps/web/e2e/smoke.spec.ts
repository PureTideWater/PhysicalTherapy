import { expect, test } from '@playwright/test';

import { WORKSPACE_SCREENS } from '../src/lib/screens';

test.describe('application shell', () => {
  test('opens on the practice dashboard with its empty state', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Practice dashboard' })).toBeVisible();
    await expect(page.getByText('Upload your first 835 files.')).toBeVisible();
  });

  test('puts the practice switcher at the top of the left rail', async ({ page }) => {
    await page.goto('/dashboard');
    const rail = page.locator('aside');
    await expect(rail.locator(':scope > *').first()).toHaveAttribute('data-testid', 'practice-switcher');
    await expect(rail.getByRole('button', { name: /Practice/ })).toBeDisabled();
    await expect(rail.getByRole('navigation', { name: 'Workspace' }).getByRole('link')).toHaveCount(WORKSPACE_SCREENS.length);
  });

  test('reaches every workspace screen from the rail', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Workspace' });
    for (const screen of WORKSPACE_SCREENS) {
      await nav.getByRole('link', { name: screen.title, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${screen.slug}$`));
      await expect(page.getByRole('heading', { level: 1, name: screen.title })).toBeVisible();
      await expect(page.getByText(screen.empty.nextStep)).toBeVisible();
      await expect(nav.getByRole('link', { name: screen.title, exact: true })).toHaveAttribute('aria-current', 'page');
    }
  });

  test('serves sign-in outside the workspace shell', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
  });

  test('answers an unknown address with a next step', async ({ page }) => {
    const response = await page.goto('/no-such-screen');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Go to the dashboard' })).toBeVisible();
  });
});

test.describe('security', () => {
  test('sends the security headers and no-store on app routes', async ({ request }) => {
    for (const path of ['/dashboard', '/cases', '/sign-in']) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      const cacheControl = headers['cache-control'] ?? '';
      expect(cacheControl).toContain('private');
      expect(cacheControl).toContain('no-store');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['strict-transport-security']).toContain('max-age=');
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(headers['x-powered-by']).toBeUndefined();
    }
  });

  test('loads nothing from another origin, fonts included', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) {
        foreign.push(url);
      }
    });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
  });
});
