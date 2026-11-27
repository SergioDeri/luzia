import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

/** What `luzia init` found about the Owner's project. */
export interface ProjectInfo {
  /**
   * `nextjs`: a Next.js App Router app and `astro`: an Astro site, both integrated
   * in place. `standalone`: anything else, which gets a separate luzIA server.
   */
  kind: 'nextjs' | 'astro' | 'standalone';
  packageManager: PackageManager;
  /** The App Router directory relative to the project, e.g. `app` or `src/app`; `null` when not Next.js. */
  appDir: string | null;
  /** A Next.js app using only the Pages Router (`pages/` or `src/pages/`, no App Router), which `luzia init` doesn't integrate yet. */
  pagesRouter: boolean;
  /** Whether the folder root serves a static site (an `index.html` at the root). */
  staticRoot: boolean;
  /**
   * Whether the folder already builds or serves a site of its own (a build
   * script, a root `index.html` or a `public/` folder). luzIA then never
   * changes how it is built or served: no output directory, no placeholder page.
   */
  ownSite: boolean;
  /** For an Astro site: its adapter (`@astrojs/vercel`…, `null` without one) and major version. */
  astro: { adapter: string | null; major: number | null } | null;
  /** Whether the project uses TypeScript (has a `tsconfig.json`). */
  typescript: boolean;
  /** The parsed `package.json`, `null` if there is none. */
  packageJson: PackageJson | null;
}

export interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  [key: string]: unknown;
}

const LOCKFILES: [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/** Detects Next.js (from `package.json` and an App Router directory) and the package manager (from the lockfile). */
export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const packageJson = await readPackageJson(cwd);
  const hasNext = Boolean(packageJson?.dependencies?.next ?? packageJson?.devDependencies?.next);
  const appDir = hasNext ? (['app', 'src/app'].find((dir) => existsSync(path.join(cwd, dir))) ?? null) : null;

  const pagesRouter = hasNext && !appDir && ['pages', 'src/pages'].some((dir) => existsSync(path.join(cwd, dir)));
  const astro = detectAstro(cwd, packageJson);
  const staticRoot = existsSync(path.join(cwd, 'index.html'));

  return {
    kind: appDir ? 'nextjs' : astro ? 'astro' : 'standalone',
    packageManager: detectPackageManager(cwd, packageJson),
    appDir,
    pagesRouter,
    staticRoot,
    ownSite: staticRoot || Boolean(packageJson?.scripts?.build) || existsSync(path.join(cwd, 'public')),
    astro,
    typescript: existsSync(path.join(cwd, 'tsconfig.json')),
    packageJson,
  };
}

const ASTRO_ADAPTERS = ['@astrojs/vercel', '@astrojs/node', '@astrojs/netlify', '@astrojs/cloudflare'];

/** An Astro site: `astro` in package.json and an Astro config or `src/pages/`. */
function detectAstro(cwd: string, packageJson: PackageJson | null): ProjectInfo['astro'] {
  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  if (!deps.astro) return null;
  const hasConfig = ['mjs', 'js', 'ts', 'mts', 'cjs'].some((ext) => existsSync(path.join(cwd, `astro.config.${ext}`)));
  if (!hasConfig && !existsSync(path.join(cwd, 'src/pages'))) return null;
  const major = Number(/(\d+)/.exec(deps.astro)?.[1]);
  return { adapter: ASTRO_ADAPTERS.find((name) => deps[name]) ?? null, major: Number.isFinite(major) ? major : null };
}

/** How to run a binary of the project's packages with extra arguments, e.g. `pnpm astro add vercel`. */
export function execArgs(manager: PackageManager, bin: string, args: string[]): { command: string; args: string[] } {
  const runner = { pnpm: ['pnpm', bin], npm: ['npx', bin], yarn: ['yarn', bin], bun: ['bunx', bin] }[manager];
  return { command: runner[0]!, args: [...runner.slice(1), ...args] };
}

function detectPackageManager(cwd: string, packageJson: PackageJson | null): PackageManager {
  const fromLockfile = LOCKFILES.find(([file]) => existsSync(path.join(cwd, file)))?.[1];
  if (fromLockfile) return fromLockfile;
  const declared = packageJson?.packageManager?.split('@')[0];
  return declared === 'pnpm' || declared === 'yarn' || declared === 'bun' ? declared : 'npm';
}

async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** The command that adds packages, e.g. `pnpm add -D luzia-cli`. */
export function addPackagesCommand(
  manager: PackageManager,
  packages: string[],
  options: { dev?: boolean } = {},
): { command: string; args: string[] } {
  const verb = manager === 'npm' ? 'install' : 'add';
  const devFlag = { pnpm: '-D', yarn: '-D', npm: '--save-dev', bun: '--dev' }[manager];
  return { command: manager, args: [verb, ...(options.dev ? [devFlag] : []), ...packages] };
}

/** How the Owner runs a binary installed in the project, e.g. `pnpm exec luzia`. */
export function execCommand(manager: PackageManager, bin: string): string {
  return { pnpm: `pnpm exec ${bin}`, npm: `npx ${bin}`, yarn: `yarn ${bin}`, bun: `bunx ${bin}` }[manager];
}

/** How the Owner runs a `package.json` script, e.g. `pnpm dev` or `npm run dev`. */
export function runScriptCommand(manager: PackageManager, script: string): string {
  return manager === 'npm' ? `npm run ${script}` : `${manager} ${script}`;
}

/**
 * Installs luzIA: `runtime` packages as dependencies and `luzia-cli` as a dev
 * dependency, streamed, with a fallback to-do if the install fails.
 */
export function luziaInstallCommands(
  manager: PackageManager,
  runtime: string[],
): { command: string; args: string[]; stream: true; fallback: string }[] {
  return [addPackagesCommand(manager, runtime), addPackagesCommand(manager, ['luzia-cli'], { dev: true })].map((command) => ({
    ...command,
    stream: true as const,
    fallback: `Install the luzIA packages: ${[command.command, ...command.args].join(' ')}`,
  }));
}
