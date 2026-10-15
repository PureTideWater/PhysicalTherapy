import { expect, test } from '@playwright/test';

test.describe('application shell', () => {
  test('renders the home page from a production build', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Therapy contract-payment platform' })).toBeVisible();
    await expect(page.getByText('The workspace screens arrive with the milestones that build them.')).toBeVisible();
    expect(response?.headers()['x-powered-by']).toBeUndefined();
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  });

  test('loads nothing from another origin, fonts included', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) {
        foreign.push(url);
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
  });
});
