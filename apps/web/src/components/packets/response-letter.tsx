'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import type { ResponseDocument, ResponseLetters } from '../../lib/packets/submissions';
import { type Receipt, formatBytes } from '../../lib/uploads/receipt-labels';
import { SelectField } from '../field';
import { utc } from '../format';
import { type BatchReport, Uploader } from '../uploads/uploader';

/**
 * The payer's letter in "Log a payer response" (UX-007; docs/adr/0085, D3): the Payer’s letter select, a status line
 * under it, and the shared uploader for one payer letter, inside the response's form. The letter is uploaded first,
 * so it is scanned while the person types what it says.
 *
 * The field chooses only the letter its own upload stored (or, for a duplicate, the copy on file a response may
 * carry), once the list shows it: never "the newest letter", never over a letter the person chose, and never by moving
 * the focus. While the letter uploads or is scanned, or is on its way into the list, the empty select carries a custom
 * validity, so a press shows why in the browser's bubble and sends nothing. A stored letter the list does not show
 * yet is fetched by the field's own refresh, whose end it can see; if the letter is still not listed, the status
 * says to reload. A batch appearing, or the field's own choice, fires an `input` event from the select, so the form
 * counts as touched (a dropped file fires none) and is cleared with the batch for another person signed in. The
 * uploader's controls carry no name, so nothing of the upload is posted with the response.
 */

/** The letters a response may carry (responseDocuments()), in three groups, each newest first: the server's type. */
export type { ResponseLetters };

export interface ResponseLetterFieldProps {
  readonly practiceId: string;
  /** The page's CSRF token (pageCsrfToken()), never the form's request key. */
  readonly csrfToken: string;
  readonly roleNames: string;
  readonly upload: { readonly canUpload: boolean; readonly gate: { readonly open: boolean; readonly reason: string | null }; readonly maxBytes: number };
  readonly letters: ResponseLetters;
}

/** What the status line says the field did with the letter the form uploaded; `none` before any, or when nothing was sent. */
type LetterStatus =
  | 'none'
  | 'scanning'
  | 'stored-listing'
  | 'stored-not-listed'
  | 'chosen'
  | 'stored-not-chosen'
  | 'duplicate-chosen'
  | 'duplicate-chosen-other-case'
  | 'duplicate-unusable'
  | 'held';

const LETTER_STATUS_TEXT: Readonly<Record<Exclude<LetterStatus, 'none'>, string>> = {
  scanning: 'The letter is being uploaded and scanned. It is chosen here once it is scanned clean, and what you typed stays.',
  'stored-listing': 'The letter is scanned clean and stored, and is being added to the list.',
  'stored-not-listed': 'The letter is stored, but the list could not show it. Reload the page, then choose it in the list; a reload clears what you typed.',
  chosen: 'The letter you uploaded is chosen.',
  'stored-not-chosen':
    'The letter you uploaded is stored and marked “uploaded here” in the list. Choose it if it is this response’s letter; until a response names it, it is listed among the contract documents to tag.',
  'duplicate-chosen': 'That file was already on file, so the copy on file is chosen.',
  'duplicate-chosen-other-case':
    'That file was already on file as the letter of another case’s response, so that copy is chosen. Check that it answers this case too, or choose another letter.',
  'duplicate-unusable':
    'This file was uploaded before, as another kind of document or as a contract’s document, so it cannot be this response’s letter. Upload the letter saved another way, such as the payer’s portal page saved as a PDF.',
  held: 'The letter was held at intake, so it is not chosen; its line under This batch says why.',
};

/** The browser's bubble on a press while the select is empty and the letter is not chosen yet. */
const SCANNING_BUBBLE = 'The payer’s letter is still being uploaded and scanned; it is chosen here once it is scanned clean.';
const LISTING_BUBBLE = 'The payer’s letter is being added to the list; it is chosen here in a moment.';

/** The hint under the select: by whether a letter is on file, and whether this person can upload one here now. */
function letterHint(onFile: boolean, canUploadHere: boolean): string {
  if (canUploadHere) {
    return onFile
      ? 'Upload the payer’s letter here, or choose one already on file; a letter uploaded here is chosen once it is scanned clean.'
      : 'Upload the payer’s letter here; it is chosen once it is scanned clean.';
  }
  return onFile
    ? 'Choose the payer’s letter already on file; the note below says why nothing can be uploaded here.'
    : 'No payer’s letter is on file yet, and it cannot be uploaded here now; the note below says why.';
}

const KIND_TEXT: Readonly<Record<string, string>> = { payer_letter: 'Payer letter', other: 'Other document' };

const GROUPS = [
  ['unused', 'Letters no response names yet'],
  ['thisCase', 'Letters of this case’s earlier responses'],
  ['otherCases', 'Letters of other cases’ responses'],
] as const;

const STATUS_ID = 'response-letter-status';
const NO_BATCH: BatchReport = { size: 0, inFlight: false, settled: [] };

/** The one kind the form uploads: a payer letter, whose bytes intake takes as a PDF only. */
const LETTER_TYPES = ['application/pdf'];
const LETTER_KINDS = [{ kind: 'payer_letter', label: 'Payer letter', contentTypes: LETTER_TYPES }];
const ONE_LETTER = { refusal: 'Choose one PDF: the payer’s letter itself, not a zip or another kind of file.' };

/**
 * One letter's option: its kind, when it was uploaded and its SHA-256's prefix, a run of its own so the line under the
 * select sets it in Plex Mono, as the page sets every SHA-256; the letter this form uploaded ends "(uploaded here)".
 */
function letterOption(document: ResponseDocument, uploadedHere: boolean) {
  return {
    value: document.id,
    label: [
      { text: `${KIND_TEXT[document.kind] ?? document.kind}, uploaded ${utc(document.uploadedAt)}${document.sha256 === null ? '' : ', SHA-256 '}` },
      ...(document.sha256 === null ? [] : [{ text: `${document.sha256.slice(0, 12)}…`, mono: true }]),
      ...(uploadedHere ? [{ text: ' (uploaded here)' }] : []),
    ],
  };
}

/** The letter the batch's settled receipt offers: a stored upload's own, or a duplicate's original; null for any other. */
function offeredLetter(receipt: Receipt | undefined): string | null {
  if (receipt?.status === 'stored') {
    return receipt.documentId;
  }
  return receipt?.status === 'duplicate' ? (receipt.duplicateOf?.documentId ?? null) : null;
}

/**
 * What the status line says (design 2.5.2), from the batch, where its letter is listed, the select's value, and whether
 * the field's refresh for a stored letter not listed has ended.
 */
function letterStatus(parts: {
  readonly batch: BatchReport;
  readonly groupOf: (id: string) => keyof ResponseLetters | null;
  readonly chosen: string;
  /** Whether the field's refresh for the batch's stored letter has ended. */
  readonly listingEnded: boolean;
}): LetterStatus {
  const { batch, groupOf, chosen } = parts;
  if (batch.size === 0) {
    return 'none';
  }
  if (batch.inFlight) {
    return 'scanning';
  }
  // A single file: its receipt, once settled; none when it was not sent (the batch row offers Retry).
  const receipt = batch.settled.at(-1);
  if (receipt === undefined) {
    return 'none';
  }
  const letter = offeredLetter(receipt);
  if (receipt.status === 'stored' && letter !== null) {
    if (groupOf(letter) === null) {
      return parts.listingEnded ? 'stored-not-listed' : 'stored-listing';
    }
    return chosen === letter ? 'chosen' : 'stored-not-chosen';
  }
  if (receipt.status === 'duplicate') {
    const group = letter === null ? null : groupOf(letter);
    if (group === null) {
      return 'duplicate-unusable';
    }
    // The person chose another letter while it was scanned: the field chose nothing, and the batch row says it is a duplicate.
    if (chosen !== letter) {
      return 'none';
    }
    return group === 'otherCases' ? 'duplicate-chosen-other-case' : 'duplicate-chosen';
  }
  return 'held';
}

export function ResponseLetterField({ practiceId, csrfToken, roleNames, upload, letters }: ResponseLetterFieldProps) {
  const router = useRouter();
  const select = useRef<HTMLSelectElement>(null);
  const [batch, setBatch] = useState<BatchReport>(NO_BATCH);
  /** The select's value. */
  const [chosen, setChosen] = useState('');
  /** The letter the field chose itself, while the select still holds it; null once the person chooses. */
  const [auto, setAuto] = useState<string | null>(null);
  /** The receipt whose letter the field has already offered to choose, so a person who chooses otherwise is not overruled. */
  const [handled, setHandled] = useState<string | null>(null);
  /** The letters this form uploaded and the list shows, marked "(uploaded here)". */
  const [uploadedHere, setUploadedHere] = useState<ReadonlySet<string>>(new Set());
  /** The stored letter the field's own refresh asked the list for: set when that refresh commits. */
  const [refreshedFor, setRefreshedFor] = useState<string | null>(null);
  const [listing, startListing] = useTransition();
  const sawBatch = useRef(false);

  const groupOf = (id: string): keyof ResponseLetters | null => GROUPS.find(([group]) => letters[group].some((document) => document.id === id))?.[0] ?? null;
  // A letter the list no longer shows (tagged in another tab, say) is no choice: the select falls to its first option.
  const value = chosen !== '' && groupOf(chosen) === null ? '' : chosen;
  const receipt = batch.settled.at(-1);
  const offered = offeredLetter(receipt);
  const waitingFor = receipt?.status === 'stored' && offered !== null && groupOf(offered) === null ? offered : null;
  const status = letterStatus({ batch, groupOf, chosen: value, listingEnded: waitingFor !== null && refreshedFor === waitingFor && !listing });

  // The batch's letter, once the list shows it: chosen when the select is empty or holds the field's own earlier
  // choice, once per receipt. Adjusted while rendering, as React's guidance has it for state that follows props.
  if (receipt !== undefined && offered !== null && handled !== receipt.documentId && groupOf(offered) !== null) {
    setHandled(receipt.documentId);
    if (receipt.status === 'stored') {
      setUploadedHere(new Set([...uploadedHere, offered]));
    }
    if (value === '' || value === auto) {
      setChosen(offered);
      setAuto(offered);
    }
  }

  const follow = useCallback((report: BatchReport) => {
    setBatch(report);
    // A batch appearing marks the form touched, as typing does: a dropped file fires no input event of its own.
    if (report.size > 0 && !sawBatch.current) {
      select.current?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    sawBatch.current = report.size > 0;
  }, []);

  // The field's own choice marks the form touched too. React's onChange on a select listens to `change`, so this
  // `input` event reaches only the form's listener.
  useEffect(() => {
    if (auto !== null) {
      select.current?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, [auto]);

  // A stored letter the list does not show yet: read the page again, in a transition whose end the field sees (the
  // uploader's own refresh is a one-off no caller can follow).
  useEffect(() => {
    if (waitingFor === null || refreshedFor === waitingFor) {
      return;
    }
    startListing(() => {
      setRefreshedFor(waitingFor);
      router.refresh();
    });
  }, [waitingFor, refreshedFor, router]);

  // While the select is empty and the letter is on its way, a press says why rather than "Select an item in the list".
  useEffect(() => {
    select.current?.setCustomValidity(value !== '' ? '' : status === 'scanning' ? SCANNING_BUBBLE : status === 'stored-listing' ? LISTING_BUBBLE : '');
  }, [value, status]);

  const canUploadHere = upload.canUpload && upload.gate.open;
  const onFile = GROUPS.some(([group]) => letters[group].length > 0);
  const groups = GROUPS.filter(([group]) => letters[group].length > 0).map(([group, words]) => ({
    group: words,
    options: letters[group].map((document) => letterOption(document, uploadedHere.has(document.id))),
  }));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SelectField
        ref={select}
        id="response-document"
        label="Payer’s letter"
        name="documentId"
        required
        showChosen
        value={value}
        onChange={(event) => {
          setChosen(event.target.value);
          setAuto(null);
        }}
        options={[{ value: '', label: 'Choose the payer’s letter' }, ...groups]}
        hint={letterHint(onFile, canUploadHere)}
        describedBy={STATUS_ID}
      />
      {/* A polite live region present from the first render, so each change is announced once. */}
      <p id={STATUS_ID} role="status" data-letter-status={status} className="text-sm">
        {status === 'none' ? '' : LETTER_STATUS_TEXT[status]}
      </p>
      <Uploader
        practiceId={practiceId}
        csrfToken={csrfToken}
        roleNames={roleNames}
        canUpload={upload.canUpload}
        gate={upload.gate}
        limits={{ maxFiles: 1, maxBytes: upload.maxBytes, contentTypes: LETTER_TYPES }}
        kinds={LETTER_KINDS}
        single={ONE_LETTER}
        onBatchChange={follow}
        headingLevel={3}
        heading="Upload the payer’s letter"
        description={`One PDF, up to ${formatBytes(upload.maxBytes)}.`}
        uploaders="Billing managers, analysts and firm principals upload files; a letter already on file can still be chosen above."
        showReceipts={false}
      />
    </div>
  );
}
