import { tagline as brandTagline } from '@paidwhole/brand/tokens';

import { PaidWholeMark } from './Mark';

/** Wordmark sizes the lockup is drawn at, in px (the brand's horizontal minimum, 120 px wide, is size 19). */
export type LockupSize = 20 | 24 | 28 | 32 | 40 | 48;

type Props = {
  /** Wordmark cap size in px; the mark scales with it (0.87x) and the gap is 0.29x. */
  size?: LockupSize;
  /** Lay the mark above the wordmark. Use for square placements only. */
  stacked?: boolean;
  /** Show the tagline under the wordmark (marketing and email headers, never app chrome). */
  tagline?: boolean;
  /** Reverse for ink or dark grounds. */
  reversed?: boolean;
  className?: string;
};

interface Geometry {
  /** The mark's size in px: 0.87x the wordmark (1.46x stacked). */
  readonly mark: number;
  /** The gap between mark and wordmark: 0.29x (0.26x stacked). */
  readonly gap: string;
  /** The wordmark's size and the gap to the tagline (0.12x). */
  readonly text: string;
  readonly inner: string;
}

/*
 * The drop-in's proportions, computed once per size and written out as whole class names so Tailwind
 * generates them: the pages' Content-Security-Policy admits no style attribute, so sizes cannot be set
 * inline. Tagline text is max(12, 0.24x), which is 12 px at every size here.
 */
const HORIZONTAL: Readonly<Record<LockupSize, Geometry>> = {
  20: { mark: 17, gap: 'gap-[6px]', text: 'text-[20px]', inner: 'gap-[2px]' },
  24: { mark: 21, gap: 'gap-[7px]', text: 'text-[24px]', inner: 'gap-[3px]' },
  28: { mark: 24, gap: 'gap-[8px]', text: 'text-[28px]', inner: 'gap-[3px]' },
  32: { mark: 28, gap: 'gap-[9px]', text: 'text-[32px]', inner: 'gap-[4px]' },
  40: { mark: 35, gap: 'gap-[12px]', text: 'text-[40px]', inner: 'gap-[5px]' },
  48: { mark: 42, gap: 'gap-[14px]', text: 'text-[48px]', inner: 'gap-[6px]' },
};

const STACKED: Readonly<Record<LockupSize, Geometry>> = {
  20: { mark: 29, gap: 'gap-[5px]', text: 'text-[20px]', inner: 'gap-[2px]' },
  24: { mark: 35, gap: 'gap-[6px]', text: 'text-[24px]', inner: 'gap-[3px]' },
  28: { mark: 41, gap: 'gap-[7px]', text: 'text-[28px]', inner: 'gap-[3px]' },
  32: { mark: 47, gap: 'gap-[8px]', text: 'text-[32px]', inner: 'gap-[4px]' },
  40: { mark: 58, gap: 'gap-[10px]', text: 'text-[40px]', inner: 'gap-[5px]' },
  48: { mark: 70, gap: 'gap-[12px]', text: 'text-[48px]', inner: 'gap-[6px]' },
};

/**
 * Lockup for app chrome, sign-in and marketing headers: the mark plus the wordmark set live in the
 * display face. The wordmark is one word, 700 weight, -0.03em, never split or recolored; for print,
 * email or anywhere fonts may not load, use the outlined SVGs in /public/brand instead.
 */
export function PaidWholeLockup({ size = 20, stacked = false, tagline = false, reversed = false, className }: Props) {
  if (!stacked && size * 6.5 < 120) {
    // The horizontal lockup is about 6.5x the font size wide (mark, gap and wordmark); the brand
    // minimum is 120 px, so the font size must be at least 19 px. Below that, use the mark alone.
    throw new Error('PaidWholeLockup: too small; use <PaidWholeMark/> below 120 px wide');
  }
  const geometry = (stacked ? STACKED : HORIZONTAL)[size];
  const layout = stacked ? 'flex-col' : 'flex-row';
  return (
    <div className={[`inline-flex items-center ${layout} ${geometry.gap}`, className].filter(Boolean).join(' ')} data-slot="lockup">
      <PaidWholeMark size={geometry.mark} variant={reversed ? 'reversed' : 'color'} decorative />
      <div className={`flex flex-col ${stacked ? 'items-center' : 'items-start'} ${geometry.inner}`}>
        <span className={`font-display font-bold leading-none tracking-wordmark whitespace-nowrap ${geometry.text} ${reversed ? 'text-white' : 'text-fg'}`}>PaidWhole</span>
        {tagline ? <span className={`font-sans text-[12px] leading-[1.3] tracking-[0.005em] whitespace-nowrap ${reversed ? 'text-white/78' : 'text-fg-muted'}`}>{brandTagline}</span> : null}
      </div>
    </div>
  );
}
