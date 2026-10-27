import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The renderer computes nothing and reads nothing (design 4.3, purity; docs/adr/0072; CLAUDE.md rule 1): the explain
 * folder imports at runtime only @tp/money's three display formatters and its own files, @tp/pricing and the packet
 * format as types only, so the subpath stays browser-safe (no node:crypto, database or I/O); it names no clock,
 * randomness, locale, environment or network; and no expression in it, or in the root's explainPacket(), adds,
 * subtracts, multiplies, divides, compares by size, rounds or negates. The one count the words make, a worksheet's
 * number (its position from one), is the one sum allowed, and text is joined with `+` only beside a string.
 */

const SOURCE = import.meta.dirname;
const files = readdirSync(SOURCE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .sort();

const MONEY_FORMATTERS = new Set(['formatUnroundedUsd', 'formatUsd', 'parseCents']);
const TYPE_ONLY = new Set(['@tp/pricing', '../format']);
const FORBIDDEN = [/\bDate\b/, /\bMath\./, /\bIntl\b/, /\btoLocale\w*\(/, /\bprocess\./, /\bfetch\(/, /\bsetTimeout\(/, /\brequire\(/, /\bimport\(/, /node:/, /\bBigInt\b/, /\bdecimal\(/, /\bparse(?:Int|Float)\b/, /\bNumber\(/];
const ARITHMETIC = new Set([
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);
/** The sums allowed: a worksheet's number from its position, and two runs of text joined. */
const ALLOWED_SUMS = new Set(['index + 1', 'last.text + segment.text']);

function sourceOf(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
}

const isText = (node: ts.Expression) => ts.isStringLiteral(node) || ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node);

/** Every expression in the file that does arithmetic or compares by size, by its text. */
function arithmeticIn(file: string): string[] {
  const source = sourceOf(file);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (ARITHMETIC.has(operator) || (operator === ts.SyntaxKind.PlusToken && !isText(node.left) && !isText(node.right) && !ALLOWED_SUMS.has(node.getText(source)))) {
        found.push(`${path.basename(file)}: ${node.getText(source)}`);
      }
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && node.operator !== ts.SyntaxKind.ExclamationToken) {
      const negativeLiteral = ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand) && node.operand.text === '1';
      if (!negativeLiteral) found.push(`${path.basename(file)}: ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('the renderer’s source (packages/packets/src/explain)', () => {
  it('is the files the subpath exports', () => {
    expect(files).toEqual(['figures.ts', 'index.ts', 'line.ts', 'slots.ts', 'version.ts', 'words.ts', 'worksheet.ts']);
  });

  it('imports at runtime only @tp/money’s display formatters and its own files, and @tp/pricing and the format as types', () => {
    const problems: string[] = [];
    for (const file of files) {
      const source = sourceOf(path.join(SOURCE, file));
      for (const statement of source.statements) {
        if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const from = statement.moduleSpecifier.text;
        const typeOnly = ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly === true : statement.isTypeOnly;
        if (from.startsWith('./')) continue;
        if (TYPE_ONLY.has(from)) {
          if (!typeOnly) problems.push(`${file}: ${from} at runtime`);
        } else if (from === '@tp/money' && ts.isImportDeclaration(statement)) {
          const bindings = statement.importClause?.namedBindings;
          const names = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.filter((element) => !element.isTypeOnly && statement.importClause?.isTypeOnly !== true).map((element) => element.name.text) : [];
          for (const name of names) if (!MONEY_FORMATTERS.has(name)) problems.push(`${file}: @tp/money ${name}`);
        } else {
          problems.push(`${file}: ${from}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('reads no clock, randomness, locale, environment, network or crypto, and builds no number', () => {
    for (const file of files) {
      const code = readFileSync(path.join(SOURCE, file), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line))
        .join('\n');
      for (const pattern of FORBIDDEN) expect(pattern.test(code), `${file} uses ${pattern.source}`).toBe(false);
    }
  });

  it('adds, subtracts, multiplies, divides, compares by size and negates nothing, here or in explainPacket()', () => {
    const all = [...files.map((file) => path.join(SOURCE, file)), path.join(SOURCE, '..', 'explain.ts')];
    expect(all.flatMap(arithmeticIn)).toEqual([]);
  });

  it('finds the arithmetic it looks for', () => {
    const text = (code: string) => {
      const source = ts.createSourceFile('probe.ts', code, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
      const found: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isBinaryExpression(node) && (ARITHMETIC.has(node.operatorToken.kind) || (node.operatorToken.kind === ts.SyntaxKind.PlusToken && !isText(node.left) && !isText(node.right)))) found.push(node.getText(source));
        ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    };
    expect(text('const a = b - c; const d = e < f; const g = h + i; const j = `x` + k;')).toEqual(['b - c', 'e < f', 'h + i']);
  });
});
