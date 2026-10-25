import { expect, it } from 'vitest';

import { routeWorldsForThisFile } from './world';

/**
 * The route tests' snapshot in one statement (test matrix CI-03; docs/adr/0066). Every generated case that says a
 * request "changes nothing" compares RouteWorlds.snapshot(), which reads every tenant table and the people's rows in
 * one prepared statement. Here, on every run, it is held to the per-table snapshot the route tests took before: equal
 * on two worlds, different between them wherever a table holds rows, and after an update to a tenant table and to a
 * person's row, both changed in exactly those lines.
 */

const worlds = routeWorldsForThisFile();

/** md5 of an empty string: the digest of a table with no rows for the world. */
const NO_ROWS = 'd41d8cd98f00b204e9800998ecf8427e';

const lines = (digest: string) => digest.split('\n').map((line) => ({ table: line.slice(0, line.lastIndexOf(':')), digest: line.slice(line.lastIndexOf(':') + 1) }));

/** The tables whose lines differ between two snapshots of one world. */
function changed(before: string, after: string): string[] {
  const was = lines(before);
  return lines(after)
    .filter((line, index) => was[index]?.table !== line.table || was[index]?.digest !== line.digest)
    .map((line) => line.table);
}

it('reads the snapshot in one statement that returns exactly the per-table snapshot, on two worlds and after an update (CI-03)', async () => {
  const a = await worlds.buildWorld('snapshot A');
  const b = await worlds.buildWorld('snapshot B');

  const foldedA = await worlds.snapshot(a);
  const foldedB = await worlds.snapshot(b);
  expect(foldedA).toBe(await worlds.perTableSnapshot(a));
  expect(foldedB).toBe(await worlds.perTableSnapshot(b));

  // Every tenant table the catalog names, then the people's four, in that order: a new tenant table joins by itself.
  expect(lines(foldedA).map((line) => line.table)).toEqual([...worlds.tables.map(({ table }) => table), 'membership', 'user', 'user_device', 'user_session']);
  expect(worlds.tables.length).toBeGreaterThan(40);

  // The worlds' snapshots differ in every line where either holds rows, and only there.
  const linesB = lines(foldedB);
  const filled = lines(foldedA).filter((line, index) => line.digest !== NO_ROWS || linesB[index]?.digest !== NO_ROWS);
  expect(filled.length).toBeGreaterThan(20);
  expect(changed(foldedA, foldedB)).toEqual(filled.map((line) => line.table));

  // An update to one tenant table and to one person's row: both snapshots change in those two lines, and nothing else.
  await worlds.owner.query("UPDATE payer SET name_raw = name_raw || ' RENAMED' WHERE practice_id = $1", [a.refs.practiceId]);
  await worlds.owner.query('UPDATE "user" SET failed_sign_ins = failed_sign_ins + 1 WHERE id = $1', [a.refs.adminUserId]);
  const updatedFolded = await worlds.snapshot(a);
  const updatedPerTable = await worlds.perTableSnapshot(a);
  expect(updatedFolded).toBe(updatedPerTable);
  expect(changed(foldedA, updatedFolded)).toEqual(['payer', 'user']);
  expect(await worlds.snapshot(b)).toBe(foldedB);
}, 120_000);
