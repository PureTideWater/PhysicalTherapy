import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readDatabaseUrl } from "./config";
import { MIGRATIONS_DIR, migrate, readMigrations } from "./migrate";
import { OWNER_ROLE, workerDevLoginUrl } from "./roles";
import {
  RowFactory,
  type ScratchDatabase,
  type TenantWorld,
  createScratchDatabase,
  createTenantWorld,
} from "./testing";

/**
 * The ROI statement's actionable-lines migration (schema PR 5, the ledger-freeze batch; docs/adr/0082 Decision 7) on
 * the head before it: the real file, applied as the runner applies one (one READ COMMITTED transaction, as tp_owner,
 * never a superuser) and through the runner itself. What it replaces and what it leaves; its preflight of the two
 * starting bodies; its preflight of every stored statement, one practice at a time, with its closing count under a
 * SHARE lock; and what the two granted bodies accept and refuse. Synthetic rows only.
 */

const SUFFIX = "_roi_statement_actionable_lines.sql";

/** The bodies the exception was granted on, and the granted ones: SHA-256 of pg_proc.prosrc. */
const GRANTED_ON = {
  "roi_links_valid(jsonb)":
    "49416713dd4d13ddf0766e35db60cc7306cebb8e06ee89ea7345beae2b5e51a3",
  "roi_statement_rules()":
    "5a8bc6319828acb29a7f57aad9ebd57501734a71826a1e4d1d6953db9e85965c",
} as const;
const GRANTED = {
  "roi_links_valid(jsonb)":
    "13c4dd46b9203095db8f26e124ed3652e5ec58bf5a46f0b28fd561b6cd1f2da4",
  "roi_statement_rules()":
    "ad925199131cb4117e43a97216f65c59ea09769f3bb0ee4f40f5b3bef748eca5",
} as const;
const SEARCH_PATH = "search_path=pg_catalog, public, pg_temp";
const HEADER_LINE = "plan_cache_mode=force_custom_plan";

/** A statement of zero figures in no one's name. A practice has one such statement a period (roi_statement_quarterly), so each gets a period of its own. */
const INSERT_STATEMENT = `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
  VALUES ($1, date '2020-01-01' + $3::int, date '2020-01-01' + $3::int, 'posted', 0, 0, 0, 0, 0, 0, $2::jsonb)`;
let periods = 0;
const nextPeriod = (): number => (periods += 1);
const FOUR_EMPTY = JSON.stringify({
  recovered: [],
  interest: [],
  approved_unposted: [],
  actionable_open: [],
});

interface Refusal {
  readonly code: string | undefined;
  readonly message: string;
  readonly constraint?: string | undefined;
}
type Outcome = "applied" | Refusal;

let migration = "";
let previousDir = "";
let withDir = "";
let previous: ScratchDatabase;
let head: pg.Client;
let job: pg.Client;
let factory: RowFactory;
/** Three practices in the order the preflight reads them (by id); the last is deleted before it holds the empty object. */
let worlds: TenantWorld[] = [];
const notices: string[] = [];

/** The one migration of the name `/new-migration roi_statement_actionable_lines` gives. */
function migrationName(): string {
  const found = readMigrations(MIGRATIONS_DIR)
    .map((candidate) => candidate.name)
    .filter((name) => name.endsWith(SUFFIX));
  if (found.length !== 1) {
    throw new Error(
      `expected one migration named <timestamp>${SUFFIX} in packages/db/migrations, found ${String(found.length)}`,
    );
  }
  return found[0] as string;
}

const file = () => readFileSync(path.join(MIGRATIONS_DIR, migration), "utf8");

/** A directory of the migrations before this one, and with `text` under this one's name when given. */
function migrationsDir(label: string, text?: string): string {
  const dir = mkdtempSync(
    path.join(tmpdir(), `roi-statement-actionable-lines-${label}-`),
  );
  for (const earlier of readMigrations(MIGRATIONS_DIR).filter(
    (candidate) => candidate.name < migration,
  )) {
    copyFileSync(
      path.join(MIGRATIONS_DIR, earlier.name),
      path.join(dir, earlier.name),
    );
  }
  if (text !== undefined) {
    writeFileSync(path.join(dir, migration), text);
  }
  return dir;
}

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  client.on("error", () => undefined);
  await client.connect();
  return client;
}

beforeAll(async () => {
  migration = migrationName();
  previousDir = migrationsDir("previous-head");
  withDir = migrationsDir("with", file());
  previous = await createScratchDatabase(readDatabaseUrl());
  await migrate({
    databaseUrl: previous.url,
    migrationsDir: previousDir,
    devLogin: true,
  });
  head = await connect(previous.url);
  head.on("notice", (notice) => notices.push(notice.message ?? ""));
  job = await connect(workerDevLoginUrl(previous.url));
  factory = await RowFactory.load(head);
  for (const label of ["north", "south", "east"]) {
    const world = await createTenantWorld(head, label);
    await factory.create(head, "roi_statement", world);
    worlds.push(world);
  }
  worlds = worlds.toSorted((a, b) => (a.practiceId < b.practiceId ? -1 : 1));
}, 120_000);

afterAll(async () => {
  await job?.end().catch(() => undefined);
  await head?.end().catch(() => undefined);
  await previous?.drop();
  for (const dir of [previousDir, withDir]) {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
  }
});

interface Opened {
  readonly isolation?: "REPEATABLE READ";
  /** Left as the connection's own role, a superuser: only to show that the preflight refuses it. */
  readonly asSuperuser?: boolean;
}

/** One transaction on the previous head as the runner opens it for a file (bounded lock waits, as tp_owner), rolled back. */
async function onPreviousHead<T>(
  run: () => Promise<T>,
  opened: Opened = {},
): Promise<T> {
  await head.query(
    opened.isolation === undefined
      ? "BEGIN"
      : `BEGIN ISOLATION LEVEL ${opened.isolation}`,
  );
  try {
    await head.query("SELECT set_config('lock_timeout', '5s', true)");
    if (opened.asSuperuser !== true) {
      await head.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    }
    return await run();
  } finally {
    await head.query("ROLLBACK");
  }
}

const refusalOf = (error: unknown): Refusal => {
  const { code, constraint } = error as { code?: string; constraint?: string };
  return constraint === undefined
    ? { code, message: (error as Error).message }
    : { code, message: (error as Error).message, constraint };
};

/** What a text answers when it is run whole: applied, or its refusal. */
const apply = (text: string = file()): Promise<Outcome> =>
  head.query(text).then(() => "applied" as const, refusalOf);

/** Everything the catalog holds of every function of the schema but its body's text, with the body's SHA-256 beside it. */
async function functions(): Promise<Map<string, Record<string, unknown>>> {
  const { rows } = await head.query<
    Record<string, unknown> & { signature: string }
  >(
    `SELECT p.oid::regprocedure::text AS signature, p.oid::int AS oid, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl, p.proconfig AS config,
            l.lanname AS language, p.prosecdef AS definer, p.provolatile AS volatility, p.proisstrict AS strict, p.proleakproof AS leakproof, p.proparallel AS parallel,
            p.procost::float8 AS cost, p.prorows::float8 AS result_rows, p.prokind AS kind, p.proretset AS returns_set, pg_get_function_result(p.oid) AS result,
            pg_get_function_arguments(p.oid) AS arguments, p.prosupport::text AS support, p.prosqlbody IS NULL AS body_as_text, obj_description(p.oid, 'pg_proc') AS comment,
            encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') AS body
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`,
  );
  return new Map(rows.map((row) => [row.signature, row]));
}

/**
 * Everything of tenant isolation and privilege the migration must leave alone: every policy, each relation's row
 * security and its FORCE setting, its owner and grants, every column grant, every trigger, every constraint's text,
 * every role with its attributes and memberships, and every index.
 */
async function isolationAndShape(): Promise<Record<string, unknown[]>> {
  const read = async (sql: string) => (await head.query(sql)).rows as unknown[];
  return {
    policies: await read(
      `SELECT c.relname, p.polname, p.polcmd, p.polpermissive, p.polroles::regrole[]::text AS roles, pg_get_expr(p.polqual, p.polrelid) AS using, pg_get_expr(p.polwithcheck, p.polrelid) AS checks
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid ORDER BY 1, 2`,
    ),
    relations: await read(
      `SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace ORDER BY 1`,
    ),
    columnGrants: await read(
      `SELECT c.relname, a.attname, a.attacl::text AS acl FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL ORDER BY 1, 2`,
    ),
    triggers: await read(
      `SELECT t.tgrelid::regclass::text AS relation, t.tgname, t.tgfoid::int AS function, t.tgtype, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace ORDER BY 1, 2`,
    ),
    constraints: await read(
      `SELECT k.conrelid::regclass::text AS relation, k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) AS definition
         FROM pg_constraint k WHERE k.connamespace = 'public'::regnamespace ORDER BY 1, 2`,
    ),
    roles: await read(
      `SELECT r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconfig,
              ARRAY(SELECT m.roleid::regrole::text || ':' || m.admin_option || m.inherit_option || m.set_option FROM pg_auth_members m WHERE m.member = r.oid ORDER BY 1) AS member_of
         FROM pg_roles r WHERE r.rolname LIKE 'tp\\_%' ORDER BY 1`,
    ),
    indexes: await read(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
    ),
  };
}

const bodies = async (): Promise<Record<string, unknown>> => {
  const all = await functions();
  return Object.fromEntries(
    Object.keys(GRANTED_ON).map((signature) => [
      signature,
      all.get(signature)?.body,
    ]),
  );
};

const scope = async (): Promise<string | null> =>
  (
    await head.query<{ scope: string | null }>(
      "SELECT current_setting('app.practice_ids', true) AS scope",
    )
  ).rows[0]?.scope ?? null;

/** What the database holds, read by a superuser, whom no policy binds: the test's own count. */
async function stored(
  client: pg.Client = head,
): Promise<{
  statements: number;
  practices: number;
  failing: number;
  inPractices: number;
}> {
  const { rows } = await client.query<{
    statements: number;
    practices: number;
    failing: number;
    in_practices: number;
  }>(
    `SELECT (SELECT count(*)::int FROM roi_statement) AS statements, (SELECT count(*)::int FROM practice) AS practices,
            (SELECT count(*)::int FROM roi_statement WHERE links = '{}') AS failing, (SELECT count(DISTINCT practice_id)::int FROM roi_statement WHERE links = '{}') AS in_practices`,
  );
  const row = rows[0] as (typeof rows)[number];
  return {
    statements: row.statements,
    practices: row.practices,
    failing: row.failing,
    inPractices: row.in_practices,
  };
}

/** A statement written in a practice's scope by the job's login: tp_app's privileges and no others, as the quarterly statement is. */
async function insertAsJob(
  client: pg.Client,
  practiceId: string,
  links: string,
  times = 1,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', '', true)",
      [`{${practiceId}}`],
    );
    for (let n = 0; n < times; n += 1) {
      await client.query(INSERT_STATEMENT, [practiceId, links, nextPeriod()]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** `text` with `find`, which is in it exactly `times` times, replaced by `put` each time. */
function altered(
  text: string,
  find: string,
  put: string,
  times: number,
): string {
  expect(text.split(find), find).toHaveLength(times + 1);
  return text.replaceAll(find, put);
}

const SCOPE_ONE = "set_config('app.practice_ids', ARRAY[ids[i]]::text, true)";
const EVERY_PRACTICE = "FOR i IN 1..n LOOP";

/** The file with its scan reading every practice but the last. */
function skippingTheLast(text: string): string {
  const at = text.indexOf(EVERY_PRACTICE);
  expect(text.split(EVERY_PRACTICE)).toHaveLength(3);
  return `${text.slice(0, at)}FOR i IN 1..n - 1 LOOP${text.slice(at + EVERY_PRACTICE.length)}`;
}

/** `text` without its closing loop, the second loop over every practice. */
function withoutTheClosingCount(text: string): string {
  const at = text.lastIndexOf(EVERY_PRACTICE);
  const end = text.indexOf("\n  END LOOP;\n", at);
  expect(at).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(at);
  const cut = text.slice(at, end);
  expect(cut).toContain("IF stored <> seen[i] THEN");
  return `${text.slice(0, at)}${text.slice(end + "\n  END LOOP;\n".length)}`;
}

const ID = "0b0f6f3a-58a5-4c0e-9d0f-0d7c1a9d2e11";

/** The note's 16 shapes of links and two more: what roi_links_valid answers, and what an insert in scope by the application's role gets. */
const SHAPES: readonly {
  name: string;
  links: string;
  valid: boolean;
  insert: "stored" | { code: string; by: "check" | "trigger" };
}[] = [
  {
    name: "four keys",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [ID],
      actionable_open: [ID],
    }),
    valid: true,
    insert: "stored",
  },
  {
    name: "five keys",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [ID],
      actionable_open: [ID],
      actionable_open_lines: [],
    }),
    valid: true,
    insert: "stored",
  },
  {
    name: "five keys, a linked line that is no priced line of the practice",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [],
      actionable_open: [ID],
      actionable_open_lines: [ID],
    }),
    valid: true,
    insert: { code: "23514", by: "trigger" },
  },
  {
    name: "a fifth key by another name",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [],
      actionable_open: [],
      actionable_lines: [],
    }),
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "three keys",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [],
    }),
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "the empty object",
    links: "{}",
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "an array",
    links: "[]",
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "a string",
    links: '"actionable_open_lines"',
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "a JSON null",
    links: "null",
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "a value that is no array, under a key the trigger reads",
    links: JSON.stringify({
      recovered: "x",
      interest: [],
      approved_unposted: [],
      actionable_open: [],
    }),
    valid: false,
    insert: { code: "22023", by: "trigger" },
  },
  {
    name: "a value that is no array, under the fifth key",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [],
      actionable_open: [],
      actionable_open_lines: {},
    }),
    valid: false,
    insert: { code: "22023", by: "trigger" },
  },
  {
    name: "an element that is no string",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [1],
      actionable_open: [],
    }),
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  // The trigger casts a recovered or interest ID only against a ledger entry of the practice: with none, as here, it
  // refuses the statement by its own rule (linked and found differ) and never reaches the cast; with entries the cast
  // refuses first, 22P02. Today's body does the same. The lines list is cast whatever the practice holds.
  {
    name: "a malformed ID under recovered, in a practice with no ledger entry",
    links: JSON.stringify({
      recovered: ["not-an-id"],
      interest: [],
      approved_unposted: [],
      actionable_open: [],
    }),
    valid: false,
    insert: { code: "23514", by: "trigger" },
  },
  {
    name: "a malformed ID under the fifth key",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [],
      actionable_open: [],
      actionable_open_lines: ["not-an-id"],
    }),
    valid: false,
    insert: { code: "22P02", by: "trigger" },
  },
  {
    name: "an upper-case ID",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [ID.toUpperCase()],
      actionable_open: [],
    }),
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "a braced ID",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [`{${ID}}`],
      actionable_open: [],
    }),
    valid: false,
    insert: { code: "23514", by: "check" },
  },
  {
    name: "four empty lists",
    links: FOUR_EMPTY,
    valid: true,
    insert: "stored",
  },
  {
    name: "five empty lists",
    links: JSON.stringify({
      recovered: [],
      interest: [],
      approved_unposted: [],
      actionable_open: [],
      actionable_open_lines: [],
    }),
    valid: true,
    insert: "stored",
  },
];

describe("the ROI statement actionable-lines migration (schema PR 5) on the previous head", () => {
  it("finds the two bodies the exception was granted on and puts the two granted bodies in their place, with the one header line: nothing else changes", async () => {
    expect(await bodies()).toEqual(GRANTED_ON);
    const shapeBefore = await isolationAndShape();
    await onPreviousHead(async () => {
      const before = await functions();
      expect(await apply()).toBe("applied");
      const after = await functions();
      expect([...after.keys()]).toEqual([...before.keys()]);
      const changed = [...after.keys()].filter(
        (signature) =>
          JSON.stringify(after.get(signature)) !==
          JSON.stringify(before.get(signature)),
      );
      expect(changed).toEqual(Object.keys(GRANTED));
      for (const signature of changed) {
        const {
          body: was,
          config: wasConfig,
          ...kept
        } = before.get(signature) as Record<string, unknown>;
        const {
          body: is,
          config,
          ...keeps
        } = after.get(signature) as Record<string, unknown>;
        // Identity, owner, grants, language, security, volatility, strictness, parallel safety and types are kept by both.
        expect(keeps, signature).toEqual(kept);
        expect(was, signature).toBe(
          GRANTED_ON[signature as keyof typeof GRANTED_ON],
        );
        expect(is, signature).toBe(GRANTED[signature as keyof typeof GRANTED]);
        expect(wasConfig, signature).toEqual([SEARCH_PATH]);
        // The one header line of the grant of 2026-11-12, after the search path, on the trigger function alone.
        expect(config, signature).toEqual(
          signature === "roi_statement_rules()"
            ? [SEARCH_PATH, HEADER_LINE]
            : [SEARCH_PATH],
        );
      }
      const printed =
        (
          await head.query<{ definition: string }>(
            "SELECT pg_get_functiondef('roi_statement_rules()'::regprocedure) AS definition",
          )
        ).rows[0]?.definition ?? "";
      expect(printed).toContain(
        " SET search_path TO 'pg_catalog', 'public', 'pg_temp'\n SET plan_cache_mode TO 'force_custom_plan'\nAS $function$",
      );
      await head.query("RESET ROLE");
      expect(await isolationAndShape()).toEqual(shapeBefore);
    });
    expect(await bodies()).toEqual(GRANTED_ON);
  });

  it("T1: refuses, changing nothing and naming the function, a starting body that is not the one the exception was granted on", async () => {
    const redefined = async (
      signature: string,
      find: string,
      put: string,
    ): Promise<string> => {
      const definition =
        (
          await head.query<{ definition: string }>(
            "SELECT pg_get_functiondef($1::regprocedure) AS definition",
            [signature],
          )
        ).rows[0]?.definition ?? "";
      return altered(definition, find, put, 1);
    };
    for (const [signature, find, put] of [
      [
        "roi_links_valid(jsonb)",
        "SELECT jsonb_typeof(links) = 'object'",
        "SELECT jsonb_typeof(links) = 'object' AND true",
      ],
      [
        "roi_statement_rules()",
        "BEGIN\n  IF TG_OP = 'DELETE'",
        "BEGIN\n  PERFORM 1;\n  IF TG_OP = 'DELETE'",
      ],
    ] as const) {
      const outcome = await onPreviousHead(async () => {
        await head.query(await redefined(signature, find, put));
        return apply();
      });
      expect(outcome, signature).toMatchObject({ code: "55000" });
      expect((outcome as Refusal).message, signature).toContain(
        `${signature} is not the body the ledger freeze exception of 2026-11-07`,
      );
      expect((outcome as Refusal).message, signature).toContain(
        "the exception covers no other",
      );
    }
    // Applied twice, the second finds its own bodies and refuses: the file never runs over anything but the bodies it names.
    const twice = await onPreviousHead(async () => {
      expect(await apply()).toBe("applied");
      await head.query("SAVEPOINT again");
      return apply();
    });
    expect((twice as Refusal).message).toContain(
      "roi_links_valid(jsonb) is not the body",
    );
    expect(await bodies()).toEqual(GRANTED_ON);
  });

  it("T3: the new roi_links_valid accepts four keys or five and refuses every other shape; the old one took the empty object and refused five keys", async () => {
    const answers = async () => {
      const result: Record<string, boolean | null | string> = {};
      for (const shape of SHAPES) {
        await head.query("SAVEPOINT shape");
        result[shape.name] = await head
          .query<{
            valid: boolean | null;
          }>("SELECT roi_links_valid($1::jsonb) AS valid", [shape.links])
          .then(
            (answer) => answer.rows[0]?.valid ?? null,
            (error: unknown) =>
              `refused ${String((error as { code?: string }).code)}`,
          );
        await head.query("ROLLBACK TO SAVEPOINT shape");
      }
      return result;
    };
    expect(SHAPES).toHaveLength(18);
    const { before, after } = await onPreviousHead(async () => {
      const was = await answers();
      expect(await apply()).toBe("applied");
      return { before: was, after: await answers() };
    });
    // Never null and never an error under the new body: a CHECK passes a null answer.
    expect(after).toEqual(
      Object.fromEntries(SHAPES.map((shape) => [shape.name, shape.valid])),
    );
    expect(before["the empty object"]).toBeNull();
    expect(before["five keys"]).toBe(false);
    expect(before["five empty lists"]).toBe(false);
    expect(before["four keys"]).toBe(true);
    expect(before["four empty lists"]).toBe(true);
  });

  it("T3b: the same shapes inserted in scope by the application’s role: each one’s SQLSTATE and whether the CHECK or the trigger refuses it, and nothing stored for a refused one", async () => {
    const practiceId = (worlds[0] as TenantWorld).practiceId;
    await onPreviousHead(async () => {
      expect(await apply()).toBe("applied");
      // The same transaction, now as the application's role in one practice's scope and in no one's name, as the statement job writes.
      await head.query("RESET ROLE");
      await head.query("SET LOCAL ROLE tp_app");
      await head.query(
        "SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', '', true)",
        [`{${practiceId}}`],
      );
      const count = async () =>
        (
          await head.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM roi_statement",
          )
        ).rows[0]?.n ?? -1;
      for (const shape of SHAPES) {
        const had = await count();
        await head.query("SAVEPOINT shape");
        const outcome = await head
          .query(INSERT_STATEMENT, [practiceId, shape.links, nextPeriod()])
          .then(() => "stored" as const, refusalOf);
        if (outcome !== "stored") {
          await head.query("ROLLBACK TO SAVEPOINT shape");
        }
        if (shape.insert === "stored") {
          expect(outcome, shape.name).toBe("stored");
          expect(await count(), shape.name).toBe(had + 1);
        } else {
          expect(outcome, shape.name).toMatchObject({
            code: shape.insert.code,
          });
          // The CHECK's refusal names its constraint; the trigger's own refusals and its casts name none.
          expect((outcome as Refusal).constraint, shape.name).toBe(
            shape.insert.by === "check" ? "roi_statement_links" : undefined,
          );
          expect(await count(), shape.name).toBe(had);
        }
      }
    });
  });

  it("P3: a passing run says how many statements it checked in how many practices, and leaves the scope naming no practice", async () => {
    const held = await stored();
    expect(held).toMatchObject({ statements: 3, practices: 3, failing: 0 });
    notices.length = 0;
    await onPreviousHead(async () => {
      expect(await apply()).toBe("applied");
      expect(await scope()).toBe("{}");
      // The SHARE lock of the closing count is held to the end of the migration.
      const locks = await head.query<{ mode: string }>(
        "SELECT mode FROM pg_locks WHERE pid = pg_backend_pid() AND relation = 'roi_statement'::regclass AND granted ORDER BY 1",
      );
      expect(locks.rows.map((row) => row.mode)).toEqual([
        "AccessShareLock",
        "ShareLock",
      ]);
    });
    const preflight = notices.filter((message) =>
      message.startsWith("preflight:"),
    );
    expect(preflight).toHaveLength(1);
    expect(preflight[0]).toMatch(
      /^preflight: 3 statements checked in 3 practices, 0 refused; scan \d+ ms, lock wait \d+ ms, closing \d+ ms, 0 practices read again$/,
    );
    expect(["", null]).toContain(await scope());
  });

  it("P5: the file changes no table, policy, role, grant or row-security setting, defines nothing SECURITY DEFINER, and stops on a null answer", () => {
    const text = file();
    // What the file does, not what it says: comments and quoted text set aside (a dollar-quoted body is kept, it is code).
    const code = text.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    for (const never of [
      /\balter\s+table\b/i,
      /\bpolicy\b/i,
      /\brole\b/i,
      /\bsecurity\s+definer\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\brow_security\b/i,
    ]) {
      expect(code).not.toMatch(never);
    }
    expect(text).not.toMatch(/w41/i);
    expect(code).not.toMatch(
      /\b(commit|rollback|lock_timeout|when\s+others)\b/i,
    );
    expect(
      text.split("roi_links_valid(s.links) IS NOT TRUE").length,
    ).toBeGreaterThanOrEqual(3);
    expect(code).not.toMatch(/NOT\s+roi_links_valid/i);
    // The only settings it writes are its own scope, transaction-local, and it ends on the empty one.
    expect(text.match(/set_config\('[a-z_.]+', [^)]*\)/g)).toEqual([
      SCOPE_ONE,
      SCOPE_ONE,
      "set_config('app.practice_ids', ids::text, true)",
      "set_config('app.practice_ids', '{}', true)",
    ]);
    // No statement, practice or links text in a refusal: counts only.
    expect(code).not.toMatch(/array_to_string|s\.id\b/i);
  });

  it("P2c, P2d: refuses to run as a role that does not read every practice (a superuser among them), and in a transaction that is not READ COMMITTED", async () => {
    const asSuperuser = await onPreviousHead(apply, { asSuperuser: true });
    expect(asSuperuser).toEqual({
      code: "55000",
      message:
        "the stored-statement preflight runs as the role that reads every practice (practice_resolver); it is running as another",
    });
    const repeatable = await onPreviousHead(apply, {
      isolation: "REPEATABLE READ",
    });
    expect(repeatable).toEqual({
      code: "55000",
      message:
        "the stored-statement preflight needs READ COMMITTED: its closing count must see every committed statement",
    });
    expect(await bodies()).toEqual(GRANTED_ON);
  });

  it("P1: refuses, with counts only and both bodies kept, when a deleted practice holds a statement whose links is the empty object, through the runner too", async () => {
    const gone = worlds.at(-1) as TenantWorld;
    // Today's CHECK and trigger let the application's role store it, at recovered 0: written in scope by the job's login.
    await insertAsJob(job, gone.practiceId, "{}");
    await head.query("BEGIN");
    await head.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await head.query("SELECT set_config('app.practice_ids', $1, true)", [
      `{${gone.practiceId}}`,
    ]);
    await head.query(
      "UPDATE practice SET status = 'deleted', data_key_ref = NULL WHERE id = $1",
      [gone.practiceId],
    );
    await head.query("COMMIT");
    expect(await stored()).toEqual({
      statements: 4,
      practices: 3,
      failing: 1,
      inPractices: 1,
    });

    const one = await onPreviousHead(apply);
    expect(one).toEqual({
      code: "23514",
      message:
        "1 of 4 stored ROI statements, in 1 of 3 practices, fail the new roi_links_valid; nothing is changed",
    });
    expect(await bodies()).toEqual(GRANTED_ON);

    await insertAsJob(job, gone.practiceId, "{}", 24);
    const many = await onPreviousHead(apply);
    expect(many).toEqual({
      code: "23514",
      message:
        "25 of 28 stored ROI statements, in 1 of 3 practices, fail the new roi_links_valid; nothing is changed",
    });

    // The runner itself: the same refusal, nothing recorded, both bodies today's.
    await expect(
      migrate({
        databaseUrl: previous.url,
        migrationsDir: withDir,
        devLogin: true,
      }),
    ).rejects.toThrow(
      `${migration} failed: 25 of 28 stored ROI statements, in 1 of 3 practices, fail the new roi_links_valid; nothing is changed`,
    );
    expect(
      (
        await head.query(
          "SELECT 1 FROM schema_migrations WHERE filename = $1",
          [migration],
        )
      ).rowCount,
    ).toBe(0);
    expect(await bodies()).toEqual(GRANTED_ON);
  }, 60_000);

  it("P2a, P2b, P2e: altered copies of the file. A scope that opens nothing is caught by the guard, and a practice the scan skipped by the closing count, which alone catches it", async () => {
    // From P1: the last practice the preflight reads holds 25 statements that fail, and the other two hold one that passes.
    expect(await stored()).toEqual({
      statements: 28,
      practices: 3,
      failing: 25,
      inPractices: 1,
    });
    const text = file();

    // (a) Both per-practice scopes set to the empty one: every count is 0 and agrees, and only the guard knows better.
    const blind = await onPreviousHead(() =>
      apply(
        altered(
          text,
          SCOPE_ONE,
          "set_config('app.practice_ids', '{}', true)",
          2,
        ),
      ),
    );
    expect(blind).toEqual({
      code: "55000",
      message:
        "the stored-statement preflight read 0 statements in 3 practices, but the table is not empty; nothing is changed",
    });

    // (b) The scan skips the last practice: the closing count finds its stored count moved, reads it again and refuses.
    const skipped = await onPreviousHead(() => apply(skippingTheLast(text)));
    expect(skipped).toEqual({
      code: "23514",
      message:
        "25 of 28 stored ROI statements, in 1 of 3 practices, fail the new roi_links_valid; nothing is changed",
    });

    // (e) The control, which must pass: (b) without the closing count applies over the 25, so (b)'s refusal rests on the closing count.
    notices.length = 0;
    const unclosed = await onPreviousHead(() =>
      apply(withoutTheClosingCount(skippingTheLast(text))),
    );
    expect(unclosed).toBe("applied");
    expect(
      notices.filter((message) => message.startsWith("preflight:"))[0],
    ).toContain("preflight: 2 statements checked in 3 practices, 0 refused");
    expect(await bodies()).toEqual(GRANTED_ON);
  });
});

describe("the ROI statement actionable-lines migration beside a statement writer (P4)", () => {
  let race: ScratchDatabase | undefined;
  let owner: pg.Client | undefined;
  let writer: pg.Client | undefined;

  afterAll(async () => {
    await writer?.end().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await race?.drop();
  });

  it("waits out a writer’s open transaction at its closing count, reads that practice again and refuses; once applied, the same writer’s session is held to the new CHECK", async () => {
    race = await createScratchDatabase(readDatabaseUrl());
    await migrate({
      databaseUrl: race.url,
      migrationsDir: previousDir,
      devLogin: true,
    });
    owner = await connect(race.url);
    writer = await connect(workerDevLoginUrl(race.url));
    const world = await createTenantWorld(owner, "race");
    await (await RowFactory.load(owner)).create(owner, "roi_statement", world);

    // An insert opened before the migration starts and still open at its closing count. It has called the old function.
    await writer.query("BEGIN");
    await writer.query(
      "SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', '', true)",
      [`{${world.practiceId}}`],
    );
    await writer.query(INSERT_STATEMENT, [
      world.practiceId,
      "{}",
      nextPeriod(),
    ]);

    const run = migrate({
      databaseUrl: race.url,
      migrationsDir: withDir,
      devLogin: true,
    }).then(
      () => "applied" as const,
      (error: unknown) => (error as Error).message,
    );
    // The scan did not see the open insert; the closing lock is refused while it is open, and the migration sleeps between tries.
    const sleeping = async () =>
      (
        await (owner as pg.Client).query(
          "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'PgSleep' AND query LIKE '%roi_links_valid%'",
        )
      ).rowCount === 1;
    const deadline = Date.now() + 25_000;
    while (!(await sleeping())) {
      expect(
        Date.now(),
        "the migration reached its closing lock and waits for the writer",
      ).toBeLessThan(deadline);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await writer.query("COMMIT");
    expect(await run).toBe(
      `${migration} failed: 1 of 2 stored ROI statements, in 1 of 1 practices, fail the new roi_links_valid; nothing is changed`,
    );
    const hashes =
      "SELECT p.oid::regprocedure::text AS signature, encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') AS body FROM pg_proc p WHERE p.proname IN ('roi_links_valid', 'roi_statement_rules') ORDER BY 1";
    const stand = async () =>
      Object.fromEntries(
        (
          await (owner as pg.Client).query<{ signature: string; body: string }>(
            hashes,
          )
        ).rows.map((row) => [row.signature, row.body]),
      );
    expect(await stand()).toEqual(GRANTED_ON);

    // The table is insert-only, so the test takes its own row out with the triggers off, as no role of the application can.
    await owner.query("BEGIN");
    await owner.query("SET LOCAL session_replication_role = replica");
    await owner.query("DELETE FROM roi_statement WHERE links = '{}'");
    await owner.query("COMMIT");

    // A passing run through the runner; then the same session, which planned the old function, is refused by the new CHECK.
    const passed = await migrate({
      databaseUrl: race.url,
      migrationsDir: withDir,
      devLogin: true,
    });
    expect(passed.applied).toEqual([migration]);
    expect(await stand()).toEqual(GRANTED);
    await expect(
      insertAsJob(writer, world.practiceId, "{}"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "roi_statement_links",
    });
    await insertAsJob(writer, world.practiceId, FOUR_EMPTY);
    expect(await stored(owner)).toEqual({
      statements: 2,
      practices: 1,
      failing: 0,
      inPractices: 0,
    });
  }, 120_000);
});
