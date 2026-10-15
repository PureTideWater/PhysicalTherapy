import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { urlPhiFindings } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import type { Route } from '../http/route';
import * as account from './account';
import * as consoleRoutes from './console';
import * as registry from './index';
import * as practice from './practice';
import * as remittances from './remittances';
import * as signIn from './sign-in';
import * as uploads from './uploads';

/**
 * Nothing reaches the browser without the registry: every page.tsx, route.ts and server action in
 * src/app runs a registered route through the wrapper, so the generated database tests
 * (route-tests.db.test.ts) cover it, and every registered route has its file. Also: URLs carry
 * opaque IDs only (PRD 7; SEC-08), every route that changes records records an audit event, and every
 * practice route is scoped by params.practiceId.
 */

const APP = path.resolve(import.meta.dirname, '../../app');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

/** Every exported route, by its export name. */
const EXPORTED = new Map<string, Route>(
  [account, consoleRoutes, practice, remittances, signIn, uploads, registry].flatMap((module) =>
    Object.entries(module).filter((entry): entry is [string, Route] => typeof entry[1] === 'object' && entry[1] !== null && 'invoke' in entry[1] && 'id' in entry[1]),
  ),
);

function urlOf(file: string): string {
  const relative = path.relative(APP, path.dirname(file)).split(path.sep).join('/');
  return relative === '' ? '/' : `/${relative}`;
}

/** The route identifiers a source file passes to the given adapter calls. */
function routesUsed(source: string, adapters: readonly string[]): Route[] {
  const found: Route[] = [];
  for (const adapter of adapters) {
    for (const match of source.matchAll(new RegExp(`${adapter}\\(\\s*(\\w+)`, 'g'))) {
      const route = EXPORTED.get(match[1] ?? '');
      expect(route, `${adapter}(${match[1] ?? ''}) names no exported route`).toBeDefined();
      found.push(route as Route);
    }
  }
  return found;
}

const sources = files(APP).filter((file) => /\.(ts|tsx)$/.test(file));
const pages = sources.filter((file) => path.basename(file) === 'page.tsx');
const handlers = sources.filter((file) => path.basename(file) === 'route.ts');
const actionFiles = sources.filter((file) => readFileSync(file, 'utf8').startsWith("'use server';"));

describe('the route registry', () => {
  it('holds every exported route exactly once, with unique IDs', () => {
    const ids = registry.ROUTES.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const route of EXPORTED.values()) {
      expect(registry.ROUTES, route.id).toContain(route);
    }
    expect(registry.routeById('practice.home')).toBe(practice.practiceHome);
    expect(registry.routeById('nothing')).toBeUndefined();
  });

  it('runs every page through a registered page route at its own path', () => {
    expect(pages.length).toBeGreaterThan(10);
    for (const file of pages) {
      const used = routesUsed(readFileSync(file, 'utf8'), ['loadPage', 'loadPublicPage']);
      expect(used, file).toHaveLength(1);
      expect(used[0]?.kind, file).toBe('page');
      expect(used[0]?.path, file).toBe(urlOf(file));
    }
    const pagePaths = new Set(pages.map(urlOf));
    for (const route of registry.ROUTES.filter((candidate) => candidate.kind === 'page')) {
      expect(pagePaths.has(route.path), `${route.id} has no page.tsx at ${route.path}`).toBe(true);
    }
  });

  it('runs every route handler through a registered handler route at its own path', () => {
    for (const file of handlers) {
      const used = routesUsed(readFileSync(file, 'utf8'), ['routeHandler', 'downloadHandler']);
      expect(used, file).toHaveLength(1);
      expect(used[0]?.kind, file).toBe('handler');
      expect(used[0]?.path, file).toBe(urlOf(file));
    }
    const handlerPaths = new Set(handlers.map(urlOf));
    for (const route of registry.ROUTES.filter((candidate) => candidate.kind === 'handler')) {
      expect(handlerPaths.has(route.path), `${route.id} has no route.ts at ${route.path}`).toBe(true);
    }
  });

  it('runs every server action through a registered action route, and every action route has one', () => {
    const used = new Set<Route>();
    for (const file of actionFiles) {
      const source = readFileSync(file, 'utf8');
      const exported = [...source.matchAll(/export async function (\w+)/g)].length;
      const routes = routesUsed(source, ['runAction', 'runSignInStep']);
      expect(routes.length, `${file}: every exported action runs one route`).toBe(exported);
      for (const route of routes) {
        expect(route.kind, file).toBe('action');
        used.add(route);
      }
    }
    for (const route of registry.ROUTES.filter((candidate) => candidate.kind === 'action')) {
      expect(used.has(route), `${route.id} is not used by any server action`).toBe(true);
    }
  });

  it('keeps every other file in src/app free of database and session code', () => {
    const others = sources.filter((file) => !pages.includes(file) && !handlers.includes(file) && !actionFiles.includes(file));
    for (const file of others) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/@tp\/db|withActor|withPracticeScope|resolveSession/);
    }
  });
});

describe('every registered route', () => {
  it.each(registry.ROUTES.map((route) => [route.id, route] as const))('%s: opaque IDs only in its path, an audit event if it changes records, scoped as declared', (_id, route) => {
    const sample = route.path.replace(/\[(\w+)\]/g, '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60');
    expect(urlPhiFindings(sample)).toEqual([]);
    for (const segment of route.path.split('/').filter((part) => part.startsWith('['))) {
      expect(segment, `${route.id}: a path parameter names an opaque ID`).toMatch(/^\[\w+Id\]$/);
    }
    if (route.mutation) {
      expect(route.audit, `${route.id} changes records without an audit event`).toBeDefined();
    }
    if (route.access.kind === 'practice') {
      expect(route.path, `${route.id} is a practice route outside /p/[practiceId]`).toMatch(/^\/p\/\[practiceId\]/);
      expect(route.phi).toBe(true);
    }
    if (route.access.kind === 'platform') {
      expect(route.path.startsWith('/console/'), `${route.id} is a platform route outside the console`).toBe(true);
      expect(route.phi, `${route.id}: no console screen shows PHI`).toBe(false);
    }
    if (route.access.kind === 'public') {
      expect(route.phi).toBe(false);
      expect(route.path).toMatch(/^\/(api\/)?sign-in/);
    }
  });
});
