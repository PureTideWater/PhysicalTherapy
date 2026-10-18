/**
 * A small seeded generator, so every fixture is the same on every machine and every run. It works on
 * 32-bit integers only (mulberry32 over a FNV-1a seed): no Math.random, no clock, no float reaches an
 * amount. Amounts it draws are bigint cents.
 */
import { type Cents, cents } from '@tp/money';

/** FNV-1a over the UTF-16 code units of a string: a stable 32-bit seed from a case ID. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export class Random {
  private state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? seedFrom(seed) : seed) >>> 0;
  }

  /** The next unsigned 32-bit value. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** A whole number from `min` to `max`, both included. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${String(min)}, ${String(max)}) needs whole numbers with min <= max`);
    }
    const span = max - min + 1;
    return min + (this.next() % span);
  }

  /** Whole cents from `min` to `max`, both included. */
  cents(min: bigint, max: bigint): Cents {
    if (max < min) {
      throw new RangeError('cents(min, max) needs min <= max');
    }
    const span = max - min + 1n;
    // Two draws give 64 bits, far more than any fixture amount needs.
    const wide = (BigInt(this.next()) << 32n) | BigInt(this.next());
    return cents(min + (wide % span));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('pick() from an empty list');
    }
    return items[this.int(0, items.length - 1)] as T;
  }

  /** True `percent` times in a hundred. */
  chance(percent: number): boolean {
    return this.int(1, 100) <= percent;
  }

  /** Uppercase letters and digits, for invented identifiers. */
  alphanumeric(length: number): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let text = '';
    for (let index = 0; index < length; index += 1) {
      text += alphabet[this.int(0, alphabet.length - 1)] ?? 'X';
    }
    return text;
  }

  digits(length: number): string {
    let text = '';
    for (let index = 0; index < length; index += 1) {
      text += String(this.int(0, 9));
    }
    return text;
  }
}
