import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MIGRATIONS_DIR } from '../migrate';
import { APPROVERS_LIST, notAName } from './approval';

/** The repository root (this file is packages/db/src/domain-model/sources.ts). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
/** The document CO-02 asks for, and what `--out` and `--check` default to. */
export const DOMAIN_MODEL_DOCUMENT = path.join(REPO_ROOT, 'docs/product/domain-model.md');

/** Who may sign the approval line (approvers.json); `--require-approval` reads it. */
export const APPROVERS_FILE = path.join(REPO_ROOT, APPROVERS_LIST);
export const APPROVERS_FORMAT = 'tp-domain-model-approvers/1';

/** What the generator reads besides the database: all text in the repository. */
export interface DomainModelSources {
  readonly migrationsDir: string;
  /** The Build Plan's Data dictionary tab, compared with the live schema. */
  readonly dictionaryPath: string;
  /** Which area each table belongs to (areas.json). */
  readonly areasPath: string;
  /** The reviewed explanation of each divergence (divergence-explanations.json). */
  readonly explanationsPath: string;
}

export const DEFAULT_SOURCES: DomainModelSources = {
  migrationsDir: MIGRATIONS_DIR,
  dictionaryPath: path.join(REPO_ROOT, 'docs/product/data-dictionary.md'),
  areasPath: path.resolve(import.meta.dirname, '../../domain-model/areas.json'),
  explanationsPath: path.resolve(import.meta.dirname, '../../domain-model/divergence-explanations.json'),
};

/**
 * A refusal the CLI exits 2 on: the area map or the explanations do not match the schema (a migration
 * added a table no area places, or `--strict` found an unexplained or stale divergence), or a data file
 * is malformed. A document that merely differs is not an error here; `--check` exits 1 on that.
 */
export class DomainModelError extends Error {
  override readonly name = 'DomainModelError';
}

export interface Area {
  readonly id: string;
  readonly title: string;
  /** The Data dictionary section the area corresponds to. */
  readonly dictionary: string;
  readonly about: string;
  readonly tables: readonly string[];
}

export interface AreaFile {
  /** Relations created outside the migration files (schema_migrations), with who creates them. */
  readonly createdOutsideMigrations: Readonly<Record<string, string>>;
  readonly areas: readonly Area[];
}

export interface RowExplanation {
  readonly by: string;
  readonly status: string;
  readonly text: string | null;
}

export interface PolicyExplanation {
  readonly table: string;
  readonly policies: readonly string[];
  readonly by: string;
  readonly status: string;
  readonly text: string;
}

export interface PlanDisagreement {
  readonly subject: string;
  readonly where: string;
  readonly says: string;
  readonly schema: string;
  readonly status: string;
}

export interface Explanations {
  /** Keyed `table|field|kind`, exactly as the comparison computes them. */
  readonly rows: Readonly<Record<string, RowExplanation>>;
  readonly policies: readonly PolicyExplanation[];
  readonly plan: readonly PlanDisagreement[];
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file: string): Json {
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isObject(value)) throw new DomainModelError(`${file}: expected a JSON object`);
  return value;
}

function text(file: string, where: string, value: unknown): string {
  if (typeof value !== 'string') throw new DomainModelError(`${file}: ${where} must be a string`);
  return value;
}

function texts(file: string, where: string, value: unknown): string[] {
  if (!Array.isArray(value)) throw new DomainModelError(`${file}: ${where} must be a list of strings`);
  return value.map((item, i) => text(file, `${where}[${String(i)}]`, item));
}

function objects(file: string, where: string, value: unknown): Json[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isObject)) throw new DomainModelError(`${file}: ${where} must be a list of objects`);
  return value;
}

function record(file: string, where: string, value: unknown): Json {
  if (value === undefined) return {};
  if (!isObject(value)) throw new DomainModelError(`${file}: ${where} must be an object`);
  return value;
}

export function readAreaFile(file: string): AreaFile {
  const json = readJson(file);
  const outside = record(file, 'createdOutsideMigrations', json.createdOutsideMigrations);
  return {
    createdOutsideMigrations: Object.fromEntries(Object.entries(outside).map(([k, v]) => [k, text(file, `createdOutsideMigrations.${k}`, v)])),
    areas: objects(file, 'areas', json.areas).map((a, i) => ({
      id: text(file, `areas[${String(i)}].id`, a.id),
      title: text(file, `areas[${String(i)}].title`, a.title),
      dictionary: text(file, `areas[${String(i)}].dictionary`, a.dictionary),
      about: text(file, `areas[${String(i)}].about`, a.about),
      tables: texts(file, `areas[${String(i)}].tables`, a.tables),
    })),
  };
}

export function readExplanations(file: string): Explanations {
  const json = readJson(file);
  const rows = record(file, 'rows', json.rows);
  return {
    rows: Object.fromEntries(
      Object.entries(rows).map(([key, value]) => {
        const row = record(file, `rows["${key}"]`, value);
        return [key, { by: text(file, `rows["${key}"].by`, row.by), status: text(file, `rows["${key}"].status`, row.status), text: row.text === undefined ? null : text(file, `rows["${key}"].text`, row.text) }];
      }),
    ),
    policies: objects(file, 'policies', json.policies).map((p, i) => ({
      table: text(file, `policies[${String(i)}].table`, p.table),
      policies: texts(file, `policies[${String(i)}].policies`, p.policies),
      by: text(file, `policies[${String(i)}].by`, p.by),
      status: text(file, `policies[${String(i)}].status`, p.status),
      text: text(file, `policies[${String(i)}].text`, p.text),
    })),
    plan: objects(file, 'plan', json.plan).map((p, i) => ({
      subject: text(file, `plan[${String(i)}].subject`, p.subject),
      where: text(file, `plan[${String(i)}].where`, p.where),
      says: text(file, `plan[${String(i)}].says`, p.says),
      schema: text(file, `plan[${String(i)}].schema`, p.schema),
      status: text(file, `plan[${String(i)}].status`, p.status),
    })),
  };
}

/**
 * The approver list: `format`, a `note` and `approvers`, each a person's name as it is signed, with no
 * spaces at either end and none that notAName refuses, so a placeholder cannot be listed to pass.
 */
export function readApprovers(file: string = APPROVERS_FILE): string[] {
  const json = readJson(file);
  if (json.format !== APPROVERS_FORMAT) throw new DomainModelError(`${file}: format must be "${APPROVERS_FORMAT}"`);
  text(file, 'note', json.note);
  return texts(file, 'approvers', json.approvers).map((name, i) => {
    const reason = notAName(name) ?? (name === name.trim() ? null : 'has spaces at either end');
    if (reason !== null) throw new DomainModelError(`${file}: approvers[${String(i)}] ${reason}`);
    return name;
  });
}
