import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * tools/ci/postgres.sh, the CI jobs' PostgreSQL from docker-compose.yml (docs/adr/0066, Part 2), run as a job runs it
 * with a stand-in `docker` first on PATH: no Docker daemon is needed. The stand-in records its arguments and, by
 * STUB_MODE, becomes healthy, fails at once or never finishes.
 */

const SCRIPT = path.join(repositoryRoot, 'tools/ci/postgres.sh');

const STUB = `#!/usr/bin/env bash
echo "$$" > "$STUB_DIR/pid"
printf '%s\\n' "$*" > "$STUB_DIR/args"
case "$STUB_MODE" in
  healthy) sleep 1.5; echo " Container therapy-platform-postgres-1  Healthy"; exit 0 ;;
  failing) echo "Error response from daemon: pull access denied for postgres" >&2; exit 18 ;;
  hanging) exec sleep 600 ;;
esac
exit 99
`;

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-postgres-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A runner's temporary directory and a PATH whose `docker` is the stand-in, in this mode. */
function runner(mode: 'healthy' | 'failing' | 'hanging') {
  const dir = mkdtempSync(path.join(scratch, `${mode}-`));
  const bin = path.join(dir, 'bin');
  const temp = path.join(dir, 'runner-temp');
  mkdirSync(bin);
  mkdirSync(temp);
  writeFileSync(path.join(bin, 'docker'), STUB);
  chmodSync(path.join(bin, 'docker'), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, RUNNER_TEMP: temp, STUB_DIR: dir, STUB_MODE: mode };
  // As GitHub runs a `shell: bash` step: its output read through pipes, which the step waits on until they close.
  const run = (command: 'up' | 'wait', extra: Record<string, string> = {}) => {
    const started = Date.now();
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', SCRIPT, command], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
    return { status: result.status, output: result.stdout + result.stderr, seconds: (Date.now() - started) / 1000 };
  };
  const stop = () => {
    const pid = path.join(dir, 'pid');
    if (existsSync(pid)) {
      try {
        process.kill(Number(readFileSync(pid, 'utf8').trim()));
      } catch {
        // Already gone.
      }
    }
  };
  return { dir, temp, run, stop };
}

describe('tools/ci/postgres.sh', () => {
  it('starts compose in the background and returns at once, its streams closed, then passes on compose’s healthy verdict', () => {
    const { dir, temp, run } = runner('healthy');
    const up = run('up');
    expect(up.status).toBe(0);
    expect(up.output).toContain('Starting PostgreSQL from docker-compose.yml in the background');
    // The stand-in takes 1.5 s: up did not wait for it.
    expect(up.seconds).toBeLessThan(1.5);
    const wait = run('wait');
    expect(wait.status, wait.output).toBe(0);
    expect(wait.output).toContain('PostgreSQL is healthy');
    // Exactly compose's own wait for the one service, bounded below the wait step's limit.
    expect(readFileSync(path.join(dir, 'args'), 'utf8')).toBe('compose up --detach --wait --wait-timeout 120 postgres\n');
    expect(readFileSync(path.join(temp, 'postgres-up.status'), 'utf8')).toBe('0\n');
    expect(readFileSync(path.join(temp, 'postgres-up.log'), 'utf8')).toContain('Healthy');
  });

  it('fails the wait at once when compose failed, printing compose’s log', () => {
    const { run } = runner('failing');
    expect(run('up').status).toBe(0);
    const wait = run('wait');
    expect(wait.status).toBe(1);
    expect(wait.output).toContain('::error title=PostgreSQL::docker compose up exited with status 18, so the database did not start.');
    expect(wait.output).toContain('pull access denied for postgres');
    expect(wait.seconds).toBeLessThan(5);
  });

  it('returns from up at once while compose never finishes, and fails the wait after its limit, printing what compose wrote', () => {
    const { run, stop } = runner('hanging');
    try {
      const up = run('up');
      // A background start that held the step's pipes open would keep this call waiting for the stand-in's 600 s.
      expect(up.status).toBe(0);
      expect(up.seconds).toBeLessThan(5);
      const wait = run('wait', { POSTGRES_WAIT_SECONDS: '2' });
      expect(wait.status).toBe(1);
      expect(wait.output).toContain('::error title=PostgreSQL::docker compose up gave no verdict within 2 s.');
      expect(wait.output).toContain('docker compose up (postgres) wrote nothing.');
      expect(wait.seconds).toBeGreaterThanOrEqual(2);
    } finally {
      stop();
    }
  });

  it('refuses any other command', () => {
    const { run } = runner('healthy');
    const result = spawnSync('bash', [SCRIPT, 'down'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage: tools/ci/postgres.sh up|wait');
    expect(run('wait', { POSTGRES_WAIT_SECONDS: '1' }).status).toBe(1);
  });

  it('is executable, as the workflows run it by its path', () => {
    expect(spawnSync('test', ['-x', SCRIPT]).status).toBe(0);
  });
});
