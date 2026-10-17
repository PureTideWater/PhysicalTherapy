import { APP_ROLE } from '../roles';
import { type ColumnModel, type Model, type TableModel } from './model';
import { type Explanations } from './sources';

/**
 * The Data dictionary tab (docs/product/data-dictionary.md) read as tables of key fields, and every
 * way the live schema diverges from it (CO-02: "mark divergences from the Data dictionary tab").
 * The dictionary lists key fields, not every column, so a column or table it does not name is
 * informational; every other divergence needs a reviewed explanation under --strict.
 */
export interface DictionaryField {
  readonly name: string;
  readonly type: string | null;
  readonly paren: string | null;
  readonly enc?: true;
  readonly nullable?: true;
  readonly enumeration?: readonly string[];
}

export interface DictionaryEntry {
  readonly table: string;
  readonly section: string | null;
  readonly purpose: string | undefined;
  readonly policy: string | null;
  readonly fields: readonly DictionaryField[];
  readonly uniques: readonly (readonly string[])[];
  readonly notes: readonly string[];
}

export interface WantedIndex {
  readonly table: string;
  readonly cols: readonly string[];
  readonly predicate: string | null;
  readonly raw: string;
}

export interface Dictionary {
  readonly entries: readonly DictionaryEntry[];
  readonly byTable: ReadonlyMap<string, DictionaryEntry>;
  /** The section "Indexes that matter". */
  readonly wantedIndexes: readonly WantedIndex[];
}

/** Splits on commas and semicolons at depth 0 (outside parentheses and backticks). */
export function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let tick = false;
  let cur = '';
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (!tick && ch === '(') depth++;
    if (!tick && ch === ')') depth--;
    if (!tick && depth === 0 && (ch === ',' || ch === ';')) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export type ParsedItem = { readonly kind: 'raw' } | { readonly kind: 'unique'; readonly cols: string[] } | { readonly kind: 'field'; readonly field: DictionaryField };

/** One key-field item: `name type` (with an optional parenthesis), or `unique (a, b)`. */
export function parseField(item: string): ParsedItem {
  const m = /^(unique\s+)?`([^`]+)`\s*(?:\(([^)]*(?:\([^)]*\)[^)]*)*)\))?\s*(.*)$/.exec(item);
  if (!m) return { kind: 'raw' };
  const uniq = m[1];
  const tok = m[2] ?? '';
  const paren = m[3];
  if (uniq || tok.startsWith('(')) {
    return {
      kind: 'unique',
      cols: tok
        .replace(/[()]/g, '')
        .split(',')
        .map((x) => x.trim()),
    };
  }
  const [name = '', ...typeParts] = tok.split(/\s+/);
  let type: string | null = typeParts.join(' ') || null;
  let enc: true | undefined;
  let nullable: true | undefined;
  let enumeration: string[] | undefined;
  if (paren) {
    const p = paren.trim();
    if (/^enc$/i.test(p)) enc = true;
    else if (/^nullable/i.test(p) || /or null$/i.test(p)) nullable = true;
    else if (/^jsonb:/i.test(p)) type = 'jsonb';
    else if (/^bool$/i.test(p)) type = 'boolean';
    else if (/^[a-z0-9_]+(\s*,\s*[a-z0-9_]+)+$/i.test(p)) enumeration = p.split(',').map((x) => x.trim());
  }
  return {
    kind: 'field',
    field: { name, type, paren: paren ?? null, ...(enc ? { enc } : {}), ...(nullable ? { nullable } : {}), ...(enumeration ? { enumeration } : {}) },
  };
}

const USAGE_SNAPSHOT_ROWS = '`usage_snapshot` rows:';

export function parseDictionary(md: string): Dictionary {
  const entries: DictionaryEntry[] = [];
  let section: string | null = null;
  for (const line of md.split('\n')) {
    const h = /^## (.*)$/.exec(line);
    if (h) {
      section = (h[1] ?? '').trim();
      continue;
    }
    if (!line.startsWith('| `')) continue;
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.trim());
    const tables = [...(cells[0] ?? '').matchAll(/`([a-z_]+)`/g)].map((m) => m[1] ?? '');
    const purpose = cells[1];
    let keyFields = cells[2] ?? '';
    const policy = cells[3] ?? null;
    const notes: string[] = [];
    const perTable = new Map<string, string>();
    if (tables.includes('usage_snapshot')) {
      const idx = keyFields.indexOf(USAGE_SNAPSHOT_ROWS);
      perTable.set('usage_snapshot', keyFields.slice(idx + USAGE_SNAPSHOT_ROWS.length));
      notes.push(keyFields.slice(0, idx).trim());
      keyFields = '';
    }
    if (/^pg-boss tables plus/.test(keyFields)) keyFields = keyFields.replace(/^pg-boss tables plus\s*/, '');
    for (const t of tables) {
      const fields: DictionaryField[] = [];
      const uniques: string[][] = [];
      const extra: string[] = [];
      for (const item of splitTop(perTable.get(t) ?? keyFields)) {
        if (!item) continue;
        if (!item.includes('`')) {
          extra.push(item);
          continue;
        }
        const parsed = parseField(item);
        if (parsed.kind === 'unique') uniques.push(parsed.cols);
        else if (parsed.kind === 'field' && parsed.field.name) fields.push(parsed.field);
        else extra.push(item);
      }
      entries.push({ table: t, section, purpose, policy, fields, uniques, notes: [...notes, ...extra] });
    }
  }
  const idxSection = md.split('## Indexes that matter')[1] ?? '';
  const wantedIndexes = [...idxSection.matchAll(/`([a-z_]+) \(([^)]*)\)([^`]*)`([^,`]*)/g)].map((m) => ({
    table: m[1] ?? '',
    cols: (m[2] ?? '').split(',').map((c) => c.trim()),
    predicate: (m[3] ?? '').trim() || null,
    raw: m[0].trim(),
  }));
  return { entries, byTable: new Map(entries.map((e) => [e.table, e])), wantedIndexes };
}

export interface Divergence {
  readonly key: string;
  readonly table: string;
  readonly field: string;
  readonly kind: string;
  readonly dictionary: string;
  readonly schema: string;
  /** From the reviewed explanation, when there is one. */
  readonly by: string | null;
  readonly status: string | null;
  readonly text: string | null;
}

export interface Matches {
  fields: number;
  typed: number;
  readonly enumerations: string[];
  readonly uniques: string[];
  readonly indexes: string[];
  readonly encrypted: string[];
  readonly immutable: string[];
}

/** Columns every table has that the dictionary need not list. */
export const STANDARD = new Set(['id', 'created_at', 'updated_at']);
/** Divergence kinds that are informational: no explanation is required. */
export const INFORMATIONAL = new Set(['extra column', 'extra table', 'type note']);

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
export const indexCols = (def: string): string[] => {
  const m = /\(([^)]*)\)/.exec(def.replace(/^.*USING \w+ /, ''));
  return m ? (m[1] ?? '').split(',').map((x) => x.trim().replace(/ (DESC|ASC)$/i, '')) : [];
};
export const indexShort = (def: string): string => def.replace(/^CREATE (UNIQUE )?INDEX (\S+) ON public\.\S+ USING \w+ /, '$2 ');
const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase().replace('timestamptz', 'timestampwithtimezone');
const tokens = (n: string): string[] => n.split('_').filter(Boolean);

function similar(name: string, cols: readonly ColumnModel[]): string[] {
  const t = new Set(tokens(name));
  return cols
    .map((c) => ({ c, s: tokens(c.name).filter((x) => t.has(x)).length / Math.max(t.size, tokens(c.name).length) }))
    .filter((x) => x.s >= 0.5 && x.c.name !== name)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.c.name);
}

type Unexplained = Omit<Divergence, 'by' | 'status' | 'text'>;

/** Every divergence between `dictionary` and the live `model`, and what matched. */
export function compareWithDictionary(model: Model, dictionary: Dictionary): { divergences: Unexplained[]; matches: Matches } {
  const divergences: Unexplained[] = [];
  const matches: Matches = { fields: 0, typed: 0, enumerations: [], uniques: [], indexes: [], encrypted: [], immutable: [] };
  const add = (table: string, field: string, kind: string, dict: string, schema: string): void => {
    divergences.push({ key: `${table}|${field}|${kind}`, table, field, kind, dictionary: dict, schema });
  };

  for (const e of dictionary.entries) {
    const t = model.byName.get(e.table);
    if (!t) {
      add(e.table, '', 'missing table', `${String(e.section)}: ${String(e.purpose)}`, 'absent from schema public');
      continue;
    }
    compareTable(e, t, matches, add);
  }
  for (const t of model.tables) {
    if (t.classification.startsWith('global')) {
      const app = t.privileges[APP_ROLE] ?? [];
      if (app.some((p) => /INSERT|UPDATE|DELETE/.test(p))) add(t.name, '', 'global privileges', `${APP_ROLE} may not INSERT, UPDATE or DELETE a global table`, app.join(', '));
    }
    if (t.registry && t.name !== 'practice' && !t.indexes.some((i) => indexCols(i.def)[0] === 'practice_id')) {
      add(t.name, 'practice_id', 'convention', 'practice_id indexed (PHI convention)', 'no index leads with practice_id');
    }
  }
  for (const w of dictionary.wantedIndexes) {
    const t = model.byName.get(w.table);
    if (!t) {
      add(w.table, `index (${w.cols.join(', ')})`, 'index', w.raw, 'table absent');
      continue;
    }
    const want = w.cols.map((c) => c.replace(/ (desc|asc)$/i, ''));
    const match = t.indexes.find((i) => want.every((c, k) => indexCols(i.def)[k] === c));
    if (!match) {
      const lead = t.indexes.filter((i) => indexCols(i.def)[0] === want[0]).map((i) => indexShort(i.def));
      add(w.table, `index (${w.cols.join(', ')})`, 'index', w.raw, lead.join('; ') || 'no index with that leading column');
    } else {
      const issues: string[] = [];
      if (/desc/i.test(w.cols.join(' ')) && !/DESC/.test(match.def)) issues.push('not DESC');
      if (w.predicate && !/WHERE/.test(match.def)) issues.push('no partial predicate');
      if (issues.length) add(w.table, `index (${w.cols.join(', ')})`, 'index', w.raw, `${indexShort(match.def)} (${issues.join(', ')})`);
      else matches.indexes.push(indexShort(match.def));
    }
  }
  for (const t of model.tables) if (!dictionary.byTable.has(t.name)) add(t.name, '', 'extra table', 'not in the Data dictionary', t.classification);
  return { divergences, matches };
}

function compareTable(e: DictionaryEntry, t: TableModel, matches: Matches, add: (table: string, field: string, kind: string, dict: string, schema: string) => void): void {
  const colBy = new Map(t.columns.map((c) => [c.name, c]));
  for (const f of e.fields) {
    const c = colBy.get(f.name);
    if (!c) {
      const sim = similar(f.name, t.columns);
      add(e.table, f.name, sim.length ? 'renamed' : 'missing column', f.name + (f.type ? ' ' + f.type : ''), sim.length ? `absent; nearest columns: ${sim.join(', ')}` : 'absent');
      continue;
    }
    matches.fields++;
    let typeOk = true;
    if (f.type && !norm(f.type).startsWith('jsonb') && norm(f.type) !== norm(c.type)) {
      add(e.table, f.name, 'retyped', f.type, c.type);
      typeOk = false;
    }
    if (!f.type && /_cents$/.test(f.name) && c.type !== 'bigint') {
      add(e.table, f.name, 'retyped', 'bigint (the _cents convention)', c.type);
      typeOk = false;
    }
    if (!f.type && /_at$/.test(f.name) && c.type !== 'timestamp with time zone') {
      add(e.table, f.name, 'retyped', 'timestamptz (the _at convention)', c.type);
      typeOk = false;
    }
    if (!f.type && /(_on|_date)$/.test(f.name) && c.type !== 'date') {
      add(e.table, f.name, 'retyped', 'date (calendar date convention)', c.type);
      typeOk = false;
    }
    if (!f.type && /_id$/.test(f.name) && c.type !== 'uuid') add(e.table, f.name, 'type note', 'uuid (read from the _id suffix)', `${c.type}: an identifier read from the source file, not a key`);
    if (f.type === 'jsonb' && c.type !== 'jsonb') {
      add(e.table, f.name, 'retyped', 'jsonb', c.type);
      typeOk = false;
    }
    if (typeOk) matches.typed++;
    if (f.enumeration) {
      if (!c.enumeration) add(e.table, f.name, 'enumeration not enforced', f.enumeration.join(', '), `${c.type} with no CHECK list`);
      else {
        const live = c.enumeration;
        const missing = f.enumeration.filter((v) => !live.includes(v));
        const extra = live.filter((v) => !(f.enumeration ?? []).includes(v));
        if (missing.length || extra.length) {
          add(
            e.table,
            f.name,
            'enumeration differs',
            f.enumeration.join(', '),
            `${live.join(', ')}${extra.length ? ` (schema adds ${extra.join(', ')})` : ''}${missing.length ? ` (schema lacks ${missing.join(', ')})` : ''}`,
          );
        } else matches.enumerations.push(`${e.table}.${f.name} (${String(live.length)})`);
      }
    }
    if (f.enc && !c.encrypted) add(e.table, f.name, 'encryption', 'marked (enc)', 'no enc:v1 CHECK');
    if (f.enc && c.encrypted) matches.encrypted.push(`${e.table}.${f.name}`);
    if (!f.enc && c.encrypted) add(e.table, f.name, 'encryption', 'listed, not marked (enc)', 'encrypted: enc:v1 CHECK');
    if (f.nullable && c.notNull) add(e.table, f.name, 'nullability', 'nullable', 'NOT NULL');
  }
  for (const c of t.columns) if (c.encrypted && !e.fields.some((f) => f.name === c.name)) add(e.table, c.name, 'encryption', 'not listed', 'encrypted: enc:v1 CHECK');
  for (const u of e.uniques) {
    const has = t.uniques.some((x) => sameSet(x.cols, u)) || t.indexes.some((i) => i.unique && sameSet(indexCols(i.def), u));
    if (has) matches.uniques.push(`${e.table} (${u.join(', ')})`);
    else add(e.table, `unique (${u.join(', ')})`, 'unique differs', `unique (${u.join(', ')})`, t.uniques.map((x) => `${x.name} (${x.cols.join(', ')})`).join('; ') || 'no unique constraint');
  }
  const extra = t.columns.filter((c) => !STANDARD.has(c.name) && !e.fields.some((f) => f.name === c.name));
  for (const c of extra) add(e.table, c.name, 'extra column', '-', `${c.type}${c.notNull ? ' NOT NULL' : ''}`);
  if (!t.isView && !t.columns.some((c) => c.name === 'created_at') && !e.fields.some((f) => /(^|_)(at|on)$/.test(f.name) && /created|^at$/.test(f.name))) {
    add(e.table, 'created_at', 'convention', 'created_at timestamptz (dictionary convention)', 'absent');
  }
  if (!t.isView && !t.columns.some((c) => c.name === 'updated_at')) add(e.table, 'updated_at', 'convention', 'updated_at timestamptz (dictionary convention)', 'absent');
  if (e.notes.some((n) => /triggers reject update and delete/.test(n))) {
    const ok = t.triggers.some((x) => /UPDATE/.test(x.def)) && t.triggers.some((x) => /DELETE/.test(x.def));
    if (!ok) add(e.table, '', 'invariant missing', 'triggers reject update and delete', t.triggers.map((x) => x.name).join(', '));
    else matches.immutable.push(e.table);
  }
  const section = e.section ?? '';
  const phiSection = /\(PHI\)|PHI references|PHI-adjacent; confidential/.test(section);
  const noPhiSection = /no PHI by design/.test(section);
  if (/\(PHI\)/.test(section) && !t.registry && !t.practiceId?.includes('NULL')) add(e.table, '', 'classification', `${section}: a PHI table with a registry row`, t.classification);
  if (noPhiSection && t.registry) add(e.table, '', 'classification', section, `${t.classification}: practice_id NOT NULL and a phi_table_registry row`);
  if (!phiSection && !noPhiSection && t.registry === null && t.practiceId === 'uuid NOT NULL') add(e.table, '', 'classification', section, t.classification);
}

/**
 * Attaches the reviewed explanation to each divergence, and lists what --strict refuses: a divergence
 * that is not informational with no explanation, an explanation of a divergence that no longer exists,
 * and a policy note naming a table or policy that does not exist (explanations cannot go stale).
 */
export function explain(divergences: readonly Unexplained[], explanations: Explanations, model: Model): { divergences: Divergence[]; strictProblems: string[] } {
  const strictProblems: string[] = [];
  const explained = new Map(Object.entries(explanations.rows));
  for (const k of explained.keys()) if (!divergences.some((d) => d.key === k)) strictProblems.push(`explanation for a divergence that no longer exists: ${k}`);
  const out = divergences.map((d): Divergence => {
    const ex = explained.get(d.key);
    if (!ex && !INFORMATIONAL.has(d.kind)) strictProblems.push(`no reviewed explanation for ${d.key}`);
    return { ...d, by: ex?.by ?? null, status: ex?.status ?? null, text: ex?.text ?? null };
  });
  for (const p of explanations.policies) {
    const t = model.byName.get(p.table);
    if (!t) {
      strictProblems.push(`policy note names table ${p.table}, which does not exist`);
      continue;
    }
    for (const name of p.policies) if (!t.policies.some((x) => x.name === name)) strictProblems.push(`policy note for ${p.table} names policy ${name}, which does not exist`);
  }
  return { divergences: out, strictProblems };
}
