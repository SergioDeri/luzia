import type { CoreDraft } from '../context.ts';
import { required } from '../prompter.ts';
import type { CoreSource } from './source.ts';

const WORK_MODES = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  'on-site': 'On-site',
  flexible: 'Open to remote, hybrid or on-site',
} as const;

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
    const workMode = await prompter.select<keyof typeof WORK_MODES>({
      message: 'Preferred work mode',
      options: Object.entries(WORK_MODES).map(([value, label]) => ({ value: value as keyof typeof WORK_MODES, label })),
    });

    return coreFromAnswers({ name, summary, highlights, contact, links, role, availability, workMode: WORK_MODES[workMode] });
  },
};

function coreFromAnswers(answers: {
  name: string;
  summary: string;
  highlights: string;
  contact: string;
  links: string[];
  role: string;
  availability: string;
  workMode: string;
}): CoreDraft {
  const sections = [`# ${answers.name}`, answers.summary];
  if (answers.highlights) sections.push(`## Experience highlights\n\n${answers.highlights}`);
  sections.push(
    `## Role sought\n\n${sentence(answers.role)}\n\n- Availability: ${answers.availability}\n- Work mode: ${answers.workMode}`,
  );
  const contactLines = [`- ${contactLine(answers.contact)} (preferred)`, ...answers.links.map((link) => `- ${contactLine(link)}`)];
  sections.push(`## Contact\n\n${contactLines.join('\n')}`);

  return { text: `${sections.join('\n\n')}\n`, ownerName: answers.name, contact: answers.contact };
}

function contactLine(value: string): string {
  return value.includes('@') && !value.includes('/') ? `Email: ${value}` : value;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
