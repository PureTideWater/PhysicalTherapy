/** The connection string for the platform database, from DATABASE_URL. */
export function readDatabaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL is not set; pnpm dev starts a local Postgres (see docker-compose.yml)');
  }
  return url;
}
