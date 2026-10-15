import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export type EmptyStateProps = {
  title: string;
  /** What to do next (PRD section 7: every empty state says what to do next). */
  nextStep: string;
  /** An optional control that takes the next step. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, nextStep, action, className }: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      aria-label={title}
      className={cn('flex flex-col items-start gap-3 rounded-xl border border-dashed p-8', className)}
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{nextStep}</p>
      {action}
    </section>
  );
}
