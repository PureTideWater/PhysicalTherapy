import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * No module the server runs calls or reads anything a 'use client' module exports. On the server such an export is a
 * reference only: it may be rendered as a component or handed to a client component as a prop, and anything else (a
 * call, a property read) throws on every render, so the page is an error. Neither tsc nor a test that renders a
 * component sees that boundary; the merge of #74 into PR #78 had Coverage's letter, a server component, call
 * contractOwners from its client check, and only the end-to-end run found Coverage broken. Read from the source with
 * the TypeScript compiler: from the app's server entries (each page, layout, route and other file Next runs on the
 * server, the proxy, and each 'use server' module) through every import that does not cross into a client module,
 * each value imported from one (directly or through a module that re-exports it) may be used only as a JSX tag, a JSX
 * attribute's value or an export.
 */

const WEB = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(WEB, 'src');
const REPOSITORY = path.resolve(WEB, '..', '..');

/** The files Next runs on the server by their name in src/app (error and global-error are client components by rule). */
const SERVER_FILES = new Set([
  'page',
  'layout',
  'template',
  'default',
  'loading',
  'not-found',
  'global-not-found',
  'forbidden',
  'unauthorized',
  'route',
  'sitemap',
  'robots',
  'manifest',
  'icon',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
]);

const OPTIONS = (() => {
  const read = ts.readConfigFile(path.join(WEB, 'tsconfig.json'), (file) => ts.sys.readFile(file));
  return ts.parseJsonConfigFileContent(read.config, { ...ts.sys, readDirectory: () => [] }, WEB).options;
})();

const parsed = new Map<string, ts.SourceFile>();

function sourceOf(file: string): ts.SourceFile {
  let source = parsed.get(file);
  if (source === undefined) {
    source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    parsed.set(file, source);
  }
  return source;
}

/** The module's prologue directives ('use client', 'use server'). */
function directives(source: ts.SourceFile): string[] {
  const found: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      break;
    }
    found.push(statement.expression.text);
  }
  return found;
}

const isClient = (file: string): boolean => directives(sourceOf(file)).includes('use client');

/** The repository source file a specifier names, or undefined for a package's build or a declaration file. */
function resolved(specifier: string, from: string): string | undefined {
  const target = ts.resolveModuleName(specifier, from, OPTIONS, ts.sys).resolvedModule?.resolvedFileName;
  if (target === undefined || target.endsWith('.d.ts') || !/\.tsx?$/.test(target)) {
    return undefined;
  }
  const real = realpathSync(target);
  return real.startsWith(REPOSITORY + path.sep) && !real.split(path.sep).includes('node_modules') ? real : undefined;
}

/** Whether a module declares an export of this name. */
function declaresExport(source: ts.SourceFile, name: string): boolean {
  return source.statements.some((statement) => {
    if (ts.isExportDeclaration(statement)) {
      return statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some((element) => element.name.text === name);
    }
    if (ts.isExportAssignment(statement)) {
      return name === 'default';
    }
    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      return false;
    }
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      return name === 'default';
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
    }
    return (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name?.text === name;
  });
}

/** The client module an export of this name comes from, the module itself or through its re-exports; else undefined. */
function clientOrigin(file: string, name: string, seen = new Set<string>()): string | undefined {
  if (seen.has(`${file}#${name}`)) {
    return undefined;
  }
  seen.add(`${file}#${name}`);
  if (isClient(file)) {
    return declaresExport(sourceOf(file), name) ? file : undefined;
  }
  for (const statement of sourceOf(file).statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const target = resolved(statement.moduleSpecifier.text, file);
    if (target === undefined) {
      continue;
    }
    if (statement.exportClause === undefined) {
      const origin = clientOrigin(target, name, seen);
      if (origin !== undefined) {
        return origin;
      }
    } else if (ts.isNamedExports(statement.exportClause)) {
      const element = statement.exportClause.elements.find((each) => each.name.text === name && !each.isTypeOnly);
      if (element !== undefined) {
        return clientOrigin(target, (element.propertyName ?? element.name).text, seen);
      }
    }
  }
  return undefined;
}

/**
 * Each use of a client binding the server cannot make: anything but a JSX tag, a JSX attribute's whole value, an export
 * or a type. Positions that only name a property or declare a local are not uses.
 */
function misuses(source: ts.SourceFile, bindings: ReadonlySet<string>): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node)) {
      return;
    }
    if (ts.isIdentifier(node) && bindings.has(node.text)) {
      const parent = node.parent;
      const tag = (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) && parent.tagName === node;
      const namespacedTag =
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        (ts.isJsxOpeningElement(parent.parent) || ts.isJsxSelfClosingElement(parent.parent) || ts.isJsxClosingElement(parent.parent));
      const attributeValue = ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent);
      const exported = ts.isExportSpecifier(parent);
      const nameOnly =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        ((ts.isVariableDeclaration(parent) ||
          ts.isParameter(parent) ||
          ts.isBindingElement(parent) ||
          ts.isFunctionDeclaration(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isPropertySignature(parent)) &&
          parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!tag && !namespacedTag && !attributeValue && !exported && !nameOnly) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push(`${node.text} at line ${String(line)} (${ts.SyntaxKind[parent.kind]})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sources(child);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [realpathSync(child)] : [];
  });
}

const ALL = sources(SOURCE);
const ENTRIES = ALL.filter((file) => {
  if (isClient(file)) {
    return false;
  }
  const relative = path.relative(SOURCE, file).split(path.sep);
  const name = path.basename(file).replace(/\.tsx?$/, '');
  return (relative[0] === 'app' && SERVER_FILES.has(name)) || relative.join('/') === 'proxy.ts' || relative.join('/') === 'instrumentation.ts' || directives(sourceOf(file)).includes('use server');
});

interface ServerModule {
  readonly file: string;
  /** Each local name bound to a client module's export, and that module. */
  readonly bindings: ReadonlyMap<string, string>;
}

/** The server module graph from the entries, stopping at each client module. */
function serverGraph(): ServerModule[] {
  const modules: ServerModule[] = [];
  const seen = new Set<string>();
  const queue = [...ENTRIES];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file) || isClient(file)) {
      continue;
    }
    seen.add(file);
    const bindings = new Map<string, string>();
    for (const statement of sourceOf(file).statements) {
      const declaration = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement : undefined;
      if (declaration?.moduleSpecifier === undefined || !ts.isStringLiteral(declaration.moduleSpecifier)) {
        continue;
      }
      const target = resolved(declaration.moduleSpecifier.text, file);
      if (target === undefined) {
        continue;
      }
      if (!isClient(target)) {
        queue.push(target);
      }
      const clause = ts.isImportDeclaration(declaration) ? declaration.importClause : undefined;
      if (clause === undefined || clause.isTypeOnly) {
        continue;
      }
      const bind = (local: string, exported: string) => {
        const origin = clientOrigin(target, exported);
        if (origin !== undefined) {
          bindings.set(local, path.relative(REPOSITORY, origin));
        }
      };
      if (clause.name !== undefined) {
        bind(clause.name.text, 'default');
      }
      if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (!element.isTypeOnly) {
            bind(element.name.text, (element.propertyName ?? element.name).text);
          }
        }
      } else if (clause.namedBindings !== undefined && isClient(target)) {
        bindings.set(clause.namedBindings.name.text, path.relative(REPOSITORY, target));
      }
    }
    modules.push({ file, bindings });
  }
  return modules;
}

const GRAPH = serverGraph();

describe('the server calls nothing a client module exports', () => {
  it('finds the server entries, the modules they reach and the client components they render', () => {
    expect(ENTRIES.length).toBeGreaterThan(100);
    expect(GRAPH.length).toBeGreaterThan(300);
    expect(GRAPH.reduce((count, each) => count + each.bindings.size, 0)).toBeGreaterThan(100);
    // Coverage's letter is on the server and renders its two client checks.
    const letter = GRAPH.find((each) => each.file.endsWith(path.join('components', 'coverage', 'letter.tsx')));
    expect([...(letter?.bindings.keys() ?? [])]).toEqual(expect.arrayContaining(['LetterContractCheck', 'LetterMarks', 'SelectField', 'Field']));
  });

  it('tells a call of a client export from rendering it or handing it to a client component', () => {
    const source = ts.createSourceFile(
      'letter.tsx',
      [
        "import { LetterContractCheck, contractOwners } from './letter-contract-check';",
        'export function Letter({ listed }: { readonly listed: readonly Contract[] }) {',
        '  return <LetterContractCheck owners={contractOwners(listed)} build={contractOwners} />;',
        '}',
        'export { contractOwners };',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    expect(misuses(source, new Set(['LetterContractCheck', 'contractOwners']))).toEqual(['contractOwners at line 3 (CallExpression)']);
  });

  it('uses each client export on the server only as a component or a prop', () => {
    const found = GRAPH.flatMap(({ file, bindings }) =>
      misuses(sourceOf(file), new Set(bindings.keys())).map((use) => `${path.relative(REPOSITORY, file)}: ${use}, from ${bindings.get(use.split(' ')[0] ?? '') ?? ''}`),
    );
    expect(found).toEqual([]);
  });
});
