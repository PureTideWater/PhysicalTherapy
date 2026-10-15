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

/** A release number: a positive integer written without leading zeros. */
export function parseReleaseNumber(text: string | undefined): number | undefined {
  return text !== undefined && /^[1-9]\d{0,8}$/.test(text) ? Number.parseInt(text, 10) : undefined;
}

export class ReleaseToolError extends Error {
  override readonly name = 'ReleaseToolError';
}
