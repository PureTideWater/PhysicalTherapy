import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The engine is pure (PRD 11: "It imports nothing from the database and nothing from the network";
 * .claude/rules/money-and-contracts.md: no database, network or clock inside). Its source files (every
 * file but the tests and the `testing` helpers, which read fixture files) may import at runtime only
 * @tp/money, @tp/rules' pure entry point, zod and each other; @tp/contracts only as types (its runtime
 * entry point reaches the database package); and they name no clock, randomness, locale or I/O.
 */
const SOURCE = import.meta.dirname;
const RUNTIME_IMPORTS = new Set(['@tp/money', '@tp/rules', 'zod']);
const TYPE_ONLY_IMPORTS = new Set(['@tp/contracts']);
const FORBIDDEN = [/\bDate\b/, /\bMath\.random\b/, /\bIntl\b/, /\btoLocale\w*\(/, /\bprocess\./, /\bperformance\./, /\bfetch\(/, /\bsetTimeout\(/, /\brequire\(/, /\bimport\(/];

const engineFiles = readdirSync(SOURCE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testing.ts')
  .sort();

interface ImportFound {
  readonly file: string;
  readonly from: string;
  readonly typeOnly: boolean;
}

function importsOf(file: string): ImportFound[] {
  const text = readFileSync(path.join(SOURCE, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, false, ts.ScriptKind.TS);
  const found: ImportFound[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      found.push({ file, from: statement.moduleSpecifier.text, typeOnly: statement.importClause?.isTypeOnly === true });
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
      found.push({ file, from: statement.moduleSpecifier.text, typeOnly: statement.isTypeOnly });
    }
  }
  return found;
}

describe('the engine’s source', () => {
  it('is the files the package exports from its entry point', () => {
    expect(engineFiles).toEqual(['dates.ts', 'engine.ts', 'index.ts', 'reasons.ts', 'recompute.ts', 'release.ts', 'trace.ts', 'types.ts', 'windows.ts']);
  });

  it('imports at runtime only @tp/money, @tp/rules, zod and itself, and @tp/contracts as types only', () => {
    const problems = engineFiles.flatMap(importsOf).filter((item) => {
      if (item.from.startsWith('./')) {
        return false;
      }
      if (TYPE_ONLY_IMPORTS.has(item.from)) {
        return !item.typeOnly;
      }
      return !RUNTIME_IMPORTS.has(item.from);
    });
    expect(problems).toEqual([]);
  });

  it('reads no clock, randomness, locale, environment or network', () => {
    for (const file of engineFiles) {
      const code = readFileSync(path.join(SOURCE, file), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line))
        .join('\n');
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(code), `${file} uses ${pattern.source}`).toBe(false);
      }
    }
  });

  it('recomputes without the engine: recompute.ts imports nothing of price', () => {
    const recompute = importsOf('recompute.ts').map((item) => item.from);
    expect(recompute).not.toContain('./engine');
    expect(recompute).not.toContain('./windows');
    expect(recompute).not.toContain('./release');
  });
});
