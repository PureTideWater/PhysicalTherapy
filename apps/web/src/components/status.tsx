import { cn } from '@tp/ui';
import type { ReactNode } from 'react';

/**
 * Status as text on a quiet tint, never color alone and never white text on a saturated fill
 * (docs/brand/BRAND.md, section 4; docs/adr/0056 maps the line stages to the tints). The status colors are
 * for data only and never sit near the logo. Whole and short are colored text on their tints (4.7:1 and
 * better); unpriced's own gray is 3.7:1 on white, under the 4.5:1 text minimum, so its text is Slate and its
 * hue the chip's border. Neutral is a stage that is neither whole nor short yet, or a system state that is not a
 * payment status. Danger is a refused check or an evidence gap (docs/adr/0056), named apart from Short, the data
 * color, though the brand defines no other red yet.
 */
export type StatusTone = 'whole' | 'short' | 'unpriced' | 'neutral' | 'danger';

const TONES: Readonly<Record<StatusTone, string>> = {
  whole: 'border-transparent bg-status-whole-bg text-status-whole',
  short: 'border-transparent bg-status-short-bg text-status-short',
  unpriced: 'border-status-unpriced bg-status-unpriced-bg text-fg-muted',
  neutral: 'border-border bg-bg-inset text-fg',
  danger: 'border-transparent bg-danger-bg text-danger',
};

export function StatusChip({ tone, children, className, ...data }: { readonly tone: StatusTone; readonly children: ReactNode; readonly className?: string; readonly title?: string } & Readonly<Record<`data-${string}`, string | undefined>>) {
  return (
    <span data-slot="status-chip" data-tone={tone} className={cn('inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium', TONES[tone], className)} {...data}>
      {children}
    </span>
  );
}
