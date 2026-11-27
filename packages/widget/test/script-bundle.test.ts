import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scriptBundleOptions } from '../scripts/build-script-bundle.ts';
import { visitor } from './support/visitor.ts';

let dir: string;
let bundle: string;

beforeAll(async () => {
  const result = await build({ ...scriptBundleOptions, write: false, outfile: 'luzia-widget.js' });
  bundle = result.outputFiles[0]!.text;
  // Inside the package, where the test runner is allowed to load modules from.
  const cache = path.resolve(import.meta.dirname, '../node_modules/.cache');
  await mkdir(cache, { recursive: true });
  dir = await mkdtemp(path.join(cache, 'luzia-script-bundle-'));
  await writeFile(path.join(dir, 'luzia-widget.js'), bundle);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('script bundle', () => {
  it('is a single file with no imports, so a <script> tag is all a site needs', () => {
    expect(bundle).not.toMatch(/\bimport\s*["'{*(]|\bfrom\s*["']|\brequire\(/);
  });

  it('registers <luzia-widget> as soon as it loads', async () => {
    expect(customElements.get('luzia-widget')).toBeUndefined();

    await import(/* @vite-ignore */ path.join(dir, 'luzia-widget.js'));

    expect(customElements.get('luzia-widget')).toBeDefined();
    const host = document.createElement('luzia-widget');
    host.setAttribute('endpoint', 'https://luzia.example.com/api/luzia');
    document.body.append(host);
    const widget = visitor(host);
    await widget.click('luzIA chat');
    expect(widget.isChatOpen()).toBe(true);
    expect(widget.chatTitle()).toBe('luzIA');
  });
});
