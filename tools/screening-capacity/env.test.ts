import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { HARNESS_LOGINS, NODE_ENV_READS, harnessLogins, loginsEnvironment, platformEnvironment, webEnvironment } from './env';

/**
 * Production fidelity of the capacity test (audit #53 part 1): every NODE_ENV read in apps/worker/src and
 * packages/*\/src, tests aside, is on env.ts's list with its count, so a read that could move a measurement under the
 * platform container's NODE_ENV=test is looked at first; and the containers get the environment the design says.
 */

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sources(full, found);
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** NODE_ENV in code: a string key, a property read or an assignment, with comments removed first. */
function nodeEnvReads(text: string): number {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...code.matchAll(/['"]NODE_ENV['"]|\.NODE_ENV\b|\bNODE_ENV\s*[:=]/g)].length;
}

describe('NODE_ENV in the code the images load', () => {
  it('is read only where env.ts lists it, as many times as it says', () => {
    const packages = readdirSync(path.join(repositoryRoot, 'packages')).map((name) => path.join(repositoryRoot, 'packages', name, 'src'));
    const files = [path.join(repositoryRoot, 'apps/worker/src'), ...packages].flatMap((dir) => {
      try {
        return sources(dir);
      } catch {
        return [];
      }
    });
    const found = files
      .map((file) => ({ file: path.relative(repositoryRoot, file).split(path.sep).join('/'), reads: nodeEnvReads(readFileSync(file, 'utf8')) }))
      .filter((entry) => entry.reads > 0)
      .sort((a, b) => (a.file < b.file ? -1 : 1));
    expect(found).toEqual(NODE_ENV_READS.map(({ file, reads }) => ({ file, reads })).sort((a, b) => (a.file < b.file ? -1 : 1)));
  });

  it('is not loaded from @tp/synth by either image', () => {
    for (const app of ['apps/worker/package.json', 'apps/web/package.json']) {
      const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, app), 'utf8')) as { dependencies?: Record<string, string> };
      expect(Object.keys(manifest.dependencies ?? {}), app).not.toContain('@tp/synth');
    }
  });
});

describe('the containers’ environments', () => {
  const dirs = {
    outbox: '/out/mail',
    auditCopies: '/out/audit',
    restoreDrill: '/out/drill',
    supportMail: '/out/support',
    devAuth: '/out/auth',
    documents: '/out/docs',
    billing: '/out/billing',
    modelOutputs: '/out/models',
    agreements: '/out/agreements',
    compliance: '/out/compliance',
  };

  it('runs the platform worker as production’s platform service, its mail in the outbox (NODE_ENV=test, the one departure)', () => {
    const env = platformEnvironment('postgres://owner:secret@db:5432/tp_capacity', 'http://web:3000', dirs);
    expect(env).toMatchObject({ NODE_ENV: 'test', WORKER_JOBS: 'platform', MAIL_OUTBOX_DIR: '/out/mail', APP_ORIGIN: 'http://web:3000' });
    expect(new URL(env.OPERATOR_DATABASE_URL ?? '').username).toBe('tp_operator_login');
    expect(new URL(env.QUEUE_DATABASE_URL ?? '').username).toBe('tp_queue_login');
    // The platform worker holds no application login (docs/adr/0049).
    expect(env).not.toHaveProperty('DATABASE_URL');
  });

  it('runs the web app’s production build with the e2e suite’s local providers and one trusted proxy hop', () => {
    const env = webEnvironment('postgres://owner:secret@db:5432/tp_capacity', 'http://web:3000', dirs, { cookieSecret: 'c', masterKey: 'k' });
    expect(env).toMatchObject({ NODE_ENV: 'production', TP_ALLOW_LOCAL_PROVIDERS: 'e2e', TRUSTED_PROXY_HOPS: '1', MODEL_PROVIDER: 'local' });
    expect(new URL(env.DATABASE_URL ?? '').username).toBe('tp_app_login');
    expect(env).not.toHaveProperty('ESIGN_PROVIDER');
  });

  it('gives a run on a shared server logins of its own, which every service and the migration task use', () => {
    const logins = harnessLogins('ab12cd34');
    expect(Object.values(logins).map((login) => login.username)).toEqual([
      'tp_app_login_ab12cd34',
      'tp_worker_login_ab12cd34',
      'tp_operator_login_ab12cd34',
      'tp_queue_login_ab12cd34',
      'tp_billing_login_ab12cd34',
    ]);
    expect(loginsEnvironment('postgres://owner:secret@db:5432/tp_capacity', logins)).toMatchObject({
      TP_APP_LOGIN_USERNAME: 'tp_app_login_ab12cd34',
      TP_WORKER_LOGIN_USERNAME: 'tp_worker_login_ab12cd34',
      TP_BILLING_LOGIN_USERNAME: 'tp_billing_login_ab12cd34',
    });
    const web = webEnvironment('postgres://owner:secret@db:5432/tp_capacity', 'http://web:3000', dirs, { cookieSecret: 'c', masterKey: 'k' }, logins);
    const platform = platformEnvironment('postgres://owner:secret@db:5432/tp_capacity', 'http://web:3000', dirs, logins);
    expect([web.DATABASE_URL, web.BILLING_DATABASE_URL, web.QUEUE_DATABASE_URL, platform.OPERATOR_DATABASE_URL, platform.QUEUE_DATABASE_URL].map((url) => new URL(url ?? '').username)).toEqual([
      'tp_app_login_ab12cd34',
      'tp_billing_login_ab12cd34',
      'tp_queue_login_ab12cd34',
      'tp_operator_login_ab12cd34',
      'tp_queue_login_ab12cd34',
    ]);
    // The Docker runtime's own Postgres keeps production's names.
    expect(loginsEnvironment('postgres://owner:secret@db:5432/tp_capacity').TP_APP_LOGIN_USERNAME).toBe(HARNESS_LOGINS.app.username);
    expect(() => harnessLogins('AB-12')).toThrow(RangeError);
  });

  it('gives the migration task every login variable it reads (apps/worker/src/deploy/logins.ts), and nothing else', () => {
    const deploy = readFileSync(path.join(repositoryRoot, 'apps/worker/src/deploy/logins.ts'), 'utf8');
    const wanted = [...deploy.matchAll(/'(TP_[A-Z]+_LOGIN_(?:USERNAME|PASSWORD))'/g)].map((match) => match[1]).sort();
    expect(wanted).toContain('TP_WORKER_LOGIN_USERNAME');
    const given = Object.keys(loginsEnvironment('postgres://owner:secret@db:5432/tp_capacity')).filter((name) => name !== 'DATABASE_URL').sort();
    expect(given).toEqual(wanted);
  });
});
