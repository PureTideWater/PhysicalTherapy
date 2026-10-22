import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { badgeText, descriptor, independenceClaim, sealLabel, sealText, tagline, verifiedDefinition } from '../../packages/brand/src/tokens';

/**
 * The product-copy lint (Change Order 001, CO-11; docs/brand/BRAND.md, sections 1 and 7; .claude/rules/brand.md).
 * It reads the words a person sees, never the code around them: every string literal, template literal and
 * JSX text in the web app's source, in the report templates (the audit report, the ROI statement, the coverage
 * report, the monthly summary and the frame and packet templates they print in), in the email the worker sends
 * (the digest, dunning, support notices and support mail, the screening emails, and the mail template), in the
 * screening's upload refusals, and in the packages whose
 * words the web app shows (the UI states, triage's labels and pattern words, the packet's narrative and
 * refusals, the contract calendar), parsed with the TypeScript compiler, so comments, identifiers and object
 * keys are never read. In an HTML template it reads the text and the attributes a person reads (aria-label,
 * title, alt, placeholder); in JSX, the text, a choice of words (`{done ? 'Recovered' : 'Open'}`) in place, one
 * branch at a time, and every attribute that holds words. It fails on:
 *
 * - "ProofPack" or "proof pack", in any case (the word is packet);
 * - the word AI standing alone, and "intelligence" (product copy is neither);
 * - "independent verification platform" (the claim is "independent of the EMR and the payer");
 * - "recovered" not labelled by the cash that proves it: each "recovered" needs posted or deposited in
 *   parentheses right after it ("Recovered (posted)", "Recovered principal, net (deposited)"), or its clause
 *   (cut at a semicolon or a colon) must name that cash and not deny it ("recovered is the cash posted or
 *   deposited", never "recovered $5; 2 not yet posted"), or a "Posted:" or "Deposited:" label must head it;
 * - in a screening file (any path with a `screening` directory): owed, underpaid or recovered at all, and the
 *   tagline, whose first sentence says owed (decision D11: screening shows the lockup without the tagline);
 * - the brand's own words typed out (the tagline, the descriptor, the independence claim, the seal and badge
 *   text, the definition line): they are read from packages/brand/src/tokens.ts, never copied.
 *
 * A code is not copy (decision D10): a string that is one lowercase token (`'recovered'`, `'payer_approved'`,
 * `'stage-recovered'`, a CSV column) where it stands alone, SQL, a module path, a type, an object key, and the
 * code-valued JSX attributes (className, id, href, data-* and the like; on a component, variant, size, name
 * and the like only when the value is one lowercase token) are not read. A word shown as a JSX child or in a
 * template's text is copy whatever its case. A reviewed exception is a comment
 * `brand-copy-exempt: <why>` on the string's line or the line above; it needs its reason, and an exemption
 * that no longer covers a finding is itself a finding, so the list stays short. `pnpm test` runs it
 * (scan.test.ts), and `pnpm lint:copy` prints what it finds.
 */

/**
 * The directories read, relative to the repository root: the web app; the report templates; the digest (its
 * sentences are the email and the digest page) and the mail template; the packet's template, narrative and
 * refusals (the workbench shows the refusals); the worker's screening (the screening emails and the upload's
 * refusals, which the screening page shows; a screening file, so owed, underpaid and recovered fail there); and
 * the packages whose words the screens show: the UI states, triage (the stage labels, the write-off and pattern
 * words) and the packet's assembly.
 */
export const COPY_ROOTS = [
  'apps/web/src',
  'apps/worker/src/report',
  'apps/worker/src/digest',
  'apps/worker/src/mail',
  'apps/worker/src/packets',
  'apps/worker/src/screening',
  'packages/ui/src',
  'packages/triage/src',
  'packages/packets/src',
] as const;

/**
 * The copy outside those directories: the ROI statement, which prints in the report frame; the notes a line's
 * stage keeps when the ledger moves it back; the dunning, support-notice and support-mail emails; the
 * contract calendar's labels; and the pricing location's status sentences (Pricing settings, Coverage, Getting
 * started, a run's refusal and the console read them).
 */
export const COPY_FILES = [
  'apps/worker/src/reconcile/statement-html.ts',
  'apps/worker/src/reconcile/stages.ts',
  'apps/worker/src/billing/dunning.ts',
  'apps/worker/src/platform/support-notices.ts',
  'apps/worker/src/support/support-mail.ts',
  'packages/contracts/src/calendar.ts',
  'packages/contracts/src/location.ts',
] as const;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Dependencies, build output and test support (a directory, or a package's test-support.ts), which hold fixture data rather than copy. */
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

/**
 * The brand's words a unit copies, if any. A phrase is matched whole, in any case; a line of the seal only in
 * its capitals or as the whole unit, since "reconciled to cash" is also plain wording ("each figure is reconciled
 * to cash by the ledger").
 */
export function copiedBrandWords(text: string): string | undefined {
  const whole = normalize(text);
  const seal = sealText.find((line) => whole.includes(line) || whole.toLowerCase() === line.toLowerCase());
  if (seal !== undefined) {
    return seal;
  }
  const phrase = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
  return BRAND_WORDS.filter((words) => !(sealText as readonly string[]).includes(words)).find((words) => phrase(words).test(whole));
}

const RECOVERED = /\brecovered\b/gi;
/** The cash that proves recovered. */
const PROVED_BY = /\b(?:posted|deposited)\b/gi;
/** Posted or deposited in parentheses right after the word, at most three words between ("Recovered principal, net (posted)"). */
const ATTACHED = /^(?:[\s,]+[\p{L}’'-]+){0,3}?\s*\((?:posted|deposited)\b[^)]*\)/iu;
/** A word that turns the cash after it into its absence: "not yet posted", "before it posted", "never deposited". */
const DENIED = /\b(?:not|never|nor|yet|before|until|unless|without|no)\b(?:\s+\S+){0,2}\s*$/i;
/** A label that names the cash for the clause after its colon ("Deposited: recovered once the deposit matches"). */
const PROOF_LABEL = /^\s*(?:posted|deposited)\s*$/i;

/**
 * Whether a sentence says "recovered" without the cash that proves it (CO-11). The sentence is cut into clauses
 * at semicolons and colons, so a word in another clause labels nothing ("Recoveries posted: 3, recovered $1,200"
 * is not labelled); in its clause, each "recovered" is labelled by posted or deposited in parentheses right after
 * it, else the clause must say posted or deposited without denying it ("2 not yet posted" labels nothing), or a
 * "Posted:" or "Deposited:" label must head the clause.
 */
export function recoveredUnlabelled(sentence: string): boolean {
  const parts = sentence.split(/([;:])/);
  for (let index = 0; index < parts.length; index += 2) {
    const clause = parts[index] ?? '';
    const labelled = parts[index - 1] === ':' && PROOF_LABEL.test(parts[index - 2] ?? '');
    const bare = [...clause.matchAll(RECOVERED)].filter((match) => !ATTACHED.test(clause.slice(match.index + match[0].length)));
    const proved = [...clause.matchAll(PROVED_BY)].some((match) => !DENIED.test(clause.slice(0, match.index)));
    if (bare.length > 0 && !labelled && !proved) {
      return true;
    }
  }
  return false;
}

/** The marker of a reviewed exception, and the shortest reason it is read with. */
export const EXEMPTION_MARKER = 'brand-copy-exempt:';
const EXEMPTION = /brand-copy-exempt:(.*?)(?:\*\/|$)/;
const MIN_REASON = 12;

/** One lowercase token with no space: a code (a stage, an enum value, a CSV column, a path, a key). */
const CODE = /^[a-z0-9_.:/#@?=&%+[\]-]*$/;

/** SQL text, a query or a fragment of one: it starts with a keyword in capitals followed by more of it. */
const SQL = /^\s*(SELECT|WITH|INSERT INTO|UPDATE|DELETE FROM|SET LOCAL|SET|CREATE|ALTER|DROP|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|LOCK|TRUNCATE|VALUES|FROM|WHERE|AND|JOIN|LEFT JOIN|ORDER BY|GROUP BY)\s/;

/** JSX attributes whose values are codes, not words a person reads, on any element or component. */
const CODE_ATTRIBUTES = new Set(['className', 'class', 'id', 'key', 'href', 'src', 'srcSet', 'type', 'role', 'htmlFor', 'method', 'action', 'rel', 'target', 'lang', 'dir', 'autoComplete', 'inputMode', 'pattern', 'accept', 'encType', 'scope']);

/**
 * JSX attributes that hold a code on an HTML element (name, size, form ...), but on a component may hold words
 * (`<Field name="Contract intelligence" />`): there they are a code only when the value is one (one lowercase
 * token, `variant="destructive"`). The value of an input a person presses (submit, button, reset) and of a
 * textarea is words.
 */
const ELEMENT_CODE_ATTRIBUTES = new Set(['name', 'headers', 'size', 'variant', 'tone', 'as', 'form', 'align', 'value', 'defaultValue']);

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
const HAS_HTML_TAG = /<\/?[a-z][a-z0-9-]*\b[^>]*>/i;

/** Where a sentence ends: a block, a line break, or a full stop, question or exclamation mark before the next sentence. */
const SENTENCE_END = new RegExp(`${BREAK}|\\n|(?<=[.!?])\\s+(?=[A-Z0-9“"‘'(])`);

/** The attributes of an HTML tag that hold words a person reads (or hears): each is a sentence of its own. */
const HTML_WORD_ATTRIBUTE = /\s(?:aria-label|aria-description|title|alt|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

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
 * in a string, and after a sentence's full stop, question or exclamation mark. In HTML a line break is only
 * whitespace, so a template that writes tags breaks sentences at its block tags and full stops alone; the words
 * its tags carry in aria-label, title, alt and placeholder are sentences of their own.
 */
export function sentences(text: string): string[] {
  const html = HAS_HTML_TAG.test(text);
  const attributes = html ? [...text.matchAll(HTML_TAG)].flatMap((tag) => [...tag[0].matchAll(HTML_WORD_ATTRIBUTE)].map((match) => match[1] ?? match[2] ?? '')) : [];
  return [
    ...(html ? text.replace(/\n/g, ' ') : text)
      .replace(HTML_BLOCK_TAG, BREAK)
      .replace(HTML_TAG, '')
      .split(SENTENCE_END),
    ...attributes,
  ]
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

/**
 * A unit's text as segments: fixed text, or a choice of words (the branches of a conditional, `??`, `||` or `&&`
 * in a JSX child or a template's span), read in place one branch at a time.
 */
type Segment = string | readonly string[];

/** The most texts one unit is read as: one more for each branch past a choice's first, far more than any screen writes. */
const MAX_VARIANTS = 64;

/**
 * The texts a unit can show: every choice at its first branch, then each other branch in turn with the rest at
 * their first, so every branch is read in its context once.
 */
function variants(segments: readonly Segment[]): string[] {
  const first = (segment: Segment) => (typeof segment === 'string' ? segment : (segment[0] ?? PLACEHOLDER));
  const texts = [segments.map(first).join('')];
  segments.forEach((segment, index) => {
    if (typeof segment !== 'string') {
      for (const option of segment.slice(1)) {
        if (texts.length < MAX_VARIANTS) {
          texts.push(segments.map((other, at) => (at === index ? option : first(other))).join(''));
        }
      }
    }
  });
  return [...new Set(texts)];
}

function skipParentheses(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ? skipParentheses(expression.expression) : expression;
}

/**
 * The words an expression shown in place can be: a string or a template is its text; a conditional, `??` and
 * `||` are each of their branches; `a && b` is nothing or b. Anything else is a value, read as neither word. The
 * strings read here are consumed, so they are not read again on their own (where a lone lowercase token would
 * pass as a code).
 */
function shownTexts(expression: ts.Expression, consumed: Set<ts.Node>): string[] {
  const node = skipParentheses(expression);
  if (isStringNode(node)) {
    consumed.add(node);
    return [node.text];
  }
  if (ts.isTemplateExpression(node)) {
    consumed.add(node);
    return variants(templateSegments(node, consumed));
  }
  if (ts.isConditionalExpression(node)) {
    return [...shownTexts(node.whenTrue, consumed), ...shownTexts(node.whenFalse, consumed)];
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.QuestionQuestionToken || operator === ts.SyntaxKind.BarBarToken) {
      return [...shownTexts(node.left, consumed), ...shownTexts(node.right, consumed)];
    }
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return ['', ...shownTexts(node.right, consumed)];
    }
  }
  return [PLACEHOLDER];
}

/** A shown expression as a segment: fixed when it can be one text, a choice when it can be several. */
function shownSegment(expression: ts.Expression, consumed: Set<ts.Node>): Segment {
  const texts = [...new Set(shownTexts(expression, consumed))];
  return texts.length === 1 ? (texts[0] ?? PLACEHOLDER) : texts;
}

/** A template's text, each span's value a placeholder unless it shows words in place (a choice of strings). */
function templateSegments(node: ts.TemplateExpression, consumed: Set<ts.Node>): Segment[] {
  return [node.head.text, ...node.templateSpans.flatMap((span) => [shownSegment(span.expression, consumed), span.literal.text])];
}

/** A template's text with every span a placeholder: what decides whether the template is code. */
function templateText(node: ts.TemplateExpression): string {
  return node.head.text + node.templateSpans.map((span) => `${PLACEHOLDER}${span.literal.text}`).join('');
}

function isStringNode(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** An input whose value a person reads on it: a submit, button or reset input. */
function showsValue(element: ts.JsxOpeningLikeElement, tag: string): boolean {
  if (tag === 'textarea') {
    return true;
  }
  if (tag !== 'input') {
    return false;
  }
  const type = element.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText() === 'type');
  const value = type !== undefined && ts.isJsxAttribute(type) && type.initializer !== undefined && ts.isStringLiteral(type.initializer) ? type.initializer.text : '';
  return ['submit', 'button', 'reset'].includes(value);
}

/** Whether a JSX attribute's value is a code: by its name, and for some names by the element and the value. */
function attributeIsCode(attribute: ts.JsxAttribute, value: string): boolean {
  const name = attribute.name.getText();
  if (CODE_ATTRIBUTES.has(name) || name.startsWith('data-') || (name.startsWith('aria-') && !ARIA_WORDS.has(name))) {
    return true;
  }
  if (!ELEMENT_CODE_ATTRIBUTES.has(name)) {
    return false;
  }
  const element = attribute.parent.parent;
  const tag = element.tagName.getText();
  if (!/^[a-z]/.test(tag)) {
    // A component's own prop: a code only when its value is one.
    return CODE.test(value);
  }
  return !((name === 'value' || name === 'defaultValue') && showsValue(element, tag));
}

/** A string node whose place makes it a code, a key or a type, never words; `text` is what it holds. */
function inCodePosition(node: ts.Node, text: string): boolean {
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
    return attributeIsCode(parent, text);
  }
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    return attributeIsCode(parent.parent, text);
  }
  return false;
}

function isCodeText(text: string): boolean {
  return CODE.test(text) || SQL.test(text);
}

/** The text of a JSX element's children as segments, inline elements run in and block elements as line breaks. */
function jsxSegments(children: ts.NodeArray<ts.JsxChild>, consumed: Set<ts.Node>): Segment[] {
  const segments: Segment[] = [];
  for (const child of children) {
    if (ts.isJsxText(child)) {
      // A JSX text's line breaks are whitespace, as React renders them.
      segments.push(child.text.replace(/\s+/g, ' '));
    } else if (ts.isJsxExpression(child)) {
      if (child.expression !== undefined) {
        segments.push(shownSegment(child.expression, consumed));
      }
    } else if (ts.isJsxElement(child) && isInline(child)) {
      segments.push(...jsxSegments(child.children, consumed));
    } else if (ts.isJsxSelfClosingElement(child) && isInline(child)) {
      segments.push(jsxTagName(child) === 'br' ? ' ' : PLACEHOLDER);
    } else {
      segments.push(BREAK);
    }
  }
  return segments;
}

/**
 * Every unit of copy in one file: the strings and template literals, and each JSX element's running text, each
 * read once for every branch a choice of words in it can show.
 */
export function copyUnits(file: string, text: string): { source: ts.SourceFile; units: Unit[] } {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const units: Unit[] = [];
  const consumed = new Set<ts.Node>();

  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) || ts.isJsxFragment(node)) && !(isInline(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))) {
      for (const run of variants(jsxSegments(node.children, consumed))) {
        if (/[A-Za-z]/.test(run)) {
          units.push({ node, text: run });
        }
      }
    } else if (isStringNode(node) && !consumed.has(node)) {
      if (!inCodePosition(node, node.text) && !isCodeText(node.text)) {
        units.push({ node, text: node.text });
      }
    } else if (ts.isTemplateExpression(node) && !consumed.has(node)) {
      const joined = templateText(node);
      if (!inCodePosition(node, joined) && !isCodeText(joined.replaceAll(PLACEHOLDER, ''))) {
        for (const run of variants(templateSegments(node, consumed))) {
          if (!isCodeText(run.replaceAll(PLACEHOLDER, ''))) {
            units.push({ node, text: run });
          }
        }
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
    const copied = copiedBrandWords(unit.text);
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
      } else if (recoveredUnlabelled(sentence)) {
        found.push({ rule: 'recovered-unlabelled', message: '"recovered" not labelled by the cash that proves it: "Recovered (posted)", "recovered (posted or deposited)", or a clause that says the cash is posted or deposited' });
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

  // A unit read once per branch of a choice of words finds its fixed words once.
  const unique = new Map(findings.map((finding) => [`${String(finding.line)}:${String(finding.column)}:${finding.rule}:${finding.text}`, finding]));
  return [...unique.values()].sort((a, b) => a.line - b.line || a.column - b.column);
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
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts') && !isTestFile(entry.name) && !/^test-support\.tsx?$/.test(entry.name)) {
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
