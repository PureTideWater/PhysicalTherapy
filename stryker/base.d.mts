// The types of stryker/base.mjs, for the TypeScript that reads its sets (tools/stryker; the workflow's tests).
import type { PartialStrykerOptions } from '@stryker-mutator/api/core';

export declare const MUTATION_PACKAGES: readonly ['money', 'pricing', 'ledger', 'packets'];
export type MutationPackage = (typeof MUTATION_PACKAGES)[number];
export declare const PACKAGE_VARIABLE: 'TP_MUTATION_PACKAGE';
export declare const SHARD_VARIABLE: 'TP_MUTATION_SHARD';
export declare const REPORT_DIRECTORY: 'reports/mutation';
export declare const MUTATE: Readonly<Record<MutationPackage, readonly string[]>>;
export declare const BASE_OPTIONS: PartialStrykerOptions;
export interface Shard {
  /** The shard's name: its CI job's and its reports' directory. */
  readonly name: string;
  /** The files it mutates, by package. */
  readonly mutate: Partial<Record<MutationPackage, readonly string[]>>;
}
export declare function readShards(): readonly Shard[];
export declare function reportFile(pkg: MutationPackage, shard: string | undefined): string;
export declare function packageOptions(pkg: MutationPackage): PartialStrykerOptions;
