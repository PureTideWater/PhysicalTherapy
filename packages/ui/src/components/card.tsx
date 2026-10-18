import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('flex flex-col gap-4 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1.5 px-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  // The brand's headline type (docs/brand/BRAND.md, section 5): 700 at -0.02em, below the page's 32 px title and a section's 20 px heading.
  return <h2 data-slot="card-title" className={cn('text-lg font-bold leading-snug tracking-display', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  // Running text at the body size, 16/24; tables and dense controls keep 14.
  return <p data-slot="card-description" className={cn('text-base text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center gap-2 px-6', className)} {...props} />;
}
