import { StatusChip } from '../status';

/**
 * The flag an ERA export's lines carry while its format is FORMAT_UNCONFIRMED (CO-03; docs/adr/0060): a text
 * label with an icon, never color alone, on the neutral tint, since an unconfirmed layout is not a payment
 * status (docs/brand/BRAND.md, section 4: status colors are for whole, short and unpriced data). The reason
 * beside it is the caller's (the Coverage screen's explanation, or the receipt's).
 */
export function FormatUnconfirmedBadge() {
  return (
    <StatusChip tone="neutral" data-flag="format-unconfirmed" className="gap-1">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 12 12" width="12" height="12" className="shrink-0">
        <path d="M6 1.25 11 10.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 4.6v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="6" cy="9" r="0.6" fill="currentColor" />
      </svg>
      Format unconfirmed
    </StatusChip>
  );
}
