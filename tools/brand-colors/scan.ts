import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The brand's color rule as a check (docs/brand/BRAND.md, section 4; .claude/rules/brand.md): colors come
 * from the tokens, and tokens.css is the only file with brand hex values. Every source file and stylesheet
 * under apps, packages, tools and infra (and the configuration at the repository root) is read for a hex
 * color literal; the only places one may stand are four files, each by its exact path (reconciliation-001,
 * D9 item 4): the tokens as CSS (tokens.css) and as typed constants (tokens.ts), the mark's fallbacks
 * (mark.ts), and the email template, which takes its hex from tokens.ts because email clients read no CSS
 * variables. Any other file in packages/brand/src (name.ts, the Tailwind preset and theme, a new file) is
 * read like the rest. Image files (the outlined SVG and PNG assets the brand ships) are artwork, not
 * source, and are not read. `pnpm test` runs it (scan.test.ts).
 */

/** A hex color: #rgb, #rgba, #rrggbb or #rrggbbaa, not part of a longer word, an HTML entity (&#39;) or a CSS id-like name. */
export const HEX_COLOR = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;

/**
 * The only files a hex color may stand in, each by its exact path relative to the repository root (never a
 * directory, and never another file whose name begins the same way).
 */
export const ALLOWED = ['packages/brand/src/tokens.css', 'packages/brand/src/tokens.ts', 'packages/brand/src/mark.ts', 'apps/worker/src/mail/template.ts'] as const;

export const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html']);

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'cdk.out', 'coverage', 'playwright-report', 'test-results', '.stryker-tmp', '.turbo']);

export const SCAN_ROOTS = ['apps', 'packages', 'tools', 'infra'] as const;

export interface HexFinding {
  readonly file: string;
  readonly line: number;
  readonly color: string;
}

export function isAllowed(file: string): boolean {
  const normalized = file.split(path.sep).join('/');
  return (ALLOWED as readonly string[]).includes(normalized);
}

/** The hex colors in one file's text, with their lines. */
export function hexColors(file: string, text: string): HexFinding[] {
  const findings: HexFinding[] = [];
  text.split('\n').forEach((content, index) => {
    for (const match of content.matchAll(HEX_COLOR)) {
      findings.push({ file, line: index + 1, color: match[0] });
    }
  });
  return findings;
}

/**
 * Every file the check reads, relative to `root`: those with one of `extensions` under SCAN_ROOTS and at the
 * root itself, never dependencies or build output. The font-host check (tools/brand-fonts) walks the same tree.
 */
export function scannedFiles(root: string, extensions: ReadonlySet<string> = SCANNED_EXTENSIONS): string[] {
  const files: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(child);
        }
      } else if (entry.isFile() && extensions.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
        files.push(child);
      }
    }
  };
  for (const start of SCAN_ROOTS) {
    walk(start);
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

/** The hex colors standing anywhere but the allowed places. */
export function brandColorViolations(root: string): HexFinding[] {
  return scannedFiles(root)
    .filter((file) => !isAllowed(file))
    .flatMap((file) => hexColors(file, readFileSync(path.join(root, file), 'utf8')));
}
