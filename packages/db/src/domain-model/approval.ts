import { createHash } from 'node:crypto';

/**
 * The approval line of docs/product/domain-model.md and the hash that binds it to the text it approves
 * (CO-02; reconciliation-001, D1). The founder writes a name and a date on the line and leaves its
 * document hash as generated. The hash covers every line but two: the approval line itself (the last
 * line of the document) and the provenance line (the commit and branch the document was generated at:
 * the first line that starts with its prefix, in the shape the generator writes), so a pull request
 * that changes no schema keeps the document valid whatever its commit, and any change to the described
 * schema changes the hash, so an approval never carries over to text it did not see. Any other line
 * that starts with either prefix is compared and hashed like every other line.
 */
export const APPROVAL_PREFIX = 'Approved by:';
export const PROVENANCE_PREFIX = '- Generated at commit ';
/** The day Change Order 001 was issued: no approval of this document is dated before it. */
export const EARLIEST_APPROVAL_DATE = '2026-10-16';

const UNCOMMITTED = ', with uncommitted changes to its inputs';
const PROVENANCE_NOTE = '(provenance only: `--check` ignores this line, so a commit that changes no schema keeps the document valid)';

export interface Provenance {
  readonly commit: string;
  readonly branch: string;
  /** The generator's inputs (packages/db, the Data dictionary) differed from the commit. */
  readonly uncommitted?: boolean;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const noTicks = (s: string): string => s.replace(/`/g, "'");

/** The provenance line as the generator writes it. */
export function provenanceLine(provenance: Provenance): string {
  return `${PROVENANCE_PREFIX}\`${noTicks(provenance.commit) || 'unknown'}\` on branch \`${noTicks(provenance.branch) || 'unknown'}\`${provenance.uncommitted ? UNCOMMITTED : ''} ${PROVENANCE_NOTE}`;
}

const PROVENANCE_LINE = new RegExp(`^${escapeRegExp(PROVENANCE_PREFIX)}\`[^\`]*\` on branch \`[^\`]*\`(?:${escapeRegExp(UNCOMMITTED)})? ${escapeRegExp(PROVENANCE_NOTE)}$`);

/**
 * The two lines the comparison and the hash skip, by index (-1 when absent): the first line that starts
 * with the provenance prefix, when it has the generated shape, and the last line that is not empty, when
 * it starts with the approval prefix.
 */
function skippedLines(lines: readonly string[]): { readonly provenance: number; readonly approval: number } {
  const first = lines.findIndex((line) => line.startsWith(PROVENANCE_PREFIX));
  const provenance = first !== -1 && PROVENANCE_LINE.test(lines[first] ?? '') ? first : -1;
  let last = lines.length - 1;
  while (last >= 0 && lines[last] === '') last--;
  const approval = last >= 0 && (lines[last] ?? '').startsWith(APPROVAL_PREFIX) ? last : -1;
  return { provenance, approval };
}

/** What `--check` compares and the hash covers: every line but the provenance line and the approval line. */
export function comparableText(text: string): string {
  const lines = text.split('\n');
  const { provenance, approval } = skippedLines(lines);
  return lines.filter((_, i) => i !== provenance && i !== approval).join('\n');
}

/** The document SHA-256 an approval line must carry: the hash of the comparable text. */
export function documentSha256(text: string): string {
  return createHash('sha256').update(comparableText(text)).digest('hex');
}

/** The line as generated, awaiting a name and a date. */
export function awaitingApprovalLine(sha256: string): string {
  return `${APPROVAL_PREFIX} ________  Date: ________  Document SHA-256: \`${sha256}\``;
}

/** The document's approval line: its last line that is not empty, when that starts with "Approved by:"; otherwise null. */
export function approvalLineOf(text: string): string | null {
  const lines = text.split('\n');
  const { approval } = skippedLines(lines);
  return approval === -1 ? null : (lines[approval] ?? null);
}

const APPROVAL_LINE = /^Approved by: (.+?) {2}Date: (\S+) {2}Document SHA-256: `([0-9a-f]{64})`$/;

/**
 * What is wrong with an approval line for the text whose hash is `sha256`: a person, a calendar date from
 * the day Change Order 001 was issued to today (UTC), and that hash.
 */
export function approvalProblems(line: string | null, sha256: string, now: Date = new Date()): string[] {
  if (line === null) return ['there is no "Approved by:" line'];
  const m = APPROVAL_LINE.exec(line);
  if (!m) return ['the "Approved by:" line is not "Approved by: <name>  Date: <YYYY-MM-DD>  Document SHA-256: `<hash>`"'];
  const [, name = '', date = '', approved = ''] = m;
  const problems: string[] = [];
  if (/^_+$/.test(name.trim()) || name.trim() === '') problems.push('the approval names no person');
  const today = now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    problems.push('the approval date is not a date (YYYY-MM-DD)');
  } else if (date < EARLIEST_APPROVAL_DATE) {
    problems.push(`the approval date ${date} is before Change Order 001 was issued (${EARLIEST_APPROVAL_DATE})`);
  } else if (date > today) {
    problems.push(`the approval date ${date} is later than today (${today}, UTC)`);
  }
  if (approved !== sha256) {
    problems.push(`the approval is for document ${approved.slice(0, 12)}, not this one (${sha256.slice(0, 12)}): the document changed after it was approved`);
  }
  return problems;
}

/**
 * What is wrong with the approval of a whole document whose comparable text hashes to `sha256`: it has
 * exactly one "Approved by:" line, its last line, and that line is a valid approval (approvalProblems).
 */
export function documentApprovalProblems(text: string, sha256: string, now: Date = new Date()): string[] {
  const count = text.split('\n').filter((line) => line.startsWith(APPROVAL_PREFIX)).length;
  const problems = count > 1 ? [`the document has ${String(count)} "Approved by:" lines; only its last line is the approval`] : [];
  return [...problems, ...approvalProblems(approvalLineOf(text), sha256, now)];
}

/** The first line where two documents differ, ignoring the approval and provenance lines; null when they agree. */
export function firstDifference(existing: string, generated: string): { readonly line: number; readonly existing: string; readonly generated: string } | null {
  const a = comparableText(existing).split('\n');
  const b = comparableText(generated).split('\n');
  let i = 0;
  while (i < Math.max(a.length, b.length) && a[i] === b[i]) i++;
  if (i === Math.max(a.length, b.length)) return null;
  return { line: i + 1, existing: a[i] ?? '(end of file)', generated: b[i] ?? '(end of file)' };
}

/**
 * What `--out` writes over `previous`: the generated text, keeping the previous approval line when the
 * text is identical and that line is a valid approval of it. Any change leaves the line awaiting.
 */
export function documentToWrite(previous: string | null, generated: string, now: Date = new Date()): string {
  if (previous === null) return generated;
  const line = approvalLineOf(previous);
  const awaiting = approvalLineOf(generated);
  if (awaiting !== null && line !== null && comparableText(previous) === comparableText(generated) && documentApprovalProblems(previous, documentSha256(generated), now).length === 0) {
    return generated.replace(awaiting, () => line);
  }
  return generated;
}
