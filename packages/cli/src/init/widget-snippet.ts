import type { WidgetOptions } from './context.ts';

/** Everything the widget is configured with: the Owner's options and the chat endpoint it calls. */
export interface WidgetProps extends WidgetOptions {
  endpoint: string;
}

/** The import a file needs before rendering {@link reactWidget}. */
export const REACT_WIDGET_IMPORT = "import { LuziaWidget } from '@luzia/react';";

/**
 * The `<LuziaWidget … />` element for a React/Next.js file, one prop per line,
 * as lines without a trailing newline. `indent` is put before every line.
 */
export function reactWidget(props: WidgetProps, indent = ''): string[] {
  const lines = ['<LuziaWidget'];
  for (const [name, value] of propEntries(props)) {
    if (typeof value === 'string') {
      lines.push(`  ${name}=${jsxString(value)}`);
    } else {
      lines.push(`  ${name}={[`, ...value.map((question) => `    ${JSON.stringify(question)},`), '  ]}');
    }
  }
  lines.push('/>');
  return lines.map((line) => `${indent}${line}`);
}

/**
 * The `<luzia-widget …></luzia-widget>` element for an HTML page, one attribute
 * per line (the script tag that defines the element is not included).
 */
export function htmlWidget(props: WidgetProps, indent = ''): string[] {
  const lines = ['<luzia-widget'];
  for (const [name, value] of propEntries(props)) {
    const attribute = name === 'suggestedQuestions' ? 'suggested-questions' : name;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    lines.push(`  ${attribute}="${htmlEscape(text)}"`);
  }
  lines.push('></luzia-widget>');
  return lines.map((line) => `${indent}${line}`);
}

/** The props that are set, in a fixed order. */
function propEntries(props: WidgetProps): [string, string | string[]][] {
  const entries: [string, string | string[] | undefined][] = [
    ['endpoint', props.endpoint],
    ['contact', props.contact],
    ['greeting', props.greeting],
    ['suggestedQuestions', props.suggestedQuestions?.length ? props.suggestedQuestions : undefined],
    ['theme', props.theme],
    ['mode', props.mode],
  ];
  return entries.filter((entry): entry is [string, string | string[]] => entry[1] !== undefined && entry[1] !== '');
}

/** A JSX attribute value: a plain string when it is safe as one, otherwise a JS string expression. */
function jsxString(value: string): string {
  return /^[^"&{}<>\n\\]*$/.test(value) ? `"${value}"` : `{${JSON.stringify(value)}}`;
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
