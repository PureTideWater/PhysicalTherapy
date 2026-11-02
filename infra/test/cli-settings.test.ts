import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The CDK CLI posts usage telemetry on every command, fetches notices (cached an hour) and, on a terminal, checks npm
// for its latest version once a day (docs/adr/0012, amendment of 2026-11-01). The repository's scripts turn all three
// off, by environment variable and --no-notices. cdk.json sets none of them, so a person's own cdk deploy still shows
// notices matched to our CLI, aws-cdk-lib constructs, Node and bootstrap stack. cdk.json's context stays empty.

const infraDir = path.resolve(import.meta.dirname, '..');
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(infraDir, file), 'utf8')) as T;

const manifest = readJson<{ scripts: Record<string, string> }>('package.json');
const cdkJson = readJson<{ context?: Record<string, unknown>; notices?: unknown }>('cdk.json');

// A script runs the CLI directly when a command in it (start, or after a shell separator, past any
// VAR=value prefixes and a package-runner launcher: pnpm [exec|dlx], npx [flags], yarn [dlx]) is `cdk`.
const launcher = String.raw`(?:pnpm\s+(?:(?:exec|dlx)\s+)?|npx\s+(?:-\S+\s+)*|yarn\s+(?:dlx\s+)?)?`;
const directCdk = new RegExp(String.raw`^\s*(?:[A-Z_][A-Z0-9_]*=\S*\s+)*` + launcher + String.raw`cdk(?:\s|$)`);
const runsCdkDirectly = (command: string): boolean =>
  command.split(/&&|\|\||;|\|/).some((part) => directCdk.test(part));

// The env object cdk:diff spawns the CLI with, its comments removed: a commented-out setting is not a setting.
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
const envObject = (source: string): string => /\benv:\s*\{([^}]*)\}/.exec(withoutComments(source))?.[1] ?? '';
const cdkDiffEnv = envObject(readFileSync(path.join(infraDir, 'scripts/cdk-diff.ts'), 'utf8'));

describe("the repository's cdk runs send no telemetry, fetch no notices and skip the version check", () => {
  it('synthesizes with telemetry and the version check off and without notices', () => {
    const synth = manifest.scripts.synth ?? '';
    expect(synth).toMatch(/^CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true cdk synth\b/);
    expect(synth.split(/\s+/)).toContain('--no-notices');
  });

  it('sets the same three on every infra script that runs the CLI directly', () => {
    const direct = Object.entries(manifest.scripts).filter(([, command]) => runsCdkDirectly(command));
    expect(direct.map(([name]) => name)).toContain('synth');
    for (const [name, command] of direct) {
      expect(command, name).toMatch(/(?:^|\s)CDK_DISABLE_CLI_TELEMETRY=true\s/);
      expect(command, name).toMatch(/(?:^|\s)CDK_DISABLE_VERSION_CHECK=true\s/);
      expect(command.split(/\s+/), name).toContain('--no-notices');
    }
  });

  it('keeps cdk:diff running the CLI with telemetry and the version check off', () => {
    expect(cdkDiffEnv).toMatch(/\bCDK_DISABLE_CLI_TELEMETRY:\s*'true'/);
    expect(cdkDiffEnv).toMatch(/\bCDK_DISABLE_VERSION_CHECK:\s*'true'/);
  });

  it("leaves notices to the CLI default for a person's own cdk commands: cdk.json sets no notices key", () => {
    expect(cdkJson).not.toHaveProperty('notices');
  });

  it('does it without app context: cdk.json context stays empty', () => {
    expect(cdkJson.context).toEqual({});
  });

  it('recognizes a direct CLI run, with or without a variable prefix', () => {
    expect(runsCdkDirectly('cdk synth --quiet')).toBe(true);
    expect(runsCdkDirectly('A=1 CDK_DISABLE_CLI_TELEMETRY=true cdk synth')).toBe(true);
    expect(runsCdkDirectly('tsc --noEmit && cdk ls')).toBe(true);
    expect(runsCdkDirectly('pnpm exec cdk deploy')).toBe(true);
    expect(runsCdkDirectly('pnpm dlx cdk deploy')).toBe(true);
    expect(runsCdkDirectly('pnpm cdk deploy')).toBe(true);
    expect(runsCdkDirectly('npx cdk deploy')).toBe(true);
    expect(runsCdkDirectly('npx --yes cdk deploy')).toBe(true);
    expect(runsCdkDirectly('yarn cdk deploy')).toBe(true);
    expect(runsCdkDirectly('CDK_DISABLE_CLI_TELEMETRY=true pnpm exec cdk ls')).toBe(true);
    expect(runsCdkDirectly('tsx scripts/cdk-diff.ts')).toBe(false);
    expect(runsCdkDirectly('pnpm cdk:diff')).toBe(false);
    expect(runsCdkDirectly('pnpm exec tsx scripts/cdk-diff.ts')).toBe(false);
    expect(runsCdkDirectly('vitest run --root .. --project unit infra/')).toBe(false);
  });

  it("reads cdk:diff's env object without its comments", () => {
    expect(envObject("spawnSync('cdk', [], { env: { ...process.env, A: 'true' } });")).toContain("A: 'true'");
    expect(envObject("env: {\n  ...process.env,\n  B: 'true',\n}")).toContain("B: 'true'");
    expect(envObject("env: {\n  ...process.env,\n  // A: 'true',\n}")).not.toContain("A: 'true'");
    expect(envObject("env: { ...process.env /* A: 'true' */ }")).not.toContain("A: 'true'");
    expect(envObject("// env: { A: 'true' }")).toBe('');
  });
});
