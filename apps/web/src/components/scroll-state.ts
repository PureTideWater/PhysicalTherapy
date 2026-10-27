/**
 * A scroller's state from what the browser measures (docs/adr/0078): whether its content fits or overflows, and past
 * which edge content lies; and from that state, the scroller's role, name and tab stop and the data attributes the
 * cue is drawn from. Pure, with no React and no DOM, so the unit project tests every decision in node and
 * `ScrollTable` and `ScrollBox` only wire it to the browser.
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
