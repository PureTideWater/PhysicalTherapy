import { type Catalog, type FunctionAclRow, type FunctionRow } from './catalog-reads';
import { bodySha256 } from './model';
import { DomainModelError } from './sources';

/**
 * The function files (docs/adr/0068; the combined audit's item 111): one generated file per function name in schema
 * public, `packages/db/functions/<name>.sql`, written by `pnpm db:domain-model --out` beside the domain model
 * document and checked by `--check` and the drift case in the same way. A migration that changes a function copies
 * the whole CREATE OR REPLACE into a new file, and Appendix C shows the body only as a hash, so without these files a
 * reviewer sees forty new lines and has to find the previous definition by hand; with them, the pull request shows
 * exactly which lines of which function changed, and `git log -p` on a file is that function's whole history.
 *
 * Each file holds every overload of its name, in the C order of their signatures, and for each:
 *
 *   - a header: the signature exactly as Appendix C prints it; the body's SHA-256 as Appendix C prints it (the same
 *     bodySha256 as model.ts, labelled for what it covers: the body only, never the header or the grants; "the text
 *     between the dollar quotes only", or for a SQL-standard body, which has none, "the SQL-standard body only, from
 *     RETURN or BEGIN ATOMIC"), and
 *     "Trigger function of" with one `table.trigger` per line in C order, so a new trigger adds exactly one line;
 *   - the definition as pg_get_functiondef prints it (arguments with defaults, return type, language, volatility,
 *     SECURITY DEFINER, LEAKPROOF, strictness, parallel safety, cost, rows, every SET, and the body as the catalog
 *     holds it), its one trailing newline taken off and a semicolon put on, so the file is SQL that would recreate it;
 *   - the owner, as ALTER FUNCTION ... OWNER TO;
 *   - the privileges, every line explicit: REVOKE ALL ... FROM PUBLIC when PUBLIC holds no EXECUTE and GRANT EXECUTE
 *     ... TO PUBLIC when it does, so opening a function to everyone adds a line; one GRANT per other grantee in C
 *     order, WITH GRANT OPTION where it is grantable and GRANTED BY where the grantor is not the owner; REVOKE EXECUTE
 *     ... FROM the owner when the owner revoked its own;
 *   - COMMENT ON FUNCTION when there is a comment.
 *
 * Deterministic: no timestamp, commit, database name or OID, and every order is C order over the catalog's text,
 * whatever order the rows arrive in. The definitions are read under the generator's pinned search_path, DateStyle,
 * IntervalStyle and TimeZone (generate.ts), so the connection's own settings do not show; what pg_get_functiondef
 * prints does depend on the PostgreSQL major version, as the document already does.
 *
 * Refused (DomainModelError, exit 2), never guessed: a name outside `^[a-z_][a-z0-9_]*$` or longer than 63 bytes,
 * so no name can leave the directory or collide with another by case, and an aggregate, which pg_get_functiondef
 * cannot print. A member of an extension is left out: its definition belongs to the extension's version.
 *
 * The banner avoids the conventional "generated" markers that make GitHub collapse a diff: these diffs exist to be
 * read.
 */
export const FUNCTION_FILE_BANNER = [
  '-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).',
  '-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.',
] as const;

/** The hand-written file the directory keeps beside the generated ones; the generator never writes or removes it. */
export const FUNCTIONS_README = 'README.md';

/** A function name a file may be named after: lower-case letters, digits and underscores, at most 63 bytes. */
const FILE_NAME = /^[a-z_][a-z0-9_]*$/;
const MAX_NAME_BYTES = 63;

/** C order: by the strings' UTF-8 bytes, as COLLATE "C" sorts them. */
export const cOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

/** The keyword ALTER, GRANT and COMMENT take for a routine of this kind: PROCEDURE for a procedure, else FUNCTION. */
const routineKeyword = (kind: string): string => (kind === 'p' ? 'PROCEDURE' : 'FUNCTION');

/** A comment as an SQL string literal (standard_conforming_strings: only the quote is doubled). */
const literal = (text: string): string => `'${text.replace(/'/g, "''")}'`;

/** The ACL in C order by grantee (PUBLIC first) and then grantor, whatever order the catalog returned it in. */
function sortedAcl(acl: readonly FunctionAclRow[]): FunctionAclRow[] {
  return [...acl].sort((a, b) => {
    if (a.grantee === null || b.grantee === null) return a.grantee === b.grantee ? cOrder(a.grantor, b.grantor) : a.grantee === null ? -1 : 1;
    return cOrder(a.grantee, b.grantee) || cOrder(a.grantor, b.grantor) || Number(a.grantable) - Number(b.grantable);
  });
}

/** The privilege statements of one function (see the module comment). */
export function privilegeLines(f: Pick<FunctionRow, 'signature' | 'kind' | 'owner' | 'owner_ident' | 'acl'>): string[] {
  const target = `${routineKeyword(f.kind)} public.${f.signature}`;
  const acl = sortedAcl(f.acl);
  const grantedBy = (row: FunctionAclRow): string => (row.grantor === f.owner ? '' : ` GRANTED BY ${row.grantor_ident}`);
  const publicRows = acl.filter((row) => row.grantee === null);
  const lines: string[] = publicRows.length === 0 ? [`REVOKE ALL ON ${target} FROM PUBLIC;`] : publicRows.map((row) => `GRANT EXECUTE ON ${target} TO PUBLIC${grantedBy(row)};`);
  for (const row of acl) {
    // The owner's own EXECUTE is implicit in owning the function; only its absence is said, below.
    if (row.grantee === null || (row.grantee === f.owner && row.grantor === f.owner)) continue;
    lines.push(`GRANT EXECUTE ON ${target} TO ${row.grantee_ident}${row.grantable ? ' WITH GRANT OPTION' : ''}${grantedBy(row)};`);
  }
  if (!acl.some((row) => row.grantee === f.owner && row.grantor === f.owner)) lines.push(`REVOKE EXECUTE ON ${target} FROM ${f.owner_ident};`);
  return lines;
}

/** One overload as its file prints it: header, definition, owner, privileges and comment. */
function overloadText(f: FunctionRow, triggers: readonly string[]): string[] {
  if (f.definition === null) throw new Error(`pg_get_functiondef printed nothing for ${f.signature}`);
  const target = `${routineKeyword(f.kind)} public.${f.signature}`;
  return [
    `-- ${f.signature}`,
    `-- Body SHA-256 (${f.sql_standard_body ? 'the SQL-standard body only, from RETURN or BEGIN ATOMIC' : 'the text between the dollar quotes only'}), as Appendix C prints it: ${bodySha256(f.src).slice(0, 16)}`,
    ...(triggers.length === 0 ? ['-- Trigger function of: (none)'] : triggers.map((t) => `-- Trigger function of: ${t}`)),
    `${f.definition.endsWith('\n') ? f.definition.slice(0, -1) : f.definition};`,
    `ALTER ${target} OWNER TO ${f.owner_ident};`,
    ...privilegeLines(f),
    ...(f.comment === null ? [] : [`COMMENT ON ${target} IS ${literal(f.comment)};`]),
  ];
}

/** Why a function name cannot name a file, or null. */
export function fileNameProblem(name: string): string | null {
  if (!FILE_NAME.test(name)) return 'is not lower-case letters, digits and underscores starting with a letter or underscore';
  if (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) return `is longer than ${String(MAX_NAME_BYTES)} bytes`;
  return null;
}

/**
 * The function files, file name (`<name>.sql`) to content, in C order of the names, from the catalog's functions
 * and triggers (see the module comment).
 */
export function renderFunctionFiles(catalog: Pick<Catalog, 'functions' | 'triggers'>): Map<string, string> {
  const functions = catalog.functions.filter((f) => !f.extension_member);
  const aggregates = functions.filter((f) => f.kind === 'a').map((f) => f.signature);
  if (aggregates.length) {
    throw new DomainModelError(
      `the function files cannot render an aggregate: ${[...aggregates].sort(cOrder).join(', ')} (pg_get_functiondef raises on one); add support for aggregates to packages/db/src/domain-model/functions.ts before a migration creates one`,
    );
  }
  const unknown = functions.filter((f) => !['f', 'p', 'w'].includes(f.kind)).map((f) => `${f.signature} (prokind ${f.kind})`);
  if (unknown.length) throw new DomainModelError(`the function files cannot render ${[...unknown].sort(cOrder).join(', ')}`);
  const badNames = [...new Set(functions.map((f) => f.name))].flatMap((name) => {
    const problem = fileNameProblem(name);
    return problem === null ? [] : [`${JSON.stringify(name)} ${problem}`];
  });
  if (badNames.length) throw new DomainModelError(`a function name cannot name its file under packages/db/functions: ${badNames.sort(cOrder).join('; ')}`);

  const triggersOf = new Map<string, string[]>();
  for (const t of catalog.triggers) {
    const list = triggersOf.get(t.function_signature) ?? [];
    list.push(`${t.table_name}.${t.name}`);
    triggersOf.set(t.function_signature, list);
  }
  const byName = new Map<string, FunctionRow[]>();
  for (const f of functions) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);

  const files = new Map<string, string>();
  for (const name of [...byName.keys()].sort(cOrder)) {
    const overloads = [...(byName.get(name) ?? [])].sort((a, b) => cOrder(a.signature, b.signature));
    const blocks = overloads.map((f) => overloadText(f, [...(triggersOf.get(f.signature) ?? [])].sort(cOrder)).join('\n'));
    files.set(`${name}.sql`, `${[...FUNCTION_FILE_BANNER, '', blocks.join('\n\n')].join('\n')}\n`);
  }
  return files;
}
