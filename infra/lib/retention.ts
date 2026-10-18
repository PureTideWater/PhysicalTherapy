/**
 * Retention and rotation periods the stacks apply. Each value is the plan's, named where it is set.
 */

/** RDS point-in-time recovery and daily snapshots, and noncurrent S3 versions (PRD 16 and 19: backups 35 days). */
export const BACKUP_RETENTION_DAYS = 35;

/** Packets and audit copies are kept seven years, write-once (PRD 19, data lifecycle). */
export const RECORD_RETENTION_YEARS = 7;

/** The customer-managed key rotates yearly (PRD 16, encryption; PRD 19, the year). */
export const KEY_ROTATION_DAYS = 365;

/** Database passwords in Secrets Manager rotate monthly. */
export const SECRET_ROTATION_DAYS = 30;

/** Characters left out of generated database passwords so they can sit in a connection URL. */
export const PASSWORD_EXCLUDED_CHARACTERS = " %+~`#$&*()|[]{}:;<>?!'/@\"\\";
