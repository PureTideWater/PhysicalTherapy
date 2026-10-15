/**
 * The twin generator (PRD section 16): turns a parsed 835 into a structurally identical synthetic
 * one. Every segment, element and component stays where it was; dates move by one offset; names,
 * identifiers and free text are replaced character class for character class (digits by digits,
 * letters by letters), the same value always by the same twin value, so links between claims,
 * reversals and recoupments survive; amounts are scaled by a factor per claim and per transaction and
 * then rebalanced, so every claim and transaction balances exactly as the original did (a held file
 * keeps its exact difference). The sender becomes SYNTHSENDER and GS02 SYNTH.
 *
 * It runs only inside a `TwinBoundary` (boundary.ts). Its input is the segment document a parser
 * produces (packages/synth X12Document); its output renders with renderDocument.
 */
import { randomBytes } from 'node:crypto';

import { type Cents, addCents, cents, formatCents, negateCents, parseAmount, subtractCents, sumCents } from '@tp/money';

import { addDays, fromX12Date, parseCalendarDate, toIsaDate, toX12Date } from '../core/dates';
import { Random } from '../core/random';
import { SYNTH_GS02, SYNTH_ISA06 } from '../identity';
import { formatX12Amount } from '../x12/build835';
import { type X12Document, type X12Element, type X12Interchange, type X12Segment } from '../x12/segments';
import { type TwinBoundary } from './boundary';
import { roleOf } from './roles';

export interface TwinOptions {
  readonly boundary: TwinBoundary;
  /** Fixes the session's randomness (tests). In production leave it out: a random seed is drawn. */
  readonly seed?: string;
}

const FACTOR_DENOMINATOR = 10_000n;

/** a times num / 10000, rounded half away from zero (so a negated amount scales to the negated result). */
function scale(amount: Cents, numerator: bigint): Cents {
  const product = amount * numerator;
  const magnitude = product < 0n ? -product : product;
  const rounded = (magnitude * 2n + FACTOR_DENOMINATOR) / (FACTOR_DENOMINATOR * 2n);
  return cents(product < 0n ? -rounded : rounded);
}

interface AmountSlot {
  readonly segment: number;
  readonly position: number;
  readonly original: Cents;
  value: Cents;
}

interface LineDraft {
  svc: number;
  charge: AmountSlot;
  paid: AmountSlot;
  cas: { group: string; slot: AmountSlot }[];
  amounts: { qualifier: string; slot: AmountSlot }[];
}

interface ClaimDraft {
  clp: number;
  key: string;
  charge: AmountSlot;
  paid: AmountSlot;
  responsibility?: AmountSlot;
  cas: { group: string; slot: AmountSlot }[];
  amounts: { qualifier: string; slot: AmountSlot }[];
  lines: LineDraft[];
}

export class TwinSession {
  private readonly random: Random;
  private readonly dayOffset: number;
  private readonly replacements = new Map<string, string>();
  private readonly used = new Set<string>();
  private readonly factors = new Map<string, bigint>();

  constructor(private readonly options: TwinOptions) {
    this.random = new Random(options.seed ?? randomBytes(16).toString('hex'));
    // Between 61 and 400 days earlier, never a whole number of weeks, so weekdays move too.
    let offset = this.random.int(61, 400);
    if (offset % 7 === 0) {
      offset += 1;
    }
    this.dayOffset = -offset;
  }

  /** The twin of a parsed document. Call again with more files to keep their links consistent. */
  twin(document: X12Document): X12Document {
    this.options.boundary.admit(document);
    return { interchanges: document.interchanges.map((interchange) => this.twinInterchange(interchange)) };
  }

  private replace(text: string): string {
    if (!/[A-Za-z0-9]/.test(text)) {
      return text;
    }
    const known = this.replacements.get(text);
    if (known !== undefined) {
      return known;
    }
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = text.replace(/[A-Za-z0-9]/g, (character) => {
        if (/[0-9]/.test(character)) {
          return String(this.random.int(0, 9));
        }
        const letter = String.fromCharCode(65 + this.random.int(0, 25));
        return /[a-z]/.test(character) ? letter.toLowerCase() : letter;
      });
      if (candidate !== text && !this.used.has(candidate)) {
        this.replacements.set(text, candidate);
        this.used.add(candidate);
        return candidate;
      }
    }
    throw new Error('the twin generator ran out of replacements for a short value');
  }

  private shift8(text: string): string {
    if (!/^\d{8}$/.test(text)) {
      return this.replace(text);
    }
    return toX12Date(addDays(fromX12Date(text), this.dayOffset));
  }

  private shift6(text: string): string {
    if (!/^\d{6}$/.test(text)) {
      return this.replace(text);
    }
    // ISA09 is YYMMDD; interchange dates are this century.
    return toIsaDate(addDays(parseCalendarDate(`20${text.slice(0, 2)}-${text.slice(2, 4)}-${text.slice(4, 6)}`), this.dayOffset));
  }

  private component(segmentId: string, position: number, component: number, value: string, element: X12Element): string {
    if (value === '') {
      return value;
    }
    switch (roleOf(segmentId, position, component)) {
      case 'keep':
      case 'balance':
      case 'scale':
        return value;
      case 'replace':
        return this.replace(value);
      case 'date8':
        return this.shift8(value);
      case 'date6':
        return this.shift6(value);
      case 'period':
        return value
          .split('-')
          .map((part) => this.shift8(part))
          .join('-');
      case 'blank':
        return ' '.repeat(value.length);
      case 'sender':
        return SYNTH_ISA06;
      case 'gs02':
        return SYNTH_GS02;
      case 'zz':
        return 'ZZ';
      case 'test':
        return element.length === 1 ? 'T' : value;
    }
  }

  private twinSegment(segment: X12Segment): X12Segment {
    return {
      id: segment.id,
      elements: segment.elements.map((element, index) => element.map((value, componentIndex) => this.component(segment.id, index + 1, componentIndex + 1, value, element))),
    };
  }

  private factor(key: string): bigint {
    const known = this.factors.get(key);
    if (known !== undefined) {
      return known;
    }
    const drawn = BigInt(this.random.int(8500, 11500));
    this.factors.set(key, drawn);
    return drawn;
  }

  private twinInterchange(interchange: X12Interchange): X12Interchange {
    // Amounts first, on the original values, then every other element.
    const segments = interchange.segments.map((segment) => ({ id: segment.id, elements: segment.elements.map((element) => [...element]) }));
    let start = -1;
    segments.forEach((segment, index) => {
      if (segment.id === 'ST') {
        start = index;
      } else if (segment.id === 'SE' && start >= 0) {
        this.rebalance(segments, start, index);
        start = -1;
      }
    });
    const amounts = segments.map((segment) => segment.elements);
    const twinned = interchange.segments.map((segment, index) => {
      const replaced = this.twinSegment(segment);
      return {
        id: replaced.id,
        elements: replaced.elements.map((element, position) =>
          element.map((value, component) => {
            const role = roleOf(segment.id, position + 1, component + 1);
            return role === 'balance' || role === 'scale' ? (amounts[index]?.[position]?.[component] ?? value) : value;
          }),
        ),
      };
    });
    return { delimiters: interchange.delimiters, segments: twinned };
  }

  /** Scales and rebalances the amounts of one transaction set (segments start..end, ST to SE). */
  private rebalance(segments: { id: string; elements: string[][] }[], start: number, end: number): void {
    const slot = (index: number, position: number): AmountSlot | undefined => {
      const text = segments[index]?.elements[position - 1]?.[0] ?? '';
      if (text === '') {
        return undefined;
      }
      try {
        const original = parseAmount(text);
        return { segment: index, position, original, value: original };
      } catch {
        return undefined;
      }
    };
    const write = (target: AmountSlot) => {
      const element = segments[target.segment]?.elements[target.position - 1];
      if (element) {
        const before = element[0] ?? '';
        element[0] = before.includes('.') ? formatCents(target.value) : formatX12Amount(target.value, 'trimmed');
      }
    };
    const trn = segments.slice(start, end).find((segment) => segment.id === 'TRN');
    const transactionFactor = this.factor(`TRN:${trn?.elements[1]?.[0] ?? String(start)}`);
    let bpr: AmountSlot | undefined;
    let debit = false;
    const claims: ClaimDraft[] = [];
    const plb: AmountSlot[] = [];
    const scaled: AmountSlot[] = [];
    let claim: ClaimDraft | undefined;
    let lineDraft: LineDraft | undefined;
    for (let index = start; index <= end; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }
      const id = segment.id;
      const casItems = (target: { group: string; slot: AmountSlot }[]) => {
        const group = segment.elements[0]?.[0] ?? '';
        for (let position = 3; position <= 18; position += 3) {
          const found = slot(index, position);
          if (found) {
            target.push({ group, slot: found });
          }
        }
      };
      if (id === 'BPR') {
        bpr = slot(index, 2);
        debit = (segment.elements[2]?.[0] ?? '') === 'D';
      } else if (id === 'CLP') {
        lineDraft = undefined;
        const key = `CLP:${segment.elements[6]?.[0] || segment.elements[0]?.[0] || String(index)}`;
        const charge = slot(index, 3);
        const paid = slot(index, 4);
        if (!charge || !paid) {
          claim = undefined;
          continue;
        }
        claim = { clp: index, key, charge, paid, responsibility: slot(index, 5), cas: [], amounts: [], lines: [] };
        claims.push(claim);
      } else if (id === 'SVC' && claim) {
        const charge = slot(index, 2);
        const paid = slot(index, 3);
        if (charge && paid) {
          lineDraft = { svc: index, charge, paid, cas: [], amounts: [] };
          claim.lines.push(lineDraft);
        }
      } else if (id === 'CAS' && claim) {
        casItems(lineDraft ? lineDraft.cas : claim.cas);
      } else if (id === 'AMT' && claim) {
        const found = slot(index, 2);
        if (found) {
          (lineDraft ? lineDraft.amounts : claim.amounts).push({ qualifier: segment.elements[0]?.[0] ?? '', slot: found });
        }
      } else if (id === 'PLB') {
        claim = undefined;
        lineDraft = undefined;
        for (let position = 4; position <= 14; position += 2) {
          const found = slot(index, position);
          if (found) {
            plb.push(found);
          }
        }
      } else if (id === 'LX') {
        claim = undefined;
        lineDraft = undefined;
      } else if (id === 'TS3' || id === 'TS2' || id === 'MIA' || id === 'MOA') {
        segment.elements.forEach((_, position) => {
          if (roleOf(id, position + 1, 1) === 'scale') {
            const found = slot(index, position + 1);
            if (found) {
              scaled.push(found);
            }
          }
        });
      }
    }

    const sum = (slots: readonly AmountSlot[], key: 'original' | 'value') => sumCents(slots.map((item) => item[key]));
    const largest = (slots: readonly AmountSlot[]) =>
      slots.reduce<AmountSlot | undefined>((best, item) => {
        const magnitude = (value: Cents): bigint => (value < 0n ? negateCents(value) : value);
        return best === undefined || magnitude(item.original) > magnitude(best.original) ? item : best;
      }, undefined);

    for (const draft of claims) {
      const f = this.factor(draft.key);
      const s = (item: AmountSlot) => {
        item.value = scale(item.original, f);
      };
      const pr = (items: { group: string; slot: AmountSlot }[], key: 'original' | 'value') => sum(items.filter((item) => item.group === 'PR').map((item) => item.slot), key);
      for (const serviceLine of draft.lines) {
        s(serviceLine.charge);
        s(serviceLine.paid);
        serviceLine.cas.forEach((item) => s(item.slot));
        const casSlots = serviceLine.cas.map((item) => item.slot);
        const balancing = largest(casSlots);
        if (balancing) {
          const lineDifference = subtractCents(subtractCents(serviceLine.charge.original, sum(casSlots, 'original')), serviceLine.paid.original);
          const others = sum(
            casSlots.filter((item) => item !== balancing),
            'value',
          );
          balancing.value = subtractCents(subtractCents(subtractCents(serviceLine.charge.value, serviceLine.paid.value), lineDifference), others);
        }
        for (const amount of serviceLine.amounts) {
          const derived = amount.qualifier === 'B6' && amount.slot.original === addCents(serviceLine.paid.original, pr(serviceLine.cas, 'original'));
          amount.slot.value = derived ? addCents(serviceLine.paid.value, pr(serviceLine.cas, 'value')) : scale(amount.slot.original, f);
        }
      }
      draft.cas.forEach((item) => s(item.slot));
      const lineCharges = draft.lines.map((item) => item.charge);
      const linePaid = draft.lines.map((item) => item.paid);
      const lineCas = draft.lines.flatMap((item) => item.cas.map((cas) => cas.slot));
      const claimCas = draft.cas.map((item) => item.slot);
      const difference = subtractCents(subtractCents(subtractCents(draft.charge.original, sum(claimCas, 'original')), sum(lineCas, 'original')), draft.paid.original);
      if (draft.lines.length > 0) {
        draft.charge.value = addCents(sum(lineCharges, 'value'), subtractCents(draft.charge.original, sum(lineCharges, 'original')));
        const paidOffset = subtractCents(draft.paid.original, sum(linePaid, 'original'));
        draft.paid.value = addCents(sum(linePaid, 'value'), claimCas.length > 0 ? scale(paidOffset, f) : paidOffset);
      } else {
        s(draft.charge);
        draft.paid.value = claimCas.length > 0 ? scale(draft.paid.original, f) : subtractCents(draft.charge.value, difference);
      }
      const balancing = largest(claimCas);
      if (balancing) {
        const others = sum(
          claimCas.filter((item) => item !== balancing),
          'value',
        );
        balancing.value = subtractCents(subtractCents(subtractCents(subtractCents(draft.charge.value, others), sum(lineCas, 'value')), draft.paid.value), difference);
      }
      const allCas = [...draft.cas, ...draft.lines.flatMap((item) => item.cas)];
      if (draft.responsibility) {
        draft.responsibility.value = draft.responsibility.original === pr(allCas, 'original') ? pr(allCas, 'value') : scale(draft.responsibility.original, f);
      }
      for (const amount of draft.amounts) {
        const derived = amount.qualifier === 'AU' && amount.slot.original === addCents(draft.paid.original, pr(allCas, 'original'));
        amount.slot.value = derived ? addCents(draft.paid.value, pr(allCas, 'value')) : scale(amount.slot.original, f);
      }
    }

    for (const item of [...plb, ...scaled]) {
      item.value = scale(item.original, transactionFactor);
    }
    const claimsPaid = (key: 'original' | 'value') => sumCents(claims.map((item) => item.paid[key]));
    if (bpr) {
      const signed = (value: Cents) => (debit ? negateCents(value) : value);
      const transactionDifference = subtractCents(subtractCents(claimsPaid('original'), sum(plb, 'original')), signed(bpr.original));
      const balancing = largest(plb);
      if (balancing) {
        bpr.value = scale(bpr.original, transactionFactor);
        const others = sum(
          plb.filter((item) => item !== balancing),
          'value',
        );
        balancing.value = subtractCents(subtractCents(subtractCents(claimsPaid('value'), others), signed(bpr.value)), transactionDifference);
      } else {
        bpr.value = signed(subtractCents(claimsPaid('value'), transactionDifference));
      }
      write(bpr);
    }
    for (const draft of claims) {
      [draft.charge, draft.paid, ...(draft.responsibility ? [draft.responsibility] : []), ...draft.cas.map((item) => item.slot), ...draft.amounts.map((item) => item.slot)].forEach(write);
      for (const serviceLine of draft.lines) {
        [serviceLine.charge, serviceLine.paid, ...serviceLine.cas.map((item) => item.slot), ...serviceLine.amounts.map((item) => item.slot)].forEach(write);
      }
    }
    [...plb, ...scaled].forEach(write);
  }
}

/** One-shot convenience: the twin of one document in a fresh session. */
export function generateTwin(document: X12Document, options: TwinOptions): X12Document {
  return new TwinSession(options).twin(document);
}
