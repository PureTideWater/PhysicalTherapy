import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/cn';
import { StateMark } from './state-mark';

export type LoadingStateProps = {
  /** Read by assistive technology while the screen loads. */
  label?: string;
  /** Placeholder rows to draw. */
  rows?: number;
  className?: string;
};

/**
 * While a screen loads: the mark alone and still, a plain progress bar (the brand's only motion for
 * progress; it stops under prefers-reduced-motion), and still placeholder rows (docs/brand/BRAND.md,
 * section 7: never the mark as a spinner).
 */
export function LoadingState({ label = 'Loading', rows = 3, className }: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col gap-3', className)}
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3" aria-hidden="true">
        <StateMark />
        <div data-slot="progress-bar" className="pw-progress h-1 w-40 overflow-hidden rounded-pill bg-bg-inset">
          <div className="pw-progress-bar h-full w-1/3 rounded-pill bg-primary" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-6 w-full animate-none" />
      ))}
    </div>
  );
}
