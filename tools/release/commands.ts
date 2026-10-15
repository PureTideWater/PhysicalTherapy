import { isSyntheticReleaseNumber } from '@tp/rules';

/**
 * The release commands of the load-release skill and PRD section 9: assemble builds
 * content/outgoing/<n> with RELEASE.md and MANIFEST.json from verified drafts; dry-run lists the
 * runs whose lines would change; load writes a release into the global tables. None of them ever
 * writes content/releases (CI publishes on merge).
 */
export const RELEASE_COMMANDS = ['assemble', 'dry-run', 'load'] as const;
export type ReleaseCommand = (typeof RELEASE_COMMANDS)[number];

export function isReleaseCommand(value: string | undefined): value is ReleaseCommand {
  return RELEASE_COMMANDS.some((command) => command === value);
}

/**
 * A real release number: a positive integer written without leading zeros, below the range
 * reserved for SYNTHETIC fixture releases (FIRST_SYNTHETIC_RELEASE, 900000).
 */
export function parseReleaseNumber(text: string | undefined): number | undefined {
  if (text === undefined || !/^[1-9]\d{0,5}$/.test(text)) {
    return undefined;
  }
  const release = Number.parseInt(text, 10);
  return isSyntheticReleaseNumber(release) ? undefined : release;
}

export class ReleaseToolError extends Error {
  override readonly name = 'ReleaseToolError';
}
