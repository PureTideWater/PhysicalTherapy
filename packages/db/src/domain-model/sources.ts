import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MIGRATIONS_DIR } from '../migrate';
import { APPROVERS_LIST, notAName } from './approval';

/** The repository root (this file is packages/db/src/domain-model/sources.ts). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
/** The document CO-02 asks for, and what `--out` and `--check` default to. */
export const DOMAIN_MODEL_DOCUMENT = path.join(REPO_ROOT, 'docs/product/domain-model.md');

/**
 * The function files (functions.ts, docs/adr/0068), and what `--out` writes them to and `--check` compares by
 * default: an output of the generator, beside the migrations.
 */
export const FUNCTIONS_DIRECTORY = path.join(REPO_ROOT, 'packages/db/functions');

/**
 * The generator's inputs as git pathspecs, for the provenance line's "with uncommitted changes to its inputs":
 * its code, the migrations, the Drizzle schema, its data files and the Data dictionary. The function files are
 * under packages/db but are an output, not an input, so they are excluded: regenerating them must not mark the
 * document as generated from uncommitted inputs.
 */
export const GENERATOR_INPUTS = ['packages/db', 'docs/product/data-dictionary.md', ':(exclude)packages/db/functions'] as const;

/** Who may sign the approval line (approvers.json); `--require-approval` reads it. */
export const APPROVERS_FILE = path.join(REPO_ROOT, APPROVERS_LIST);
export const APPROVERS_FORMAT = 'tp-domain-model-approvers/2';

/** A GitHub login as GitHub issues them: letters, digits and single hyphens inside, at most 39 characters. */
export const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** One approver: the name as it is signed on the approval line, and the GitHub login whose review is the approval of record. */
export interface ApproverRecord {
  readonly name: string;
  readonly github: string;
}

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
 * The approver list: `format`, a `note` and `approvers`, each `{ "name", "github" }`: a person's name as it
 * is signed, with no spaces at either end and none that notAName refuses, so a placeholder cannot be listed
 * to pass, and the GitHub login whose APPROVED review is the approval of record (docs/adr/0063). A name or a
 * login (in any case, as GitHub compares them) listed twice, or an entry with any other field, is refused.
 */
export function readApproverRecords(file: string = APPROVERS_FILE): ApproverRecord[] {
  const json = readJson(file);
  if (json.format !== APPROVERS_FORMAT) throw new DomainModelError(`${file}: format must be "${APPROVERS_FORMAT}"`);
  text(file, 'note', json.note);
  if (!Array.isArray(json.approvers)) throw new DomainModelError(`${file}: approvers must be a list of objects`);
  const records = objects(file, 'approvers', json.approvers).map((entry, i) => {
    const where = `approvers[${String(i)}]`;
    const extra = Object.keys(entry).filter((key) => key !== 'name' && key !== 'github');
    if (extra.length) throw new DomainModelError(`${file}: ${where} has fields other than name and github: ${extra.join(', ')}`);
    const name = text(file, `${where}.name`, entry.name);
    const reason = notAName(name) ?? (name === name.trim() ? null : 'has spaces at either end');
    if (reason !== null) throw new DomainModelError(`${file}: ${where}.name ${reason}`);
    const github = text(file, `${where}.github`, entry.github);
    if (!GITHUB_LOGIN.test(github)) throw new DomainModelError(`${file}: ${where}.github is not a GitHub login (letters, digits and single hyphens, at most 39)`);
    return { name, github };
  });
  records.forEach((record, i) => {
    if (records.findIndex((r) => r.name === record.name) !== i) throw new DomainModelError(`${file}: approvers[${String(i)}].name is listed twice`);
    if (records.findIndex((r) => r.github.toLowerCase() === record.github.toLowerCase()) !== i) throw new DomainModelError(`${file}: approvers[${String(i)}].github is listed twice`);
  });
  return records;
}

/** The names on the approver list, as the approval line must give one (readApproverRecords). */
export function readApprovers(file: string = APPROVERS_FILE): string[] {
  return readApproverRecords(file).map((record) => record.name);
}
