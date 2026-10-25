import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ROUTES } from '../index';
import { ROUTE_TEST_FILES, partitionRoutes, routeCost, routesOf } from './partition';

/**
 * The generated route tests' split into files (test matrix CI-02; docs/adr/0066): every registered route is in
 * exactly one of the twelve files, none is empty, the files are balanced by the worlds they build, and the directory
 * holds exactly the twelve files, each generating its own index's routes. No database: this runs with the unit tests.
 */

const DIRECTORY = import.meta.dirname;
const FILES = Array.from({ length: ROUTE_TEST_FILES }, (_, file) => file);
const authenticated = ROUTES.filter((route) => route.access.kind !== 'public');

/** What each generated file holds, and nothing else. */
const fileText = (file: number) => `import { defineRouteTests } from './define';\n\ndefineRouteTests(${String(file)});\n`;

it('generates tests for every registered route, and every authenticated route has a sample', () => {
  expect(ROUTES.length).toBeGreaterThan(20);
  expect(authenticated.filter((route) => route.sample === undefined).map((route) => route.id)).toEqual([]);
});

describe('the twelve route-test files', () => {
  it('put every registered route in exactly one file, and no file is empty', () => {
    expect(new Set(ROUTES.map((route) => route.id)).size).toBe(ROUTES.length);
    const files = FILES.map((file) => routesOf(file));
    for (const [file, routes] of files.entries()) {
      expect(routes.length, `route-tests.${String(file)}.db.test.ts`).toBeGreaterThan(0);
    }
    const all = files.flat();
    expect(all).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      expect(
        FILES.filter((file) => files[file]?.includes(route)),
        route.id,
      ).toHaveLength(1);
    }
    expect(all.map((route) => route.id).sort()).toEqual(ROUTES.map((route) => route.id).sort());
  });

  it('list each file’s routes in registry order, and balance the files by the worlds they build', () => {
    const loads = FILES.map((file) => routesOf(file).reduce((sum, route) => sum + routeCost(route), 0));
    for (const file of FILES) {
      const indexes = routesOf(file).map((route) => ROUTES.indexOf(route));
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    }
    // Greedy longest-first leaves the files at most one route's cost apart.
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(Math.max(...ROUTES.map(routeCost)));
    expect(loads.reduce((sum, load) => sum + load, 0)).toBe(ROUTES.reduce((sum, route) => sum + routeCost(route), 0));
  });

  it('are the same on every call (the split is a function of the registry)', () => {
    expect(partitionRoutes(ROUTES).map((routes) => routes.map((route) => route.id))).toEqual(FILES.map((file) => routesOf(file).map((route) => route.id)));
  });

  it('hold exactly route-tests.0.db.test.ts to route-tests.11.db.test.ts beside the snapshot case, each generating its own index', () => {
    const tests = readdirSync(DIRECTORY)
      .filter((name) => name.endsWith('.test.ts'))
      .sort();
    expect(tests).toEqual([...FILES.map((file) => `route-tests.${String(file)}.db.test.ts`), 'partition.test.ts', 'snapshot.db.test.ts'].sort());
    for (const file of FILES) {
      expect(readFileSync(path.join(DIRECTORY, `route-tests.${String(file)}.db.test.ts`), 'utf8'), `route-tests.${String(file)}.db.test.ts`).toBe(fileText(file));
    }
  });

  it('refuses a file outside 0 to 11', () => {
    for (const file of [-1, ROUTE_TEST_FILES, 1.5, Number.NaN]) {
      expect(() => routesOf(file)).toThrow(/no route-test file/);
    }
    expect(() => partitionRoutes(ROUTES, 0)).toThrow(/at least one/);
  });
});

describe('partitionRoutes', () => {
  it('places every route of any list in exactly one of any number of files', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: ROUTES.length - 1 }), { maxLength: 60 }), fc.integer({ min: 1, max: 20 }), (picks, files) => {
        const routes = [...new Set(picks)].map((index) => ROUTES[index]).filter((route) => route !== undefined);
        const parts = partitionRoutes(routes, files);
        expect(parts).toHaveLength(files);
        const placed = parts.flat();
        expect(placed).toHaveLength(routes.length);
        expect(new Set(placed)).toEqual(new Set(routes));
      }),
    );
  });

  it('costs a route by the worlds its tests build', () => {
    const practice = ROUTES.find((route) => route.access.kind === 'practice');
    const platform = ROUTES.find((route) => route.access.kind === 'platform');
    const checked = ROUTES.find((route) => route.access.kind === 'public' && route.originChecked);
    const unchecked = ROUTES.find((route) => route.access.kind === 'public' && !route.originChecked);
    expect([practice, platform, checked, unchecked].map((route) => (route === undefined ? null : routeCost(route)))).toEqual([4, 2, 2, 1]);
  });
});
