/**
 * The code a run's failure in its thread is logged by: SCREENING_RUN_FAILED, with the error's own code when it has one
 * shaped like a code (PostgreSQL's SQLSTATE, such as 57014 for a cancelled statement, or Node's, such as ECONNRESET),
 * never its text, which can carry SQL or an address.
 */
export function screeningRunFailureCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
  return /^[A-Z0-9_]{1,32}$/.test(code) ? `SCREENING_RUN_FAILED_${code}` : 'SCREENING_RUN_FAILED';
}
