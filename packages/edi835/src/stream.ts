/**
 * The two ways in: `parse835` for a document in memory (at most 50 MB) and `parse835Stream` for any
 * size, chunk by chunk (PRD section 10: streaming above 50 MB, memory bounded per transaction set).
 * Both run the same parser.
 */
import { Edi835UsageError } from './errors';
import { Edi835Parser, type ParseOptions } from './parser';
import { type Edi835Event, type ParseReport, type Remittance } from './types';

/** Documents larger than this are parsed as a stream. */
export const STREAMING_THRESHOLD_BYTES = 50 * 1024 * 1024;

export interface ParseResult {
  readonly events: readonly Edi835Event[];
  readonly report: ParseReport;
}

/** The stream's items: every event, then the report. */
export type Edi835StreamItem = Edi835Event | { readonly type: 'report'; readonly report: ParseReport };

/** Parses a document held in memory. Larger than STREAMING_THRESHOLD_BYTES, use parse835Stream. */
export function parse835(bytes: Uint8Array, options: ParseOptions): ParseResult {
  if (bytes.byteLength > STREAMING_THRESHOLD_BYTES) {
    throw new Edi835UsageError(`a document above ${String(STREAMING_THRESHOLD_BYTES)} bytes is parsed with parse835Stream`);
  }
  const parser = new Edi835Parser(options);
  const events = parser.write(bytes);
  const end = parser.end();
  return { events: [...events, ...end.events], report: end.report };
}

/** Parses a document chunk by chunk (a file or object stream), yielding each event as it completes and the report last. */
export async function* parse835Stream(source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, options: ParseOptions): AsyncGenerator<Edi835StreamItem, void, undefined> {
  const parser = new Edi835Parser(options);
  for await (const chunk of source) {
    yield* parser.write(chunk);
  }
  const end = parser.end();
  yield* end.events;
  yield { type: 'report', report: end.report };
}

/** The transaction sets of a parse, in document order. */
export function remittancesOf(result: ParseResult): Remittance[] {
  return result.events.flatMap((event) => (event.type === 'transaction' ? [event.transaction] : []));
}
