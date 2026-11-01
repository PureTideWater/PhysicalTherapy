import path from 'node:path';

import { repositoryRoot } from '../content-files';
import type { Runtime } from './canary/verdict';

/**
 * The runtime every mutation job is held to (docs/adr/0066, Part 7). Not yet built: these are the failing-first stubs.
 */

/** The pins: the Node, Unicode and ICU tools/stryker/unicode.json's entries were checked on, and the root's pnpm. */
export interface Pins {
  readonly node: string;
  readonly unicode: string;
  readonly icu: string;
  readonly pnpm: string;
}

/** What the CLI prints, and its exit status. */
export interface RuntimeCheck {
  readonly lines: readonly string[];
  readonly status: number;
}

export const PACKAGE_MANAGER = /^$/;

export function packageManagerVersion(_value: unknown): string {
  return '';
}

export function pnpmOfUserAgent(_agent: string | undefined): string {
  return '';
}

export function runtimeProblems(_runtime: Runtime, _pins: Pins): string[] {
  return [];
}

export function readPins(_root: string = repositoryRoot): Pins {
  return { node: '', unicode: '', icu: '', pnpm: '' };
}

export function checkRuntime(_runtime: Runtime, _pins: Pins): RuntimeCheck {
  return { lines: [], status: 0 };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = checkRuntime({ node: process.version, unicode: process.versions.unicode ?? '', icu: process.versions.icu ?? '', pnpm: pnpmOfUserAgent(process.env.npm_config_user_agent) }, readPins()).status;
}
