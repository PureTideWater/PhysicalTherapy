import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { PASSWORD_EXCLUDED_CHARACTERS } from '../lib/retention';
import { DATABASE_SETTINGS, launchScript, secretVariables } from '../lib/launch';

/** Runs a launch script under POSIX sh with only the given environment, printing what the command sees. */
function run(script: string, env: Record<string, string>) {
  const result = spawnSync('/bin/sh', ['-c', script], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env }, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const DATABASE = { [DATABASE_SETTINGS.host]: 'tp.cluster.example.test', [DATABASE_SETTINGS.port]: '5432', [DATABASE_SETTINGS.name]: 'tp' };

describe('launchScript', () => {
  it('builds each URL from its secret fields, verifying the server, and drops the parts before the command runs', () => {
    const script = launchScript([{ variable: 'DATABASE_URL' }, { variable: 'QUEUE_DATABASE_URL', role: 'tp_queue' }], ['env']);
    const result = run(script, {
      ...DATABASE,
      DATABASE_URL_USERNAME: 'tp_app_login',
      DATABASE_URL_PASSWORD: 'synthetic-password_1',
      QUEUE_DATABASE_URL_USERNAME: 'tp_queue_login_clone',
      QUEUE_DATABASE_URL_PASSWORD: 'synthetic.password=2',
    });
    expect(result.status).toBe(0);
    const env = Object.fromEntries(result.stdout.trim().split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    expect(env.DATABASE_URL).toBe('postgres://tp_app_login:synthetic-password_1@tp.cluster.example.test:5432/tp?sslmode=verify-full');
    expect(env.QUEUE_DATABASE_URL).toBe('postgres://tp_queue_login_clone:synthetic.password=2@tp.cluster.example.test:5432/tp?sslmode=verify-full&options=-c%20role%3Dtp_queue');
    for (const part of ['DATABASE_URL_USERNAME', 'DATABASE_URL_PASSWORD', 'QUEUE_DATABASE_URL_USERNAME', 'QUEUE_DATABASE_URL_PASSWORD']) {
      expect(env[part], part).toBeUndefined();
    }
  });

  it('builds URLs a URL parser reads back field for field, the session role included', () => {
    const script = launchScript([{ variable: 'QUEUE_DATABASE_URL', role: 'tp_queue' }], ['printenv', 'QUEUE_DATABASE_URL']);
    const result = run(script, { ...DATABASE, QUEUE_DATABASE_URL_USERNAME: 'tp_queue_login', QUEUE_DATABASE_URL_PASSWORD: 'a^b,c-d.e=f_g' });
    const url = new URL(result.stdout.trim());
    expect(url.protocol).toBe('postgres:');
    expect(decodeURIComponent(url.username)).toBe('tp_queue_login');
    expect(decodeURIComponent(url.password)).toBe('a^b,c-d.e=f_g');
    expect(url.hostname).toBe('tp.cluster.example.test');
    expect(url.port).toBe('5432');
    expect(url.pathname).toBe('/tp');
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('options')).toBe('-c role=tp_queue');
  });

  it('can carry every character a generated password may hold without it being read as shell syntax', () => {
    const allowed = [...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'].filter((character) => !PASSWORD_EXCLUDED_CHARACTERS.includes(character)).join('');
    expect(allowed).toBe(',-.=^_');
    const tricky = `$(touch /nonexistent)\`id\`${allowed}`;
    const result = run(launchScript([{ variable: 'DATABASE_URL' }], ['printenv', 'DATABASE_URL']), { ...DATABASE, DATABASE_URL_USERNAME: 'u', DATABASE_URL_PASSWORD: tricky });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`postgres://u:${tricky}@tp.cluster.example.test:5432/tp?sslmode=verify-full`);
  });

  it('stops before the command, naming the missing part and no value, when a secret field is absent', () => {
    const result = run(launchScript([{ variable: 'OPERATOR_DATABASE_URL' }], ['printenv', 'OPERATOR_DATABASE_URL']), {
      ...DATABASE,
      OPERATOR_DATABASE_URL_USERNAME: 'tp_operator_login',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('OPERATOR_DATABASE_URL_PASSWORD');
    expect(result.stderr).not.toContain('tp_operator_login');
  });

  it('replaces the shell with the command, which then runs as the task\'s main process', () => {
    expect(launchScript([], ['node', 'dist/main.js']).split('\n').at(-1)).toBe('exec node dist/main.js');
  });

  it('refuses a command or a role that is not plain words', () => {
    expect(() => launchScript([], [])).toThrow(/plain words/);
    expect(() => launchScript([], ['node', 'a;b'])).toThrow(/plain words/);
    expect(() => launchScript([{ variable: 'DATABASE_URL', role: 'tp-queue' }], ['node'])).toThrow(/not a role name/);
  });

  it('names the secret fields after the variable', () => {
    expect(secretVariables({ variable: 'QUEUE_DATABASE_URL' })).toEqual({ username: 'QUEUE_DATABASE_URL_USERNAME', password: 'QUEUE_DATABASE_URL_PASSWORD' });
  });
});
