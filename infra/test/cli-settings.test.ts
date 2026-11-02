import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
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

// The longest one spawned process (tsx or the CLI) may take. A test that spawns gets this much per process it spawns,
// past the unit project's 5-second default, which a cold CI runner can overrun: the first run of the cdk:diff test in a
// fresh worktree took 4.6 s. So a slow process fails as its own timeout, with its output, not as the test's.
const SPAWN_TIMEOUT_MS = 60_000;

// The commands of a script, split at the shell's separators, a newline among them.
const commands = (script: string): string[] => script.split(/&&|\|\||;|\||&|\n/).map((command) => command.trim());
// A command that names the CDK CLI as a word, by its bin `cdk` or its package `aws-cdk`, however it is started
// (directly, by a package runner such as `npx aws-cdk` or `pnpm dlx aws-cdk@<version>`, by a path, through env or
// cross-env, in a subshell). It fails closed: a command that names it must carry the settings itself, so a way of
// starting the CLI this test does not know of still needs them. `cdk:diff`, `cdk-diff.ts`, `cdk.json`, `cdk.out`, the
// library `aws-cdk-lib` and the `@aws-cdk/` packages do not name it.
const namesCdk = (command: string): boolean => /(?<![\w@-])(?:aws-)?cdk(?![\w:.-])/.test(command);
// The VAR=value prefix of a command, as the variables it sets.
const prefixVariables = (command: string): Record<string, string> => {
  const prefix = /^\s*((?:[A-Z_][A-Z0-9_]*=\S*\s+)*)/.exec(command)?.[1] ?? '';
  return Object.fromEntries([...prefix.matchAll(/([A-Z_][A-Z0-9_]*)=(\S*)/g)].map((match) => [match[1] ?? '', match[2] ?? '']));
};

// The commands of a script that name the cdk CLI without all three settings of their own: the two variables in the
// command's own VAR=value prefix (a prefix reaches only the command it precedes) and --no-notices among its arguments.
const commandsWithoutSettings = (script: string): string[] =>
  commands(script)
    .filter(namesCdk)
    .filter((command) => {
      const variables = prefixVariables(command);
      return variables.CDK_DISABLE_CLI_TELEMETRY !== 'true' || variables.CDK_DISABLE_VERSION_CHECK !== 'true' || !command.split(/\s+/).includes('--no-notices');
    });

// Every cdk command `pnpm cdk:diff` starts, with its arguments and CDK_ variables, recorded by a stand-in `cdk` first on
// PATH. cdk-diff.ts itself runs, under tsx, with no AWS credentials and no metadata endpoint, so its credential probe
// fails without a request, and with the caller's environment turning both settings back on, which it must override.
interface CdkCall {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}
const cdkDiffCalls = (): CdkCall[] => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tp-cdk-stand-in-'));
  try {
    const log = path.join(dir, 'calls.jsonl');
    const standIn = path.join(dir, 'cdk');
    writeFileSync(
      standIn,
      `#!${process.execPath}\nconst env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('CDK_')));\n` +
        `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), env }) + '\\n');\n`,
    );
    chmodSync(standIn, 0o755);
    const none = path.join(dir, 'none');
    const tsx = createRequire(import.meta.url).resolve('tsx/cli');
    const result = spawnSync(process.execPath, [tsx, 'scripts/cdk-diff.ts'], {
      cwd: infraDir,
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
      env: {
        PATH: `${dir}${path.delimiter}${process.env.PATH ?? ''}`,
        HOME: dir,
        AWS_EC2_METADATA_DISABLED: 'true',
        AWS_CONFIG_FILE: none,
        AWS_SHARED_CREDENTIALS_FILE: none,
        HTTPS_PROXY: 'http://127.0.0.1:9',
        HTTP_PROXY: 'http://127.0.0.1:9',
        CDK_DISABLE_CLI_TELEMETRY: '0',
        CDK_DISABLE_VERSION_CHECK: '',
      },
    });
    expect(result.status, `${result.stderr}${result.error?.message ?? ''}`).toBe(0);
    return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as CdkCall) : [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// The CLI infra installs, the one both scripts run. When a CLI bump changes how it reads a setting, these tests fail and
// a person reads canCollectTelemetry, --no-notices and shouldDisplayVersionMessage in its lib/index.js
// (docs/runbooks/dependency-upgrades.md, the AWS paragraph).
const cliPackage = createRequire(import.meta.url).resolve('aws-cdk/package.json');
const cliDir = path.dirname(cliPackage);
const cliBin = path.join(cliDir, (JSON.parse(readFileSync(cliPackage, 'utf8')) as { bin: { cdk: string } }).bin.cdk);

// The installed CLI run from infra/ with only the given variables, so nothing outside the repository decides it: an
// empty HOME (no ~/.cdk.json), CDK_HOME for its cache, TMPDIR for what it hands a telemetry sender, no AWS configuration
// and no metadata endpoint. TELEMETRY_ENDPOINT is a local port nothing listens on, so the CLI decides on a telemetry
// sink as it would with AWS's endpoint, and traces that decision at -vvv, while a sink it builds sends nowhere: its
// detached sender (the control below starts one) fails to connect, and the proxies are closed too. A notices fetch
// shows as the notices cache it writes under CDK_HOME, or as the refresh it logs.
interface CliRun {
  readonly output: string;
  readonly fetchedNotices: boolean;
  /** The CLI's own trace of its telemetry decision: a sink registered, telemetry disabled, or neither traced. */
  readonly telemetrySink: 'registered' | 'disabled' | undefined;
}
const CLOSED_TELEMETRY_ENDPOINT = 'http://127.0.0.1:9/metrics';
const runCli = (args: readonly string[], variables: Readonly<Record<string, string>>): CliRun => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'tp-cdk-home-'));
  try {
    const none = path.join(home, 'none');
    const result = spawnSync(process.execPath, [cliBin, ...args, '-vvv'], {
      cwd: infraDir,
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: home,
        CDK_HOME: path.join(home, '.cdk'),
        TMPDIR: home,
        TELEMETRY_ENDPOINT: CLOSED_TELEMETRY_ENDPOINT,
        HTTPS_PROXY: 'http://127.0.0.1:9',
        HTTP_PROXY: 'http://127.0.0.1:9',
        AWS_EC2_METADATA_DISABLED: 'true',
        AWS_CONFIG_FILE: none,
        AWS_SHARED_CREDENTIALS_FILE: none,
        ...variables,
      },
    });
    expect(result.status, `${result.stderr}${result.error?.message ?? ''}`).toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    return {
      output,
      fetchedNotices: existsSync(path.join(home, '.cdk', 'cache', 'notices.json')) || /refresh(?:ed)? notices/i.test(output),
      telemetrySink: /\] Telemetry sink registered$/m.test(output) ? 'registered' : /\] Telemetry disabled$/m.test(output) ? 'disabled' : undefined,
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

describe("the repository's cdk runs send no telemetry, fetch no notices and skip the version check", () => {
  it('synthesizes with telemetry and the version check off and without notices', () => {
    const synth = manifest.scripts.synth ?? '';
    expect(synth).toMatch(/^CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true cdk synth\b/);
    expect(synth.split(/\s+/)).toContain('--no-notices');
  });

  it('sets all three on each cdk command of every infra script', () => {
    const named = Object.entries(manifest.scripts).filter(([, script]) => commands(script).some(namesCdk));
    expect(named.map(([name]) => name)).toContain('synth');
    for (const [name, script] of Object.entries(manifest.scripts)) {
      expect(commandsWithoutSettings(script), name).toEqual([]);
    }
  });

  it('starts the CLI from cdk:diff with all three, whatever the caller set, and the installed CLI then sends no telemetry', () => {
    const calls = cdkDiffCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.env, call.args.join(' ')).toMatchObject({ CDK_DISABLE_CLI_TELEMETRY: 'true', CDK_DISABLE_VERSION_CHECK: 'true' });
      expect(call.args, call.args.join(' ')).toContain('--no-notices');
    }
    const run = runCli(['cli-telemetry', '--status', '--no-notices'], calls[0]?.env ?? {});
    expect(run.output).toMatch(/CLI Telemetry is disabled\./);
    expect(run.telemetrySink).toBe('disabled');
  }, 2 * SPAWN_TIMEOUT_MS);

  it("leaves notices to the CLI default for a person's own cdk commands: cdk.json sets no notices key", () => {
    expect(cdkJson).not.toHaveProperty('notices');
  });

  it("leaves the installed CLI's telemetry off under the synth script's variables, by its status command and its sink, where without them it registers a sink", () => {
    const variables = prefixVariables(manifest.scripts.synth ?? '');
    expect(Object.keys(variables)).toContain('CDK_DISABLE_CLI_TELEMETRY');
    const run = runCli(['cli-telemetry', '--status', '--no-notices'], variables);
    expect(run.output).toMatch(/CLI Telemetry is disabled\./);
    // The sink is decided apart from the status command (the CLI's startTelemetry), so it is asked for itself.
    expect(run.telemetrySink).toBe('disabled');
    expect(run.output).not.toMatch(/Telemetry dispatched/);
    const control = runCli(['cli-telemetry', '--status', '--no-notices'], {});
    expect(control.output, 'the control run, without the variables').toMatch(/CLI Telemetry is enabled\./);
    expect(control.telemetrySink, 'the control run, without the variables').toBe('registered');
  }, 2 * SPAWN_TIMEOUT_MS);

  it('makes the installed CLI fetch no notices under --no-notices, where without it the CLI does fetch them', () => {
    const variables = prefixVariables(manifest.scripts.synth ?? '');
    expect(runCli(['cli-telemetry', '--status'], variables).fetchedNotices, 'the control run, without --no-notices').toBe(true);
    expect(runCli(['cli-telemetry', '--status', '--no-notices'], variables).fetchedNotices).toBe(false);
  }, 2 * SPAWN_TIMEOUT_MS);

  it('finds the installed CLI still skipping its version check when CDK_DISABLE_VERSION_CHECK is set', () => {
    // The check runs only when stdout is a terminal, which a test cannot give the CLI, so its code is read.
    const source = readFileSync(path.join(cliDir, 'lib/index.js'), 'utf8');
    expect(source).toMatch(/function shouldDisplayVersionMessage\(\) \{\s*return !!process\.stdout\.isTTY && !process\.env\.CDK_DISABLE_VERSION_CHECK;\s*\}/);
    expect(source).toMatch(/if \(shouldDisplayVersionMessage\(\)\) \{\s*await displayVersionMessage\(/);
  });

  it('does it without app context: cdk.json context stays empty', () => {
    expect(cdkJson.context).toEqual({});
  });

  it('finds every command that names the cdk CLI, however it is started, and nothing else', () => {
    for (const command of [
      'cdk synth --quiet',
      'A=1 CDK_DISABLE_CLI_TELEMETRY=true cdk synth',
      'pnpm exec cdk deploy',
      'pnpm dlx cdk deploy',
      'pnpm cdk deploy',
      'pnpm -s cdk deploy',
      'pnpm --silent exec cdk deploy',
      'npx cdk deploy',
      'npx --yes cdk deploy',
      'npx --package aws-cdk cdk deploy',
      'npm exec -- cdk deploy tp-staging',
      'yarn cdk deploy',
      'bunx cdk deploy',
      'env AWS_PROFILE=synthetic cdk deploy',
      'cross-env A=1 cdk deploy',
      'node_modules/.bin/cdk deploy',
      './node_modules/.bin/cdk deploy',
      '(cdk ls)',
      'npx aws-cdk deploy tp-staging',
      'pnpm dlx aws-cdk@2.1146.1 deploy tp-staging',
      'node node_modules/aws-cdk/lib/index.js deploy',
    ]) {
      expect(namesCdk(command), command).toBe(true);
    }
    for (const command of [
      'tsx scripts/cdk-diff.ts',
      'pnpm cdk:diff',
      'pnpm exec tsx scripts/cdk-diff.ts',
      'vitest run --root .. --project unit infra/',
      'tsc --noEmit',
      'cat cdk.json',
      'rm -rf cdk.out',
      'pnpm --filter aws-cdk-lib ls',
      'pnpm add aws-cdk-lib@2.275.0',
      'pnpm why @aws-cdk/cloud-assembly-schema',
    ]) {
      expect(namesCdk(command), command).toBe(false);
    }
  });

  it('asks each cdk command for the settings itself, since a VAR=value prefix reaches only the command it precedes', () => {
    const on = 'CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true';
    expect(commandsWithoutSettings(`${on} cdk synth --quiet --no-notices`)).toEqual([]);
    expect(commandsWithoutSettings(`${on} cdk synth --quiet --no-notices && cdk ls`)).toEqual(['cdk ls']);
    expect(commandsWithoutSettings(`${on} cdk synth --quiet --no-notices\ncdk deploy`)).toEqual(['cdk deploy']);
    expect(commandsWithoutSettings(`${on} npx aws-cdk deploy`)).toEqual([`${on} npx aws-cdk deploy`]);
    expect(commandsWithoutSettings(`${on} pnpm dlx aws-cdk@2.1146.1 deploy --no-notices`)).toEqual([]);
    expect(commandsWithoutSettings(`${on} tsc --noEmit && cdk deploy --no-notices`)).toEqual(['cdk deploy --no-notices']);
    expect(commandsWithoutSettings(`tsc --noEmit && (${on} cdk ls --no-notices)`)).toEqual([`(${on} cdk ls --no-notices)`]);
    expect(commandsWithoutSettings(`env ${on} cdk deploy --no-notices`)).toEqual([`env ${on} cdk deploy --no-notices`]);
    expect(commandsWithoutSettings(`${on} cdk deploy`)).toEqual([`${on} cdk deploy`]);
    expect(commandsWithoutSettings('CDK_DISABLE_CLI_TELEMETRY=true cdk ls --no-notices')).toEqual(['CDK_DISABLE_CLI_TELEMETRY=true cdk ls --no-notices']);
    expect(commandsWithoutSettings('tsx scripts/cdk-diff.ts')).toEqual([]);
  });
});
