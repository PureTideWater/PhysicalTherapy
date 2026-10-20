import { type Locator, type Page, expect } from '@playwright/test';
import { asOwner } from '@tp/db/testing';

import { withDatabase } from './helpers';

/**
 * The packet journeys' export attempts (the best-option audit's item #26, the founder's ruling of 2026-10-18;
 * docs/adr/0061), synthetic data only: the coded events the export job records for a packet version, read on the
 * e2e database as the operator would, and held to codes and opaque IDs; and the case page's write-off and reopen
 * of a line, as a billing manager does them, which change the case under a queued export.
 */

export interface AttemptEvent {
  readonly actor_kind: string;
  readonly action: string;
  readonly object_type: string;
  readonly object_id: string;
  readonly practice_id: string;
  readonly purpose: string;
  readonly request_id: string;
}

const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The version's refusal and failure events, oldest first, each checked to hold codes and opaque IDs only and none of
 * `known` (the fixture's identifiers).
 */
export async function attemptEvents(practiceId: string, versionId: string, known: readonly string[]): Promise<AttemptEvent[]> {
  const rows = await withDatabase(async (client) =>
    asOwner(client, [practiceId], async () =>
      (
        await client.query<AttemptEvent>(
          `SELECT actor_kind, action, object_type, object_id, practice_id, purpose, request_id FROM audit_event
            WHERE practice_id = $1 AND object_id = $2 AND action IN ('packet_export_refused', 'packet_export_attempt_failed', 'packet_export_failed') ORDER BY at, id`,
          [practiceId, versionId],
        )
      ).rows,
    ),
  );
  for (const row of rows) {
    for (const code of [row.actor_kind, row.action, row.object_type, row.purpose]) {
      expect(code).toMatch(CODE);
    }
    for (const id of [row.object_id, row.practice_id]) {
      expect(id).toMatch(UUID);
    }
    for (const identifier of known) {
      expect(JSON.stringify(row)).not.toContain(identifier);
    }
  }
  return rows;
}

/** The packet's current version, from the builder's own Approve or Export form (the version shown). */
export async function shownVersionId(page: Page): Promise<string> {
  const href = (await page.getByRole('table', { name: 'Versions' }).locator('tr', { hasText: '(current)' }).getByRole('link').first().getAttribute('href')) ?? '';
  return new URL(href, 'http://localhost').searchParams.get('version') ?? '';
}

/** Writes the case page's first actionable line off as not worth pursuit; returns the line, as the page names it. */
export async function writeOffFirstLine(page: Page, casePath: string): Promise<Locator> {
  await page.goto(casePath);
  const open = page.getByRole('list', { name: 'Case lines' }).locator('[data-actionable="yes"]').first();
  const lineId = (await open.getAttribute('data-case-line')) ?? '';
  await open.getByText('Write this line off').click();
  await open.getByRole('combobox', { name: 'Reason' }).selectOption({ label: 'Not worth pursuit' });
  await open.getByRole('checkbox').check();
  await open.getByRole('button', { name: 'Write off' }).click();
  const line = page.locator(`[data-case-line="${lineId}"]`);
  await expect(line).toHaveAttribute('data-actionable', 'no');
  return line;
}

/** Reopens a written-off line on the case page, with a reason. */
export async function reopenLine(page: Page, casePath: string, line: Locator): Promise<void> {
  await page.goto(casePath);
  await line.getByText('Reopen this line').click();
  await line.getByRole('textbox', { name: 'Reason' }).fill('SYNTHETIC written off by mistake');
  await line.getByRole('button', { name: 'Reopen' }).click();
  await expect(line).toHaveAttribute('data-actionable', 'yes');
}
