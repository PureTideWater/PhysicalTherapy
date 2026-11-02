import { AnalyzeDocumentCommand, GetDocumentTextDetectionCommand, StartDocumentTextDetectionCommand } from '@aws-sdk/client-textract';
import { describe, expect, it } from 'vitest';

import { TextractPageReader } from '../evidence/scan';
import { TEXTRACT_PAGE_SIZE, recordedTextractClient } from './recorded-textract';

// A recorded text detection as packages/synth writes one, written out by hand so its bytes carry what a codec must
// handle: escapes, a non-ASCII letter, members the service's schema does not have, and a LINE whose Text is null.
const RECORDING = `{
  "format": "tp-textract-recording/1",
  "synthetic": true,
  "note": "SYNTHETIC: a text detection written for this test.",
  "JobStatus": "SUCCEEDED",
  "DocumentMetadata": {"Pages": 2},
  "Blocks": [
    {"BlockType": "PAGE", "Id": "page-1", "Page": 1},
    {"BlockType": "LINE", "Id": "line-1", "Page": 1, "Text": "SYNTHETIC EXHIBIT \\"A\\" caf\\u00e9 \\\\ tab\\there", "Recorded": "not a Textract member"},
    {"BlockType": "WORD", "Id": "word-1", "Page": 1, "Text": "SYNTHETIC"},
    {"BlockType": "PAGE", "Id": "page-2", "Page": 2},
    {"BlockType": "LINE", "Id": "line-2", "Page": 2, "Text": "97110 $32.00 per unit"},
    {"BlockType": "LINE", "Id": "line-3", "Page": 2, "Text": null}
  ]
}`;
const bytes = (text: string) => new TextEncoder().encode(text);
const document = { bytes: new Uint8Array([1]), contentType: 'application/pdf' };
const staging = { stage: () => Promise.resolve({ bucket: 'synthetic-recording', name: 'recorded' }) };

describe('recordedTextractClient: a real TextractClient answering from a recording', () => {
  it("answers through the SDK's own deserializer, as the service's answers are read", async () => {
    const client = recordedTextractClient(bytes(RECORDING));
    const started = await client.send(new StartDocumentTextDetectionCommand({ DocumentLocation: { S3Object: { Bucket: 'synthetic-recording', Name: 'recorded' } } }));
    const result = await client.send(new GetDocumentTextDetectionCommand({ JobId: started.JobId }));
    // The SDK's response metadata, the recording's own members dropped, escapes decoded and a null Text left out.
    expect(result.$metadata.httpStatusCode).toBe(200);
    expect(Object.keys(result).sort()).toEqual(['$metadata', 'Blocks', 'DocumentMetadata', 'JobStatus']);
    expect(result.Blocks?.[1]).toEqual({ BlockType: 'LINE', Id: 'line-1', Page: 1, Text: 'SYNTHETIC EXHIBIT "A" café \\ tab\there' });
    expect(result.Blocks?.[5]).toEqual({ BlockType: 'LINE', Id: 'line-3', Page: 2 });
    const pages = await new TextractPageReader({ client, staging, pollMilliseconds: 0 }).pageTexts(document);
    expect(pages).toEqual(['SYNTHETIC EXHIBIT "A" café \\ tab\there', '97110 $32.00 per unit']);
  });

  it('pages a long result by NextToken, as Textract does, and the reader follows every page', async () => {
    const lines = Array.from({ length: 5 }, (_, index) => ({ BlockType: 'LINE', Page: index < 3 ? 1 : 2, Text: `SYNTHETIC line ${index + 1}` }));
    const client = recordedTextractClient(bytes(JSON.stringify({ JobStatus: 'SUCCEEDED', DocumentMetadata: { Pages: 2 }, Blocks: lines })), { pageSize: 2 });
    const tokens: (string | undefined)[] = [];
    client.middlewareStack.add(
      (next) => (args) => {
        const input = args.input as { readonly NextToken?: string; readonly JobId?: string };
        if (input.JobId !== undefined) {
          tokens.push(input.NextToken);
        }
        return next(args);
      },
      { step: 'initialize' },
    );
    expect(await new TextractPageReader({ client, staging, pollMilliseconds: 0 }).pageTexts(document)).toEqual(['SYNTHETIC line 1\nSYNTHETIC line 2\nSYNTHETIC line 3', 'SYNTHETIC line 4\nSYNTHETIC line 5']);
    expect(tokens).toEqual([undefined, 'synthetic-page-1', 'synthetic-page-2']);
    expect(TEXTRACT_PAGE_SIZE).toBe(1000);
  });

  it('answers only text detection, and only for the job it started', async () => {
    const client = recordedTextractClient(bytes(RECORDING));
    await expect(client.send(new AnalyzeDocumentCommand({ Document: { Bytes: new Uint8Array([1]) }, FeatureTypes: ['TABLES'] }))).rejects.toThrow('not a text-detection call');
    await expect(client.send(new GetDocumentTextDetectionCommand({ JobId: 'another-job' }))).rejects.toThrow('no recorded answer');
    await expect(client.send(new GetDocumentTextDetectionCommand({ JobId: 'synthetic-recorded-job', NextToken: 'synthetic-page-9' }))).rejects.toThrow('no recorded answer');
  });
});
