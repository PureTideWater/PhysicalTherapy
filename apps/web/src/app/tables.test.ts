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
 * markup the source cannot see). Two rules more keep the tables apart and their words whole: a table in a list is
 * named apart from its neighbours (the correctness review's F2; axe's landmark-unique at 390 px), and a long value
 * in a cell breaks only past a floor of its own (UX-PR79-01).
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
 * - not-only-a-table: a ScrollTable whose children are not exactly one element, a `<table>`;
 * - wrap-in-cell: `wrap-anywhere` on a `<td>` or `<th>`, which lowers its column's min-content to a character, so
 *   auto layout narrows the column and breaks names, codes and words where there is room;
 * - unfloored-wrap: `wrap-anywhere` inside a cell on an element that neither has a min-w nor sits in one inside the
 *   cell (a block: min-width holds no inline box), so it lowers the column's min-content just the same;
 * - repeated-label: a ScrollTable label that is a plain literal (or built from literals and the props alone) inside a
 *   `.map` callback, or inside a component rendered from one, in this file or through a relative import: every row's
 *   region would have one name.
 */
type Rule = 'bare-table' | 'created-table' | 'table-in-markup' | 'not-only-a-table' | 'wrap-in-cell' | 'unfloored-wrap' | 'repeated-label';

/** The rules that put each table in ScrollTable, and the rules that keep a long value's breaks inside a floor. */
const TABLE_RULES: ReadonlySet<Rule> = new Set(['bare-table', 'created-table', 'table-in-markup', 'not-only-a-table']);
const WRAP_RULES: ReadonlySet<Rule> = new Set(['wrap-in-cell', 'unfloored-wrap']);

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
  'wrap-in-cell': 'take wrap-anywhere off the cell and put the value in a block with a min-w inside it (block min-w-32 wrap-anywhere; min-w-40 for an email), so a token breaks only when it alone is wider than that',
  'unfloored-wrap': 'inside a cell, wrap-anywhere goes on a block with a min-w, or inside one (block min-w-32 wrap-anywhere), so auto layout cannot narrow the column below it; words of plain text need no wrap-anywhere',
  'repeated-label': 'each table of a list needs a name of its own: number its label as the page numbers the rows (`Entries of case line ${n}`) or take it from the row, so no two regions share a name',
};

/** The functions that make an element from a tag name: React's (classic and automatic runtimes) and the document's. */
const CREATORS = new Set(['createElement', 'jsx', 'jsxs', 'jsxDEV']);

const TABLE_MARKUP = /<table\b/i;

/** A class that lets a word break between any two characters, so its box's min-content is one character. */
const breaksAnywhere = (name: string): boolean => name === 'wrap-anywhere' || name.endsWith(':wrap-anywhere') || name.includes('overflow-wrap:anywhere');

/** A minimum width at every width (no variant), above zero: `min-w-32`, `min-w-[10rem]`, `min-w-sm`. */
const FLOOR = /^min-w-(?:[1-9]\d*(?:\.\d+)?|\[[^\]]+\]|\([^)]+\)|3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)$/;

/** A class that makes an element a block-level or atomic box, which a min-width holds; an inline box ignores it. */
const BOX = /^(?:block|inline-block|flex|inline-flex|grid|inline-grid|flow-root|table|list-item)$/;

/** Elements that are blocks by default. */
const BLOCK_TAGS = new Set(['div', 'p', 'pre', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'section', 'article', 'figure', 'blockquote', 'form', 'fieldset', 'details', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const CELLS = new Set(['td', 'th']);

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

/** A JSX element's opening tag, or the element itself when it closes itself; undefined for anything else. */
function openingOf(node: ts.Node): ts.JsxOpeningLikeElement | undefined {
  return ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
}

/** A JSX element's tag name when it is a plain name (`td`, `ScrollTable`); '' otherwise. */
function tagOf(node: ts.Node): string {
  const tag = openingOf(node)?.tagName;
  return tag !== undefined && ts.isIdentifier(tag) ? tag.text : '';
}

function isTable(node: ts.Node): boolean {
  return tagOf(node) === 'table';
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

/** Each file parsed once, for every rule that reads it (a source read from memory under a file's name replaces it). */
const PARSED = new Map<string, { readonly text: string; readonly source: ts.SourceFile }>();

function parsed(file: string, text: string): ts.SourceFile {
  const known = PARSED.get(file);
  if (known?.text === text) {
    return known.source;
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  PARSED.set(file, { text, source });
  return source;
}

/** The test for ScrollTable's tag in a file: one of the names it is imported under, or its namespace's member. */
function scrollTableTag(file: string, source: ts.SourceFile): (tag: ts.JsxTagNameExpression) => boolean {
  const { names, namespaces } = scrollTableBindings(file, source);
  return (tag) =>
    ts.isIdentifier(tag) ? names.has(tag.text) : ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && namespaces.has(tag.expression.text) && tag.name.text === 'ScrollTable';
}

/** Every variable's initializers in a file, by its name (any scope). */
function initializersOf(source: ts.SourceFile): ReadonlyMap<string, readonly ts.Expression[]> {
  const initializers = new Map<string, ts.Expression[]>();
  const declarations = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      initializers.set(node.name.text, [...(initializers.get(node.name.text) ?? []), node.initializer]);
    }
    ts.forEachChild(node, declarations);
  };
  declarations(source);
  return initializers;
}

/** The class names a JSX element's className can hold: every string under it, a name followed to its initializer. */
function classesOf(opening: ts.JsxOpeningLikeElement, initializers: ReadonlyMap<string, readonly ts.Expression[]>): readonly string[] {
  const attribute = opening.attributes.properties.find((property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === 'className');
  const initializer = attribute !== undefined && ts.isJsxAttribute(attribute) ? attribute.initializer : undefined;
  return initializer === undefined ? [] : markupTexts(initializer, initializers, new Set()).flatMap((text) => text.split(/\s+/)).filter((name) => name !== '');
}

/** Whether an element's box holds a min-width above zero: a floor on a block, or on an inline element made a box. */
function floored(tag: string, classes: readonly string[]): boolean {
  return classes.some((name) => FLOOR.test(name)) && (BLOCK_TAGS.has(tag) || classes.some((name) => BOX.test(name)));
}

/**
 * The wrap rules for one JSX element that lets words break anywhere: on a cell, or inside one with no floor on it or
 * on an element between it and the cell; null when it sits in no cell, or in a floor.
 */
function wrapRule(node: ts.Node, initializers: ReadonlyMap<string, readonly ts.Expression[]>): Rule | null {
  if (CELLS.has(tagOf(node))) {
    return 'wrap-in-cell';
  }
  let floor = false;
  for (let at: ts.Node | undefined = node; at !== undefined; at = at.parent) {
    const opening = openingOf(at);
    if (opening === undefined) {
      continue;
    }
    if (at !== node && CELLS.has(tagOf(at))) {
      return floor ? null : 'unfloored-wrap';
    }
    floor ||= floored(tagOf(at), classesOf(opening, initializers));
  }
  return null;
}

/** What the rules find in one file, and how many tables it writes in JSX. */
function tableFindings(file: string, text: string): { readonly tables: number; readonly findings: readonly Finding[] } {
  const source = parsed(file, text);
  const isScrollTable = scrollTableTag(file, source);
  const initializers = initializersOf(source);
  const findings: Finding[] = [];
  let tables = 0;
  const found = (node: ts.Node, rule: Rule) => {
    findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, rule });
  };
  const visit = (node: ts.Node) => {
    const opening = openingOf(node);
    if (opening !== undefined && classesOf(opening, initializers).some(breaksAnywhere)) {
      const rule = wrapRule(node, initializers);
      if (rule !== null) {
        found(node, rule);
      }
    }
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

/**
 * A label's value as far as the source shows it: dynamic (it may differ from row to row), or built from literals and
 * the named props of the function it is written in alone (none: a plain literal, the same wherever it renders).
 */
type Value = { readonly dynamic: true } | { readonly dynamic: false; readonly props: ReadonlySet<string> };

const DYNAMIC: Value = { dynamic: true };
const PLAIN: Value = { dynamic: false, props: new Set() };

function joined(values: readonly Value[]): Value {
  const props = new Set<string>();
  for (const value of values) {
    if (value.dynamic) {
      return DYNAMIC;
    }
    for (const prop of value.props) {
      props.add(prop);
    }
  }
  return { dynamic: false, props };
}

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

/** A named function (a component, or a helper that returns JSX): the props its first parameter names, by local name. */
interface Named {
  readonly name: string;
  readonly node: FunctionNode;
  readonly props: ReadonlyMap<string, { readonly prop: string; readonly fallback?: ts.Expression }>;
  /** The first parameter's name when it takes the props whole (`props.label`), or a rest element's. */
  readonly whole: string | null;
}

/** Where a tag or a call renders: the function it is written in, and whether it is inside a `.map` callback there. */
interface Render {
  readonly line: number;
  /** ScrollTable's tag, or the name of the function or component rendered. */
  readonly target: { readonly scrollTable: true } | { readonly scrollTable: false; readonly name: string };
  readonly owner: string | null;
  readonly inMap: boolean;
  /** Each attribute's value; a spread may set any other. */
  readonly attributes: ReadonlyMap<string, Value>;
  readonly spread: boolean;
}

interface LabelFacts {
  readonly file: string;
  readonly named: ReadonlyMap<string, Named & { readonly fallbacks: ReadonlyMap<string, Value> }>;
  /** Each relative import's local name: its module (relative to SOURCE, no extension) and the name it exports. */
  readonly imports: ReadonlyMap<string, { readonly module: string; readonly name: string }>;
  /** Each exported name's local name. */
  readonly exports: ReadonlyMap<string, string>;
  readonly renders: readonly Render[];
}

function bindingNames(name: ts.BindingName): string[] {
  return ts.isIdentifier(name) ? [name.text] : name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)));
}

/** React's wrappers of a component, which keep it the component it was. */
const WRAPPERS = new Set(['memo', 'forwardRef']);

/** The name a function is known by: its own, or the variable's it is assigned to (through memo or forwardRef too). */
function nameOf(node: FunctionNode): string | null {
  if (ts.isFunctionDeclaration(node)) {
    return node.name?.text ?? null;
  }
  const call = node.parent;
  const wrapped = ts.isCallExpression(call) && WRAPPERS.has(ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : ts.isIdentifier(call.expression) ? call.expression.text : '');
  const holder = wrapped ? call.parent : node.parent;
  return ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) ? holder.name.text : null;
}

function isFunction(node: ts.Node): node is FunctionNode {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
}

/** A callback of `.map`, `.flatMap` or `Array.from(…, callback)`: it renders once a row. */
function isMapCallback(node: ts.Node): boolean {
  const call = node.parent;
  if (!isFunction(node) || !ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) {
    return false;
  }
  const method = call.expression.name.text;
  return (['map', 'flatMap'].includes(method) && call.arguments[0] === node) || (method === 'from' && call.arguments[1] === node);
}

/** The props a function's first parameter names: `{ label, title: heading = 'x' }`, or the props whole. */
function propsOf(node: FunctionNode): Pick<Named, 'props' | 'whole'> {
  const parameter = node.parameters[0];
  const props = new Map<string, { readonly prop: string; readonly fallback?: ts.Expression }>();
  if (parameter === undefined) {
    return { props, whole: null };
  }
  if (ts.isIdentifier(parameter.name)) {
    return { props, whole: parameter.name.text };
  }
  let whole: string | null = null;
  if (ts.isObjectBindingPattern(parameter.name)) {
    for (const element of parameter.name.elements) {
      if (!ts.isIdentifier(element.name)) {
        continue;
      }
      if (element.dotDotDotToken !== undefined) {
        whole = element.name.text;
        continue;
      }
      const key = element.propertyName;
      const prop = key === undefined ? element.name.text : ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : null;
      if (prop !== null) {
        props.set(element.name.text, { prop, ...(element.initializer === undefined ? {} : { fallback: element.initializer }) });
      }
    }
  }
  return { props, whole };
}

/** The variable a block-like scope declares by this name, if it declares one. */
function declaredIn(scope: ts.Node, name: string): ts.VariableDeclaration | undefined {
  const statements = ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope) ? scope.statements : [];
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      const found = statement.declarationList.declarations.find((declaration) => bindingNames(declaration.name).includes(name));
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * What a name refers to where it is used, from the nearest scope out: a function's parameter, a loop's or a catch
 * clause's variable, or a variable a block or the file declares; null for an import or a global.
 */
function bindingOf(identifier: ts.Identifier): { readonly parameterOf: FunctionNode } | { readonly loop: true } | { readonly variable: ts.VariableDeclaration } | null {
  const name = identifier.text;
  for (let at: ts.Node = identifier; !ts.isSourceFile(at); at = at.parent) {
    const scope = at.parent;
    if (isFunction(scope) && scope.parameters.some((parameter) => bindingNames(parameter.name).includes(name))) {
      return { parameterOf: scope };
    }
    const loop = ts.isForOfStatement(scope) || ts.isForInStatement(scope) || ts.isForStatement(scope) ? scope.initializer : undefined;
    if (
      (loop !== undefined && ts.isVariableDeclarationList(loop) && loop.declarations.some((declaration) => bindingNames(declaration.name).includes(name))) ||
      (ts.isCatchClause(scope) && scope.variableDeclaration !== undefined && bindingNames(scope.variableDeclaration.name).includes(name))
    ) {
      return { loop: true };
    }
    const variable = declaredIn(scope, name);
    if (variable !== undefined) {
      return { variable };
    }
  }
  return null;
}

/** The object literal a constant holds (through `as const`), for a constant's property used as a label. */
function objectOf(identifier: ts.Identifier): ts.ObjectLiteralExpression | undefined {
  const binding = bindingOf(identifier);
  let initializer = binding !== null && 'variable' in binding && ts.isIdentifier(binding.variable.name) ? binding.variable.initializer : undefined;
  while (initializer !== undefined && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer) || ts.isParenthesizedExpression(initializer))) {
    initializer = initializer.expression;
  }
  return initializer !== undefined && ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

/** What one file holds for the repeated-label rule: its named functions, imports and exports, and every render. */
function labelFacts(file: string, text: string): LabelFacts {
  const source = parsed(file, text);
  const isScrollTable = scrollTableTag(file, source);
  const named = new Map<string, Named & { fallbacks: Map<string, Value> }>();
  const imports = new Map<string, { readonly module: string; readonly name: string }>();
  const exports = new Map<string, string>();
  const renders: Render[] = [];
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  /** The named function a node is written in, and whether a `.map` callback lies between the two. */
  const placeOf = (node: ts.Node): { readonly owner: (Named & { fallbacks: Map<string, Value> }) | null; readonly inMap: boolean } => {
    let inMap = false;
    for (let at = node.parent; !ts.isSourceFile(at); at = at.parent) {
      if (isFunction(at)) {
        const name = nameOf(at);
        const owner = name === null ? undefined : named.get(name);
        if (owner?.node === at) {
          return { owner, inMap };
        }
        inMap ||= isMapCallback(at);
      }
    }
    return { owner: null, inMap };
  };

  /**
   * A name's value where it is used: a named prop of the function it is written in, a variable's initializer (not one
   * destructured from a value), or dynamic (a callback's parameter, a loop's variable, an import).
   */
  const bound = (identifier: ts.Identifier, owner: Named | null, seen: Set<ts.Node>): Value => {
    const binding = bindingOf(identifier);
    if (binding !== null && 'parameterOf' in binding) {
      const prop = binding.parameterOf === owner?.node ? owner.props.get(identifier.text) : undefined;
      return prop === undefined ? DYNAMIC : { dynamic: false, props: new Set([prop.prop]) };
    }
    return binding !== null && 'variable' in binding && ts.isIdentifier(binding.variable.name) && binding.variable.initializer !== undefined
      ? valueOf(binding.variable.initializer, owner, seen)
      : DYNAMIC;
  };

  /** An expression's value: literals and props joined by a template, `+`, `??`, `||` or a condition; anything else dynamic. */
  const valueOf = (node: ts.Expression, owner: Named | null, seen: Set<ts.Node>): Value => {
    if (seen.has(node)) {
      return DYNAMIC;
    }
    seen.add(node);
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      return PLAIN;
    }
    if (ts.isTemplateExpression(node)) {
      return joined(node.templateSpans.map((span) => valueOf(span.expression, owner, seen)));
    }
    // `String(n)` is n's value in words.
    const [argument] = ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'String' ? node.arguments : [];
    if (argument !== undefined) {
      return valueOf(argument, owner, seen);
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
      return valueOf(node.expression, owner, seen);
    }
    if (ts.isConditionalExpression(node)) {
      return joined([valueOf(node.whenTrue, owner, seen), valueOf(node.whenFalse, owner, seen)]);
    }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) {
      return joined([valueOf(node.left, owner, seen), valueOf(node.right, owner, seen)]);
    }
    if (ts.isIdentifier(node)) {
      return bound(node, owner, seen);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      // The props taken whole (`props.label`), or a constant object's property (`LABELS.entries`).
      const binding = bindingOf(node.expression);
      if (owner !== null && node.expression.text === owner.whole && binding !== null && 'parameterOf' in binding && binding.parameterOf === owner.node) {
        return { dynamic: false, props: new Set([node.name.text]) };
      }
      const property = objectOf(node.expression)?.properties.find((member) => ts.isPropertyAssignment(member) && ts.isIdentifier(member.name) && member.name.text === node.name.text);
      return property !== undefined && ts.isPropertyAssignment(property) ? valueOf(property.initializer, owner, seen) : DYNAMIC;
    }
    return DYNAMIC;
  };

  const collect = (node: ts.Node) => {
    if (isFunction(node)) {
      const name = nameOf(node);
      if (name !== null && !named.has(name)) {
        named.set(name, { name, node, ...propsOf(node), fallbacks: new Map() });
      }
    } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause !== undefined && !node.importClause.isTypeOnly) {
      const from = resolved(file, node.moduleSpecifier.text);
      const bindings = node.importClause.namedBindings;
      if (from !== null) {
        if (node.importClause.name !== undefined) {
          imports.set(node.importClause.name.text, { module: from, name: 'default' });
        }
        if (bindings !== undefined && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            imports.set(element.name.text, { module: from, name: (element.propertyName ?? element.name).text });
          }
        }
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier === undefined && node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        exports.set(element.name.text, (element.propertyName ?? element.name).text);
      }
    } else if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      exports.set('default', node.expression.text);
    }
    const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
        exports.set(isDefault ? 'default' : node.name.text, node.name.text);
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          for (const name of bindingNames(declaration.name)) {
            exports.set(name, name);
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  for (const function_ of named.values()) {
    for (const [, { prop, fallback }] of function_.props) {
      if (fallback !== undefined) {
        function_.fallbacks.set(prop, valueOf(fallback, function_, new Set()));
      }
    }
  }

  const attributesOf = (opening: ts.JsxOpeningLikeElement, owner: Named | null) => {
    const attributes = new Map<string, Value>();
    let spread = false;
    for (const property of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        spread = true;
      } else if (ts.isIdentifier(property.name) && property.initializer !== undefined) {
        const { initializer } = property;
        attributes.set(
          property.name.text,
          ts.isStringLiteral(initializer) ? PLAIN : ts.isJsxExpression(initializer) && initializer.expression !== undefined ? valueOf(initializer.expression, owner, new Set()) : DYNAMIC,
        );
      }
    }
    return { attributes, spread };
  };
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : undefined;
    const component = opening !== undefined && ts.isIdentifier(opening.tagName) && /^[A-Z]/.test(opening.tagName.text) ? opening.tagName.text : null;
    if (opening !== undefined && (isScrollTable(opening.tagName) || component !== null)) {
      const { owner, inMap } = placeOf(node);
      const target = isScrollTable(opening.tagName) || component === null ? { scrollTable: true as const } : { scrollTable: false as const, name: component };
      renders.push({ line: lineOf(node), target, owner: owner?.name ?? null, inMap, ...attributesOf(opening, owner) });
    } else if (ts.isCallExpression(node)) {
      const { owner, inMap } = placeOf(node);
      // A helper called by name, and a function passed whole to `.map` (`rows.map(Row)`), which renders once a row.
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (callee !== null) {
        renders.push({ line: lineOf(node), target: { scrollTable: false, name: callee }, owner: owner?.name ?? null, inMap, attributes: new Map(), spread: false });
      }
      const [first] = node.arguments;
      if (ts.isPropertyAccessExpression(node.expression) && ['map', 'flatMap'].includes(node.expression.name.text) && first !== undefined && ts.isIdentifier(first)) {
        renders.push({ line: lineOf(node), target: { scrollTable: false, name: first.text }, owner: owner?.name ?? null, inMap: true, attributes: new Map(), spread: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { file, named, imports, exports, renders };
}

/**
 * The repeated-label rule over a set of files read together, so a component imported from another file is followed:
 * which named functions pass which props on to a ScrollTable's label (through any depth of components), which are
 * rendered once a row (from a `.map` callback, or from a function so rendered), and each render whose label is the
 * same for every row. A render inside a `.map` callback whose label is built from literals and the props alone is
 * the same in every row; a plain literal is the same in every row of a function rendered once a row.
 */
function repeatedLabels(files: readonly { readonly file: string; readonly text: string }[]): readonly Finding[] {
  const facts = files.filter(({ file }) => file.endsWith('.tsx') || file.endsWith('.ts')).map(({ file, text }) => labelFacts(file, text));
  const byModule = new Map<string, LabelFacts>();
  for (const fact of facts) {
    const stem = fact.file.replace(/\.[jt]sx?$/, '');
    byModule.set(stem, fact);
    if (stem.endsWith('/index')) {
      byModule.set(stem.slice(0, -'/index'.length), fact);
    }
  }
  /** A rendered name's function, as `<file>#<name>`: the file's own, or the one a relative import names. */
  const resolve = (fact: LabelFacts, name: string): string | null => {
    if (fact.named.has(name)) {
      return `${fact.file}#${name}`;
    }
    const imported = fact.imports.get(name);
    const target = imported === undefined ? undefined : byModule.get(imported.module);
    const local = imported === undefined ? undefined : target?.exports.get(imported.name);
    return target !== undefined && local !== undefined && target.named.has(local) ? `${target.file}#${local}` : null;
  };
  const functions = new Map<string, { readonly fallbacks: ReadonlyMap<string, Value> }>(facts.flatMap((fact) => [...fact.named.values()].map((named) => [`${fact.file}#${named.name}`, named] as const)));
  const forwards = new Map<string, Set<string>>();
  /** The label values one render passes on: ScrollTable's label, or each prop its component passes on to one. */
  const labels = (fact: LabelFacts, render: Render): readonly Value[] => {
    if (render.target.scrollTable) {
      return [render.attributes.get('label') ?? DYNAMIC];
    }
    const key = resolve(fact, render.target.name);
    return [...(key === null ? [] : (forwards.get(key) ?? []))].map(
      (prop) => render.attributes.get(prop) ?? (render.spread ? DYNAMIC : ((key === null ? undefined : functions.get(key)?.fallbacks.get(prop)) ?? DYNAMIC)),
    );
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const fact of facts) {
      for (const render of fact.renders.filter((candidate) => candidate.owner !== null && !candidate.inMap)) {
        const owner = `${fact.file}#${render.owner ?? ''}`;
        for (const value of labels(fact, render)) {
          for (const prop of value.dynamic ? [] : value.props) {
            const known = forwards.get(owner) ?? new Set<string>();
            if (!known.has(prop)) {
              forwards.set(owner, known.add(prop));
              changed = true;
            }
          }
        }
      }
    }
  }
  const repeated = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const fact of facts) {
      for (const render of fact.renders) {
        const key = render.target.scrollTable ? null : resolve(fact, render.target.name);
        if (key !== null && !repeated.has(key) && (render.inMap || (render.owner !== null && repeated.has(`${fact.file}#${render.owner}`)))) {
          repeated.add(key);
          changed = true;
        }
      }
    }
  }
  return facts.flatMap((fact) =>
    fact.renders
      .filter((render) => {
        const rendersOnceARow = render.owner !== null && repeated.has(`${fact.file}#${render.owner}`);
        return labels(fact, render).some((value) => !value.dynamic && (render.inMap || (rendersOnceARow && value.props.size === 0)));
      })
      .map((render) => ({ file: fact.file, line: render.line, rule: 'repeated-label' as const })),
  );
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
    expect(findings.filter((finding) => TABLE_RULES.has(finding.rule) && !(finding.rule === 'bare-table' && finding.file in AFTER_42)).map(described)).toEqual([]);
  });

  it('names each table of a list apart: no ScrollTable label the same in every row of a .map, here or through a component (axe’s landmark-unique)', () => {
    expect(repeatedLabels(FILES).map(described)).toEqual([]);
  });

  it('lets a long value in a cell break only past a floor: wrap-anywhere never on a <td> or <th>, and inside one only on or within a block with a min-w (UX-PR79-01)', () => {
    expect(findings.filter((finding) => WRAP_RULES.has(finding.rule)).map(described)).toEqual([]);
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

  it('finds a long value’s break outside a floor in sources read from memory: on a cell, or inside one on no block with a min-w', () => {
    const page = 'app/p/[practiceId]/fixture/page.tsx';
    const cell = (inner: string) =>
      `import { ScrollTable } from '../../../../components/scroll-table';\nexport const A = <ScrollTable label="Keys"><table aria-label="Keys"><tbody><tr>${inner}</tr></tbody></table></ScrollTable>;`;
    const cases: readonly { readonly text: string; readonly rules: readonly Rule[] }[] = [
      { text: cell('<td className="py-2 pr-2 wrap-anywhere">SYNTHETIC-KEY</td>'), rules: ['wrap-in-cell'] },
      { text: `import { cn } from '@tp/ui';
${cell("<th className={cn('pr-2', 'wrap-anywhere')}>Key</th>")}`, rules: ['wrap-in-cell'] },
      { text: `const CELL = 'py-2 sm:wrap-anywhere';
${cell('<td className={CELL}>SYNTHETIC-KEY</td>')}`, rules: ['wrap-in-cell'] },
      { text: cell('<td className="py-2"><span className="wrap-anywhere">SYNTHETIC-KEY</span></td>'), rules: ['unfloored-wrap'] },
      // A span is an inline box, which a min-width does not hold; a floor that holds only from a breakpoint is none.
      { text: cell('<td className="py-2"><span className="min-w-32 wrap-anywhere">SYNTHETIC-KEY</span></td>'), rules: ['unfloored-wrap'] },
      { text: cell('<td className="py-2"><span className="block sm:min-w-32 wrap-anywhere">SYNTHETIC-KEY</span></td>'), rules: ['unfloored-wrap'] },
      { text: cell('<td className="py-2"><div className="min-w-0 wrap-anywhere">SYNTHETIC-KEY</div></td>'), rules: ['unfloored-wrap'] },
      { text: cell('<td className="py-2"><a className="underline wrap-anywhere" href="/x">synthetic@synthetic.test</a></td>'), rules: ['unfloored-wrap'] },
      // Floored: the element's own min-w on a block, or a block with a min-w around it inside the cell.
      { text: cell('<td className="py-2"><span className="block min-w-32 wrap-anywhere">SYNTHETIC-KEY</span></td>'), rules: [] },
      { text: cell('<td className="py-2"><div className="min-w-40 wrap-anywhere">synthetic@synthetic.test</div></td>'), rules: [] },
      { text: cell('<td className="py-2"><div className="min-w-[10rem]"><code className="font-mono wrap-anywhere">SYNTHETIC-KEY</code></div></td>'), rules: [] },
      { text: cell('<td className="py-2"><a className="inline-block min-w-32 wrap-anywhere underline" href="/x">SYNTHETIC-KEY</a></td>'), rules: [] },
      // Outside a table it breaks only where the box is full, which narrows no column.
      { text: 'export const A = <p className="wrap-anywhere">SYNTHETIC-KEY</p>;', rules: [] },
      { text: cell('<td className="py-2 whitespace-nowrap">2026-04-05</td>'), rules: [] },
    ];
    for (const { text, rules } of cases) {
      expect(tableFindings(page, text).findings.map((finding) => finding.rule), text).toEqual(rules);
    }
  });

  it('finds a label that is the same in every row of a list in sources read from memory, through components and imports', () => {
    const page = 'app/p/[practiceId]/fixture/page.tsx';
    const named = "import { ScrollTable } from '../../../../components/scroll-table';\n";
    const table = (label: string) => `<ScrollTable label=${label}><table aria-label=${label} /></ScrollTable>`;
    const lines = (files: readonly { readonly file?: string; readonly text: string }[]) =>
      repeatedLabels(files.map(({ file = page, text }) => ({ file, text }))).map((finding) => `${finding.file}:${String(finding.line)}`);
    // A literal, a constant and a label of literals alone, written in the callback: one name for every row.
    expect(lines([{ text: `${named}export const A = (rows) => rows.map((row) =>\n  ${table('"Entries"')});` }])).toEqual([`${page}:3`]);
    expect(lines([{ text: `${named}export const A = (rows) => rows.map((row) => {\n  const label = 'Entries';\n  return ${table('{label}')};\n});` }])).toEqual([`${page}:4`]);
    expect(lines([{ text: `${named}const LABELS = { entries: 'Entries' } as const;\nexport const A = (rows) => rows.flatMap((row) => [${table('{`${LABELS.entries} of the line`}')}]);` }])).toEqual([`${page}:3`]);
    // From the row, or numbered by it: a name of its own.
    expect(lines([{ text: `${named}export const A = (rows) => rows.map((row, index) => ${table('{`Entries of case line ${String(index + 1)}`}')});` }])).toEqual([]);
    expect(lines([{ text: `${named}export const A = (rows) => rows.map((row) => ${table('{row.label}')});` }])).toEqual([]);
    expect(lines([{ text: `${named}export const A = (rows) => {\n  for (const row of rows) {\n    void ${table('{row}')};\n  }\n};` }])).toEqual([]);
    // Outside a list: one table, one name.
    expect(lines([{ text: `${named}export function Page() {\n  return ${table('"Entries"')};\n}` }])).toEqual([]);
    // The review's F2: a literal passed through a component's prop, written in a component each row renders.
    const f2 = [
      `${named}function EntryTable({ entries, label }) {`,
      `  return ${table('{label}')};`,
      '}',
      'function LinkageItem({ line }) {',
      '  return <li><EntryTable entries={line.entries} label="Entries of the line" /></li>;',
      '}',
      'export function Page({ lines }) {',
      '  return <ul>{lines.map((line) => <LinkageItem key={line.id} line={line} />)}</ul>;',
      '}',
    ].join('\n');
    expect(lines([{ text: f2 }])).toEqual([`${page}:6`]);
    expect(lines([{ text: f2.replace('label="Entries of the line"', 'label={`Entries of case line ${String(line.place)}`}') }])).toEqual([]);
    // A prop's default, a prop renamed, and the props taken whole are followed the same way.
    expect(lines([{ text: `${named}function Entries({ label = 'Entries' }) {\n  return ${table('{label}')};\n}\nexport const A = (rows) => rows.map((row) => <Entries key={row.id} />);` }])).toEqual([`${page}:5`]);
    expect(lines([{ text: `${named}function Entries({ title: name }) {\n  return ${table('{name}')};\n}\nexport const A = (rows) => rows.map((row) => <Entries key={row.id} title="Entries" />);` }])).toEqual([`${page}:5`]);
    expect(lines([{ text: `${named}function Entries(props) {\n  return ${table('{`${props.title}, scrolled`}')};\n}\nexport const A = (rows) => rows.map((row) => <Entries key={row.id} title="Entries" />);` }])).toEqual([`${page}:5`]);
    // A component's own list: a label from its props is the same in each of its rows, whatever the caller passes.
    expect(lines([{ text: `${named}export function Lines({ label, rows }) {\n  return rows.map((row) => ${table('{label}')});\n}` }])).toEqual([`${page}:3`]);
    // A helper called once a row, and a component passed whole to .map.
    expect(lines([{ text: `${named}function entries(row) {\n  return ${table('"Entries"')};\n}\nexport const A = (rows) => rows.map((row) => entries(row));` }])).toEqual([`${page}:3`]);
    expect(lines([{ text: `${named}function Entries() {\n  return ${table('"Entries"')};\n}\nexport const A = (rows) => rows.map(Entries);` }])).toEqual([`${page}:3`]);
    // Through a relative import, under another name: the component in its own file, the list in the page.
    const component = 'components/fixture/entries.tsx';
    const entries = `import { ScrollTable } from '../scroll-table';\nexport function Entries({ label }) {\n  return ${table('{label}')};\n}`;
    expect(lines([{ file: component, text: entries }, { text: "import { Entries as Lines } from '../../../../components/fixture/entries';\nexport const A = (rows) => rows.map((row) => <Lines key={row.id} label=\"Entries\" />);" }])).toEqual([`${page}:2`]);
    expect(lines([{ file: component, text: entries }, { text: "import { Entries } from '../../../../components/fixture/entries';\nexport const A = (rows) => rows.map((row) => <Entries key={row.id} label={row.label} />);" }])).toEqual([]);
  });
});
