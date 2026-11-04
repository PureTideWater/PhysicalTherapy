import type { Mismatch } from '@tp/packets/check';

import { type FigureAsRead, mismatchShown, mismatchText } from '../../lib/packets/view';

/** A figure as the check read it, at its place in the narrative (@tp/packets CheckedFigure). */
export interface PlacedFigure extends FigureAsRead {
  readonly start: number;
  readonly end: number;
}

/** The words' first letter in capitals, for an item with no sentence or figure before it. */
const capitalized = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * A verifier's mismatches as a list: the stored narrative's on the builder (rendered on the server) and the editor's
 * live check (in the browser), so both say a mismatch the same way. Each item names its sentence, then the figure,
 * placeholder or marker as written (mono), then what is wrong in a few words: for a figure the check read, what its
 * words give it and what the records hold it as (the UX review of 2026-10-28: plain words, short at a phone's width).
 * No hooks and no state.
 */
export function MismatchList({
  narrative,
  mismatches,
  figures,
  label,
}: {
  readonly narrative: string;
  readonly mismatches: readonly Mismatch[];
  /** The failing figures as read, by position; a mismatch with none is said by its kind. */
  readonly figures: readonly PlacedFigure[];
  readonly label: string;
}) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" aria-label={label}>
      {mismatches.map((mismatch) => {
        const figure = figures.find((item) => item.start === mismatch.start && item.end === mismatch.end) ?? null;
        const text = mismatchText(mismatch.code, mismatch.kind, figure);
        const shown = mismatchShown(mismatch.code, narrative.slice(mismatch.start, mismatch.end));
        const where = mismatch.sentence < 0 ? null : `Sentence ${String(mismatch.sentence + 1)}`;
        return (
          <li key={`${String(mismatch.start)}:${String(mismatch.end)}:${mismatch.code}`} data-mismatch={mismatch.code}>
            {shown === null ? (
              where === null ? (
                capitalized(text)
              ) : (
                `${where}: ${text}`
              )
            ) : (
              <>
                {where === null ? null : `${where}, `}
                <mark className="rounded bg-destructive/20 px-1 font-mono wrap-anywhere">{shown}</mark>: {text}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
