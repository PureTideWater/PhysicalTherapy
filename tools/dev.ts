import { spawn, spawnSync } from 'node:child_process';

import { appDevLoginUrl } from '@tp/db';

import { repositoryRoot } from './content-files';

/** The local Postgres from docker-compose.yml. Synthetic data only, ever. */
const LOCAL_DATABASE_URL = 'postgres://postgres:test@localhost:5432/postgres';

/**
 * `pnpm dev`: starts Postgres 18 and MinIO with Docker Compose, then the web app and the worker.
 * Without Docker it says so and starts the apps anyway against whatever DATABASE_URL points at. The
 * web app and the worker's practice jobs connect as the application role's dev login (`pnpm
 * db:migrate --dev-login` creates it), so row-level security binds them in development as in
 * production; only pg-boss's own tables use DATABASE_URL itself (QUEUE_DATABASE_URL), and platform
 * jobs run only where OPERATOR_DATABASE_URL is set, each transaction as tp_operator.
 */
const compose = spawnSync('docker', ['compose', 'up', '--detach', '--wait'], { cwd: repositoryRoot, stdio: 'inherit' });
if (compose.status !== 0) {
  process.stderr.write(
    `dev: docker compose could not start Postgres and MinIO; continuing with DATABASE_URL=${process.env.DATABASE_URL === undefined ? 'the local default' : 'from the environment'}.\n`,
  );
}

const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const apps = [
  // The web app queues intake jobs on pg-boss's login too (QUEUE_DATABASE_URL), as a producer only.
  spawn('pnpm', ['--filter', '@tp/web', 'run', 'dev'], { cwd: repositoryRoot, stdio: 'inherit', env: { ...process.env, DATABASE_URL: appDevLoginUrl(databaseUrl), QUEUE_DATABASE_URL: databaseUrl } }),
  spawn('pnpm', ['--filter', '@tp/worker', 'run', 'dev'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: appDevLoginUrl(databaseUrl), QUEUE_DATABASE_URL: databaseUrl },
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
