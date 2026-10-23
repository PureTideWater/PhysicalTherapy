import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { OWNER_ROLE } from '@tp/db';

import { atPhoneWidth, expectAccessible } from './a11y';
import { withDatabase } from './helpers';
import { MAIL_NOTICE_ADMIN, MAIL_NOTICE_PRACTICE, recordMailEventsOnce, sendSupportNoticesOnce, signInAs } from './mail';
import { outboxFor } from './outbox';

/**
 * A break-glass notice that reaches no one (audit #76; docs/adr/0065, D10; test matrix SEC-19), in the browser. The
 * practice's one administrator is SES's suppression-list simulator (e2e/mail.ts): support access is granted, the
 * platform's support_notices job sends the opening notice, one message for the one administrator, from the recorded
 * outbox; the platform's mail_events job records SES's suppression of it by its message ID. The administrator's
 * support-access page says the notice was not delivered and that PaidWhole was told; the notifications say which notice
 * did not reach every administrator, linked to the grant, with no figure and no address. Synthetic data only.
 */
test('a support-access notice the suppression list stops is not delivered to 1 of 1 administrator, says so on the grant, and in the notifications, linked to it (SEC-19)', async ({ page }) => {
  test.setTimeout(120_000);
  const ticket = `SYN-MAIL-${randomUUID().slice(0, 8)}`;
  const { practiceId, grantId } = await withDatabase(async (client) => {
    const practice = (await client.query<{ id: string }>('SELECT id FROM practice WHERE name = $1', [MAIL_NOTICE_PRACTICE])).rows[0]?.id ?? '';
    const support = (await client.query<{ id: string }>("SELECT id FROM \"user\" WHERE email = 'support@synthetic.test'")).rows[0]?.id ?? '';
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      await client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${practice}}`]);
      const grant = (
        await client.query<{ id: string }>("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYNTHETIC MAIL JOURNEY ACCESS', now() + interval '4 hours') RETURNING id", [
          practice,
          support,
          ticket,
        ])
      ).rows[0]?.id;
      await client.query('COMMIT');
      return { practiceId: practice, grantId: grant ?? '' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  await test.step('the platform sends the opening notice, one message to the one administrator, and records SES\'s suppression of it', async () => {
    await sendSupportNoticesOnce();
    const messages = outboxFor(MAIL_NOTICE_ADMIN.email).filter((message) => message.body.includes(grantId));
    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toEqual([MAIL_NOTICE_ADMIN.email]);
    await recordMailEventsOnce();
    const recipients = await withDatabase(
      async (client) =>
        (
          await client.query<{ state: string }>(
            "SELECT r.state FROM support_grant_notice n JOIN support_grant_notice_recipient r ON r.notice_id = n.id WHERE n.support_grant_id = $1 AND n.notice = 'support_grant_opened'",
            [grantId],
          )
        ).rows,
    );
    expect(recipients).toEqual([{ state: 'suppressed' }]);
    // The audit trail: the notice was handed to the mail service, and then reported undelivered, once.
    const events = await withDatabase(
      async (client) =>
        (await client.query<{ action: string }>("SELECT action FROM audit_event WHERE object_id = $1 AND action IN ('notice_sent', 'notice_undelivered') ORDER BY at, action", [grantId])).rows,
    );
    expect(events.map((event) => event.action)).toEqual(['notice_sent', 'notice_undelivered']);
  });

  await test.step('the administrator\'s support-access page says the notice was not delivered, and that PaidWhole was told', async () => {
    await signInAs(page, MAIL_NOTICE_ADMIN);
    await page.goto(`/p/${practiceId}/support-access/${grantId}`);
    await expect(page.getByRole('heading', { level: 1, name: `Support access for ticket ${ticket}` })).toBeVisible();
    await expect(page.locator('[data-notice="opening"]')).toHaveText('Not delivered to 1 of 1 administrator. PaidWhole has been told.');
    await expect(page.locator('[data-notice="closing"]')).toHaveText('Sent when access ends');
    await expectAccessible(page, 'the support-access page with an undelivered notice');
    await atPhoneWidth(page, 'the support-access page with an undelivered notice');
  });

  await test.step('the notifications say which notice did not reach every administrator, and the link opens that grant', async () => {
    await page.goto(`/p/${practiceId}/notifications`);
    const link = page.getByRole('link', { name: 'A support-access opening notice did not reach every administrator' });
    await expect(link).toBeVisible();
    await expect(page.getByRole('list', { name: 'Notifications' })).toContainText("Check your administrators' email addresses.");
    await expect(page.getByRole('list', { name: 'Notifications' })).not.toContainText('@');
    await expectAccessible(page, 'the notifications with an undelivered notice');
    await atPhoneWidth(page, 'the notifications with an undelivered notice');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/support-access/${grantId}$`));
    await expect(page.locator('[data-notice="opening"]')).toHaveText('Not delivered to 1 of 1 administrator. PaidWhole has been told.');
  });
});
