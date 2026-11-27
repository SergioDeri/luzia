import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { WizardContext } from './context.ts';
import { astroWidget, type WidgetProps } from './widget-snippet.ts';

/** The processed script that registers `<luzia-widget>`: Astro bundles its import (no attributes, so it isn't inlined). */
export const ASTRO_WIDGET_SCRIPT = ['<script>', "  import 'luzia-widget/script';", '</script>'];

/** Where Astro layouts usually live, in the order they are looked at. */
const LAYOUT_DIRS = ['src/layouts', 'src/components', 'src/pages'];

/** `.astro` files with exactly one `</body>`: the layouts the widget can go in. */
export async function findAstroLayouts(context: WizardContext): Promise<{ path: string; content: string }[]> {
  const layouts: { path: string; content: string }[] = [];
  for (const dir of LAYOUT_DIRS) {
    const entries = await readdir(path.join(context.cwd, dir), { withFileTypes: true }).catch(() => []);
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.astro')).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${dir}/${entry.name}`;
      const content = await context.readFile(file);
      if (content !== null && content.match(/<\/body>/g)?.length === 1) layouts.push({ path: file, content });
    }
    // Layouts in the first folder that has any win: pages only count when there are no layouts.
    if (layouts.length > 0) return layouts;
  }
  return layouts;
}

/**
 * The layout with the widget at the end of `<body>` and the script that
 * registers it. A widget already there is replaced (so re-runs don't add a
 * second one). `null` when the layout can't be changed safely.
 */
export function astroLayoutWithWidget(layout: string, props: WidgetProps): string | null {
  const bodies = layout.match(/<\/body>/g)?.length ?? 0;
  const widgets = layout.match(/<luzia-widget\b/g)?.length ?? 0;
  if (bodies !== 1 || widgets > 1) return null;

  if (widgets === 1) {
    const existing = /([ \t]*)<luzia-widget\b[\s\S]*?<\/luzia-widget>/.exec(layout);
    if (!existing) return null;
    const indent = existing[1] ?? '';
    const replaced = layout.replace(existing[0], () => astroWidget(props, indent).join('\n'));
    return replaced.includes("'luzia-widget/script'") ? replaced : withScript(replaced, indent);
  }

  const close = /([ \t]*)<\/body>/.exec(layout)!;
  const indent = `${close[1] ?? ''}  `;
  const block = [...astroWidget(props, indent), ...ASTRO_WIDGET_SCRIPT.map((line) => `${indent}${line}`)].join('\n');
  return layout.replace(close[0], () => `${block}\n${close[0]}`);
}

function withScript(layout: string, indent: string): string {
  const close = /([ \t]*)<\/body>/.exec(layout)!;
  const script = ASTRO_WIDGET_SCRIPT.map((line) => `${indent}${line}`).join('\n');
  return layout.replace(close[0], () => `${script}\n${close[0]}`);
}
