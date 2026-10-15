import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WORKSPACE_SCREENS, findScreen, screenHref } from './screens';

const appDir = fileURLToPath(new URL('../app/(workspace)/', import.meta.url));

describe('WORKSPACE_SCREENS', () => {
  it('lists the sixteen customer workspace screens of PRD section 7 in rail order', () => {
    expect(WORKSPACE_SCREENS.map((screen) => screen.title)).toEqual([
      'Practice dashboard',
      'Uploads',
      'Remittances',
      'Claims and lines',
      'Payer and plan mapping',
      'Contracts',
      'Rate record review',
      'Coverage',
      'Pricing runs',
      'Anomalies',
      'Cases',
      'Packet builder',
      'Submissions and responses',
      'Reconciliation',
      'Reports',
      'Settings',
    ]);
  });

  it('has unique, URL-safe slugs', () => {
    const slugs = WORKSPACE_SCREENS.map((screen) => screen.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it.each(WORKSPACE_SCREENS.map((screen) => screen.slug))('has a page for %s', (slug) => {
    expect(existsSync(`${appDir}${slug}/page.tsx`)).toBe(true);
  });

  it('gives every screen an empty state that says what to do next', () => {
    for (const screen of WORKSPACE_SCREENS) {
      expect(screen.empty.title.length).toBeGreaterThan(0);
      expect(screen.empty.nextStep).toMatch(/\.$/);
    }
  });

  it('starts the dashboard empty state with the first upload (PRD section 7)', () => {
    expect(findScreen('dashboard').empty.nextStep).toBe('Upload your first 835 files.');
  });

  it('builds hrefs without identifiers', () => {
    expect(screenHref('pricing-runs')).toBe('/pricing-runs');
  });

  it('refuses an unknown slug', () => {
    expect(() => findScreen('nope' as never)).toThrow(/unknown workspace screen/);
  });
});
