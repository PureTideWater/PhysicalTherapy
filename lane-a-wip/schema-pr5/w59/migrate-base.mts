// W59: migrate a scratch database through the migration BEFORE 20261115090000 (a directory of links), with the real runner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MIGRATIONS_DIR, migrate } from '/home/user/PhysicalTherapy/packages/db/src/migrate';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w59-mig-'));
for (const name of fs.readdirSync(MIGRATIONS_DIR)) {
  if (!name.startsWith('20261115090000_')) fs.copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(dir, name));
}
const started = Date.now();
const result = await migrate({ databaseUrl: process.env.DATABASE_URL!, migrationsDir: process.argv[2] === 'real' ? MIGRATIONS_DIR : dir, devLogin: true });
process.stdout.write(`applied ${String(result.applied.length)} (last ${result.applied.at(-1) ?? 'none'}), already ${String(result.alreadyApplied.length)}, ${String(Date.now() - started)} ms\n`);
