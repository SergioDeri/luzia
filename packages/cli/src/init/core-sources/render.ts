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

function contactLine(value: string): string {
  return value.includes('@') && !value.includes('/') ? `Email: ${value}` : value;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
