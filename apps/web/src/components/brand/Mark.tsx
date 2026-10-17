import { MARK_PATHS, MARK_VIEWBOX, cutForSize, markFills, type MarkVariant } from '@paidwhole/brand/mark';

type Props = {
  /** Rendered size in CSS px. The small cut (wider seams) switches on automatically at 32 px and below. */
  size?: number;
  /** color: ink ring (white in dark mode) + brass keystone. reversed: white ring + brass. mono: inherits currentColor. */
  variant?: MarkVariant;
  /** Set when the mark sits next to the visible name, so screen readers do not hear "PaidWhole" twice. */
  decorative?: boolean;
  className?: string;
};

/**
 * The PaidWhole mark. The only way the mark is drawn in the app; never copy the paths elsewhere. Its
 * colors are SVG fill attributes reading the tokens (no style attribute, which the pages' CSP refuses).
 */
export function PaidWholeMark({ size = 24, variant = 'color', decorative = false, className }: Props) {
  if (size < 16) throw new Error('PaidWholeMark: minimum size is 16 px');
  const cut = cutForSize(size);
  const fills = markFills(variant);
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      className={className}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'PaidWhole'}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      data-cut={cut}
    >
      <path d={MARK_PATHS.ring[cut]} fill={fills.ring} />
      <path d={MARK_PATHS.keystone} fill={fills.keystone} />
    </svg>
  );
}
