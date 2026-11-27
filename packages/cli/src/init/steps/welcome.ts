import type { WizardStep } from '../step.ts';

/** Explains where the Owner's information and keys live, and what was detected about the project. */
export const welcomeStep: WizardStep = {
  id: 'welcome',
  async run(context) {
    const { project } = context.state;
    context.say('luzIA setup: an Agent on your portfolio that answers Visitors’ questions about you.');
    context.say('');
    context.say(
      'Where things live: your Knowledge Base (Core, Instructions, CV) is plain files in this project, ' +
        'and your API keys are saved only in .env.local (git-ignored) and your hosting provider’s settings. ' +
        'luzIA has no hosted service; nothing is uploaded anywhere else.',
    );
    context.say(
      'Heads-up: everything in the Knowledge Base is public. The Agent may share any of it with Visitors, ' +
        'and anyone can read it if your repository is public.',
    );
    context.say('');
    if (project.pagesRouter) {
      throw new Error(
        'This is a Next.js app using the Pages Router, which luzia init doesn’t set up yet. Nothing was changed. ' +
          'Follow the manual setup in the luzIA README (Manual setup: Next.js on Vercel) to add the server route and the widget.',
      );
    }
    if (project.kind === 'nextjs') {
      context.say(`Detected a Next.js app (App Router in ${project.appDir}/) using ${project.packageManager}.`);
    } else {
      context.say(
        'No Next.js app found here (a "next" dependency and an app/ or src/app/ folder), so luzIA sets up a ' +
          `standalone server in this folder using ${project.packageManager}, plus a <script> snippet for your portfolio’s HTML.`,
      );
    }
  },
};
