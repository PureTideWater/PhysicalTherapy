import { expect, test } from '@playwright/test';

import { practiceId, signInWithTotp } from './helpers';

/**
 * The triage and report screens in the browser (PRD 7: Anomalies, Cases, Reports; milestone 6): they
 * open from the practice rail, are sent private and never cached, and show their stage labels and
 * empty states; a viewer reads them without the controls that triage, generate or export. The audit
 * itself, end to end through the routes and the worker's jobs, is
 * src/lib/routes/audit-e2e.db.test.ts. Synthetic data only.
 */

const SCREENS = [
  { path: 'anomalies', heading: /^Anomalies/, rail: 'Anomalies' },
  { path: 'cases', heading: /^Cases$/, rail: 'Cases' },
  { path: 'reports', heading: /^Reports$/, rail: 'Reports' },
] as const;

test('a billing manager opens Anomalies, Cases and Reports from the rail, private and never cached', async ({ page }) => {
  await signInWithTotp(page, 'billing-manager');
  const north = await practiceId('north');
  for (const screen of SCREENS) {
    const response = await page.goto(`/p/${north}/${screen.path}`);
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: screen.rail, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto(`/p/${north}/anomalies`);
  await expect(page.locator('[data-label="investigatory"]').first()).toBeVisible();
  await page.goto(`/p/${north}/cases`);
  await expect(page.getByRole('region', { name: 'Triage a run' })).toBeVisible();
  await page.goto(`/p/${north}/reports`);
  await expect(page.getByRole('region', { name: 'Generate an audit report' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Export history' })).toBeVisible();
});

test('a viewer reads Cases and Reports without the controls that triage, generate or export', async ({ page }) => {
  await signInWithTotp(page, 'viewer');
  const north = await practiceId('north');
  await page.goto(`/p/${north}/cases`);
  await expect(page.getByRole('heading', { level: 1, name: 'Cases' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Triage a run' })).toHaveCount(0);
  await page.goto(`/p/${north}/reports`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Generate an audit report' })).toHaveCount(0);
  await expect(page.getByText('Download the line CSV')).toHaveCount(0);
});
