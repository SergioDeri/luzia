import type { ChatModelInstance } from '@luzia/core';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { CoreDraft, WidgetOptions, WizardContext } from '../context.ts';
import { required } from '../prompter.ts';
import type { WizardStep } from '../step.ts';

/** What the widget says before the Visitor asks anything. */
export interface WidgetCopy {
  greeting: string;
  suggestedQuestions: [string, string, string];
}

/**
 * Widget options, recorded in `context.state.widget` for the integration step:
 * the contact from the Core, a greeting and three suggested questions
 * (proposed, then editable), the theme and the mode.
 */
export const widgetStep: WizardStep = {
  id: 'widget',
  title: 'Widget',
  async run(context) {
    const core = context.state.core;
    const contact =
      core?.contact ||
      (await context.prompter.text({ message: 'How should Visitors contact you? (email or URL)', validate: required('a contact') }));

    // On a re-run, the options the widget already has are the starting point.
    const current = context.state.widget;
    const proposed = current?.greeting || current?.suggestedQuestions?.length
      ? currentCopy(current, core)
      : await proposeCopy(context, core);
    context.say(
      current
        ? 'The widget currently greets Visitors and offers these questions to start with:'
        : 'The widget greets Visitors and offers a few questions to start with:',
    );
    context.say(`  Greeting: ${proposed.greeting}`);
    for (const question of proposed.suggestedQuestions) context.say(`  - ${question}`);
    const copy = (await context.prompter.confirm({
      message: 'Use this greeting and these questions?',
      initialValue: true,
    }))
      ? proposed
      : await editCopy(context, proposed);

    const theme = await context.prompter.select<NonNullable<WidgetOptions['theme']>>({
      message: 'Widget theme?',
      initialValue: current?.theme ?? 'auto',
      options: [
        { value: 'auto', label: 'Auto', hint: 'follows the Visitor’s system setting' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    });
    const mode = await context.prompter.select<NonNullable<WidgetOptions['mode']>>({
      message: 'Show the widget as a floating bubble or inline in the page?',
      initialValue: current?.mode ?? 'bubble',
      options: [
        { value: 'bubble', label: 'Bubble', hint: 'a button in the corner that opens the chat' },
        { value: 'inline', label: 'Inline', hint: 'the chat where you place it in the page' },
      ],
    });

    context.state.widget = { contact, ...copy, theme, mode };
  },
};

/** The widget's current greeting and questions, completed from the defaults where it has none. */
function currentCopy(current: WidgetOptions, core: CoreDraft | undefined): WidgetCopy {
  const defaults = defaultWidgetCopy(core?.ownerName ?? '');
  const questions = current.suggestedQuestions ?? [];
  return {
    greeting: current.greeting || defaults.greeting,
    suggestedQuestions: defaults.suggestedQuestions.map((question, index) => questions[index] || question) as WidgetCopy['suggestedQuestions'],
  };
}

async function editCopy(context: WizardContext, proposed: WidgetCopy): Promise<WidgetCopy> {
  const keep = '(leave empty to keep it)';
  const greeting = await context.prompter.text({
    message: `Greeting ${keep}`,
    placeholder: proposed.greeting,
    defaultValue: proposed.greeting,
  });
  const questions: string[] = [];
  for (const [index, question] of proposed.suggestedQuestions.entries()) {
    questions.push(
      await context.prompter.text({
        message: `Suggested question ${index + 1} ${keep}`,
        placeholder: question,
        defaultValue: question,
      }),
    );
  }
  return { greeting: greeting.trim(), suggestedQuestions: questions.map((question) => question.trim()) as WidgetCopy['suggestedQuestions'] };
}

/**
 * The model's proposal when it drafted the Core (the Owner already agreed to
 * send their details to it); fixed defaults otherwise or when the call fails.
 */
async function proposeCopy(context: WizardContext, core: CoreDraft | undefined): Promise<WidgetCopy> {
  const fallback = defaultWidgetCopy(core?.ownerName ?? '');
  if (!core?.drafted) return fallback;
  try {
    return await proposeWidgetCopy(await context.chatModel(), core.text);
  } catch (error) {
    context.warn(
      `Couldn’t suggest a greeting and questions (${error instanceof Error ? error.message : String(error)}); starting from defaults.`,
    );
    return fallback;
  }
}

/** The fixed greeting and questions, about the Owner by first name. */
export function defaultWidgetCopy(ownerName: string): WidgetCopy {
  const name = ownerName.trim().split(/\s+/)[0] || 'this person';
  return {
    greeting: `Hi! I’m luzIA, an AI agent that answers questions about ${name}. What would you like to know?`,
    suggestedQuestions: [`What role is ${name} looking for?`, `What is ${name}’s experience?`, `How can I contact ${name}?`],
  };
}

const copySchema = z.object({
  greeting: z.string().min(1).describe('One or two short sentences greeting a Visitor of the Owner’s portfolio.'),
  suggestedQuestions: z
    .array(z.string().min(1))
    .length(3)
    .describe('Three short questions a recruiter might ask, each answerable from the Core.'),
});

/** Asks the chat model for a greeting and three suggested questions that fit the Core. */
export async function proposeWidgetCopy(model: ChatModelInstance, coreText: string): Promise<WidgetCopy> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: copySchema, name: 'widget_copy' }),
    instructions: COPY_INSTRUCTIONS,
    prompt: `The Owner’s Core:\n\n${coreText}`,
  });
  return {
    greeting: output.greeting.trim(),
    suggestedQuestions: output.suggestedQuestions.map((question) => question.trim()) as WidgetCopy['suggestedQuestions'],
  };
}

const COPY_INSTRUCTIONS = [
  'You write the opening text of luzIA, a chat widget on a person’s (the Owner’s) portfolio where an AI agent answers Visitors’ questions about the Owner.',
  'Write a short, friendly greeting that says it is an AI agent answering questions about the Owner (by first name), and three short questions a recruiter would ask.',
  'Every question must be answerable from the Core you are given. Do not invent facts. Write in the language of the Core.',
].join('\n');
