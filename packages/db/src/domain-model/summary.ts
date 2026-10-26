import { type ApprovalCheck, approvalFields, approvalLineOf, approvalProblems, comparableText, documentSha256 } from './approval';
import { cOrder } from './functions';
import { unifiedDiffs } from './history';
import { fenceFor } from './render';

/**
 * "Changes since the last approved document" (docs/adr/0063): what a regenerated
 * docs/product/domain-model.md says differently from the document the founder last approved, one line per
 * change, the security of the schema first. It compares the two documents, the text the founder signs,
 * not two schemas: each line of the comparable text (approval.ts: every line but the provenance and
 * approval lines) is read as a fact of one category, keyed by what it describes (a table, a policy, a
 * column, a divergence row by its table, field and kind rather than its number), so a row renumbered by
 * an insertion above it is not a change. A line the document repeats from another (the areas' table
 * lists, the counts in the summary tables, Appendix A and B) is folded into the line that holds it. Any
 * other line no rule reads is kept as itself under "Other lines", so no line that changes the document's
 * hash goes unreported; and when the texts differ only in folded lines, the summary says so rather than
 * "no change".
 */
export const SUMMARY_CATEGORIES = [
  ['rls', 'Row-level security'],
  ['policies', 'Policies and rewrite rules'],
  ['phi', 'PHI registry'],
  ['grants', 'Grants and roles'],
  ['tables', 'Tables and views'],
  ['columns', 'Columns'],
  ['constraints', 'Constraints and indexes'],
  ['functions', 'Functions'],
  ['triggers', 'Triggers'],
  ['divergences', 'Divergence rows'],
  ['migrations', 'Migrations'],
  ['cross-checks', 'Cross-checks'],
  ['other', 'Other lines'],
] as const;

export type SummaryCategory = (typeof SUMMARY_CATEGORIES)[number][0];

/** The categories whose values the summary never shortens: what decides who reads which rows. */
const SECURITY: ReadonlySet<SummaryCategory> = new Set(['rls', 'policies', 'phi', 'grants']);
/** And the divergence rows, which the founder approves row by row: an added or removed one is shown whole. */
const WHOLE: ReadonlySet<SummaryCategory> = new Set([...SECURITY, 'divergences']);

/** One thing the document says, as the summary compares it. */
export interface DocumentFact {
  readonly category: SummaryCategory;
  /** What the fact describes, unique within its category: two documents' facts are matched by it. */
  readonly key: string;
  /** How the summary names it. */
  readonly label: string;
  /** What the document says of it, Markdown formatting taken out. */
  readonly value: string;
}

export interface DocumentChange {
  readonly category: SummaryCategory;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** The facts of a document, and how many of its comparable lines were folded into others. */
export interface DocumentReading {
  readonly facts: readonly DocumentFact[];
  /** Lines the document repeats from another line (the areas' table lists, Appendix A and B, the counts). */
  readonly folded: readonly string[];
  /** A code block opened and never closed: its lines are kept, under "Other lines", but the reading is unreliable. */
  readonly unclosedFence: boolean;
}

/** A cell or a line as plain text: links to their text, code marks and escapes taken out, line breaks as commas. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\(#[^)]*\)/g, '$1')
    .replace(/<br>/g, ', ')
    .replace(/`/g, '')
    .replace(/\\\|/g, '|')
    .trim();
}

/** The cells of a Markdown table row, split at the pipes the renderer does not escape. */
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map(plain);
}

/** The cells of a row with exactly `n` of them, or null: a row in another shape is not read as one. */
function rowOf(line: string, n: number): string[] | null {
  const row = cells(line);
  return row.length === n ? row : null;
}

const isRow = (line: string): boolean => line.startsWith('|') && line.trimEnd().endsWith('|');
const isSeparator = (line: string): boolean => /^\|(?:\s*-{3,}\s*\|)+$/.test(line.trim());

/** The summary lines at the top of the document, by their prefix: category, key and label. */
const HEADER_LINES: readonly (readonly [string, SummaryCategory, string])[] = [
  ['- Migrations applied:', 'migrations', 'migrations applied (totals)'],
  ['- PostgreSQL ', 'tables', 'tables and views (totals)'],
  ['- PHI flag:', 'phi', 'PHI flag (totals)'],
  ['- RLS:', 'rls', 'row-level security (totals)'],
  ['- Functions in ', 'functions', 'functions, triggers and rewrite rules (totals)'],
  ['- Default privileges', 'grants', 'default privileges'],
  ['- Roles ', 'grants', 'group roles and owner'],
  ['- Other schemas:', 'tables', 'other schemas'],
  ['- Divergences from the Data dictionary:', 'divergences', 'divergences (totals)'],
];

const AFTER_COLON = (line: string): string => plain(line.slice(line.indexOf(':') + 1));

/** The sentences under the PHI table, each its own fact. */
const REGISTRY_CHECKS =
  /^(Registered tables whose registered policy does not qualify: .*?\.) (Tenant tables with practice_id NOT NULL outside the registry: .*?\.) (Tables with RLS enabled but not forced: .*\.)$/;

type Block = 'none' | 'head' | 'columns' | 'keys' | 'indexes' | 'policies' | 'rules' | 'checks' | 'triggers' | 'idle';

/** A table section's sub-list headers, each opening the block its lines belong to. */
const BLOCK_HEADERS: readonly (readonly [RegExp, Block])[] = [
  [/^\| # \| Column \| Type \| Null \| Default \| References \| Since \| Notes \|$/, 'columns'],
  [/^Keys:$/, 'keys'],
  [/^Indexes:$/, 'indexes'],
  [/^Policies \(\d+\):$/, 'policies'],
  [/^Rewrite rules \(\d+\):$/, 'rules'],
  [/^Invariants enforced by constraints:$/, 'checks'],
  [/^Invariants enforced by triggers:$/, 'triggers'],
  [/^Triggers that do not fire in an ordinary session \(not enforced\):$/, 'idle'],
];

/** Reads a document into facts (see the module comment). */
export function readDocument(text: string): DocumentReading {
  const facts: { category: SummaryCategory; key: string; label: string; value: string }[] = [];
  const folded: string[] = [];
  const seen = new Map<string, number>();
  const add = (category: SummaryCategory, key: string, label: string, value: string): void => {
    const id = `${category}\u0000${key}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    facts.push({ category, key: n === 1 ? key : `${key}#${String(n)}`, label: n === 1 ? label : `${label} (${String(n)})`, value });
  };
  /** Appends a sub-line (a policy's USING, a trigger's message) to the fact before it. */
  const append = (part: string): boolean => {
    const last = facts[facts.length - 1];
    if (last === undefined) return false;
    last.value = `${last.value}; ${part}`;
    return true;
  };
  const other = (where: string, line: string, category: SummaryCategory = 'other'): void => {
    add(category, `${where}\u0000${line}`, where === '' ? 'the document' : where, plain(line));
  };

  let section = '';
  let table: string | null = null;
  let block: Block = 'none';
  let divergence = '';
  /** An open code block: its fence (CommonMark: three or more backticks; it closes only at a fence as long or longer). */
  let fence: { readonly marker: number; readonly kind: string; readonly lines: string[] } | null = null;
  let multiLine: Block | null = null;
  /** The PHI table's columns, read from its header (one per role with a privilege). */
  let phiColumns = 0;

  for (const line of comparableText(text).split('\n')) {
    if (fence !== null) {
      const closing = /^(`{3,})[ \t]*$/.exec(line);
      if (closing === null || (closing[1] ?? '').length < fence.marker) {
        fence.lines.push(line);
        continue;
      }
      closeFence(fence);
      fence = null;
      continue;
    }
    const opening = /^(`{3,})([^`]*)$/.exec(line);
    if (opening !== null) {
      fence = { marker: (opening[1] ?? '').length, kind: (opening[2] ?? '').trim(), lines: [] };
      continue;
    }
    if (line.trim() === '') {
      multiLine = null;
      continue;
    }
    if (line.startsWith('## ')) {
      section = line.slice(3);
      table = null;
      block = 'none';
      divergence = '';
      multiLine = null;
      // An area's heading repeats the Areas table's title and number.
      if (/^\d+\. /.test(section)) folded.push(line);
      else other('', line);
      continue;
    }

    if (section === 'Contents') {
      // The list of sections, numbered by the areas the Areas table holds.
      folded.push(line);
      continue;
    }
    if (section === '') {
      const header = HEADER_LINES.find(([prefix]) => line.startsWith(prefix));
      if (header) add(header[1], `totals:${header[0]}`, header[2], plain(line.slice(2)));
      else other(section, line);
      continue;
    }

    const areaRow = section === 'Areas' && isRow(line) && !isSeparator(line) && !line.startsWith('| # |') ? rowOf(line, 6) : null;
    if (areaRow !== null) {
      const [, title = '', dictionary = '', , , about = ''] = areaRow;
      const id = /\(#area-([^)]+)\)/.exec(line)?.[1] ?? title;
      add('tables', `area:${id}`, `area ${title}`, `${title}; Data dictionary section: ${dictionary}; ${about}`);
      continue;
    }

    if (section === 'PHI flag and row-level security by table') {
      const phiRow = isRow(line) && !isSeparator(line) && !line.startsWith('| Table | Area |') ? rowOf(line, phiColumns) : null;
      if (line.startsWith('| Table | Area |')) {
        phiColumns = cells(line).length;
        add('grants', 'roles with table privileges', 'roles with table privileges', cells(line).slice(8).join(', '));
      } else if (phiRow !== null) {
        // Its class, practice_id, RLS, counts and privileges repeat the table's own section; its area is only here.
        const [name = '', area = ''] = phiRow;
        add('tables', `area-of:${name}`, `${name} area`, area);
      } else if (isSeparator(line)) {
        folded.push(line);
      } else {
        const m = REGISTRY_CHECKS.exec(line);
        if (m) {
          add('phi', 'registry: policy does not qualify', 'registered tables whose policy does not qualify', AFTER_COLON(m[1] ?? ''));
          add('phi', 'registry: tenant tables outside it', 'tenant tables outside the registry', AFTER_COLON(m[2] ?? ''));
          add('rls', 'rls: enabled but not forced', 'tables with RLS enabled but not forced', AFTER_COLON(m[3] ?? ''));
        } else {
          other(section, line);
        }
      }
      continue;
    }

    if (/^\d+\. /.test(section)) {
      const heading = /^### (Table|View) `([^`]+)`$/.exec(line);
      if (heading) {
        table = heading[2] ?? '';
        block = 'head';
        multiLine = null;
        const kind = heading[1] === 'View' ? 'view' : 'table';
        add('tables', `${kind}:${table}`, `${kind} ${table}`, '');
        continue;
      }
      if (table === null) {
        // Before the first table: the area's anchor and about (the Areas table's) and its table list (each table's own section).
        folded.push(line);
        continue;
      }
      readTableLine(table, line);
      continue;
    }

    if (section === 'Divergences from the Data dictionary') {
      readDivergenceLine(line);
      continue;
    }

    if (section === 'Appendix A: enumerations') {
      const type = /^- `([^`]+)`: (.*)$/.exec(line);
      if (type) add('constraints', `enum-type:${type[1] ?? ''}`, `enum type ${type[1] ?? ''}`, plain(type[2] ?? ''));
      // Each column's closed list repeats its own row's notes and CHECK.
      else if (isRow(line) && !line.startsWith('| Table.column |') && !isSeparator(line)) folded.push(line);
      else other(section, line);
      continue;
    }
    if (section === 'Appendix B: encrypted columns') {
      if (isRow(line) && line.startsWith('| [`')) folded.push(line);
      else other(section, line);
      continue;
    }
    const functionRow = section === 'Appendix C: functions' && isRow(line) && line.startsWith('| `') ? rowOf(line, 9) : null;
    if (functionRow !== null) {
      const [signature = '', returns = '', language = '', security = '', volatility = '', config = '', execute = '', sets = '', body = ''] = functionRow;
      add(
        'functions',
        `function:${signature}`,
        signature,
        [`returns ${returns}`, language, security === 'DEFINER' ? 'SECURITY DEFINER' : 'security invoker', volatility, config ? `config ${config}` : '', sets ? 'sets app.practice_ids' : '', `body ${body}`]
          .filter((part) => part !== '')
          .join('; '),
      );
      add('grants', `execute:${signature}`, `EXECUTE on ${signature}`, execute === '' ? 'granted to no group role' : `granted to ${execute}`);
      continue;
    }
    const migrationRow = section === 'Appendix D: migrations' && isRow(line) && /^\| \d+ \| `/.test(line) ? rowOf(line, 4) : null;
    if (migrationRow !== null) {
      const [, file = '', adrs = '', checksum = ''] = migrationRow;
      add('migrations', `migration:${file}`, file, `ADRs ${adrs}; SHA-256 ${checksum}`);
      continue;
    }
    other(section, line);
  }
  // A block never closed: its lines are still facts, so nothing it holds goes unreported, and the reading says so.
  const unclosedFence = fence !== null;
  if (fence !== null) for (const inner of fence.lines) other(section, inner);

  return { facts, folded, unclosedFence };

  function closeFence(block: { readonly kind: string; readonly lines: readonly string[] }): void {
    if (block.kind === 'sql' && table !== null) add('tables', `view-definition:${table}`, `${table} view definition`, block.lines.join('\n'));
    else {
      const category = section === 'Cross-checks' ? 'cross-checks' : 'other';
      // The block's info string is its opening line's own fact, so a change to it is reported; the fence's length is
      // not (a fence only has to be longer than any backtick run inside the block).
      other(section, `\`\`\`${block.kind}`, category);
      for (const inner of block.lines) other(section, inner, category);
    }
  }

  function readTableLine(name: string, line: string): void {
    const header = BLOCK_HEADERS.find(([pattern]) => pattern.test(line));
    if (header) {
      block = header[1];
      multiLine = null;
      return;
    }
    if (line.startsWith('<a id="table-') || isSeparator(line) || line === '- none') {
      folded.push(line);
      return;
    }
    if (line.startsWith('  - ') && multiLine !== null && append(plain(line.slice(4)))) return;
    multiLine = null;
    if (block === 'head') {
      if (line.startsWith('- Class: ')) return add('phi', `class:${name}`, `${name} class`, plain(line.slice(9)));
      if (line.startsWith('- Row-level security: ')) {
        return add('rls', `rls:${name}`, `${name} row-level security`, plain(line.slice(22)).replace(/; \d+ polic(?:y|ies)/, ''));
      }
      if (line.startsWith('- Dictionary: ')) return add('tables', `dictionary:${name}`, `${name} Data dictionary entry`, plain(line.slice(14)));
      if (line.startsWith('- Created by ')) return add('tables', `created-by:${name}`, `${name} created by`, plain(line.slice(13)));
      if (line.startsWith('- Privileges: ')) return add('grants', `privileges:${name}`, `${name} privileges`, plain(line.slice(14)));
      if (line.startsWith('- Primary key: ')) {
        // The Keys list's "Primary" line holds it.
        folded.push(line);
        return;
      }
      const grant = /^- Column grant: `([^`]+)` (\S+) \((.*)\)$/.exec(line);
      if (grant) return add('grants', `column-grant:${name}:${grant[1] ?? ''}:${grant[2] ?? ''}`, `${name} column grant ${grant[2] ?? ''} to ${grant[1] ?? ''}`, plain(grant[3] ?? ''));
      if (line.startsWith('View options: ')) return add('tables', `view-options:${name}`, `${name} view options`, plain(line.slice(14)).replace(/\.$/, ''));
    }
    const columnRow = block === 'columns' && isRow(line) && /^\| \d+ \| `/.test(line) ? rowOf(line, 8) : null;
    if (columnRow !== null) {
      const [, column = '', type = '', nullable = '', fallback = '', references = '', since = '', notes = ''] = columnRow;
      const parts = [type, nullable, fallback ? `default ${fallback}` : '', references ? `references ${references}` : '', since ? `since ${since}` : '', notes];
      return add('columns', `${name}.${column}`, `${name}.${column}`, parts.filter((part) => part !== '').join('; '));
    }
    if (block === 'columns' && line.startsWith('View options: ')) return add('tables', `view-options:${name}`, `${name} view options`, plain(line.slice(14)).replace(/\.$/, ''));
    const item = /^- `([^`]+)`(?: \(([^)]*)\))?: (.*)$/.exec(line);
    const named = /^- (Unique|Unique index|Foreign) `([^`]+)`: (.*)$/.exec(line);
    if (block === 'keys') {
      if (line.startsWith('- Primary: ')) return add('constraints', `${name}:primary key`, `${name} primary key`, plain(line.slice(11)));
      if (named) return add('constraints', `${name}:${(named[1] ?? '').toLowerCase()}:${named[2] ?? ''}`, `${name} ${(named[1] ?? '').toLowerCase()} ${named[2] ?? ''}`, plain(named[3] ?? ''));
    }
    if (block === 'indexes' && item) return add('constraints', `${name}:index:${item[1] ?? ''}`, `${name} index ${item[1] ?? ''}`, plain(item[3] ?? ''));
    if (block === 'policies' && item) {
      multiLine = 'policies';
      return add('policies', `${name}:${item[1] ?? ''}`, `${name} policy ${item[1] ?? ''}`, plain(item[3] ?? ''));
    }
    if (block === 'rules' && item) return add('policies', `${name}:rule:${item[1] ?? ''}`, `${name} rewrite rule ${item[1] ?? ''}`, plain(item[3] ?? ''));
    if (block === 'checks' && item) {
      const exclusion = item[2] === 'exclusion';
      return add('constraints', `${name}:${exclusion ? 'exclusion' : 'check'}:${item[1] ?? ''}`, `${name} ${exclusion ? 'exclusion' : 'check'} ${item[1] ?? ''}`, plain(item[3] ?? ''));
    }
    if ((block === 'triggers' || block === 'idle') && item) {
      multiLine = block;
      return add('triggers', `${name}:${item[1] ?? ''}`, `${name} trigger ${item[1] ?? ''}`, `${item[2] ? `${item[2]}; ` : ''}${plain(item[3] ?? '')}`);
    }
    const maintains = /^Maintains `updated_at`: (.*)\.$/.exec(line);
    if (maintains) return add('triggers', `${name}:updated_at`, `${name} triggers that maintain updated_at`, plain(maintains[1] ?? ''));
    other(name, line);
  }

  function readDivergenceLine(line: string): void {
    const sub = /^### ([A-E])\. /.exec(line);
    if (sub) {
      divergence = sub[1] ?? '';
      other(section, line);
      return;
    }
    if (line === 'Notes:') {
      divergence = 'A notes';
      other(section, line);
      return;
    }
    if (line.startsWith('Checked and matching: ')) return add('divergences', 'matching', 'checked and matching', plain(line.slice(22)));
    if (line.startsWith('Type notes: ')) return add('divergences', 'type notes', 'type notes', plain(line.slice(12)));
    const note = /^- (A\d+) \(`([^`]*)`\): (.*)$/.exec(line);
    if (divergence === 'A notes' && note) return add('divergences', `A note:${note[2] ?? ''}`, `${note[1] ?? ''} note on ${note[2] ?? ''}`, plain(note[3] ?? ''));
    if (isRow(line) && !isSeparator(line)) {
      const row = cells(line);
      const id = row[0] ?? '';
      const width: Readonly<Record<string, number>> = { A: 8, B: 7, C: 6, D: 6, E: 2 };
      if (row.length !== width[divergence]) {
        other(section, line);
        return;
      }
      if (divergence === 'A' && /^A\d+$/.test(id)) {
        const [, tableName = '', field = '', kind = '', dictionary = '', schema = '', by = '', status = ''] = row;
        const what = `${tableName}${field ? `.${field}` : ''}`;
        return add('divergences', `A:${what}:${kind}`, `${id} ${what} (${kind})`, `Data dictionary: ${dictionary}; live schema: ${schema}; explained by: ${by}; status: ${status}`);
      }
      if (divergence === 'B' && /^B\d+$/.test(id)) {
        const [, tableName = '', dictionary = '', live = '', by = '', status = '', text = ''] = row;
        return add('divergences', `B:${tableName}`, `${id} ${tableName} policies`, `Data dictionary: ${dictionary}; live: ${live}; explained by: ${by}; status: ${status}; note: ${text}`);
      }
      if (divergence === 'C' && /^C\d+$/.test(id)) {
        const [, subject = '', where = '', says = '', schema = '', status = ''] = row;
        return add('divergences', `C:${subject}`, `${id} ${subject}`, `where: ${where}; says: ${says}; live schema: ${schema}; status: ${status}`);
      }
      if (divergence === 'D' && /^D\d+$/.test(id)) {
        const [, tableName = '', area = '', klass = '', created = '', by = ''] = row;
        return add('divergences', `D:${tableName}`, `${id} ${tableName} (table not in the Data dictionary)`, `area ${area}; ${klass}; created by ${created}; explained by ${by}`);
      }
      if (divergence === 'E' && line.startsWith('| [`')) {
        const [tableName = '', columns = ''] = row;
        return add('divergences', `E:${tableName}`, `E ${tableName} (columns not in the Data dictionary)`, columns);
      }
    }
    other(section, line);
  }
}

/** The changes from `before` to `after`, category by category in the summary's order, each in the document's order. */
export function documentChanges(before: string, after: string): DocumentChange[] {
  return readingChanges(readDocument(before), readDocument(after));
}

/** documentChanges over two documents already read. */
export function readingChanges(before: DocumentReading, after: DocumentReading): DocumentChange[] {
  const index = (facts: readonly DocumentFact[]): Map<string, DocumentFact> => new Map(facts.map((f) => [`${f.category}\u0000${f.key}`, f]));
  const a = before.facts;
  const b = after.facts;
  const ai = index(a);
  const bi = index(b);
  const changes: DocumentChange[] = [];
  for (const [category] of SUMMARY_CATEGORIES) {
    const these: DocumentChange[] = [];
    for (const fact of b) {
      if (fact.category !== category) continue;
      const old = ai.get(`${category}\u0000${fact.key}`);
      if (old === undefined) these.push({ category, kind: 'added', label: fact.label, before: null, after: fact.value });
      else if (old.value !== fact.value) these.push({ category, kind: 'changed', label: fact.label, before: old.value, after: fact.value });
    }
    for (const fact of a) {
      if (fact.category === category && !bi.has(`${category}\u0000${fact.key}`)) these.push({ category, kind: 'removed', label: fact.label, before: fact.value, after: null });
    }
    changes.push(...(LINE_CATEGORIES.has(category) ? paired(these) : these));
  }
  return changes;
}

/** The categories whose facts are lines kept as themselves, so an edited line is a removed one and an added one. */
const LINE_CATEGORIES: ReadonlySet<SummaryCategory> = new Set(['cross-checks', 'other']);

/** What a line is about: its words before the first colon, or its first 24 characters. */
const lineHead = (line: string | null): string => {
  const text = line ?? '';
  const colon = text.indexOf(':');
  return colon > 0 ? text.slice(0, colon) : text.slice(0, 24);
};

/**
 * A removed line and an added line in the same place (a section, or a table's section) about the same thing
 * (lineHead), in order, read as one changed line; any other stays removed or added.
 */
function paired(changes: readonly DocumentChange[]): DocumentChange[] {
  const removed = changes.filter((c) => c.kind === 'removed');
  const used = new Set<DocumentChange>();
  const out: DocumentChange[] = [];
  for (const change of changes) {
    if (change.kind === 'removed') continue;
    const match = change.kind === 'added' ? removed.find((r) => !used.has(r) && r.label === change.label && lineHead(r.before) === lineHead(change.after)) : undefined;
    if (match === undefined) {
      out.push(change);
    } else {
      used.add(match);
      out.push({ ...change, kind: 'changed', before: match.before });
    }
  }
  return [...out, ...removed.filter((r) => !used.has(r))];
}

/** Beyond this many characters a changed value is shown around the part that changed. */
const SHOWN = 240;
/** Context kept on each side of the part that changed. */
const CONTEXT = 48;

const oneLine = (value: string): string => (value === '' ? '(empty)' : value.replace(/\r?\n/g, ' ⏎ '));
const span = (value: string): string => `\`${value.replace(/`/g, "'")}\``;

/** An added or removed value: whole in the security categories and the divergence rows, otherwise at most SHOWN characters. */
function whole(category: SummaryCategory, value: string): string {
  const text = oneLine(value);
  return WHOLE.has(category) || text.length <= SHOWN ? text : `${text.slice(0, SHOWN)}… (${String(text.length - SHOWN)} more characters)`;
}

/** A changed value's two sides, each cut to the part that changed with CONTEXT characters around it when they are long. */
export function contrast(before: string, after: string): readonly [string, string] {
  const a = oneLine(before);
  const b = oneLine(after);
  if (a.length <= SHOWN && b.length <= SHOWN) return [a, b];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const cut = (text: string): string => {
    const start = Math.max(0, prefix - CONTEXT);
    const end = Math.min(text.length, text.length - suffix + CONTEXT);
    let middle = text.slice(start, end);
    if (middle.length > SHOWN + 2 * CONTEXT) middle = `${middle.slice(0, SHOWN + 2 * CONTEXT)}…`;
    return `${start > 0 ? '…' : ''}${middle}${end < text.length && !middle.endsWith('…') ? '…' : ''}`;
  };
  return [cut(a), cut(b)];
}

/** One change on one line, in Markdown. */
export function changeLine(change: DocumentChange): string {
  const label = span(change.label);
  const value = (text: string | null): string => (text === null || text === '' ? '' : `: ${span(whole(change.category, text))}`);
  if (change.kind === 'added') return `- added ${label}${value(change.after)}`;
  if (change.kind === 'removed') return `- removed ${label}${value(change.before)}`;
  const [before, after] = SECURITY.has(change.category) ? [oneLine(change.before ?? ''), oneLine(change.after ?? '')] : contrast(change.before ?? '', change.after ?? '');
  return `- changed ${label}: ${span(before)} → ${span(after)}`;
}

/** The documents a summary compares, and where the older one came from. */
export interface SummaryInput {
  /** The last approved document's text, and the ref and commit it was read at. */
  readonly before: { readonly text: string; readonly ref: string; readonly commit: string };
  /** The new document's text, and where it came from (a path, or "the text --out wrote"). */
  readonly after: { readonly text: string; readonly source: string };
  /** The approver list and today, to say whether each approval line is valid. */
  readonly check: ApprovalCheck;
}

/** What a document's approval line says, in words. */
function approvalState(text: string, check: ApprovalCheck): string {
  const line = approvalLineOf(text);
  const fields = approvalFields(line);
  if (fields !== null && /^_+$/.test(fields.name.trim()) && /^_+$/.test(fields.date)) {
    return fields.sha256 === documentSha256(text) ? 'awaiting approval' : 'awaiting approval, the line carrying another text’s hash';
  }
  const problems = approvalProblems(line, documentSha256(text), check);
  if (problems.length === 0 && fields !== null) return `approved by ${fields.name} on ${fields.date}`;
  return `**not a valid approval**: ${problems.join('; ')}`;
}

/** The summary, in Markdown, ready to open a pull request's description or a job summary. */
export function renderSummary(input: SummaryInput): string {
  const { before, after, check } = input;
  const oldSha = documentSha256(before.text);
  const newSha = documentSha256(after.text);
  const beforeReading = readDocument(before.text);
  const afterReading = readDocument(after.text);
  const changes = readingChanges(beforeReading, afterReading);
  const out: string[] = [
    '## Changes since the last approved document',
    '',
    `- Last approved: \`docs/product/domain-model.md\` at \`${before.ref}\` (commit \`${before.commit.slice(0, 12)}\`), document SHA-256 \`${oldSha}\`: ${approvalState(before.text, check)}`,
    `- New: ${after.source}, document SHA-256 \`${newSha}\`: ${approvalState(after.text, check)}`,
  ];
  const unclosed = [...(beforeReading.unclosedFence ? ['the last approved document'] : []), ...(afterReading.unclosedFence ? ['the new document'] : [])];
  if (unclosed.length > 0) {
    out.push(
      `- **This summary could not read ${unclosed.join(' or ')} line by line**: a code block opens and never closes, so the lines after it are listed as they are, under "Other lines". Compare the two documents directly before approving.`,
    );
  }
  const counts = SUMMARY_CATEGORIES.map(([category, title]) => [title, changes.filter((c) => c.category === category).length] as const).filter(([, n]) => n > 0);
  if (changes.length > 0) {
    out.push(`- ${String(changes.length)} ${changes.length === 1 ? 'change' : 'changes'}: ${counts.map(([title, n]) => `${String(n)} in ${title.toLowerCase()}`).join(', ')}`);
    out.push('- Each change is one line. A long changed value shows only the part that changed, between "…".');
  } else if (oldSha === newSha) {
    out.push('- No change: the two documents have the same text (the provenance and approval lines aside).', '');
    return out.join('\n');
  } else {
    const folded = afterReading.folded.length;
    out.push(
      `- **The texts differ, but only in lines this summary reads as repeats of others** (the areas' table lists, the counts, Appendix A and B; ${String(folded)} such lines): compare the two documents directly before approving.`,
    );
  }
  out.push('');
  for (const [category, title] of SUMMARY_CATEGORIES) {
    const these = changes.filter((c) => c.category === category);
    if (these.length === 0) {
      out.push(`**${title}**: no change`, '');
      continue;
    }
    out.push(`**${title}** (${String(these.length)})`, '', ...these.map(changeLine), '');
  }
  return out.join('\n');
}

/** How much of the function section to print: `full` with the diffs (CI's job summary), `list` without them (a description). */
export type FunctionDiffsMode = 'list' | 'full';
export const FUNCTION_DIFFS_MODES: readonly FunctionDiffsMode[] = ['list', 'full'];

/**
 * The function section's budget in `full` mode, in UTF-8 bytes (so in characters too): under the 1 MiB GitHub keeps
 * of a job summary, with room for the document part before it. Past it, the diffs left out are named in one line.
 */
export const FUNCTION_SECTION_BUDGET = 900_000;

/** The function files a summary compares (docs/adr/0068): the base's and this run's, each file name to content. */
export interface FunctionChangesInput {
  /** The ref asked for, and the commit the base's files were read at (the merge base of the ref and HEAD, T17). */
  readonly ref: string;
  readonly commit: string;
  /** The ref's own commit, when the base's files were read at another (their merge base); else omitted. */
  readonly refCommit?: string;
  /** The base's files; null when the base has none (the pull request that first adds them). */
  readonly before: ReadonlyMap<string, string> | null;
  /** This run's files: the generated set under --out or --check, else the working tree's. */
  readonly after: ReadonlyMap<string, string>;
  /** Where `after` came from, in words. */
  readonly source: string;
  /** Whether `after` is the files as committed (the working tree: --summary-since alone) or generated by this run. */
  readonly origin: 'committed' | 'generated';
  /** The directory as the repository names it, for the diffs' headers. */
  readonly directory: string;
  /** `full` (the default) or `list`, whose output is exactly `full`'s up to its diffs. */
  readonly mode?: FunctionDiffsMode;
  /** The section's budget in UTF-8 bytes in `full` mode (FUNCTION_SECTION_BUDGET by default). */
  readonly budget?: number;
}

/**
 * The header of each overload in a function file: the lines of pg_get_functiondef's statement from its CREATE line
 * up to, not including, the line where the body starts (`AS ...`, or a SQL-standard `RETURN`/`BEGIN ATOMIC`). The
 * CREATE line counts only right after the file's own header comments, so a body that holds such a line is still body.
 */
export function functionHeaders(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^CREATE OR REPLACE (?:FUNCTION|PROCEDURE) /.test(lines[i] ?? '') || !(lines[i - 1] ?? '').startsWith('-- ')) continue;
    for (let j = i; j < lines.length && !/^(?:AS |RETURN |BEGIN ATOMIC)/.test(lines[j] ?? ''); j++) out.push(lines[j] ?? '');
  }
  return out;
}

/** A privilege or owner statement as functions.ts prints them after each definition. */
const PRIVILEGE_LINE = /^(?:GRANT EXECUTE ON (?:FUNCTION|PROCEDURE) public\.|REVOKE (?:ALL|EXECUTE) ON (?:FUNCTION|PROCEDURE) public\.|ALTER (?:FUNCTION|PROCEDURE) public\.\S.* OWNER TO )/;

/** A header line that sets what decides who runs the function and how: SECURITY, LEAKPROOF, STRICT and every SET. */
const BEHAVIOUR_HEADER_LINE = /\b(?:SECURITY (?:DEFINER|INVOKER)|LEAKPROOF|STRICT)\b|^ SET /;

/**
 * Whether a function file is about a SECURITY DEFINER function, or touches the tenant scope, or is open to PUBLIC
 * (design review S5/T11): SECURITY DEFINER in an overload's header (functionHeaders; never a body line that happens to
 * say it); a SET of app.practice_ids or app.actor_id in a header; a current_setting read or a set_config of either,
 * anywhere; or a GRANT ... TO PUBLIC. pg_get_functiondef prints a setting's name through quote_identifier, so a dotted
 * name arrives in double quotes (` SET "app.practice_ids" TO ...`); the unquoted form is matched too.
 */
export function sensitiveFunctionFile(text: string): boolean {
  const header = functionHeaders(text);
  return (
    header.some((line) => /\bSECURITY DEFINER\b/.test(line) || /^ SET "?app\.(?:practice_ids|actor_id)"? TO\b/.test(line)) ||
    /current_setting\s*\(\s*'app\.(?:practice_ids|actor_id)'/i.test(text) ||
    /set_config\s*\(\s*'app\./i.test(text) ||
    /^GRANT EXECUTE ON (?:FUNCTION|PROCEDURE) public\.\S.* TO PUBLIC\b/m.test(text)
  );
}

/** The lines a unified diff adds and removes, without the +/- and without its ---/+++ header lines. */
function diffLines(diff: string): { readonly added: string[]; readonly removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) inHunk = true;
    else if (!inHunk) continue;
    else if (line.startsWith('+')) added.push(line.slice(1));
    else if (line.startsWith('-')) removed.push(line.slice(1));
  }
  return { added, removed };
}

/**
 * Whether a diff adds or removes a privilege or owner line, or a header line with SECURITY, LEAKPROOF, STRICT or a
 * SET (T11): such a change is read first whatever the function.
 */
export function touchesPrivilegesOrBehaviour(diff: string, before: string, after: string): boolean {
  const { added, removed } = diffLines(diff);
  const headers = new Set([...functionHeaders(before), ...functionHeaders(after)]);
  return [...added, ...removed].some((line) => PRIVILEGE_LINE.test(line) || (headers.has(line) && BEHAVIOUR_HEADER_LINE.test(line)));
}

/** The label of a file read first, and the words for the order. */
const FIRST_LABEL = 'SECURITY DEFINER, tenant scope, privileges or PUBLIC';

/** The UTF-8 length of a text, which the budget counts. */
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/**
 * "Function definitions changed since REF" (docs/adr/0068; design review R2, PR review T1/S4): first one line saying
 * whose files these are (the committed ones, which `--check` proves equal to the migrated catalog, or the ones this
 * run generated), then every function file that differs between the base and this run as one line each, with its
 * added and removed line counts and why it is read first, SECURITY DEFINER, tenant-scope, PUBLIC and privilege or
 * header changes to a file that stays first (either side counts, so a flip to invoker is first too), then by name; then, in `full` mode
 * only, "Diffs": git's unified diff of each, in that order, in a fenced diff block, until the section's budget, and
 * one line naming the files whose diffs were left out. `list` prints exactly `full`'s text up to "Diffs", so the
 * description's copy is a prefix of CI's. When the base has no function files, one line says so, with the count, and
 * compares nothing.
 */
export function renderFunctionChanges(input: FunctionChangesInput): string {
  const { ref, commit, refCommit, before, after, source, origin, directory } = input;
  const mode = input.mode ?? 'full';
  const budget = input.budget ?? FUNCTION_SECTION_BUDGET;
  const atMergeBase = refCommit !== undefined && refCommit !== commit;
  const at = atMergeBase
    ? `\`${directory}\` at commit \`${commit.slice(0, 12)}\`, the merge base of \`${ref}\` (commit \`${refCommit.slice(0, 12)}\`) and HEAD,`
    : `\`${directory}\` at \`${ref}\` (commit \`${commit.slice(0, 12)}\`)`;
  const mergeBaseNote = atMergeBase ? ` Changes merged into \`${ref}\` after this branch left it are not shown.` : '';
  const out: string[] = [`## Function definitions changed since ${ref}`, ''];
  if (before === null || before.size === 0) {
    out.push(`- The base has no function files (${at.replace(/,$/, '')}): ${String(after.size)} ${after.size === 1 ? 'file' : 'files'} added, nothing to compare.`, '');
    return out.join('\n');
  }
  out.push(
    origin === 'committed'
      ? `- These are ${source}, not regenerated by this run: \`pnpm db:domain-model --check\` on a freshly migrated database (a required step of the domain model job) proves they equal the functions of the migrated catalog.`
      : `- These are the files this run generated from the migrated database's catalog.`,
    `- Compared: ${at} with ${source}.${mergeBaseNote}`,
  );
  const diffs = unifiedDiffs(before, after, directory);
  const firstNames = new Set(
    [...diffs.keys()].filter(
      (name) =>
        sensitiveFunctionFile(before.get(name) ?? '') ||
        sensitiveFunctionFile(after.get(name) ?? '') ||
        // A file added or removed is all privilege lines and header: only a change to one that stays is ranked by them.
        (before.has(name) && after.has(name) && touchesPrivilegesOrBehaviour(diffs.get(name) ?? '', before.get(name) ?? '', after.get(name) ?? '')),
    ),
  );
  const first = (name: string): boolean => firstNames.has(name);
  const names = [...diffs.keys()].sort((a, b) => Number(first(b)) - Number(first(a)) || cOrder(a, b));
  if (names.length === 0) {
    out.push('- No function file changed.', '');
    return out.join('\n');
  }
  const added = names.filter((n) => !before.has(n)).length;
  const removed = names.filter((n) => !after.has(n)).length;
  const firstCount = names.filter(first).length;
  out.push(
    `- ${String(names.length)} ${names.length === 1 ? 'file' : 'files'} changed (${String(added)} added, ${String(removed)} removed), ${String(firstCount)} of them first (${FIRST_LABEL}), then by name; each with the lines it adds and removes:`,
    '',
  );
  for (const name of names) {
    const { added: plus, removed: minus } = diffLines(diffs.get(name) ?? '');
    const flags = [...(!before.has(name) ? ['added'] : []), ...(!after.has(name) ? ['removed'] : []), ...(first(name) ? [FIRST_LABEL] : [])];
    out.push(`- \`${directory}/${name}\` +${String(plus.length)}/-${String(minus.length)}${flags.length ? ` (${flags.join('; ')})` : ''}`);
  }
  out.push('');
  const list = out.join('\n');
  if (mode === 'list') return list;

  const blocks = names.map((name) => {
    const diff = diffs.get(name) ?? '';
    const fence = fenceFor(diff);
    return [`#### \`${directory}/${name}\`${first(name) ? ` (${FIRST_LABEL})` : ''}`, '', `${fence}diff`, diff, fence, '', ''].join('\n');
  });
  const diffsHeading = '\n### Diffs\n\n';
  const leftOutLine = (left: readonly string[]): string =>
    left.length === 0 ? '' : `- Diffs left out, past this section's ${String(budget)}-byte budget (see Files changed): ${left.map((n) => `\`${n}\``).join(', ')}\n`;
  // Diffs in order while they fit; then fewer, until the line naming those left out fits too.
  let kept = 0;
  let size = bytes(list) + bytes(diffsHeading);
  while (kept < blocks.length && size + bytes(blocks[kept] ?? '') <= budget) size += bytes(blocks[kept++] ?? '');
  while (kept > 0 && kept < blocks.length && size + bytes(leftOutLine(names.slice(kept))) > budget) size -= bytes(blocks[--kept] ?? '');
  return `${list}${diffsHeading}${blocks.slice(0, kept).join('')}${leftOutLine(names.slice(kept))}`.replace(/\n+$/, '\n');
}
