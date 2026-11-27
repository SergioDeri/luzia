import { INSTRUCTIONS_FILE_NAME } from 'luzia-core';
import { required } from '../prompter.ts';
import type { WizardStep } from '../step.ts';
import { KNOWLEDGE_BASE_DIR } from './core.ts';

export const INSTRUCTIONS_PATH = `${KNOWLEDGE_BASE_DIR}/${INSTRUCTIONS_FILE_NAME}`;

/** How the Agent handles salary questions. */
export type SalaryChoice = 'range' | 'call' | 'decline';

/** The Owner's answers, topic by topic. Empty answers skip the topic. */
export interface InstructionsTopics {
  salary: SalaryChoice;
  /** The range to give, when `salary` is `range`. */
  salaryRange?: string;
  availability?: string;
  relocation?: string;
  other?: string;
}

/**
 * Instructions: how the Agent handles sensitive topics (salary, availability,
 * relocation, free text), written from fixed templates with no model call,
 * shown in full and saved as `knowledge-base/instructions.md` after confirmation.
 */
export const instructionsStep: WizardStep = {
  id: 'instructions',
  title: 'Instructions',
  async run(context) {
    context.say(
      'Instructions tell the Agent how to handle sensitive topics. They guide how it answers; they are never shown to Visitors.',
    );
    context.say('Write your answers as guidance to the Agent, about you in the third person.');
    const { prompter } = context;
    const name = ownerNameOrDefault(context.state.core?.ownerName);

    const salary = await prompter.select<SalaryChoice>({
      message: 'How should the Agent handle salary questions?',
      options: [
        { value: 'range', label: 'Give a range I provide' },
        { value: 'call', label: 'Suggest discussing it on a call' },
        { value: 'decline', label: 'Don’t discuss salary' },
      ],
      initialValue: 'call',
    });
    const topics: InstructionsTopics = { salary };
    if (salary === 'range') {
      topics.salaryRange = await prompter.text({
        message: 'What salary range should the Agent give?',
        placeholder: 'e.g. €70,000–€85,000 a year, depending on the role',
        validate: required('a range'),
      });
    }
    topics.availability = await prompter.text({
      message: 'How should the Agent answer questions about your availability? (optional, press Enter to skip)',
      defaultValue: '',
      placeholder: `e.g. Say ${name} can start two weeks after an offer and is open to interviews now`,
    });
    topics.relocation = await prompter.text({
      message: 'How should the Agent answer questions about relocation? (optional, press Enter to skip)',
      defaultValue: '',
      placeholder: `e.g. Say ${name} is open to relocating within the EU, but prefers remote work`,
    });
    topics.other = await prompter.text({
      message: 'Anything else the Agent should know how to handle? (optional, press Enter to skip)',
      defaultValue: '',
      placeholder: `e.g. Don't name ${name}'s current employer; say it is under NDA`,
    });

    const text = writeInstructions(topics, name);

    context.say('');
    context.say(`Your Instructions (${INSTRUCTIONS_PATH}):`);
    context.say('');
    for (const line of text.trimEnd().split('\n')) context.say(line ? `  ${line}` : '');
    context.say('');

    context.state.instructions = text;
    await context.apply({ files: [{ path: INSTRUCTIONS_PATH, content: text }] }, 'Save the Instructions to the Knowledge Base?');
  },
};

/**
 * The Instructions markdown for the Owner's answers, from fixed templates
 * written to the Agent in the second person. One paragraph per topic; skipped
 * topics are left out.
 */
export function writeInstructions(topics: InstructionsTopics, ownerName?: string): string {
  const name = ownerNameOrDefault(ownerName);
  const paragraphs = [salaryInstruction(topics, name)];

  const availability = sentence(topics.availability);
  if (availability) {
    paragraphs.push(`When asked about ${name}'s availability or start date, follow this guidance: ${availability}`);
  }
  const relocation = sentence(topics.relocation);
  if (relocation) {
    paragraphs.push(`When asked whether ${name} would relocate, follow this guidance: ${relocation}`);
  }
  const other = sentence(topics.other);
  if (other) paragraphs.push(other);

  return `${paragraphs.join('\n\n')}\n`;
}

function salaryInstruction(topics: InstructionsTopics, name: string): string {
  switch (topics.salary) {
    case 'range':
      return `If asked about salary or compensation, say ${name} is looking for ${trimSentence(topics.salaryRange ?? '')}. Add that the final figure depends on the role and the full package, and share the contact details to discuss it further.`;
    case 'call':
      return `If asked about salary or compensation, say ${name} prefers to discuss it on a call, and share the contact details.`;
    case 'decline':
      return `Do not discuss salary or compensation, and do not guess at figures. If asked, say it is not something you can talk about here and suggest contacting ${name} directly.`;
  }
}

function ownerNameOrDefault(ownerName: string | undefined): string {
  return ownerName?.trim() || 'the Owner';
}

/** The answer as a sentence ending in punctuation, or `''` when it was skipped. */
function sentence(answer: string | undefined): string {
  const text = answer?.trim() ?? '';
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The answer without a trailing full stop, to embed in a sentence. */
function trimSentence(answer: string): string {
  return answer.trim().replace(/\.+$/, '');
}
