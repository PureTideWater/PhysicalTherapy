import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  // Each call site associates its control with htmlFor.
  return <label data-slot="label" className={cn('flex items-center gap-2 text-sm font-medium leading-none', className)} {...props} />;
}
