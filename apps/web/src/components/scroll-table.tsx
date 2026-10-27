'use client';

import { type FocusEvent, type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/*
 * The scroller's state from what the browser measures (docs/adr/0078): whether its content fits or overflows, and past
 * which edge content lies; and from that state, the scroller's role, name and tab stop and the data attributes the cue
 * is drawn from. Pure functions with no React and no DOM, so the unit project tests every decision in node and the
 * components below only wire them to the browser. They live in this file rather than a module of their own because
 * the screening's pages import it: a new module on that path would change the files the screening-capacity gate
 * watches (tools/screening-capacity/watched-paths.txt).
 */

/** Unmeasured on the server and in the first client render (no script has measured yet), then fits or overflows. */
export type Overflow = 'unmeasured' | 'fits' | 'overflows';

/** One measurement on the scroller's axis: scrollWidth, clientWidth and scrollLeft, or their block-axis three. */
export interface ScrollMeasure {
  readonly scrollSize: number;
  readonly clientSize: number;
  readonly offset: number;
}

export interface ScrollState {
  readonly overflow: Overflow;
  /** Content lies past the start edge (scrolled away from the start). */
  readonly start: boolean;
  /** Content lies past the end edge. */
  readonly end: boolean;
}

/** What the region's name adds to its label: a table scrolls sideways, a fixed-height text box down. */
export type RegionSuffix = ', scrolls sideways' | ', scrolls';

export interface RegionProps {
  readonly role?: 'region';
  readonly 'aria-label'?: string;
  readonly tabIndex?: 0;
}

/** A difference of a pixel or less is rounding at a zoom factor, not overflow, and not a scroll away from an edge. */
const ROUNDING = 1;

/**
 * The scroller's state from one measurement; unmeasured, with no edge, before the browser has measured it (null). The
 * offset is read as its magnitude, so a right-to-left scroller's negative scrollLeft reads the same.
 */
export function scrollState(measure: ScrollMeasure | null): ScrollState {
  if (measure === null) {
    return { overflow: 'unmeasured', start: false, end: false };
  }
  const { scrollSize, clientSize } = measure;
  if (scrollSize - clientSize <= ROUNDING) {
    return { overflow: 'fits', start: false, end: false };
  }
  const offset = Math.abs(measure.offset);
  return { overflow: 'overflows', start: offset > ROUNDING, end: offset + clientSize < scrollSize - ROUNDING };
}

/**
 * Whether a focus or blur event is the scroller's own. React's onFocus and onBlur bubble, so focus on a link inside the
 * table reaches the scroller's handlers too; only the scroller's own focus keeps its region (DR-01).
 */
export function ownFocus(event: { readonly target: unknown; readonly currentTarget: unknown }): boolean {
  return event.target === event.currentTarget;
}

/**
 * The scroller's role, name and tab stop: a region named "<label><suffix>" with tabindex 0 while unmeasured (so it is
 * reachable before and without script), while its content overflows, and while the scroller itself holds focus (so a
 * resize never pulls focus from under the person); nothing while its content fits, so a table that fits is never
 * called a scroller and adds no idle tab stop.
 */
export function regionProps(state: ScrollState, focused: boolean, label: string, suffix: RegionSuffix): RegionProps {
  if (state.overflow === 'fits' && !focused) {
    return {};
  }
  return { role: 'region', 'aria-label': `${label}${suffix}`, tabIndex: 0 };
}

/** The state holder's data attributes: data-scroll always; data-edge-start and data-edge-end only while content lies past that edge. */
export function frameData(state: ScrollState): Readonly<Record<`data-${string}`, string>> {
  return {
    'data-scroll': state.overflow,
    ...(state.start ? { 'data-edge-start': '' } : {}),
    ...(state.end ? { 'data-edge-end': '' } : {}),
  };
}

/** Whether two states differ, so a scroll that changes nothing the page shows re-renders nothing. */
export function stateChanged(before: ScrollState, after: ScrollState): boolean {
  return before.overflow !== after.overflow || before.start !== after.start || before.end !== after.end;
}

/** A table scrolls sideways (the inline axis), a fixed-height text box down (the block axis). */
type Axis = 'inline' | 'block';

function measureOf(element: HTMLElement, axis: Axis): ScrollMeasure {
  return axis === 'inline'
    ? { scrollSize: element.scrollWidth, clientSize: element.clientWidth, offset: element.scrollLeft }
    : { scrollSize: element.scrollHeight, clientSize: element.clientHeight, offset: element.scrollTop };
}

interface Scroller {
  /** The state holder's data attributes (data-scroll, data-edge-start, data-edge-end). */
  readonly frame: Readonly<Record<`data-${string}`, string>>;
  readonly overflow: Overflow;
  /** The scroller's role, name and tab stop, its ref and its focus handlers. */
  readonly region: RegionProps & {
    readonly ref: (node: HTMLElement | null) => void;
    readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
    readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  };
}

/**
 * One scroller's live state (docs/adr/0078): unmeasured on the server and in the first client render, so the two
 * match and the region is reachable before and without script; then measured in the browser and kept current by a
 * ResizeObserver on the scroller and each element child, a MutationObserver that observes a child swapped in after
 * mount (a re-keyed table, a filter's new table, a box's new text), and one passive scroll listener coalesced to a
 * measurement per frame. The state is set only when it changes, so a scroll re-renders nothing until an edge is
 * reached or left. Only the scroller's own focus counts (DR-01), and focus taken before hydration is kept (DR-06).
 */
function useScroller(axis: Axis, label: string, suffix: RegionSuffix): Scroller {
  const scroller = useRef<HTMLElement | null>(null);
  const remeasure = useRef<() => void>(() => undefined);
  const [state, setState] = useState<ScrollState>(() => scrollState(null));
  const [focused, setFocused] = useState(false);
  const ref = useCallback((node: HTMLElement | null) => {
    scroller.current = node;
  }, []);
  useEffect(() => {
    const element = scroller.current;
    if (element === null) {
      return undefined;
    }
    const measure = () => {
      const next = scrollState(measureOf(element, axis));
      setState((current) => (stateChanged(current, next) ? next : current));
    };
    remeasure.current = measure;
    // A keyboard user may have tabbed onto the server's region before hydration, when React saw no focus event: keep
    // its stop, or a first measurement that fits would take the tab stop from the focused element (DR-06).
    setFocused(document.activeElement === element);
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    for (const child of Array.from(element.children)) {
      resized.observe(child);
    }
    const changed = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target !== element) {
          continue;
        }
        for (const node of Array.from(record.removedNodes)) {
          if (node instanceof Element) {
            resized.unobserve(node);
          }
        }
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element) {
            resized.observe(node);
          }
        }
      }
      measure();
    });
    changed.observe(element, { childList: true, subtree: true, characterData: true });
    let frame = 0;
    const scrolled = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
      }
    };
    element.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
      element.removeEventListener('scroll', scrolled);
      cancelAnimationFrame(frame);
      remeasure.current = () => undefined;
    };
  }, [axis]);
  if (label.trim() === '') {
    throw new Error('A scroller needs a label: it names the region.');
  }
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (ownFocus(event)) {
      setFocused(true);
    }
  };
  // The stop goes, if the content fits, on the measurement after the scroller itself loses focus.
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (ownFocus(event)) {
      setFocused(false);
      remeasure.current();
    }
  };
  return { frame: frameData(state), overflow: state.overflow, region: { ...regionProps(state, focused, label, suffix), ref, onFocus, onBlur } };
}

/**
 * A wide table's sideways scroller (docs/adr/0078; WCAG 2.1.1, axe's scrollable-region-focusable; UX-011, UX-079 (a)).
 * Three elements, each with one job: the state holder (`data-slot="scroll-table"`, `data-scroll`, `data-edge-start`,
 * `data-edge-end`), which also holds the caption; the frame that does not scroll (`.pw-scroll-frame` in brand.css),
 * on which the fades and the focus outline are drawn; and the scroller, the table's direct parent. Until the browser
 * has measured it, and while the table is wider than it, the scroller is a region named "<label>, scrolls sideways"
 * that the keyboard reaches and scrolls with the arrow keys; while the table fits it is a plain box, with no name that
 * says it scrolls and no idle tab stop, unless it holds focus itself. While the table overflows, a line above says to
 * scroll (aria-hidden: the name says it) and a fade covers each edge past which columns lie. The scroller may shrink to
 * its column (min-w-0), so the page itself never scrolls sideways, and is the containing block of what the table
 * positions (`relative`): a visually hidden header cell is clipped with the table instead of widening the page (WCAG
 * 1.4.10; UX confirm of PR #50, NEW-A). `label` names the table it holds; the table carries its own `min-w-[…]`.
 */
export function ScrollTable({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  const { frame, overflow, region } = useScroller('inline', label, ', scrolls sideways');
  return (
    <div data-slot="scroll-table" {...frame} className="min-w-0 max-w-full">
      {overflow === 'overflows' ? (
        <p aria-hidden="true" data-state="scrolls-sideways" className="mb-1 text-xs text-muted-foreground">
          Scroll sideways for more columns.
        </p>
      ) : null}
      <div className="pw-scroll-frame">
        <div {...region} data-scroller="" className="relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
          {children}
        </div>
      </div>
    </div>
  );
}

const HEIGHTS = { md: 'max-h-96', lg: 'max-h-[32rem]' } as const;

/** Each tone's surface, and the same colour for the fades, which run from the box's own surface to transparent. */
const TONES = {
  muted: { frame: '[--pw-scroll-surface:var(--pw-bg-raised)]', box: 'bg-muted' },
  faint: { frame: '[--pw-scroll-surface:color-mix(in_srgb,var(--pw-bg-raised)_30%,var(--pw-bg))]', box: 'bg-muted/30' },
} as const;

/** The text wraps, so the box scrolls on the block axis only, never sideways; a page of a document reads at a relaxed leading. */
const TEXT = {
  pre: 'whitespace-pre-wrap wrap-anywhere font-mono text-xs',
  div: 'whitespace-pre-wrap wrap-anywhere font-mono text-xs leading-relaxed',
} as const;

/**
 * A fixed-height box of text that scrolls (docs/adr/0078; UX-011): release notes, the content checker's problems, a
 * record's JSON, a cited contract page. The same state as `ScrollTable` on the block axis: until measured, and while
 * its text runs past its height, a region named "<label>, scrolls" that the keyboard reaches and scrolls; a band at
 * the top or bottom fades the text that lies past that edge, inside the box's border. No caption: the text visibly
 * runs past the bottom border. `as` is a pre for commands, notes and JSON (the default) and a div for a page of a
 * document that holds highlighted quotes; `data-*` pass to the region.
 */
export function ScrollBox({
  label,
  height = 'md',
  tone = 'muted',
  as: Box = 'pre',
  children,
  ...data
}: {
  readonly label: string;
  readonly height?: keyof typeof HEIGHTS;
  readonly tone?: keyof typeof TONES;
  readonly as?: keyof typeof TEXT;
  readonly children: ReactNode;
} & Readonly<Record<`data-${string}`, string | undefined>>): ReactElement {
  const { frame, region } = useScroller('block', label, ', scrolls');
  return (
    <div data-slot="scroll-box" data-axis="block" {...frame} className="min-w-0 max-w-full">
      <div className={`pw-scroll-frame overflow-hidden rounded-md border ${TONES[tone].frame}`}>
        <Box {...region} data-scroller="" {...data} className={`${HEIGHTS[height]} overflow-auto ${TONES[tone].box} p-3 ${TEXT[Box]}`}>
          {children}
        </Box>
      </div>
    </div>
  );
}
