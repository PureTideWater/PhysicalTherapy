import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { StateMark } from './state-mark';

export type EmptyStateProps = {
  title: string;
  /** What to do next (PRD section 7: every empty state says what to do next). */
  nextStep: string;
  /** An optional control that takes the next step. */
  action?: ReactNode;
  /**
   * Draw the mark: for the one screen-level empty state of a page (the screen has nothing yet). An empty
   * section inside a screen is text alone, so the mark is not repeated down a page as a bullet.
   */
  mark?: boolean;
  className?: string;
};

/**
 * An empty screen or section, then what to do next (PRD section 7). A screen-level one carries the mark alone,
 * still (docs/brand/BRAND.md, section 7), decorative beside the heading that names the state, so a reader
 * does not hear "PaidWhole" for every empty list; a section's is text alone (docs/adr/0056).
 */
export function EmptyState({ title, nextStep, action, mark = false, className }: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      aria-label={title}
      className={cn('flex flex-col items-start gap-3 rounded-xl border border-dashed p-8', className)}
    >
      {mark ? <StateMark decorative /> : null}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{nextStep}</p>
      {action}
    </section>
  );
}
