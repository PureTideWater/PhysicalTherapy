/**
 * A ZIP code as a person types it (PR 6b, ADR 0064): five digits, or ZIP+4 as nine digits with or without the
 * hyphen (27601, 27601-1234, 276011234; a phone's digits-only keypad has no hyphen, as the correspondence address's
 * ZIP in @tp/packets takes it). Surrounding spaces are dropped; anything else is not a ZIP code. Whether Medicare needs
 * the ZIP+4 is the database's to say (locality_status()), never this parser's: a ZIP+4 given for a ZIP that does not
 * need one is still a ZIP code.
 */
export interface ZipCode {
  /** The five-digit ZIP. */
  readonly zip5: string;
  /** The four digits after the hyphen, or null when none were typed. */
  readonly plusFour: string | null;
}

const ZIP_CODE = /^(\d{5})(?:-?(\d{4}))?$/;

/** The ZIP code typed, or null when the text is not five digits or ZIP+4. */
export function parseZipCode(text: string): ZipCode | null {
  const match = ZIP_CODE.exec(text.trim());
  if (match === null) {
    return null;
  }
  return { zip5: match[1] as string, plusFour: match[2] ?? null };
}

/** A ZIP code as the screens show it: 27601, or 27601-1234. */
export function zipCodeText(zip5: string, plusFour: string | null): string {
  return plusFour === null ? zip5 : `${zip5}-${plusFour}`;
}

/** The message a form gives text that is not a ZIP code. */
export const ZIP_CODE_FORMAT = 'five digits, or ZIP+4 such as 27601-1234';
