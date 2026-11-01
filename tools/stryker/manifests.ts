import type { MutationPackage } from '../../stryker/base.mjs';
import type { Change, Closure, GlobalInputs } from './affected';

/**
 * The root manifest, the workspace file, the mutation workflow and every workspace package's manifest, read field by
 * field on both sides of a change, for the mutation workflow's changes job (docs/adr/0066, Part 7; test matrix CI-27
 * and CI-28). A field affects every package, the packages whose closures read it, or none.
 */

/** The scripts pnpm runs on an install, in every workspace project it installs (and prepublishOnly for an injected one). */
export const LIFECYCLE_SCRIPTS = ['pnpm:devPreinstall', 'preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare', 'prepublishOnly'] as const;

/** Dependency names that would link a runtime's bin into the root's node_modules/.bin, ahead of the pinned Node. */
export const RUNTIME_NAMES = ['node', 'deno', 'bun'] as const;

/** A manifest's dependency maps, each judged entry by entry (and the lockfile's importer fields of the same names). */
export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/** pnpm-workspace.yaml keys a frozen install never reads (pnpm 10 reads them only when it resolves). */
export const WORKSPACE_INERT_KEYS = ['minimumReleaseAge', 'minimumReleaseAgeExclude', 'trustPolicy', 'trustPolicyExclude', 'trustPolicyIgnoreAfter'] as const;

/** A pinned step reference, `owner/repo[/path]@<40 hex>`: tools/check-action-pins/workflows.ts PIN, copied so this rule stands on its own. */
export const PINNED_USES = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*)@([0-9a-f]{40})$/;

/** The actions that carry the shards' reports to the gate: a one-shard run cannot prove a merge of several, so a move of either is never pin-only. */
export const TRANSPORT_ACTIONS = ['actions/upload-artifact', 'actions/download-artifact'] as const;

/** What a classified file's change affects: every package (each field with why), the packages its fields name, and the fields read and found inert. */
export interface ManifestVerdict {
  readonly file: string;
  readonly global: readonly string[];
  readonly packages: Readonly<Partial<Record<MutationPackage, readonly string[]>>>;
  readonly inert: readonly string[];
}

/** Each changed manifest's verdict. Not yet field by field: every file affects every package. */
export function classifyManifests(change: Change, _closures: readonly Closure[], _global: GlobalInputs, _tooling: readonly string[]): ManifestVerdict[] {
  return change.files.map((file) => ({ file, global: [`${file} (not classified)`], packages: {}, inert: [] }));
}
