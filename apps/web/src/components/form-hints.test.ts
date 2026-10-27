import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every field the browser checks by `pattern` states its format in words (test matrix FRM-04; docs/adr/0077,
 * decision D9; WCAG 3.3.2): its `hint`, or an `aria-describedby` naming text the page writes, so the browser's
 * generic "Please match the requested format" is never the only guide. And every hint is 14 px, the size of the
 * message beside it (D9): text a control's description names is never written by hand at 12 px. And no form sets its
 * flex direction behind a breakpoint (D3), which the stylesheet's wrap rule reads by class. Read from the source with
 * the TypeScript compiler, so a field added later without a hint, a hint written small, or a form that turns at a
 * breakpoint fails here rather than waiting for a reviewer.
 */

const SOURCE = path.resolve(import.meta.dirname, '..');

/** Files whose pattern fields may not have a hint yet, each with the change that removes it. */
const ALLOWED = new Map([
  // Ticket (`[A-Za-z0-9-]{1,64}`): the page is #42's; remove after #42 merges, with the hint "Letters, digits and hyphens, as in SYN-1234."
  ['app/console/support/page.tsx', 'remove after #42 merges'],
]);

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test-support' ? [] : sources(child);
    }
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [child] : [];
  });
}

interface PatternField {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
  readonly described: boolean;
}

/** Each JSX element carrying a `pattern` attribute, and whether it also carries `hint` or `aria-describedby`. */
function patternFields(file: string, text: string): PatternField[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: PatternField[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const names = node.attributes.properties.flatMap((attribute) => (ts.isJsxAttribute(attribute) ? [attribute.name.getText(source)] : []));
      if (names.includes('pattern')) {
        found.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          tag: node.tagName.getText(source),
          described: names.includes('hint') || names.includes('aria-describedby'),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const FIELDS = sources(SOURCE).flatMap((file) => patternFields(path.relative(SOURCE, file).split(path.sep).join('/'), readFileSync(file, 'utf8')));

describe('format hints on pattern fields (FRM-04)', () => {
  it('finds the pattern fields it checks', () => {
    expect(FIELDS.length).toBeGreaterThan(5);
  });

  it('gives every field checked by a pattern a hint or a description that states its format', () => {
    const silent = FIELDS.filter((field) => !field.described && !ALLOWED.has(field.file)).map(({ file, line, tag }) => `${file}:${String(line)} <${tag}>`);
    expect(silent).toEqual([]);
  });

  it('keeps its allowlist short: each file on it still has a field without a hint', () => {
    const stale = [...ALLOWED.keys()].filter((file) => !FIELDS.some((field) => field.file === file && !field.described));
    expect(stale).toEqual([]);
  });
});

/** Files whose hand-written descriptions may still be 12 px, each with the change that removes it. */
const SMALL_ALLOWED = new Map([
  // The screening upload's file and template hints: the form is #42's; remove after #42 merges, with the shared Hint.
  ['components/screening/upload-form.tsx', 'remove after #42 merges'],
]);

interface Description {
  readonly file: string;
  readonly line: number;
  readonly id: string;
  readonly small: boolean;
}

/** The strings an attribute's value holds: a literal, or each literal inside an expression, a template whole. */
function attributeTexts(source: ts.SourceFile, value: ts.JsxAttributeValue | undefined): string[] {
  const texts: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      texts.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      texts.push(node.getText(source));
    } else {
      ts.forEachChild(node, visit);
    }
  };
  if (value !== undefined) {
    visit(value);
  }
  return texts;
}

const SIZED = /(^|\s)text-(xs|sm|base|lg|xl)(\s|$)/;

/**
 * Each element a control's `aria-describedby` names in the same file (by the same literal, or the same template), with
 * whether it is written at 12 px; and each shared `Hint` whose className sets a size, which only layout may.
 */
function descriptions(file: string, text: string): { readonly described: Description[]; readonly sizedHints: string[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const named = new Set<string>();
  const elements: Description[] = [];
  const sizedHints: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = new Map(node.attributes.properties.flatMap((attribute) => (ts.isJsxAttribute(attribute) ? [[attribute.name.getText(source), attributeTexts(source, attribute.initializer)] as const] : [])));
      for (const value of attributes.get('aria-describedby') ?? []) {
        for (const part of value.startsWith('`') ? [value] : value.split(/\s+/)) {
          named.add(part);
        }
      }
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const classes = attributes.get('className') ?? [];
      const id = attributes.get('id')?.[0];
      if (id !== undefined) {
        elements.push({ file, line, id, small: classes.some((value) => /(^|\s)text-xs(\s|$)/.test(value)) });
      }
      if (node.tagName.getText(source) === 'Hint' && classes.some((value) => SIZED.test(value))) {
        sizedHints.push(`${file}:${String(line)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { described: elements.filter((element) => named.has(element.id)), sizedHints };
}

const DESCRIPTIONS = sources(SOURCE).map((file) => descriptions(path.relative(SOURCE, file).split(path.sep).join('/'), readFileSync(file, 'utf8')));
const DESCRIBED = DESCRIPTIONS.flatMap((found) => found.described);

describe('hints at 14 px (FRM-04; docs/adr/0077, D9)', () => {
  it('finds the hand-written descriptions it checks', () => {
    expect(DESCRIBED.length).toBeGreaterThan(5);
  });

  it('writes no description a control names at 12 px: a hint uses the shared Hint', () => {
    const small = DESCRIBED.filter((found) => found.small && !SMALL_ALLOWED.has(found.file)).map(({ file, line, id }) => `${file}:${String(line)} #${id}`);
    expect(small).toEqual([]);
  });

  it('gives the shared Hint no size of its own: its className adds layout only', () => {
    expect(DESCRIPTIONS.flatMap((found) => found.sizedHints)).toEqual([]);
  });

  it('keeps its allowlist short: each file on it still has a description at 12 px', () => {
    const stale = [...SMALL_ALLOWED.keys()].filter((file) => !DESCRIBED.some((found) => found.file === file && found.small));
    expect(stale).toEqual([]);
  });
});

interface FormClasses {
  readonly where: string;
  readonly classes: string;
}

/** The classes each form's source writes: a `<form>`'s, an ActionForm's, or any `…Form` component's, which passes them on. */
function formClasses(file: string, text: string): FormClasses[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: FormClasses[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^(?:form|[A-Z]\w*Form)$/.test(node.tagName.getText(source))) {
      const where = `${file}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}`;
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'className') {
          found.push(...attributeTexts(source, attribute.initializer).map((classes) => ({ where, classes })));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const FORM_CLASSES = sources(SOURCE).flatMap((file) => formClasses(path.relative(SOURCE, file).split(path.sep).join('/'), readFileSync(file, 'utf8')));

/** A flex direction set behind a breakpoint or another variant: `md:flex-row`, `max-md:flex-col`. */
const DIRECTION_BY_VARIANT = /(^|\s)[\w-]+(:[\w-]+)*:flex-(row|col)(-reverse)?(\s|$)/;

describe('column forms that never wrap (FRM-08; docs/adr/0077, D3)', () => {
  it('finds the forms it checks', () => {
    expect(FORM_CLASSES.length).toBeGreaterThan(50);
  });

  // A refused form wraps unless its classes say flex-col or flex-col-reverse (packages/ui/src/styles.css), and a
  // wrapping column sizes its line to a select's longest option, past a phone's width (U-UX-1). A form whose direction
  // changes at a breakpoint would wrap as a column, or stay unwrapped as a row.
  it('sets no form’s direction behind a breakpoint or another variant', () => {
    expect(FORM_CLASSES.filter(({ classes }) => DIRECTION_BY_VARIANT.test(classes)).map(({ where, classes }) => `${where} ${classes}`)).toEqual([]);
  });
});
