import { EmptyState, cn } from '@tp/ui';
import { STAGE_LABELS } from '@tp/triage';
import Link from 'next/link';

import { counted } from '../../lib/copy/words';
import type { Dashboard, Headline } from '../../lib/dashboard/queries';
import { NO_BAA } from '../../lib/uploads/gate';
import { WholeDates } from '../dates';
import { quarter, utcDate } from '../format';
import { PAYER_APPROVED_HOME_NOTE, recoveredCashWords, recoveredLabel } from '../reconciliation/display';
import { Money } from '../remittances/display';
import { outOfFigureWords } from '../triage/display';

/**
 * The practice home's headline and its empty state (PRD 7, Practice dashboard; PRD 12, What a customer sees as the
 * headline; docs/adr/0082), apart from the page so a unit test renders them (test matrix HOM-02, HOM-03).
 *
 * The three tiles: Actionable is what the packets ask for, counted with its own lines through the one actionable
 * predicate, and naming the lines of the cases still being worked that it leaves out and why; Payer approved says
 * which stage at the proof level counts it as recovered; Recovered carries both of its periods, to date since its
 * first counted entry and this quarter, from the ledger's entries at the proof level only.
 */

/**
 * The dashboard's tiles (docs/brand/BRAND.md, section 7): label in Slate at 12 px, value in Plex Mono 500,
 * note in Slate; a tile is a link to the screen its figure comes from, in the foreground color.
 */
const TILE = 'flex flex-col gap-1 rounded-lg border bg-card p-4 text-fg no-underline hover:bg-accent hover:text-fg';
const TILE_LABEL = 'block text-xs font-medium text-fg-muted';
const TILE_VALUE = 'block text-2xl font-medium';
const TILE_NOTE = 'block text-xs text-fg-muted';

/** What the Recovered tile's period says before its first counted entry, at each proof level. */
const NOTHING_YET: Readonly<Record<Headline['proofLevel'], string>> = {
  posted: 'nothing posted yet',
  deposited: 'nothing deposited yet',
};

/** The Actionable tile's note: its lines counted, then the worked cases' lines out of the figure, only when there are any. */
export function actionableNote(actionable: Headline['actionable']): string {
  const out = outOfFigureWords(actionable.outOfFigure.movedOn, actionable.outOfFigure.stale);
  return `what the packets ask for: ${counted(actionable.lines, 'line')} in cases still being worked${out === '' ? '' : `; ${out}`}`;
}

/** The Recovered tile's period: "to date, since 2026-06-09", or "to date, nothing deposited yet" before the first entry. */
export function recoveredPeriodWords(headline: Pick<Headline, 'recoveredSince' | 'proofLevel'>): string {
  return `to date, ${headline.recoveredSince === null ? NOTHING_YET[headline.proofLevel] : `since ${utcDate(headline.recoveredSince)}`}`;
}

/** The headline's three tiles, each its own stage and none added to another; each opens the screen it comes from. */
export function HeadlineTiles({ practiceId, headline, recoveredQuarter }: { readonly practiceId: string; readonly headline: Headline; readonly recoveredQuarter: Dashboard['recoveredQuarter'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" data-slot="tile-row">
      <Link href={`/p/${practiceId}/cases`} className={TILE} data-figure="actionable">
        <span className={TILE_LABEL}>{STAGE_LABELS.actionable}</span>
        <span className={TILE_VALUE}>
          <Money value={headline.actionable.cents} />
        </span>
        <span className={TILE_NOTE} data-note="actionable">
          {actionableNote(headline.actionable)}
        </span>
      </Link>
      <Link href={`/p/${practiceId}/reconciliation`} className={TILE} data-figure="payer-approved">
        <span className={TILE_LABEL}>{STAGE_LABELS.payer_approved}</span>
        <span className={TILE_VALUE}>
          <Money value={headline.payerApprovedCents} />
        </span>
        <span className={TILE_NOTE}>{PAYER_APPROVED_HOME_NOTE[headline.proofLevel]}</span>
      </Link>
      <Link href={`/p/${practiceId}/reconciliation`} className={cn(TILE, 'border-border-strong')} data-figure="recovered-total">
        <span className={TILE_LABEL}>{recoveredLabel(headline.proofLevel)}</span>
        <span className={TILE_VALUE} data-figure="recovered-to-date">
          <Money value={headline.recoveredCents} />
        </span>
        <span className={TILE_NOTE} data-note="recovered">
          <WholeDates text={`${recoveredPeriodWords(headline)}: ${recoveredCashWords(headline.proofLevel)}`} />
        </span>
        <span className={TILE_NOTE} data-figure="recovered-quarter">
          This quarter ({quarter(recoveredQuarter.quarter)}): <Money value={recoveredQuarter.cents} />
        </span>
      </Link>
    </div>
  );
}

/** Whether a practice may upload now, as Uploads decides it: its BAA on file (practice_baa_on_file()), then its organization not suspended. */
export type UploadGate = 'open' | 'no_baa' | 'paused';

export function uploadGate(uploads: Dashboard['uploads'], suspended: boolean): UploadGate {
  return !uploads.baaOnFile ? 'no_baa' : suspended ? 'paused' : 'open';
}

/**
 * The home before its first file (UX-140): the gate Uploads itself uses, in its words. Open: the upload sentence and
 * Go to Uploads. No BAA: the BAA sentence Uploads shows, and the agreement chain for a role that may act on it
 * (`agreements`), never Uploads. Paused: the suspension named above it, and no link.
 */
export function FirstUpload({ practiceId, gate, agreements }: { readonly practiceId: string; readonly gate: UploadGate; readonly agreements: boolean }) {
  switch (gate) {
    case 'open':
      return (
        <EmptyState
          mark
          title="Upload your first 835 files"
          nextStep="Each file’s receipt follows it from received to loaded, and this page counts what it finds."
          action={
            <Link className="text-sm underline" href={`/p/${practiceId}/uploads`}>
              Go to Uploads
            </Link>
          }
        />
      );
    case 'no_baa':
      return agreements ? (
        <EmptyState
          mark
          title="Waiting for the business associate agreement"
          nextStep={NO_BAA}
          action={
            <Link className="text-sm underline" href={`/p/${practiceId}/settings/agreements`}>
              See the agreement chain
            </Link>
          }
        />
      ) : (
        <EmptyState mark title="Waiting for the business associate agreement" nextStep={NO_BAA} />
      );
    case 'paused':
      return <EmptyState mark title="Uploads are paused" nextStep="They start again once the suspension above is resolved." />;
  }
}
