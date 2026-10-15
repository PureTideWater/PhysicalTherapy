import { readFileSync } from 'node:fs';
import path from 'node:path';

import { listFiles } from '../content-files';

/** What a fixture's expected.json says pyx12 must report (packages/synth OracleExpectation). */
export interface OracleExpectation {
  readonly valid: boolean;
  readonly rejections: readonly string[];
  readonly summary: unknown;
  readonly summarySha256?: string;
}

/** One result of tools/test-oracle/oracle.py (format tp-oracle-run/1). */
export interface OracleResult {
  readonly file: string;
  readonly valid: boolean;
  readonly rejections: readonly string[];
  readonly errors: readonly { readonly level: string; readonly code: string; readonly message: string }[];
  readonly summary: unknown;
  readonly summarySha256: string | null;
}

export interface OracleCheck {
  /** The spec handed to oracle.py: a path under fixtures/synthetic, or "path!entry" inside a zip. */
  readonly spec: string;
  readonly expectation: OracleExpectation;
  /** Generated at test time (pnpm synth --large) rather than committed. */
  readonly generated?: boolean;
  /** The parse outcome the fixture states for packages/edi835, when it states one. */
  readonly parseOutcome?: string;
}

/** Where two JSON values differ, as "path: expected X, found Y" lines (at most `limit`). */
export function jsonDifferences(expected: unknown, actual: unknown, at = '', limit = 20): string[] {
  const found: string[] = [];
  const walk = (a: unknown, b: unknown, where: string): void => {
    if (found.length >= limit) {
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        found.push(`${where || '/'}: expected ${String(a.length)} items, found ${String(b.length)}`);
        return;
      }
      a.forEach((item, index) => walk(item, b[index], `${where}[${String(index)}]`));
      return;
    }
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (const key of keys) {
        const left = (a as Record<string, unknown>)[key];
        const right = (b as Record<string, unknown>)[key];
        if (!(key in a) || !(key in b)) {
          found.push(`${where}/${key}: ${key in a ? 'missing from the oracle' : 'not expected'}`);
          continue;
        }
        walk(left, right, `${where}/${key}`);
      }
      return;
    }
    if (a !== b) {
      found.push(`${where || '/'}: expected ${JSON.stringify(a)}, found ${JSON.stringify(b)}`);
    }
  };
  walk(expected, actual, at);
  return found;
}

/** Every disagreement between what a fixture expects and what pyx12 reported. */
export function disagreements(check: OracleCheck, result: OracleResult | undefined): string[] {
  if (!result) {
    return [`${check.spec}: the oracle returned no result`];
  }
  const problems: string[] = [];
  const { expectation } = check;
  if (result.valid !== expectation.valid) {
    const errors = result.errors.slice(0, 3).map((error) => `${error.level} ${error.code}: ${error.message}`);
    problems.push(`${check.spec}: expected pyx12 to ${expectation.valid ? 'accept' : 'reject'} it; it ${result.valid ? 'accepted' : 'rejected'} it${errors.length > 0 ? ` (${errors.join('; ')})` : ''}`);
  }
  for (const rejection of expectation.rejections) {
    if (!result.rejections.includes(rejection)) {
      problems.push(`${check.spec}: expected a ${rejection} rejection; pyx12 reported ${result.rejections.join(', ') || 'none'}`);
    }
  }
  if (expectation.summary !== null && expectation.summary !== undefined) {
    if (result.summary === null) {
      problems.push(`${check.spec}: pyx12's reading produced no summary`);
    } else {
      problems.push(...jsonDifferences(expectation.summary, result.summary).map((difference) => `${check.spec}: ${difference}`));
    }
  }
  if (expectation.summarySha256 !== undefined && expectation.summarySha256 !== result.summarySha256) {
    problems.push(`${check.spec}: the summary hash differs (expected ${expectation.summarySha256}, found ${String(result.summarySha256)})`);
  }
  return problems;
}

interface ExpectedFile {
  readonly path: string;
  readonly kind: string;
  readonly x12?: { readonly oracle: OracleExpectation; readonly parse?: { readonly outcome: string } };
  readonly zip?: {
    readonly entries: readonly { readonly name: string; readonly kind: string; readonly oracle?: OracleExpectation; readonly x12?: { readonly parse?: { readonly outcome: string } } }[];
  };
}

function withOutcome(check: OracleCheck, parseOutcome: string | undefined): OracleCheck {
  return parseOutcome === undefined ? check : { ...check, parseOutcome };
}

/** Every oracle check the fixtures under `root` (fixtures/synthetic) declare in their expected.json. */
export function collectChecks(root: string): { checks: OracleCheck[]; declared: Set<string> } {
  const checks: OracleCheck[] = [];
  const declared = new Set<string>();
  for (const file of listFiles(root, '.')) {
    if (path.basename(file) !== 'expected.json' || file.startsWith(`cms${path.sep}`) || file.startsWith(`rules${path.sep}`)) {
      continue;
    }
    const caseDir = path.dirname(file).split(path.sep).join('/');
    const expected = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as { files?: readonly ExpectedFile[]; generated?: readonly { path: string; oracle: OracleExpectation }[] };
    for (const generated of expected.generated ?? []) {
      checks.push({ spec: generated.path, expectation: generated.oracle, generated: true });
    }
    for (const entry of expected.files ?? []) {
      const relative = `${caseDir}/${entry.path}`;
      if (entry.kind === 'x12' && entry.x12) {
        declared.add(relative);
        checks.push(withOutcome({ spec: relative, expectation: entry.x12.oracle }, entry.x12.parse?.outcome));
      }
      for (const zipEntry of entry.zip?.entries ?? []) {
        if (zipEntry.kind === 'x12' && zipEntry.oracle) {
          checks.push(withOutcome({ spec: `${relative}!${zipEntry.name}`, expectation: zipEntry.oracle }, zipEntry.x12?.parse?.outcome));
        }
      }
    }
  }
  return { checks, declared };
}
