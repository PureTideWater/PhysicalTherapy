'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * A wide table's sideways scroller (WCAG 2.1.1, axe's scrollable-region-focusable): at a phone's width the table
 * scrolls inside it, so the scroller is a named region a keyboard can reach (tabIndex 0) and scroll with the arrow
 * keys, with a visible focus ring, and it may shrink to its column (min-w-0) so the page itself never scrolls
 * sideways. It is the containing block of what the table positions (`relative`): a visually hidden header cell
 * (sr-only, absolutely positioned) is clipped with the table instead of widening the page (WCAG 1.4.10; UX confirm of
 * PR #50, NEW-A). While the table is wider than the scroller, a short line above it says so (UX confirm, N3), measured
 * in the browser so it never shows over a table that fits; the region's name already says so to a screen reader.
 * `label` names the table it holds.
 */
export function ScrollTable({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    if (element === null) {
      return undefined;
    }
    const measure = () => {
      setOverflows(element.scrollWidth > element.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) {
      observer.observe(child);
    }
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <>
      {overflows ? (
        <p aria-hidden="true" className="text-xs text-muted-foreground" data-state="scrolls-sideways">
          More columns to the right: scroll the table sideways.
        </p>
      ) : null}
      <div
        ref={scroller}
        role="region"
        aria-label={`${label}, scrolls sideways`}
        tabIndex={0}
        className="relative min-w-0 max-w-full overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </div>
    </>
  );
}
