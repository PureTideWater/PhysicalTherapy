import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { createContract, createDraftVersion } from '@tp/contracts';
import { LocalKeyProvider, appDevLoginUrl, developmentMasterKey, loadPracticeCipher, openPool, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';

import { CONTRACT_PAGES, storeContractDocument } from '../src/lib/routes/test-support/contract-world';
import { atPhoneWidth } from './a11y';
import { E2E_DOCUMENTS_DIR, e2eDatabaseUrl } from './env';
import { signInWithTotp, withDatabase } from './helpers';
import { JOURNEY_PRACTICE_ADMIN, registerKeyAndSignInAgain, tourPractice, untilLoaded, uploadedEarlier, userId } from './journeys';
import { startLocalWorker } from './worker';

/**
 * Every table at a phone's width (TBL-02, TBL-03; docs/adr/0078): at 390 px each route this pull request changed is
 * visited with its wide tables populated, and `atPhoneWidth` proves that the page does not scroll sideways, that every
 * table sits in a ScrollTable, that each wide table named overflows its scroller and shows the caption "Scroll sideways
 * for more columns.", that every scroller is a region with a tab stop while it overflows and a plain box while it fits,
 * and that axe-core finds no violation, a scrollable region the keyboard cannot reach among them. Each check is soft,
 * so one run reports every route that fails.
 *
 * The practice pages read the screen tour's practice (e2e/journeys.ts, tourPractice), a practice of their own, with
 * SYNTHETIC MAP-03 beside it, a May remittance whose plan is left waiting on a mapping; a draft version of a second
 * synthetic agreement, in progress; and a synthetic billing firm's grant. The console pages read the seed's own rows
 * (its terms, organizations and practices, release 900001, the split prepare.ts approves) and one synthetic ticket.
 * Each test signs in its own personas only (scripts/synthetic-personas.ts), so no sign-in or hardware key is shared
 * with a test that runs at once. Synthetic data only.
 */

const PRACTICE = 'SYNTHETIC OTHER PRACTICE PHONE TABLES';
const MANAGER = 'tables-manager';
const SPECIALIST = 'tables-specialist';
const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
/** SYNTHETIC MAP-03: payer M, three lines in May, its plan never mapped here, so its dollars wait on a mapping. */
const WAITING = [{ name: 'era-payer-m.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'MAP-03/remit.835')) }];
const TICKET = 'SYNTHETIC TICKET PHONE TABLES';

/** One route at a phone's width: the page loaded at the desktop width, then measured at 390 px, each check soft. */
async function atRoute(page: Page, route: string, what: string, tables: readonly string[] = []): Promise<void> {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await atPhoneWidth(page, what, { tables, soft: true });
}

/**
 * A version in progress: a second synthetic agreement with the practice's first payer (contract-world's invented
 * agreement, its pages stored as intake stores them, so its cited page reads), its first version drafted by the billing
 * manager; once per database.
 */
async function versionInProgress(practiceId: string): Promise<void> {
  if (await withDatabase(async (client) => ((await client.query("SELECT 1 FROM contract_version WHERE practice_id = $1 AND status = 'draft'", [practiceId])).rowCount ?? 0) > 0)) {
    return;
  }
  const manager = await userId(MANAGER);
  const specialist = await userId(SPECIALIST);
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const cipher = await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, (scope) => loadPracticeCipher(scope, new LocalKeyProvider(developmentMasterKey()), practiceId));
    const payerId = await withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [practiceId])).rows[0]?.id ?? '');
    const documents = new DocumentStore(new LocalSealedBytes(E2E_DOCUMENTS_DIR));
    const documentId = await withDatabase((client) => storeContractDocument({ owner: client, app: pool, documents, cipher, practiceId, payerId, customerId: manager, specialistId: specialist }, CONTRACT_PAGES));
    await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, async (scope) => {
      const context = { scope, requestId: `e2e-${randomUUID()}` };
      const contract = await createContract(context, { practiceId, payerId, title: 'SYNTHETIC PHONE TABLES DRAFT AGREEMENT' });
      await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId] });
    });
  } finally {
    await pool.end();
  }
}

/**
 * A synthetic billing firm's grant to the practice, on the firm's own engagement letter, approved by the practice's
 * administrator (once per database), so the practice's Grants table has a row.
 */
async function firmGrant(practiceId: string): Promise<void> {
  const administrator = await userId(JOURNEY_PRACTICE_ADMIN);
  await withDatabase(async (client) => {
    const firm = (await client.query<{ id: string }>("SELECT id FROM organization WHERE kind = 'firm' ORDER BY created_at, id LIMIT 1")).rows[0]?.id ?? '';
    await asOwner(client, [practiceId], async () => {
      if (((await client.query('SELECT 1 FROM "grant" WHERE practice_id = $1', [practiceId])).rowCount ?? 0) > 0) {
        return;
      }
      const agreement = await client.query<{ id: string }>(
        `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
         VALUES ($1, $2, 'engagement', '1', now() - interval '20 days', 'SYNTHETIC SIGNER', $3, $4) RETURNING id`,
        [firm, practiceId, `esign:synthetic-${practiceId}-firm-engagement`, createHash('sha256').update(`${PRACTICE} firm engagement`).digest('hex')],
      );
      await client.query(
        `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
         VALUES ($1, $2, '{"roles":["billing_manager","viewer"]}', now() + interval '90 days', $3, $4)`,
        [firm, practiceId, administrator, agreement.rows[0]?.id],
      );
    });
  });
}

test('at 390 px every practice table scrolls in its own region, says so, and passes axe (TBL-02, TBL-03)', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await signInWithTotp(page, MANAGER);
  const local = await startLocalWorker();
  let practiceId = '';
  try {
    practiceId = await tourPractice(page, { name: PRACTICE, manager: MANAGER, supportFor: [SPECIALIST] });
    await test.step('SYNTHETIC MAP-03 loads, its May lines waiting on their plan’s mapping', async () => {
      // A retry finds the attempt before's upload and waits for it, as the tour does.
      const earlier = await uploadedEarlier(practiceId, WAITING);
      if (earlier.size === 0) {
        await page.goto(`/p/${practiceId}/uploads`);
        await page.getByLabel('Choose files to upload').setInputFiles(WAITING);
        await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'era-payer-m.835' })).toContainText('Loaded 1 remittance', { timeout: 120_000 });
      }
      for (const documentId of earlier.values()) {
        await untilLoaded(documentId);
      }
    });
  } finally {
    await local.close();
  }
  const at = (screen = '') => `/p/${practiceId}${screen}`;
  await versionInProgress(practiceId);
  await firmGrant(practiceId);
  const ids = await withDatabase(async (client) => {
    const one = async (sql: string) => (await client.query<{ id: string }>(sql, [practiceId])).rows[0]?.id ?? '';
    return {
      caseId: await one('SELECT case_id AS id FROM case_line WHERE practice_id = $1 LIMIT 1'),
      versionId: await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1"),
      contractId: await one("SELECT contract_id AS id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1"),
      draftId: await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'draft' ORDER BY created_at LIMIT 1"),
      planN: await one("SELECT id FROM plan WHERE practice_id = $1 AND plan_key = 'CE:SYNPLAN-OON-CAS'"),
      remittanceQ: await one("SELECT id FROM remittance WHERE practice_id = $1 AND trn02 = 'SYNEFTCAS08001' LIMIT 1"),
      documentN: await one("SELECT source_document_id AS id FROM remittance WHERE practice_id = $1 AND trn02 = 'SYNEFTCAS02001' LIMIT 1"),
      marchRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-03-01' AND status = 'complete' ORDER BY created_at LIMIT 1"),
      aprilRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-04-01' AND status = 'complete' ORDER BY created_at LIMIT 1"),
    };
  });
  for (const found of Object.values(ids)) {
    expect(found).not.toBe('');
  }

  await test.step('the practice home, its cases, claims and anomalies', async () => {
    await atRoute(page, at(), 'the practice home', ['Agreements']);
    await atRoute(page, at('/cases'), 'cases', ['Cases']);
    await atRoute(page, at('/claims'), 'claims and lines', ['Claims and lines']);
    await atRoute(page, at('/anomalies'), 'anomalies', ['Anomaly cohorts']);
    const cohort = (await page.getByRole('table', { name: 'Anomaly cohorts', exact: true }).locator('[data-anomaly]').first().getAttribute('data-anomaly')) ?? '';
    await atRoute(page, at(`/anomalies?anomaly=${cohort}`), 'an anomaly cohort', ['Flagged lines']);
  });

  await test.step('the mapping, the remittances and the pricing runs', async () => {
    await atRoute(page, at('/mapping'), 'payers and plans', ['Payers and plans']);
    await atRoute(page, at(`/mapping/${ids.planN}`), 'a plan mapped as no agreement', ['Agreement resolution']);
    await atRoute(page, at('/remittances'), 'remittances', ['Remittances']);
    await atRoute(page, at(`/remittances/${ids.remittanceQ}`), 'a remittance', ['Claims']);
    await atRoute(page, at(`/pricing-runs/${ids.marchRun}`), 'the March run', ['Run lines', 'Variance by payer pattern']);
    const trace = (await page.getByRole('table', { name: 'Run lines', exact: true }).getByRole('link', { name: 'Line trace' }).first().getAttribute('href')) ?? '';
    await atRoute(page, trace, 'a line’s trace', ['Adjustments']);
    await atRoute(page, at(`/pricing-runs/compare?before=${ids.marchRun}&after=${ids.aprilRun}`), 'the March and April runs compared', ['Changed lines']);
  });

  await test.step('the contracts, a version’s rate record, coverage and its report, the releases', async () => {
    await atRoute(page, at('/contracts'), 'contracts', ['Contracts']);
    await atRoute(page, at(`/contracts/${ids.contractId}`), 'a contract', ['Versions']);
    await atRoute(page, at(`/contracts/versions/${ids.versionId}`), 'a contract version', ['Fields of rate record 1']);
    await atRoute(page, at('/coverage'), 'coverage', ['Plans waiting on mapping', 'Unpriced reasons and their remedies']);
    await page.getByRole('region', { name: 'Coverage report' }).getByRole('button', { name: 'Generate the coverage report' }).click();
    await expect(page).toHaveURL(/\/reports\/documents\/[0-9a-f-]{36}$/);
    await atPhoneWidth(page, 'the coverage report', { tables: ['Plans waiting on mapping', 'Unpriced reasons and their remedies'], soft: true });
    await page.goto(at('/releases'));
    // The release's notes open, so their box is measured too.
    await page.getByText("The release's notes (RELEASE.md)").click();
    await atPhoneWidth(page, 'the rule release notes, the notes open', { tables: ['Rule releases'], soft: true });
  });

  await test.step('the uploads, an upload, the packet builder and the pricing settings', async () => {
    await atRoute(page, at('/uploads'), 'uploads', ['Receipts']);
    await atRoute(page, at(`/uploads/${ids.documentN}`), 'an upload', ['Transaction sets']);
    await page.goto(at(`/cases/${ids.caseId}/packet`));
    // A retry finds the version the attempt before wrote.
    const first = page.getByRole('region', { name: 'First version' });
    await expect(first.or(page.getByRole('table', { name: 'Line schedule' }))).toBeVisible();
    if ((await first.count()) > 0) {
      await page.getByRole('button', { name: 'Write the first version' }).click();
      await expect(page.locator('[data-notice="written"]')).toBeVisible();
    }
    await atPhoneWidth(page, 'the packet builder', { tables: ['Line schedule', 'Versions'], soft: true });
    // Three short columns fit a phone: no table is named, and the width, the scrollers and axe are still checked.
    await atRoute(page, at('/settings/pricing'), 'pricing settings');
  });

  await test.step('the practice administrator’s access log and grants', async () => {
    const context = await browser.newContext();
    const admin = await context.newPage();
    try {
      await signInWithTotp(admin, JOURNEY_PRACTICE_ADMIN);
      await atRoute(admin, at('/settings/access-log'), 'the access log', ['Access log']);
      await atRoute(admin, at('/settings/agreements'), 'grants and agreements', ['Grants']);
    } finally {
      await context.close();
    }
  });

  await test.step('the contract specialist’s versions in progress and a draft’s cited page', async () => {
    const context = await browser.newContext();
    const specialist = await context.newPage();
    try {
      await registerKeyAndSignInAgain(specialist, SPECIALIST);
      await atRoute(specialist, at('/abstraction'), 'contract abstraction', ['Versions in progress']);
      await specialist.goto(at(`/abstraction/versions/${ids.draftId}`));
      await expect(specialist.locator('[data-page-text]')).toBeVisible();
      await atPhoneWidth(specialist, 'a draft version’s cited page', { soft: true });
    } finally {
      await context.close();
    }
  });
});

test('at 390 px every console table scrolls in its own region, says so, and passes axe (TBL-02, TBL-03)', async ({ browser }) => {
  test.setTimeout(240_000);
  // One open synthetic ticket for the desk (once per database), from a customer persona no sign-in here uses.
  const requester = await userId(MANAGER);
  await withDatabase((client) =>
    client.query(
      `INSERT INTO support_ticket (requester_id, screen, category, subject, message)
       SELECT $1, 'tables', 'question', $2, 'SYNTHETIC: a ticket for the desk to read at a phone''s width.'
        WHERE NOT EXISTS (SELECT 1 FROM support_ticket WHERE subject = $2)`,
      [requester, TICKET],
    ),
  );
  /** Each persona in a browser of its own, signed in with its own hardware key. */
  const as = async (key: string, run: (page: Page) => Promise<void>) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await registerKeyAndSignInAgain(page, key);
      await run(page);
    } finally {
      await context.close();
    }
  };

  await test.step('the platform administrator’s terms, rule releases, billing, models, status and organizations', () =>
    as('tables-admin', async (page) => {
      await atRoute(page, '/console/terms', 'terms of use', ['Terms versions']);
      await atRoute(page, '/console/rule-releases', 'rule releases', ['Rule releases']);
      await atRoute(page, '/console/billing', 'billing', ['Billing status']);
      await atRoute(page, '/console/models', 'model features', ['Model spend by practice']);
      await atRoute(page, '/console/status', 'service status');
      await atRoute(page, '/console/organizations', 'organizations', ['Organizations']);
    }),
  );

  await test.step('the support desk’s tickets', () =>
    as('tables-support', async (page) => {
      await atRoute(page, '/console/tickets', 'tickets', ['Tickets']);
      await expect(page.getByRole('table', { name: 'Tickets', exact: true })).toContainText(TICKET);
    }),
  );

  await test.step('the contract specialist’s queue and the screening’s approved splits', () =>
    as('tables-console-specialist', async (page) => {
      await atRoute(page, '/console/specialist-queue?all=1', 'the specialist queue, every practice', ['Practices']);
      await atRoute(page, '/console/screening', 'the screening’s place-of-service split', ['Approved splits']);
    }),
  );
});
