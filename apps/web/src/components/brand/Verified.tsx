import { badgeText, sealLabel, verifiedDefinition } from '@paidwhole/brand/tokens';
import type { ReconciledToCash } from '@tp/ledger';

import { PaidWholeMark } from './Mark';

/**
 * The "Verified" marks are claims, and the code enforces the claim (docs/adr/0057).
 *
 * Both components take `reconciledToCash`, which the caller must derive from the ledger with
 * reportReconciliation() (@tp/ledger): every line in the report's recovered total has a `posted` or
 * `deposited` entry net of recoupment and reversal. Its type is `false | ReconciledToCash`, a `true` only
 * that function returns, so a literal `true` does not typecheck. Flagged, validated or actionable amounts
 * alone never earn the mark. When the fact is false the component renders nothing and, outside
 * production, logs that it refused, so a report template cannot show the mark by accident. The
 * definition line renders with the seal so the reader is told what "verified" means on the same page.
 * Sizes are classes, not style attributes, which the pages' Content-Security-Policy refuses.
 */

type Gate = {
  /** True only when the report's recovered total reconciles to posted or deposited remittance. */
  reconciledToCash: false | ReconciledToCash;
  /** Where the fact came from, for the audit trail (for example "ledger.reportReconciliation(roi_statement <id>)"). */
  source: string;
};

function refuse(errorCode: 'VERIFIED_BADGE_NOT_EARNED' | 'VERIFIED_SEAL_NOT_EARNED'): null {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Verified mark not rendered: reconciledToCash is false', { error_code: errorCode });
  }
  return null;
}

type BadgeProps = Gate & {
  size?: 'sm' | 'md';
  reversed?: boolean;
  className?: string;
};

const BADGE = {
  sm: { mark: 18, box: 'h-8 gap-2 pl-2 pr-3 border text-[13px]' },
  md: { mark: 28, box: 'h-12 gap-3 pl-[10px] pr-5 border-[1.5px] text-[20px]' },
} as const;

/** Pill badge for billing-firm and white-label report footers: the mark and "Verified by PaidWhole". */
export function VerifiedBadge({ reconciledToCash, source, size = 'md', reversed = false, className }: BadgeProps) {
  if (!reconciledToCash) return refuse('VERIFIED_BADGE_NOT_EARNED');
  // The foreground token, so the pill turns white with the ground in dark mode (never a hex or a fixed Ink).
  const color = reversed ? 'border-white text-white' : 'border-fg text-fg';
  return (
    <span
      className={[`inline-flex items-center whitespace-nowrap rounded-pill font-display font-semibold tracking-[-0.01em] ${BADGE[size].box} ${color}`, className].filter(Boolean).join(' ')}
      title={verifiedDefinition}
      data-slot="verified-badge"
      data-source={source}
    >
      <PaidWholeMark size={BADGE[size].mark} variant={reversed ? 'reversed' : 'color'} decorative />
      {badgeText}
    </span>
  );
}

type SealProps = Gate & {
  /** Rendered size in px. 96 on a letter cover, 160 on a statement's first page. */
  size?: number;
  reversed?: boolean;
  /** Set false only when the definition already appears elsewhere on the same page. */
  withDefinition?: boolean;
  className?: string;
};

/** The seal for report covers and statements. Uses the outlined SVG so it prints identically everywhere. */
export function VerifiedSeal({ reconciledToCash, source, size = 96, reversed = false, withDefinition = true, className }: SealProps) {
  if (!reconciledToCash) return refuse('VERIFIED_SEAL_NOT_EARNED');
  const alt = sealLabel;
  return (
    <figure className={[`m-0 inline-flex flex-col items-center gap-2 ${size <= 220 ? 'max-w-[220px]' : 'max-w-none'}`, className].filter(Boolean).join(' ')} data-slot="verified-seal" data-source={source}>
      {/* Fixed-size outlined SVGs from /public; next/image would add a style attribute the CSP refuses. On a dark ground
          (the tokens' [data-theme="dark"] or .dark) the reversed seal shows instead of the Ink one; one is ever displayed. */}
      {reversed ? (
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img src="/brand/paidwhole-seal-reversed.svg" width={size} height={size} alt={alt} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img src="/brand/paidwhole-seal.svg" width={size} height={size} alt={alt} className="dark:hidden" data-seal="ink" />
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img src="/brand/paidwhole-seal-reversed.svg" width={size} height={size} alt={alt} className="hidden dark:block" data-seal="reversed" />
        </>
      )}
      {withDefinition ? <figcaption className={`text-center font-sans text-[11px] leading-[1.4] ${reversed ? 'text-white/78' : 'text-fg-muted'}`}>{verifiedDefinition}</figcaption> : null}
    </figure>
  );
}
