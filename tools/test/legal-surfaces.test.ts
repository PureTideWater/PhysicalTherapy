import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTION_LEGAL_SURFACES,
  DISCLOSURE_LEGAL_SURFACES,
  LEGAL_SURFACES_AWAITING_REVIEW,
  SCREENING_LEGAL_SURFACES,
  environmentFrom,
  showsLegalSurface,
} from '../../apps/web/src/lib/legal-surfaces';
import { repositoryRoot } from '../content-files';

/**
 * The legal surfaces (docs/product/legal-surfaces.md): every surface the web app marks with data-legal-surface is a
 * row of the list, and every row's file still carries its marker, so a draft that needs counsel's or the security
 * official's review before launch cannot drop off the list while it is still on a page.
 */
const LIST = path.join(repositoryRoot, 'docs/product/legal-surfaces.md');
const SOURCE = path.join(repositoryRoot, 'apps/web/src');
/** Where surfaces are marked: the web app, and the worker's emails (the screening's result email). */
const SOURCES = [SOURCE, path.join(repositoryRoot, 'apps/worker/src')];
const MARKER = /data-legal-surface="([a-z0-9-]+)"/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sources(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

interface Row {
  readonly id: string;
  readonly where: string;
  readonly review: string;
  readonly before: string;
}

function rows(): Row[] {
  return readFileSync(LIST, 'utf8')
    .split('\n')
    .filter((line) => /^\| `[a-z0-9-]+` \|/.test(line))
    .map((line) => {
      const cells = line.split(' | ').map((cell) => cell.replace(/^\| ?|\s*\|$/g, '').trim());
      return { id: (cells[0] ?? '').replaceAll('`', ''), where: (cells[2] ?? '').replaceAll('`', ''), review: cells[3] ?? '', before: cells[4] ?? '' };
    });
}

describe('the legal surfaces list', () => {
  it('lists every surface the web app marks, by the file that renders it', () => {
    const marked = new Map<string, string[]>();
    for (const file of SOURCES.flatMap(sources)) {
      for (const match of readFileSync(file, 'utf8').matchAll(MARKER)) {
        const id = match[1] ?? '';
        marked.set(id, [...(marked.get(id) ?? []), path.relative(repositoryRoot, file).split(path.sep).join('/')]);
      }
    }
    const listed = new Map(rows().map((row) => [row.id, row]));
    expect(marked.size).toBeGreaterThan(0);
    for (const [id, files] of marked) {
      expect(listed.get(id)?.where, `${id} is marked in ${files.join(', ')} but not listed`).toBe(files[0]);
      expect(files, `${id} is marked in more than one place`).toHaveLength(1);
    }
    for (const row of rows()) {
      expect(marked.has(row.id), `${row.id} is listed but ${row.where} no longer marks it`).toBe(true);
      expect(row.review, row.id).not.toBe('');
    }
  });

  it('keeps the good-faith research statement on the list for counsel, with its comment in the page', () => {
    expect(rows().find((row) => row.id === 'good-faith-research')?.review).toMatch(/^Counsel/);
    const page = readFileSync(path.join(SOURCE, 'app/security/page.tsx'), 'utf8');
    expect(page).toContain("Needs counsel's review before launch: docs/product/legal-surfaces.md, good-faith-research");
  });

  it('keeps every surface still waiting for its review before a production deploy out of production, until its row leaves the list', () => {
    const awaiting = rows()
      .filter((row) => /production deploy/i.test(row.before))
      .map((row) => row.id)
      .sort();
    expect([...LEGAL_SURFACES_AWAITING_REVIEW].sort()).toEqual(awaiting);
    for (const id of awaiting) {
      expect(showsLegalSurface(id, 'production'), id).toBe(false);
      expect(showsLegalSurface(id, 'staging'), id).toBe(true);
    }
    // The disclosure page renders each of its surfaces only where the server shows it (src/lib/security/disclosure.ts).
    const page = readFileSync(path.join(SOURCE, 'app/security/page.tsx'), 'utf8');
    for (const id of DISCLOSURE_LEGAL_SURFACES) {
      expect(page, id).toMatch(new RegExp(`\\{shows\\('${id}'\\) \\? \\(\\s*<section [^>]*data-legal-surface="${id}"`));
    }
    // Every waiting surface has a gate: the disclosure page's parts, the screening (closed in production while any of
    // its kept-wording rows waits) and the attribution cookie (neither set nor read).
    const gated: readonly string[] = [...DISCLOSURE_LEGAL_SURFACES, ...SCREENING_LEGAL_SURFACES, ...ATTRIBUTION_LEGAL_SURFACES];
    for (const id of awaiting) {
      expect(gated, `${id} waits for its review, and no production gate holds it`).toContain(id);
    }
    const routes = readFileSync(path.join(SOURCE, 'lib/screening/routes.ts'), 'utf8');
    const open = routes.slice(routes.indexOf('async function screeningOpen('), routes.indexOf('const status', routes.indexOf('async function screeningOpen(')));
    expect(open).toContain('environment: Environment');
    expect(open).toContain('if (!showsLegalSurfaces(SCREENING_LEGAL_SURFACES, environment)) {\n    return { open: false, releaseNo: null };');
    expect(routes.match(/screeningOpen\(services\.pool, services\.environment\)/g)).toHaveLength(2);
    const attribution = readFileSync(path.join(SOURCE, 'lib/http/attribution.ts'), 'utf8');
    expect(attribution).toContain('return attributionCookieAllowed(environment) ? decodeAttribution(cookies.get(ATTRIBUTION_COOKIE)) : NO_ATTRIBUTION;');
    expect(attribution).toContain('!attributionCookieAllowed(request.environment)');
    expect(readFileSync(path.join(SOURCE, 'proxy.ts'), 'utf8')).toContain('environment: environmentFrom(process.env)');
    // The proxy's environment: the one the server is configured with, production when a production build names none.
    expect(environmentFrom({ TP_ENVIRONMENT: 'staging', NODE_ENV: 'production' })).toBe('staging');
    expect(environmentFrom({ NODE_ENV: 'production' })).toBe('production');
    expect(environmentFrom({ NODE_ENV: 'production', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' })).toBe('dev');
    expect(environmentFrom({ NODE_ENV: 'test' })).toBe('dev');
  });
});
