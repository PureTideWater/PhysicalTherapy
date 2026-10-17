import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { brandColorViolations, hexColors, isAllowed, scannedFiles } from './scan';

const ROOT = path.resolve(import.meta.dirname, '../..');
/** Built from parts so this file holds no color literal of its own. */
const hex = (digits: string) => `#${digits}`;

describe('the hex color check (docs/brand/BRAND.md, section 4)', () => {
  it('finds the three-, four-, six- and eight-digit forms with their lines', () => {
    const text = [`color: ${hex('111')};`, `fill="${hex('0D1E3A')}"`, `background: ${hex('ffffff80')} ${hex('fff8')};`].join('\n');
    expect(hexColors('a.css', text)).toEqual([
      { file: 'a.css', line: 1, color: hex('111') },
      { file: 'a.css', line: 2, color: hex('0D1E3A') },
      { file: 'a.css', line: 3, color: hex('ffffff80') },
      { file: 'a.css', line: 3, color: hex('fff8') },
    ]);
  });

  it('leaves alone what is not a color: entities, anchors, words and longer runs', () => {
    expect(hexColors('a.ts', ['&#39;', `href="${hex('entry-1')}"`, `${hex('add')}ress`, `id${hex('abc')}`, hex('1234567'), `${hex('abc')}-def`].join('\n'))).toEqual([]);
  });

  it('allows hex only in packages/brand/src and the email template', () => {
    expect(isAllowed('packages/brand/src/tokens.css')).toBe(true);
    expect(isAllowed('packages/brand/src/mark.ts')).toBe(true);
    expect(isAllowed('apps/worker/src/mail/template.ts')).toBe(true);
    expect(isAllowed('apps/web/src/app/brand.css')).toBe(false);
    expect(isAllowed('apps/worker/src/report/brand.css')).toBe(false);
    expect(isAllowed('packages/ui/src/styles.css')).toBe(false);
    // A file is allowed by its exact path: a neighbour whose name begins the same way is read like any other.
    expect(isAllowed('apps/worker/src/mail/template.tsx')).toBe(false);
    expect(isAllowed('apps/worker/src/mail/template.ts.bak.ts')).toBe(false);
    expect(isAllowed('packages/brand/src-other/tokens.css')).toBe(false);
    expect(isAllowed(path.join('packages', 'brand', 'src', 'tokens.ts'))).toBe(true);
  });

  it('reads the source and stylesheets of every workspace, never dependencies or build output', () => {
    const files = scannedFiles(ROOT);
    expect(files).toContain(path.join('apps', 'web', 'src', 'app', 'globals.css'));
    expect(files).toContain(path.join('apps', 'worker', 'src', 'report', 'brand.css'));
    expect(files).toContain(path.join('packages', 'ui', 'src', 'styles.css'));
    expect(files).toContain('eslint.config.js');
    expect(files.some((file) => file.split(path.sep).includes('node_modules') || file.split(path.sep).includes('.next'))).toBe(false);
  });

  it('finds no hex color outside the tokens and the email template', () => {
    expect(brandColorViolations(ROOT)).toEqual([]);
  });
});
