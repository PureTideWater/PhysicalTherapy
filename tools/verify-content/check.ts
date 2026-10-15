import { listFiles } from '../content-files';

export interface CheckResult {
  readonly ok: boolean;
  readonly message: string;
}

/** The directories whose records the checker reads (PRD section 9, the release pipeline). */
export const CONTENT_DIRECTORIES = ['content/drafts', 'content/outgoing'];

/** Placeholder checker: passes with nothing to check, and refuses content it cannot check yet. */
export function checkContent(root: string): CheckResult {
  const records = CONTENT_DIRECTORIES.flatMap((dir) => listFiles(root, dir));
  if (records.length === 0) {
    return { ok: true, message: 'verify-content: no rule records in content/drafts or content/outgoing yet; nothing to check.' };
  }
  return {
    ok: false,
    message: `verify-content: ${String(records.length)} content file(s) found but the rule-record checker is not implemented yet (milestone 0 part B); refusing to pass them unchecked.`,
  };
}
