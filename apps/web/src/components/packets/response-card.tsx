import { CardDescription } from '@tp/ui';

import type { ResponseLetters } from '../../lib/packets/submissions';
import type { UploadGate } from '../../lib/routes/uploads';

/**
 * The description of "Log a payer response" (UX-007; docs/adr/0085, D3), rendered by the submissions page and by the
 * forms harness alike, so the browser test reads the words the page shows. It says where the response starts, by
 * whether this person can upload the payer's letter here now and whether a letter is on file, as the hint under the
 * Payer’s letter select does (response-letter.tsx), so the two never contradict each other. No hooks: it renders on
 * the server and in the browser.
 */

/** Whether any letter a response may carry is listed. */
export function letterOnFile(letters: ResponseLetters): boolean {
  return letters.unused.length > 0 || letters.unusedByOthers.length > 0 || letters.thisCase.length > 0 || letters.otherCases.length > 0;
}

const DENIAL_REOPENS = 'A denial with a reason can reopen the case for the next dispute level, within its window.';

/** The card's words: upload the letter here, or choose one on file; with neither possible, that nothing can be recorded yet. */
export function responseCardText(submittedOn: string, canUploadHere: boolean, onFile: boolean): string {
  const to = `To the submission of ${submittedOn}.`;
  if (canUploadHere) {
    const start = onFile
      ? 'Start with the payer’s letter: upload it here, or choose one already on file, and fill in what it says while it is scanned.'
      : 'Start with the payer’s letter: upload it here, and fill in what it says while it is scanned.';
    return `${to} ${start} ${DENIAL_REOPENS}`;
  }
  if (onFile) {
    return `${to} Choose the payer’s letter already on file, then fill in what it says; the note under Payer’s letter says why nothing can be uploaded here now. ${DENIAL_REOPENS}`;
  }
  return `${to} No payer’s letter is on file, and none can be uploaded here now, so no response can be recorded yet; the note under Payer’s letter says why.`;
}

export function ResponseCardDescription({
  submittedOn,
  upload,
  letters,
}: {
  readonly submittedOn: string;
  readonly upload: { readonly canUpload: boolean; readonly gate: UploadGate };
  readonly letters: ResponseLetters;
}) {
  const canUploadHere = upload.canUpload && upload.gate.open;
  const onFile = letterOnFile(letters);
  return (
    <CardDescription data-response-card="" data-can-upload-here={String(canUploadHere)} data-letter-on-file={String(onFile)}>
      {responseCardText(submittedOn, canUploadHere, onFile)}
    </CardDescription>
  );
}
