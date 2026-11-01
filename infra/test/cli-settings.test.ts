import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The CDK CLI posts usage telemetry and fetches notices on every command by default (docs/adr/0012, amendment
// of 2026-11-01). Both are turned off by CLI settings, never by app context: cdk.json's context stays empty.

const infraDir = path.resolve(import.meta.dirname, '..');
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(infraDir, file), 'utf8')) as T;

const manifest = readJson<{ scripts: Record<string, string> }>('package.json');
const cdkJson = readJson<{ context?: Record<string, unknown>; notices?: unknown }>('cdk.json');

// A script runs the CLI directly when a command in it (start, or after a shell separator, past any
// VAR=value prefixes) is `cdk`.
const runsCdkDirectly = (command: string): boolean =>
  command.split(/&&|\|\||;|\|/).some((part) => /^\s*(?:[A-Z_][A-Z0-9_]*=\S*\s+)*cdk(?:\s|$)/.test(part));

describe('the CDK CLI sends no telemetry and fetches no notices', () => {
  it('synthesizes with telemetry off and without notices', () => {
    const synth = manifest.scripts.synth ?? '';
    expect(synth).toMatch(/^CDK_DISABLE_CLI_TELEMETRY=true cdk synth\b/);
    expect(synth.split(/\s+/)).toContain('--no-notices');
  });

  it('sets the same two on every infra script that runs the CLI directly', () => {
    const direct = Object.entries(manifest.scripts).filter(([, command]) => runsCdkDirectly(command));
    expect(direct.map(([name]) => name)).toContain('synth');
    for (const [name, command] of direct) {
      expect(command, name).toMatch(/(?:^|\s)CDK_DISABLE_CLI_TELEMETRY=true\s/);
      expect(command.split(/\s+/), name).toContain('--no-notices');
    }
  });

  it('keeps cdk:diff running the CLI with telemetry off', () => {
    const script = readFileSync(path.join(infraDir, 'scripts/cdk-diff.ts'), 'utf8');
    expect(script).toMatch(/CDK_DISABLE_CLI_TELEMETRY:\s*'true'/);
  });

  it('turns notices off in cdk.json for any cdk command run from infra/', () => {
    expect(cdkJson.notices).toBe(false);
  });

  it('does it without app context: cdk.json context stays empty', () => {
    expect(cdkJson.context).toEqual({});
  });

  it('recognizes a direct CLI run, with or without a variable prefix', () => {
    expect(runsCdkDirectly('cdk synth --quiet')).toBe(true);
    expect(runsCdkDirectly('A=1 CDK_DISABLE_CLI_TELEMETRY=true cdk synth')).toBe(true);
    expect(runsCdkDirectly('tsc --noEmit && cdk ls')).toBe(true);
    expect(runsCdkDirectly('tsx scripts/cdk-diff.ts')).toBe(false);
    expect(runsCdkDirectly('vitest run --root .. --project unit infra/')).toBe(false);
  });
});
