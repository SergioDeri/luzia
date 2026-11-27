import { LUZIA_BUILD } from './paths.ts';
import { reactWidget, REACT_WIDGET_IMPORT, type WidgetProps } from './widget-snippet.ts';

/**
 * The root layout with `<LuziaWidget />` as the last child of `<body>` and its
 * import added. A widget already in the layout is replaced with `props`.
 * Returns `null` when the layout doesn't have exactly one `<body>…</body>` it
 * can put the widget in, so the caller prints the snippet instead of guessing.
 */
export function layoutWithWidget(layout: string, props: WidgetProps): string | null {
  if (count(layout, /<body[\s>]/g) !== 1 || count(layout, /<\/body>/g) !== 1) return null;
  const widgets = count(layout, /<LuziaWidget\b/g);
  if (widgets > 1) return null;

  let source = layout;
  if (widgets === 1) {
    // Only a self-closing widget is replaced; anything else is left to the Owner.
    const existing = /\n?[ \t]*<LuziaWidget\b[^]*?\/>/.exec(source);
    if (!existing || /<LuziaWidget\b[^]*?>/.exec(existing[0])?.[0].endsWith('/>') !== true) return null;
    source = source.slice(0, existing.index) + source.slice(existing.index + existing[0].length);
  }

  const lines = source.split('\n');
  const open = lines.findIndex((line) => /<body[\s>]/.test(line));
  const close = lines.findIndex((line) => line.includes('</body>'));
  if (open < 0 || close < open) return null;
  const bodyIndent = leadingSpace(lines[open]!);
  const childIndent = `${bodyIndent}  `;
  const widget = reactWidget(props, childIndent);

  if (open === close) {
    // `<body>{children}</body>` on one line: open it up.
    const match = /^(.*<body\b[^>]*>)(.*)<\/body>(.*)$/.exec(lines[open]!);
    if (!match) return null;
    const [, start, inner, rest] = match as unknown as [string, string, string, string];
    lines.splice(open, 1, start, ...(inner.trim() ? [`${childIndent}${inner.trim()}`] : []), ...widget, `${bodyIndent}</body>${rest}`);
  } else {
    const line = lines[close]!;
    const at = line.indexOf('</body>');
    if (line.slice(0, at).trim()) {
      lines.splice(close, 1, line.slice(0, at).trimEnd(), ...widget, `${bodyIndent}${line.slice(at)}`);
    } else {
      lines.splice(close, 0, ...widget);
    }
  }

  const result = lines.join('\n');
  return /from\s+['"]@luzia\/react['"]/.test(result) ? result : withImport(result, REACT_WIDGET_IMPORT);
}

/** Adds `statement` after the last top-level import, after a leading directive, or at the top. */
function withImport(source: string, statement: string): string {
  const lines = source.split('\n');
  let last = -1;
  for (let index = 0; index < lines.length; index++) {
    if (!/^import\b/.test(lines[index]!)) continue;
    // A multi-line import ends at the line naming its module.
    while (index < lines.length - 1 && !/['"][^'"]+['"];?\s*$/.test(lines[index]!)) index++;
    last = index;
  }
  if (last < 0 && /^\s*['"]use \w+['"];?\s*$/.test(lines[0] ?? '')) last = 0;
  if (last < 0) return `${statement}\n\n${source}`;
  lines.splice(last + 1, 0, statement);
  return lines.join('\n');
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function leadingSpace(line: string): string {
  return /^\s*/.exec(line)![0];
}


/**
 * `package.json` with the `dev` and `build` scripts prefixed by
 * `luzia build &&` (each only if not already), and the names it changed.
 * `null` when the file can't be read as JSON.
 */
export function packageJsonWithLuziaBuild(source: string): { content: string; changed: string[] } | null {
  let packageJson: { scripts?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(source);
  } catch {
    return null;
  }
  const scripts = { ...packageJson.scripts };
  const changed = ['dev', 'build'].filter((name) => {
    const script = scripts[name];
    return typeof script === 'string' && !script.trim().startsWith(LUZIA_BUILD);
  });
  for (const name of changed) scripts[name] = `${LUZIA_BUILD} && ${scripts[name] as string}`;
  const indent = /^\{\r?\n([ \t]+)"/.exec(source)?.[1] ?? '  ';
  const content = `${JSON.stringify({ ...packageJson, scripts }, null, indent)}${source.endsWith('\n') ? '\n' : ''}`;
  return { content: changed.length ? content : source, changed };
}
