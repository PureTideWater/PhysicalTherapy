import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { PHI_KIND_LABELS, SCREENING_REJECTION_CODES, type ScreeningRejection } from '@tp/worker/screening-format';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { screeningReasonMessage } from '../screening/routes';

/**
 * Every field's refusal message is one lower-case sentence with no full stop and no colon of its own: what is wrong,
 * then the next step, joined by a semicolon (test matrix FRM-04; docs/adr/0077, amended by co-001/ux-forms-after-42).
 * The summary prints "{Field}: {message}" and the field prints "Error: {message}", so a message with a colon of its own
 * would stack two. Read from the source with the TypeScript compiler, so a message added later in the old form fails
 * here rather than waiting for a reviewer. The step itself is reviewed by hand (a heuristic would be brittle across
 * reason-first and verb-first sentences). Files outside apps/web are read by path, never imported.
 */

const REPO = path.resolve(import.meta.dirname, '../../../../..');
const WEB = 'apps/web/src';

/** The directories whose messages a person reads in a refusal, and three files outside the web app that word one. */
const ROOTS = [`${WEB}/lib/routes`, `${WEB}/lib/screening`, `${WEB}/lib/packets`, `${WEB}/lib/triage`, `${WEB}/lib/reconciliation`, `${WEB}/lib/contracts`];
const RERUN = 'apps/worker/src/price/rerun.ts';
const FILES = [`${WEB}/lib/zip.ts`, 'apps/worker/src/billing/account.ts', 'packages/packets/src/correspondence.ts', RERUN];

/**
 * Where a message must also start with a verb from VERBS: the field-rule maps (`*_FIELD_RULES`), the settings forms'
 * own field schemas (the correspondence form's, and the defaults form's `minutes` and `dollars`: the design's 2.7
 * "settings zod messages") and every message in @tp/packets' correspondence rules, whose old form was a validator's
 * description ("a 10-digit phone number…"). Keyed by file, then by declaration ('*' for the whole file). The wider
 * files keep reason-first sentences such as "the chain is not complete; …".
 */
const VERB_FIRST: Readonly<Record<string, readonly string[]>> = {
  [`${WEB}/lib/routes/settings.ts`]: ['correspondenceForm', 'NO_AT', 'minutes', 'dollars'],
  'packages/packets/src/correspondence.ts': ['*'],
};
const VERBS = new Set(['enter', 'choose', 'use', 'write', 'name', 'leave', 'remove', 'fix', 'ask', 'sign', 'try', 'fill', 'open']);

/** Zod methods whose first argument is a value (a bound, a pattern, a literal, a list) and whose later arguments are the message. */
const VALUE_FIRST = new Set(['min', 'max', 'length', 'regex', 'gt', 'gte', 'lt', 'lte', 'multipleOf', 'startsWith', 'endsWith', 'includes', 'literal', 'enum', 'refine', 'array']);
/** Zod methods whose first argument is the message. */
const MESSAGE_FIRST = new Set(['email', 'url', 'uuid', 'nonempty', 'int', 'positive', 'nonnegative', 'string', 'number', 'boolean', 'bigint', 'date', 'datetime']);
/**
 * The fields whose message is the form's own sentence, never printed after a field's name: a step's refusal
 * ("refused", lib/cases/refusals.ts, shown as "Refused: {message}.") and the core's form-wide fields (NO_FIELD in
 * components/form-issues.tsx). A PacketRuleError's or PacketRefusedError's message becomes a "refused" issue.
 */
const FORM_WIDE_FIELDS = new Set(['REFUSED_FIELD', "'refused'", "'input'", "'requestKey'"]);

/** Calls inside a z.object initializer whose string arguments are values, never a message. */
const NOT_MESSAGE_CALLEES = new Set(['String', 'Number', 'Boolean', 'BigInt', 'Date', 'RegExp']);

/**
 * Declarations whose strings stay outside the rule, each with its reason. Keyed by file, then by the declaration's
 * name; a string anywhere inside that declaration is exempt.
 */
const ALLOWED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [`${WEB}/lib/screening/address.ts`]: {
    ADDRESS_REFUSED: 'legal surface screening-mail-address (legal-surfaces.md); keeps its sentence form until counsel rules',
    MAILBOX_UNCONFIRMED: 'legal surface screening-mail-address; until counsel rules',
    suggestionMessage: 'legal surface screening-mail-address; until counsel rules',
    endingSuggestionMessage: 'legal surface screening-mail-address; until counsel rules',
    unknownEndingMessage: 'legal surface screening-mail-address; until counsel rules',
  },
  [`${WEB}/lib/packets/pricing.ts`]: {
    PRICING_BLOCKED_TEXT:
      'a step’s refusal sentences while a version’s pricing is not current: beside a disabled button, or as "Refused: …" (lib/cases/refusals.ts), never after a field’s name',
  },
  [`${WEB}/lib/packets/export-attempts.ts`]: {
    NOT_APPROVED_ALONE_TEXT:
      'an export refusal’s sentences, like EXPORT_REFUSAL_TEXT’s: under the refusal’s code, which no control carries, so the summary shows them as a sentence of their own',
  },
  [`${WEB}/lib/screening/messages.ts`]: {
    SCREENING_BOUNCE_BUDGET: 'legal surface screening-mail-address (the founder’s Q10/Q12 wording); until counsel rules',
  },
  [`${WEB}/lib/screening/routes.ts`]: {
    SCREENING_ZIP_MESSAGES: 'the founder’s wording, for counsel to confirm; until counsel rules',
  },
};

/**
 * The browser's "Not sent" list sentences, named by key: full sentences under a lead that gives the step, outside the
 * field-message rule. A key added to FILE_MESSAGES later is not on this list, so the guard fails until it is named here.
 */
const LIST_SENTENCE_KEYS = new Set(['empty', 'tooLarge', 'spreadsheet', 'notText', 'unclosedQuote', 'textAfterQuote', 'unreadable']);

/** Exported constants that are a field's message although no route reads them (the upload form does). */
const FIELD_MESSAGE_CONSTANTS: Readonly<Record<string, readonly string[]>> = {
  [`${WEB}/lib/screening/messages.ts`]: ['NO_FILE_CHOSEN'],
};

function sources(directory: string): string[] {
  return readdirSync(path.join(REPO, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === 'test-support' || entry.name === 'route-tests' ? [] : sources(child);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts') ? [child] : [];
  });
}

const FILE_LIST = [...ROOTS.flatMap(sources), ...FILES].sort();
const PARSED = new Map(FILE_LIST.map((file) => [file, ts.createSourceFile(file, readFileSync(path.join(REPO, file), 'utf8'), ts.ScriptTarget.Latest, true)]));

interface Flags {
  /** A field's message: reached from a message position, a `*_FIELD_RULES` value or named in FIELD_MESSAGE_CONSTANTS. */
  field: boolean;
  verbFirst: boolean;
  /** Reached only as an exported constant's value, never from a message position. */
  exportOnly?: boolean;
  /**
   * A step's refusal under the field "refused" (lib/cases/refusals.ts), which the form shows as its own sentence,
   * "Refused: {message}.", never under a field's name.
   */
  sentence?: boolean;
}

interface Found {
  readonly file: string;
  readonly node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression;
  readonly flags: Flags;
}

/** A literal's text with each substitution as "{}", which no rule reads into. */
function textOf(node: Found['node']): string {
  if (!ts.isTemplateExpression(node)) {
    return node.text;
  }
  return node.head.text + node.templateSpans.map((span) => `{}${span.literal.text}`).join('');
}

/** Whether a literal sits where VERB_FIRST asks for a leading verb. */
function verbFirstAt(file: string, node: ts.Node): boolean {
  const names = VERB_FIRST[file] ?? [];
  if (names.includes('*')) {
    return true;
  }
  for (let at: ts.Node | undefined = node; at !== undefined; at = at.parent) {
    const name = declarationName(at);
    if (name !== undefined && names.includes(name)) {
      return true;
    }
  }
  return false;
}

function declarationName(node: ts.Node): string | undefined {
  if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name !== undefined && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return undefined;
}

function allowedBy(file: string, node: ts.Node): string | undefined {
  const names = ALLOWED[file];
  if (names === undefined) {
    return undefined;
  }
  for (let at: ts.Node | undefined = node; at !== undefined; at = at.parent) {
    const name = declarationName(at);
    if (name !== undefined && names[name] !== undefined) {
      return name;
    }
  }
  return undefined;
}

function unwrap(node: ts.Expression): ts.Expression {
  let at = node;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at) || ts.isTypeAssertionExpression(at)) {
    at = at.expression;
  }
  return at;
}

/** Every declaration of a name in a file: a variable's initializer, or a function's body. */
function declarations(file: string, name: string): ts.Node[] {
  const source = PARSED.get(file);
  if (source === undefined) {
    return [];
  }
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (declarationName(node) === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** A name's declaration in its own file, or else an exported one of that name in another scanned file. */
function resolve(file: string, name: string): { readonly file: string; readonly node: ts.Node } | undefined {
  const local = declarations(file, name);
  if (local.length === 1 && local[0] !== undefined) {
    return { file, node: local[0] };
  }
  if (local.length > 1) {
    return undefined;
  }
  const exported = [...PARSED.keys()].flatMap((other) =>
    declarations(other, name)
      .filter((node) => {
        const statement = ts.isVariableDeclaration(node) ? node.parent.parent : node;
        return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      })
      .map((node) => ({ file: other, node })),
  );
  return exported.length === 1 ? exported[0] : undefined;
}

function returnsOf(body: ts.Node): ts.Expression[] {
  if (!ts.isBlock(body)) {
    return ts.isExpression(body) ? [body] : [];
  }
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      found.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

const found = new Map<ts.Node, Found>();

function add(file: string, node: Found['node'], flags: Flags): void {
  const prior = found.get(node);
  if (prior === undefined) {
    found.set(node, { file, node, flags: { ...flags } });
    return;
  }
  prior.flags.field ||= flags.field;
  prior.flags.verbFirst ||= flags.verbFirst;
  prior.flags.exportOnly = (prior.flags.exportOnly ?? false) && (flags.exportOnly ?? false);
  prior.flags.sentence = (prior.flags.sentence ?? false) || (flags.sentence ?? false);
}

/** The message literals an expression can evaluate to, following local and exported constants and message-building functions. */
function collect(file: string, expression: ts.Node, flags: Flags, seen: Set<ts.Node>): void {
  if (seen.has(expression)) {
    return;
  }
  seen.add(expression);
  const at = ts.isExpression(expression) ? unwrap(expression) : expression;
  if (ts.isStringLiteral(at) || ts.isNoSubstitutionTemplateLiteral(at) || ts.isTemplateExpression(at)) {
    add(file, at, flags);
  } else if (ts.isConditionalExpression(at)) {
    collect(file, at.whenTrue, flags, seen);
    collect(file, at.whenFalse, flags, seen);
  } else if (ts.isBinaryExpression(at)) {
    collect(file, at.left, flags, seen);
    collect(file, at.right, flags, seen);
  } else if (ts.isObjectLiteralExpression(at)) {
    for (const property of at.properties) {
      const name = property.name !== undefined && ts.isIdentifier(property.name) ? property.name.text : undefined;
      if (name === 'message' || name === 'error') {
        if (ts.isPropertyAssignment(property)) {
          collect(file, property.initializer, flags, seen);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          collect(file, property.name, flags, seen);
        }
      }
    }
  } else if (ts.isArrowFunction(at) || ts.isFunctionExpression(at) || ts.isFunctionDeclaration(at)) {
    if (at.body !== undefined) {
      for (const returned of returnsOf(at.body)) {
        collect(file, returned, flags, seen);
      }
    }
  } else if (ts.isVariableDeclaration(at)) {
    if (at.initializer !== undefined) {
      collect(file, at.initializer, flags, seen);
    }
  } else if (ts.isIdentifier(at)) {
    const target = resolve(file, at.text);
    if (target !== undefined) {
      collect(target.file, target.node, flags, seen);
    }
  } else if (ts.isPropertyAccessExpression(at) && ts.isIdentifier(at.expression)) {
    const target = resolve(file, at.expression.text);
    const initializer = target !== undefined && ts.isVariableDeclaration(target.node) && target.node.initializer !== undefined ? unwrap(target.node.initializer) : undefined;
    if (target !== undefined && initializer !== undefined && ts.isObjectLiteralExpression(initializer)) {
      const property = propertyNamed(initializer, at.name.text);
      if (property !== undefined && ts.isPropertyAssignment(property)) {
        collect(target.file, property.initializer, flags, seen);
      }
    }
  } else if (ts.isCallExpression(at) && ts.isIdentifier(at.expression)) {
    const target = resolve(file, at.expression.text);
    if (target !== undefined && (ts.isFunctionDeclaration(target.node) || ts.isVariableDeclaration(target.node))) {
      const node = ts.isVariableDeclaration(target.node) ? target.node.initializer : target.node;
      if (node !== undefined && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
        collect(target.file, node, flags, seen);
      }
    }
  }
}

function calleeName(call: ts.CallExpression | ts.NewExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return undefined;
}

function propertyNamed(object: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find((property) => property.name !== undefined && ts.isIdentifier(property.name) && property.name.text === name);
}

/** (a)-(d): zod messages, local schema helpers' strings inside z.object, InputError, BillingRefusedError and RerunRefusedError, and every { field, message }. */
function visitPositions(file: string, source: ts.SourceFile): void {
  const visit = (node: ts.Node, inObject: boolean): void => {
    let inside = inObject;
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const zodLike = ts.isPropertyAccessExpression(node.expression);
      if (name === 'object' && zodLike) {
        inside = true;
      }
      if (zodLike && name !== undefined && VALUE_FIRST.has(name)) {
        node.arguments.slice(1).forEach((argument) => collect(file, argument, { field: true, verbFirst: false }, new Set()));
      } else if (zodLike && name !== undefined && MESSAGE_FIRST.has(name)) {
        node.arguments.forEach((argument) => collect(file, argument, { field: true, verbFirst: false }, new Set()));
      } else if (name === 'addIssue') {
        node.arguments.forEach((argument) => collect(file, argument, { field: true, verbFirst: false }, new Set()));
      } else if (inObject && ts.isIdentifier(node.expression) && name !== undefined && !NOT_MESSAGE_CALLEES.has(name)) {
        node.arguments
          .filter((argument) => ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument) || ts.isTemplateExpression(argument))
          .forEach((argument) => collect(file, argument, { field: true, verbFirst: false }, new Set()));
      }
    }
    if (ts.isNewExpression(node) && calleeName(node) === 'BillingRefusedError' && node.arguments?.[1] !== undefined) {
      collect(file, node.arguments[1], { field: true, verbFirst: false }, new Set());
    }
    // A re-run refusal's message is the runId field's (lib/packets/pricing.ts passes it through), after "This re-run: ";
    // one read from a record by a computed key (SUPERSEDED_MESSAGES[kind]) is every value the record holds.
    if (ts.isNewExpression(node) && calleeName(node) === 'RerunRefusedError' && node.arguments?.[1] !== undefined) {
      const message = unwrap(node.arguments[1]);
      const record = ts.isElementAccessExpression(message) && ts.isIdentifier(message.expression) ? resolve(file, message.expression.text) : undefined;
      const initializer = record !== undefined && ts.isVariableDeclaration(record.node) && record.node.initializer !== undefined ? unwrap(record.node.initializer) : undefined;
      if (record !== undefined && initializer !== undefined && ts.isObjectLiteralExpression(initializer)) {
        initializer.properties.filter(ts.isPropertyAssignment).forEach((property) => collect(record.file, property.initializer, { field: true, verbFirst: false }, new Set()));
      } else {
        collect(file, message, { field: true, verbFirst: false }, new Set());
      }
    }
    if (ts.isNewExpression(node) && (calleeName(node) === 'PacketRuleError' || calleeName(node) === 'PacketRefusedError') && node.arguments?.[1] !== undefined) {
      collect(file, node.arguments[1], { field: false, verbFirst: false, sentence: true }, new Set());
    }
    const field = ts.isObjectLiteralExpression(node) ? propertyNamed(node, 'field') : undefined;
    if (ts.isObjectLiteralExpression(node) && field !== undefined) {
      const refused = ts.isPropertyAssignment(field) && FORM_WIDE_FIELDS.has(field.initializer.getText(source));
      const flags: Flags = refused ? { field: false, verbFirst: false, sentence: true } : { field: true, verbFirst: false };
      const message = propertyNamed(node, 'message');
      if (message !== undefined && ts.isPropertyAssignment(message)) {
        collect(file, message.initializer, flags, new Set());
      } else if (message !== undefined && ts.isShorthandPropertyAssignment(message)) {
        collect(file, message.name, flags, new Set());
      }
    }
    ts.forEachChild(node, (child) => visit(child, inside));
  };
  visit(source, false);
}

/** (e): exported string constants and the string values of exported records; a `*_FIELD_RULES` map's values are field messages, verb first. */
function visitExports(file: string, source: ts.SourceFile): void {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer === undefined || !ts.isIdentifier(declaration.name)) {
        continue;
      }
      const name = declaration.name.text;
      const rules = name.endsWith('_FIELD_RULES');
      const named = (FIELD_MESSAGE_CONSTANTS[file] ?? []).includes(name);
      const values = (expression: ts.Expression): void => {
        const at = unwrap(expression);
        if (ts.isStringLiteral(at) || ts.isNoSubstitutionTemplateLiteral(at) || ts.isTemplateExpression(at)) {
          add(file, at, { field: rules || named, verbFirst: rules, exportOnly: !(rules || named) });
        } else if (ts.isObjectLiteralExpression(at)) {
          for (const property of at.properties) {
            if (ts.isPropertyAssignment(property)) {
              values(property.initializer);
            }
          }
        }
      };
      values(declaration.initializer);
    }
  }
}

/** Every string literal in the screening's files, for the one rule that reaches the "Not sent" list too: never "upload again". */
function screeningStrings(file: string, source: ts.SourceFile): Found['node'][] {
  if (!file.startsWith(`${WEB}/lib/screening/`)) {
    return [];
  }
  const strings: Found['node'][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      strings.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return strings;
}

for (const [file, source] of PARSED) {
  visitPositions(file, source);
  visitExports(file, source);
}

/** The "Not sent" list sentences: FILE_MESSAGES' values whose key is named in LIST_SENTENCE_KEYS. */
function listSentence(entry: Found): boolean {
  if (entry.file !== `${WEB}/lib/screening/messages.ts`) {
    return false;
  }
  const property = entry.node.parent;
  if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || !LIST_SENTENCE_KEYS.has(property.name.text)) {
    return false;
  }
  for (let at: ts.Node | undefined = property; at !== undefined; at = at.parent) {
    if (declarationName(at) === 'FILE_MESSAGES') {
      return true;
    }
  }
  return false;
}

/**
 * An exported constant no message position reaches, which starts with a capital, is a sentence of page copy (a
 * paragraph, a label, a hint), not a field's message; one that starts lower-case is shaped as a field's message and is
 * checked.
 */
function pageCopy(entry: Found): boolean {
  return (entry.flags.exportOnly ?? false) && /^[A-Z]/.test(textOf(entry.node));
}

/** A step's refusal sentence (Flags.sentence) that no field's message also reaches. */
function stepRefusal(entry: Found): boolean {
  return (entry.flags.sentence ?? false) && !entry.flags.field;
}

function where(file: string, node: ts.Node): string {
  const source = node.getSourceFile();
  return `${file.replace(`${WEB}/`, '')}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}`;
}

/** A first word that keeps its capital in any sentence: the product's name, or an initialism such as NPI or ZIP. */
const ALWAYS_CAPITAL = /^(PaidWhole|[A-Z][A-Z0-9+]+)\b/;

/** The rules a message breaks, empty when it keeps the form. */
function broken(text: string, flags: Flags): string[] {
  const rules: string[] = [];
  if (text.includes(': ')) {
    rules.push('a colon of its own');
  }
  if (/^at most\b/.test(text)) {
    rules.push('starts with "at most"');
  }
  if (flags.field && /^[A-Z]/.test(text) && !ALWAYS_CAPITAL.test(text)) {
    rules.push('an upper-case start');
  }
  if (flags.field && text.endsWith('.')) {
    rules.push('a full stop');
  }
  if (flags.verbFirst && !VERBS.has(text.split(/[\s,;]/)[0] ?? '')) {
    rules.push('no leading verb');
  }
  return rules;
}

describe('every field’s refusal message is one sentence with no colon of its own (FRM-04)', () => {
  it('scans the files that word refusals', () => {
    for (const file of [...FILES, `${WEB}/lib/routes/settings.ts`, `${WEB}/lib/screening/routes.ts`, `${WEB}/lib/screening/messages.ts`]) {
      expect(PARSED.has(file), file).toBe(true);
    }
    expect(found.size).toBeGreaterThan(100);
    // The re-run refusals, which the pricing route passes through as the runId field's message, and the contract forms'.
    const fieldMessagesIn = (prefix: string) => [...found.values()].filter((entry) => entry.file.startsWith(prefix) && entry.flags.field).length;
    expect(fieldMessagesIn(RERUN)).toBeGreaterThanOrEqual(12);
    expect(fieldMessagesIn(`${WEB}/lib/contracts/`)).toBeGreaterThanOrEqual(10);
  });

  it('finds no message in the old form', () => {
    const hits = [...found.values()]
      .filter((entry) => allowedBy(entry.file, entry.node) === undefined && !listSentence(entry) && !pageCopy(entry) && !stepRefusal(entry))
      .flatMap((entry) => {
        const rules = broken(textOf(entry.node), { ...entry.flags, verbFirst: entry.flags.verbFirst || (entry.flags.field && verbFirstAt(entry.file, entry.node)) });
        return rules.length === 0 ? [] : [`${where(entry.file, entry.node)} ${rules.join(', ')}: ${JSON.stringify(textOf(entry.node))}`];
      })
      .sort();
    expect(hits).toEqual([]);
  });

  it('never says "upload again" in the screening: the file is never uploaded, and one action has one verb', () => {
    const hits = [...PARSED].flatMap(([file, source]) =>
      screeningStrings(file, source)
        .filter((node) => /upload again/i.test(textOf(node)))
        .map((node) => `${where(file, node)}: ${JSON.stringify(textOf(node))}`),
    );
    expect(hits).toEqual([]);
  });

  it('names every FILE_MESSAGES key as a "Not sent" list sentence, and checks the file input’s own message as a field message', () => {
    const file = `${WEB}/lib/screening/messages.ts`;
    const keys = declarations(file, 'FILE_MESSAGES').flatMap((node) => {
      const initializer = ts.isVariableDeclaration(node) && node.initializer !== undefined ? unwrap(node.initializer) : undefined;
      return initializer !== undefined && ts.isObjectLiteralExpression(initializer)
        ? initializer.properties.flatMap((property) => (property.name !== undefined && ts.isIdentifier(property.name) ? [property.name.text] : []))
        : [];
    });
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !LIST_SENTENCE_KEYS.has(key))).toEqual([]);
    for (const name of FIELD_MESSAGE_CONSTANTS[file] ?? []) {
      expect(declarations(file, name), name).toHaveLength(1);
    }
  });

  it('allows only declarations that exist, so a renamed legal surface is not exempted by a stale name', () => {
    const missing = Object.entries(ALLOWED).flatMap(([file, names]) => Object.keys(names).filter((name) => declarations(file, name).length === 0).map((name) => `${file} ${name}`));
    expect(missing).toEqual([]);
  });
});

describe('screeningReasonMessage reads as one field message for every code (FRM-04)', () => {
  const full = (code: ScreeningRejection['code']): ScreeningRejection => ({ code, row: 3, column: 4, first_row: 1, field: 'allowed_total', phi: 'member_id' });
  const cases = SCREENING_REJECTION_CODES.flatMap((code) => [
    { label: `${code}, bare`, reason: { code } satisfies ScreeningRejection },
    { label: `${code}, with a row, column and field`, reason: full(code) },
    { label: `${code}, with a row and no field`, reason: { code, row: 3, column: 4 } satisfies ScreeningRejection },
  ]);

  it.each(cases)('$label', ({ reason }) => {
    const message = screeningReasonMessage(reason);
    expect(broken(message, { field: true, verbFirst: false })).toEqual([]);
    expect(message).not.toMatch(/upload again/i);
    expect(message).not.toContain('a a ');
    expect(message).not.toContain('a allowed');
  });

  it('words invalid_value with the field and without it', () => {
    expect(screeningReasonMessage({ code: 'invalid_value', row: 3, field: 'allowed_total' })).toBe(
      'row 3 has a value in the allowed total column that is not in the screening’s format; correct it, or leave the row out',
    );
    expect(screeningReasonMessage({ code: 'invalid_value', row: 3 })).toBe('row 3 has a value that is not in the screening’s format; correct it, or leave the row out');
    expect(screeningReasonMessage({ code: 'invalid_value' })).toBe('a row has a value that is not in the screening’s format; correct it, or leave the row out');
  });

  it('names patient information by its kind', () => {
    expect(screeningReasonMessage({ code: 'phi_column', column: 4, phi: 'member_id' })).toBe(`column 4 holds ${PHI_KIND_LABELS.member_id}; remove the column, then choose the file again`);
  });
});
