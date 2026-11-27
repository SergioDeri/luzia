import { readFile } from 'node:fs/promises';
import { parseMarkdownSections } from './markdown.ts';

/**
 * A piece of a source file, before size-based splitting: some text and the
 * heading path it lives under (outermost first, empty when there is none).
 */
export interface SourceSection {
  headings: string[];
  text: string;
}

/**
 * Turns one kind of retrievable Knowledge Base file into sections. To support
 * a new file type (e.g. PDF), add a reader to {@link SOURCE_READERS}: the build
 * then sub-splits, embeds and stores its sections like any other.
 */
export interface SourceReader {
  /** Whether this reader handles the file, judged by its name. */
  accepts(fileName: string): boolean;
  read(filePath: string): Promise<SourceSection[]>;
}

export const markdownReader: SourceReader = {
  accepts: (fileName) => /\.(md|markdown)$/i.test(fileName),
  read: async (filePath) => parseMarkdownSections(await readFile(filePath, 'utf8')),
};

/** Readers tried in order for every file other than the Core and Instructions. */
export const SOURCE_READERS: readonly SourceReader[] = [markdownReader];
