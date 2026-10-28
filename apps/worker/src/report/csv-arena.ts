import type { ReportLine } from './content';
import { CSV_COLUMNS, csvCell, csvRow, csvText } from './csv';

/**
 * The audit report's line CSV, held outside the heap while the report reads its lines in batches (SUITE-CAP-1a D17;
 * docs/adr/0083). Each line's row (`csvRow(line).map(csvCell).join(',')` and CRLF, the bytes auditCsv writes for it) is
 * appended to chunks of CSV_ARENA_CHUNK_BYTES as the line is read, a row running on into the next chunk where it does
 * not fit, so the chunks hold the rows' own bytes and at most one chunk's tail besides. Beside each row the arena keeps
 * only the report's sort key: its payer and plan as indexes into an interned list, its line number, and its claim
 * number and line ID as strings. After the last batch, rows() streams the header and the rows in the report's order
 * (payer, plan, the payer's claim control number, line number and line), byte for byte auditCsv() of the sorted
 * lines; release() gives the chunks back. The CSV's bytes are line-level PHI (it names the claim control number): they
 * live only in this process, are written only sealed (documents.write), and are never logged.
 */

export const CSV_ARENA_CHUNK_BYTES = 1024 * 1024;

/** Text in the report's order: by UTF-16 code unit, as `<` compares strings (not by the UTF-8 bytes). */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** What the report sorts a line by. */
export interface LineOrderKey {
  readonly payer: string;
  readonly plan: string;
  readonly payer_claim_control_number: string;
  readonly line_no: number;
  readonly service_line_id: string;
}

/** The report's line order (content.ts): payer, plan, the payer's claim control number, line number, then the line. */
export function compareLineOrder(a: LineOrderKey, b: LineOrderKey): number {
  return (
    compareText(a.payer, b.payer) ||
    compareText(a.plan, b.plan) ||
    compareText(a.payer_claim_control_number, b.payer_claim_control_number) ||
    a.line_no - b.line_no ||
    compareText(a.service_line_id, b.service_line_id)
  );
}

const CRLF = '\r\n';

/** A typed array twice as long, holding the first `used` values. */
function grown<T extends Uint32Array | Int32Array>(values: T, used: number, make: (length: number) => T): T {
  const next = make(Math.max(1024, values.length * 2));
  next.set(values.subarray(0, used));
  return next;
}

export class CsvArena {
  private readonly chunkBytes: number;
  private chunks: Buffer[] = [];
  /** Bytes written into the last chunk. */
  private used = 0;
  private count = 0;
  /** Each row's first byte, counted from the arena's first chunk, and its length in bytes. */
  private starts = new Uint32Array(0);
  private lengths = new Uint32Array(0);
  /** Each row's payer and plan, as indexes into `names`, and its line number. */
  private payers = new Uint32Array(0);
  private plans = new Uint32Array(0);
  private lineNos = new Int32Array(0);
  private claims: string[] = [];
  private lineIds: string[] = [];
  private names: string[] = [];
  private nameIndex = new Map<string, number>();
  private released = false;

  constructor(options: { readonly chunkBytes?: number } = {}) {
    this.chunkBytes = options.chunkBytes ?? CSV_ARENA_CHUNK_BYTES;
    if (!Number.isInteger(this.chunkBytes) || this.chunkBytes < 1) {
      throw new Error('a CSV arena’s chunk is a positive whole number of bytes');
    }
  }

  /** The rows appended. */
  get lines(): number {
    return this.count;
  }

  /** The bytes of the chunks held (0 once released). */
  get heldBytes(): number {
    return this.chunks.length * this.chunkBytes;
  }

  /** Appends a line's row and keeps its sort key; the line itself is not kept. */
  append(line: ReportLine): void {
    this.live();
    const row = csvRow(line).map(csvCell).join(',') + CRLF;
    const length = Buffer.byteLength(row, 'utf8');
    const start = this.offset();
    if (start + length > 0xffff_ffff) {
      throw new Error('the audit report’s line CSV is larger than its arena can index');
    }
    this.write(row, length);
    const index = this.count;
    if (index === this.starts.length) {
      this.starts = grown(this.starts, index, (size) => new Uint32Array(size));
      this.lengths = grown(this.lengths, index, (size) => new Uint32Array(size));
      this.payers = grown(this.payers, index, (size) => new Uint32Array(size));
      this.plans = grown(this.plans, index, (size) => new Uint32Array(size));
      this.lineNos = grown(this.lineNos, index, (size) => new Int32Array(size));
    }
    this.starts[index] = start;
    this.lengths[index] = length;
    this.payers[index] = this.intern(line.payer);
    this.plans[index] = this.intern(line.plan);
    this.lineNos[index] = line.line_no;
    this.claims.push(line.payer_claim_control_number);
    this.lineIds.push(line.service_line_id);
    this.count = index + 1;
  }

  /**
   * The header and every row in the report's order, in pieces of at most one chunk. Payer and plan names are ranked by
   * compareText once every row is in, so the order is the comparator's over the stored keys (a tie on the whole key,
   * which one line per row cannot give, keeps the order the rows came in).
   */
  rows(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: () => {
        // The pieces are made as they are asked for; a released arena rejects the next one.
        const pieces = this.pieces();
        return {
          next: () => Promise.resolve().then(() => pieces.next()),
          return: () => Promise.resolve(pieces.return(undefined)),
        };
      },
    };
  }

  private *pieces(): Generator<Uint8Array, undefined> {
    this.live();
    yield Buffer.from(CSV_COLUMNS.map(csvText).join(',') + CRLF, 'utf8');
    const rank = new Uint32Array(this.names.length);
    [...this.names.keys()].sort((a, b) => compareText(this.names[a] as string, this.names[b] as string)).forEach((index, position) => (rank[index] = position));
    const order = new Uint32Array(this.count);
    for (let index = 0; index < this.count; index += 1) {
      order[index] = index;
    }
    const { payers, plans, lineNos, claims, lineIds } = this;
    order.sort(
      (a, b) =>
        (rank[payers[a] as number] as number) - (rank[payers[b] as number] as number) ||
        (rank[plans[a] as number] as number) - (rank[plans[b] as number] as number) ||
        compareText(claims[a] as string, claims[b] as string) ||
        (lineNos[a] as number) - (lineNos[b] as number) ||
        compareText(lineIds[a] as string, lineIds[b] as string) ||
        a - b,
    );
    let piece = Buffer.allocUnsafe(this.chunkBytes);
    let filled = 0;
    for (const index of order) {
      let at = this.starts[index] as number;
      let left = this.lengths[index] as number;
      while (left > 0) {
        if (filled === piece.length) {
          yield piece;
          this.live();
          piece = Buffer.allocUnsafe(this.chunkBytes);
          filled = 0;
        }
        const chunk = this.chunks[Math.floor(at / this.chunkBytes)] as Buffer;
        const from = at % this.chunkBytes;
        const taken = Math.min(left, this.chunkBytes - from, piece.length - filled);
        chunk.copy(piece, filled, from, from + taken);
        filled += taken;
        at += taken;
        left -= taken;
      }
    }
    if (filled > 0) {
      yield piece.subarray(0, filled);
    }
    return undefined;
  }

  /**
   * Gives the chunks and keys back; the arena takes and streams nothing after. Idempotent: a second call (a caller's
   * finally after gatherReport's own release on a failure path) does nothing.
   */
  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.chunks = [];
    this.used = 0;
    this.count = 0;
    this.starts = new Uint32Array(0);
    this.lengths = new Uint32Array(0);
    this.payers = new Uint32Array(0);
    this.plans = new Uint32Array(0);
    this.lineNos = new Int32Array(0);
    this.claims = [];
    this.lineIds = [];
    this.names = [];
    this.nameIndex = new Map();
  }

  private live(): void {
    if (this.released) {
      throw new Error('the audit report’s line CSV arena was released');
    }
  }

  /** The byte the next row starts at. */
  private offset(): number {
    return this.chunks.length === 0 ? 0 : (this.chunks.length - 1) * this.chunkBytes + this.used;
  }

  /** Writes a row's bytes at the end, running on into new chunks where the last is full. */
  private write(row: string, length: number): void {
    const last = this.chunks.at(-1);
    if (last !== undefined && length <= this.chunkBytes - this.used) {
      last.write(row, this.used, 'utf8');
      this.used += length;
      return;
    }
    const bytes = Buffer.from(row, 'utf8');
    let from = 0;
    while (from < length) {
      if (this.chunks.length === 0 || this.used === this.chunkBytes) {
        this.chunks.push(Buffer.alloc(this.chunkBytes));
        this.used = 0;
      }
      const taken = Math.min(length - from, this.chunkBytes - this.used);
      bytes.copy(this.chunks.at(-1) as Buffer, this.used, from, from + taken);
      this.used += taken;
      from += taken;
    }
  }

  private intern(name: string): number {
    let index = this.nameIndex.get(name);
    if (index === undefined) {
      index = this.names.length;
      this.names.push(name);
      this.nameIndex.set(name, index);
    }
    return index;
  }
}
