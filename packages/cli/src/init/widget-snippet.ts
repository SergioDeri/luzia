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

/** The widget's script bundle, which registers `<luzia-widget>` as soon as it loads. */
export const WIDGET_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@luzia/widget/dist/luzia-widget.js';

/**
 * Everything an HTML page needs: the `<script type="module">` tag that loads
 * the widget bundle, then the {@link htmlWidget} element, as lines.
 */
export function htmlWidgetSnippet(props: WidgetProps, indent = ''): string[] {
  return [`${indent}<script type="module" src="${WIDGET_SCRIPT_URL}"></script>`, '', ...htmlWidget(props, indent)];
}

/**
 * The props of the first `<LuziaWidget …>` in a React/Next.js file, as far as
 * they are plain values (string literals, an array of strings); `null` when
 * there is no widget. Props written as other expressions are left out.
 */
export function readReactWidget(source: string): Partial<WidgetProps> | null {
  const tag = /<LuziaWidget\b/.exec(source);
  if (!tag) return null;
  const values: Record<string, unknown> = {};
  let at = tag.index + tag[0].length;
  for (;;) {
    at += /^\s*/.exec(source.slice(at))![0].length;
    const name = /^[A-Za-z_][\w-]*/.exec(source.slice(at))?.[0];
    if (!name) break;
    at += name.length;
    if (source[at] !== '=') continue;
    at++;
    const quote = source[at];
    if (quote === '"' || quote === "'") {
      const end = source.indexOf(quote, at + 1);
      if (end < 0) break;
      values[name] = source.slice(at + 1, end);
      at = end + 1;
    } else if (quote === '{') {
      const end = closingBrace(source, at);
      if (end < 0) break;
      values[name] = jsValue(source.slice(at + 1, end));
      at = end + 1;
    } else {
      break;
    }
  }
  return widgetProps(values);
}

/**
 * The attributes of the first `<luzia-widget …>` in an HTML page, as widget
 * props (`suggested-questions` is a JSON array); `null` when there is none.
 */
export function readHtmlWidget(source: string): Partial<WidgetProps> | null {
  const tag = /<luzia-widget\b([^>]*)>/i.exec(source);
  if (!tag) return null;
  const values: Record<string, unknown> = {};
  for (const match of tag[1]!.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = match[1]!.toLowerCase() === 'suggested-questions' ? 'suggestedQuestions' : match[1]!.toLowerCase();
    const text = htmlUnescape(match[2] ?? match[3] ?? '');
    values[name] = name === 'suggestedQuestions' ? jsValue(text) : text;
  }
  return widgetProps(values);
}

/** Only the values that are valid widget props. */
function widgetProps(values: Record<string, unknown>): Partial<WidgetProps> {
  const props: Partial<WidgetProps> = {};
  for (const name of ['endpoint', 'contact', 'greeting', 'avatar'] as const) {
    const value = values[name];
    if (typeof value === 'string' && value) props[name] = value;
  }
  const questions = values.suggestedQuestions;
  if (Array.isArray(questions) && questions.length && questions.every((question) => typeof question === 'string')) {
    props.suggestedQuestions = questions;
  }
  if (values.theme === 'auto' || values.theme === 'light' || values.theme === 'dark') props.theme = values.theme;
  if (values.mode === 'bubble' || values.mode === 'inline') props.mode = values.mode;
  return props;
}

/** The index of the `}` closing the `{` at `open`, skipping strings; -1 when there is none. */
function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"' || char === "'" || char === '`') {
      for (index++; index < source.length && source[index] !== char; index++) if (source[index] === '\\') index++;
    } else if (char === '{') {
      depth++;
    } else if (char === '}' && --depth === 0) {
      return index;
    }
  }
  return -1;
}

/** A JSON-like literal (trailing commas and single-quoted strings allowed), `undefined` when it is anything else. */
function jsValue(expression: string): unknown {
  const withoutTrailingCommas = (text: string) => text.trim().replace(/,(\s*[\]}])/g, '$1');
  const singleQuoted = (text: string) =>
    text.replace(/'((?:[^'\\]|\\.)*)'/g, (_, inner: string) => JSON.stringify(inner.replace(/\\'/g, "'")));
  for (const json of [withoutTrailingCommas(expression), withoutTrailingCommas(singleQuoted(expression))]) {
    try {
      return JSON.parse(json);
    } catch {
      // Try the next reading.
    }
  }
  return undefined;
}

function htmlUnescape(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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
    ['avatar', props.avatar],
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
