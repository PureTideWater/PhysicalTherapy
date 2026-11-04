import { EmptyState, cn } from '@tp/ui';
import { STAGE_LABELS } from '@tp/triage';
import Link from 'next/link';

import { FIRST_UPLOAD_HELD, type WorkPause } from '../../lib/billing/suspension-words';
import { counted } from '../../lib/copy/words';
import type { Dashboard, Headline } from '../../lib/dashboard/queries';
import { NO_BAA } from '../../lib/uploads/gate';
import { WholeDates } from '../dates';
import { quarter, utcDate } from '../format';
import { PAYER_APPROVED_HOME_NOTE, recoveredCashWords, recoveredLabel } from '../reconciliation/display';
import { Counted, Money } from '../remittances/display';
import { OutOfFigure, outOfFigureWords } from '../triage/display';

/**
 * The practice home's headline and its empty state (PRD 7, Practice dashboard; PRD 12, What a customer sees as the
 * headline; docs/adr/0082), apart from the page so a unit test renders them (test matrix HOM-02, HOM-03).
 *
 * The three tiles: Actionable is what the packets ask for, counted with its own lines through the one actionable
 * predicate, and naming the lines of the cases still being worked that it leaves out and why; Payer approved says it
 * is cumulative, never the patient's share, and which cash counts as recovered at the proof level; Recovered carries
 * both of its periods, to date since its first counted entry and this quarter, from the ledger's entries at the proof
 * level only.
 */

/**
 * The dashboard's tiles (docs/brand/BRAND.md, section 7): label in Slate at 12 px, value in Plex Mono 500,
 * note in Slate; a tile is a link to the screen its figure comes from, in the foreground color.
 */
const TILE = 'flex flex-col gap-1 rounded-lg border bg-card p-4 text-fg no-underline hover:bg-accent hover:text-fg';
const TILE_LABEL = 'block text-xs font-medium text-fg-muted';
const TILE_VALUE = 'block text-2xl font-medium';
const TILE_NOTE = 'block text-xs text-fg-muted';

/**
 * What the Recovered tile's period says before its first counted entry, at either proof level: no cash verb, since the
 * cash words follow it ("to date, none yet: cash posted, ..."; "nothing posted yet: cash posted" read as both).
 */
const NOTHING_YET = 'none yet';

/** The Actionable tile's note in words: its lines counted, then the worked cases' lines out of the figure, only when there are any. The text <ActionableNote/> renders, and a test's oracle. */
export function actionableNote(actionable: Headline['actionable']): string {
  const out = outOfFigureWords(actionable.outOfFigure.movedOn, actionable.outOfFigure.stale);
  return `what the packets ask for: ${counted(actionable.lines, 'line')} in cases still being worked${out === '' ? '' : `; ${out}`}`;
}

/** actionableNote's words with each count in the mono face (<Counted/>; docs/brand/BRAND.md: every unit count). */
export function ActionableNote({ actionable }: { readonly actionable: Headline['actionable'] }) {
  const { movedOn, stale } = actionable.outOfFigure;
  return (
    <>
      what the packets ask for: <Counted value={actionable.lines} one="line" /> in cases still being worked
      {movedOn > 0 || stale > 0 ? (
        <>
          ; <OutOfFigure movedOn={movedOn} stale={stale} />
        </>
      ) : null}
    </>
  );
}

/** The Recovered tile's period: "to date, since 2026-06-09", or "to date, none yet" before the first entry. */
export function recoveredPeriodWords(headline: Pick<Headline, 'recoveredSince'>): string {
  return `to date, ${headline.recoveredSince === null ? NOTHING_YET : `since ${utcDate(headline.recoveredSince)}`}`;
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
          <ActionableNote actionable={headline.actionable} />
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
          {/* The quarter key kept whole as WholeDates keeps a date (docs/adr/0078 Decision 1): at a tablet's width the note broke it at "2026-". */}
          This quarter (<span className="whitespace-nowrap">{quarter(recoveredQuarter.quarter)}</span>): <Money value={recoveredQuarter.cents} />
        </span>
      </Link>
    </div>
  );
}

/**
 * Whether the person may upload here now, as Uploads decides it: the BAA on file (practice_baa_on_file()), then no hold
 * on their uploads (docs/adr/0080): paused while it can lift, stopped by a closure (PR #104 review UX-SS01-3).
 */
export type UploadGate = 'open' | 'no_baa' | 'paused' | 'stopped';

export function uploadGate(uploads: Dashboard['uploads'], hold: WorkPause | null): UploadGate {
  return !uploads.baaOnFile ? 'no_baa' : hold === null ? 'open' : hold.restarts ? 'paused' : 'stopped';
}

/**
 * The home before its first file (UX-140): the gate Uploads itself uses, in its words. Open: the upload sentence and
 * Go to Uploads. No BAA: the BAA sentence Uploads shows, and the agreement chain for a role that may act on it
 * (`agreements`), never Uploads. Paused or stopped: the hold named above it, which lifts or, for a closure, does not
 * (uploadsHeld; BIL-09), and no link.
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
    case 'stopped':
      return <EmptyState mark title={FIRST_UPLOAD_HELD[gate].title} nextStep={FIRST_UPLOAD_HELD[gate].nextStep} />;
  }
}
