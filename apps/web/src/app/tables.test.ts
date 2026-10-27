import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every table in the web app scrolls in ScrollTable (docs/adr/0078, Decision 6; test matrix TBL-01; UX-011): a
 * `<table>` is the direct and only child of `ScrollTable` from components/scroll-table, so at a phone's width it scrolls
 * in a region the keyboard reaches and whose name says it scrolls, and never pushes the page sideways. Read from the
 * source, as type-scale.test.ts reads it, so a table added or merged bare fails here rather than in a 390 px
 * screenshot. The end-to-end suite's atPhoneWidth checks the rendered tables as well (one from a package, or from
 * markup the source cannot see).
 */

const SOURCE = path.resolve(import.meta.dirname, '..');

/** This file, as a failure names it. */
const GUARD = 'apps/web/src/app/tables.test.ts';

/** The one module whose ScrollTable holds a table, relative to SOURCE and without its extension. */
const SCROLL_TABLE = 'components/scroll-table';

/**
 * Tables in #42's files, wrapped when #42 has merged (the UX baseline review, UX-011): while #42 is open its files are
 * not edited. Each count must match exactly: a file that gains or loses a bare table fails, so the pull request that
 * wraps one deletes its line. Only a bare table is exempt; the other rules hold in these files too.
 */
const AFTER_42: Readonly<Record<string, { readonly tables: number; readonly removedBy: string }>> = {
  'app/console/support/page.tsx': { tables: 1, removedBy: 'UX PR 74 (co-001/ux-console-support-page)' },
  'app/settings/organizations/[organizationId]/users/page.tsx': { tables: 2, removedBy: 'UX PR 75 (co-001/ux-users-page)' },
  'app/p/[practiceId]/support-access/[supportGrantId]/page.tsx': { tables: 1, removedBy: 'UX PR 76 (co-001/ux-support-access)' },
};

/**
 * - bare-table: a JSX `<table>` whose parent is not ScrollTable (a table in a div inside one, or behind a condition
 *   inside one, included);
 * - created-table: `createElement('table', …)` or `jsx('table', …)`, React's or the document's;
 * - table-in-markup: a string or template holding `<table` that reaches `dangerouslySetInnerHTML`;
 * - not-only-a-table: a ScrollTable whose children are not exactly one element, a `<table>`.
 */
type Rule = 'bare-table' | 'created-table' | 'table-in-markup' | 'not-only-a-table';

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly rule: Rule;
}

const FIXES: Readonly<Record<Rule, string>> = {
  'bare-table': 'make it the only child of ScrollTable (components/scroll-table.tsx), with its condition outside, so no empty region renders',
  'created-table': 'a created table has no ScrollTable around it: write it as JSX, the only child of ScrollTable',
  'table-in-markup': 'a table in markup has no ScrollTable around it: render it as JSX, the only child of ScrollTable',
  'not-only-a-table': 'ScrollTable holds exactly one element, a <table>: fixed-height text scrolls in ScrollBox, and anything beside the table goes outside',
};

/** The functions that make an element from a tag name: React's (classic and automatic runtimes) and the document's. */
const CREATORS = new Set(['createElement', 'jsx', 'jsxs', 'jsxDEV']);

const TABLE_MARKUP = /<table\b/i;

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test-support' ? [] : sources(child);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [child] : [];
  });
}

const FILES = sources(SOURCE).map((file) => ({ file: path.relative(SOURCE, file).split(path.sep).join('/'), text: readFileSync(file, 'utf8') }));

/** A relative import's module, relative to SOURCE and without its extension; null for a package. */
function resolved(file: string, specifier: string): string | null {
  return specifier.startsWith('.') ? path.posix.join(path.posix.dirname(file), specifier).replace(/\.[jt]sx?$/, '') : null;
}

/** The names ScrollTable is bound to in a file: imported from components/scroll-table, under any local name, or through a namespace. */
function scrollTableBindings(file: string, source: ts.SourceFile): { readonly names: ReadonlySet<string>; readonly namespaces: ReadonlySet<string> } {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || resolved(file, statement.moduleSpecifier.text) !== SCROLL_TABLE) {
      continue;
    }
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    if (clause === undefined || clause.isTypeOnly || bindings === undefined) {
      continue;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && (element.propertyName ?? element.name).text === 'ScrollTable') {
        names.add(element.name.text);
      }
    }
  }
  return { names, namespaces };
}

function isTable(node: ts.Node): boolean {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : ts.isJsxSelfClosingElement(node) ? node.tagName : undefined;
  return tag !== undefined && ts.isIdentifier(tag) && tag.text === 'table';
}

/** A child that renders nothing: the whitespace between tags, or an empty expression such as a comment. */
function isEmptyChild(child: ts.JsxChild): boolean {
  return (ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces) || (ts.isJsxExpression(child) && child.expression === undefined);
}

/** The text of every string and template under a node, following a name to the initializer of its variable in the same file. */
function markupTexts(node: ts.Node, initializers: ReadonlyMap<string, readonly ts.Expression[]>, seen: Set<ts.Node>): string[] {
  if (seen.has(node)) {
    return [];
  }
  seen.add(node);
  if (ts.isStringLiteralLike(node)) {
    return [node.text];
  }
  if (ts.isTemplateExpression(node)) {
    return [[node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(''), ...node.templateSpans.flatMap((span) => markupTexts(span.expression, initializers, seen))];
  }
  if (ts.isIdentifier(node)) {
    return (initializers.get(node.text) ?? []).flatMap((initializer) => markupTexts(initializer, initializers, seen));
  }
  const texts: string[] = [];
  ts.forEachChild(node, (child) => {
    texts.push(...markupTexts(child, initializers, seen));
  });
  return texts;
}

/** What the rules find in one file, and how many tables it writes in JSX. */
function tableFindings(file: string, text: string): { readonly tables: number; readonly findings: readonly Finding[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const { names, namespaces } = scrollTableBindings(file, source);
  const isScrollTable = (tag: ts.JsxTagNameExpression): boolean =>
    ts.isIdentifier(tag) ? names.has(tag.text) : ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && namespaces.has(tag.expression.text) && tag.name.text === 'ScrollTable';
  const initializers = new Map<string, ts.Expression[]>();
  const findings: Finding[] = [];
  let tables = 0;
  const found = (node: ts.Node, rule: Rule) => {
    findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, rule });
  };
  const declarations = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      initializers.set(node.name.text, [...(initializers.get(node.name.text) ?? []), node.initializer]);
    }
    ts.forEachChild(node, declarations);
  };
  declarations(source);
  const visit = (node: ts.Node) => {
    if (isTable(node)) {
      tables += 1;
      if (!(ts.isJsxElement(node.parent) && isScrollTable(node.parent.openingElement.tagName))) {
        found(node, 'bare-table');
      }
    } else if (ts.isJsxSelfClosingElement(node) && isScrollTable(node.tagName)) {
      found(node, 'not-only-a-table');
    } else if (ts.isJsxElement(node) && isScrollTable(node.openingElement.tagName)) {
      const children = node.children.filter((child) => !isEmptyChild(child));
      if (children.length !== 1 || !children.every(isTable)) {
        found(node, 'not-only-a-table');
      }
    } else if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      const [tag] = node.arguments;
      if (CREATORS.has(callee) && tag !== undefined && ts.isStringLiteralLike(tag) && tag.text.toLowerCase() === 'table') {
        found(node, 'created-table');
      }
    } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'dangerouslySetInnerHTML' && node.initializer !== undefined) {
      if (markupTexts(node.initializer, initializers, new Set()).some((markup) => TABLE_MARKUP.test(markup))) {
        found(node, 'table-in-markup');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { tables, findings };
}

function described({ file, line, rule }: Finding): string {
  return `apps/web/src/${file}:${String(line)}: ${rule}: ${FIXES[rule]} (docs/adr/0078)`;
}

/** This file's line holding an exemption, so a failure names the line to edit. */
function exemptionLine(file: string): number {
  return readFileSync(import.meta.filename, 'utf8').split('\n').findIndex((text) => text.trimStart().startsWith(`'${file}': {`)) + 1;
}

/** Each exemption whose file holds another number of bare tables than it says, in words that name the line to edit. */
function exemptionProblems(
  exemptions: Readonly<Record<string, { readonly tables: number }>>,
  bare: readonly Finding[],
  lineOf: (file: string) => number,
): string[] {
  return Object.entries(exemptions).flatMap(([file, { tables }]) => {
    const lines = bare.filter((finding) => finding.file === file).map((finding) => finding.line);
    if (lines.length === tables) {
      return [];
    }
    const where = `${GUARD}:${String(lineOf(file))}`;
    const at = lines.length === 0 ? '' : ` (${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')})`;
    const held = `apps/web/src/${file} holds ${String(lines.length)} bare ${lines.length === 1 ? 'table' : 'tables'}${at} and its exemption says ${String(tables)}`;
    return [
      lines.length < tables
        ? `${held}: ${lines.length === 0 ? 'its tables are wrapped (or the file is gone), so delete the exemption' : `a table was wrapped, so lower the exemption to ${String(lines.length)}`} at ${where}`
        : `${held}: a new table goes in ScrollTable (docs/adr/0078), never in the exemption at ${where}`,
    ];
  });
}

describe('every table in the web app scrolls in ScrollTable', () => {
  const read = FILES.map(({ file, text }) => tableFindings(file, text));
  const findings = read.flatMap((result) => result.findings);

  it('makes each table the direct and only child of ScrollTable, but the bare tables of #42’s files', () => {
    expect(read.reduce((sum, result) => sum + result.tables, 0)).toBeGreaterThan(80);
    expect(findings.filter((finding) => !(finding.rule === 'bare-table' && finding.file in AFTER_42)).map(described)).toEqual([]);
  });

  it('holds each exemption to exactly the bare tables its file has, so one that no longer matches fails', () => {
    expect(exemptionProblems(AFTER_42, findings.filter((finding) => finding.rule === 'bare-table'), exemptionLine)).toEqual([]);
    expect(Object.keys(AFTER_42).map(exemptionLine).every((line) => line > 0)).toBe(true);
  });

  it('finds each rule’s table in sources read from memory, whatever name ScrollTable is imported under', () => {
    const page = 'app/p/[practiceId]/fixture/page.tsx';
    const named = "import { ScrollTable } from '../../../../components/scroll-table';\n";
    const cases: readonly { readonly file?: string; readonly text: string; readonly rules: readonly Rule[] }[] = [
      { text: `${named}export const A = <ScrollTable label="Cases">\n  {/* the cases */}\n  <table aria-label="Cases" />\n</ScrollTable>;`, rules: [] },
      { text: "import { ScrollTable as Scroller } from '../../../../components/scroll-table';\nexport const A = <Scroller label=\"Cases\"><table /></Scroller>;", rules: [] },
      { text: "import * as scroll from '../../../../components/scroll-table.tsx';\nexport const A = <scroll.ScrollTable label=\"Cases\"><table /></scroll.ScrollTable>;", rules: [] },
      { text: 'export const A = <div className="overflow-x-auto"><table /></div>;', rules: ['bare-table'] },
      { text: 'function ScrollTable({ children }) {\n  return <div>{children}</div>;\n}\nexport const A = <ScrollTable label="Cases"><table /></ScrollTable>;', rules: ['bare-table'] },
      { text: "import { ScrollTable } from '../../../../components/packets/scroll-table';\nexport const A = <ScrollTable label=\"Cases\"><table /></ScrollTable>;", rules: ['bare-table'] },
      { text: "import type { ScrollTable } from '../../../../components/scroll-table';\nexport const A = <ScrollTable label=\"Cases\"><table /></ScrollTable>;", rules: ['bare-table'] },
      { text: `${named}export const A = <ScrollTable label="Cases"><div><table /></div></ScrollTable>;`, rules: ['not-only-a-table', 'bare-table'] },
      { text: `${named}export const A = (shown: boolean) => <ScrollTable label="Cases">{shown ? <table /> : null}</ScrollTable>;`, rules: ['not-only-a-table', 'bare-table'] },
      { text: `${named}export const A = <ScrollTable label="Cases"><table /><table /></ScrollTable>;`, rules: ['not-only-a-table'] },
      { text: `${named}export const A = <ScrollTable label="Cases"><pre>{'{}'}</pre></ScrollTable>;`, rules: ['not-only-a-table'] },
      { text: `${named}export const A = <ScrollTable label="Cases"><table />, sorted</ScrollTable>;`, rules: ['not-only-a-table'] },
      { text: `${named}export const A = <ScrollTable label="Cases" />;`, rules: ['not-only-a-table'] },
      { file: 'lib/fixture.ts', text: "import { createElement } from 'react';\nexport const A = createElement('table', null);", rules: ['created-table'] },
      { file: 'lib/fixture.ts', text: "import React from 'react';\nexport const A = React.createElement(`table`);", rules: ['created-table'] },
      { file: 'lib/fixture.ts', text: "export const A = () => document.createElement('TABLE');", rules: ['created-table'] },
      { text: "import { jsx } from 'react/jsx-runtime';\nexport const A = jsx('table', {});", rules: ['created-table'] },
      { text: "export const A = <div dangerouslySetInnerHTML={{ __html: '<table><tr><td>1</td></tr></table>' }} />;", rules: ['table-in-markup'] },
      { text: 'const ROWS = 1;\nconst MARKUP = `<TABLE class="x">${String(ROWS)}</TABLE>`;\nexport const A = <div dangerouslySetInnerHTML={{ __html: MARKUP }} />;', rules: ['table-in-markup'] },
      { text: "export const A = <div dangerouslySetInnerHTML={{ __html: '<p>A tablet, a <tbody> alone</p>' }} />;", rules: [] },
    ];
    for (const { file = page, text, rules } of cases) {
      expect(tableFindings(file, text).findings.map((finding) => finding.rule), text).toEqual(rules);
    }
    expect(tableFindings(page, `${named}export const A = (\n  <div>\n    <table />\n  </div>\n);`).findings.map(described)).toEqual([`apps/web/src/${page}:4: bare-table: ${FIXES['bare-table']} (docs/adr/0078)`]);

    // An exemption's count against the bare tables found: stale, exceeded, lowered and matched, each failure naming the line to edit.
    const exemptions = { 'app/one/page.tsx': { tables: 1 }, 'app/two/page.tsx': { tables: 1 }, 'app/three/page.tsx': { tables: 2 }, 'app/four/page.tsx': { tables: 1 } };
    const bare: Finding[] = [
      { file: 'app/two/page.tsx', line: 12, rule: 'bare-table' },
      { file: 'app/two/page.tsx', line: 40, rule: 'bare-table' },
      { file: 'app/three/page.tsx', line: 7, rule: 'bare-table' },
      { file: 'app/four/page.tsx', line: 9, rule: 'bare-table' },
    ];
    expect(exemptionProblems(exemptions, bare, () => 16)).toEqual([
      `apps/web/src/app/one/page.tsx holds 0 bare tables and its exemption says 1: its tables are wrapped (or the file is gone), so delete the exemption at ${GUARD}:16`,
      `apps/web/src/app/two/page.tsx holds 2 bare tables (lines 12, 40) and its exemption says 1: a new table goes in ScrollTable (docs/adr/0078), never in the exemption at ${GUARD}:16`,
      `apps/web/src/app/three/page.tsx holds 1 bare table (line 7) and its exemption says 2: a table was wrapped, so lower the exemption to 1 at ${GUARD}:16`,
    ]);
  });
});
