import { conversionFactorParser } from './conversion-factor';
import { gpciParser } from './gpci';
import { localityParser } from './locality';
import { mpprParser } from './mppr';
import { ncciMueParser, ncciPtpParser } from './ncci';
import { pprrvuParser } from './pprrvu';
import type { ImportableType, RuleFileParser } from './types';
import { carcParser, claimStatusCodeParser, rarcParser } from './x12-code-list';

/** The parser for each record type that is loaded from a public file. */
export const PARSERS: Readonly<Record<ImportableType, RuleFileParser>> = {
  pfs_rvu: pprrvuParser,
  pfs_gpci: gpciParser,
  locality_map: localityParser,
  conversion_factor: conversionFactorParser,
  mppr_rate: mpprParser,
  ncci_ptp: ncciPtpParser,
  ncci_mue: ncciMueParser,
  carc: carcParser,
  rarc: rarcParser,
  claim_status_code: claimStatusCodeParser,
};

export { compareConversionFactorPasses, CONVERSION_FACTOR_HEADINGS } from './conversion-factor';
export { RuleImportError } from './delimited';
export { IMPORTABLE_TYPES, type ImportWindow, type ImportableType, type ParseOptions, type ParseOutcome, type ParsedRow, type RuleFileParser, isImportableType } from './types';
