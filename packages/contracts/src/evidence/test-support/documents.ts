import { createDeflate } from 'node:zlib';

const MIB = 1024 * 1024;

/**
 * A SYNTHETIC one-page PDF whose content stream inflates from about a megabyte to `mib` MiB of spaces and then one
 * line of text: a decompression bomb for the page reader's memory bound. The stream is deflated a mebibyte at a time,
 * so building a 1 GiB bomb holds only its compressed bytes here.
 */
export async function deflateBombPdf(mib: number): Promise<Uint8Array> {
  const deflate = createDeflate({ level: 9 });
  const compressed: Buffer[] = [];
  deflate.on('data', (chunk: Buffer) => {
    compressed.push(chunk);
  });
  const done = new Promise<void>((resolve, reject) => {
    deflate.once('end', resolve);
    deflate.once('error', reject);
  });
  const spaces = Buffer.alloc(MIB, 0x20);
  for (let written = 0; written < mib; written += 1) {
    if (!deflate.write(spaces)) {
      await new Promise((resolve) => deflate.once('drain', resolve));
    }
  }
  deflate.end(Buffer.from('BT /F1 12 Tf 72 720 Td (SYNTHETIC CONTRACT PAGE) Tj ET\n'));
  await done;
  const stream = Buffer.concat(compressed);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk =
      body === null
        ? Buffer.concat([Buffer.from(`${String(index + 1)} 0 obj\n<< /Length ${String(stream.length)} /Filter /FlateDecode >>\nstream\n`), stream, Buffer.from('\nendstream\nendobj\n')])
        : Buffer.from(`${String(index + 1)} 0 obj\n${body}\nendobj\n`);
    parts.push(chunk);
    length += chunk.length;
  });
  parts.push(Buffer.from(`xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(length)}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

/** A SYNTHETIC fee-schedule line of a generated page. */
export function syntheticLine(page: number, line: number): string {
  return `97${String(line % 1000).padStart(3, '0')} SYNTHETIC FEE LINE ${String(page)}-${String(line)} UNITS 1 RATE $${String(line)}.00 PER UNIT`;
}
