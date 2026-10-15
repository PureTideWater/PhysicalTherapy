/**
 * The 835 parser (PRD section 10): bytes in, typed events and a parse report out. Pure: no database,
 * no network, no clock. The envelopes are checked here (ISA/IEA, GS/GE, ST/SE, with every control
 * number and count compared and any mismatch reported, never fixed); each transaction set is built by
 * `TransactionBuilder` and emitted when its SE is read, so memory is bounded by one transaction set.
 */
import { createHash } from 'node:crypto';

import { sumCents } from '@tp/money';

import { type CodeListProvider } from './code-lists';
import { remittanceKeyText } from './dedup';
import { type EdiError, Edi835UsageError, type Position, controlMismatch, duplicate, notAn835, syntaxError } from './errors';
import { SPECS, type SegmentSpec } from './spec';
import { Tokenizer, type Segment } from './tokenizer';
import { TransactionBuilder } from './transaction';
import {
  type Edi835Event,
  type GroupHeader,
  type InterchangeHeader,
  type ParseReport,
  type Receipt,
  type Remittance,
  type TransactionOutcome,
} from './types';
import { type CheckContext, type Fields, checkSegment } from './values';

/** The 835 version the parser reads (PRD section 2). */
export const TRANSACTION_VERSION = '005010X221A1';
/** The interchange version (ISA12) of 5010. */
export const INTERCHANGE_VERSION = '00501';
/** GS01 of a health care claim payment/advice. */
export const FUNCTIONAL_ID = 'HP';

export interface ParseOptions {
  /** The code lists codes are checked against (a rule release's; tests use the SYNTHETIC release). */
  readonly codeLists: CodeListProvider;
}

interface InterchangeState {
  readonly header: InterchangeHeader;
  groups: number;
  readonly controlNumbers: Set<string>;
}

interface GroupState {
  readonly header: GroupHeader;
  readonly gs: Segment;
  transactions: number;
  readonly controlNumbers: Set<string>;
  readonly errors: EdiError[];
}

type State = 'interchange' | 'group' | 'transaction' | 'between' | 'stopped';

export class Edi835Parser {
  private readonly tokenizer: Tokenizer;
  private readonly decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  private readonly hash = createHash('sha256');
  private bytes = 0;
  private pending: Edi835Event[] = [];
  private state: State = 'between';
  private interchangeCount = 0;
  private interchange: InterchangeState | null = null;
  private group: GroupState | null = null;
  private builder: TransactionBuilder | null = null;
  private readonly documentErrors: EdiError[] = [];
  private readonly envelopeErrors: { readonly error: EdiError; readonly interchange: number; readonly group: number | null }[] = [];
  private readonly outcomes: TransactionOutcome[] = [];
  private readonly keys = new Set<string>();
  private peakTransactionSegments = 0;
  private finished = false;

  constructor(private readonly options: ParseOptions) {
    this.tokenizer = new Tokenizer({ segment: (segment) => this.onSegment(segment), error: (error) => this.fail(error) });
  }

  /** Reads the next chunk of the document; returns the events it completed. */
  write(chunk: Uint8Array): Edi835Event[] {
    if (this.finished) {
      throw new Edi835UsageError('the parser has ended; start a new one for the next document');
    }
    this.hash.update(chunk);
    this.bytes += chunk.byteLength;
    this.tokenizer.write(this.decoder.decode(chunk, { stream: true }));
    return this.drain();
  }

  /** Ends the document: returns the last events and the report. */
  end(): { events: Edi835Event[]; report: ParseReport } {
    if (this.finished) {
      throw new Edi835UsageError('the parser has ended; start a new one for the next document');
    }
    this.finished = true;
    this.tokenizer.write(this.decoder.decode());
    this.tokenizer.end();
    if (this.state !== 'stopped' && this.state !== 'between') {
      const expected = this.state === 'transaction' ? 'SE' : this.state === 'group' ? 'GE' : 'IEA';
      this.fail(syntaxError({ segmentIndex: this.tokenizer.segments + 1, segmentId: expected, elementPosition: 0 }, 'truncated', { expected }));
    }
    return { events: this.drain(), report: this.report() };
  }

  private drain(): Edi835Event[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  private emit(event: Edi835Event): void {
    this.pending.push(event);
  }

  private fail(error: EdiError): void {
    this.state = 'stopped';
    this.tokenizer.halt();
    this.documentErrors.push(error);
    this.emit({ type: 'document_error', error });
  }

  /** Checks an envelope segment; the first problem is a document error. */
  private checkEnvelope(segment: Segment): Fields | null {
    const problems: EdiError[] = [];
    const context: CheckContext = { codeLists: this.options.codeLists, codeDate: '', sink: { hold: (error) => problems.push(error), flag: () => undefined } };
    const fields = checkSegment(segment, SPECS[segment.id] as SegmentSpec, context);
    const problem = problems[0];
    if (problem !== undefined) {
      this.fail(problem);
      return null;
    }
    return fields;
  }

  private at(segment: Segment, elementPosition: number): Position {
    return { segmentIndex: segment.index, segmentId: segment.id, elementPosition };
  }

  private onSegment(segment: Segment): void {
    // Once the parser has stopped, the tokenizer is halted and hands over nothing more.
    if (this.state === 'between') {
      this.openInterchange(segment);
    } else if (this.state === 'interchange') {
      this.onInterchangeSegment(segment);
    } else if (this.state === 'group') {
      this.onGroupSegment(segment);
    } else {
      this.onTransactionSegment(segment);
    }
  }

  private openInterchange(segment: Segment): void {
    // The tokenizer hands over an ISA here and nothing else.
    const fields = this.checkEnvelope(segment);
    if (fields === null) {
      return;
    }
    if (fields.raw(12) !== INTERCHANGE_VERSION) {
      this.fail(notAn835(this.at(segment, 12), INTERCHANGE_VERSION, fields.raw(12)));
      return;
    }
    const header: InterchangeHeader = {
      interchange: this.interchangeCount,
      segmentIndex: segment.index,
      delimiters: segment.delimiters,
      senderQualifier: fields.raw(5),
      senderId: fields.raw(6).trimEnd(),
      receiverQualifier: fields.raw(7),
      receiverId: fields.raw(8).trimEnd(),
      date: fields.date(9),
      time: fields.raw(10),
      version: fields.raw(12),
      controlNumber: fields.raw(13),
      acknowledgmentRequested: fields.raw(14),
      usage: fields.raw(15),
      isa09: fields.raw(9),
    };
    this.interchangeCount += 1;
    this.interchange = { header, groups: 0, controlNumbers: new Set() };
    this.state = 'interchange';
    this.emit({ type: 'interchange', interchange: header });
  }

  private onInterchangeSegment(segment: Segment): void {
    const interchange = this.interchange as InterchangeState;
    switch (segment.id) {
      case 'TA1':
        this.checkEnvelope(segment);
        return;
      case 'GS': {
        const fields = this.checkEnvelope(segment);
        if (fields === null) {
          return;
        }
        const header: GroupHeader = {
          interchange: interchange.header.interchange,
          group: interchange.groups,
          segmentIndex: segment.index,
          functionalId: fields.raw(1),
          senderCode: fields.raw(2),
          receiverCode: fields.raw(3),
          date: fields.date(4),
          time: fields.raw(5),
          controlNumber: fields.raw(6),
          agency: fields.raw(7),
          version: fields.raw(8),
        };
        const errors: EdiError[] = [];
        if (interchange.controlNumbers.has(header.controlNumber)) {
          errors.push(controlMismatch(this.at(segment, 6), 'the group control number', 'a number not used earlier in the interchange', header.controlNumber));
        }
        interchange.controlNumbers.add(header.controlNumber);
        interchange.groups += 1;
        this.group = { header, gs: segment, transactions: 0, controlNumbers: new Set(), errors };
        this.state = 'group';
        this.emit({ type: 'group', group: header });
        return;
      }
      case 'IEA': {
        const fields = this.checkEnvelope(segment);
        if (fields === null) {
          return;
        }
        if (interchange.groups === 0) {
          this.fail(syntaxError({ segmentIndex: segment.index, segmentId: 'GS', elementPosition: 0 }, 'missing_segment', { expected: 'GS', found: 'IEA' }));
          return;
        }
        const errors: EdiError[] = [];
        if (parseInt(fields.raw(1), 10) !== interchange.groups) {
          errors.push(controlMismatch(this.at(segment, 1), 'the group count', String(interchange.groups), fields.raw(1)));
        }
        if (fields.raw(2) !== interchange.header.controlNumber) {
          errors.push(controlMismatch(this.at(segment, 2), 'the interchange control number', interchange.header.controlNumber, fields.raw(2)));
        }
        for (const error of errors) {
          this.envelopeErrors.push({ error, interchange: interchange.header.interchange, group: null });
        }
        this.emit({
          type: 'interchange_end',
          interchange: { interchange: interchange.header.interchange, segmentIndex: segment.index, groupCount: fields.raw(1), controlNumber: fields.raw(2), errors },
        });
        this.interchange = null;
        this.state = 'between';
        return;
      }
      default:
        this.fail(syntaxError(this.at(segment, 0), 'unexpected_segment', { expected: 'GS or IEA' }));
    }
  }

  private onGroupSegment(segment: Segment): void {
    const group = this.group as GroupState;
    switch (segment.id) {
      case 'ST':
        this.openTransaction(segment, group);
        return;
      case 'GE': {
        const fields = this.checkEnvelope(segment);
        if (fields === null) {
          return;
        }
        if (group.transactions === 0) {
          this.fail(syntaxError({ segmentIndex: segment.index, segmentId: 'ST', elementPosition: 0 }, 'missing_segment', { expected: 'ST', found: 'GE' }));
          return;
        }
        const errors = group.errors;
        if (parseInt(fields.raw(1), 10) !== group.transactions) {
          errors.push(controlMismatch(this.at(segment, 1), 'the transaction set count', String(group.transactions), fields.raw(1)));
        }
        if (fields.raw(2) !== group.header.controlNumber) {
          errors.push(controlMismatch(this.at(segment, 2), 'the group control number', group.header.controlNumber, fields.raw(2)));
        }
        for (const error of errors) {
          this.envelopeErrors.push({ error, interchange: group.header.interchange, group: group.header.group });
        }
        this.emit({
          type: 'group_end',
          group: { interchange: group.header.interchange, group: group.header.group, segmentIndex: segment.index, transactionCount: fields.raw(1), controlNumber: fields.raw(2), errors },
        });
        this.group = null;
        this.state = 'interchange';
        return;
      }
      default:
        this.fail(syntaxError(this.at(segment, 0), 'unexpected_segment', { expected: 'ST or GE' }));
    }
  }

  private openTransaction(segment: Segment, group: GroupState): void {
    const fields = this.checkEnvelope(segment);
    if (fields === null) {
      return;
    }
    // An 837 or a 277 by mistake (PRD section 10): the transaction set, then the group, then the version.
    if (fields.raw(1) !== '835') {
      this.fail(notAn835(this.at(segment, 1), '835', fields.raw(1)));
      return;
    }
    if (group.header.functionalId !== FUNCTIONAL_ID) {
      this.fail(notAn835(this.at(group.gs, 1), FUNCTIONAL_ID, group.header.functionalId));
      return;
    }
    if (group.header.version !== TRANSACTION_VERSION) {
      this.fail(notAn835(this.at(group.gs, 8), TRANSACTION_VERSION, group.header.version));
      return;
    }
    const interchange = this.interchange as InterchangeState;
    const st02 = fields.raw(2);
    const holds: EdiError[] = [];
    if (group.controlNumbers.has(st02)) {
      holds.push(controlMismatch(this.at(segment, 2), 'the transaction set control number', 'a number not used earlier in the group', st02));
    }
    group.controlNumbers.add(st02);
    this.builder = new TransactionBuilder({
      position: { interchange: interchange.header.interchange, group: group.header.group, transaction: group.transactions },
      st: segment,
      interchangeControlNumber: interchange.header.controlNumber,
      groupControlNumber: group.header.controlNumber,
      senderId: interchange.header.senderId,
      receiverId: interchange.header.receiverId,
      codeLists: this.options.codeLists,
      holds,
    });
    group.transactions += 1;
    this.state = 'transaction';
  }

  private onTransactionSegment(segment: Segment): void {
    const builder = this.builder as TransactionBuilder;
    if (segment.id === 'ST' || segment.id === 'GE' || segment.id === 'GS' || segment.id === 'IEA' || segment.id === 'ISA') {
      this.fail(syntaxError({ segmentIndex: segment.index, segmentId: 'SE', elementPosition: 0 }, 'missing_segment', { expected: 'SE', found: segment.id }));
      return;
    }
    if (segment.id !== 'SE') {
      builder.add(segment);
      return;
    }
    let remittance = builder.finish(segment);
    this.peakTransactionSegments = Math.max(this.peakTransactionSegments, remittance.segmentCount);
    if (remittance.dedupKey !== null) {
      const key = remittanceKeyText(remittance.dedupKey);
      if (this.keys.has(key)) {
        // The same remittance twice in one document: the second loads nothing (PRD section 10, step 8).
        const trace = remittance.trace as NonNullable<Remittance['trace']>;
        remittance = { ...remittance, loadable: false, heldReasons: [...remittance.heldReasons, duplicate({ segmentIndex: trace.segmentIndex, segmentId: 'TRN', elementPosition: 2 }, 'remittance')] };
      }
      this.keys.add(key);
    }
    this.outcomes.push({
      position: remittance.position,
      segmentIndex: remittance.segmentIndex,
      st02: remittance.controlNumber,
      isa13: remittance.interchangeControlNumber,
      gs06: remittance.groupControlNumber,
      loadable: remittance.loadable,
      heldReasons: remittance.heldReasons,
      dedupKey: remittance.dedupKey,
      bpr16Date: remittance.payment?.date ?? null,
      counts: remittance.counts,
      plbTotalCents: remittance.balance.plbTotalCents,
      unknownCodes: remittance.unknownCodes,
    });
    this.builder = null;
    this.state = 'group';
    this.emit({ type: 'transaction', transaction: remittance });
  }

  private report(): ParseReport {
    const transactions = this.outcomes.map((outcome): TransactionOutcome => {
      const inherited = [
        ...this.envelopeErrors
          .filter((item) => item.interchange === outcome.position.interchange && (item.group === null || item.group === outcome.position.group))
          .map((item) => item.error),
        ...this.documentErrors,
      ];
      return inherited.length === 0 ? outcome : { ...outcome, loadable: false, heldReasons: [...outcome.heldReasons, ...inherited] };
    });
    const held = transactions.filter((outcome) => !outcome.loadable).length;
    const outcome = this.documentErrors.length > 0 || (held > 0 && held === transactions.length) ? 'held' : held === 0 ? 'loaded' : 'partially_held';
    return {
      documentSha256: this.hash.digest('hex'),
      bytes: this.bytes,
      bom: this.tokenizer.bom,
      segments: this.tokenizer.segments,
      outcome,
      documentErrors: this.documentErrors,
      envelopeErrors: this.envelopeErrors.map((item) => item.error),
      transactions,
      receipt: receiptOf(transactions),
      codeListRelease: this.options.codeLists.release,
      memory: { peakTransactionSegments: this.peakTransactionSegments, peakBufferedCharacters: this.tokenizer.peakBuffered },
    };
  }
}

function sum(outcomes: readonly TransactionOutcome[], count: (outcome: TransactionOutcome) => number): number {
  return outcomes.reduce((total, outcome) => total + count(outcome), 0);
}

export function receiptOf(transactions: readonly TransactionOutcome[]): Receipt {
  const loaded = transactions.filter((transaction) => transaction.loadable);
  return {
    transactions: transactions.length,
    claims: sum(transactions, (transaction) => transaction.counts.claims),
    lines: sum(transactions, (transaction) => transaction.counts.lines),
    reversals: sum(transactions, (transaction) => transaction.counts.reversals),
    plbTotalCents: sumCents(transactions.map((transaction) => transaction.plbTotalCents)),
    held: transactions.filter((transaction) => !transaction.loadable).map((transaction) => ({ st02: transaction.st02, reasons: [...new Set(transaction.heldReasons.map((reason) => reason.code))] })),
    unknownCodes: [...new Set(transactions.flatMap((transaction) => transaction.unknownCodes.map((code) => `${code.list}:${code.value}`)))].sort(),
    loaded: {
      transactions: loaded.length,
      claims: sum(loaded, (transaction) => transaction.counts.claims),
      lines: sum(loaded, (transaction) => transaction.counts.lines),
    },
  };
}
