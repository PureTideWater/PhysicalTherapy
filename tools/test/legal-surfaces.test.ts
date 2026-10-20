import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DISCLOSURE_LEGAL_SURFACES, LEGAL_SURFACES_AWAITING_REVIEW } from '../../apps/web/src/lib/security/disclosure';
import { repositoryRoot } from '../content-files';

/**
 * The legal surfaces (docs/product/legal-surfaces.md): every surface the web app marks with data-legal-surface is a
 * row of the list, and every row's file still carries its marker, so a draft that needs counsel's or the security
 * official's review before launch cannot drop off the list while it is still on a page.
 */
const LIST = path.join(repositoryRoot, 'docs/product/legal-surfaces.md');
const SOURCE = path.join(repositoryRoot, 'apps/web/src');
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
    for (const file of sources(SOURCE)) {
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
    // The disclosure page renders each of its surfaces only where the server shows it (src/lib/security/disclosure.ts).
    const page = readFileSync(path.join(SOURCE, 'app/security/page.tsx'), 'utf8');
    for (const id of DISCLOSURE_LEGAL_SURFACES) {
      expect(page, id).toMatch(new RegExp(`\\{shows\\('${id}'\\) \\? \\(\\s*<section [^>]*data-legal-surface="${id}"`));
    }
    for (const id of awaiting) {
      expect(DISCLOSURE_LEGAL_SURFACES as readonly string[], `${id} waits for its review, and no production gate holds it`).toContain(id);
    }
  });
});
