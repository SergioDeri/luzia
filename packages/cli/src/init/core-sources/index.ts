import { questionsCoreSource } from './questions.ts';
import type { CoreSource } from './source.ts';

export type { CoreSource } from './source.ts';

/** Ways to produce the Core, in the order offered to the Owner. */
export const coreSources: CoreSource[] = [questionsCoreSource];
