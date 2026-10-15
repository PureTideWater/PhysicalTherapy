import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/cn';

export type LoadingStateProps = {
  /** Read by assistive technology while the screen loads. */
  label?: string;
  /** Placeholder rows to draw. */
  rows?: number;
  className?: string;
};

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
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-6 w-full" />
      ))}
    </div>
  );
}
