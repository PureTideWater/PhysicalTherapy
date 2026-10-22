import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The migration files read as text, for the domain model (CO-02): which migration created each table,
 * added each column and (re)defined each function, which tables each one touched, and which ADRs each
 * migration's header cites. The database itself is read only through its catalog (catalog-reads.ts).
 */
export interface MigrationText {
  /** Every *.sql file in the directory, in name order. */
  readonly files: readonly string[];
  /** File -> the SHA-256 of its bytes on disk (as packages/db/src/migrate.ts records it when applied). */
  readonly checksums: ReadonlyMap<string, string>;
  /** File -> the ADR numbers its header cites ('0013', ...), sorted. */
  readonly adrs: ReadonlyMap<string, readonly string[]>;
  /** Table or view -> the first file that creates it. */
  readonly tableCreatedBy: ReadonlyMap<string, string>;
  /** `${table}.${column}` -> the first file that adds it. */
  readonly columnAddedBy: ReadonlyMap<string, string>;
  /** Table -> every file whose DDL, trigger or policy names it. */
  readonly tableTouchedBy: ReadonlyMap<string, ReadonlySet<string>>;
  /** Function name -> every file that CREATE (OR REPLACE)s it. */
  readonly functionDefinedBy: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Splits SQL into statements on ';' outside single quotes, dollar quotes and comments; comments removed. */
export function statementsOf(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let dollar: string | null = null;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (dollar !== null) {
      if (sql.startsWith(dollar, i)) {
        cur += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '-' && sql.charAt(i + 1) === '-') {
      while (i < sql.length && sql.charAt(i) !== '\n') i++;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql.charAt(j) === "'" && sql.charAt(j + 1) === "'") {
          j += 2;
          continue;
        }
        if (sql.charAt(j) === "'") break;
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        dollar = m[0];
        cur += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (ch === ';') {
      out.push(cur.trim());
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The top-level comma-separated items of a parenthesized body. */
export function topItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = '';
  let quote = false;
  for (const ch of body) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === ',') {
      items.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

/** The ADR numbers a migration's header (its leading run of comment and blank lines) cites. */
export function headerAdrs(sql: string): string[] {
  const headerLines: string[] = [];
  for (const line of sql.split('\n')) {
    if (/^\s*--/.test(line) || /^\s*$/.test(line)) headerLines.push(line);
    else break;
  }
  const header = headerLines.join('\n');
  const adrs = new Set<string>();
  for (const m of header.matchAll(/(?:adr\/|ADR )(\d{4})((?:(?:,| and) \d{4})*)/g)) {
    adrs.add(m[1] ?? '');
    for (const extra of (m[2] ?? '').matchAll(/\d{4}/g)) adrs.add(extra[0]);
  }
  return [...adrs].sort();
}

const NAME = '("[^"]+"|[a-z_][a-z0-9_]*)';
const CREATE_TABLE = new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${NAME}\\s*\\(`, 'i');
const COLUMN_ITEM = new RegExp(`^${NAME}\\s`, 'i');
const CREATE_VIEW = new RegExp(`^CREATE (?:OR REPLACE )?(?:MATERIALIZED )?VIEW ${NAME}`, 'i');
const ALTER_TABLE = new RegExp(`^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:public\\.)?${NAME}`, 'i');
/** A table or a function renamed: it keeps the migration that created it, under its new name. */
const RENAME_TABLE = new RegExp(`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\\.)?${NAME}\\s+RENAME TO\\s+${NAME}$`, 'i');
const RENAME_FUNCTION = new RegExp(`^ALTER FUNCTION (?:public\\.)?${NAME}\\s*\\([^)]*\\)\\s+RENAME TO\\s+${NAME}$`, 'i');
const ADD_COLUMN = new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?${NAME}`, 'gi');
const CREATE_FUNCTION = new RegExp(`^CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?${NAME}\\s*\\(`, 'i');
const CREATE_TRIGGER = new RegExp(`^CREATE (?:CONSTRAINT )?TRIGGER \\S+ [\\s\\S]*? ON (?:public\\.)?${NAME}`, 'i');
const CREATE_POLICY = new RegExp(`^CREATE POLICY \\S+ ON (?:public\\.)?${NAME}`, 'i');
const CHANGE_POLICY = new RegExp(`^(?:DROP POLICY|ALTER POLICY) (?:IF EXISTS )?\\S+ ON (?:public\\.)?${NAME}`, 'i');
const NOT_A_COLUMN = /^(constraint|primary|unique|check|foreign|exclude|like)$/i;

const unquote = (s: string): string => s.replace(/^"|"$/g, '');

/** Reads every migration in `dir` as text. */
export function readMigrationText(dir: string): MigrationText {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const adrs = new Map<string, readonly string[]>();
  const checksums = new Map<string, string>();
  const tableCreatedBy = new Map<string, string>();
  const columnAddedBy = new Map<string, string>();
  const tableTouchedBy = new Map<string, Set<string>>();
  const functionDefinedBy = new Map<string, Set<string>>();
  const addTo = (map: Map<string, Set<string>>, key: string, file: string): void => {
    const set = map.get(key) ?? new Set<string>();
    set.add(file);
    map.set(key, set);
  };
  const setOnce = (map: Map<string, string>, key: string, file: string): void => {
    if (!map.has(key)) map.set(key, file);
  };

  for (const file of files) {
    const bytes = readFileSync(path.join(dir, file));
    checksums.set(file, createHash('sha256').update(bytes).digest('hex'));
    const sql = bytes.toString('utf8');
    adrs.set(file, headerAdrs(sql));
    for (const st of statementsOf(sql)) {
      let m: RegExpExecArray | null;
      if ((m = CREATE_TABLE.exec(st))) {
        const t = unquote(m[1] ?? '');
        setOnce(tableCreatedBy, t, file);
        addTo(tableTouchedBy, t, file);
        const body = st.slice(st.indexOf('(') + 1, st.lastIndexOf(')'));
        for (const item of topItems(body)) {
          const cm = COLUMN_ITEM.exec(item);
          if (!cm) continue;
          const col = unquote(cm[1] ?? '');
          if (NOT_A_COLUMN.test(col)) continue;
          setOnce(columnAddedBy, `${t}.${col}`, file);
        }
        continue;
      }
      if ((m = CREATE_VIEW.exec(st))) {
        const t = unquote(m[1] ?? '');
        setOnce(tableCreatedBy, t, file);
        addTo(tableTouchedBy, t, file);
        continue;
      }
      if ((m = RENAME_TABLE.exec(st))) {
        // Where the table was created, and where each of its columns was added, carry over to its new name, and
        // so does every migration that touched it; the renaming migration touched both names.
        const from = unquote(m[1] ?? '');
        const to = unquote(m[2] ?? '');
        const created = tableCreatedBy.get(from);
        if (created !== undefined) setOnce(tableCreatedBy, to, created);
        for (const [key, by] of [...columnAddedBy]) {
          if (key.startsWith(`${from}.`)) setOnce(columnAddedBy, `${to}.${key.slice(from.length + 1)}`, by);
        }
        for (const by of tableTouchedBy.get(from) ?? []) addTo(tableTouchedBy, to, by);
        addTo(tableTouchedBy, from, file);
        addTo(tableTouchedBy, to, file);
        continue;
      }
      if ((m = RENAME_FUNCTION.exec(st))) {
        const from = unquote(m[1] ?? '');
        const to = unquote(m[2] ?? '');
        for (const by of functionDefinedBy.get(from) ?? []) addTo(functionDefinedBy, to, by);
        addTo(functionDefinedBy, to, file);
        continue;
      }
      if ((m = ALTER_TABLE.exec(st))) {
        const t = unquote(m[1] ?? '');
        addTo(tableTouchedBy, t, file);
        for (const am of st.matchAll(ADD_COLUMN)) setOnce(columnAddedBy, `${t}.${unquote(am[1] ?? '')}`, file);
        continue;
      }
      if ((m = CREATE_FUNCTION.exec(st))) {
        addTo(functionDefinedBy, unquote(m[1] ?? ''), file);
        continue;
      }
      if ((m = CREATE_TRIGGER.exec(st)) ?? (m = CREATE_POLICY.exec(st)) ?? (m = CHANGE_POLICY.exec(st))) {
        addTo(tableTouchedBy, unquote(m[1] ?? ''), file);
      }
    }
  }
  return { files, checksums, adrs, tableCreatedBy, columnAddedBy, tableTouchedBy, functionDefinedBy };
}

/** A migration's file name without `.sql`. */
export const shortName = (file: string): string => file.replace(/\.sql$/, '');
