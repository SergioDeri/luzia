import type { SourceSection } from './sources.ts';

/** Default size limit of a chunk's body, in characters (roughly 300 tokens). */
export const DEFAULT_MAX_CHUNK_CHARS = 1200;

/**
 * Splits a section whose text exceeds `maxChars` into several pieces under the
 * same heading path: at paragraph boundaries first, then sentences, then words.
 * Sections within the limit come back unchanged.
 */
export function splitSection(section: SourceSection, maxChars: number): SourceSection[] {
  return packPieces(section.text, maxChars).map((text) => ({ headings: section.headings, text }));
}

const SEPARATORS = [/\n\s*\n/, /(?<=[.!?])\s+/, /\s+/];
const JOINERS = ['\n\n', ' ', ' '];

function packPieces(text: string, maxChars: number, depth = 0): string[] {
  if (text.length <= maxChars) return [text];
  if (depth >= SEPARATORS.length) {
    // A single unbreakable run (e.g. a very long URL): cut it hard.
    const cuts: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) cuts.push(text.slice(i, i + maxChars));
    return cuts;
  }

  const joiner = JOINERS[depth]!;
  const pieces = text
    .split(SEPARATORS[depth]!)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => packPieces(piece, maxChars, depth + 1));

  const packed: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + joiner.length + piece.length > maxChars) {
      packed.push(current);
      current = piece;
    } else {
      current = current ? `${current}${joiner}${piece}` : piece;
    }
  }
  if (current) packed.push(current);
  return packed;
}
