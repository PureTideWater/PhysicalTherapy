'use client';

import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PermissionState } from '@tp/ui';
import { useRouter } from 'next/navigation';
import { type DragEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { counted } from '../../lib/copy/words';
import { spreadsheetExportProblem } from '../../lib/uploads/csv-exports';
import { type Receipt, formatBytes, receiptState } from '../../lib/uploads/receipt-labels';
import { FormatUnconfirmedBadge } from './format-flag';
import { ReceiptList, type ReceiptPage, ReceiptStatus } from './receipts';

/**
 * The Uploads screen's drop zone and batch progress (PRD 5, J4; PRD 7, Uploads). The browser asks the
 * server for one upload URL per file, PUTs each file straight to it (S3, or the local receiver), and
 * reports each PUT complete; the server's receipts then take over. File names stay in this browser:
 * they are shown here while the batch uploads and never sent anywhere.
 *
 * Files dropped or chosen before the panel can file them (no kind chosen, or an ERA export with no system chosen) are
 * kept here and wait, listed by name, with nothing sent: the select that waits is marked invalid, described by what to
 * do and focused, and once the choice is made the files upload when the person presses Upload, never on the select's
 * change, since an arrow key on a closed select changes it once a press and a kind, once recorded, never changes
 * (docs/adr/0070, Part 3; the PR #75 review's UX-1, which closes the baseline's UX-049 for the ERA system too).
 */

interface UploadTarget {
  readonly method: 'PUT';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

type Phase = 'waiting' | 'uploading' | 'completing' | 'sent' | 'failed';

interface BatchFile {
  readonly key: string;
  readonly file: File;
  readonly documentId?: string;
  readonly target?: UploadTarget;
  readonly phase: Phase;
  readonly progress: number;
  readonly error?: string;
}

/** A system's export format a person chooses for an ERA export (source_document.format_id; docs/adr/0060). */
export interface UploadFormat {
  readonly id: string;
  /** "WebPT Billing ERA export". */
  readonly label: string;
  /** FORMAT_UNCONFIRMED: read with a placeholder layout, so its lines are flagged. */
  readonly unconfirmed: boolean;
}

/** A kind of document the drop zone takes, with the types it may be declared as. */
export interface UploadKind {
  readonly kind: string;
  readonly label: string;
  readonly contentTypes: readonly string[];
  /** For an ERA export: the formats to choose from; every file of the batch is sent with the one chosen. */
  readonly formats?: readonly UploadFormat[];
}

export interface UploaderProps {
  readonly practiceId: string;
  readonly canUpload: boolean;
  /** The session's CSRF token, sent with every request this form makes (docs/adr/0053). */
  readonly csrfToken: string;
  readonly roleNames: string;
  readonly gate: { readonly open: boolean; readonly reason: string | null };
  /**
   * The batch's limits. `contentTypes` is every type the drop zone takes: the 835's when `kinds` is absent, else every
   * offered kind's together. A file's declared type is always checked against the chosen kind's own types.
   */
  readonly limits: { readonly maxFiles: number; readonly maxBytes: number; readonly contentTypes: readonly string[] };
  /** The kinds a person chooses between (contracts, exhibits, payer letters); 835s when absent. */
  readonly kinds?: readonly UploadKind[];
  /**
   * The kind the panel starts with, when one of several offered is the screen's own (the Uploads page's 835, whose
   * heading names it; its other kind, an ERA export, needs a second, explicit choice of format). Absent, a panel that
   * offers more than one kind starts with none (startingKind).
   */
  readonly initialKind?: string;
  readonly heading?: string;
  readonly description?: string;
  /** Who uploads, for the permission state. */
  readonly uploaders?: string;
  /** Whether the practice's receipts are listed below the drop zone. */
  readonly showReceipts?: boolean;
}

/** The kind a panel without `kinds` takes: an 835, with the limits' types. */
const DEFAULT_835 = { kind: 'x12_835', label: '835 remittance' } as const;

/** The kind select's first, disabled option, shown while no kind is chosen. */
export const CHOOSE_KIND_PLACEHOLDER = 'Choose the kind of document';

/** The kind select's help, under it on every panel that offers kinds: a kind is the person's choice before the upload (UX-4). */
export const KIND_HELP = 'A document’s kind cannot be changed once it is uploaded.';

/** A file as the panel weighs it: what the browser says of it, and when it last changed (File's own fields). */
interface ChosenFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified: number;
}

/** What a panel waits for before its files can upload: the kind, or an ERA export's system (its format). */
export type Waiting = 'kind' | 'format';

/**
 * What the panel waits for: the kind while none is chosen (a panel of several kinds that names none: startingKind),
 * else, for a kind read with a system's layout (an ERA export), the system while none is chosen, else nothing. Each is
 * recorded with the document for good, and decides what reads it (a contract's terms may go to the model), so each is
 * the person's choice before the upload, never a default.
 */
export function waitingFor(kind: UploadKind | null, format: UploadFormat | undefined): Waiting | null {
  if (kind === null) {
    return 'kind';
  }
  return kind.formats !== undefined && format === undefined ? 'format' : null;
}

/** What the select that waits says, under it: the choice to make for the files waiting, then the upload. */
export function waitingText(waiting: Waiting, count: number): string {
  const these = count === 1 ? 'this file' : `these ${counted(count, 'file')}`;
  const them = count === 1 ? 'it' : 'them';
  return waiting === 'kind' ? `Choose the kind of document for ${these}, then upload ${them}.` : `Choose which system’s ERA export ${these} ${count === 1 ? 'is' : 'are'}, then upload ${them}.`;
}

/** One file, dropped or chosen again: the same name, size and last change. */
function fileKey(file: Pick<ChosenFile, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}\u0000${String(file.size)}\u0000${String(file.lastModified)}`;
}

/** The files waiting, with those chosen now that are not already among them, in the order they came. */
export function heldWith<T extends Pick<ChosenFile, 'name' | 'size' | 'lastModified'>>(held: readonly T[], chosen: readonly T[]): T[] {
  const seen = new Set(held.map(fileKey));
  const added = chosen.filter((file) => {
    const key = fileKey(file);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return [...held, ...added];
}

/** What a drop or a choice of files does: start the batch, keep the files waiting (focusing what they wait for), or refuse them. */
export type ChosenStep<T> =
  | { readonly step: 'start'; readonly files: readonly T[] }
  | { readonly step: 'hold'; readonly held: readonly T[]; readonly focus: Waiting | 'upload' | null }
  | { readonly step: 'refuse'; readonly problems: readonly string[] };

/**
 * What files dropped or chosen now do, beside those already waiting. A batch's own problems (batchProblems), or more
 * files waiting than a batch takes, refuse the files chosen now and keep what waits. Otherwise, on a panel with
 * nothing to wait for and nothing waiting, the batch starts at once, as it always has; else the files join those
 * waiting, a file dropped again held once (heldWith), and focus goes to what they wait for, or to Upload. A batch
 * never starts but by the person's Upload once a file waits.
 */
export function afterChoosing<T extends ChosenFile>(
  held: readonly T[],
  chosen: readonly T[],
  kind: UploadKind | null,
  format: UploadFormat | undefined,
  limits: { readonly maxFiles: number; readonly maxBytes: number },
): ChosenStep<T> {
  if (chosen.length === 0) {
    return { step: 'hold', held, focus: null };
  }
  const waiting = waitingFor(kind, format);
  const merged = heldWith(held, chosen);
  const found = batchProblems(chosen, kind, limits);
  if (merged.length > limits.maxFiles && chosen.length <= limits.maxFiles) {
    found.unshift(tooMany(limits));
  }
  if (found.length > 0) {
    return { step: 'refuse', problems: found };
  }
  if (waiting === null && held.length === 0) {
    return { step: 'start', files: chosen };
  }
  return { step: 'hold', held: merged, focus: waiting ?? 'upload' };
}

/** The refusal of more files than a batch takes. */
function tooMany(limits: { readonly maxFiles: number }): string {
  return `At most ${String(limits.maxFiles)} files at once; zip the rest and upload the zip.`;
}

/**
 * The kind a panel starts with: the one the page names, else the only one offered, else an 835 when none is offered.
 * A panel that offers more than one kind and names none starts with none, so the person chooses: a payer letter or an
 * EOB dropped onto the Contracts screen is never filed as a contract by default, which the contract terms reader would
 * then send to the model (docs/adr/0070, Part 3; design 5.9). A named kind that is not offered starts with none too.
 * A kind, once recorded on a document, never changes, so the choice is the person's before the upload, not after.
 */
export function startingKind(kinds: readonly UploadKind[] | undefined, initialKind: string | undefined, contentTypes: readonly string[]): UploadKind | null {
  if (kinds === undefined) {
    return { ...DEFAULT_835, contentTypes };
  }
  if (initialKind !== undefined) {
    return kinds.find((candidate) => candidate.kind === initialKind) ?? null;
  }
  return kinds.length === 1 ? (kinds[0] ?? null) : null;
}

/**
 * What stops a batch before the server is asked for anything, each in the uploader's words: too many files; and, file
 * by file by its place in the batch, an empty file, one too large, or a spreadsheet chosen as a CSV-only export
 * (docs/adr/0059 and 0060). Names no file: names stay in this browser. A choice still to make (the kind, an ERA
 * export's system) is no problem of the batch's: the files wait for it (waitingFor).
 */
export function batchProblems(
  chosen: readonly { readonly name: string; readonly type: string; readonly size: number }[],
  kind: UploadKind | null,
  limits: { readonly maxFiles: number; readonly maxBytes: number },
): string[] {
  const found: string[] = [];
  if (chosen.length > limits.maxFiles) {
    found.push(tooMany(limits));
  }
  chosen.forEach((file, index) => {
    // A spreadsheet chosen as a posting, EFT or ERA export: those are read as CSV only (docs/adr/0059 and 0060).
    const spreadsheet = kind === null ? null : spreadsheetExportProblem(kind.kind, file, index + 1);
    if (file.size === 0) {
      found.push(`File ${String(index + 1)} is empty.`);
    } else if (file.size > limits.maxBytes) {
      found.push(`File ${String(index + 1)} is larger than ${formatBytes(limits.maxBytes)}; split it or zip it.`);
    } else if (spreadsheet !== null) {
      found.push(spreadsheet);
    }
  });
  return found;
}

const ZIP_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);
const CONCURRENT_PUTS = 3;

/** The type a file is declared as: what the browser says when it is one an 835 may be, else generic. */
function declaredType(file: File, allowed: readonly string[]): string {
  if (ZIP_TYPES.has(file.type) || file.name.toLowerCase().endsWith('.zip')) {
    return 'application/zip';
  }
  return allowed.includes(file.type) ? file.type : 'application/octet-stream';
}

interface Refusal {
  readonly status?: string;
  readonly issues?: readonly { readonly field: string; readonly message: string }[];
  /** A suspended organization's reason (docs/adr/0050). */
  readonly reason?: string;
}

async function post<T>(path: string, csrfToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestKey: crypto.randomUUID(), csrfToken, ...body }),
  });
  const answer = (await response.json()) as T & Refusal;
  if (!response.ok) {
    const issue = answer.issues?.[0]?.message ?? (answer.status === 'suspended' && answer.reason !== undefined ? `Not started: ${answer.reason}.` : undefined);
    throw new Error(issue ?? (response.status === 403 ? 'Your role cannot upload files here.' : 'The server refused the request. Reload the page and try again.'));
  }
  return answer;
}

/** PUTs the file, reporting progress; a 409 or 412 means its bytes were already stored. */
function put(file: File, target: UploadTarget, csrfToken: string, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) {
      request.setRequestHeader(name, value);
    }
    // The local receiver is this server's own route and checks the session's CSRF token; a presigned S3 PUT
    // goes elsewhere and carries none.
    if (new URL(target.url, window.location.href).origin === window.location.origin) {
      request.setRequestHeader('x-csrf-token', csrfToken);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onload = () => {
      if ((request.status >= 200 && request.status < 300) || request.status === 409 || request.status === 412) {
        resolve();
      } else {
        reject(new Error('The upload was refused. Retry it.'));
      }
    };
    request.onerror = () => {
      reject(new Error('The upload was interrupted. Retry it.'));
    };
    request.send(file);
  });
}

/**
 * The kind select, its label, what it waits for and its help (UX-1, UX-4). While files wait for the kind, the select is
 * marked invalid and described first by what to do, the words under it as an alert, re-inserted at each attempt
 * (`attempt`) so a second drop of the same files is announced too; its help is read after them. The select's change
 * only sets the kind: nothing uploads on it.
 */
export function KindField({
  kinds,
  kind,
  startedUnchosen,
  problem,
  attempt,
  onChange,
  selectRef,
}: {
  readonly kinds: readonly UploadKind[];
  readonly kind: UploadKind | null;
  /** Whether the panel started with no kind: the select then leads with the disabled placeholder. */
  readonly startedUnchosen: boolean;
  /** What to do while files wait for the kind (waitingText), else null. */
  readonly problem: string | null;
  readonly attempt: number;
  readonly onChange: (kind: UploadKind) => void;
  readonly selectRef: RefObject<HTMLSelectElement | null>;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <label htmlFor="upload-kind" className="text-sm font-medium">
        Kind of document
      </label>
      <select
        ref={selectRef}
        id="upload-kind"
        value={kind?.kind ?? ''}
        required
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={problem === null ? 'upload-kind-help' : 'upload-kind-error upload-kind-help'}
        onChange={(event) => {
          const chosen = kinds.find((candidate) => candidate.kind === event.target.value);
          if (chosen !== undefined) {
            onChange(chosen);
          }
        }}
        className="h-9 max-w-full rounded-md border bg-background px-2 text-sm aria-invalid:border-destructive"
      >
        {startedUnchosen ? (
          <option value="" disabled>
            {CHOOSE_KIND_PLACEHOLDER}
          </option>
        ) : null}
        {kinds.map((candidate) => (
          <option key={candidate.kind} value={candidate.kind}>
            {candidate.label}
          </option>
        ))}
      </select>
      {problem === null ? null : (
        <p key={attempt} id="upload-kind-error" role="alert" className="max-w-prose text-xs text-destructive">
          {problem}
        </p>
      )}
      <p id="upload-kind-help" className="max-w-prose text-xs text-muted-foreground">
        {KIND_HELP}
      </p>
    </div>
  );
}

/**
 * The files waiting, by name (names stay in this browser), and what to do with them: Upload, once nothing waits for a
 * choice (`ready`), and Clear. Upload is the one way a waiting file is sent.
 */
export function HeldFiles({
  files,
  ready,
  onUpload,
  onClear,
  uploadRef,
}: {
  readonly files: readonly Pick<ChosenFile, 'name' | 'size' | 'lastModified'>[];
  readonly ready: boolean;
  readonly onUpload: () => void;
  readonly onClear: () => void;
  readonly uploadRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div role="group" aria-labelledby="upload-held-title" className="flex min-w-0 max-w-full flex-col gap-2">
      <p id="upload-held-title" className="text-sm font-medium">
        {`Waiting to upload: ${counted(files.length, 'file')}`}
      </p>
      <ul className="flex max-w-prose flex-col gap-1 break-all text-xs">
        {files.map((file) => (
          <li key={fileKey(file)}>{file.name}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {ready ? (
          <Button ref={uploadRef} type="button" onClick={onUpload}>
            {`Upload ${counted(files.length, 'file')}`}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

export function Uploader(props: UploaderProps) {
  const { practiceId, canUpload, gate, limits, kinds, csrfToken } = props;
  const router = useRouter();
  /** The kind chosen; none, on a panel of several kinds the page does not choose between, until the person chooses. */
  const [kind, setKind] = useState<UploadKind | null>(() => startingKind(kinds, props.initialKind, limits.contentTypes));
  /** Whether the panel started with no kind: its select then leads with the disabled placeholder. */
  const [startedUnchosen] = useState(kind === null);
  /** The format chosen for a kind that has formats (an ERA export); none until the person chooses. */
  const [formatId, setFormatId] = useState('');
  const format = kind?.formats?.find((candidate) => candidate.id === formatId);
  const [batch, setBatch] = useState<BatchFile[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  /** Files dropped or chosen that wait for a choice or for Upload: kept in this browser, nothing sent. */
  const [held, setHeld] = useState<readonly File[]>([]);
  /** Each drop or choice that leaves files waiting, so the words under the select are announced every time. */
  const [attempt, setAttempt] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [receipts, setReceipts] = useState<ReadonlyMap<string, Receipt>>(new Map());
  const input = useRef<HTMLInputElement>(null);
  const kindSelect = useRef<HTMLSelectElement>(null);
  const formatSelect = useRef<HTMLSelectElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const batchCard = useRef<HTMLDivElement>(null);
  /** Where focus goes once the next render is drawn: never left on a control that went away (WCAG 2.4.3). */
  const focusNext = useRef<Waiting | 'upload' | 'choose' | 'batch' | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) {
      return;
    }
    focusNext.current = null;
    const element = { kind: kindSelect, format: formatSelect, upload: uploadButton, choose: chooseButton, batch: batchCard }[target].current;
    element?.focus();
  });

  const update = useCallback((key: string, change: Partial<BatchFile>) => {
    setBatch((files) => files.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  /** PUT, then complete: one file of the batch. */
  const send = useCallback(
    async (item: BatchFile, documentId: string, target: UploadTarget) => {
      update(item.key, { phase: 'uploading', progress: 0, documentId, target });
      try {
        await put(item.file, target, csrfToken, (progress) => {
          update(item.key, { progress });
        });
        update(item.key, { phase: 'completing', progress: 1 });
        await post(`/p/${practiceId}/uploads/complete`, csrfToken, { documentId });
        update(item.key, { phase: 'sent' });
      } catch (error) {
        update(item.key, { phase: 'failed', error: (error as Error).message });
      }
      setRefreshKey((key) => key + 1);
    },
    [csrfToken, practiceId, update],
  );

  const start = useCallback(
    async (chosen: readonly File[]) => {
      const found = batchProblems(chosen, kind, limits);
      setProblems(found);
      if (found.length > 0 || chosen.length === 0 || waitingFor(kind, format) !== null || kind === null) {
        return;
      }
      const items: BatchFile[] = chosen.map((file) => ({ key: crypto.randomUUID(), file, phase: 'waiting', progress: 0 }));
      setBatch(items);
      let answer: { documents: { documentId: string; upload: UploadTarget }[] };
      try {
        answer = await post(`/p/${practiceId}/uploads/request`, csrfToken, {
          files: chosen.map((file) => ({ kind: kind.kind, contentType: declaredType(file, kind.contentTypes), sizeBytes: file.size, ...(format === undefined ? {} : { formatId: format.id }) })),
        });
      } catch (error) {
        setProblems([(error as Error).message]);
        setBatch([]);
        // A refusal keeps the files: they wait again, for Upload or Clear.
        setHeld((waitingNow) => heldWith(chosen, waitingNow));
        focusNext.current = 'upload';
        return;
      }
      const queue = items.map((item, index) => ({ item, document: answer.documents[index] }));
      const workers = Array.from({ length: CONCURRENT_PUTS }, async () => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          if (next.document !== undefined) {
            await send(next.item, next.document.documentId, next.document.upload);
          }
        }
      });
      await Promise.all(workers);
    },
    [csrfToken, format, kind, limits, practiceId, send],
  );

  const retry = useCallback(
    async (item: BatchFile) => {
      if (item.documentId === undefined) {
        return;
      }
      try {
        const answer = await post<{ upload?: UploadTarget }>(`/p/${practiceId}/uploads/retry`, csrfToken, { documentId: item.documentId });
        if (answer.upload !== undefined) {
          await send(item, item.documentId, answer.upload);
        } else {
          update(item.key, { phase: 'sent', error: undefined });
          setRefreshKey((key) => key + 1);
        }
      } catch (error) {
        update(item.key, { phase: 'failed', error: (error as Error).message });
      }
    },
    [csrfToken, practiceId, send, update],
  );

  // The batch's server receipts, while any of them is still in progress.
  const sentIds = batch.filter((item) => item.phase === 'sent' && item.documentId !== undefined).map((item) => item.documentId as string);
  const watched = sentIds.join(',');
  const pending = sentIds.some((id) => {
    const receipt = receipts.get(id);
    return receipt === undefined || !receiptState(receipt).settled;
  });
  // Once a batch of chosen kinds has settled, the page's own lists (documents to tag) are reloaded.
  const settledAll = kinds !== undefined && sentIds.length > 0 && !pending;
  useEffect(() => {
    if (settledAll) {
      router.refresh();
    }
  }, [router, settledAll]);
  useEffect(() => {
    if (!pending) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void fetch(`/p/${practiceId}/uploads/receipts?document_ids=${watched}`, { credentials: 'same-origin' })
        .then(async (response) => (response.ok ? ((await response.json()) as ReceiptPage) : undefined))
        .then((page) => {
          if (page !== undefined) {
            setReceipts(new Map(page.receipts.map((receipt) => [receipt.documentId, receipt])));
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [pending, practiceId, receipts, watched]);

  /** What the files waiting wait for, if anything (waitingFor). */
  const waiting = waitingFor(kind, format);

  /** A drop or a choice of files: started, kept waiting, or refused (afterChoosing). */
  const choose = (chosen: readonly File[]) => {
    const next = afterChoosing(held, chosen, kind, format, limits);
    if (next.step === 'start') {
      void start(next.files);
    } else if (next.step === 'refuse') {
      setProblems([...next.problems]);
    } else if (chosen.length > 0) {
      setProblems([]);
      setHeld(next.held);
      setAttempt((count) => count + 1);
      focusNext.current = next.focus;
    }
  };

  /** Upload: the files waiting, under the kind (and system) now chosen; a problem keeps them waiting. */
  const uploadHeld = () => {
    const found = batchProblems(held, kind, limits);
    if (found.length > 0 || waiting !== null) {
      setProblems(found);
      return;
    }
    const files = held;
    setHeld([]);
    focusNext.current = 'batch';
    void start(files);
  };

  const clearHeld = () => {
    setHeld([]);
    setProblems([]);
    focusNext.current = 'choose';
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    choose([...event.dataTransfer.files]);
  };

  const sent = batch.filter((item) => item.phase === 'sent').length;
  const failed = batch.filter((item) => item.phase === 'failed').length;
  const settled = sentIds.filter((id) => {
    const receipt = receipts.get(id);
    return receipt !== undefined && receiptState(receipt).settled;
  }).length;

  return (
    <div className="flex flex-col gap-6">
      {!canUpload ? (
        <PermissionState role={props.roleNames} cannot="upload files" nextStep={props.uploaders ?? 'Billing managers, analysts and firm principals upload; you can read the receipts below.'} />
      ) : !gate.open ? (
        <Alert data-state="disabled" role="note">
          <AlertTitle>Uploads are not open yet</AlertTitle>
          <AlertDescription>{gate.reason}</AlertDescription>
        </Alert>
      ) : (
        <section
          aria-label="Drop zone"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={onDrop}
          className={`flex flex-col items-start gap-3 rounded-xl border-2 border-dashed p-8 ${dragging ? 'border-primary bg-accent' : ''}`}
        >
          <h2 className="text-base font-semibold">{props.heading ?? 'Drop 835 files here'}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {props.description ?? `Single files, a batch of up to ${String(limits.maxFiles)}, or a zip of them, up to ${formatBytes(limits.maxBytes)} each.`} Each file is scanned for malware
            before anything reads it.
          </p>
          {kinds === undefined ? null : (
            <KindField
              kinds={kinds}
              kind={kind}
              startedUnchosen={startedUnchosen}
              problem={held.length > 0 && waiting === 'kind' ? waitingText('kind', held.length) : null}
              attempt={attempt}
              onChange={(chosen) => {
                setKind(chosen);
                setFormatId('');
                // What was said of the files waiting was said under the kind before; they are checked again on Upload.
                if (held.length > 0) {
                  setProblems([]);
                }
              }}
              selectRef={kindSelect}
            />
          )}
          {kind?.formats === undefined ? null : (
            <div className="flex min-w-0 max-w-full flex-col gap-1">
              <label htmlFor="upload-format" className="text-sm font-medium">
                Which system’s export
              </label>
              <select
                ref={formatSelect}
                id="upload-format"
                value={formatId}
                required
                aria-invalid={held.length > 0 && waiting === 'format' ? true : undefined}
                aria-describedby={held.length > 0 && waiting === 'format' ? 'upload-format-error upload-format-help' : 'upload-format-help'}
                onChange={(event) => {
                  setFormatId(event.target.value);
                  if (held.length > 0) {
                    setProblems([]);
                  }
                }}
                className="h-9 max-w-full rounded-md border bg-background px-2 text-sm aria-invalid:border-destructive"
              >
                <option value="">Choose the system</option>
                {kind.formats.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
              {held.length > 0 && waiting === 'format' ? (
                <p key={attempt} id="upload-format-error" role="alert" className="max-w-prose text-xs text-destructive">
                  {waitingText('format', held.length)}
                </p>
              ) : null}
              <p id="upload-format-help" className="max-w-prose text-xs text-muted-foreground">
                The practice-management system the ERA export came from. Each file of the batch is read with its layout; a CSV export only.
              </p>
              {format?.unconfirmed === true ? (
                <div className="flex max-w-prose flex-col gap-1 text-xs text-muted-foreground" role="note" aria-label="Format unconfirmed">
                  <FormatUnconfirmedBadge />
                  <span>
                    No description of this format has been received from its vendor yet, so PaidWhole reads it with a placeholder layout and flags its lines on the Coverage screen until the
                    format is confirmed.
                  </span>
                </div>
              ) : null}
            </div>
          )}
          <input
            ref={input}
            id="upload-files"
            type="file"
            multiple
            className="sr-only"
            aria-label="Choose files to upload"
            onChange={(event) => {
              choose([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <Button ref={chooseButton} type="button" variant={held.length > 0 ? 'outline' : 'default'} onClick={() => input.current?.click()}>
            Choose files
          </Button>
          {held.length === 0 ? null : <HeldFiles files={held} ready={waiting === null} onUpload={uploadHeld} onClear={clearHeld} uploadRef={uploadButton} />}
        </section>
      )}
      {problems.length === 0 ? null : (
        <Alert variant="destructive" data-state="error">
          <AlertTitle>Nothing was uploaded</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {batch.length === 0 ? null : (
        <Card ref={batchCard} tabIndex={-1} role="region" aria-label="This batch">
          <CardHeader>
            <CardTitle>This batch</CardTitle>
            <CardDescription role="status" aria-live="polite">
              {sent} of {batch.length} sent{failed > 0 ? `, ${String(failed)} failed` : ''}; {settled} of {sentIds.length} taken in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {batch.map((item) => {
                const receipt = item.documentId === undefined ? undefined : receipts.get(item.documentId);
                return (
                  <li key={item.key} className="flex flex-wrap items-start gap-3 text-sm" data-phase={item.phase}>
                    <span className="min-w-48 truncate" title={item.file.name}>
                      {item.file.name}
                    </span>
                    {receipt !== undefined ? (
                      <ReceiptStatus receipt={receipt} />
                    ) : item.phase === 'failed' ? (
                      <>
                        <Badge variant="destructive">Not sent</Badge>
                        <span className="text-xs text-muted-foreground">{item.error}</span>
                        {item.documentId === undefined ? null : (
                          <Button variant="outline" size="sm" onClick={() => void retry(item)}>
                            Retry
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary">{item.phase === 'uploading' ? `Uploading ${String(Math.round(item.progress * 100))}%` : item.phase === 'waiting' ? 'Waiting' : 'Received'}</Badge>
                        <progress className="h-2 w-40" max={1} value={item.progress} aria-label="Upload progress" />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      {props.showReceipts === false ? null : (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold tracking-display">Receipts</h2>
          <ReceiptList practiceId={practiceId} canUpload={canUpload} csrfToken={csrfToken} refreshKey={refreshKey} title="Receipts" />
        </div>
      )}
    </div>
  );
}
