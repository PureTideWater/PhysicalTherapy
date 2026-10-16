'use client';

import { Badge, Button, EmptyState, ErrorState, LoadingState } from '@tp/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { type Receipt, type ReceiptState, KIND_NAMES, formatBytes, receiptState, shortId, utcMinute } from '../../lib/uploads/receipt-labels';

/**
 * Receipts as the server keeps them (PRD 7, Uploads: "file receipts with status and reasons ... error
 * report download ... retry"), fetched from the receipts route and polled while any is in progress.
 * Everything shown comes from the server, so a refresh loses nothing (PRD 6, Cross-cutting).
 */

export interface ReceiptPage {
  readonly receipts: readonly Receipt[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

const POLL_MS = 3000;
/** Polling stops after this long; the page shows the receipts as they then stand. */
const POLL_FOR_MS = 10 * 60_000;

function badgeOf(state: ReceiptState): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state.held) {
    return 'destructive';
  }
  return state.settled ? 'default' : 'secondary';
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    throw new Error(`the server answered ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

export async function retryIntake(practiceId: string, documentId: string, csrfToken: string): Promise<void> {
  await json(`/p/${practiceId}/uploads/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestKey: crypto.randomUUID(), csrfToken, documentId }),
  });
}

/** One receipt's status cell: the stage, and what happened or why it is held. */
export function ReceiptStatus({ receipt }: { readonly receipt: Receipt }) {
  const state = receiptState(receipt);
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={badgeOf(state)} data-stage={state.stage}>
        {state.label}
      </Badge>
      <span className="text-xs text-muted-foreground">{state.detail}</span>
    </div>
  );
}

export function ReceiptList(props: {
  readonly practiceId: string;
  readonly parentId?: string;
  readonly canUpload: boolean;
  /** The session's CSRF token, for a retry (docs/adr/0053). */
  readonly csrfToken: string;
  readonly refreshKey?: number;
  readonly title: string;
}) {
  const { practiceId, parentId, canUpload, refreshKey } = props;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReceiptPage | undefined>();
  const [failed, setFailed] = useState(false);
  const [started] = useState(() => Date.now());
  /** Bumped to load the receipts again (a poll, a retry, "try again"). */
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({ page: String(page) });
    if (parentId !== undefined) {
      query.set('parent_id', parentId);
    }
    json<ReceiptPage>(`/p/${practiceId}/uploads/receipts?${query.toString()}`).then(
      (loaded) => {
        if (current) {
          setData(loaded);
          setFailed(false);
        }
      },
      () => {
        if (current) {
          setFailed(true);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [practiceId, parentId, page, refreshKey, version]);

  const unsettled = data?.receipts.some((receipt) => !receiptState(receipt).settled) ?? false;
  useEffect(() => {
    if (!unsettled || Date.now() - started > POLL_FOR_MS) {
      return undefined;
    }
    const timer = setTimeout(reload, POLL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [unsettled, data, reload, started]);

  if (failed && data === undefined) {
    return (
      <ErrorState
        title="The receipts could not be loaded"
        nextStep="Check your connection and try again. Uploads already sent are not lost."
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }
  if (data === undefined) {
    return <LoadingState label="Loading receipts" rows={4} />;
  }
  if (data.total === 0) {
    return (
      <EmptyState
        title={parentId === undefined ? 'No files uploaded yet' : 'No files in this zip'}
        nextStep={parentId === undefined ? 'Upload your first 835 files: drop single files, a batch, or a zip of them above.' : 'The zip held no files to take in.'}
      />
    );
  }
  return (
    <section aria-label={props.title} className="flex flex-col gap-3">
      {failed ? <p className="text-sm text-destructive">The latest refresh failed; showing the receipts as last loaded.</p> : null}
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Received</th>
            <th className="py-1 font-medium">Document</th>
            <th className="py-1 font-medium">Kind</th>
            <th className="py-1 font-medium">Size</th>
            <th className="py-1 font-medium">Status</th>
            <th className="py-1 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.receipts.map((receipt) => {
            const state = receiptState(receipt);
            return (
              <tr key={receipt.documentId} className="border-t align-top" data-document={receipt.documentId}>
                <td className="py-2 pr-3 whitespace-nowrap">{utcMinute(receipt.receivedAt)}</td>
                <td className="py-2 pr-3 font-mono text-xs">
                  <Link className="underline" href={`/p/${practiceId}/uploads/${receipt.documentId}`}>
                    {shortId(receipt.documentId)}
                  </Link>
                </td>
                <td className="py-2 pr-3">{receipt.entries === null ? KIND_NAMES[receipt.kind] : `zip of ${KIND_NAMES[receipt.kind]} files`}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{formatBytes(Number(receipt.sizeBytes))}</td>
                <td className="py-2 pr-3">
                  <ReceiptStatus receipt={receipt} />
                </td>
                <td className="py-2 whitespace-nowrap">
                  <div className="flex gap-2">
                    <a className="underline" href={`/p/${practiceId}/uploads/${receipt.documentId}/report`} download>
                      Report
                    </a>
                    {canUpload && state.retry === 'intake' && state.settled ? (
                      <Button variant="outline" size="sm" onClick={() => void retryIntake(practiceId, receipt.documentId, props.csrfToken).then(reload, reload)}>
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.pages > 1 ? (
        <nav aria-label="Receipt pages" className="flex items-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
            Newer
          </Button>
          <span>
            Page {data.page} of {data.pages} ({data.total} files)
          </span>
          <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>
            Older
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
