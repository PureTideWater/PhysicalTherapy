import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { APPROVAL_PREFIX, approvalLineOf, awaitingApprovalLine, documentSha256, provenanceLine } from './approval';
import { documentAtRef } from './history';
import { fenceFor } from './render';
import { DOMAIN_MODEL_DOCUMENT, DomainModelError } from './sources';
import { type DocumentChange, SUMMARY_CATEGORIES, changeLine, contrast, documentChanges, readDocument, readingChanges, renderSummary } from './summary';

/**
 * "Changes since the last approved document" (docs/adr/0063) on synthetic schema changes: the committed
 * document, the generator's own output for the synthetic schema, edited line by line as each change would
 * regenerate it. summary.db.test.ts makes the same changes as DDL on a scratch database and regenerates.
 */
const committed = readFileSync(DOMAIN_MODEL_DOCUMENT, 'utf8');
const check = { approvers: ['A. Signer'], now: new Date('2026-10-18T12:00:00Z') };

/** `text` with the one occurrence of `from` replaced by `to`; fails when `from` is not there exactly once. */
function edit(text: string, from: string, to: string): string {
  const parts = text.split(from);
  expect(parts.length - 1, `occurrences of ${JSON.stringify(from.slice(0, 80))}`).toBe(1);
  return parts.join(to);
}

/** The lines of one table's section, from its heading to the next heading. */
function section(text: string, table: string): string {
  const start = text.indexOf(`### Table \`${table}\`\n`);
  expect(start, table).toBeGreaterThanOrEqual(0);
  const next = text.slice(start + 1).search(/\n##+ /);
  return text.slice(start, start + 1 + next + 1);
}

/** `text` with one table's section edited. */
const inSection = (text: string, table: string, from: string, to: string): string => {
  const before = section(text, table);
  return edit(text, before, edit(before, from, to));
};

const of = (changes: readonly DocumentChange[], category: string): DocumentChange[] => changes.filter((c) => c.category === category);
const lines = (changes: readonly DocumentChange[]): string[] => changes.map(changeLine);

describe('reading the document', () => {
  const { facts, folded } = readDocument(committed);
  const count = (category: string, prefix: string): number => facts.filter((f) => f.category === category && f.key.startsWith(prefix)).length;
  const header = (prefix: string): string => committed.split('\n').find((line) => line.startsWith(prefix)) ?? '';
  const number = (text: string, pattern: RegExp): number => Number(pattern.exec(text)?.[1] ?? Number.NaN);

  it('finds every table, policy, function and migration the header counts', () => {
    const tables = number(header('- PostgreSQL '), /: (\d+) tables/);
    const views = number(header('- PostgreSQL '), /, (\d+) view\(s\)/);
    expect(count('tables', 'table:')).toBe(tables);
    expect(count('tables', 'view:')).toBe(views);
    expect(count('tables', 'view-definition:')).toBe(views);
    expect(facts.filter((f) => f.category === 'policies' && !f.key.includes(':rule:'))).toHaveLength(number(header('- RLS:'), /; (\d+) policies/));
    expect(count('functions', 'function:')).toBe(number(header('- Functions in '), /: (\d+) \(/));
    expect(count('grants', 'execute:')).toBe(count('functions', 'function:'));
    expect(count('migrations', 'migration:')).toBe(number(header('- Migrations applied:'), /: (\d+);/));
    expect(count('phi', 'class:')).toBe(tables + views);
  });

  it('reads each summary line at the top into its category', () => {
    const totals = facts.filter((f) => f.key.startsWith('totals:'));
    expect(totals.map((f) => f.category)).toEqual(['migrations', 'tables', 'phi', 'rls', 'functions', 'grants', 'grants', 'divergences']);
  });

  it('keeps every line it reads no rule for as itself, and folds only the lines the document repeats', () => {
    const other = facts.filter((f) => f.category === 'other').map((f) => f.value);
    // Headings, prose and table headers: nothing that describes a table, a column or a policy.
    expect(other.every((line) => !/^\d+ \| /.test(line))).toBe(true);
    for (const line of folded) {
      expect(
        line.startsWith('<a id=') ||
          line.startsWith('- Primary key: ') ||
          line === '- none' ||
          /^\|(?:\s*-{3,}\s*\|)+$/.test(line) ||
          /^\d+\. \[/.test(line) ||
          /^## \d+\. /.test(line) ||
          line.startsWith('| [`') ||
          line.startsWith('| `') ||
          line.startsWith('| Table | Class |') ||
          !line.startsWith('|'),
        line,
      ).toBe(true);
    }
  });
});

describe('documentChanges, on synthetic schema changes', () => {
  it('finds nothing between a document and itself, whatever its provenance and approval lines', () => {
    const other = committed
      .replace(/^- Generated at commit .*$/m, provenanceLine({ commit: 'abcdef1', branch: 'probe', uncommitted: true }))
      .replace(approvalLineOf(committed) ?? '', awaitingApprovalLine('0'.repeat(64)));
    expect(documentChanges(committed, other)).toEqual([]);
    const summary = renderSummary({ before: { text: committed, ref: 'origin/main', commit: 'f'.repeat(40) }, after: { text: other, source: 'probe' }, check });
    expect(summary).toContain('- No change: the two documents have the same text');
    expect(summary).not.toContain('**Row-level security**');
  });

  it('row-level security not forced: the table, the header and the sentence under the PHI table, nothing else', () => {
    let after = inSection(committed, 'line_note', '- Row-level security: enabled, forced; 2 policies;', '- Row-level security: enabled; 2 policies;');
    after = edit(after, '| [`line_note`](#table-line-note) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes |', '| [`line_note`](#table-line-note) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | no |');
    after = edit(after, 'Tables with RLS enabled but not forced: none.', 'Tables with RLS enabled but not forced: `line_note`.');
    const header = committed.split('\n').find((line) => line.startsWith('- RLS: ')) ?? '';
    after = edit(after, header, header.replace(/(\d+) tables ENABLE and FORCE row-level security; 0 enable without forcing/, (_, n: string) => `${String(Number(n) - 1)} tables ENABLE and FORCE row-level security; 1 enable without forcing`));
    const changes = documentChanges(committed, after);
    expect(changes.map((c) => c.category)).toEqual(['rls', 'rls', 'rls']);
    expect(lines(changes)).toEqual([
      expect.stringMatching(/^- changed `row-level security \(totals\)`: `RLS: \d+ tables ENABLE and FORCE row-level security; 0 enable without forcing; .*` → `RLS: \d+ tables .*; 1 enable without forcing; /),
      '- changed `tables with RLS enabled but not forced`: `none.` → `line_note.`',
      '- changed `line_note row-level security`: `enabled, forced; owner tp_owner` → `enabled; owner tp_owner`',
    ]);
  });

  it('a policy added and one removed, each in one line with its whole text', () => {
    let after = inSection(
      committed,
      'line_note',
      'Policies (2):\n',
      'Policies (2):\n- `gate_probe_read`: RESTRICTIVE FOR SELECT TO tp_app\n  - USING `(created_by = app_actor_id())`\n',
    );
    after = inSection(after, 'line_note', '- `line_note_created_by_actor`: RESTRICTIVE FOR INSERT TO tp_app\n  - WITH CHECK `(created_by = app_actor_id())`\n', '');
    expect(lines(of(documentChanges(committed, after), 'policies'))).toEqual([
      '- added `line_note policy gate_probe_read`: `RESTRICTIVE FOR SELECT TO tp_app; USING (created_by = app_actor_id())`',
      '- removed `line_note policy line_note_created_by_actor`: `RESTRICTIVE FOR INSERT TO tp_app; WITH CHECK (created_by = app_actor_id())`',
    ]);
    // A policy's USING changed alone is that policy changed.
    const using = inSection(committed, 'line_note', "  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`", '  - USING `true`');
    expect(lines(documentChanges(committed, using))).toEqual([
      "- changed `line_note policy line_note_tenant`: `PERMISSIVE FOR ALL TO public; USING (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[])); WITH CHECK (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))` → `PERMISSIVE FOR ALL TO public; USING true; WITH CHECK (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`",
    ]);
  });

  it('the PHI registry, grants, a column, a constraint, a function and a trigger, each where it belongs and in that order', () => {
    let after = inSection(committed, 'line_note', 'registry policy `line_note_tenant`, registered by `20261016120000_remittances`, qualifies: yes', 'registry policy `gate_probe_read`, registered by `20261016120000_remittances`, qualifies: **NO**');
    after = inSection(after, 'line_note', '- Privileges: `tp_app` SELECT, INSERT(cols)', '- Privileges: `tp_app` SELECT, INSERT(cols), DELETE');
    after = inSection(after, 'line_note', '- Column grant: `tp_app` INSERT (`created_by`, `id`, `note`, `practice_id`, `service_line_id`)', '- Column grant: `tp_app` INSERT (`created_by`, `id`, `note`, `practice_id`)');
    after = inSection(after, 'line_note', '| 5 | `created_by` | `uuid` | NOT NULL |', '| 5 | `created_by` | `uuid` | null |');
    after = inSection(after, 'line_note', "- `line_note_note_check`: `CHECK (note ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`", "- `line_note_note_check`: `CHECK (note ~ '^enc:v2:[A-Za-z0-9_-]+$'::text)`");
    after = inSection(
      after,
      'line_note',
      'Invariants enforced by triggers:\n- `line_note_references_in_practice`: `BEFORE INSERT ON line_note FOR EACH ROW EXECUTE FUNCTION line_note_references_in_practice()`\n  - "a note belongs to a service line of the same practice"\n',
      'Triggers that do not fire in an ordinary session (not enforced):\n- `line_note_references_in_practice` (disabled: not enforced): `BEFORE INSERT ON line_note FOR EACH ROW EXECUTE FUNCTION line_note_references_in_practice()`\n  - "a note belongs to a service line of the same practice"\n',
    );
    const fn = committed.split('\n').find((line) => line.startsWith('| `line_note_references_in_practice()` |')) ?? '';
    after = edit(after, fn, fn.replace(/`[0-9a-f]{16}` \|$/, '`0000000000000000` |').replace('|  |  | `0', '| tp_app |  | `0'));
    const changes = documentChanges(committed, after);
    expect(changes.map((c) => `${c.category}: ${c.kind} ${c.label}`)).toEqual([
      'phi: changed line_note class',
      'grants: changed line_note privileges',
      'grants: changed line_note column grant INSERT to tp_app',
      'grants: changed EXECUTE on line_note_references_in_practice()',
      'columns: changed line_note.created_by',
      'constraints: changed line_note check line_note_note_check',
      'functions: changed line_note_references_in_practice()',
      'triggers: changed line_note trigger line_note_references_in_practice',
    ]);
    expect(changeLine(changes[3] as DocumentChange)).toBe('- changed `EXECUTE on line_note_references_in_practice()`: `granted to no group role` → `granted to tp_app`');
    expect(changeLine(changes[4] as DocumentChange)).toBe(
      '- changed `line_note.created_by`: `uuid; NOT NULL; references user(id); since 20261016120000` → `uuid; null; references user(id); since 20261016120000`',
    );
    expect(changeLine(changes[7] as DocumentChange)).toMatch(/^- changed `line_note trigger line_note_references_in_practice`: `BEFORE INSERT .*` → `disabled: not enforced; BEFORE INSERT /);
    // The order of the summary: row-level security, policies, the PHI registry and grants first.
    const summary = renderSummary({ before: { text: committed, ref: 'origin/main', commit: 'a'.repeat(40) }, after: { text: after, source: 'probe' }, check });
    const at = (title: string): number => summary.indexOf(`**${title}**`);
    const titles = SUMMARY_CATEGORIES.map(([, title]) => title);
    expect(titles.map(at).every((n) => n > 0)).toBe(true);
    expect([...titles.map(at)].sort((a, b) => a - b)).toEqual(titles.map(at));
    expect(summary).toContain('- 8 changes: 1 in phi registry, 3 in grants and roles, 1 in columns, 1 in constraints and indexes, 1 in functions, 1 in triggers\n');
  });

  it('a table added: the table, each of its columns, keys and policies, its area and its divergence row', () => {
    const original = section(committed, 'line_note');
    const copy = original.replaceAll('line_note', 'gate_probe_note').replaceAll('line-note', 'gate-probe-note');
    let after = edit(committed, original, original + copy);
    after = edit(
      after,
      '| [`line_note`](#table-line-note) | Documents and remittances | PHI (registered) | uuid NOT NULL |',
      '| [`gate_probe_note`](#table-gate-probe-note) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 1 | SELECT, INSERT(cols) | - | - |\n| [`line_note`](#table-line-note) | Documents and remittances | PHI (registered) | uuid NOT NULL |',
    );
    const d = committed.split('\n').find((line) => line.startsWith('| D1 |')) ?? '';
    after = edit(after, d, `| D1 | [\`gate_probe_note\`](#table-gate-probe-note) | Documents and remittances | PHI (registered) | \`29991231000000_gate_probe\` | - |\n${d.replace('| D1 |', '| D2 |')}`);
    const changes = documentChanges(committed, after);
    const added = changes.filter((c) => c.kind === 'added');
    expect(added).toHaveLength(changes.length);
    expect(of(changes, 'tables').map((c) => c.label)).toEqual(['gate_probe_note area', 'table gate_probe_note', 'gate_probe_note Data dictionary entry', 'gate_probe_note created by']);
    expect(of(changes, 'columns')).toHaveLength(7);
    expect(of(changes, 'policies')).toHaveLength(2);
    expect(of(changes, 'rls').map((c) => c.label)).toEqual(['gate_probe_note row-level security']);
    expect(of(changes, 'phi').map((c) => c.label)).toEqual(['gate_probe_note class']);
    // The renumbered D rows below it are not changes: only the new row is.
    expect(lines(of(changes, 'divergences'))).toEqual(['- added `D1 gate_probe_note (table not in the Data dictionary)`: `area Documents and remittances; PHI (registered); created by 29991231000000_gate_probe; explained by -`']);
  });

  it('a divergence row inserted at the top renumbers the rest without changing them; a removed row is one line', () => {
    const a1 = committed.split('\n').find((line) => line.startsWith('| A1 |')) ?? '';
    const rows = committed.split('\n').filter((line) => /^\| A\d+ \|/.test(line));
    const renumbered = rows.map((row, i) => row.replace(/^\| A\d+ \|/, `| A${String(i + 2)} |`));
    let after = edit(committed, rows.join('\n'), [`| A1 | [\`line_note\`](#table-line-note) | \`note\` | retyped | text | bytea | **no reviewed explanation** | needs review |`, ...renumbered].join('\n'));
    expect(lines(documentChanges(committed, after))).toEqual([
      '- added `A1 line_note.note (retyped)`: `Data dictionary: text; live schema: bytea; explained by: **no reviewed explanation**; status: needs review`',
    ]);
    after = edit(committed, `${a1}\n`, '');
    expect(documentChanges(committed, after).map((c) => `${c.kind} ${c.label}`)).toEqual([expect.stringMatching(/^removed A1 /)]);
  });

  it('a line no rule reads is reported as itself, a changed one as one line', () => {
    const approval = committed.split('\n').find((line) => line.startsWith('This document describes the schema at migration head')) ?? '';
    const after = edit(committed, approval, approval.replace('migrations). ', 'migrations), probe. '));
    expect(documentChanges(committed, after)).toEqual([expect.objectContaining({ category: 'other', kind: 'changed', label: 'Approval' })]);
    const cross = edit(committed, 'on this database: 0 problem(s)', 'on this database: 1 problem(s)');
    expect(lines(documentChanges(committed, cross))).toEqual([
      '- changed `Cross-checks`: `catalogProblems() (packages/db/src/catalog.ts) on this database: 0 problem(s)` → `catalogProblems() (packages/db/src/catalog.ts) on this database: 1 problem(s)`',
    ]);
  });

  it('never says "no change" when the texts differ only in a line it folds', () => {
    const row = committed.split('\n').find((line) => line.startsWith('| `organization.kind` |')) ?? '';
    const after = edit(committed, row, row.replace('`internal`', '`internal`, `probe`'));
    expect(documentChanges(committed, after)).toEqual([]);
    const summary = renderSummary({ before: { text: committed, ref: 'origin/main', commit: 'b'.repeat(40) }, after: { text: after, source: 'probe' }, check });
    expect(summary).toContain('**The texts differ, but only in lines this summary reads as repeats of others**');
    expect(summary).not.toContain('No change');
  });

  it('a view definition holding a fence line is fenced longer and read whole; a block never closed is said, not dropped', () => {
    const block = /\n```sql\n([\s\S]*?)\n```\n/.exec(committed);
    const definition = block?.[1] ?? '';
    expect(definition).toContain('FROM organization o');
    // CREATE VIEW ... AS SELECT E'\n```\n'::text: a line of the definition is a fence of three backticks.
    const fenced = `${definition}\nUNION ALL SELECT '\n\`\`\`\n'::text`;
    const fence = fenceFor(fenced);
    expect(fence).toBe('````');
    const after = edit(committed, block?.[0] ?? '', `\n${fence}sql\n${fenced}\n${fence}\n`);
    const changes = documentChanges(committed, after);
    expect(changes.map((c) => `${c.category} ${c.kind} ${c.label}`)).toEqual(['tables changed billing_standing view definition']);
    expect(changes[0]?.after).toBe(fenced);
    // The same text under a three-backtick fence, as the generator wrote it before: the definition's own line closes
    // the block, and the generator's closing fence opens one that swallows every line up to the cross-checks.
    const early = edit(committed, block?.[0] ?? '', `\n\`\`\`sql\n${fenced}\n\`\`\`\n`);
    expect(documentChanges(committed, early).filter((c) => c.category === 'other').length).toBeGreaterThan(100);
    // A block never closed (here the cross-checks' own) still reports its lines, and the summary says it could not
    // read the document line by line.
    const cross = /\n```text\n[\s\S]*?\n```\n/.exec(committed)?.[0] ?? '';
    const open = edit(committed, cross, cross.replace(/```\n$/, ''));
    expect(readDocument(open).unclosedFence).toBe(true);
    expect(readDocument(committed).unclosedFence).toBe(false);
    expect(documentChanges(committed, open).length).toBeGreaterThan(0);
    const summary = renderSummary({ before: { text: committed, ref: 'origin/claude/build-platform', commit: 'b'.repeat(40) }, after: { text: open, source: 'probe' }, check });
    expect(summary).toContain('**This summary could not read the new document line by line**');
  });

  it("reports a change to a code block's info string, and not a longer fence around the same block", () => {
    const cross = /\n```text\n[\s\S]*?\n```\n/.exec(committed)?.[0] ?? '';
    expect(cross).not.toBe('');
    const relabelled = documentChanges(committed, edit(committed, cross, cross.replace('\n```text\n', '\n```console\n')));
    expect(relabelled.map((c) => `${c.category} ${c.kind}`).sort()).toEqual(['cross-checks added', 'cross-checks removed']);
    const longer = edit(committed, cross, cross.replace('\n```text\n', '\n````text\n').replace(/\n```\n$/, '\n````\n'));
    expect(documentChanges(committed, longer)).toEqual([]);
  });

  it('reports a change to any line it does not fold (every 41st line of the document, edited)', () => {
    const reading = readDocument(committed);
    const foldedSet = new Set(reading.folded);
    const all = committed.split('\n');
    let tried = 0;
    for (let i = 7; i < all.length - 3; i += 41) {
      const line = all[i] ?? '';
      if (line.trim() === '' || line === '```' || foldedSet.has(line)) continue;
      const after = [...all.slice(0, i), `${line} probe`, ...all.slice(i + 1)].join('\n');
      expect(readingChanges(reading, readDocument(after)).length, `line ${String(i + 1)}: ${line.slice(0, 80)}`).toBeGreaterThan(0);
      tried++;
    }
    expect(tried).toBeGreaterThan(100);
  }, 60_000);
});

describe('a change on one line', () => {
  it('shows a long value around the part that changed, both sides cut at the same place', () => {
    const before = `${'a'.repeat(300)} USING true ${'b'.repeat(300)}`;
    const after = `${'a'.repeat(300)} USING false ${'b'.repeat(300)}`;
    const [was, now] = contrast(before, after);
    // The same 48 characters on either side of what differs ("tru" and "fals": the "e" after them is common).
    expect(was).toBe(`…${'a'.repeat(41)} USING true ${'b'.repeat(46)}…`);
    expect(now).toBe(`…${'a'.repeat(41)} USING false ${'b'.repeat(46)}…`);
    expect(contrast('short', 'shorter')).toEqual(['short', 'shorter']);
  });

  it('keeps every line one line, its values in code spans, and never shortens a security value', () => {
    expect(changeLine({ category: 'tables', kind: 'added', label: 'table gate_probe', before: null, after: '' })).toBe('- added `table gate_probe`');
    expect(changeLine({ category: 'other', kind: 'removed', label: 'Approval', before: 'a `b`\nc', after: null })).toBe("- removed `Approval`: `a 'b' ⏎ c`");
    const long = `USING ${'x'.repeat(500)}`;
    expect(changeLine({ category: 'policies', kind: 'added', label: 'p', before: null, after: long })).toBe(`- added \`p\`: \`${long}\``);
    expect(changeLine({ category: 'constraints', kind: 'added', label: 'c', before: null, after: long })).toBe(`- added \`c\`: \`${long.slice(0, 240)}… (266 more characters)\``);
  });
});

describe('the summary header', () => {
  const awaiting = (text: string): string => text.replace(approvalLineOf(text) ?? '', awaitingApprovalLine(documentSha256(text)));
  const signedBy = (text: string, name: string): string => text.replace(approvalLineOf(text) ?? '', `${APPROVAL_PREFIX} ${name}  Date: 2026-10-17  Document SHA-256: \`${documentSha256(text)}\``);
  const changed = inSection(committed, 'line_note', '- Privileges: `tp_app` SELECT, INSERT(cols)', '- Privileges: `tp_app` SELECT');

  it('names both documents, their SHA-256 and the state of each approval line', () => {
    const summary = renderSummary({ before: { text: signedBy(committed, 'A. Signer'), ref: 'origin/claude/build-platform', commit: 'c'.repeat(40) }, after: { text: awaiting(changed), source: 'the working tree' }, check });
    const [title, , last, now, count] = summary.split('\n');
    expect(title).toBe('## Changes since the last approved document');
    expect(last).toBe(`- Last approved: \`docs/product/domain-model.md\` at \`origin/claude/build-platform\` (commit \`cccccccccccc\`), document SHA-256 \`${documentSha256(committed)}\`: approved by A. Signer on 2026-10-17`);
    expect(now).toBe(`- New: the working tree, document SHA-256 \`${documentSha256(changed)}\`: awaiting approval`);
    expect(count).toBe('- 1 change: 1 in grants and roles');
    expect(summary).toContain('**Grants and roles** (1)\n\n- changed `line_note privileges`: `tp_app SELECT, INSERT(cols)` → `tp_app SELECT`\n');
  });

  it('says when the older document carries no valid approval', () => {
    const summary = renderSummary({ before: { text: signedBy(committed, 'Not Listed'), ref: 'main', commit: 'd'.repeat(40) }, after: { text: changed, source: 'x' }, check });
    expect(summary).toContain("**not a valid approval**: the approval's name is not on the approver list");
    const stale = renderSummary({ before: { text: committed.replace(approvalLineOf(committed) ?? '', awaitingApprovalLine('0'.repeat(64))), ref: 'main', commit: 'd'.repeat(40) }, after: { text: changed, source: 'x' }, check });
    expect(stale).toContain('awaiting approval, the line carrying another text’s hash');
  });
});

describe('documentAtRef', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });
  const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

  it('reads the document at a branch or a commit, and refuses a ref git cannot resolve, a commit without it, and an option', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'domain-model-history-'));
    dirs.push(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'probe@example.invalid');
    git(root, 'config', 'user.name', 'Probe');
    writeFileSync(path.join(root, 'README'), 'probe\n');
    git(root, 'add', 'README');
    git(root, 'commit', '-q', '-m', 'first');
    const first = git(root, 'rev-parse', 'HEAD');
    mkdirSync(path.join(root, 'docs/product'), { recursive: true });
    writeFileSync(path.join(root, 'docs/product/domain-model.md'), '# Domain model\n');
    git(root, 'add', 'docs');
    git(root, 'commit', '-q', '-m', 'second');
    const document = path.join(root, 'docs/product/domain-model.md');
    const read = documentAtRef('main', { repoRoot: root, document });
    expect(read).toEqual({ ref: 'main', commit: git(root, 'rev-parse', 'HEAD'), text: '# Domain model\n' });
    expect(() => documentAtRef('no-such-branch', { repoRoot: root, document })).toThrow(DomainModelError);
    expect(() => documentAtRef(first, { repoRoot: root, document })).toThrow(/has no docs\/product\/domain-model\.md$/);
    expect(() => documentAtRef('--output=x', { repoRoot: root, document })).toThrow(/is not a git ref$/);
    expect(() => documentAtRef('main two', { repoRoot: root, document })).toThrow(/is not a git ref$/);
  });
});
