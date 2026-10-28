import { parse } from 'yaml';

import type { CheckEvent, Finding, Level, Tree } from './check';
import { READ_DEADLINE_MS, ageWords, excludeWindowProblems, expiredExclude, type ExcludeWindow, type KnownTime } from './exclude-window';
import { MINUTE_MS, type ImageAgeException } from './policy';
import { type HubTag, NetworkReadError, type Registry } from './registry';

/**
 * The image rule (docs/adr/0066, Part 5; test matrix CI-22): every image the tree names is held to the founder's F2 (b)
 * release age, as npm versions are, measured from the push time Docker Hub recorded. Every image means each Dockerfile's
 * `FROM` and `# syntax=` lines, docker-compose.yml's services, and every workflow's job container, service container,
 * `docker://` step and setup-buildx builder (`driver-opts` `image=`). Offline (`imageFormRule`), each is
 * `name:tag@sha256:<64 hex>`, and every image reference the rule does not read is refused, so "every image" holds on its
 * own (S6). Networked (`imageRule`), only a digest the base names nowhere is read (no bootstrapping, E2): Docker Hub's tag
 * for it, or else the repository's most recently updated tags, four reads at a time under one deadline (E3). A young
 * digest fails unless a live security-fix entry in image-age-exceptions.json names it; a digest Hub shows on no tag fails
 * under every entry (B1); a registry other than Docker Hub is "age unprovable" unless a live age-unprovable entry names
 * the image. On a push every age finding is a warning; the pull request is the gate.
 */

/** The compose file the image rule reads, the one `pnpm dev` and CI's database jobs run. */
export const COMPOSE_FILE = 'docker-compose.yml';
/** The image exceptions, beside the checker. */
export const IMAGE_AGE_EXCEPTIONS_FILE = 'tools/check-toolchain/image-age-exceptions.json';
/** Docker Hub reads at once. */
export const IMAGE_READS_AT_ONCE = 4;
/** Pages of a repository's tags, most recently updated first, searched for a digest its own tag no longer names. */
export const HUB_SEARCH_PAGES = 5;

const RULE = 'images';
const HUB_HOST = 'hub.docker.com';
const FORM = 'name:tag@sha256:<64 hex>';
const RUNBOOK = 'docs/runbooks/dependency-upgrades.md, "Base images and PostgreSQL"';
const REMEDY = `wait until then, or, for a security fix, add a security-fix entry for it to ${IMAGE_AGE_EXCEPTIONS_FILE} with its advisory, the package and version it fixes, the date added and an expiry (${RUNBOOK})`;

/** An image the tree names, exactly as written, and where. */
export interface ImageUse {
  readonly image: string;
  readonly where: string;
}

/** An image reference, read: its registry (null for Docker Hub), its repository there, its tag and its digest. */
export interface ImageName {
  readonly registry: string | null;
  /** Docker Hub's `namespace/name` (`library/<name>` for an official image), or the path on another registry. */
  readonly repository: string;
  readonly tag: string;
  readonly digest: string;
}

const COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const DOMAIN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
/** The names Docker Hub answers to as a registry. */
const HUB_REGISTRIES = new Set(['docker.io', 'index.docker.io', 'registry-1.docker.io']);

/** An image reference read as `[registry/]path:tag@sha256:<64 hex>`, or why it is not one. */
export function parseImage(image: string): ImageName | { readonly problem: string } {
  const at = image.indexOf('@');
  if (at === -1) {
    return { problem: `names no digest, so what runs can change under the same name; pin it as ${FORM}` };
  }
  const pinned = image.slice(at + 1);
  if (!DIGEST.test(pinned)) {
    return { problem: `is not pinned by a sha256 digest; write it as ${FORM}` };
  }
  const named = image.slice(0, at);
  const colon = named.lastIndexOf(':');
  if (colon <= named.lastIndexOf('/')) {
    return { problem: `names no tag, so Docker Hub cannot be asked when its digest was pushed; write it as ${FORM}` };
  }
  const tag = named.slice(colon + 1);
  const parts = named.slice(0, colon).split('/');
  const first = parts[0] ?? '';
  // A first component with a dot or a port, or localhost, is a registry, as Docker reads a reference.
  const registry = parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost') ? first : null;
  const segments = registry === null ? parts : parts.slice(1);
  if (!TAG.test(tag) || segments.length === 0 || !segments.every((part) => COMPONENT.test(part)) || (registry !== null && !DOMAIN.test(registry))) {
    return { problem: `is not an image reference of the form ${FORM}` };
  }
  const hub = registry === null || HUB_REGISTRIES.has(registry.toLowerCase());
  if (hub && segments.length > 2) {
    return { problem: 'names a Docker Hub repository by more than namespace/name, which Docker Hub does not hold' };
  }
  return { registry: hub ? null : registry, repository: hub && segments.length === 1 ? `library/${segments[0] ?? ''}` : segments.join('/'), tag, digest: pinned };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// The Dockerfile reader: BuildKit v0.34.1's parser (moby/buildkit frontend/dockerfile/parser, parser.go,
// directives.go, split_command.go and line_parsers.go, and the word lexer of frontend/dockerfile/shell/lex.go), ported
// so that the image rule reads a Dockerfile's lines as the pinned builder does (SEC-S1). Each function names the Go one
// it follows. What it cannot vouch for it reports, and the rule refuses: a parse BuildKit refuses, and any FROM or from=
// line it did not place as that instruction, so a divergence it does not know of fails closed.

/** A Dockerfile instruction as BuildKit reads it. */
export interface DockerfileInstruction {
  /** The line it starts on, 1-based. */
  readonly line: number;
  /** Every line its text came from: the first and each continuation, never a comment, blank or heredoc body line. */
  readonly lines: readonly number[];
  /** Its keyword, upper case as BuildKit dispatches it (FROM, COPY, RUN, ONBUILD, …), or as written when unknown. */
  readonly command: string;
  /** Its leading `--flags`, quotes and escapes removed, as BuildKit extracts them (`--from=build`). */
  readonly flags: readonly string[];
  /** Its arguments: whitespace-split for FROM, COPY and ADD, the JSON array's strings, or the rest as one. */
  readonly args: readonly string[];
  /** ONBUILD's trigger, read as an instruction of its own. */
  readonly trigger?: DockerfileInstruction;
}

/** A Dockerfile as BuildKit reads it (readDockerfile). */
export interface DockerfileRead {
  /**
   * The frontend images the build is handed to: the one BuildKit picks (DetectSyntax: a `# syntax=` or `//syntax=`
   * directive after a byte-order mark and a `#!` line, else a JSON Dockerfile's "syntax"), and, stricter than BuildKit,
   * every other line that reads as a syntax directive.
   */
  readonly frontends: readonly { readonly line: number; readonly image: string }[];
  /** Each FROM, in order: its image or earlier stage as written, and its stage name (null when it has none). */
  readonly stages: readonly { readonly line: number; readonly image: string; readonly name: string | null }[];
  readonly instructions: readonly DockerfileInstruction[];
  /**
   * Why the reader cannot vouch for what it read, by line: a JSON Dockerfile, a parse BuildKit refuses, a FROM line it
   * did not place as a FROM instruction, a from= outside every COPY and RUN. Empty: every image the file can name is
   * in `frontends`, `stages` or a COPY or RUN flag.
   */
  readonly problems: readonly { readonly line: number; readonly message: string }[];
}

/** A Dockerfile BuildKit's parser refuses, and the line where. */
class DockerfileParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/** A word the lexer cannot read (an unmatched quote, a bad substitution). */
class LexError extends Error {}

/** Go's unicode.IsSpace. */
function isGoSpace(ch: string): boolean {
  if (ch === '\t' || ch === '\n' || ch === '\v' || ch === '\f' || ch === '\r' || ch === ' ' || ch === '\u0085' || ch === ' ') {
    return true;
  }
  const code = ch.codePointAt(0) ?? 0;
  return code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000;
}

/** Go's TrimLeftFunc(unicode.IsSpace), TrimSpace. */
function trimLeftGo(text: string): string {
  let at = 0;
  while (at < text.length && isGoSpace(text[at] ?? '')) {
    at += 1;
  }
  return text.slice(at);
}
function trimSpaceGo(text: string): string {
  let end = text.length;
  while (end > 0 && isGoSpace(text[end - 1] ?? '')) {
    end -= 1;
  }
  return trimLeftGo(text.slice(0, end));
}

/** Go's strings.ToLower for an instruction's keyword: simple case mapping, so ONBUİLD reads as onbuild. */
const goLower = (text: string) => text.replace(/İ/g, 'i').toLowerCase();

/** BuildKit's trimNewline: every trailing CR and LF. */
const trimNewline = (line: string) => line.replace(/[\r\n]+$/, '');

/** BuildKit's isComment: a `#` first after leading whitespace. */
const isComment = (line: string) => trimLeftGo(line).startsWith('#');

/** BuildKit's directive regexp, with Go's \s ([\t\n\f\r ]) and `.` (not \n). */
const DIRECTIVE = /^([a-zA-Z][a-zA-Z0-9]*)[\t\n\f\r ]*=[\t\n\f\r ]*([^\n]+?)[\t\n\f\r ]*$/;
const DIRECTIVE_KEYS = new Set(['syntax', 'escape', 'check']);

/** BuildKit's DirectiveParser: directives only at the top, each key once, the first other line ending them. */
class DirectiveParser {
  private done = false;
  private readonly seen = new Set<string>();

  constructor(private readonly comment: string) {}

  /** ParseLine: the directive, or null (and null for every later line); throws on a repeated key. */
  parseLine(line: string, at: number): { readonly name: string; readonly value: string } | null {
    if (this.done) {
      return null;
    }
    if (!line.startsWith(this.comment)) {
      this.done = true;
      return null;
    }
    const match = DIRECTIVE.exec(trimLeftGo(line.slice(this.comment.length)));
    const name = match?.[1]?.toLowerCase();
    if (match === null || name === undefined || !DIRECTIVE_KEYS.has(name)) {
      this.done = true;
      return null;
    }
    if (this.seen.has(name)) {
      throw new DockerfileParseError(`only one ${name} parser directive can be used`, at);
    }
    this.seen.add(name);
    return { name, value: match[2] ?? '' };
  }
}

/** bufio.ScanLines: lines without their LF and one trailing CR, no line after a final LF. */
function scanLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * DetectSyntax: after a byte-order mark (stripped by the caller) and a `#!` line, the `syntax` of the `#` directives,
 * else of `//` directives, else a JSON object's "syntax"; the image is the value up to its first space.
 */
function detectSyntax(body: string): { readonly line: number; readonly image: string } | null {
  let lines = scanLines(body);
  let data = body;
  let offset = 0;
  if ((lines[0] ?? '').startsWith('#!')) {
    lines = lines.slice(1);
    data = body.includes('\n') ? body.slice(body.indexOf('\n') + 1) : '';
    offset = 1;
  }
  for (const comment of ['#', '//']) {
    const parser = new DirectiveParser(comment);
    for (const [index, line] of lines.entries()) {
      let directive: { readonly name: string; readonly value: string } | null;
      try {
        directive = parser.parseLine(line, index + 1 + offset);
      } catch {
        break;
      }
      if (directive === null) {
        break;
      }
      if (directive.name === 'syntax') {
        return { line: index + 1 + offset, image: directive.value.split(' ')[0] ?? '' };
      }
    }
  }
  const json = jsonObject(data);
  return json !== null && typeof json.syntax === 'string' ? { line: 1 + offset, image: json.syntax.split(' ')[0] ?? '' } : null;
}

/** The text as a JSON object, as Go's json.Unmarshal into a map reads one; null for anything else. */
function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** setEscapeToken's line-continuation regexp for `\` or a backtick. */
function continuationOf(escape: string): RegExp {
  const token = escape === '\\' ? '\\\\' : '`';
  return new RegExp(`([^${token}])${token}[ \\t]*$|^${token}[ \\t]*$`);
}

/** trimContinuationCharacter: the line without its continuation token, and whether it ends the instruction. */
function trimContinuation(line: string, continuation: RegExp): [string, boolean] {
  return continuation.test(line) ? [line.replace(continuation, '$1'), false] : [line, true];
}

/** Go's unicode.IsSpace of a byte read as a rune, as extractBuilderFlags tests each byte. */
const isSpaceByte = (byte: number) => byte === 9 || byte === 10 || byte === 11 || byte === 12 || byte === 13 || byte === 32 || byte === 0x85 || byte === 0xa0;

/**
 * extractBuilderFlags: the leading `--` words, byte by byte as BuildKit reads them (each byte written as the rune of its
 * value), quotes and escapes removed, up to the first other word or `--`; and the rest of the line.
 */
function extractBuilderFlags(line: string, escape: string): { readonly rest: string; readonly flags: string[] } {
  const bytes = Buffer.from(line, 'utf8');
  const escapeByte = escape.charCodeAt(0);
  const rest = (at: number) => bytes.subarray(at).toString('utf8');
  const flags: string[] = [];
  const IN_SPACES = 0;
  const IN_WORD = 1;
  const IN_QUOTE = 2;
  let phase = IN_SPACES;
  let word = '';
  let quote = 0;
  let blankOk = false;
  let ch = 0;
  for (let at = 0; at <= bytes.length; at += 1) {
    if (at !== bytes.length) {
      ch = bytes[at] ?? 0;
    }
    if (phase === IN_SPACES) {
      if (at === bytes.length) {
        break;
      }
      if (isSpaceByte(ch)) {
        continue;
      }
      if (ch !== 0x2d || at + 1 === bytes.length || bytes[at + 1] !== 0x2d) {
        return { rest: rest(at), flags };
      }
      phase = IN_WORD;
    }
    if ((phase === IN_WORD || phase === IN_QUOTE) && at === bytes.length) {
      if (word !== '--' && (blankOk || word.length > 0)) {
        flags.push(word);
      }
      break;
    }
    if (phase === IN_WORD) {
      if (isSpaceByte(ch)) {
        phase = IN_SPACES;
        if (word === '--') {
          return { rest: rest(at), flags };
        }
        if (blankOk || word.length > 0) {
          flags.push(word);
        }
        word = '';
        blankOk = false;
        continue;
      }
      if (ch === 0x27 || ch === 0x22) {
        quote = ch;
        blankOk = true;
        phase = IN_QUOTE;
        continue;
      }
      if (ch === escapeByte) {
        if (at + 1 === bytes.length) {
          continue;
        }
        at += 1;
        ch = bytes[at] ?? 0;
      }
      word += String.fromCharCode(ch);
      continue;
    }
    if (ch === quote) {
      phase = IN_WORD;
      continue;
    }
    if (ch === escapeByte) {
      if (at + 1 === bytes.length) {
        phase = IN_WORD;
        continue;
      }
      at += 1;
      ch = bytes[at] ?? 0;
    }
    word += String.fromCharCode(ch);
  }
  return { rest: '', flags };
}

/** reWhitespace, which splits a command from its arguments and FROM's arguments from each other. */
const WHITESPACE = /[\t\v\f\r ]+/;

/** The keywords BuildKit dispatches, by lower case. */
const KEYWORDS = new Set(['add', 'arg', 'cmd', 'copy', 'entrypoint', 'env', 'expose', 'from', 'healthcheck', 'label', 'maintainer', 'onbuild', 'run', 'shell', 'stopsignal', 'user', 'volume', 'workdir']);

/** An instruction's parse, before its lines are known. */
interface Parsed {
  readonly command: string;
  readonly flags: readonly string[];
  readonly args: readonly string[];
  readonly json: boolean;
  readonly trigger?: Parsed;
}

/** parseJSON: a JSON array of strings, null when the text is no JSON array; throws when one holds anything but strings. */
function jsonArray(rest: string, at: number): string[] | null {
  const text = trimLeftGo(rest);
  if (!text.startsWith('[')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const strings = parsed.filter((item): item is string => typeof item === 'string');
  if (strings.length !== parsed.length) {
    throw new DockerfileParseError('when using JSON array syntax, arrays must be comprised of strings only', at);
  }
  return strings;
}

/** newNodeFromLine: splitCommand, then the command's line parser (an unknown command's arguments are ignored). */
function parseInstruction(line: string, escape: string, at: number): Parsed {
  const trimmed = trimSpaceGo(line);
  const split = WHITESPACE.exec(trimmed);
  const keyword = split === null ? trimmed : trimmed.slice(0, split.index);
  const extracted = split === null ? { rest: '', flags: [] } : extractBuilderFlags(trimmed.slice(split.index + split[0].length), escape);
  const rest = trimSpaceGo(extracted.rest);
  const lower = goLower(keyword);
  const command = KEYWORDS.has(lower) ? lower.toUpperCase() : keyword;
  const words = () => (rest === '' ? [] : rest.split(WHITESPACE));
  switch (lower) {
    case 'from':
    case 'expose':
      return { command, flags: extracted.flags, args: words(), json: false };
    case 'add':
    case 'copy':
    case 'volume': {
      const array = jsonArray(rest, at);
      return array === null ? { command, flags: extracted.flags, args: words(), json: false } : { command, flags: extracted.flags, args: array, json: true };
    }
    case 'run':
    case 'cmd':
    case 'entrypoint':
    case 'shell': {
      const array = rest === '' ? null : jsonArray(rest, at);
      return array === null ? { command, flags: extracted.flags, args: rest === '' ? [] : [rest], json: false } : { command, flags: extracted.flags, args: array, json: true };
    }
    case 'onbuild':
      return rest === '' ? { command, flags: extracted.flags, args: [], json: false } : { command, flags: extracted.flags, args: [rest], json: false, trigger: parseInstruction(rest, escape, at) };
    default:
      return { command, flags: extracted.flags, args: rest === '' ? [] : [rest], json: false };
  }
}

/** canContainHeredoc: RUN, COPY or ADD (ONBUILD's trigger for ONBUILD), not in JSON form. */
function canContainHeredoc(parsed: Parsed): boolean {
  const node = parsed.command === 'ONBUILD' && parsed.trigger !== undefined ? parsed.trigger : parsed;
  return (node.command === 'RUN' || node.command === 'COPY' || node.command === 'ADD') && !node.json;
}

/** The words of a list as shell/lex.go's wordsStruct gathers them, into a buffer that a nested read resets (as Go's does). */
class Words {
  readonly words: string[] = [];
  private inWord = false;

  constructor(private readonly buffer: { text: string }) {}

  addChar(ch: string): void {
    if (isGoSpace(ch) && this.inWord) {
      if (this.buffer.text.length !== 0) {
        this.words.push(this.buffer.text);
        this.buffer.text = '';
        this.inWord = false;
      }
    } else if (!isGoSpace(ch)) {
      this.addRawChar(ch);
    }
  }

  addRawChar(ch: string): void {
    this.buffer.text += ch;
    this.inWord = true;
  }

  addString(text: string): void {
    for (const ch of text) {
      this.addChar(ch);
    }
  }

  addRawString(text: string): void {
    this.buffer.text += text;
    this.inWord = true;
  }

  get(): string[] {
    if (this.buffer.text.length > 0) {
      this.words.push(this.buffer.text);
      this.buffer.text = '';
      this.inWord = false;
    }
    return this.words;
  }
}

/**
 * shell/lex.go's shellWord with escape `\`, no environment and SkipUnsetEnv (as BuildKit reads a heredoc's words):
 * ProcessWords splits a line into words, keeping quotes (RawQuotes) and escapes (RawEscapes) when asked.
 */
class ShellWord {
  private readonly chars: string[];
  private at = 0;
  private rawEscapes: boolean;
  private readonly buffer = { text: '' };

  constructor(
    word: string,
    private readonly rawQuotes: boolean,
    rawEscapes: boolean,
  ) {
    this.chars = Array.from(word);
    this.rawEscapes = rawEscapes;
  }

  /** ProcessWords. */
  words(): string[] {
    return this.stopOn(null, this.rawEscapes, false).words;
  }

  private peek(): string | null {
    return this.chars[this.at] ?? null;
  }

  private next(): string | null {
    const ch = this.chars[this.at] ?? null;
    if (ch !== null) {
      this.at += 1;
    }
    return ch;
  }

  /** processStopOn. */
  private stopOn(stop: string | null, rawEscapes: boolean, preserve: boolean): { readonly result: string; readonly words: string[] } {
    let result = '';
    this.buffer.text = '';
    const words = new Words(this.buffer);
    const toggled = rawEscapes !== this.rawEscapes;
    if (toggled) {
      this.rawEscapes = rawEscapes;
    }
    try {
      while (this.peek() !== null) {
        const ch = this.peek() ?? '';
        if (stop !== null && ch === stop) {
          this.next();
          return { result, words: words.get() };
        }
        const special = ch === '$' ? () => this.dollar() : ch === '<' ? () => this.possibleHeredoc() : ch === "'" ? () => this.singleQuote(preserve) : ch === '"' ? () => this.doubleQuote(preserve) : null;
        if (special !== null) {
          const text = special();
          result += text;
          if (ch === '$') {
            words.addString(text);
          } else {
            words.addRawString(text);
          }
          continue;
        }
        let read = this.next() ?? '';
        if (read === '\\') {
          if (this.rawEscapes) {
            words.addRawChar(read);
            result += read;
          }
          const escaped = this.next();
          if (escaped === null) {
            break;
          }
          read = escaped;
          words.addRawChar(read);
        } else {
          words.addChar(read);
        }
        result += read;
      }
      if (stop !== null) {
        throw new LexError(`unexpected end of statement while looking for matching ${stop}`);
      }
      return { result, words: words.get() };
    } finally {
      if (toggled) {
        this.rawEscapes = !rawEscapes;
      }
    }
  }

  /** processSingleQuote. */
  private singleQuote(preserve: boolean): string {
    let result = '';
    const open = this.next() ?? '';
    if (this.rawQuotes) {
      result += open;
    }
    for (;;) {
      const ch = this.next();
      if (ch === null) {
        throw new LexError('unexpected end of statement while looking for matching single-quote');
      }
      if (ch === "'") {
        if (this.rawQuotes) {
          result += ch;
        }
        return result;
      }
      if (preserve && ch === '\\') {
        result += ch;
      }
      result += ch;
    }
  }

  /** processDoubleQuote. */
  private doubleQuote(preserve: boolean): string {
    let result = '';
    const open = this.next() ?? '';
    if (this.rawQuotes) {
      result += open;
    }
    for (;;) {
      const ahead = this.peek();
      if (ahead === null) {
        throw new LexError('unexpected end of statement while looking for matching double-quote');
      }
      if (ahead === '"') {
        const close = this.next() ?? '';
        if (this.rawQuotes) {
          result += close;
        }
        return result;
      }
      if (ahead === '$') {
        result += this.dollar();
        continue;
      }
      let ch = this.next() ?? '';
      if (ch === '\\') {
        const after = this.peek();
        if (after === null) {
          continue;
        }
        if (after === '"' || after === '$' || after === '\\') {
          if (this.rawEscapes) {
            result += ch;
          }
          ch = this.next() ?? '';
        } else if (this.rawEscapes && (!this.rawQuotes || preserve)) {
          result += ch;
        }
      }
      result += ch;
    }
  }

  /** processDollar, with every variable unset and kept as written. */
  private dollar(): string {
    this.next();
    if (this.peek() !== '{') {
      const name = this.name();
      return name === '' ? '$' : `$${name}`;
    }
    this.next();
    const ahead = this.peek();
    if (ahead === null) {
      throw new LexError("syntax error: missing '}'");
    }
    if (ahead === '{' || ahead === '}' || ahead === ':') {
      throw new LexError('syntax error: bad substitution');
    }
    const name = this.name();
    let ch = this.next();
    let modifier = ch ?? '';
    let nullIsUnset = false;
    if (ch === '}') {
      return `\${${name}}`;
    }
    if (ch === ':') {
      nullIsUnset = true;
      ch = this.next();
      modifier += ch ?? '';
    }
    if (nullIsUnset || ch === '+' || ch === '-' || ch === '?' || ch === '#' || ch === '%') {
      const raw = ch === '#' || ch === '%';
      if (nullIsUnset && raw) {
        throw new LexError(`unsupported modifier (${modifier}) in substitution`);
      }
      const word = this.until('}', raw, raw, "syntax error: missing '}'");
      return `\${${name}${modifier}${word}}`;
    }
    if (ch === '/') {
      if (this.peek() === '/') {
        this.next();
      }
      const pattern = this.until('/', true, true, "syntax error: missing '/' in ${}");
      const replacement = this.until('}', true, false, "syntax error: missing '}'");
      return `\${${name}/${pattern}/${replacement}}`;
    }
    throw new LexError(`unsupported modifier (${modifier}) in substitution`);
  }

  /** A nested processStopOn, its error at the end of the text named as Go names it. */
  private until(stop: string, rawEscapes: boolean, preserve: boolean, missing: string): string {
    try {
      return this.stopOn(stop, rawEscapes, preserve).result;
    } catch (error) {
      if (this.peek() === null) {
        throw new LexError(missing);
      }
      throw error;
    }
  }

  /** processName. */
  private name(): string {
    let name = '';
    while (this.peek() !== null) {
      const ch = this.peek() ?? '';
      if (name === '' && /^\p{Nd}$/u.test(ch)) {
        while (this.peek() !== null && /^\p{Nd}$/u.test(this.peek() ?? '')) {
          name += this.next() ?? '';
        }
        return name;
      }
      if (name === '' && '@*#?-$!0'.includes(ch)) {
        this.next();
        return ch;
      }
      if (!/^[\p{L}\p{Nd}_]$/u.test(ch)) {
        break;
      }
      name += this.next() ?? '';
    }
    return name;
  }

  /** processPossibleHeredoc: `<<` and the whitespace after it as one raw piece of a word, else `<`. */
  private possibleHeredoc(): string {
    this.next();
    if (this.peek() !== '<') {
      return '<';
    }
    this.next();
    let space = '';
    while (this.peek() === '\t' || this.peek() === '\r' || this.peek() === ' ') {
      space += this.next() ?? '';
    }
    return `<<${space}`;
  }
}

/** reHeredoc, with Go's \d and \s. */
const HEREDOC = /^([0-9]*)<<(-?)[\t\n\f\r ]*([^<]*)$/;

/** heredocsFromLine and heredocFromMatch: each unquoted word `<<[-]NAME` of the line, its terminator NAME unquoted. */
function heredocsOf(line: string, at: number): { readonly name: string; readonly chomp: boolean }[] {
  let words: string[];
  try {
    words = new ShellWord(line, true, true).words();
  } catch {
    words = [];
  }
  const heredocs: { name: string; chomp: boolean }[] = [];
  for (const word of words) {
    const match = HEREDOC.exec(word);
    const rest = match?.[3] ?? '';
    if (match === null || rest === '') {
      continue;
    }
    try {
      const plain = new ShellWord(rest, false, false).words();
      if (plain.length !== 1) {
        continue;
      }
      const raw = new ShellWord(rest, true, false).words();
      if (raw.length !== plain.length) {
        throw new LexError(`internal lexing of heredoc produced inconsistent results: ${rest}`);
      }
      heredocs.push({ name: plain[0] ?? '', chomp: match[2] === '-' });
    } catch (error) {
      throw new DockerfileParseError(error instanceof Error ? error.message : String(error), at);
    }
  }
  return heredocs;
}

/** Parse: the instructions of a Dockerfile (its byte-order mark already stripped), or the line BuildKit stops at. */
function parseDockerfile(body: string): { readonly instructions: DockerfileInstruction[]; readonly failure: { readonly line: number; readonly message: string } | null } {
  const lines = body.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  const directives = new DirectiveParser('#');
  let escape = '\\';
  let continuation = continuationOf(escape);
  const instructions: DockerfileInstruction[] = [];
  let at = 0;
  // processLine: the line without its newline (and leading whitespace, for an instruction's first), any directive
  // taken, and a comment read as empty.
  const processLine = (raw: string, stripLeft: boolean, number: number): string => {
    let token = trimNewline(raw);
    if (stripLeft) {
      token = trimLeftGo(token);
    }
    const directive = directives.parseLine(token, number);
    if (directive?.name === 'escape') {
      if (directive.value !== '`' && directive.value !== '\\') {
        throw new DockerfileParseError(`invalid escape token '${directive.value}' does not match \` or \\`, number);
      }
      escape = directive.value;
      continuation = continuationOf(escape);
    }
    return isComment(token) ? '' : token;
  };
  const toInstruction = (parsed: Parsed, line: number, read: readonly number[]): DockerfileInstruction => ({
    line,
    lines: read,
    command: parsed.command,
    flags: parsed.flags,
    args: parsed.args,
    ...(parsed.trigger === undefined ? {} : { trigger: toInstruction(parsed.trigger, line, read) }),
  });
  try {
    while (at < lines.length) {
      const start = at + 1;
      const first = processLine(lines[at] ?? '', true, start);
      at += 1;
      let [text, ended] = trimContinuation(first, continuation);
      if (ended && text === '') {
        continue;
      }
      let joined = text;
      const read = [start];
      while (!ended && at < lines.length) {
        const raw = lines[at] ?? '';
        const processed = processLine(raw, false, at + 1);
        at += 1;
        if (isComment(raw) || trimLeftGo(trimNewline(processed)) === '') {
          continue;
        }
        [text, ended] = trimContinuation(processed, continuation);
        joined += text;
        read.push(at);
      }
      const parsed = parseInstruction(joined, escape, start);
      if (canContainHeredoc(parsed) && joined.includes('<<')) {
        for (const heredoc of heredocsOf(joined, start)) {
          let terminated = false;
          while (at < lines.length) {
            const candidate = trimNewline(lines[at] ?? '');
            at += 1;
            if ((heredoc.chomp ? candidate.replace(/^\t+/, '') : candidate) === heredoc.name) {
              terminated = true;
              break;
            }
          }
          if (!terminated) {
            throw new DockerfileParseError('unterminated heredoc', start);
          }
        }
      }
      instructions.push(toInstruction(parsed, start, read));
    }
  } catch (error) {
    if (error instanceof DockerfileParseError) {
      return { instructions, failure: { line: error.line, message: error.message } };
    }
    throw error;
  }
  return { instructions, failure: null };
}

/**
 * Reads a Dockerfile as BuildKit v0.34.1, the pinned builder, reads it (SEC-S1, SEC-S2): its frontend images, its
 * stages and instructions, and the problems that keep the reader from vouching for them. The image rule reads every
 * Dockerfile through it, and so does CI-13 (tools/test/workflows.test.ts), so the two cannot read a file differently.
 */
export function readDockerfile(text: string): DockerfileRead {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const raw = body.split('\n');
  const problems: { line: number; message: string }[] = [];
  const frontends: { line: number; image: string }[] = [];
  const detected = detectSyntax(body);
  if (detected !== null) {
    frontends.push(detected);
  }
  raw.forEach((line, index) => {
    const image = /^\s*(?:#|\/\/)\s*syntax\s*=\s*(\S+)/i.exec(line)?.[1];
    if (image !== undefined && !frontends.some((frontend) => frontend.line === index + 1 && frontend.image === image)) {
      frontends.push({ line: index + 1, image });
    }
  });
  frontends.sort((a, b) => a.line - b.line);
  const shebang = (raw[0] ?? '').startsWith('#!');
  if (jsonObject(shebang ? raw.slice(1).join('\n') : body) !== null) {
    problems.push({
      line: 1,
      message: `a JSON Dockerfile, which BuildKit hands whole to the frontend its "syntax" names, so no instruction of it is read; write the Dockerfile's instructions (${RUNBOOK})`,
    });
  }
  const { instructions, failure } = parseDockerfile(body);
  if (failure !== null) {
    problems.push({ line: failure.line, message: `BuildKit's parser refuses this Dockerfile (${failure.message}), so the images it names cannot be read; correct it (${RUNBOOK})` });
  } else {
    const froms = new Set(instructions.filter((instruction) => instruction.command === 'FROM').map((instruction) => instruction.line));
    const placed = new Set(
      instructions.filter((instruction) => [instruction.command, instruction.trigger?.command].some((command) => command === 'COPY' || command === 'RUN')).flatMap((instruction) => instruction.lines),
    );
    raw.forEach((line, index) => {
      if (/^\s*FROM(?=[\s\\`]|$)/i.test(line) && !froms.has(index + 1)) {
        problems.push({
          line: index + 1,
          message: `a FROM line BuildKit does not read as a FROM instruction (a heredoc's body, or the continuation of the instruction before it), so the image rule cannot place it and refuses it; make each FROM line an instruction of its own (${RUNBOOK})`,
        });
      }
      // A comment is never an instruction to BuildKit, outside a heredoc or in one.
      if (/from=/i.test(line) && !isComment(line) && !placed.has(index + 1)) {
        problems.push({
          line: index + 1,
          message: `a from= outside every COPY and RUN instruction as BuildKit reads the file (a heredoc's body, or another instruction), so the image rule cannot place it and refuses it; copy and mount only from an earlier stage (${RUNBOOK})`,
        });
      }
    });
  }
  const stages = instructions
    .filter((instruction) => instruction.command === 'FROM')
    .map((instruction) => ({ line: instruction.line, image: instruction.args[0] ?? '', name: instruction.args[1]?.toLowerCase() === 'as' ? (instruction.args[2] ?? null) : null }));
  return { frontends, stages, instructions, problems: problems.sort((a, b) => a.line - b.line) };
}

/** Go's encoding/csv for one line (no lazy quotes), as BuildKit reads a --mount's fields; throws when it cannot. */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let at = 0;
  for (;;) {
    if (line[at] === '"') {
      let field = '';
      at += 1;
      for (;;) {
        const quote = line.indexOf('"', at);
        if (quote === -1) {
          throw new Error('extraneous or missing " in quoted-field');
        }
        field += line.slice(at, quote);
        at = quote + 1;
        if (line[at] === '"') {
          field += '"';
          at += 1;
          continue;
        }
        if (at === line.length || line[at] === ',') {
          break;
        }
        throw new Error('extraneous or missing " in quoted-field');
      }
      fields.push(field);
    } else {
      const comma = line.indexOf(',', at);
      const field = comma === -1 ? line.slice(at) : line.slice(at, comma);
      if (field.includes('"')) {
        throw new Error('bare " in non-quoted-field');
      }
      fields.push(field);
      at = comma === -1 ? line.length : comma;
    }
    if (at >= line.length) {
      return fields;
    }
    at += 1;
  }
}

/** The values of an instruction's `--<name>=` flags (any case, stricter than BuildKit's exact names). */
const flagValues = (flags: readonly string[], name: string) =>
  flags.flatMap((flag) => {
    const equals = flag.indexOf('=');
    return equals !== -1 && flag.slice(2, equals).toLowerCase() === name ? [flag.slice(equals + 1)] : [];
  });

function dockerfileImages(file: string, text: string, uses: ImageUse[], unread: string[]): void {
  const read = readDockerfile(text);
  // Every frontend BuildKit can hand the build to before it reads the file, and every other syntax line (CI-13 reads the same).
  for (const { line, image } of read.frontends) {
    uses.push({ image, where: `${file}:${String(line)}` });
  }
  const refused: { line: number; message: string }[] = [...read.problems];
  // The stages so far, by name (lower case, as BuildKit compares them) or null; the last is the current one.
  const stages: (string | null)[] = [];
  // An earlier stage by name or index; an ONBUILD trigger runs in a stage built FROM this one, so this one counts too.
  const isStage = (from: string, trigger: boolean) => {
    const known = trigger ? stages : stages.slice(0, -1);
    return /^\d+$/.test(from) ? Number(from) < known.length : known.includes(from.toLowerCase());
  };
  for (const instruction of read.instructions) {
    if (instruction.command === 'FROM') {
      const image = instruction.args[0] ?? '';
      if (image !== '' && image.toLowerCase() !== 'scratch' && !stages.includes(image.toLowerCase())) {
        uses.push({ image, where: `${file}:${String(instruction.line)}` });
      }
      stages.push(instruction.args[1]?.toLowerCase() === 'as' ? (instruction.args[2]?.toLowerCase() ?? null) : null);
    }
    for (const [prefix, step] of [
      ['', instruction],
      ['ONBUILD ', instruction.trigger],
    ] as const) {
      if (step?.command === 'COPY') {
        for (const value of flagValues(step.flags, 'from').filter((from) => !isStage(from, prefix !== ''))) {
          refused.push({ line: instruction.line, message: `${prefix}COPY --from=${value} names an image, not an earlier stage; the image rule reads only FROM and # syntax= lines, so copy from a stage built FROM a pinned image (${RUNBOOK})` });
        }
      } else if (step?.command === 'RUN') {
        for (const mount of flagValues(step.flags, 'mount')) {
          let fields: string[];
          try {
            fields = csvFields(mount);
          } catch (error) {
            refused.push({ line: instruction.line, message: `${prefix}RUN --mount=${mount} is not the CSV BuildKit reads (${error instanceof Error ? error.message : String(error)}), so what it mounts cannot be read; correct it (${RUNBOOK})` });
            continue;
          }
          for (const field of fields) {
            const equals = field.indexOf('=');
            const from = equals !== -1 && field.slice(0, equals).toLowerCase() === 'from' ? field.slice(equals + 1) : undefined;
            if (from !== undefined && !isStage(from, prefix !== '')) {
              refused.push({ line: instruction.line, message: `${prefix}RUN --mount=…,from=${from} names an image, not an earlier stage; the image rule reads only FROM and # syntax= lines, so mount from a stage built FROM a pinned image (${RUNBOOK})` });
            }
          }
        }
      }
    }
  }
  for (const { line, message } of refused.sort((a, b) => a.line - b.line)) {
    unread.push(`${file}:${String(line)}: ${message}`);
  }
}

function workflowImages(file: string, text: string, uses: ImageUse[], unread: string[]): void {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    unread.push(`${file}: not YAML (${error instanceof Error ? error.message : String(error)}), so the images it names cannot be read`);
    return;
  }
  const jobs = isRecord(parsed) && isRecord(parsed.jobs) ? parsed.jobs : {};
  for (const [id, job] of Object.entries(jobs)) {
    if (!isRecord(job)) {
      continue;
    }
    const at = `${file} ${id}`;
    if (job.container !== undefined) {
      const image = isRecord(job.container) ? job.container.image : job.container;
      if (typeof image === 'string') {
        uses.push({ image, where: `${at} container` });
      } else {
        unread.push(`${at} container: names no image the rule can read; write its image as ${FORM}`);
      }
    }
    if (job.services !== undefined) {
      for (const [name, service] of Object.entries(isRecord(job.services) ? job.services : { '': job.services })) {
        const image = isRecord(service) ? service.image : undefined;
        if (typeof image === 'string') {
          uses.push({ image, where: `${at} services.${name}` });
        } else {
          unread.push(`${at} services${name === '' ? '' : `.${name}`}: names no image the rule can read; write its image as ${FORM}`);
        }
      }
    }
    const steps: unknown[] = Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((step, index) => {
      if (!isRecord(step) || typeof step.uses !== 'string') {
        return;
      }
      const where = `${at} step ${String(index + 1)}`;
      // An action's name is case-insensitive on GitHub.
      const action = step.uses.toLowerCase();
      const inputs = isRecord(step.with) ? step.with : {};
      if (action.startsWith('docker://')) {
        uses.push({ image: step.uses.slice('docker://'.length), where });
      } else if (action.startsWith('docker/setup-buildx-action@')) {
        const options = typeof inputs['driver-opts'] === 'string' ? inputs['driver-opts'].split(/\r?\n/).map((option) => option.trim()) : [];
        const builders = options.filter((option) => option.startsWith('image=')).map((option) => option.slice('image='.length));
        for (const image of builders) {
          uses.push({ image, where });
        }
        // Only the docker driver runs no builder container; the others run moby/buildkit:buildx-stable-1, a mutable tag, unless named.
        if (builders.length === 0 && inputs.driver !== 'docker') {
          unread.push(`${where}: setup-buildx names no builder image (driver-opts image=…), so it runs moby/buildkit:buildx-stable-1 by tag; name it as image=moby/buildkit:vX.Y.Z@sha256:<64 hex>`);
        }
      } else if (action.startsWith('docker/build-push-action@')) {
        const contexts = inputs['build-contexts'];
        if (typeof contexts === 'string' && /docker-image:\/\//i.test(contexts)) {
          unread.push(`${where}: build-contexts names an image (docker-image://), which the image rule does not read; build FROM a pinned image in the Dockerfile instead (${RUNBOOK})`);
        }
      } else if (action.startsWith('docker/bake-action@')) {
        // A bake file names its own targets' images, contexts and Dockerfiles, none of which this rule reads.
        unread.push(`${where}: docker/bake-action builds from bake files, whose images and docker-image:// contexts the image rule does not read; build with docker/build-push-action from a Dockerfile FROM a pinned image (${RUNBOOK})`);
      }
    });
  }
}

function composeImages(text: string | undefined, uses: ImageUse[], unread: string[]): void {
  if (text === undefined) {
    return;
  }
  let parsed: unknown;
  try {
    // Merge keys honoured, as Compose resolves `<<: *anchor` (SEC-N1), so a service built from one is read.
    parsed = parse(text, { merge: true });
  } catch (error) {
    unread.push(`${COMPOSE_FILE}: not YAML (${error instanceof Error ? error.message : String(error)}), so the images it names cannot be read`);
    return;
  }
  if (isRecord(parsed) && parsed.include !== undefined) {
    unread.push(`${COMPOSE_FILE}: include: brings in another compose file, whose images the image rule does not read; name every service in ${COMPOSE_FILE}`);
  }
  const services = isRecord(parsed) && isRecord(parsed.services) ? parsed.services : {};
  for (const [name, service] of Object.entries(services)) {
    if (!isRecord(service)) {
      continue;
    }
    const where = `${COMPOSE_FILE} services.${name}`;
    if (service.build !== undefined) {
      unread.push(`${where}: build: builds an image the image rule does not read; run an image by digest (image: ${FORM})`);
    }
    if (service.extends !== undefined) {
      // From another file, or another service of this one: either way the image it takes is not this service's own.
      unread.push(`${where}: extends: takes the service from another one, in this file or another, which the image rule does not follow; name the service's image in ${COMPOSE_FILE}`);
    }
    if (typeof service.image === 'string') {
      uses.push({ image: service.image, where });
    }
  }
}

/**
 * Every image the tree names, with where, in the order the files are read (Dockerfiles, the compose file, workflows),
 * and every image reference it holds that the rule does not read (S6, E17).
 */
export function imagesOf(tree: Tree): { readonly uses: readonly ImageUse[]; readonly unread: readonly string[] } {
  const uses: ImageUse[] = [];
  const unread: string[] = [];
  for (const [file, text] of Object.entries(tree.dockerfiles ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    dockerfileImages(file, text, uses, unread);
  }
  composeImages(tree.compose, uses, unread);
  for (const [file, text] of Object.entries(tree.workflows ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    workflowImages(file, text, uses, unread);
  }
  for (const file of tree.imageFiles ?? []) {
    unread.push(
      `${file}: an image file outside apps/<name>/Dockerfile and ${COMPOSE_FILE}, the files the image rule reads (release.yml and release-dry-run.yml compute file:, so any Dockerfile can be built, and Compose prefers compose.yaml to ${COMPOSE_FILE}); remove it, or name its images in those files`,
    );
  }
  return { uses, unread };
}

/** The tree's images and the problems of its form: references the rule does not read, and references not `name:tag@sha256:<64 hex>`. */
function formOf(tree: Tree): { readonly uses: readonly ImageUse[]; readonly problems: readonly string[] } {
  const { uses, unread } = imagesOf(tree);
  const malformed = uses.flatMap((use) => {
    const name = parseImage(use.image);
    return 'problem' in name ? [`${use.where}: ${use.image} ${name.problem}`] : [];
  });
  return { uses, problems: [...unread, ...malformed] };
}

/** The exceptions list's problems that need no read: one entry per image, and each kind on the registry it applies to (B1, E15). */
function listProblems(entries: readonly ImageAgeException[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.image)) {
      problems.push(`${IMAGE_AGE_EXCEPTIONS_FILE} lists ${entry.image} more than once; one entry per image`);
    }
    seen.add(entry.image);
    const name = parseImage(entry.image);
    if ('problem' in name) {
      problems.push(`${IMAGE_AGE_EXCEPTIONS_FILE}: ${entry.image} ${name.problem}`);
    } else if (entry.kind === 'age-unprovable' && name.registry === null) {
      problems.push(
        `${entry.image}: an age-unprovable entry applies only to a registry other than Docker Hub, where no push time can be read; a Docker Hub digest is held to the time Hub recorded, and one Hub shows on no tag passes under no entry: pin a tag's current digest (${RUNBOOK})`,
      );
    } else if (entry.kind === 'security-fix' && name.registry !== null) {
      problems.push(`${entry.image}: a security-fix entry waives only the release age, which check-toolchain cannot read on ${name.registry}; an image there takes an age-unprovable entry (${RUNBOOK})`);
    }
  }
  return problems;
}

const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/**
 * The offline form rule (E5): every image the tree names is `name:tag@sha256:<64 hex>`, every reference the rule does
 * not read is refused (S6), and the exceptions list holds one entry per image, each of a kind its registry allows.
 */
export function imageFormRule(tree: Tree, entries: readonly ImageAgeException[]): Finding[] {
  const { uses, problems } = formOf(tree);
  const all = [...problems, ...listProblems(entries)];
  return all.length > 0
    ? all.map((message) => ({ level: 'error', rule: RULE, message }))
    : [{ level: 'ok', rule: RULE, message: `${plural(uses.length, 'image reference')}, each ${FORM}, and none the image rule does not read` }];
}

/** How one image's age was read. */
type Verdict =
  | { readonly kind: 'pushed'; readonly at: string; readonly source: string }
  | { readonly kind: 'nowhere'; readonly current: HubTag | null; readonly searched: number }
  | { readonly kind: 'untimed'; readonly on: string }
  | { readonly kind: 'unprovable'; readonly registry: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'unread' };

/** Whether a Hub tag carries a digest: as its own (an index's), or as one of its platforms' manifests (N9). */
const carries = (tag: HubTag, digest: string) => tag.digest === digest || tag.images.some((image) => image.digest === digest);

/** The youngest time a Hub tag records for what it carries: its tag_last_pushed, its last_updated and each image's last_pushed. */
function youngest(tag: HubTag): { readonly at: string; readonly field: string } | null {
  const times = [
    { at: tag.tag_last_pushed, field: 'tag_last_pushed' },
    { at: tag.last_updated, field: 'last_updated' },
    ...tag.images.map((image) => ({ at: image.last_pushed, field: 'images[].last_pushed' })),
  ];
  let best: { at: string; field: string } | null = null;
  for (const { at, field } of times) {
    if (at !== null && (best === null || Date.parse(at) > Date.parse(best.at))) {
      best = { at, field };
    }
  }
  return best;
}

/**
 * A Docker Hub digest's push time: the youngest its tag records when the tag carries it; else the youngest of the most
 * recently updated tags that carry it, searched HUB_SEARCH_PAGES pages deep (the first page holding one holds the most
 * recently updated); else nowhere, with the tag's current state.
 */
async function hubAge(name: ImageName, registry: Pick<Registry, 'hubTag' | 'hubTags'>, signal: AbortSignal): Promise<Verdict> {
  const tag = await registry.hubTag(name.repository, name.tag, signal);
  if (tag !== null && carries(tag, name.digest)) {
    const time = youngest(tag);
    return time === null ? { kind: 'untimed', on: tag.name } : { kind: 'pushed', at: time.at, source: `Docker Hub's ${time.field} of the tag ${tag.name}` };
  }
  let searched = 0;
  for (let page = 1; page <= HUB_SEARCH_PAGES; page += 1) {
    const { tags, next } = await registry.hubTags(name.repository, page, signal);
    searched += tags.length;
    const carriers = tags.filter((other) => carries(other, name.digest));
    if (carriers.length > 0) {
      let best: { at: string; field: string; on: string } | null = null;
      for (const other of carriers) {
        const time = youngest(other);
        if (time !== null && (best === null || Date.parse(time.at) > Date.parse(best.at))) {
          best = { ...time, on: other.name };
        }
      }
      if (best === null) {
        return { kind: 'untimed', on: carriers[0]?.name ?? name.tag };
      }
      const moved = tag === null ? `Docker Hub has no tag ${name.tag}` : `the tag ${name.tag} names ${tag.digest ?? 'no digest'} now`;
      return { kind: 'pushed', at: best.at, source: `Docker Hub's ${best.field} of the tag ${best.on}, which carries it; ${moved}` };
    }
    if (!next) {
      break;
    }
  }
  return { kind: 'nowhere', current: tag, searched };
}

/** At most `limit` at once, in order. */
async function eachAtMost<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** What the networked rule reads: both trees, the event, now, and the deadline of its Docker Hub reads in ms (READ_DEADLINE_MS from the first read when absent). */
export interface ImageInput {
  readonly head: Tree;
  readonly base: Tree;
  readonly event: CheckEvent;
  readonly now: Date;
  readonly deadlineMs?: number;
}

/** A deadline as a message says it: in whole seconds ("180 s"), else in milliseconds ("20 ms"). */
const deadlineWords = (ms: number) => (ms % 1000 === 0 ? `${String(ms / 1000)} s` : `${String(ms)} ms`);

/**
 * The networked image rule: the form rule's problems, then each image new against the base read and judged, then the
 * exceptions list's entries (their windows, through exclude-window.ts, their expiry and their use). Never throws for a
 * network failure: each fails closed as an error finding, a warning on a push.
 */
export async function imageRule(
  input: ImageInput,
  lists: { readonly head: readonly ImageAgeException[]; readonly base: readonly ImageAgeException[] },
  minutes: number,
  registry: Pick<Registry, 'hubTag' | 'hubTags'>,
): Promise<Finding[]> {
  const age: Level = input.event === 'push' ? 'warning' : 'error';
  const now = input.now.getTime();
  const head = formOf(input.head);
  const findings: Finding[] = [...head.problems, ...listProblems(lists.head)].map((message) => ({ level: 'error', rule: RULE, message }));
  const before = new Set(imagesOf(input.base).uses.flatMap((use) => /@(sha256:[0-9a-f]{64})$/.exec(use.image)?.[1] ?? []));
  // Each well-formed image once, with every place it is named, in the order it is first named.
  const named = new Map<string, { readonly name: ImageName; readonly wheres: string[] }>();
  for (const use of head.uses) {
    const name = parseImage(use.image);
    if (!('problem' in name)) {
      const entry = named.get(use.image) ?? { name, wheres: [] };
      entry.wheres.push(use.where);
      named.set(use.image, entry);
    }
  }
  const fresh = [...named.entries()].filter(([, { name }]) => !before.has(name.digest));
  const live = lists.head.filter((entry) => Date.parse(entry.expires) > now);
  const known = new Map<string, KnownTime>();
  if (fresh.length === 0) {
    const digests = new Set([...named.values()].map(({ name }) => name.digest)).size;
    findings.push({ level: 'ok', rule: RULE, message: `no image is new against the base, so nothing is read (${plural(digests, 'digest')} named, each one in the base)` });
  } else {
    const deadlineMs = input.deadlineMs ?? READ_DEADLINE_MS;
    const deadline = AbortSignal.timeout(deadlineMs);
    const verdicts = await eachAtMost(fresh, IMAGE_READS_AT_ONCE, async ([, { name }]): Promise<Verdict> => {
      if (name.registry !== null) {
        return { kind: 'unprovable', registry: name.registry };
      }
      if (deadline.aborted) {
        return { kind: 'unread' };
      }
      try {
        return await hubAge(name, registry, deadline);
      } catch (error) {
        if (deadline.aborted) {
          return { kind: 'unread' };
        }
        if (error instanceof NetworkReadError) {
          return { kind: 'failed', message: error.message };
        }
        throw error;
      }
    });
    const unread: string[] = [];
    fresh.forEach(([image, { name, wheres }], index) => {
      const verdict = verdicts[index] ?? { kind: 'unread' };
      const subject = `${image} (${wheres.join(', ')})`;
      const add = (level: Level, message: string) => findings.push({ level, rule: RULE, message });
      switch (verdict.kind) {
        case 'pushed': {
          known.set(image, { what: 'the digest', at: verdict.at, as: 'pushed' });
          const matureAt = Date.parse(verdict.at) + minutes * MINUTE_MS;
          const fix = live.find((entry) => entry.image === image && entry.kind === 'security-fix');
          if (matureAt <= now) {
            add('ok', `${subject} was pushed ${verdict.at} (${verdict.source}), at least ${ageWords(minutes)} ago`);
          } else if (fix?.kind === 'security-fix') {
            add('ok', `${subject} was pushed ${verdict.at} (${verdict.source}), under ${ageWords(minutes)} ago, and passes under its live security-fix entry (${fix.advisory}, fixed in ${fix.fixes.package} ${fix.fixes.version}) until ${fix.expires}`);
          } else {
            add(age, `${subject} was pushed ${verdict.at} (${verdict.source}), under ${ageWords(minutes)} ago; it is old enough from ${new Date(matureAt).toISOString()}: ${REMEDY}`);
          }
          break;
        }
        case 'nowhere': {
          const time = verdict.current === null ? null : youngest(verdict.current);
          const current =
            verdict.current === null
              ? `Docker Hub has no tag ${name.tag} of ${name.repository}`
              : `Docker Hub's tag ${name.tag} names ${verdict.current.digest ?? 'no digest'} now${time === null ? '' : `, pushed ${time.at} and so old enough from ${new Date(Date.parse(time.at) + minutes * MINUTE_MS).toISOString()}`}`;
          add(
            age,
            `${subject}: ${current}, and none of the ${plural(verdict.searched, 'most recently updated tag')} of ${name.repository} carries ${name.digest}, so when it was pushed cannot be read, and no exclude clears that: pin a tag's current digest (${RUNBOOK})`,
          );
          break;
        }
        case 'untimed':
          add(age, `${subject}: Docker Hub's tag ${verdict.on} carries it but records no push time, so its age cannot be read, and no exclude clears that: pin a digest whose tag records one (${RUNBOOK})`);
          break;
        case 'unprovable': {
          const waiver = live.find((entry) => entry.image === image && entry.kind === 'age-unprovable');
          if (waiver === undefined) {
            add(
              age,
              `${subject}: ${verdict.registry} is not Docker Hub, the one registry whose push times check-toolchain reads, so its age is unprovable; take the image from Docker Hub, or add an age-unprovable entry for it to ${IMAGE_AGE_EXCEPTIONS_FILE} with its reason, the date added and an expiry (${RUNBOOK})`,
            );
          } else {
            add('ok', `${subject} is on ${verdict.registry}, whose push times check-toolchain cannot read, and passes under its live age-unprovable entry until ${waiver.expires}`);
          }
          break;
        }
        case 'failed':
          add(age, `${subject}: ${verdict.message}`);
          break;
        case 'unread':
          unread.push(image);
          break;
      }
    });
    if (unread.length > 0) {
      findings.push({ level: age, rule: RULE, message: `${HUB_HOST}: the image reads stopped at their deadline (${deadlineWords(deadlineMs)}) with ${plural(unread.length, 'image')} unread, ${unread.join(', ')}; re-run` });
    }
  }
  findings.push(...exceptionFindings(input, lists, head.uses, known, minutes));
  return findings;
}

/**
 * The exceptions list's entries: an entry this change adds or rewrites inside its kind's window (exclude-window.ts; a
 * security-fix entry's known time is its digest's push time when this run read it), an error on a pull request and a
 * warning on a push, as every image age finding is (CI-N3: a tag moved between the pull request and its merge gives
 * the push another push time); the expired rule; and an entry for an image the tree no longer names, a warning.
 */
function exceptionFindings(
  input: ImageInput,
  lists: { readonly head: readonly ImageAgeException[]; readonly base: readonly ImageAgeException[] },
  uses: readonly ImageUse[],
  known: ReadonlyMap<string, KnownTime>,
  minutes: number,
): Finding[] {
  const findings: Finding[] = [];
  const age: Level = input.event === 'push' ? 'warning' : 'error';
  const baseEntries = new Set(lists.base.map((entry) => JSON.stringify(entry)));
  const edited = JSON.stringify(lists.head.map((entry) => JSON.stringify(entry)).sort()) !== JSON.stringify([...baseEntries].sort());
  const images = new Set(uses.map((use) => use.image));
  for (const entry of lists.head) {
    if (!baseEntries.has(JSON.stringify(entry))) {
      const window: ExcludeWindow = entry.kind === 'security-fix' ? { kind: 'security-fix', known: known.get(entry.image) ?? null, minutes } : { kind: 'reasoned' };
      findings.push(...excludeWindowProblems(entry.image, entry, window, input.now).map((message): Finding => ({ level: age, rule: RULE, message })));
    }
    const expired = expiredExclude(entry.image, entry.expires, input.now, { event: input.event, edited, list: IMAGE_AGE_EXCEPTIONS_FILE });
    if (expired !== null) {
      findings.push({ ...expired, rule: RULE });
    } else if (!images.has(entry.image)) {
      findings.push({ level: 'warning', rule: RULE, message: `${entry.image}: no Dockerfile, compose file or workflow names it any longer; remove it from ${IMAGE_AGE_EXCEPTIONS_FILE} (the weekly triage, docs/runbooks/dependency-upgrades.md)` });
    }
  }
  return findings;
}
