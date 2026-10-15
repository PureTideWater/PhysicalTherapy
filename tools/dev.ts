import { spawn, spawnSync } from 'node:child_process';

import { repositoryRoot } from './content-files';

/** The local Postgres from docker-compose.yml. Synthetic data only, ever. */
const LOCAL_DATABASE_URL = 'postgres://postgres:test@localhost:5432/postgres';

/**
 * `pnpm dev`: starts Postgres 18 and MinIO with Docker Compose, then the web app and the worker.
 * Without Docker it says so and starts the apps anyway against whatever DATABASE_URL points at.
 */
const compose = spawnSync('docker', ['compose', 'up', '--detach', '--wait'], { cwd: repositoryRoot, stdio: 'inherit' });
if (compose.status !== 0) {
  process.stderr.write(
    `dev: docker compose could not start Postgres and MinIO; continuing with DATABASE_URL=${process.env.DATABASE_URL === undefined ? 'the local default' : 'from the environment'}.\n`,
  );
}

const apps = spawn('pnpm', ['--parallel', '--filter', '@tp/web', '--filter', '@tp/worker', 'run', 'dev'], {
  cwd: repositoryRoot,
  stdio: 'inherit',
  env: { DATABASE_URL: LOCAL_DATABASE_URL, ...process.env },
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => apps.kill(signal));
}
apps.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
