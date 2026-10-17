#!/usr/bin/env node
/**
 * compare-dictionary.mjs: compare docs/product/data-dictionary.md (the Build Plan's Data dictionary tab)
 * with the JSON that introspect-schema.mjs wrote from the live schema, table by table and field by field.
 *
 * Usage: node compare-dictionary.mjs --dictionary <data-dictionary.md> --model <domain-model.generated.json> --out <divergences.md> [--json <divergences.json>]
 *
 * The dictionary lists KEY fields, not every column, so "extra in the schema" is informational; "missing",
 * "retyped", "enumeration", "encryption", "nullability", "unique", "index" and "policy" rows are divergences.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { dictionary: { type: 'string' }, model: { type: 'string' }, out: { type: 'string' }, json: { type: 'string' } }, strict: true });
if (!args.dictionary || !args.model || !args.out) {
  process.stderr.write('usage: node compare-dictionary.mjs --dictionary FILE --model FILE --out FILE\n');
  process.exit(2);
}
const md = readFileSync(args.dictionary, 'utf8');
const model = JSON.parse(readFileSync(args.model, 'utf8'));
const live = new Map(model.tables.map((t) => [t.name, t]));

// ------------------------------------------------------------------------------------------
// Parse the dictionary
// ------------------------------------------------------------------------------------------
/** Split on commas and semicolons at depth 0 (outside parentheses and backticks). */
function splitTop(s) {
  const parts = [];
  let depth = 0, tick = false, cur = '';
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (!tick && ch === '(') depth++;
    if (!tick && ch === ')') depth--;
    if (!tick && depth === 0 && (ch === ',' || ch === ';')) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseField(item) {
  // e.g. "`kind` (group, firm, internal)", "`units numeric(9,3)`", "unique `(a, b)`", "`patient_control_number` (enc)"
  const m = /^(unique\s+)?`([^`]+)`\s*(?:\(([^)]*(?:\([^)]*\)[^)]*)*)\))?\s*(.*)$/.exec(item);
  if (!m) return { raw: item, note: item };
  const [, uniq, tok, paren, rest] = m;
  if (uniq || tok.startsWith('(')) return { unique: tok.replace(/[()]/g, '').split(',').map((x) => x.trim()) };
  const [name, ...typeParts] = tok.split(/\s+/);
  const f = { name, type: typeParts.join(' ') || null, paren: paren ?? null, rest: rest || null };
  if (paren) {
    const p = paren.trim();
    if (/^enc$/i.test(p)) f.enc = true;
    else if (/^nullable/i.test(p) || /or null$/i.test(p)) f.nullable = true;
    else if (/^jsonb:/i.test(p)) { f.type = 'jsonb'; f.jsonbNote = p.slice(6).trim(); }
    else if (/^bool$/i.test(p)) f.type = 'boolean';
    else if (/^[a-z0-9_]+(\s*,\s*[a-z0-9_]+)+$/i.test(p) && !/\s[a-z]/i.test(p.replace(/,\s*/g, ','))) f.enumeration = p.split(',').map((x) => x.trim());
    else f.note = p;
  }
  return f;
}

const entries = []; // { tables: [..], section, purpose, fields: [...], uniques: [...], policy, notes: [...] }
let section = null;
for (const line of md.split('\n')) {
  const h = /^## (.*)$/.exec(line);
  if (h) { section = h[1].trim(); continue; }
  if (!line.startsWith('| `')) continue;
  const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
  const tables = [...cells[0].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
  const purpose = cells[1];
  let keyFields = cells[2] ?? '';
  const policy = cells[3] ?? null;
  const notes = [];
  const perTable = {};
  // Special shapes
  if (tables.includes('usage_snapshot')) {
    const idx = keyFields.indexOf('`usage_snapshot` rows:');
    perTable.usage_snapshot = keyFields.slice(idx + '`usage_snapshot` rows:'.length);
    notes.push(keyFields.slice(0, idx).trim());
    keyFields = '';
  }
  if (/^pg-boss tables plus/.test(keyFields)) { notes.push('pg-boss tables plus'); keyFields = keyFields.replace(/^pg-boss tables plus\s*/, ''); }
  const parse = (kf) => {
    const fields = [], uniques = [], extra = [];
    for (const item of splitTop(kf)) {
      if (!item) continue;
      if (!item.includes('`')) { extra.push(item); continue; }
      const f = parseField(item);
      if (f.unique) uniques.push(f.unique);
      else if (f.name) fields.push(f);
      else extra.push(item);
    }
    return { fields, uniques, extra };
  };
  for (const t of tables) {
    const src = perTable[t] ?? keyFields;
    const parsed = parse(src);
    entries.push({ table: t, section, purpose, policy, ...parsed, notes: [...notes, ...parsed.extra] });
  }
}

// "Indexes that matter"
const idxSection = md.split('## Indexes that matter')[1] ?? '';
const wantedIndexes = [...idxSection.matchAll(/`([a-z_]+) \(([^)]*)\)([^`]*)`([^,`]*)/g)].map((m) => ({ table: m[1], cols: m[2].split(',').map((c) => c.trim()), predicate: m[3].trim() || null, note: m[4].trim() || null, raw: m[0] }));

// ------------------------------------------------------------------------------------------
// Compare
// ------------------------------------------------------------------------------------------
const STANDARD = new Set(['id', 'created_at', 'updated_at']);
const divergences = [];
const add = (table, field, kind, dictionary, schema, note = '') => divergences.push({ table, field, kind, dictionary, schema, note });

const tokens = (n) => n.split('_').filter(Boolean);
function similar(name, cols) {
  const t = new Set(tokens(name));
  return cols
    .map((c) => ({ c, score: tokens(c.name).filter((x) => t.has(x)).length / Math.max(t.size, tokens(c.name).length) }))
    .filter((x) => x.score >= 0.5 && x.c.name !== name)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.c.name);
}

function liveType(c) { return c.type; }
function typeMatches(dict, c) {
  const lt = liveType(c);
  const norm = (s) => s.replace(/\s+/g, '').toLowerCase().replace('timestamptz', 'timestampwithtimezone');
  return norm(dict) === norm(lt);
}

const dictTables = new Set(entries.map((e) => e.table));
for (const e of entries) {
  const t = live.get(e.table);
  if (!t) { add(e.table, '', 'missing table', `${e.section}: ${e.purpose}`, 'absent'); continue; }
  const byName = new Map(t.columns.map((c) => [c.name, c]));
  const used = new Set();
  for (const f of e.fields) {
    const c = byName.get(f.name);
    if (!c) {
      const sim = similar(f.name, t.columns);
      add(e.table, f.name, sim.length ? 'missing (possible rename)' : 'missing column', fieldText(f), sim.length ? `candidates: ${sim.join(', ')}` : 'absent');
      continue;
    }
    used.add(f.name);
    // type
    if (f.type && !typeMatches(f.type, c)) add(e.table, f.name, 'retyped', f.type, c.type);
    if (!f.type && /_cents$/.test(f.name) && c.type !== 'bigint') add(e.table, f.name, 'retyped', 'bigint (convention: _cents)', c.type);
    if (!f.type && /_at$/.test(f.name) && c.type !== 'timestamp with time zone') add(e.table, f.name, 'retyped', 'timestamptz (convention: _at)', c.type);
    if (!f.type && /(_on|_date)$/.test(f.name) && c.type !== 'date') add(e.table, f.name, 'retyped', 'date (convention: calendar date)', c.type);
    if (!f.type && /_id$/.test(f.name) && c.type !== 'uuid') add(e.table, f.name, 'type note (informational)', 'uuid (by the _id suffix)', c.type, 'an identifier from the source file, not a key, when text');
    if (!f.type && /_ids$/.test(f.name) && c.type !== 'uuid[]') add(e.table, f.name, 'retyped', 'uuid[] (by the _ids suffix)', c.type);
    if (f.note === 'jsonb' && c.type !== 'jsonb') add(e.table, f.name, 'retyped', 'jsonb', c.type);
    if (f.jsonbNote && c.type !== 'jsonb') add(e.table, f.name, 'retyped', `jsonb (${f.jsonbNote})`, c.type);
    // enumeration
    if (f.enumeration) {
      if (!c.enumeration) add(e.table, f.name, 'enumeration not enforced', f.enumeration.join(', '), `${c.type}, no CHECK list`);
      else {
        const missing = f.enumeration.filter((v) => !c.enumeration.includes(v));
        const extra = c.enumeration.filter((v) => !f.enumeration.includes(v));
        if (missing.length || extra.length) add(e.table, f.name, 'enumeration differs', f.enumeration.join(', '), c.enumeration.join(', '), `${missing.length ? 'dictionary only: ' + missing.join(', ') : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? 'schema only: ' + extra.join(', ') : ''}`);
      }
    }
    // encryption
    if (f.enc && !c.encrypted) add(e.table, f.name, 'encryption', '(enc)', 'no enc:v1 CHECK');
    if (!f.enc && c.encrypted) add(e.table, f.name, 'encryption', 'not marked (enc)', 'enc:v1 CHECK');
    // nullability
    if (f.nullable && c.notNull) add(e.table, f.name, 'nullability', 'nullable', 'NOT NULL');
    if (f.name === 'practice_id' && !f.nullable && !c.notNull) add(e.table, f.name, 'nullability', 'NOT NULL (PHI convention)', 'nullable');
  }
  // encrypted live columns not marked in the dictionary and not listed at all
  for (const c of t.columns) if (c.encrypted && !e.fields.some((f) => f.name === c.name)) add(e.table, c.name, 'encryption', 'not listed', 'enc:v1 CHECK (extra encrypted column)');
  // uniques
  for (const u of e.uniques) {
    const has = t.uniques.some((x) => sameSet(x.cols, u)) || t.indexes.some((i) => i.unique && sameSet(indexCols(i.def), u));
    if (!has) {
      const near = [...t.uniques.map((x) => `${x.name} (${x.cols.join(', ')})`), ...t.indexes.filter((i) => i.unique && !i.primary).map((i) => `${i.name} ${indexDefShort(i.def)}`)];
      add(e.table, `unique (${u.join(', ')})`, 'unique differs', `unique (${u.join(', ')})`, near.join('; ') || 'no unique constraint');
    }
  }
  // extra columns (informational)
  const extra = t.columns.filter((c) => !used.has(c.name) && !STANDARD.has(c.name) && !e.fields.some((f) => f.name === c.name));
  if (extra.length) add(e.table, '', 'extra columns (informational)', '-', extra.map((c) => `${c.name} ${c.type}${c.notNull ? '' : ' null'}`).join(', '));
  // conventions
  if (!t.columns.some((c) => c.name === 'created_at')) add(e.table, 'created_at', 'convention', 'created_at timestamptz', 'absent');
  if (!t.columns.some((c) => c.name === 'updated_at')) add(e.table, 'updated_at', 'convention (informational)', 'updated_at timestamptz', 'absent');
  // global content
  if (/^Global content/.test(e.section ?? '')) {
    const app = t.privileges.tp_app ?? [];
    if (t.columns.some((c) => c.name === 'practice_id')) add(e.table, 'practice_id', 'global table has practice_id', 'none', 'present');
    if (app.some((p) => /INSERT|UPDATE|DELETE/.test(p))) add(e.table, '', 'global privileges', 'tp_app read-only', app.join(', '));
  }
  // PHI sections
  if (/\(PHI\)|PHI references/.test(e.section ?? '') && !t.registry && t.name !== 'model_call' && t.name !== 'eval_example') add(e.table, '', 'registry', 'PHI table (registry row expected)', t.classification);
  // triggers reject update and delete
  if (e.notes.some((n) => /triggers reject update and delete/.test(n))) {
    const ok = t.triggers.some((x) => /UPDATE/.test(x.def)) && t.triggers.some((x) => /DELETE/.test(x.def));
    if (!ok) add(e.table, '', 'invariant trigger', 'triggers reject update and delete', t.triggers.map((x) => x.name).join(', '));
  }
}

function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }
function indexCols(def) { const m = /\(([^)]*)\)/.exec(def.replace(/^.*USING \w+ /, '')); return m ? m[1].split(',').map((x) => x.trim().replace(/ (DESC|ASC)$/i, '')) : []; }
function indexDefShort(def) { return def.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ USING \w+ /, ''); }
function fieldText(f) { return `${f.name}${f.type ? ' ' + f.type : ''}${f.paren ? ' (' + f.paren + ')' : ''}`; }

// Indexes that matter
for (const w of wantedIndexes) {
  const t = live.get(w.table);
  if (!t) { add(w.table, `index (${w.cols.join(', ')})`, 'index (table absent)', w.raw, 'absent'); continue; }
  const wantCols = w.cols.map((c) => c.replace(/ (desc|asc)$/i, ''));
  const match = t.indexes.find((i) => {
    const cols = indexCols(i.def);
    return wantCols.every((c, k) => cols[k] === c);
  });
  if (!match) {
    const lead = t.indexes.filter((i) => indexCols(i.def)[0] === wantCols[0]).map((i) => `${i.name} ${indexDefShort(i.def)}`);
    add(w.table, `index (${w.cols.join(', ')})${w.predicate ? ' ' + w.predicate : ''}`, 'index missing', w.raw, lead.join('; ') || 'no index with that leading column');
  } else {
    const desc = /desc/i.test(w.cols.join(' '));
    const issues = [];
    if (desc && !/DESC/.test(match.def)) issues.push('not DESC');
    if (w.predicate && !/WHERE/.test(match.def)) issues.push('no partial predicate');
    if (issues.length) add(w.table, `index (${w.cols.join(', ')})`, 'index differs', w.raw, `${match.name} ${indexDefShort(match.def)} (${issues.join(', ')})`);
  }
}

// Tables in the schema not in the dictionary
for (const t of model.tables) {
  if (!dictTables.has(t.name)) add(t.name, '', 'extra table', 'not in the data dictionary', `${t.classification}${t.registry ? '; registered by ' + t.registry.registeredBy : ''}`);
}

// ------------------------------------------------------------------------------------------
// Output
// ------------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const lines = ['# Data dictionary against the live schema (generated)', '', `Dictionary: ${args.dictionary}`, `Schema: ${model.meta.head} at commit ${model.meta.commit}`, '', `Divergence rows: ${divergences.length}`, ''];
const counts = {};
for (const d of divergences) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
lines.push('| Kind | Count |', '| --- | --- |', ...Object.entries(counts).sort().map(([k, v]) => `| ${k} | ${v} |`), '');
lines.push('| Table | Field | Kind | Dictionary | Live schema | Note |', '| --- | --- | --- | --- | --- | --- |');
for (const d of divergences) lines.push(`| \`${d.table}\` | ${d.field ? '`' + esc(d.field) + '`' : ''} | ${d.kind} | ${esc(d.dictionary)} | ${esc(d.schema)} | ${esc(d.note)} |`);
writeFileSync(args.out, lines.join('\n') + '\n');
if (args.json) writeFileSync(args.json, JSON.stringify({ entries, wantedIndexes, divergences }, null, 2));
process.stdout.write(`wrote ${args.out}: ${divergences.length} rows\n${JSON.stringify(counts, null, 1)}\n`);
