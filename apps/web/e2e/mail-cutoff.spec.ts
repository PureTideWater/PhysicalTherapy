import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { OWNER_ROLE } from '@tp/db';

import { SCREENING_PAUSED } from '../src/lib/screening/messages';
import { atPhoneWidth, expectAccessible } from './a11y';
import { withDatabase } from './helpers';
import { until } from './journeys';
import { MAIL_CONSOLE_ADMIN, MAIL_CONTROL, holdScreeningStream, recordMailEventsOnce, registerKeyAndSignInAs, screeningStreamSending } from './mail';
import { outboxFor } from './outbox';
import { CLEAN_ROWS, SCREENING_HEADER, SCREENING_ZIP, screeningRowsCsv, startLocalScreeningConsumer } from './screening';

/**
 * The screening stream's cut-off (audit #76; docs/adr/0065, D6 to D8; the founder's Q9 of 2026-10-21: 3% of hard
 * bounces over at least 200 sends in 7 days; test matrix SCR-21), in the browser. Six hard-bounced screening results are
 * already in the window (seeded through the owner's connection, as from different clients, so the bounce budget of
 * Q10 (a) does not stop the journey); the seventh is a screening a prospect uploads on the page to SES's bounce
 * simulator, labelled for this journey, with a practice name of its own (a screening from the same address or practice
 * would replace an earlier one). The consumer prices it and emails the result; the platform's mail_events job records
 * the bounce, and the stream pauses: the job disables the screening's SES set, and the page says new screenings are
 * paused. A platform administrator resumes it in the console with a reason; the platform's reconcile enables the set and
 * confirms it, the probes go and come back, and the screening opens again. The journey holds the one screening stream
 * alone (e2e/mail.ts), and leaves it sending whatever happens. Synthetic data only.
 */
const cutoffTest = test.extend<{ stream: undefined; consumer: Awaited<ReturnType<typeof startLocalScreeningConsumer>> }>({
  stream: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from its first parameter's pattern.
    async ({}, provide) => {
      const release = await holdScreeningStream('exclusive');
      try {
        await provide(undefined);
      } finally {
        try {
          await screeningStreamSending();
        } finally {
          await release();
        }
      }
    },
    { auto: true },
  ],
  consumer: [
    async ({ stream }, provide) => {
      void stream;
      const consumer = await startLocalScreeningConsumer();
      try {
        await provide(consumer);
      } finally {
        await consumer.close();
      }
    },
    { auto: true },
  ],
});

/** The seventh bounce: SES's bounce simulator, labelled so the journey's events are its own. */
const BOUNCING = 'bounce+e2e7@simulator.amazonses.com';

cutoffTest('a seventh hard bounce in a week pauses the screening stream alone; the page says so; a platform administrator resumes it with a reason, and it opens once SES and the probes confirm (SCR-21)', async ({ browser }) => {
  test.setTimeout(240_000);
  const practice = `SYNTHETIC CUTOFF CLINIC ${randomUUID().slice(0, 8).toUpperCase()}`;

  await test.step('six hard-bounced screening results are already in the window', async () => {
    await withDatabase(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
        for (let index = 0; index < 6; index += 1) {
          await client.query(
            `INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, bounce_kind, bounce_subtype, sent_at, undelivered_at)
             VALUES ($1, 'screening', 'screening_result', $2, 'bounced', 'permanent', 'general', now(), now())`,
            [`e2e-cutoff-seed-${String(index)}-${randomUUID()}`, randomUUID()],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  });

  const context = await browser.newContext();
  const prospect = await context.newPage();
  await test.step('a prospect screens a clean file, and its result is emailed to an address that bounces', async () => {
    await prospect.goto('/screening');
    await prospect.getByLabel('Practice name').fill(practice);
    await prospect.getByLabel('State').selectOption('MN');
    await prospect.getByLabel('ZIP code', { exact: true }).fill(SCREENING_ZIP);
    await prospect.getByLabel('Work email').fill(BOUNCING);
    await prospect.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: screeningRowsCsv([SCREENING_HEADER, ...CLEAN_ROWS]) });
    await expect(prospect.locator('[data-state="file-ready"]')).toBeVisible();
    await prospect.getByRole('button', { name: 'Screen the file' }).click();
    await expect(prospect.locator('[data-state="sent"]')).toBeVisible();
    await until(() => Promise.resolve(outboxFor(BOUNCING).length > 0), 'the result emailed to the bouncing address');
  });

  await test.step('the platform records the bounce: the stream pauses for its bounce rate, and the screening\'s SES set alone is disabled', async () => {
    // A second run reconciles SES with the pause, whichever run (this spec's or the notice journey's) recorded it.
    await recordMailEventsOnce();
    await recordMailEventsOnce();
    const stream = await withDatabase(
      async (client) => (await client.query<{ stream: string; paused_reason: string | null }>('SELECT stream, paused_reason FROM mail_stream ORDER BY stream')).rows,
    );
    expect(stream).toEqual([
      { stream: 'notices', paused_reason: null },
      { stream: 'screening', paused_reason: 'bounce_rate' },
      { stream: 'transactional', paused_reason: null },
    ]);
    expect(MAIL_CONTROL.sending).toBe(false);
    const paused = await withDatabase(async (client) => (await client.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_event WHERE action = 'mail_stream_paused' AND purpose = 'bounce_rate'")).rows[0]?.n);
    expect(Number(paused)).toBeGreaterThanOrEqual(1);
  });

  await test.step('the screening page says new screenings are paused, and that uploads already made are kept', async () => {
    await prospect.goto('/screening');
    const alert = prospect.locator('[data-state="paused"]');
    await expect(alert).toContainText(SCREENING_PAUSED.title);
    await expect(alert.locator('[data-copy="paused"]')).toHaveText(SCREENING_PAUSED.text);
    await expect(prospect.getByLabel('File to screen')).toHaveCount(0);
    await expectAccessible(prospect, 'the paused screening page');
    await atPhoneWidth(prospect, 'the paused screening page');
  });

  const consoleContext = await browser.newContext();
  const admin = await consoleContext.newPage();
  try {
    await test.step('a platform administrator sees the pause and its counts, and resumes it as a false alarm', async () => {
      await registerKeyAndSignInAs(admin, MAIL_CONSOLE_ADMIN);
      await admin.goto('/console/mail');
      await expect(admin.getByRole('heading', { level: 1, name: 'Mail streams' })).toBeVisible();
      const screening = admin.locator('[data-stream="screening"]');
      await expect(screening).toHaveAttribute('data-state', 'paused');
      await expect(screening).toContainText('Its bounce rate passed the cut-off');
      // The resume form says a review SES still holds pauses it again (the platform reads SES's enforcement each minute).
      await expect(screening.locator('[data-copy="resume-review"]')).toHaveText('If SES still has the account under review, the platform pauses it again within a minute.');
      // The customer streams never pause.
      await expect(admin.locator('[data-stream="transactional"]')).toHaveAttribute('data-state', 'sending');
      await expect(admin.locator('[data-stream="notices"]')).toHaveAttribute('data-state', 'sending');
      await expectAccessible(admin, 'the console\'s mail streams, paused');
      await atPhoneWidth(admin, 'the console\'s mail streams, paused');
      await admin.getByLabel('Why it can resume').selectOption('false_alarm');
      await admin.getByRole('button', { name: 'Resume the screening stream' }).click();
      await expect(admin).toHaveURL(/\/console\/mail\?notice=resumed$/);
      await expect(admin.locator('[data-notice="resumed"]')).toContainText('The screening stream is resumed');
      // Resumed, but not sending until the platform reads SES sending again.
      await expect(screening).toHaveAttribute('data-state', 'unconfirmed');
      const resumed = await withDatabase(async (client) => (await client.query<{ purpose: string }>("SELECT purpose FROM audit_event WHERE action = 'mail_stream_resumed' ORDER BY at DESC LIMIT 1")).rows[0]?.purpose);
      expect(resumed).toBe('false_alarm');
    });

    await test.step('the platform enables the set and confirms it, the probes go and come back, and the screening opens again', async () => {
      await until(async () => {
        await recordMailEventsOnce();
        const row = await withDatabase(
          async (client) =>
            (
              await client.query<{ ready: boolean }>(
                `SELECT ses_enabled_confirmed_at IS NOT NULL AND probe_delivered_at >= resumed_at AND probe_bounced_at >= resumed_at AS ready
                   FROM mail_stream WHERE stream = 'screening'`,
              )
            ).rows[0],
        );
        return row?.ready === true;
      }, 'the screening stream confirmed and both probes back');
      expect(MAIL_CONTROL.sending).toBe(true);
      await admin.goto('/console/mail');
      await expect(admin.locator('[data-stream="screening"]')).toHaveAttribute('data-state', 'sending');
      await expect(admin.locator('[data-ready]')).toHaveAttribute('data-ready', 'yes');
      // Sending, the card says when the stream pauses by itself, the floors' own counts named, and what a mark is on.
      await expect(admin.locator('[data-stream="screening"]')).toContainText(
        'It pauses by itself when more than 3% of its sends bounce permanently (counted over at least 200 sends, so 7 hard bounces pause it) or more than 0.08% are reported as spam (over at least 2,500, so 3 complaints pause it), within 7 days or since the last resume; on the account’s warnings; or under an SES review.',
      );
      await expect(admin.locator('[data-stream="screening"]')).toContainText('on email domains or mailboxes (3 refuse a fourth screening)');
      await prospect.goto('/screening');
      await expect(prospect.locator('[data-state="paused"]')).toHaveCount(0);
      await expect(prospect.getByLabel('File to screen')).toBeVisible();
    });
  } finally {
    await consoleContext.close();
    await context.close();
  }
});
