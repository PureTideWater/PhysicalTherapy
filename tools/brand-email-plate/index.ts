import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PLATES, PUBLIC_DIR, compositeOnPlate, decodePng, encodePng } from './plate';

/**
 * Writes (--write) or checks (--check) the email lockups on their White plate from the delivered art (plate.ts).
 * A check compares pixels, not bytes, so a different zlib does not fail it.
 */
const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
  process.stderr.write('usage: pnpm brand:email-plate --write | --check\n');
  process.exit(2);
}
let stale = 0;
for (const { source, plate } of PLATES) {
  const expected = compositeOnPlate(decodePng(readFileSync(path.join(PUBLIC_DIR, source))));
  const target = path.join(PUBLIC_DIR, plate);
  if (mode === '--write') {
    writeFileSync(target, encodePng(expected));
    process.stdout.write(`wrote ${plate} (${String(expected.width)} x ${String(expected.height)})\n`);
    continue;
  }
  let current;
  try {
    current = decodePng(readFileSync(target));
  } catch {
    current = null;
  }
  const same = current !== null && current.width === expected.width && current.height === expected.height && Buffer.from(current.pixels).equals(Buffer.from(expected.pixels));
  if (!same) {
    stale += 1;
    process.stderr.write(`${plate} is not its source on the plate; run pnpm brand:email-plate --write\n`);
  }
}
process.exit(stale === 0 ? 0 : 1);
