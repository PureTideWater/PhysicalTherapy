import type { Route } from '../../http/route';
import { ROUTES } from '../index';

/**
 * How the tests generated from the route registry (define.ts) are split into files, so CI's database shards run them
 * side by side instead of as one file of about twenty minutes (audit item 109; docs/adr/0066). Each route is in exactly
 * one file (partition.test.ts proves it), and a route added to the registry joins a file by itself.
 */

/** The number of generated route-test files: route-tests.0.db.test.ts to route-tests.11.db.test.ts. */
export const ROUTE_TEST_FILES = 12;

/**
 * The synthetic worlds a route's generated tests build, which is most of their time (each world is a practice with
 * every persona, contract, run, packet and ledger record): two for every authenticated route, two more for a practice
 * route (the internal-role suite's), and for a public route one, plus one when its POST is origin-checked.
 */
export function routeCost(route: Route): number {
  if (route.access.kind === 'public') {
    return route.originChecked ? 2 : 1;
  }
  return route.access.kind === 'practice' ? 4 : 2;
}

/**
 * The routes of each file: the costliest first, each to the file with the least cost so far (the lowest index on a
 * tie), routes of equal cost in registry order. Deterministic: the same registry always gives the same files. Each
 * file lists its routes in registry order.
 */
export function partitionRoutes(routes: readonly Route[], files: number = ROUTE_TEST_FILES): readonly (readonly Route[])[] {
  if (!Number.isInteger(files) || files < 1) {
    throw new Error(`the route tests need a whole number of files, at least one: ${String(files)}`);
  }
  const order = routes.map((route, index) => ({ route, index, cost: routeCost(route) })).sort((a, b) => b.cost - a.cost || a.index - b.index);
  const load = Array.from({ length: files }, () => 0);
  const assigned = Array.from({ length: files }, (): { route: Route; index: number }[] => []);
  for (const entry of order) {
    let target = 0;
    for (let file = 1; file < files; file += 1) {
      if ((load[file] ?? 0) < (load[target] ?? 0)) {
        target = file;
      }
    }
    load[target] = (load[target] ?? 0) + entry.cost;
    assigned[target]?.push(entry);
  }
  return assigned.map((entries) => entries.sort((a, b) => a.index - b.index).map((entry) => entry.route));
}

/** The registered routes whose tests route-tests.<file>.db.test.ts generates. */
export function routesOf(file: number): readonly Route[] {
  if (!Number.isInteger(file) || file < 0 || file >= ROUTE_TEST_FILES) {
    throw new Error(`no route-test file ${String(file)}: the files are 0 to ${String(ROUTE_TEST_FILES - 1)}`);
  }
  return partitionRoutes(ROUTES)[file] ?? [];
}
