import type { ReactNode } from 'react';

/**
 * A wide table's sideways scroller (WCAG 2.1.1, axe's scrollable-region-focusable): at a phone's width the table
 * scrolls inside it, so the scroller is a named region a keyboard can reach (tabIndex 0) and scroll with the arrow
 * keys, with a visible focus ring, and it may shrink to its column (min-w-0) so the page itself never scrolls
 * sideways. `label` names the table it holds.
 */
export function ScrollTable({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="region" aria-label={`${label}, scrolls sideways`} tabIndex={0} className="min-w-0 max-w-full overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </div>
  );
}
