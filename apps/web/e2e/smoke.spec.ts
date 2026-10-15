import { expect, test } from '@playwright/test';

test.describe('application shell', () => {
  test('sends a visitor without a session to sign-in, from a production build', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(response?.headers()['x-powered-by']).toBeUndefined();
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  });

  test('shows internal roles the hardware-key requirement on the sign-in screen', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByText('Company staff sign in with a hardware key')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with a hardware key' })).toBeVisible();
  });

  test('loads nothing from another origin, fonts included', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) {
        foreign.push(url);
      }
    });
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
  });
});
