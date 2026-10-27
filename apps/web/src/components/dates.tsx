import { utc } from './format';

/**
 * A moment as `utc` writes it, the date and the time each kept whole: a narrow cell may break the line between
 * them, never inside either (ADR 0078 Decision 1: no date breaks). The text is `utc`'s, unchanged.
 */
export function UtcTime({ at }: { readonly at: Date | string | null | undefined }) {
  const text = utc(at);
  const space = text.indexOf(' ');
  if (space < 0) {
    return text;
  }
  return (
    <>
      <span className="whitespace-nowrap">{text.slice(0, space)}</span> <span className="whitespace-nowrap">{text.slice(space + 1)}</span>
    </>
  );
}

/**
 * Words with calendar dates in them ("2026-01-01 through 2026-12-31"), each date kept whole: a browser breaks a line
 * after a date's hyphen, so a narrow cell read "2026-04- / 05". The text is unchanged.
 */
export function WholeDates({ text }: { readonly text: string }) {
  return text.split(/(\d{4}-\d{2}-\d{2})/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={`${String(index)}-${part}`} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
