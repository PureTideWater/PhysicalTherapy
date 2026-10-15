import path from 'node:path';

import { isX12Interchange, listFiles } from '../content-files';

/** Synthetic X12 fixtures the oracle must read: any file under fixtures/synthetic that begins with ISA. */
export function findOracleFixtures(root: string): string[] {
  return listFiles(root, 'fixtures/synthetic').filter((file) => isX12Interchange(path.join(root, file)));
}
