import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ALLOWED, SCAN_ROOTS, brandColorViolations, hexColors, isAllowed, scannedFiles } from './scan';

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

  it('allows hex in exactly four files: the tokens as CSS and as constants, the mark, and the email template (reconciliation-001, D9 item 4)', () => {
    expect(ALLOWED).toEqual(['packages/brand/src/tokens.css', 'packages/brand/src/tokens.ts', 'packages/brand/src/mark.ts', 'apps/worker/src/mail/template.ts']);
    expect(isAllowed('packages/brand/src/tokens.css')).toBe(true);
    expect(isAllowed('packages/brand/src/tokens.ts')).toBe(true);
    expect(isAllowed('packages/brand/src/mark.ts')).toBe(true);
    expect(isAllowed('apps/worker/src/mail/template.ts')).toBe(true);
    // The rest of packages/brand/src is read like any other source: no directory is allowed by its prefix.
    for (const file of ['packages/brand/src/name.ts', 'packages/brand/src/index.ts', 'packages/brand/src/tailwind-preset.ts', 'packages/brand/src/tailwind-theme.css', 'packages/brand/src/new-file.ts', 'packages/brand/src/nested/tokens.css']) {
      expect(isAllowed(file), file).toBe(false);
    }
    expect(isAllowed('packages/brand/src/')).toBe(false);
    expect(isAllowed('packages/brand/src/tokens.css.ts')).toBe(false);
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

describe('the hex color check on a fixture repository', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  /** A repository of its own: the scanned roots, then each file with its text. */
  function fixture(files: Record<string, string>): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-brand-colors-'));
    root = dir;
    for (const start of SCAN_ROOTS) {
      mkdirSync(path.join(dir, start), { recursive: true });
    }
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), text);
    }
    return dir;
  }

  const ink = hex('0D1E3A');

  it('passes a hex color in each of the four allowed files', () => {
    const repository = fixture(Object.fromEntries(ALLOWED.map((file) => [file, file.endsWith('.css') ? `:root { --pw-ink: ${ink}; }\n` : `export const ink = '${ink}';\n`])));
    expect(scannedFiles(repository)).toEqual([...ALLOWED].map((file) => path.join(...file.split('/'))).sort());
    expect(brandColorViolations(repository)).toEqual([]);
  });

  it.each(['packages/brand/src/name.ts', 'packages/brand/src/new-file.ts', 'packages/brand/src/tailwind-theme.css', 'packages/brand/src/nested/mark.ts'])(
    'fails a hex color in %s, another file under packages/brand/src',
    (file) => {
      const repository = fixture({ 'packages/brand/src/tokens.css': `:root { --pw-ink: ${ink}; }\n`, [file]: `\n  color: '${ink}';\n` });
      expect(brandColorViolations(repository)).toEqual([{ file: path.join(...file.split('/')), line: 2, color: ink }]);
    },
  );

  it('fails a hex color in a component, a stylesheet or a root configuration file', () => {
    const repository = fixture({
      'apps/web/src/components/x.tsx': `export const X = () => <div className="text-[${ink}]" />;\n`,
      'packages/ui/src/styles.css': `a { color: ${hex('fff')}; }\n`,
      'eslint.config.js': `// ${hex('123456')}\n`,
    });
    expect(brandColorViolations(repository).map((finding) => finding.file)).toEqual([path.join('apps', 'web', 'src', 'components', 'x.tsx'), 'eslint.config.js', path.join('packages', 'ui', 'src', 'styles.css')]);
  });
});
