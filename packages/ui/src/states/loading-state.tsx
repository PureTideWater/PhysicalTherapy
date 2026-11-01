import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/cn';
import { LoadingAnnouncement } from './loading-announcement';
import { StateMark } from './state-mark';

export type LoadingStateProps = {
  /** Shown beside the bar, and announced once the screen starts loading. */
  label?: string;
  /** Placeholder rows to draw. */
  rows?: number;
  className?: string;
};

/**
 * While a screen loads: the mark alone and still, a plain progress bar (the brand's only motion for
 * progress; it stops under prefers-reduced-motion), the label in words beside it, and still placeholder
 * rows (docs/brand/BRAND.md, section 7: never the mark as a spinner). The status region is on the page
 * before its words, which arrive after mount, so the change is announced; it is never aria-busy, which
 * would hold the announcement until a busy flag that the next page replaces, never clears (docs/adr/0077).
 * The shown label sits in the hidden row, so it is not read twice.
 */
export function LoadingState({ label = 'Loading', rows = 3, className }: LoadingStateProps) {
  return (
    <div data-slot="loading-state" className={cn('flex flex-col gap-3', className)}>
      <p role="status" className="sr-only">
        <LoadingAnnouncement label={label} />
      </p>
      <div className="flex items-center gap-3" aria-hidden="true">
        <StateMark />
        <div data-slot="progress-bar" className="pw-progress h-1 w-40 overflow-hidden rounded-pill bg-bg-inset">
          <div className="pw-progress-bar h-full w-1/3 rounded-pill bg-primary" />
        </div>
        <span className="text-sm text-muted-foreground" data-slot="loading-label">
          {label}
        </span>
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-6 w-full animate-none" />
      ))}
    </div>
  );
}
