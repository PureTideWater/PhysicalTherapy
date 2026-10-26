import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every field the browser checks by `pattern` states its format in words (test matrix FRM-04; docs/adr/0077,
 * decision D9; WCAG 3.3.2): its `hint`, or an `aria-describedby` naming text the page writes, so the browser's
 * generic "Please match the requested format" is never the only guide. Read from the source with the TypeScript
 * compiler, so a field added later without a hint fails here rather than waiting for a reviewer.
 */

const SOURCE = path.resolve(import.meta.dirname, '..');

/** Files whose pattern fields may not have a hint yet, each with the change that removes it. */
const ALLOWED = new Map([
  // Ticket (`[A-Za-z0-9-]{1,64}`): the page is #42's; remove after #42 merges, with the hint "Letters, digits and hyphens, as in SYN-1234."
  ['app/console/support/page.tsx', 'remove after #42 merges'],
]);

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test-support' ? [] : sources(child);
    }
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [child] : [];
  });
}

interface PatternField {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
  readonly described: boolean;
}

/** Each JSX element carrying a `pattern` attribute, and whether it also carries `hint` or `aria-describedby`. */
function patternFields(file: string, text: string): PatternField[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: PatternField[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const names = node.attributes.properties.flatMap((attribute) => (ts.isJsxAttribute(attribute) ? [attribute.name.getText(source)] : []));
      if (names.includes('pattern')) {
        found.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          tag: node.tagName.getText(source),
          described: names.includes('hint') || names.includes('aria-describedby'),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const FIELDS = sources(SOURCE).flatMap((file) => patternFields(path.relative(SOURCE, file).split(path.sep).join('/'), readFileSync(file, 'utf8')));

describe('format hints on pattern fields (FRM-04)', () => {
  it('finds the pattern fields it checks', () => {
    expect(FIELDS.length).toBeGreaterThan(5);
  });

  it('gives every field checked by a pattern a hint or a description that states its format', () => {
    const silent = FIELDS.filter((field) => !field.described && !ALLOWED.has(field.file)).map(({ file, line, tag }) => `${file}:${String(line)} <${tag}>`);
    expect(silent).toEqual([]);
  });

  it('keeps its allowlist short: each file on it still has a field without a hint', () => {
    const stale = [...ALLOWED.keys()].filter((file) => !FIELDS.some((field) => field.file === file && !field.described));
    expect(stale).toEqual([]);
  });
});
