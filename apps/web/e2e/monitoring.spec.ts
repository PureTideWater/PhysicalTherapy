import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { personaEmail } from '../scripts/synthetic-personas';
import { expectAccessible } from './a11y';
import { E2E_MAIL_OUTBOX_DIR } from './env';
import { signInWithTotp, withDatabase } from './helpers';
import { journeyPractice, queue, signedOffSchedule, until, userId } from './journeys';
import { MONITORED_PRACTICE, startLocalWorker } from './worker';

/**
 * Monthly monitoring in the browser (PRD 5, J11; PRD 6, Monitoring jobs and notifications; PRD 7,
 * Practice dashboard; test matrix JOB-01, JOB-02, JOB-03): in a practice of its own (one the e2e
 * worker's monitoring steps act for, and the one whose digest it sends, e2e/worker.ts), a billing
 * manager uploads a SYNTHETIC remittance
 * (CAS-08) whose payer schedule is signed off beside the browser, with a dispute window that closes a week
 * from today. The daily schedule's monitor job then plans the month in the job's own name, and the chain
 * prices it, triages it into a case, tells the practice's people in the app and reconciles. The monthly
 * digest for the month before is emailed to the local outbox with counts and dollar totals only and one
 * link, which opens the digest's page. A job that fails three times (a parse whose stored bytes are gone)
 * shows on the dashboard as "Last run failed" with its job reference. The month's line events are dated
 * back into the month before (test setup only, triggers off) so the digest of a month that has ended
 * counts them: the e2e cannot wait for a month to end. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003', 'SYNTHLAST'];
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The month before today's (UTC): the digest the schedule sends today. */
function lastMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

/** A dispute window from CAS-08's payment (2026-04-08) that ends a week from today. */
function windowDays(): number {
  const paid = Date.UTC(2026, 3, 8);
  const now = new Date();
  return Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - paid) / 86_400_000) + 7;
}

interface OutboxMessage {
  readonly to: readonly string[];
  readonly subject: string;
  readonly body: string;
}

function outboxFor(email: string): OutboxMessage[] {
  if (!existsSync(E2E_MAIL_OUTBOX_DIR)) {
    return [];
  }
  // Only messages renamed into place: the local sender writes each under a hidden name first.
  return readdirSync(E2E_MAIL_OUTBOX_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(E2E_MAIL_OUTBOX_DIR, file), 'utf8')) as OutboxMessage)
    .filter((message) => message.to.includes(email));
}

test('the chain plans, prices, triages and tells the practice; the monthly digest reaches the outbox in counts and totals; three failures show as the last run failed (J11)', async ({ page }) => {
  test.setTimeout(480_000);
  const practiceId = await journeyPractice({ name: MONITORED_PRACTICE, settings: SETTINGS });
  const manager = personaEmail('monitoring-manager');
  await signInWithTotp(page, 'monitoring-manager');
  const local = await startLocalWorker();
  try {
    await test.step('a remittance loads, and its payer’s schedule is signed off', async () => {
      await page.goto(`/p/${practiceId}`);
      await expect(page.getByRole('heading', { name: 'Upload your first 835 files' })).toBeVisible();
      await expectAccessible(page, 'The dashboard before the first file');
      await page.getByRole('link', { name: 'Go to Uploads' }).click();
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      await signedOffSchedule({ practiceId, managerKey: 'monitoring-manager', planKey: 'CE:SYNPLAN-FIX-ONE', disputeWindowDays: windowDays() });
    });

    await test.step('the daily schedule’s monitor plans the month in the job’s name; the chain prices, triages and tells the practice', async () => {
      await queue('monitor', { practice_id: practiceId, day: today() });
      // The chain has run out: triage opened the case and told the manager, the reconcile triage queued
      // after the chain's run has succeeded, and no job of the practice is still running (the
      // dashboard's last run is the newest job's).
      await until(
        () =>
          withDatabase(async (client) => {
            const { rows } = await client.query<{ cases: number; notified: number; reconciled: number; running: number }>(
              `SELECT (SELECT count(*)::int FROM "case" WHERE practice_id = $1) AS cases,
                      (SELECT count(*)::int FROM notification n JOIN "user" u ON u.id = n.user_id WHERE n.practice_id = $1 AND n.kind = 'monitoring_run' AND u.email = $2) AS notified,
                      (SELECT count(*)::int FROM job_run j JOIN pricing_run r ON r.id::text = j.idempotency_key
                        WHERE j.practice_id = $1 AND j.job_type = 'reconcile' AND j.outcome = 'succeeded' AND r.practice_id = $1 AND r.created_by_job_id IS NOT NULL) AS reconciled,
                      (SELECT count(*)::int FROM job_run WHERE practice_id = $1 AND outcome IN ('running', 'retrying')) AS running`,
              [practiceId, manager],
            );
            const row = rows[0];
            return row !== undefined && row.cases > 0 && row.notified > 0 && row.reconciled > 0 && row.running === 0;
          }),
        'the monitoring chain',
        120_000,
      );
      await page.goto(`/p/${practiceId}/pricing-runs`);
      await expect(page.getByRole('list', { name: 'Pricing runs' }).getByRole('listitem').first()).toContainText('2026-03-01 to 2026-03-31');
      await expect(page.getByRole('list', { name: 'Pricing runs' }).getByRole('listitem').first()).toContainText(/monitoring/i);
      await page.goto(`/p/${practiceId}/notifications`);
      const notification = page.locator('[data-kind="monitoring_run"]').first();
      await expect(notification).toContainText('priced and triaged by monitoring: 3 of 3 lines priced');
      await expect(notification).toContainText('1 cases');
      await expectAccessible(page, 'Notifications');
    });

    await test.step('the dashboard shows the run, the case nearing its deadline, and its headline at each stage', async () => {
      await page.goto(`/p/${practiceId}`);
      await expect(page.locator('[data-figure="actionable"]')).toContainText('$90.00');
      await expect(page.locator('[data-figure="payer-approved"]')).toContainText('$0.00');
      await expect(page.locator('[data-figure="recovered-total"]')).toContainText('$0.00');
      await expect(page.locator('[data-figure="coverage"]')).toContainText('3 of 3 lines priced (100.0%)');
      await expect(page.locator('[data-figure="deadlines"]')).toContainText('1 case, $90.00 actionable');
      await expect(page.locator('[data-figure="last-run"]').locator('[data-outcome]')).toHaveAttribute('data-outcome', 'succeeded');
      await expect(page.locator('[data-queue="unassigned"]')).toHaveAttribute('data-count', '1');
      await expectAccessible(page, 'The dashboard');
      await page.locator('[data-figure="deadlines"]').getByRole('link').click();
      await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/cases\\?deadline=14$`));
      await expect(page.getByRole('table', { name: 'Cases' }).getByRole('row')).toHaveCount(2);
      await expectAccessible(page, 'Cases with a deadline within 14 days');
    });

    await test.step('the monthly digest reaches the outbox in counts and totals with one link, and the link opens it', async () => {
      // Test setup only: the month's line events are dated into the month before, which has ended.
      await withDatabase(async (client) => {
        await client.query('BEGIN');
        await client.query('SET LOCAL session_replication_role = replica');
        await client.query("UPDATE line_status SET set_at = ($2::date + interval '14 days') WHERE practice_id = $1", [practiceId, `${lastMonth()}-01`]);
        await client.query('COMMIT');
      });
      await queue('digest', { practice_id: practiceId, period: lastMonth() });
      await until(() => Promise.resolve(outboxFor(manager).length > 0), 'the digest email', 90_000);
      const [message] = outboxFor(manager);
      expect(message?.subject).toMatch(/^Monitoring digest for /);
      const body = message?.body ?? '';
      expect(body).toContain('$90.00');
      expect(body).toContain('Cases nearing their deadline (within 14 days): 1, actionable $90.00.');
      for (const value of KNOWN) {
        expect(body).not.toContain(value);
      }
      const links = [...body.matchAll(/https?:\/\/\S+/g)].map((match) => match[0]);
      expect(links).toHaveLength(1);
      const link = new URL(links[0] ?? '');
      expect(() => {
        assertNoPhi('url', `${link.pathname}${link.search}`, { known: KNOWN });
      }).not.toThrow();
      expect(link.pathname).toMatch(new RegExp(`^/p/${practiceId}/digests/[0-9a-f-]{36}$`));
      await page.goto(link.pathname);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Monitoring digest for');
      await expect(page.getByRole('list', { name: 'Digest figures' })).toContainText('$90.00');
      await expectAccessible(page, 'A digest');
      // A replay of the month's digest sends nothing again (JOB-01).
      await queue('digest', { practice_id: practiceId, period: lastMonth() });
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      expect(outboxFor(manager)).toHaveLength(1);
    });

    await test.step('a job that fails three times shows on the dashboard as the last run failed, with its job reference (JOB-02)', async () => {
      // An upload whose stored bytes are gone: its parse fails on every attempt.
      const documentId = randomUUID();
      const uploader = await userId('monitoring-manager');
      await withDatabase((client) =>
        client.query(
          `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
           VALUES ($1, $2, 'x12_835', $3, 1200, 'application/octet-stream', $4, 'clean', now(), 'parse_queued')`,
          [documentId, practiceId, createHash('sha256').update(documentId).digest('hex'), uploader],
        ),
      );
      await queue('parse_835', { practice_id: practiceId, document_id: documentId });
      await until(
        () =>
          withDatabase(
            async (client) => ((await client.query("SELECT 1 FROM job_run WHERE practice_id = $1 AND job_type = 'parse_835' AND idempotency_key = $2 AND outcome = 'failed'", [practiceId, documentId])).rowCount ?? 0) > 0,
          ),
        'three failed attempts',
        300_000,
      );
      await page.goto(`/p/${practiceId}`);
      const banner = page.getByRole('alert').filter({ hasText: 'Last run failed' });
      await expect(banner).toContainText('Parse and load of an 835 failed three times');
      await expect(banner).toContainText('The operator has been alerted (job reference');
      const jobId = (await banner.getAttribute('data-job')) ?? '';
      expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
      await expect(banner).toContainText(jobId.slice(0, 8));
      await expect(banner.getByRole('link', { name: 'Uploads' })).toBeVisible();
      await expectAccessible(page, 'The dashboard with the run-failed banner');
      expect(() => {
        assertNoPhi('url', page.url(), { known: KNOWN });
      }).not.toThrow();
    });
  } finally {
    await local.close();
  }
});
