import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        // Status is text on a quiet tint, never white text on a saturated fill (docs/brand/BRAND.md, section 4):
        // Ink fills are the primary button's alone. A neutral state is the inset tint with its rule.
        default: 'border-border bg-bg-inset text-fg',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        // A failure (a failed job, a refused check) is danger text on its tint: not the Short data color by name.
        destructive: 'border-transparent bg-danger-bg text-danger',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
