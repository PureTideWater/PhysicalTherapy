/** Every log group the stack creates, by the service that writes it (PRD 15, Observability). */
export const LOG_GROUPS = ['web', 'worker', 'platform', 'screening', 'migration', 'migration-runner', 'network-lookup'] as const;
export type LogGroupName = (typeof LOG_GROUPS)[number];

/** `/tp/<environment>/<name>`: the environment key admits CloudWatch Logs for these names only. */
export function logGroupName(environment: string, name: LogGroupName): string {
  return `/tp/${environment}/${name}`;
}

/** Application logs are kept a year: structured, allowlisted fields and IDs only (PRD 16, logging discipline). */
export const LOG_RETENTION_DAYS = 365;
