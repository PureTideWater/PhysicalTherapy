import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SCAN_ROOTS } from '../brand-colors/scan';
import { GOOGLE_FONT_HOSTS, fontHostViolations, fontHosts, fontScannedFiles } from './scan';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FIXTURE = readFileSync(path.join(import.meta.dirname, 'fixtures', 'google-font-hosts.tsx.fixture'), 'utf8');
const [APIS, STATIC] = GOOGLE_FONT_HOSTS;

describe('the font-host check (CO-01; docs/adr/0056)', () => {
  it('names Google’s two font hosts', () => {
    expect(GOOGLE_FONT_HOSTS).toEqual(['fonts' + '.googleapis.com', 'fonts' + '.gstatic.com']);
  });

  it('finds either host in any case, with its line, inside a URL, an @import or a preconnect', () => {
    expect(fontHosts('a.css', [`@import url("https://${APIS}/css2?family=Inter");`, `src: url(//${STATIC.toUpperCase()}/s/inter.woff2);`, 'color: var(--pw-ink);'].join('\n'))).toEqual([
      { file: 'a.css', line: 1, host: APIS },
      { file: 'a.css', line: 2, host: STATIC },
    ]);
    expect(fontHosts('a.ts', `const hosts = ['${APIS}', 'https://cdn.${STATIC}'];`)).toHaveLength(2);
  });

  it('leaves alone a regular expression that names the hosts to refuse them, and other Google hosts', () => {
    expect(fontHosts('a.spec.ts', String.raw`const FONT_SERVICES = /fonts\.googleapis\.com|fonts\.gstatic\.com/;`)).toEqual([]);
    expect(fontHosts('a.ts', "const maps = 'https://maps.googleapis.com'; const font = 'next/font/local';")).toEqual([]);
  });

  it('reads source, stylesheets, pages, manifests, SVGs and YAML in every workspace, never docs, dependencies or build output', () => {
    const files = fontScannedFiles(ROOT);
    expect(files).toContain(path.join('apps', 'web', 'src', 'app', 'layout.tsx'));
    expect(files).toContain(path.join('apps', 'web', 'src', 'lib', 'fonts.ts'));
    expect(files).toContain(path.join('apps', 'web', 'src', 'app', 'globals.css'));
    expect(files).toContain(path.join('apps', 'web', 'src', 'app', 'manifest.ts'));
    expect(files).toContain(path.join('apps', 'web', 'public', 'brand', 'paidwhole-lockup-horizontal-tagline.svg'));
    expect(files).toContain(path.join('apps', 'worker', 'src', 'report', 'brand.css'));
    expect(files).toContain(path.join('apps', 'web', 'package.json'));
    expect(files).toContain(path.join('infra', 'cdk.json'));
    expect(files).toContain('eslint.config.js');
    expect(files.some((file) => file.startsWith(`docs${path.sep}`))).toBe(false);
    expect(files.some((file) => file.split(path.sep).includes('node_modules') || file.split(path.sep).includes('.next'))).toBe(false);
    // The fixtures below are not source: their extension keeps them out.
    expect(files.some((file) => file.endsWith('.fixture'))).toBe(false);
  });

  it('finds neither host anywhere in the repository’s source', () => {
    expect(fontHostViolations(ROOT)).toEqual([]);
  });
});

describe('the font-host check on a fixture repository', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  function fixture(files: Record<string, string>): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-brand-fonts-'));
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

  it.each(['apps/web/src/app/layout.tsx', 'packages/ui/src/fonts.tsx', 'apps/worker/src/report/cover.ts', 'tools/x/page.html', 'infra/lib/site.ts'])('fails the layout that asks Google for its faces as %s', (file) => {
    const repository = fixture({ [file]: FIXTURE });
    expect(fontHostViolations(repository)).toEqual([
      { file: path.join(...file.split('/')), line: 7, host: STATIC },
      { file: path.join(...file.split('/')), line: 8, host: APIS },
      { file: path.join(...file.split('/')), line: 9, host: APIS },
    ]);
  });

  it('fails a stylesheet, an SVG, a manifest or a root configuration file that names a host', () => {
    const repository = fixture({
      'packages/brand/src/tokens.css': `@import url('https://${APIS}/css2?family=Inter');\n`,
      'apps/web/public/brand/art.svg': `<svg viewBox="0 0 1 1"><style>@import url(https://${APIS}/css2);</style></svg>\n`,
      'apps/web/public/site.webmanifest': `{ "icons": [{ "src": "https://${STATIC}/x.png" }] }\n`,
      'next.config.mjs': `export default { images: { domains: ['${STATIC}'] } };\n`,
    });
    expect(fontHostViolations(repository).map((finding) => finding.file)).toEqual([
      path.join('apps', 'web', 'public', 'brand', 'art.svg'),
      path.join('apps', 'web', 'public', 'site.webmanifest'),
      'next.config.mjs',
      path.join('packages', 'brand', 'src', 'tokens.css'),
    ]);
  });

  it('passes the same tree when the host is named only under docs/', () => {
    const repository = fixture({ 'docs/brand/BRAND.md': `Never ${APIS}.\n`, 'apps/web/src/lib/fonts.ts': "import localFont from 'next/font/local';\n" });
    expect(fontHostViolations(repository)).toEqual([]);
  });
});
