/**
 * How a task's connection URLs are built (docs/adr/0049). The applications read whole PostgreSQL URLs
 * (DATABASE_URL, QUEUE_DATABASE_URL, OPERATOR_DATABASE_URL), but ECS injects a secret's fields one by
 * one, and an alternating-users rotation changes the username as well as the password. So each task
 * gets `<VARIABLE>_USERNAME` and `<VARIABLE>_PASSWORD` from the login's secret, the database host,
 * port and name as plain settings, and its command is a short POSIX shell script that joins them,
 * drops the parts and execs the application. Generated passwords leave out every character that
 * would need escaping in a URL (infra/lib/retention.ts PASSWORD_EXCLUDED_CHARACTERS), and the script
 * expands each value inside double quotes, so no value is ever read as shell syntax.
 *
 * Every URL verifies the server's certificate (`sslmode=verify-full`) against the RDS certificate
 * bundle the images carry (RDS_CA_BUNDLE_PATH, given to Node as NODE_EXTRA_CA_CERTS).
 */

/** Where the images keep Amazon RDS's certificate bundle (apps/web/Dockerfile, apps/worker/Dockerfile). */
export const RDS_CA_BUNDLE_PATH = '/etc/ssl/certs/rds-global-bundle.pem';

/** The plain settings every task that connects to the database gets. */
export const DATABASE_SETTINGS = { host: 'DATABASE_HOST', port: 'DATABASE_PORT', name: 'DATABASE_NAME' } as const;

export interface ConnectionUrl {
  /** The variable the application reads, e.g. DATABASE_URL. */
  readonly variable: 'DATABASE_URL' | 'QUEUE_DATABASE_URL' | 'OPERATOR_DATABASE_URL';
  /** A role every session of this login sets at sign-in (PostgreSQL's `role` connection option). */
  readonly role?: string;
}

/** The secret fields a connection URL is built from: `<variable>_USERNAME` and `<variable>_PASSWORD`. */
export function secretVariables(url: ConnectionUrl): { readonly username: string; readonly password: string } {
  return { username: `${url.variable}_USERNAME`, password: `${url.variable}_PASSWORD` };
}

const WORD = /^[A-Za-z0-9_./=-]+$/;
const ROLE = /^[a-z_][a-z0-9_]*$/;

/**
 * The script a container runs (`/bin/sh -c <script>`): builds each URL, runs each of `before` in
 * turn (`set -e` stops at the first that fails), then replaces the shell with `command`. `set -u`
 * stops the task, naming the variable and never a value, if a part is missing.
 */
export function launchScript(urls: readonly ConnectionUrl[], command: readonly string[], before: readonly (readonly string[])[] = []): string {
  for (const words of [...before, command]) {
    if (words.length === 0 || words.some((word) => !WORD.test(word))) {
      throw new Error('the command is plain words: letters, digits and _./=-');
    }
  }
  const lines = ['set -eu'];
  for (const url of urls) {
    if (url.role !== undefined && !ROLE.test(url.role)) {
      throw new Error(`${url.role} is not a role name`);
    }
    const { username, password } = secretVariables(url);
    const options = url.role === undefined ? '' : `&options=-c%20role%3D${url.role}`;
    // `$NAME` rather than `${NAME}`: each name ends at a ':', '@', '/' or '?', and CloudFormation
    // would read `${...}` in a template string as its own substitution syntax.
    lines.push(
      `${url.variable}="postgres://$${username}:$${password}@$${DATABASE_SETTINGS.host}:$${DATABASE_SETTINGS.port}/$${DATABASE_SETTINGS.name}?sslmode=verify-full${options}"`,
      `export ${url.variable}`,
      `unset ${username} ${password}`,
    );
  }
  for (const words of before) {
    lines.push(words.join(' '));
  }
  lines.push(`exec ${command.join(' ')}`);
  return lines.join('\n');
}
