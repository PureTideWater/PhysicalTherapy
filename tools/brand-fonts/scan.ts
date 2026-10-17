import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SCANNED_EXTENSIONS, scannedFiles } from '../brand-colors/scan';

/**
 * The brand's font rule as a check (CO-01: no page requests either of Google's font hosts;
 * docs/brand/BRAND.md, section 5; docs/adr/0056): the brand's faces are self-hosted (next/font/local in
 * apps/web/src/lib/fonts.ts, the bundled woff2 files in the report renderer), so no source names Google's
 * font hosts. Every source file, stylesheet, page, manifest, workflow-like YAML and SVG under apps, packages,
 * tools and infra (and the configuration at the repository root) is read for either host, in any case, since
 * a host name is case-insensitive; docs/ is not read (it may name the hosts to forbid them). An SVG is read
 * too, because one can @import a stylesheet. ESLint refuses next/font/google itself (eslint.config.js), and
 * the browser journey (apps/web/e2e/font-hosts.spec.ts) proves no page asks either host for anything.
 * `pnpm test` runs it (scan.test.ts).
 */

/** Google's two font hosts, built from their parts so this file does not name them itself. */
export const GOOGLE_FONT_HOSTS = [['fonts', 'googleapis', 'com'].join('.'), ['fonts', 'gstatic', 'com'].join('.')] as const;

/** Either host, anywhere in a line and in any case (a subdomain or a longer URL around it included). */
const HOST = new RegExp(GOOGLE_FONT_HOSTS.map((host) => host.replaceAll('.', '\\.')).join('|'), 'gi');

/** What the font check reads: the hex check's source and stylesheets, and the files that can name a URL beside them. */
export const FONT_SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([...SCANNED_EXTENSIONS, '.json', '.webmanifest', '.svg', '.yml', '.yaml']);

export interface FontHostFinding {
  readonly file: string;
  readonly line: number;
  readonly host: string;
}

/** The font hosts one file's text names, with their lines. */
export function fontHosts(file: string, text: string): FontHostFinding[] {
  const findings: FontHostFinding[] = [];
  text.split('\n').forEach((content, index) => {
    for (const match of content.matchAll(HOST)) {
      findings.push({ file, line: index + 1, host: match[0].toLowerCase() });
    }
  });
  return findings;
}

/** Every file the check reads, relative to `root`. */
export function fontScannedFiles(root: string): string[] {
  return scannedFiles(root, FONT_SCANNED_EXTENSIONS);
}

/** Every place a source file names one of Google's font hosts. */
export function fontHostViolations(root: string): FontHostFinding[] {
  return fontScannedFiles(root).flatMap((file) => fontHosts(file, readFileSync(path.join(root, file), 'utf8')));
}
