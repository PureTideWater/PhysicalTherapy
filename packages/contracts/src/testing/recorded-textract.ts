import { Readable } from 'node:stream';

import { TextractClient } from '@aws-sdk/client-textract';

/** The part of a signed request the recorded answer is chosen by. */
interface SignedRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

/** The most blocks one GetDocumentTextDetection answer carries (Textract's MaxResults); longer results page by NextToken. */
export const TEXTRACT_PAGE_SIZE = 1000;

export interface RecordedTextractOptions {
  /** Blocks per GetDocumentTextDetection answer (TEXTRACT_PAGE_SIZE by default). */
  readonly pageSize?: number;
}

const JOB_ID = 'synthetic-recorded-job';
const bodyText = (body: unknown): string => (typeof body === 'string' ? body : body instanceof Uint8Array ? new TextDecoder().decode(body) : '{}');
const nextToken = (page: number) => `synthetic-page-${page}`;

/**
 * A real TextractClient whose answers come from a recorded text detection (the tp-textract-recording/1 file
 * packages/synth writes) instead of the service. StartDocumentTextDetection starts a synthetic job, and each
 * GetDocumentTextDetection gets the recording's blocks in pages of at most `pageSize`, linked by NextToken as
 * Textract links them; a recording that fits one page is answered with its own bytes. Every answer is an
 * application/x-amz-json-1.1 response that the installed @aws-sdk/client-textract and @smithy/core deserialize
 * as they deserialize the service's, so a TextractPageReader over this client reads a recording the way the
 * deployed reader would read the same answer (docs/adr/0070: the evaluation's pages as read). Nothing is sent:
 * the request handler answers inside the process, under synthetic credentials. Synthetic data only.
 */
export function recordedTextractClient(recording: Uint8Array, options: RecordedTextractOptions = {}): TextractClient {
  const pageSize = options.pageSize ?? TEXTRACT_PAGE_SIZE;
  const bytes = Buffer.from(recording);
  const result = JSON.parse(bytes.toString('utf8')) as Record<string, unknown> & { readonly Blocks?: readonly unknown[] };
  const blocks = result.Blocks ?? [];
  const pages =
    blocks.length <= pageSize
      ? [bytes]
      : Array.from({ length: Math.ceil(blocks.length / pageSize) }, (_, page) => {
          const last = (page + 1) * pageSize >= blocks.length;
          return Buffer.from(JSON.stringify({ ...result, Blocks: blocks.slice(page * pageSize, (page + 1) * pageSize), ...(last ? {} : { NextToken: nextToken(page + 1) }) }));
        });
  const answer = (request: SignedRequest): Buffer => {
    const target = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'x-amz-target')?.[1];
    if (target === 'Textract.StartDocumentTextDetection') {
      return Buffer.from(JSON.stringify({ JobId: JOB_ID }));
    }
    if (target === 'Textract.GetDocumentTextDetection') {
      const input = JSON.parse(bodyText(request.body)) as { readonly JobId?: string; readonly NextToken?: string };
      const page = input.NextToken === undefined ? 0 : pages.findIndex((_, index) => nextToken(index) === input.NextToken);
      const body = input.JobId === JOB_ID ? pages[page] : undefined;
      if (body === undefined) {
        throw new Error(`recordedTextractClient: no recorded answer for job ${String(input.JobId)} and NextToken ${String(input.NextToken)}`);
      }
      return body;
    }
    throw new Error(`recordedTextractClient: ${String(target)} is not a text-detection call`);
  };
  // The client's request handler, in place of the network.
  const requestHandler = {
    metadata: { handlerProtocol: 'http/1.1' },
    handle: (request: SignedRequest) => Promise.resolve({ response: { statusCode: 200, headers: { 'content-type': 'application/x-amz-json-1.1' }, body: Readable.from([answer(request)]) } }),
    updateHttpClientConfig: () => undefined,
    httpHandlerConfigs: () => ({}),
    destroy: () => undefined,
  };
  return new TextractClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'AKIDSYNTHETIC0000000', secretAccessKey: 'synthetic-recorded-textract' },
    requestHandler,
    maxAttempts: 1,
  });
}
