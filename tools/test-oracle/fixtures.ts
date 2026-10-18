import path from 'node:path';

import { isX12Interchange, listFiles } from '../content-files';

/**
 * Synthetic X12 fixtures the oracle must read: any file under fixtures/synthetic that begins with ISA,
 * except output generated at test time into a `generated/` directory (ignored by git), which its
 * case's expected.json declares separately.
 */
export function findOracleFixtures(root: string): string[] {
  return listFiles(root, 'fixtures/synthetic').filter((file) => !file.split(path.sep).includes('generated') && isX12Interchange(path.join(root, file)));
}
