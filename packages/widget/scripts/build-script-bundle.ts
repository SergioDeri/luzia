// Builds the self-registering script bundle: one browser ES module with no
// imports, for `<script type="module" src="luzia-widget.js">` on any site.
// Run with `node scripts/build-script-bundle.ts` (Node strips the types).
import path from 'node:path';
import { build, type BuildOptions } from 'esbuild';

export const SCRIPT_BUNDLE_FILE = path.resolve(import.meta.dirname, '../dist/luzia-widget.js');

/** Shared by the build and the bundle test, so both check the same output. */
export const scriptBundleOptions = {
  entryPoints: [path.resolve(import.meta.dirname, '../src/register.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
} satisfies BuildOptions;

if (process.argv[1] === import.meta.filename) {
  const result = await build({ ...scriptBundleOptions, outfile: SCRIPT_BUNDLE_FILE, metafile: true });
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  console.log(`Wrote dist/luzia-widget.js (${(bytes / 1024).toFixed(1)} kB)`);
}
