import { createHash } from 'node:crypto';

/**
 * The approval line of docs/product/domain-model.md and the hash that binds it to the text it approves
 * (CO-02; reconciliation-001, D1). The founder writes a name and a date on the line and leaves its
 * document hash as generated. The hash covers every line but two: the approval line itself and the
 * provenance line (the commit and branch the document was generated at), so a pull request that
 * changes no schema keeps the document valid whatever its commit, and any change to the described
 * schema changes the hash, so an approval never carries over to text it did not see.
 */
export const APPROVAL_PREFIX = 'Approved by:';
export const PROVENANCE_PREFIX = '- Generated at commit ';

/** What `--check` compares and the hash covers: every line but the approval and provenance lines. */
export function comparableText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith(APPROVAL_PREFIX) && !line.startsWith(PROVENANCE_PREFIX))
    .join('\n');
}

/** The document SHA-256 an approval line must carry: the hash of the comparable text. */
export function documentSha256(text: string): string {
  return createHash('sha256').update(comparableText(text)).digest('hex');
}

/** The line as generated, awaiting a name and a date. */
export function awaitingApprovalLine(sha256: string): string {
  return `${APPROVAL_PREFIX} ________  Date: ________  Document SHA-256: \`${sha256}\``;
}

/** The document's approval line, or null when it has none. */
export function approvalLineOf(text: string): string | null {
  return text.split('\n').find((line) => line.startsWith(APPROVAL_PREFIX)) ?? null;
}

const APPROVAL_LINE = /^Approved by: (.+?) {2}Date: (\S+) {2}Document SHA-256: `([0-9a-f]{64})`$/;

/** What is wrong with an approval line for the text whose hash is `sha256`: a person, a real date and that hash. */
export function approvalProblems(line: string | null, sha256: string): string[] {
  if (line === null) return ['there is no "Approved by:" line'];
  const m = APPROVAL_LINE.exec(line);
  if (!m) return ['the "Approved by:" line is not "Approved by: <name>  Date: <YYYY-MM-DD>  Document SHA-256: `<hash>`"'];
  const [, name = '', date = '', approved = ''] = m;
  const problems: string[] = [];
  if (/^_+$/.test(name.trim()) || name.trim() === '') problems.push('the approval names no person');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    problems.push('the approval date is not a date (YYYY-MM-DD)');
  }
  if (approved !== sha256) {
    problems.push(`the approval is for document ${approved.slice(0, 12)}, not this one (${sha256.slice(0, 12)}): the document changed after it was approved`);
  }
  return problems;
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
export function documentToWrite(previous: string | null, generated: string): string {
  if (previous === null) return generated;
  const line = approvalLineOf(previous);
  const awaiting = approvalLineOf(generated);
  if (awaiting !== null && line !== null && comparableText(previous) === comparableText(generated) && approvalProblems(line, documentSha256(generated)).length === 0) {
    return generated.replace(awaiting, () => line);
  }
  return generated;
}
