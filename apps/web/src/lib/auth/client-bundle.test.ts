import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SEC-21 (docs/adr/0088, D1): the Cognito client secret never reaches the browser's bundle. The image is built with
 * no secret and ECS injects it at start, so the bundle cannot hold the value; this guard keeps any client module from
 * importing the server modules that read it, so a later change cannot pull them into the browser either. A static
 * scan: from every 'use client' module, each relative import that is not type-only is followed, stopping at a
 * 'use server' module (a server action, which the browser reaches only by reference), and none may reach
 * src/lib/server/** or the modules that hold or use the secret.
 */

const SRC = path.resolve(import.meta.dirname, '../..');

/** What no client module may import, directly or through other modules. */
const SERVER_ONLY = [/^lib\/server\//, /^lib\/auth\/cognito-provider\.ts$/, /^lib\/auth\/secret-hash\.ts$/, /^lib\/auth\/credential-probe\.ts$/];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      return name === 'node_modules' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const directive = (text: string, name: string): boolean => new RegExp(`^\\s*(?:(?://[^\\n]*|/\\*[\\s\\S]*?\\*/)\\s*)*['"]${name}['"]`).test(text);

/** The relative modules a file imports at run time (type-only imports and exports are erased). */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of text.matchAll(/^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm)) {
    if (match[2] === undefined && match[3] !== undefined) {
      found.push(match[3]);
    }
  }
  for (const match of text.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    if (match[1] !== undefined) {
      found.push(match[1]);
    }
  }
  return found.flatMap((specifier) => {
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    return resolved === undefined ? [] : [resolved];
  });
}

/** Every module a file reaches, stopping at server actions; with the path by which each was first reached. */
function reached(from: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[from, [from]]]);
  const queue = [from];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (file !== from && directive(readFileSync(file, 'utf8'), 'use server')) {
      continue;
    }
    for (const next of importsOf(file)) {
      if (!seen.has(next)) {
        seen.set(next, [...(seen.get(file) ?? []), next]);
        queue.push(next);
      }
    }
  }
  return seen;
}

const relative = (file: string): string => path.relative(SRC, file).split(path.sep).join('/');

describe('the browser bundle', () => {
  const clientModules = sourceFiles(SRC).filter((file) => directive(readFileSync(file, 'utf8'), 'use client'));

  it('SEC-21: the scan follows imports: the server services reach the Cognito provider and the secret', () => {
    const fromServices = [...reached(path.join(SRC, 'lib/server/services.ts')).keys()].map(relative);
    expect(fromServices).toContain('lib/auth/cognito-provider.ts');
    expect(fromServices).toContain('lib/auth/secret-hash.ts');
    expect(clientModules.length).toBeGreaterThan(10);
  });

  it('SEC-21: no client module imports the server modules or the modules that hold the client secret', () => {
    const leaks = clientModules.flatMap((file) =>
      [...reached(file).entries()].filter(([module]) => SERVER_ONLY.some((pattern) => pattern.test(relative(module)))).map(([, via]) => via.map(relative).join(' -> ')),
    );
    expect(leaks).toEqual([]);
  });
});
