import { cvCoreSource } from './cv.ts';
import { questionsCoreSource } from './questions.ts';
import type { CoreSource } from './source.ts';

export type { CoreSource, ProposedCore } from './source.ts';

/** Ways to produce the Core, in the order offered to the Owner. */
export const coreSources: CoreSource[] = [cvCoreSource, questionsCoreSource];
