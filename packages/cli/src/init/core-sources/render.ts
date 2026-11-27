import type { CoreDraft } from '../context.ts';

/** Work modes offered when the Owner states theirs. */
export const WORK_MODES = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  'on-site': 'On-site',
  flexible: 'Open to remote, hybrid or on-site',
} as const;

export type WorkMode = keyof typeof WORK_MODES;

/** What a Core says, whichever way it was gathered. */
export interface CoreContent {
  name: string;
  summary: string;
  /** Experience highlights: free text, or one bullet each. */
  highlights: string | string[];
  /** The preferred way to contact the Owner (email or URL). */
  contact: string;
  /** Other links (GitHub, LinkedIn…). */
  links: string[];
  role: string;
  availability: string;
  workMode: string;
  location?: string | null;
}

/** Writes the Core markdown: summary, highlights, role sought and contact. */
export function renderCore(content: CoreContent): CoreDraft {
  const sections = [`# ${content.name}`, content.summary];
  const highlights =
    typeof content.highlights === 'string' ? content.highlights : content.highlights.map((item) => `- ${item}`).join('\n');
  if (highlights) sections.push(`## Experience highlights\n\n${highlights}`);
  const details = [`- Availability: ${content.availability}`, `- Work mode: ${content.workMode}`];
  if (content.location) details.push(`- Location: ${content.location}`);
  sections.push(`## Role sought\n\n${sentence(content.role)}\n\n${details.join('\n')}`);
  const links = content.links.filter((link) => link !== content.contact);
  const contactLines = [`- ${contactLine(content.contact)} (preferred)`, ...links.map((link) => `- ${contactLine(link)}`)];
  sections.push(`## Contact\n\n${contactLines.join('\n')}`);

  return { text: `${sections.join('\n\n')}\n`, ownerName: content.name, contact: content.contact };
}

/**
 * What later steps need from a Core's markdown, however it was written (drafted,
 * edited by the Owner, or read back from the Knowledge Base): the name from the
 * first `# ` heading, and the contact from the `## Contact` section (the line
 * marked "(preferred)", else its first email or URL), else the first email
 * anywhere. Either is `''` when the text doesn't state it.
 */
export function parseCore(text: string): { ownerName: string; contact: string } {
  const lines = text.split('\n');
  const ownerName =
    lines.map((line) => /^#[ \t]+(.+)$/.exec(line)?.[1]?.replace(/\s+#+\s*$/, '').trim()).find(Boolean) ?? '';

  const start = lines.findIndex((line) => /^#{1,6}[ \t]+Contact\b/i.test(line));
  const section: string[] = [];
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      if (/^#{1,6}[ \t]/.test(line)) break;
      if (line.trim()) section.push(line);
    }
  }
  const preferred = section.find((line) => /\(preferred\)/i.test(line) && contactIn(line)) ?? section.find(contactIn);
  const contact = (preferred && contactIn(preferred)) || (EMAIL.exec(text)?.[0] ?? '');
  return { ownerName, contact };
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const CONTACT = /https?:\/\/[^\s)<>\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

function contactIn(line: string): string {
  return CONTACT.exec(line)?.[0].replace(/[.,;:]+$/, '') ?? '';
}

function contactLine(value: string): string {
  return value.includes('@') && !value.includes('/') ? `Email: ${value}` : value;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
