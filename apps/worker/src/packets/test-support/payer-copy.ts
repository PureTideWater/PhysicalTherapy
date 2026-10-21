import { type IdentifierKind, type PacketContent, type RowIdentifiers, fillPlaceholders } from '@tp/packets';
import { PAYER_COPY_INTERNAL_TERMS } from '@tp/packets/testing';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// pdf.js runs its worker in this thread from the module that registers itself (as report/test-support/printed-text.ts).
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';

import type { PdfRenderer } from '../../report/pdf';
import { PACKET_CSV_COLUMNS } from '../csv';
import { narrativeParagraphs } from '../html';

/**
 * For the tests (audit item #37 part 1, T1, T5, T6, DB1 and E3; docs/adr/0061): what in a payer's copy, PDF or CSV,
 * is not the payer's. The identifiers the copy prints (claim control numbers, patient names, member IDs) are taken out
 * first, so a long claim number is not mistaken for a hash; then it finds
 *
 * - any email other than the correspondence contact's (the one email the payer's copy prints);
 * - a UUID, and a run of 16 or more hex digits holding a letter a to f (a hash or part of one);
 * - `priced_line:` (a trace reference);
 * - every string the content holds under an internal key (an ID, a SHA-256 or hash, a trace reference, who verified
 *   and when, a verification level, a cause, an evidence gap's code);
 * - every secret given (a login's email, a row's UUID, a stored SHA-256), matched without regard to case; the patient
 *   control numbers are always among them, since the payer's copy does not print them (Q2 (a));
 * - outside the narrative and the quoted clauses, the internal terms (PAYER_COPY_INTERNAL_TERMS), and anything shaped
 *   like a code (CODE_SHAPES: words joined by underscores, in lower or in upper case, such as a pattern's behavior, an
 *   observed basis, a deadline cause, a deadline basis or a release's exclusion), the CSV's own header row set aside.
 *
 * A printed PDF wraps text where its lines end, inside an identifier or a hash too, so every value is matched with any
 * whitespace allowed between its characters. Each leak is named by its kind and what was found.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_RUN = /[0-9a-f]{16,}/gi;
const PRINTED_IDENTIFIERS: readonly IdentifierKind[] = ['claim_control_number', 'patient_name', 'member_id'];
const INTERNAL_KEYS: ReadonlySet<string> = new Set(['hash', 'trace_ref', 'verified_by', 'verified_at', 'level', 'cause', 'causes', 'reasons']);
/** A code, never printed as one (words.ts): lower-case words joined by underscores, or upper-case ones. */
export const CODE_SHAPES: readonly RegExp[] = [/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/, /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/];
/** The CSV's header row: its column names are the schedule's own, the one place a code's shape is the payer's. */
const CSV_HEADER = PACKET_CSV_COLUMNS.join(',');

/** Every string the content holds under an internal key, and every evidence gap's code. */
export function internalValues(content: PacketContent): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, internal: boolean): void => {
    if (typeof value === 'string') {
      if (internal && value !== '') {
        found.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, internal);
      }
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        visit(item, internal || INTERNAL_KEYS.has(key) || key.endsWith('_id') || key.includes('sha256'));
      }
    }
  };
  visit(content, false);
  for (const gap of content.evidence_gaps) {
    found.add(gap.code);
  }
  return [...found];
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A value as a pattern that allows whitespace (a printed line's end) between any two of its characters. */
const loose = (value: string, flags = 'g') => new RegExp([...value.replace(/\s+/g, '')].map(escapeRegExp).join('\\s*'), flags);
const without = (text: string, value: string) => (value.trim() === '' ? text : text.replace(loose(value), ' '));

export interface PayerCopyScan {
  readonly content: PacketContent;
  /** The narrative as approved (placeholders); its inserted text is what the term scan sets aside. */
  readonly narrative: string;
  /** The contact's email, the one the copy may print. */
  readonly allowedEmail: string | null;
  readonly identifiers: ReadonlyMap<number, RowIdentifiers>;
  readonly secrets?: readonly string[];
}

/** The leaks in a payer's copy as text (an HTML document's text and attribute values, a PDF's text, a CSV): none is the copy's own. */
export function payerCopyLeaks(text: string, scan: PayerCopyScan): string[] {
  const leaks: string[] = [];
  let rest = collapse(text);
  // The narrative and the quoted clauses (a person's or a contract's own words), set aside for the term scan only.
  let words = rest;
  const quoted = [
    ...narrativeParagraphs(fillPlaceholders(scan.narrative, scan.identifiers)),
    scan.content.citation.kind === 'contract' ? scan.content.citation.quote : scan.content.citation.statement,
    ...(scan.content.format === 'tp-packet/2' ? scan.content.deadline.sources.flatMap((source) => (source.kind === 'contract_window' ? [source.quote] : [])) : []),
  ].sort((a, b) => b.length - a.length);
  for (const passage of quoted) {
    words = without(words, passage);
  }
  // The identifiers the copy prints, longest first, so none is cut by a shorter one inside it.
  const printed = [...scan.identifiers.values()]
    .flatMap((row) => PRINTED_IDENTIFIERS.map((kind) => row[kind]))
    .filter((value): value is string => value !== null && value.trim() !== '')
    .sort((a, b) => b.length - a.length);
  for (const value of printed) {
    rest = without(rest, value);
    words = without(words, value);
  }
  const withheld = [...scan.identifiers.values()].map((row) => row.patient_control_number).filter((value): value is string => value !== null && value.trim() !== '');
  for (const email of rest.match(EMAIL) ?? []) {
    if (email.toLowerCase() !== scan.allowedEmail?.toLowerCase()) {
      leaks.push(`email:${email}`);
    }
  }
  for (const uuid of rest.match(UUID) ?? []) {
    leaks.push(`uuid:${uuid}`);
  }
  for (const run of rest.match(HEX_RUN) ?? []) {
    if (/[a-f]/i.test(run)) {
      leaks.push(`hex:${run}`);
    }
  }
  if (loose('priced_line:', '').test(rest)) {
    leaks.push('trace_ref:priced_line:');
  }
  for (const value of internalValues(scan.content)) {
    if (loose(value, '').test(rest)) {
      leaks.push(`internal_value:${value}`);
    }
  }
  for (const secret of [...(scan.secrets ?? []), ...withheld]) {
    if (secret.trim() !== '' && loose(secret, 'i').test(rest)) {
      leaks.push(`secret:${secret}`);
    }
  }
  for (const term of PAYER_COPY_INTERNAL_TERMS) {
    const match = term.exec(words);
    if (match !== null) {
      leaks.push(`term:${match[0]}`);
    }
  }
  const unheaded = words.replaceAll(CSV_HEADER, ' ');
  for (const shape of CODE_SHAPES) {
    for (const match of unheaded.matchAll(new RegExp(shape.source, 'g'))) {
      leaks.push(`code:${match[0]}`);
    }
  }
  return leaks;
}

/** Whether `text` holds `passage` with any whitespace (or none) where the passage has it, or where a printed line ends. */
export function holdsLoosely(text: string, passage: string): boolean {
  return loose(passage, '').test(text);
}

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unescape = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);

/** An HTML document's text and attribute values, without its <style> (what a reader or a tool can find in it). */
export function htmlText(html: string): string {
  const unstyled = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const attributes = [...unstyled.matchAll(/<[^>]*>/g)].flatMap((tag) => [...tag[0].matchAll(/\s[\w:-]+="([^"]*)"/g)].map((attribute) => unescape(attribute[1] ?? '')));
  // Inline spans (the mono figures) join their text; every other tag separates.
  const text = unescape(unstyled.replace(/<\/?span\b[^>]*>/gi, '').replace(/<[^>]*>/g, '\n'));
  return `${text}\n${attributes.join('\n')}`;
}

/** The text of the narrative block's paragraphs, tags stripped and unescaped, one per <p>. */
export function narrativeBlock(html: string): string[] {
  const block = /<div class="narrative">([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (block === undefined) {
    throw new Error('the payer’s copy has a narrative block');
  }
  return [...block.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((paragraph) => unescape((paragraph[1] ?? '').replace(/<[^>]*>/g, '')));
}

/** The HTML outside the narrative block. */
export function outsideNarrative(html: string): string {
  return html.replace(/<div class="narrative">[\s\S]*?<\/div>/, '');
}

const METADATA_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'] as const;

/** A printed PDF's text (each line ended) and its metadata (Title, Author, Subject, Keywords, Creator, Producer). */
export async function printedPdfText(pdf: Uint8Array): Promise<{ readonly text: string; readonly metadata: Readonly<Partial<Record<(typeof METADATA_KEYS)[number], string>>> }> {
  const task = getDocument({ data: new Uint8Array(pdf), disableFontFace: true, useSystemFonts: false, stopAtErrors: true, verbosity: 0 });
  try {
    const document = await task.promise;
    let text = '';
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item) {
          text += item.str + (item.hasEOL ? '\n' : '');
        }
      }
      text += '\n';
      page.cleanup();
    }
    const { info } = (await document.getMetadata()) as { readonly info: Readonly<Record<string, unknown>> };
    const metadata: Partial<Record<(typeof METADATA_KEYS)[number], string>> = {};
    for (const key of METADATA_KEYS) {
      const value = info[key];
      if (typeof value === 'string') {
        metadata[key] = value;
      }
    }
    return { text, metadata };
  } finally {
    await task.destroy();
  }
}

/** A renderer that keeps every HTML document handed to it, then prints with the renderer it wraps. */
export function recordingRenderer(inner: PdfRenderer): PdfRenderer & { readonly printed: string[] } {
  const printed: string[] = [];
  return {
    printed,
    render: async (html: string) => {
      printed.push(html);
      return inner.render(html);
    },
  };
}
