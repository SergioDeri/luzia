import { DEFAULT_ARTIFACT_PATH } from '../commands/build.ts';
import type { IgnoreEntry } from './gitignore.ts';

/** Where the compiled Knowledge Base is written by `luzia build`. */
export const ARTIFACT_PATH = DEFAULT_ARTIFACT_PATH;

/** The path the server answers the widget at, in both the Next.js route and the standalone function. */
export const ENDPOINT_PATH = '/api/luzia';

/** The command that compiles the Knowledge Base, run before the Owner's dev and build scripts. */
export const LUZIA_BUILD = 'luzia build';

/** The compiled Knowledge Base is rebuilt by `luzia build`, so it is kept out of git. */
export const ARTIFACT_IGNORE: IgnoreEntry = {
  entry: `${ARTIFACT_PATH.split('/')[0]!}/`,
  comment: 'Compiled Knowledge Base (rebuilt by luzia build)',
};
