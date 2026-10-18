import { type Block, GetDocumentTextDetectionCommand, StartDocumentTextDetectionCommand, TextractClient } from '@aws-sdk/client-textract';

/**
 * Text for scanned pages, which carry no text layer: an interface, with Amazon Textract behind it in
 * staging and production (PRD 15: everything on AWS under its business associate agreement). Text
 * PDFs never reach it; evidence resolution asks it only for a document whose pages pdf.js finds no
 * text on.
 */
export interface ScannedPageReader {
  /** Each page's text, in page order (index 0 is page 1). */
  pageTexts(document: { readonly bytes: Uint8Array; readonly contentType: string }): Promise<string[]>;
}

/** Where Textract can read the document: an S3 object under SSE-KMS that expires on its own (the caller's staging). */
export interface TextractStaging {
  stage(bytes: Uint8Array, contentType: string): Promise<{ readonly bucket: string; readonly name: string }>;
}

export class ScanReadError extends Error {
  override readonly name = 'ScanReadError';
}

export interface TextractPageReaderOptions {
  readonly client: Pick<TextractClient, 'send'>;
  readonly staging: TextractStaging;
  /** Between polls of the detection job (default 2 s); tests pass 0. */
  readonly pollMilliseconds?: number;
  /** Polls before giving up (default 150, five minutes at the default interval). */
  readonly maxPolls?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * Textract's asynchronous text detection (multi-page PDFs and images): starts a job on the staged
 * object, polls it, and returns its LINE blocks per page, each page's lines in reading order joined
 * by line breaks.
 */
export class TextractPageReader implements ScannedPageReader {
  constructor(private readonly options: TextractPageReaderOptions) {}

  async pageTexts(document: { readonly bytes: Uint8Array; readonly contentType: string }): Promise<string[]> {
    const { bucket, name } = await this.options.staging.stage(document.bytes, document.contentType);
    const started = await this.options.client.send(new StartDocumentTextDetectionCommand({ DocumentLocation: { S3Object: { Bucket: bucket, Name: name } } }));
    const jobId = started.JobId;
    if (jobId === undefined) {
      throw new ScanReadError('Textract started no text-detection job');
    }
    const sleep = this.options.sleep ?? wait;
    const maxPolls = this.options.maxPolls ?? 150;
    for (let poll = 0; poll < maxPolls; poll += 1) {
      const first = await this.options.client.send(new GetDocumentTextDetectionCommand({ JobId: jobId }));
      if (first.JobStatus === 'IN_PROGRESS') {
        await sleep(this.options.pollMilliseconds ?? 2000);
        continue;
      }
      if (first.JobStatus !== 'SUCCEEDED') {
        throw new ScanReadError(`Textract text detection ended ${String(first.JobStatus).toLowerCase()}`);
      }
      const blocks: Block[] = [...(first.Blocks ?? [])];
      let next = first.NextToken;
      while (next !== undefined) {
        const page = await this.options.client.send(new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: next }));
        blocks.push(...(page.Blocks ?? []));
        next = page.NextToken;
      }
      const pageCount = Math.max(first.DocumentMetadata?.Pages ?? 0, ...blocks.map((block) => block.Page ?? 0));
      const pages = Array.from({ length: pageCount }, () => [] as string[]);
      for (const block of blocks) {
        if (block.BlockType === 'LINE' && block.Text !== undefined && block.Page !== undefined && block.Page >= 1) {
          pages[block.Page - 1]?.push(block.Text);
        }
      }
      return pages.map((lines) => lines.join('\n'));
    }
    throw new ScanReadError('Textract text detection did not finish in time');
  }
}

/** The Textract calls the reader makes, for the task role's policy (infra/lib/constructs/application-role.ts). */
export const TEXTRACT_ACTIONS = ['textract:StartDocumentTextDetection', 'textract:GetDocumentTextDetection'] as const;

/**
 * The deployed reader: Textract in the task's own region (AWS_REGION, through the VPC's interface
 * endpoint), reading what the staging puts in S3.
 */
export function createTextractPageReader(staging: TextractStaging, options: { readonly client?: Pick<TextractClient, 'send'> } = {}): TextractPageReader {
  return new TextractPageReader({ client: options.client ?? new TextractClient({}), staging });
}
