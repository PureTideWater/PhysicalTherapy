/** Stub for the tests-first commit: the types are final, the functions are not built yet. */

export type Overflow = 'unmeasured' | 'fits' | 'overflows';

export interface ScrollMeasure {
  readonly scrollSize: number;
  readonly clientSize: number;
  readonly offset: number;
}

export interface ScrollState {
  readonly overflow: Overflow;
  readonly start: boolean;
  readonly end: boolean;
}

export type RegionSuffix = ', scrolls sideways' | ', scrolls';

export interface RegionProps {
  readonly role?: 'region';
  readonly 'aria-label'?: string;
  readonly tabIndex?: 0;
}

export function scrollState(_measure: ScrollMeasure | null): ScrollState {
  throw new Error('scrollState is not built yet');
}

export function ownFocus(_event: { readonly target: unknown; readonly currentTarget: unknown }): boolean {
  throw new Error('ownFocus is not built yet');
}

export function regionProps(_state: ScrollState, _focused: boolean, _label: string, _suffix: RegionSuffix): RegionProps {
  throw new Error('regionProps is not built yet');
}

export function frameData(_state: ScrollState): Readonly<Record<`data-${string}`, string>> {
  throw new Error('frameData is not built yet');
}
