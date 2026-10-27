import { spawn, spawnSync } from 'node:child_process';

import { appDevLoginUrl, workerDevLoginUrl } from '@tp/db';

import { repositoryRoot } from './content-files';

/** The local Postgres from docker-compose.yml. Synthetic data only, ever. */
const LOCAL_DATABASE_URL = 'postgres://postgres:test@localhost:5432/postgres';

/**
 * `pnpm dev`: starts docker-compose.yml's PostgreSQL 18 and waits until its TCP healthcheck passes
 * (`docker compose up --detach --wait`), then the web app and the worker. Without Docker, or when the
 * database does not become healthy, it says so and starts the apps anyway against whatever DATABASE_URL points at. The
 * web app connects as the application role's dev login and the worker's practice jobs as the worker's
 * own (tp_app's privileges, marked as a job's by tp_job; docs/adr/0061); `pnpm db:migrate --dev-login`
 * creates both, so row-level security binds them in development as in production. Only pg-boss's own
 * tables use DATABASE_URL itself (QUEUE_DATABASE_URL), and platform jobs run only where
 * OPERATOR_DATABASE_URL is set, each transaction as tp_operator.
 */
const compose = spawnSync('docker', ['compose', 'up', '--detach', '--wait'], { cwd: repositoryRoot, stdio: 'inherit' });
if (compose.status !== 0) {
  process.stderr.write(
    `dev: docker compose could not start a healthy Postgres; continuing with DATABASE_URL=${process.env.DATABASE_URL === undefined ? 'the local default' : 'from the environment'}.\n`,
  );
}

const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const apps = [
  // The web app queues intake jobs on pg-boss's login too (QUEUE_DATABASE_URL), as a producer only.
  spawn('pnpm', ['--filter', '@tp/web', 'run', 'dev'], { cwd: repositoryRoot, stdio: 'inherit', env: { ...process.env, DATABASE_URL: appDevLoginUrl(databaseUrl), QUEUE_DATABASE_URL: databaseUrl } }),
  spawn('pnpm', ['--filter', '@tp/worker', 'run', 'dev'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: workerDevLoginUrl(databaseUrl), QUEUE_DATABASE_URL: databaseUrl },
  }),
];
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const app of apps) {
      app.kill(signal);
    }
  });
}
for (const app of apps) {
  app.on('exit', (code) => {
    process.exitCode = Math.max(Number(process.exitCode ?? 0), code ?? 0);
  });
}
