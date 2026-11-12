// W59 (not part of the repository): SYNTHETIC CAS-08 as HOM-01 sets it up (three 97110 x 2, each 30.00 short, one
// case), in a database the world creates on DATABASE_URL's server and this file does NOT drop (W59 drops it), as the seed rows the month is cloned from.
import { writeFileSync } from 'node:fs';

import { readDatabaseUrl } from '@tp/db';
import { expect, it } from 'vitest';

import { RELEASE } from '../price/test-support/pricing-world';
import { TriageWorld } from '../triage/test-support/triage-world';

it('builds the seed world', async () => {
  const w = await TriageWorld.open(readDatabaseUrl());
  const practice = await w.practice('W59 SYNTHETIC month', { case_materiality_cents: '1000' });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, '2026-03-01', '2026-03-31', RELEASE);
  await w.pricing.execute(practice, runId);
  await w.triage(practice, runId);
  // No close(): close() drops the database. The pools end with the process.
  const url = new URL((w.pricing as unknown as { database: { url: string } }).database.url);
  writeFileSync(process.env.W59_OUT as string, `${practice.practiceId} ${url.pathname.slice(1)}\n`);
  expect(practice.practiceId).toMatch(/^[0-9a-f-]{36}$/);
}, 180_000);
