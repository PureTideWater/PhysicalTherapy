import { brandName } from '@paidwhole/brand/name';
import { descriptor, independenceClaim, palette } from '@paidwhole/brand/tokens';

/**
 * The brand's name, its words (Change Order 001, CO-11) and the few values the web app needs outside CSS (the
 * manifest and the viewport's theme color cannot read a CSS variable), all from @paidwhole/brand: no hex and no
 * copy of the brand's words is written in apps/web.
 */
export const BRAND_NAME = brandName;
/** The descriptor: the page metadata, the manifest and the request-audit lede (decision D11). */
export const BRAND_DESCRIPTOR = descriptor;
/** The independence claim as a sentence: the request-audit page (decision D11; the audit report's cover prints it too). */
export const BRAND_INDEPENDENCE = `${brandName} is ${independenceClaim}.`;
export const BRAND_THEME_COLOR = palette.ink;
export const BRAND_BACKGROUND_COLOR = palette.white;
