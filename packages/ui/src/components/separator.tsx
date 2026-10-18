import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

export type SeparatorProps = ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical';
  /** A decorative separator is hidden from assistive technology. */
  decorative?: boolean;
};

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  );
}
