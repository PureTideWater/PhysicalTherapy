import { markSvg } from '@paidwhole/brand/mark';

/**
 * The mark alone, for the empty and loading states (docs/brand/BRAND.md, section 7), at 40 px so it takes
 * the standard cut (the small cut is for 32 px and below): never animated, never a spinner (that would turn
 * the keystone back into a progress ring). It is markSvg() from @paidwhole/brand, the brand's own markup, so
 * the mark is never redrawn here; its colors are fill attributes reading the tokens, so it follows dark
 * mode, and it carries role="img" and the label "PaidWhole" as a lone mark does, unless it is `decorative`:
 * beside a heading that names the state, it is hidden from screen readers.
 */
export function StateMark({ size = 40, decorative = false }: { readonly size?: number; readonly decorative?: boolean }) {
  return <span data-slot="state-mark" className="inline-flex shrink-0" aria-hidden={decorative ? true : undefined} dangerouslySetInnerHTML={{ __html: markSvg({ size }) }} />;
}
