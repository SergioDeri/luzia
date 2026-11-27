import type { WizardStep } from '../step.ts';
import { buildStep } from './build.ts';
import { coreStep } from './core.ts';
import { instructionsStep } from './instructions.ts';
import { modelsStep } from './models.ts';
import { nextjsStep } from './nextjs.ts';
import { productionStep } from './production.ts';
import { welcomeStep } from './welcome.ts';
import { widgetStep } from './widget.ts';

/**
 * The steps of `luzia init`, in order. Content first (models, Core,
 * Instructions, widget), then the project integration that uses it, then the
 * build and production variables. Each step decides with `applies` whether it
 * runs for this project.
 */
export const wizardSteps: WizardStep[] = [
  welcomeStep,
  modelsStep,
  coreStep,
  instructionsStep,
  widgetStep,
  nextjsStep,
  buildStep,
  productionStep,
];
