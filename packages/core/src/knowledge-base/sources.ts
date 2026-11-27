import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractText } from 'unpdf';
import { KnowledgeBaseError } from '../errors.ts';
import { parseMarkdownSections } from './markdown.ts';

/**
 * A piece of a source file, before size-based splitting: some text and the
 * heading path it lives under (outermost first, empty when there is none).
 */
export interface SourceSection {
  headings: string[];
  text: string;
}

/** What a reader got out of one file. */
export interface SourceReadResult {
  sections: SourceSection[];
  /** Pages extracted, for paged formats such as PDF. */
  pages?: number;
  /** Problems the Owner should know about (e.g. a PDF with no extractable text). */
  warnings?: string[];
}

/**
 * Turns one kind of retrievable Knowledge Base file into sections. To support
 * a new file type, add a reader to {@link SOURCE_READERS}: the build then
 * sub-splits, embeds and stores its sections like any other.
 */
export interface SourceReader {
  /** Whether this reader handles the file, judged by its name. */
  accepts(fileName: string): boolean;
  read(filePath: string): Promise<SourceReadResult>;
}

export const markdownReader: SourceReader = {
  accepts: (fileName) => /\.(md|markdown)$/i.test(fileName),
  read: async (filePath) => ({ sections: parseMarkdownSections(await readFile(filePath, 'utf8')) }),
};

/**
 * Below this many characters of text per page on average, a PDF is most
 * likely a scanned image (a real CV page holds well over a thousand).
 */
export const MIN_PDF_TEXT_CHARS_PER_PAGE = 50;

/** Reads a PDF's text layer, one section per page. Pages without text are dropped. */
export const pdfReader: SourceReader = {
  accepts: (fileName) => /\.pdf$/i.test(fileName),
  async read(filePath) {
    const data = new Uint8Array(await readFile(filePath));
    const { totalPages, text } = await extractText(data, { mergePages: false }).catch((error: unknown) => {
      throw new KnowledgeBaseError(
        `Could not read the PDF ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}. ` +
          'Check that it opens in a PDF viewer, or add its content as a markdown file instead.',
      );
    });

    const sections = text.map((page) => normalizePdfText(page)).filter(Boolean).map((page) => ({ headings: [], text: page }));
    const chars = sections.reduce((sum, section) => sum + section.text.replace(/\s/g, '').length, 0);
    const warnings =
      chars < MIN_PDF_TEXT_CHARS_PER_PAGE * Math.max(totalPages, 1)
        ? [
            `${path.basename(filePath)} has little or no extractable text (${chars} characters over ${totalPages} page(s)); ` +
              'it may be a scanned image. The Agent cannot read images, so add this content as a markdown file instead.',
          ]
        : [];
    return { sections, pages: totalPages, warnings };
  },
};

/** Trims each line and collapses runs of spaces and blank lines left by the PDF's layout. */
function normalizePdfText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Readers tried in order for every file other than the Core and Instructions. */
export const SOURCE_READERS: readonly SourceReader[] = [markdownReader, pdfReader];
