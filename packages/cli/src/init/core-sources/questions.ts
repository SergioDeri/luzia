import { required } from '../prompter.ts';
import { renderCore, WORK_MODES, type WorkMode } from './render.ts';
import type { CoreSource } from './source.ts';

/** Writes the Core from the Owner's answers, with no model call. */
export const questionsCoreSource: CoreSource = {
  id: 'questions',
  label: 'Answer a few questions',
  hint: 'no model call',
  async create(context) {
    const { prompter } = context;
    const name = (await prompter.text({ message: 'Your name, as Visitors should see it', validate: required('your name') })).trim();
    const summary = (
      await prompter.text({
        message: 'A short summary: who you are and what you do (one or two sentences)',
        validate: required('a summary'),
      })
    ).trim();
    const highlights = (
      await prompter.text({ message: 'Experience highlights worth mentioning (optional)', placeholder: 'press Enter to skip', defaultValue: '' })
    ).trim();
    const contact = (
      await prompter.text({
        message: 'How should Visitors contact you? (email or URL; the widget shows it too)',
        validate: required('an email or URL'),
      })
    ).trim();
    const links = (
      await prompter.text({ message: 'Other links, comma-separated (optional: GitHub, LinkedIn…)', placeholder: 'press Enter to skip', defaultValue: '' })
    )
      .split(',')
      .map((link) => link.trim())
      .filter(Boolean);
    const role = (await prompter.text({ message: 'What role are you looking for?', validate: required('the role you are looking for') })).trim();
    const availability = (
      await prompter.text({ message: 'When are you available? (e.g. from March, two weeks’ notice)', validate: required('your availability') })
    ).trim();
    const workMode = await prompter.select<WorkMode>({
      message: 'Preferred work mode',
      options: Object.entries(WORK_MODES).map(([value, label]) => ({ value: value as WorkMode, label })),
    });

    return renderCore({ name, summary, highlights, contact, links, role, availability, workMode: WORK_MODES[workMode] });
  },
};
