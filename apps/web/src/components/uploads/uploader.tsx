'use client';

import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PermissionState } from '@tp/ui';
import { useRouter } from 'next/navigation';
import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { spreadsheetExportProblem } from '../../lib/uploads/csv-exports';
import { type Receipt, type ReportFrom, formatBytes, receiptState } from '../../lib/uploads/receipt-labels';
import { DownloadLinks } from '../download-link';
import { FormatUnconfirmedBadge } from './format-flag';
import { ReceiptList, type ReceiptPage, ReceiptStatus } from './receipts';

/**
 * The Uploads screen's drop zone and batch progress (PRD 5, J4; PRD 7, Uploads). The browser asks the
 * server for one upload URL per file, PUTs each file straight to it (S3, or the local receiver), and
 * reports each PUT complete; the server's receipts then take over. File names stay in this browser:
 * they are shown here while the batch uploads and never sent anywhere. Until every file of the batch is sent, leaving
 * the page (a reload, a typed address, closing the tab) asks first, since it would cut the uploads off; a receipt's
 * report downloads in place, so it never does (docs/adr/0079).
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
  readonly limits: { readonly maxFiles: number; readonly maxBytes: number; readonly contentTypes: readonly string[] };
  /** The kinds a person chooses between (contracts, exhibits, payer letters); 835s when absent. */
  readonly kinds?: readonly UploadKind[];
  readonly heading?: string;
  readonly description?: string;
  /** Who uploads, for the permission state. */
  readonly uploaders?: string;
  /** Whether the practice's receipts are listed below the drop zone. */
  readonly showReceipts?: boolean;
  /** The page the receipts are listed on, as their report links name it (?from=), so a refused report comes back there. */
  readonly reportFrom?: ReportFrom;
  /**
   * Said above the receipts: a refused report download the page arrived with (DownloadRefusal; docs/adr/0079), until a
   * report downloaded in place says its own outcome there instead (DownloadLinks).
   */
  readonly receiptsNotice?: ReactNode;
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

/** Whether a file of the batch is still being sent: asked for, uploading or being reported complete. */
export function stillSending(batch: readonly { readonly phase: Phase }[]): boolean {
  return batch.some((item) => item.phase === 'waiting' || item.phase === 'uploading' || item.phase === 'completing');
}

/**
 * While active, leaving the page asks first (the browser's own question, before it unloads): an upload in flight ends
 * with its page. A move inside the app keeps the page's script running, and the batch with it, so it never asks.
 */
function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome before 119 asks only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => {
      window.removeEventListener('beforeunload', ask);
    };
  }, [active]);
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

export function Uploader(props: UploaderProps) {
  const { practiceId, canUpload, gate, limits, kinds, csrfToken } = props;
  const router = useRouter();
  const [kind, setKind] = useState<UploadKind>(kinds?.[0] ?? { kind: 'x12_835', label: '835 remittance', contentTypes: limits.contentTypes });
  /** The format chosen for a kind that has formats (an ERA export); none until the person chooses. */
  const [formatId, setFormatId] = useState('');
  const format = kind.formats?.find((candidate) => candidate.id === formatId);
  const [batch, setBatch] = useState<BatchFile[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [receipts, setReceipts] = useState<ReadonlyMap<string, Receipt>>(new Map());
  const input = useRef<HTMLInputElement>(null);

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
      const found: string[] = [];
      if (chosen.length > limits.maxFiles) {
        found.push(`At most ${String(limits.maxFiles)} files at once; zip the rest and upload the zip.`);
      }
      // An ERA export is read with its system's layout, so the person says which system's export it is first.
      if (kind.formats !== undefined && format === undefined && chosen.length > 0) {
        found.push('Choose which system’s ERA export the files are, then choose the files again.');
      }
      chosen.forEach((file, index) => {
        // A spreadsheet chosen as a posting, EFT or ERA export: those are read as CSV only (docs/adr/0059 and 0060).
        const spreadsheet = spreadsheetExportProblem(kind.kind, file, index + 1);
        if (file.size === 0) {
          found.push(`File ${String(index + 1)} is empty.`);
        } else if (file.size > limits.maxBytes) {
          found.push(`File ${String(index + 1)} is larger than ${formatBytes(limits.maxBytes)}; split it or zip it.`);
        } else if (spreadsheet !== null) {
          found.push(spreadsheet);
        }
      });
      setProblems(found);
      if (found.length > 0 || chosen.length === 0) {
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

  useLeaveGuard(stillSending(batch));

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void start([...event.dataTransfer.files]);
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
            <div className="flex max-w-full flex-col gap-1">
              <label htmlFor="upload-kind" className="text-sm font-medium">
                Kind of document
              </label>
              <select
                id="upload-kind"
                value={kind.kind}
                onChange={(event) => {
                  setKind(kinds.find((candidate) => candidate.kind === event.target.value) ?? kind);
                  setFormatId('');
                }}
                className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
              >
                {kinds.map((candidate) => (
                  <option key={candidate.kind} value={candidate.kind}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {kind.formats === undefined ? null : (
            <div className="flex flex-col gap-1">
              <label htmlFor="upload-format" className="text-sm font-medium">
                Which system’s export
              </label>
              <select
                id="upload-format"
                value={formatId}
                required
                aria-describedby="upload-format-help"
                onChange={(event) => {
                  setFormatId(event.target.value);
                }}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Choose the system</option>
                {kind.formats.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
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
              void start([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <Button type="button" onClick={() => input.current?.click()}>
            Choose files
          </Button>
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
        <Card role="region" aria-label="This batch">
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
                    {/* The whole name, never cut to a hover title a phone cannot reach: it breaks only past 12rem. */}
                    <span className="min-w-48 wrap-anywhere">{item.file.name}</span>
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
          <DownloadLinks arrived={props.receiptsNotice}>
            <ReceiptList practiceId={practiceId} canUpload={canUpload} csrfToken={csrfToken} refreshKey={refreshKey} title="Receipts" reportFrom={props.reportFrom} />
          </DownloadLinks>
        </div>
      )}
    </div>
  );
}
