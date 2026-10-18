import { createHash } from 'node:crypto';

/**
 * The approval line of docs/product/domain-model.md and the hash that binds it to the text it approves
 * (CO-02; reconciliation-001, D1). The founder writes a name, one on the reviewed approver list
 * (APPROVERS_LIST), and a date on the line and leaves its document hash as generated, the hash of the
 * text compared with the schema. The hash covers every line but two: the approval line itself (the last
 * line of the document) and the provenance line (the commit and branch the document was generated at).
 * The provenance line is skipped only where the generator writes it, the document's fifth line
 * (PROVENANCE_LINE_INDEX), and only in the shape it writes, with a commit of 7 to 40 hexadecimal digits
 * or "unknown" and a branch that is a git ref name (provenanceProblems), so a pull request that changes
 * no schema keeps the document valid whatever its commit, and any change to the described schema
 * changes the hash, so an approval never carries over to text it did not see. Any other line that
 * starts with either prefix, a provenance line moved anywhere else, and a fifth line with other text in
 * its fields are compared and hashed like every other line.
 */
export const APPROVAL_PREFIX = 'Approved by:';
export const PROVENANCE_PREFIX = '- Generated at commit ';
/** The day Change Order 001 was issued: no approval of this document is dated before it. */
export const EARLIEST_APPROVAL_DATE = '2026-10-16';
/**
 * The reviewed list of who may sign the approval line, from the repository root (readApprovers). It
 * changes only with the founder's approval, in the same pull request as a document the founder signs.
 */
export const APPROVERS_LIST = 'packages/db/domain-model/approvers.json';

/** The provenance line's index: the document's fifth line, below the title and the note under it (renderDocument). */
export const PROVENANCE_LINE_INDEX = 4;

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

/** A commit on the provenance line: an object name of 7 to 40 lower-case hexadecimal digits, or "unknown". */
const COMMIT = '[0-9a-f]{7,40}|unknown';
/** A branch on the provenance line: a git ref name in letters, digits, ".", "_", "/" and "-", with no spaces ("unknown" among them). */
const BRANCH = '[A-Za-z0-9._/-]+';

const PROVENANCE_LINE = new RegExp(`^${escapeRegExp(PROVENANCE_PREFIX)}\`(?:${COMMIT})\` on branch \`${BRANCH}\`(?:${escapeRegExp(UNCOMMITTED)})? ${escapeRegExp(PROVENANCE_NOTE)}$`);
const COMMIT_FIELD = new RegExp(`^(?:${COMMIT})$`);
const BRANCH_FIELD = new RegExp(`^${BRANCH}$`);

/**
 * Why the generator cannot write `provenance` on a line the comparison skips: a commit that is not 7 to
 * 40 lower-case hexadecimal digits, or a branch that is not a git ref name in letters, digits, ".", "_",
 * "/" and "-". An empty field is written "unknown". Empty when it can.
 */
export function provenanceProblems(provenance: Provenance): string[] {
  const problems: string[] = [];
  if (provenance.commit !== '' && !COMMIT_FIELD.test(provenance.commit)) {
    problems.push(`the commit ${JSON.stringify(provenance.commit)} is not 7 to 40 lower-case hexadecimal digits or "unknown"`);
  }
  if (provenance.branch !== '' && !BRANCH_FIELD.test(provenance.branch)) {
    problems.push(`the branch ${JSON.stringify(provenance.branch)} is not a git ref name in letters, digits, ".", "_", "/" and "-"`);
  }
  return problems;
}

/**
 * The two lines the comparison and the hash skip, by index (-1 when absent): the fifth line, when it is
 * a provenance line in the generated shape, and the last line that is not empty, when it starts with the
 * approval prefix.
 */
function skippedLines(lines: readonly string[]): { readonly provenance: number; readonly approval: number } {
  const provenance = PROVENANCE_LINE.test(lines[PROVENANCE_LINE_INDEX] ?? '') ? PROVENANCE_LINE_INDEX : -1;
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

/** The three fields of an approval line in its shape, or null when the line is not in that shape. */
export function approvalFields(line: string | null): { readonly name: string; readonly date: string; readonly sha256: string } | null {
  const m = line === null ? null : APPROVAL_LINE.exec(line);
  return m ? { name: m[1] ?? '', date: m[2] ?? '', sha256: m[3] ?? '' } : null;
}

/** Words that hold a name's place: a name with one of them as a word, in any case, names no one. */
const PLACEHOLDER_WORDS = new Set(['tbd', 'name', 'firstname', 'lastname', 'fullname', 'founder', 'approver', 'claude']);

/** `pattern` standing alone, in any case: not inside a longer word. */
const alone = (pattern: string): RegExp => new RegExp(`(?:^|[^\\p{L}])(?:${pattern})(?:[^\\p{L}]|$)`, 'iu');
const N_A = alone('n\\s*/\\s*a|n[._-]a');
const VERIFY_ONLY = alone('verify[\\s._-]*only');
const DOTTED_TBD = alone('t[._-]?b[._-]?d');

/**
 * A word with "claude" in it, as an agent would sign (ClaudeCode, claudecode, CLAUDE_AI), but not a name
 * that only begins with it, such as Claudette: one capital and lower-case letters, unless what follows is
 * an agent's or a model's suffix.
 */
const claudeIn = (word: string): boolean => /claude/i.test(word) && (!/^\p{Lu}\p{Ll}+$/u.test(word) || /claude(?:code|ai|bot|agent|opus|sonnet|haiku)/i.test(word));

function placeholderIn(name: string): string | null {
  if (/<[^>]*>/.test(name)) return 'text in angle brackets';
  if (N_A.test(name)) return '"N/A"';
  if (VERIFY_ONLY.test(name)) return '"VERIFY ONLY"';
  const words = name.split(/[^\p{L}]+/u).filter((w) => w !== '');
  // Words are split at a lower-case letter followed by a capital too, so "ClaudeCode" and "FirstName" are read as two.
  const word = words.flatMap((w) => w.split(/(?<=\p{Ll})(?=\p{Lu})/u)).find((w) => PLACEHOLDER_WORDS.has(w.toLowerCase()));
  if (word !== undefined) return `"${word}"`;
  if (DOTTED_TBD.test(name)) return '"TBD"';
  const agent = words.find(claudeIn);
  return agent === undefined ? null : `"${agent}"`;
}

/**
 * Why `name` cannot be a person's name, or null: it is blank or underscores, has no letters, or holds a
 * placeholder, in any case: TBD (T.B.D., T-B-D), N/A (N.A.), name, first name, last name, full name,
 * founder, approver, VERIFY ONLY (VERIFY-ONLY, VERIFY_ONLY), Claude (ClaudeCode, claude-code), or any
 * text in angle brackets. Both the approval line and the approver list are held to it.
 */
export function notAName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '' || /^_+$/.test(trimmed)) return 'is blank';
  if (!/\p{L}/u.test(trimmed)) return 'has no letters';
  const placeholder = placeholderIn(trimmed);
  return placeholder === null ? null : `is a placeholder (${placeholder}), not a person`;
}

/** What an approval is checked against besides its text. */
export interface ApprovalCheck {
  /** Who may sign: the names on packages/db/domain-model/approvers.json (readApprovers). */
  readonly approvers: readonly string[];
  /** Today, for the date (UTC); now when absent. */
  readonly now?: Date;
}

const hashMismatch = (approved: string, sha256: string, text: string): string =>
  `the approval line's hash does not match ${text}: the line carries ${approved}; ${text}'s SHA-256 is ${sha256}`;

/**
 * What is wrong with an approval line for the text whose hash is `sha256` (`text` names it in the
 * messages): a person on the approver list, a calendar date from the day Change Order 001 was issued to
 * today (UTC), and that hash. The name must be an entry of the list exactly, letter for letter and in the
 * same case, apart from spaces at either end; an empty list refuses every approval.
 */
export function approvalProblems(line: string | null, sha256: string, check: ApprovalCheck, text = 'this text'): string[] {
  if (line === null) return ['there is no "Approved by:" line'];
  const m = APPROVAL_LINE.exec(line);
  if (!m) return ['the "Approved by:" line is not "Approved by: <name>  Date: <YYYY-MM-DD>  Document SHA-256: `<hash>`"'];
  const [, name = '', date = '', approved = ''] = m;
  const problems: string[] = [];
  const reason = notAName(name);
  if (reason === 'is blank') problems.push('the approval names no person');
  else if (reason !== null) problems.push(`the approval's name ${reason}`);
  if (check.approvers.length === 0) {
    problems.push(`no approver is listed in ${APPROVERS_LIST}`);
  } else if (reason === null && !check.approvers.includes(name.trim())) {
    problems.push(`the approval's name is not on the approver list in ${APPROVERS_LIST} (exactly, in the same case, apart from spaces at either end)`);
  }
  const today = (check.now ?? new Date()).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    problems.push('the approval date is not a date (YYYY-MM-DD)');
  } else if (date < EARLIEST_APPROVAL_DATE) {
    problems.push(`the approval date ${date} is before Change Order 001 was issued (${EARLIEST_APPROVAL_DATE})`);
  } else if (date > today) {
    problems.push(`the approval date ${date} is later than today (${today}, UTC)`);
  }
  if (approved !== sha256) problems.push(hashMismatch(approved, sha256, text));
  return problems;
}

/**
 * What is wrong with the approval of a whole document, `text`, against the text regenerated from the
 * schema, whose hash is `sha256`: it has exactly one "Approved by:" line, its last line, and that line is
 * a valid approval (approvalProblems) of both the regenerated text and the document's own text, so an
 * edit to the committed text fails here even before it is compared with the schema.
 */
export function documentApprovalProblems(text: string, sha256: string, check: ApprovalCheck): string[] {
  const count = text.split('\n').filter((line) => line.startsWith(APPROVAL_PREFIX)).length;
  const problems = count > 1 ? [`the document has ${String(count)} "Approved by:" lines; only its last line is the approval`] : [];
  const line = approvalLineOf(text);
  const own = documentSha256(text);
  if (own === sha256) return [...problems, ...approvalProblems(line, sha256, check)];
  const approved = line === null ? undefined : APPROVAL_LINE.exec(line)?.[3];
  return [
    ...problems,
    ...approvalProblems(line, sha256, check, 'the regenerated text'),
    ...(approved === undefined || approved === own ? [] : [hashMismatch(approved, own, 'the committed text')]),
  ];
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
export function documentToWrite(previous: string | null, generated: string, check: ApprovalCheck): string {
  if (previous === null) return generated;
  const line = approvalLineOf(previous);
  const awaiting = approvalLineOf(generated);
  if (awaiting !== null && line !== null && comparableText(previous) === comparableText(generated) && documentApprovalProblems(previous, documentSha256(generated), check).length === 0) {
    return generated.replace(awaiting, () => line);
  }
  return generated;
}
