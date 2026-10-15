/**
 * The three environments of PRD section 15. `dev` is local Docker Postgres and MinIO with
 * synthetic data only; its stack exists so shared constructs can be synthesized and tested the
 * same way as the others. `staging` is a full AWS copy with synthetic data; `production` holds PHI.
 */
export const ENVIRONMENTS = ['dev', 'staging', 'production'] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

/** CloudFormation stack name per environment. */
export function stackName(environment: EnvironmentName): string {
  return `tp-${environment}`;
}
