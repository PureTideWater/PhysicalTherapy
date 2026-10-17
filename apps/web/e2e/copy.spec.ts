import { brandName } from '@paidwhole/brand/name';
import { descriptor, independenceClaim, tagline } from '@paidwhole/brand/tokens';
import { expect, test } from '@playwright/test';

/**
 * The product's words where decision D11 puts them (Change Order 001, CO-11): the descriptor in every page's
 * metadata, in the web manifest and as the request-audit page's lede; the independence claim on the
 * request-audit page (the audit report's cover prints it too: apps/worker/src/report/report.test.ts); and
 * sign-in undecorated, with neither of them nor the tagline. The words are the brand package's own.
 */

test('the descriptor and the independence claim stand where D11 puts them, and sign-in stays undecorated', async ({ page, request }) => {
  await test.step('request an audit: the descriptor as the lede, then the independence claim', async () => {
    await page.goto('/request-audit');
    await expect(page.locator('[data-copy="lede"]')).toHaveText(`${descriptor}. ${brandName} is ${independenceClaim}.`);
    await expect(page.locator('[data-copy="descriptor"]')).toHaveText(descriptor);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', descriptor);
  });

  await test.step('the web manifest describes the product with the descriptor', async () => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: brandName, description: descriptor });
  });

  await test.step('sign-in: the lockup and the sign-in steps, no descriptor, claim or tagline on the page', async () => {
    await page.goto('/sign-in');
    const text = await page.locator('body').innerText();
    for (const words of [descriptor, independenceClaim, tagline]) {
      expect(text).not.toContain(words);
    }
    await expect(page.locator('[data-copy]')).toHaveCount(0);
  });
});
