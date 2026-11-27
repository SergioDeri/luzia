/**
 * Writes the small PDF fixtures used by the tests. The output is committed, so
 * this only needs re-running when the fixtures change:
 *
 *   node packages/core/test/support/make-fixture-pdfs.ts
 *
 * The PDFs are written by hand (no PDF library), byte for byte deterministic.
 */
import { writeFileSync } from 'node:fs';

const fixtures = new URL('../fixtures/', import.meta.url);

/** One PDF page: lines of text (Helvetica, 12pt), or raw drawing operators for a page without text. */
type Page = { lines: string[] } | { drawing: string };

function escapeText(text: string): string {
  return text.replace(/[\\()]/g, (char) => `\\${char}`);
}

function contentStream(page: Page): string {
  if ('drawing' in page) return page.drawing;
  const body = page.lines.map((line, i) => `${i === 0 ? '72 720 Td' : '0 -18 Td'} (${escapeText(line)}) Tj`);
  return `BT /F1 12 Tf ${body.join(' ')} ET`;
}

function makePdf(pages: Page[]): Buffer {
  // Object numbers: 1 catalog, 2 page tree, 3 font, then a page and its content stream per page.
  const pageIds = pages.map((_, i) => 4 + i * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const [i, page] of pages.entries()) {
    const stream = contentStream(page);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

writeFileSync(
  new URL('with-pdf/cv.pdf', fixtures),
  makePdf([
    {
      lines: [
        'Ada Example - Curriculum Vitae',
        'Northwind Payments, 2019 to now: built Go services running on Kubernetes.',
      ],
    },
    {
      lines: [
        'Contoso Bank, 2016 to 2019: maintained the card ledger, written in Java.',
        'Speaks Spanish, English and Portuguese.',
      ],
    },
  ]),
);

// A "scanned" CV: the page only has graphics, no text to extract.
writeFileSync(new URL('with-scanned-pdf/scan.pdf', fixtures), makePdf([{ drawing: '0.5 g 72 72 468 648 re f' }]));
