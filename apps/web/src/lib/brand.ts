import { brandName } from '@paidwhole/brand/name';
import { palette, tagline } from '@paidwhole/brand/tokens';

/**
 * The brand's name and the few values the web app needs outside CSS (the manifest and the viewport's theme
 * color cannot read a CSS variable), all from @paidwhole/brand: no hex is written in apps/web.
 */
export const BRAND_NAME = brandName;
export const BRAND_TAGLINE = tagline;
export const BRAND_THEME_COLOR = palette.ink;
export const BRAND_BACKGROUND_COLOR = palette.white;
