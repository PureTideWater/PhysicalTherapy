/**
 * The release commands of the load-release skill and PRD section 9. Milestone 0 part B fills them
 * in: prepare assembles content/outgoing/<n> with RELEASE.md and MANIFEST.json from verified drafts;
 * dry-run lists the runs whose lines would change; load writes a release into the global tables.
 * None of them ever writes content/releases (CI publishes on merge).
 */
export const RELEASE_COMMANDS = ['prepare', 'dry-run', 'load'] as const;
export type ReleaseCommand = (typeof RELEASE_COMMANDS)[number];

export function isReleaseCommand(value: string | undefined): value is ReleaseCommand {
  return RELEASE_COMMANDS.some((command) => command === value);
}
