import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { badgeText, descriptor, independenceClaim, sealLabel, sealText, tagline, verifiedDefinition } from '../../packages/brand/src/tokens';

/**
 * The product-copy lint (Change Order 001, CO-11; docs/brand/BRAND.md, sections 1 and 7; .claude/rules/brand.md).
 * It reads the words a person sees, never the code around them: every string literal, template literal and
 * JSX text in the web app's source and in the report templates (the audit report, the ROI statement, the
 * coverage report, the monthly summary and the frame and packet templates they print in) and the stage labels
 * they show, parsed with the TypeScript compiler, so comments, identifiers and object keys are never read. It
 * fails on:
 *
 * - "ProofPack" or "proof pack", in any case (the word is packet);
 * - the word AI standing alone, and "intelligence" (product copy is neither);
 * - "independent verification platform" (the claim is "independent of the EMR and the payer");
 * - "recovered" in a sentence that does not say posted or deposited (stage five is always labelled by the
 *   cash that proves it);
 * - in a screening file (any path with a `screening` directory): owed, underpaid or recovered at all, and the
 *   tagline, whose first sentence says owed (decision D11: screening shows the lockup without the tagline);
 * - the brand's own words typed out (the tagline, the descriptor, the independence claim, the seal and badge
 *   text, the definition line): they are read from packages/brand/src/tokens.ts, never copied.
 *
 * A code is not copy (decision D10): a string that is one lowercase token (`'recovered'`, `'payer_approved'`,
 * `'stage-recovered'`, a CSV column), SQL, a module path, a type, an object key, and the code-valued JSX
 * attributes (className, id, href, data-* and the like) are not read. A reviewed exception is a comment
 * `brand-copy-exempt: <why>` on the string's line or the line above; it needs its reason, and an exemption
 * that no longer covers a finding is itself a finding, so the list stays short. `pnpm test` runs it
 * (scan.test.ts), and `pnpm lint:copy` prints what it finds.
 */

/** The directories read, relative to the repository root. */
export const COPY_ROOTS = ['apps/web/src', 'apps/worker/src/report'] as const;

/**
 * The copy outside those directories that they show: the ROI statement and the packet, which print in the report
 * frame, and the five stage labels every screen and report names a stage with (STAGE_LABELS).
 */
export const COPY_FILES = ['apps/worker/src/reconcile/statement-html.ts', 'apps/worker/src/packets/html.ts', 'packages/triage/src/headline.ts'] as const;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Dependencies, build output and test support, which hold fixture data rather than copy. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'coverage', 'test-support', '__fixtures__', 'fixtures', 'e2e']);

export type CopyRule =
  | 'proof-pack'
  | 'ai'
  | 'intelligence'
  | 'verification-platform'
  | 'recovered-unlabelled'
  | 'screening-owed'
  | 'screening-underpaid'
  | 'screening-recovered'
  | 'screening-tagline'
  | 'brand-words-literal'
  | 'exemption-without-reason'
  | 'exemption-unused';

export interface CopyFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: CopyRule;
  /** The sentence (or the string) the rule read, whitespace collapsed. */
  readonly text: string;
  readonly message: string;
}

interface Term {
  readonly rule: CopyRule;
  readonly pattern: RegExp;
  readonly message: string;
}

/** The terms no product copy uses, anywhere. */
export const FORBIDDEN_TERMS: readonly Term[] = [
  { rule: 'proof-pack', pattern: /proof[\s_-]*packs?/i, message: 'never "ProofPack" or "proof pack" in product copy: the word is packet' },
  { rule: 'ai', pattern: /\bA\.?I\b/, message: 'never "AI" in product copy' },
  { rule: 'intelligence', pattern: /intelligence/i, message: 'never "intelligence" in product copy' },
  { rule: 'verification-platform', pattern: /independent\s+verification\s+platforms?/i, message: 'never "independent verification platform": the claim is "independent of the EMR and the payer"' },
];

/** The terms a screening file never uses (CO-11: screening never says owed, underpaid or recovered). */
export const SCREENING_TERMS: readonly Term[] = [
  { rule: 'screening-owed', pattern: /\bowed\b/i, message: 'screening never says owed' },
  { rule: 'screening-underpaid', pattern: /\bunder-?paid\b/i, message: 'screening never says underpaid' },
  { rule: 'screening-recovered', pattern: /\brecovered\b/i, message: 'screening never says recovered' },
];

/** The brand's words, which only packages/brand/src/tokens.ts writes out (CO-11). */
export const BRAND_WORDS: readonly string[] = [tagline, descriptor, independenceClaim, ...sealText, badgeText, sealLabel, verifiedDefinition];

const RECOVERED = /\brecovered\b/i;
const PROVED_BY = /\b(posted|deposited)\b/i;

/** The marker of a reviewed exception, and the shortest reason it is read with. */
export const EXEMPTION_MARKER = 'brand-copy-exempt:';
const EXEMPTION = /brand-copy-exempt:(.*?)(?:\*\/|$)/;
const MIN_REASON = 12;

/** One lowercase token with no space: a code (a stage, an enum value, a CSV column, a path, a key). */
const CODE = /^[a-z0-9_.:/#@?=&%+[\]-]*$/;

/** SQL text, a query or a fragment of one: it starts with a keyword in capitals followed by more of it. */
const SQL = /^\s*(SELECT|WITH|INSERT INTO|UPDATE|DELETE FROM|SET LOCAL|SET|CREATE|ALTER|DROP|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|LOCK|TRUNCATE|VALUES|FROM|WHERE|AND|JOIN|LEFT JOIN|ORDER BY|GROUP BY)\s/;

/** JSX attributes whose values are codes, not words a person reads. */
const CODE_ATTRIBUTES = new Set(['className', 'class', 'id', 'key', 'href', 'src', 'srcSet', 'name', 'type', 'role', 'htmlFor', 'method', 'action', 'rel', 'target', 'as', 'form', 'lang', 'dir', 'autoComplete', 'inputMode', 'pattern', 'accept', 'encType', 'value', 'defaultValue', 'headers', 'scope', 'variant', 'size', 'tone', 'align']);

/** The aria attributes that hold words; every other aria-* holds a code (true, polite, page). */
const ARIA_WORDS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder', 'aria-braillelabel']);

/** Elements whose text runs on with the text around them, so a label split across them is read as one. */
const INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
  'Link', 'Money',
]);

/** Where a dynamic value stands in a unit's text: read as neither word. */
const PLACEHOLDER = '{…}';

/** Where a block element stood in a unit's text: a sentence ends there. */
const BREAK = '\u2029';

/** HTML block tags in a template's text (the report templates write HTML): a sentence ends at each. */
const HTML_BLOCK_TAG = /<\/?(?:address|article|aside|blockquote|br|caption|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

/** Any other HTML tag: inline, so the words on either side run on. */
const HTML_TAG = /<\/?[a-z][a-z0-9-]*\b[^>]*>/gi;

/** Where a sentence ends: a block, a line break, or a full stop, question or exclamation mark before the next sentence. */
const SENTENCE_END = new RegExp(`${BREAK}|\\n|(?<=[.!?])\\s+(?=[A-Z0-9“"‘'(])`);

export function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

/** A screening file: any path with a directory named screening. */
export function isScreeningFile(file: string): boolean {
  return `/${file.split(path.sep).join('/')}`.includes('/screening/');
}

interface Unit {
  readonly node: ts.Node;
  readonly text: string;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A unit's sentences: split where a block element stood (JSX or an HTML tag in a template), at a line break
 * in a string, and after a sentence's full stop, question or exclamation mark.
 */
export function sentences(text: string): string[] {
  return text
    .replace(HTML_BLOCK_TAG, BREAK)
    .replace(HTML_TAG, '')
    .split(SENTENCE_END)
    .map(normalize)
    .filter((sentence) => sentence.length > 0);
}

function jsxTagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

function isInline(node: ts.Node): boolean {
  return (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && INLINE_ELEMENTS.has(jsxTagName(node));
}

function templateText(node: ts.TemplateExpression): string {
  return node.head.text + node.templateSpans.map((span) => `${PLACEHOLDER}${span.literal.text}`).join('');
}

function isStringNode(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** A string node whose place makes it a code, a key or a type, never words. */
function inCodePosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent) || ts.isImportTypeNode(parent) || ts.isLiteralTypeNode(parent)) {
    return true;
  }
  if (ts.isCallExpression(parent) && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(parent.expression) && parent.expression.text === 'require'))) {
    return true;
  }
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return true;
  }
  if ('name' in parent && (parent as { name?: ts.Node }).name === node) {
    return true;
  }
  if (ts.isTaggedTemplateExpression(parent)) {
    return true;
  }
  if (ts.isJsxAttribute(parent)) {
    const name = parent.name.getText();
    return CODE_ATTRIBUTES.has(name) || name.startsWith('data-') || (name.startsWith('aria-') && !ARIA_WORDS.has(name));
  }
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    return inCodePosition(parent);
  }
  return false;
}

function isCodeText(text: string): boolean {
  return CODE.test(text) || SQL.test(text);
}

/** The text of a JSX element's children, inline elements run in and block elements as line breaks. */
function jsxText(children: ts.NodeArray<ts.JsxChild>, consumed: Set<ts.Node>): string {
  let text = '';
  for (const child of children) {
    if (ts.isJsxText(child)) {
      // A JSX text's line breaks are whitespace, as React renders them.
      text += child.text.replace(/\s+/g, ' ');
    } else if (ts.isJsxExpression(child)) {
      const expression = child.expression;
      if (expression === undefined) {
        continue;
      }
      if (isStringNode(expression)) {
        consumed.add(expression);
        text += expression.text;
      } else if (ts.isTemplateExpression(expression)) {
        consumed.add(expression);
        text += templateText(expression);
      } else {
        text += PLACEHOLDER;
      }
    } else if (ts.isJsxElement(child) && isInline(child)) {
      text += jsxText(child.children, consumed);
    } else if (ts.isJsxSelfClosingElement(child) && isInline(child)) {
      text += jsxTagName(child) === 'br' ? ' ' : PLACEHOLDER;
    } else {
      text += BREAK;
    }
  }
  return text;
}

/** Every unit of copy in one file: the strings and template literals, and each JSX element's running text. */
export function copyUnits(file: string, text: string): { source: ts.SourceFile; units: Unit[] } {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const units: Unit[] = [];
  const consumed = new Set<ts.Node>();

  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) || ts.isJsxFragment(node)) && !(isInline(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))) {
      const run = jsxText(node.children, consumed);
      if (/[A-Za-z]/.test(run)) {
        units.push({ node, text: run });
      }
    } else if (isStringNode(node) && !consumed.has(node)) {
      if (!inCodePosition(node) && !isCodeText(node.text)) {
        units.push({ node, text: node.text });
      }
    } else if (ts.isTemplateExpression(node) && !consumed.has(node)) {
      const joined = templateText(node);
      if (!inCodePosition(node) && !isCodeText(joined.replaceAll(PLACEHOLDER, ''))) {
        units.push({ node, text: joined });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { source, units };
}

function findTerm(unit: string, terms: readonly Term[]): Term[] {
  return terms.filter((term) => term.pattern.test(unit));
}

/** What the rules find in one file's text; `file` is relative to the repository root. */
export function scanSource(file: string, text: string): CopyFinding[] {
  const { source, units } = copyUnits(file, text);
  const screening = isScreeningFile(file);
  const lines = text.split('\n');
  const findings: CopyFinding[] = [];
  const usedExemptions = new Set<number>();

  const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source));

  /** Where a sentence of a unit stands in the source: its first words found in the node's text, else the node. */
  const locate = (node: ts.Node, sentence: string) => {
    const words = sentence.replaceAll(PLACEHOLDER, ' ').split(' ').filter((word) => word.length > 0).slice(0, 4);
    const pattern = new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]{1,80}?'));
    const start = node.getStart(source);
    const match = pattern.exec(text.slice(start, node.getEnd()));
    return source.getLineAndCharacterOfPosition(match === null ? start : start + match.index);
  };

  /** The lines (0-based) holding an exemption with its reason; one without a reason exempts nothing. */
  const justified = new Set(lines.flatMap((content, index) => (normalize(EXEMPTION.exec(content)?.[1] ?? '').length >= MIN_REASON ? [index] : [])));

  /** The exemption covering a unit that starts on `line` (0-based): on its line or the line above. */
  const exemptionFor = (line: number): number | undefined => [line, line - 1].find((candidate) => justified.has(candidate));

  for (const unit of units) {
    const start = at(unit.node).line;
    const whole = normalize(unit.text).toLowerCase();
    const copied = BRAND_WORDS.find((words) => whole.includes(words.toLowerCase()));
    if (copied !== undefined) {
      const exemption = exemptionFor(start);
      if (exemption === undefined) {
        const position = at(unit.node);
        findings.push({ file, line: position.line + 1, column: position.character + 1, rule: 'brand-words-literal', text: normalize(unit.text), message: `"${copied}" is the brand's: import it from @paidwhole/brand (packages/brand/src/tokens.ts), never a copy` });
      } else {
        usedExemptions.add(exemption);
      }
    }
    for (const sentence of sentences(unit.text)) {
      const found: { rule: CopyRule; message: string }[] = findTerm(sentence, FORBIDDEN_TERMS).map(({ rule, message }) => ({ rule, message }));
      if (screening) {
        found.push(...findTerm(sentence, SCREENING_TERMS).map(({ rule, message }) => ({ rule, message })));
      } else if (RECOVERED.test(sentence) && !PROVED_BY.test(sentence)) {
        found.push({ rule: 'recovered-unlabelled', message: '"recovered" without posted or deposited: say which cash proves it ("Recovered (posted)", "recovered, posted or deposited")' });
      }
      if (found.length === 0) {
        continue;
      }
      const position = locate(unit.node, sentence);
      const exemption = exemptionFor(position.line) ?? exemptionFor(start);
      if (exemption !== undefined) {
        usedExemptions.add(exemption);
        continue;
      }
      for (const finding of found) {
        findings.push({ file, line: position.line + 1, column: position.character + 1, text: sentence, ...finding });
      }
    }
  }

  if (screening) {
    const visit = (node: ts.Node) => {
      const tagline =
        (ts.isJsxAttribute(node) && node.name.getText() === 'tagline') ||
        ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && ['tagline', 'BRAND_TAGLINE'].includes((node.propertyName ?? node.name).getText())) ||
        (ts.isIdentifier(node) && node.text === 'BRAND_TAGLINE');
      if (tagline) {
        const position = at(node);
        findings.push({ file, line: position.line + 1, column: position.character + 1, rule: 'screening-tagline', text: normalize(node.getText(source)), message: 'screening shows the lockup without the tagline, which says owed (decision D11)' });
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  lines.forEach((content, index) => {
    const match = EXEMPTION.exec(content);
    if (match === null) {
      return;
    }
    const reason = normalize(match[1] ?? '');
    if (reason.length < MIN_REASON) {
      findings.push({ file, line: index + 1, column: content.indexOf(EXEMPTION_MARKER) + 1, rule: 'exemption-without-reason', text: normalize(content), message: `a ${EXEMPTION_MARKER} comment says why the string is not copy` });
    } else if (!usedExemptions.has(index)) {
      findings.push({ file, line: index + 1, column: content.indexOf(EXEMPTION_MARKER) + 1, rule: 'exemption-unused', text: normalize(content), message: 'this exemption covers no finding; remove it' });
    }
  });

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Every file the lint reads, relative to `root`, with forward slashes. */
export function copyFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(child);
        }
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts') && !isTestFile(entry.name)) {
        files.push(child);
      }
    }
  };
  for (const start of COPY_ROOTS) {
    if (existsSync(path.join(root, start))) {
      walk(start);
    }
  }
  for (const file of COPY_FILES) {
    if (existsSync(path.join(root, file))) {
      files.push(file);
    }
  }
  return [...new Set(files)].sort();
}

/** What the rules find in every file the lint reads. */
export function copyViolations(root: string): CopyFinding[] {
  return copyFiles(root).flatMap((file) => scanSource(file, readFileSync(path.join(root, file), 'utf8')));
}

/** The reviewed exemptions standing in the files the lint reads, with their reasons. */
export function copyExemptions(root: string): { readonly file: string; readonly line: number; readonly reason: string }[] {
  return copyFiles(root).flatMap((file) =>
    readFileSync(path.join(root, file), 'utf8')
      .split('\n')
      .flatMap((content, index) => {
        const match = EXEMPTION.exec(content);
        return match === null ? [] : [{ file, line: index + 1, reason: normalize(match[1] ?? '') }];
      }),
  );
}
