import type { SourceSection } from './sources.ts';

const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Splits markdown into one section per heading. Each section holds the text
 * under its heading (up to the next heading of any level) and the full heading
 * path, so `### Ledger` under `## Northwind` keeps both. Text before the first
 * heading forms a section with an empty path. Headings inside fenced code
 * blocks are ignored, and sections with no text are dropped.
 */
export function parseMarkdownSections(markdown: string): SourceSection[] {
  const sections: SourceSection[] = [];
  const path: { level: number; title: string }[] = [];
  let lines: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    const text = lines.join('\n').trim();
    if (text) sections.push({ headings: path.map((h) => h.title), text });
    lines = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }

    const heading = fence === null ? ATX_HEADING.exec(line) : null;
    if (!heading) {
      lines.push(line);
      continue;
    }

    flush();
    const level = heading[1]!.length;
    while (path.length > 0 && path.at(-1)!.level >= level) path.pop();
    path.push({ level, title: heading[2]!.trim() });
  }
  flush();

  return sections;
}
