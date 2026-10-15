import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { forbiddenFieldLabel, isAllowedLogField } from '@tp/observability';
import ts from 'typescript';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** Methods that write a log line, plus `child`, which binds fields to every later line. */
const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'log', 'child']);

/** A receiver that is a logger: `console`, `log`, `logger`, `jobLogger`, `this.logger`, `ctx.log`. */
const LOGGER_NAME = /^(console|log|logger|\w*Logger)$/;

/** Nine or more consecutive digits: the shape of an SSN, a member ID or a claim number. */
const NINE_DIGITS = /\d{9}/;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Dependency and build output inside the scan roots. Coverage and mutation reports are written at the
 * repository root, outside them; apps/web has screens named coverage and reports that must be scanned.
 */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'cdk.out', 'playwright-report', 'test-results', 'e2e']);

/** The directories `pnpm lint:logs` scans, relative to the repository root. */
export const SCAN_ROOTS = ['apps', 'packages', 'tools', 'infra'];

/**
 * Test files are not scanned: they may hand the logger a synthetic patient record on purpose (the
 * canary test), and they never run in an environment with real data.
 */
export function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function isLoggerExpression(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) {
    return LOGGER_NAME.test(node.text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return LOGGER_NAME.test(node.name.text);
  }
  // logger.child({ ... }).info(...)
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === 'child' && isLoggerExpression(node.expression.expression);
  }
  return false;
}

function isLogCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee) && LOG_METHODS.has(callee.name.text) && isLoggerExpression(callee.expression);
}

function isCreateLoggerCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === 'createLogger';
}

function propertyKey(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
    return name.text;
  }
  return undefined;
}

export function scanSource(file: string, text: string): Violation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const report = (node: ts.Node, message: string) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push({ file, line: line + 1, column: character + 1, message });
  };

  const checkText = (node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) => {
    if (NINE_DIGITS.test(node.text)) {
      report(node, 'log text contains a run of nine or more digits; log opaque IDs, never identifiers');
    }
  };

  const checkFields = (object: ts.ObjectLiteralExpression) => {
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) {
        report(property, 'spread in log fields cannot be checked; list each allowlisted field');
        continue;
      }
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
        report(property, 'log fields must be plain properties');
        continue;
      }
      const key = propertyKey(property.name);
      if (key === undefined) {
        report(property, 'computed log field names cannot be checked');
        continue;
      }
      const forbidden = forbiddenFieldLabel(key);
      if (forbidden !== undefined) {
        report(property, `log field "${key}" looks like a ${forbidden}; it can never be logged`);
        continue;
      }
      if (!isAllowedLogField(key)) {
        report(property, `log field "${key}" is not on the allowlist in packages/observability/src/fields.ts`);
        continue;
      }
      if (ts.isPropertyAssignment(property)) {
        const value = property.initializer;
        if (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value)) {
          report(value, `log field "${key}" must hold a single value, not an object or array`);
        } else if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
          checkText(value);
        }
      }
    }
  };

  const checkArgument = (argument: ts.Expression) => {
    if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
      checkText(argument);
    } else if (ts.isObjectLiteralExpression(argument)) {
      checkFields(argument);
    } else if (ts.isTemplateExpression(argument)) {
      report(argument, 'log messages are fixed text; pass values as allowlisted fields instead of interpolating');
    } else {
      report(argument, 'log arguments must be fixed text or an object literal of allowlisted fields');
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (isLogCall(node)) {
        node.arguments.forEach(checkArgument);
      } else if (isCreateLoggerCall(node)) {
        const [options] = node.arguments;
        if (options !== undefined && ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              propertyKey(property.name) === 'base' &&
              ts.isObjectLiteralExpression(property.initializer)
            ) {
              checkFields(property.initializer);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

/** Every source file under the scan roots that `pnpm lint:logs` checks, relative to `root`. */
export function listSourceFiles(root: string, roots: readonly string[] = SCAN_ROOTS): string[] {
  const files: string[] = [];
  const walk = (relative: string) => {
    let entries;
    try {
      entries = readdirSync(path.join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(child);
        }
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !isTestFile(entry.name)) {
        if (!entry.name.endsWith('.d.ts')) {
          files.push(child);
        }
      }
    }
  };
  for (const start of roots) {
    walk(start);
  }
  return files.sort();
}

export function scanRepository(root: string, roots: readonly string[] = SCAN_ROOTS): { files: number; violations: Violation[] } {
  const files = listSourceFiles(root, roots);
  const violations = files.flatMap((file) => scanSource(file, readFileSync(path.join(root, file), 'utf8')));
  return { files: files.length, violations };
}
