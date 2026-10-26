import { readFileSync } from 'node:fs';

import pg from 'pg';

import { OWNER_ROLE, managedRoles } from '../roles';
import { documentSha256, provenanceProblems } from './approval';
import { type Catalog, readCatalog } from './catalog-reads';
import { crossCheck } from './cross-check';
import { INFORMATIONAL, compareWithDictionary, explain, parseDictionary } from './dictionary';
import { renderFunctionFiles } from './functions';
import { readMigrationText } from './migration-text';
import { areaProblems, buildModel } from './model';
import { renderDocument } from './render';
import { DEFAULT_SOURCES, DomainModelError, type DomainModelSources, readAreaFile, readExplanations } from './sources';

/**
 * docs/product/domain-model.md (Change Order 001, CO-02), generated from a LIVE database migrated with
 * `pnpm db:migrate`: tables, keys, the PHI flag, row-level security, invariants and privileges, by
 * area, with every divergence from the Data dictionary tab and its reviewed explanation.
 *
 * It only reads the database: one READ ONLY transaction over the catalog and the two catalog-data
 * tables (catalog-reads.ts), then the Drizzle and catalog cross-checks. It reads as text the migration
 * files, the Data dictionary, the area map and the explanations. The output is deterministic: no
 * database name, no timestamp, no collation-dependent order; the commit and branch go on the
 * provenance line, which `--check` and the approval hash ignore.
 *
 * From the same catalog read, in the same READ ONLY transaction, it also renders the function files (functions.ts,
 * docs/adr/0068): one file per function name, its definition, owner and privileges, which `--out` writes to
 * packages/db/functions. The document's renderer ignores what only the files print, so the document's text
 * is the same with them as without.
 */
export interface GenerateOptions extends Partial<DomainModelSources> {
  readonly databaseUrl: string;
  /** Refuse (DomainModelError) when a divergence lacks an explanation or an explanation is stale. */
  readonly strict?: boolean;
  /**
   * The provenance line; 'unknown' when absent. A commit is 7 to 40 lower-case hexadecimal digits and a
   * branch a git ref name in letters, digits, ".", "_", "/" and "-" (provenanceProblems): anything else is
   * refused, since the comparison skips the line only in that shape.
   */
  readonly commit?: string;
  readonly branch?: string;
  /** The provenance line says the generator's inputs had uncommitted changes. */
  readonly uncommitted?: boolean;
}

export interface GeneratedDomainModel {
  /** The document, its approval line awaiting a name and a date. */
  readonly text: string;
  /** The document SHA-256 an approval of this text carries. */
  readonly sha256: string;
  /** The migration head the database is at. */
  readonly head: string | null;
  /** One line: tables, views, registered tables, divergences and explanation problems. */
  readonly summary: string;
  /** What --strict refuses; empty when every divergence is explained and no explanation is stale. */
  readonly strictProblems: readonly string[];
  /** The model as JSON, for --json. */
  readonly json: string;
  /** The function files, file name (`<name>.sql`) to content, in C order of the names (functions.ts). */
  readonly functionFiles: ReadonlyMap<string, string>;
}

export async function generateDomainModel(options: GenerateOptions): Promise<GeneratedDomainModel> {
  // The provenance is checked before the database is read, so a bad --commit or --branch exits 2 first.
  const provenance = { commit: options.commit ?? '', branch: options.branch ?? '', uncommitted: options.uncommitted === true };
  const wrong = provenanceProblems(provenance);
  if (wrong.length) throw new DomainModelError(`the provenance line cannot be written: ${wrong.join('; ')} (give --commit SHA and --branch NAME in that form)`);

  return generateFromCatalog(await readDatabase(options.databaseUrl), options);
}

/** What readDatabase reads: the catalog and the cross-checks' report. */
export interface DatabaseRead {
  readonly catalog: Catalog;
  readonly crossCheckReport: string;
}

/**
 * The document and the function files from a catalog already read (generateDomainModel's second half, apart so a
 * test can render the document from a catalog changed in memory: docs/adr/0068's "the document is the same with the
 * function files as without").
 */
export function generateFromCatalog(read: DatabaseRead, options: Omit<GenerateOptions, 'databaseUrl'>): GeneratedDomainModel {
  const { catalog, crossCheckReport } = read;
  const sources: DomainModelSources = { ...DEFAULT_SOURCES, ...definedOnly(options) };
  const provenance = { commit: options.commit ?? '', branch: options.branch ?? '', uncommitted: options.uncommitted === true };
  const wrong = provenanceProblems(provenance);
  if (wrong.length) throw new DomainModelError(`the provenance line cannot be written: ${wrong.join('; ')} (give --commit SHA and --branch NAME in that form)`);

  const migrations = readMigrationText(sources.migrationsDir);
  const areaFile = readAreaFile(sources.areasPath);
  const model = buildModel(catalog, migrations, areaFile);
  const { areaOf, problems } = areaProblems(areaFile.areas, model);
  if (problems.length) throw new DomainModelError(`the area map does not match the schema:\n  ${problems.join('\n  ')}`);
  const functionFiles = renderFunctionFiles(catalog);

  const dictionary = parseDictionary(readFileSync(sources.dictionaryPath, 'utf8'));
  const compared = compareWithDictionary(model, dictionary);
  const explanations = readExplanations(sources.explanationsPath);
  const { divergences, strictProblems } = explain(compared.divergences, explanations, model);
  if (options.strict && strictProblems.length) throw new DomainModelError(`--strict:\n  ${strictProblems.join('\n  ')}`);

  const text = renderDocument({
    catalog,
    migrations,
    model,
    areas: areaFile.areas,
    areaOf,
    dictionary,
    divergences,
    matches: compared.matches,
    explanations,
    crossCheck: crossCheckReport,
    provenance,
  });
  const tables = model.tables.filter((t) => !t.isView);
  const toApprove = divergences.filter((d) => !INFORMATIONAL.has(d.kind));
  return {
    text,
    sha256: documentSha256(text),
    head: catalog.meta.head,
    summary: `${String(tables.length)} tables, ${String(model.tables.length - tables.length)} views, ${String(tables.filter((t) => t.registry).length)} registered, ${String(divergences.length)} divergence rows (${String(toApprove.length)} to approve), ${String(strictProblems.length)} explanation problem(s)`,
    strictProblems,
    json:
      JSON.stringify(
        {
          meta: { ...catalog.meta, commit: options.commit ?? null, branch: options.branch ?? null, uncommitted: options.uncommitted === true },
          registry: catalog.registry,
          roles: catalog.roles,
          tables: model.tables,
          functions: model.functions,
          divergences,
          matches: compared.matches,
        },
        null,
        2,
      ) + '\n',
    functionFiles,
  };
}

/** The catalog and the cross-checks, in one READ ONLY transaction that is rolled back. */
export async function readDatabase(databaseUrl: string): Promise<DatabaseRead> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // What pg_get_expr, pg_get_viewdef, pg_get_functiondef, regprocedure, quote_ident and format_type print depends on
    // these; pin them, each at PostgreSQL's default, so a database's or role's own setting never shows. quote_all_identifiers
    // quotes every name; standard_conforming_strings decides how a backslash in a literal prints (and functions.ts's
    // literal() assumes it on); extra_float_digits and bytea_output decide how a float or bytea default prints.
    await client.query('SET LOCAL search_path = public');
    await client.query("SET LOCAL IntervalStyle = 'postgres'");
    await client.query("SET LOCAL DateStyle = 'ISO, MDY'");
    await client.query("SET LOCAL TimeZone = 'UTC'");
    await client.query('SET LOCAL quote_all_identifiers = off');
    await client.query('SET LOCAL standard_conforming_strings = on');
    await client.query('SET LOCAL extra_float_digits = 1');
    await client.query("SET LOCAL bytea_output = 'hex'");
    const catalog = await readCatalog(client, { managedRoles: managedRoles({ devLogin: false }), ownerRole: OWNER_ROLE });
    const crossCheckReport = await crossCheck(client);
    await client.query('ROLLBACK');
    return { catalog, crossCheckReport };
  } finally {
    await client.end();
  }
}

function definedOnly(options: Partial<DomainModelSources>): Partial<DomainModelSources> {
  return Object.fromEntries(
    (['migrationsDir', 'dictionaryPath', 'areasPath', 'explanationsPath'] as const).filter((key) => options[key] !== undefined).map((key) => [key, options[key]]),
  );
}
