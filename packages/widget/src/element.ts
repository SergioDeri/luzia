import { failureKind, renderAlert } from './alert.ts';
import { Conversation, type ConversationState } from './conversation.ts';
import { persistConversation, storageKey } from './persistence.ts';
import { styles } from './styles.ts';

/** Tag name the widget is registered under. */
export const LUZIA_WIDGET_TAG = 'luzia-widget';

/**
 * How an Owner configures the widget. Each option is an attribute on
 * `<luzia-widget>` (kebab-case) and a prop on the React wrapper.
 */
export interface LuziaWidgetConfig {
  /** URL of the luzIA server handler, e.g. `/api/luzia`. */
  endpoint: string;
  /**
   * How Visitors can reach the Owner (an email address, a URL or any short
   * text), shown when luzIA is unavailable or the conversation limit is hit.
   */
  contact?: string;
  /** First thing the Visitor sees in the chat. Display only: never sent to the server. */
  greeting?: string;
  /**
   * Questions the Visitor can click to send, shown until the conversation
   * starts. As an attribute: a JSON array of strings, e.g.
   * `suggested-questions='["What role is she looking for?", "Is she open to remote work?"]'`.
   */
  suggestedQuestions?: readonly string[];
  /**
   * `bubble` (default): a floating button in the corner that opens the chat.
   * `inline`: the chat is rendered inside the element itself, always open,
   * so it can live in a page section.
   */
  mode?: LuziaWidgetMode;
  /**
   * `light` (default), `dark`, or `auto` to follow the Visitor's
   * `prefers-color-scheme`. Colours are CSS custom properties (see styles.ts).
   */
  theme?: LuziaWidgetTheme;
}

export type LuziaWidgetMode = 'bubble' | 'inline';
export type LuziaWidgetTheme = 'light' | 'dark' | 'auto';

// Lets this module be imported during server-side rendering, where there is no DOM.
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

const TEMPLATE = `
  <section class="panel" role="dialog" aria-label="luzIA" hidden>
    <header class="header">
      <h2 class="title">luzIA</h2>
      <button type="button" class="new-conversation">New conversation</button>
      <button type="button" class="close" aria-label="Close luzIA chat">&times;</button>
    </header>
    <div class="body">
      <p class="greeting" hidden></p>
      <ol class="messages" role="log" aria-live="polite"></ol>
      <ul class="suggestions" aria-label="Suggested questions" hidden></ul>
    </div>
    <p class="alert" role="alert" hidden></p>
    <form class="composer">
      <textarea name="message" rows="2" aria-label="Message luzIA" placeholder="Ask a question…"></textarea>
      <button type="submit">Send</button>
    </form>
  </section>
  <button type="button" class="bubble" aria-label="luzIA chat" aria-expanded="false">
    <span aria-hidden="true">luzIA</span>
  </button>
`;

/**
 * `<luzia-widget endpoint="/api/luzia">`: a floating bubble that opens a chat
 * panel where the Visitor talks to the Agent, or with `mode="inline"` the chat
 * itself, embedded where the element sits. Attributes: `endpoint`, `greeting`,
 * `suggested-questions` (JSON array of strings), `mode`, `theme`. Each is also
 * a property (`suggestedQuestions` takes an array).
 *
 * State lives in a {@link Conversation}; this element only renders its
 * snapshots and forwards Visitor input to it.
 */
export class LuziaWidgetElement extends BaseElement implements LuziaWidgetConfig {
  readonly conversation = new Conversation({ endpoint: () => this.endpoint });
  #view: View | null = null;

  get endpoint(): string {
    return this.getAttribute('endpoint') ?? '';
  }

  set endpoint(value: string) {
    this.setAttribute('endpoint', value);
  }

  get contact(): string {
    return this.getAttribute('contact') ?? '';
  }

  set contact(value: string) {
    this.setAttribute('contact', value);
  }

  get greeting(): string {
    return this.getAttribute('greeting') ?? '';
  }

  set greeting(value: string) {
    this.setAttribute('greeting', value);
  }

  get suggestedQuestions(): string[] {
    return parseQuestions(this.getAttribute('suggested-questions'));
  }

  set suggestedQuestions(value: readonly string[]) {
    this.setAttribute('suggested-questions', JSON.stringify(value));
  }

  get mode(): LuziaWidgetMode {
    return this.getAttribute('mode') === 'inline' ? 'inline' : 'bubble';
  }

  set mode(value: LuziaWidgetMode) {
    this.setAttribute('mode', value);
  }

  // Styles key off the attribute itself, so the theme needs no view work.
  get theme(): LuziaWidgetTheme {
    const theme = this.getAttribute('theme');
    return theme === 'dark' || theme === 'auto' ? theme : 'light';
  }

  set theme(value: LuziaWidgetTheme) {
    this.setAttribute('theme', value);
  }

  static get observedAttributes(): string[] {
    return ['greeting', 'suggested-questions', 'mode'];
  }

  connectedCallback(): void {
    if (this.#view) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${styles}</style>${TEMPLATE}`;
    persistConversation(this.conversation, storageKey(this.endpoint));
    this.#view = new View(root, this.conversation, () => this.contact);
    this.#view.configure(this);
  }

  attributeChangedCallback(): void {
    this.#view?.configure(this);
  }
}

/** Reads the `suggested-questions` attribute: a JSON array of strings. Anything else yields none. */
function parseQuestions(value: string | null): string[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

/** The options the view renders, read from the element's attributes. */
type ViewOptions = Required<Omit<LuziaWidgetConfig, 'endpoint' | 'theme' | 'contact'>>;

/** The widget's DOM: wires Visitor input to the conversation and renders its state. */
class View {
  readonly #bubble: HTMLButtonElement;
  readonly #panel: HTMLElement;
  readonly #close: HTMLButtonElement;
  readonly #body: HTMLElement;
  readonly #greeting: HTMLElement;
  readonly #messages: HTMLOListElement;
  readonly #suggestions: HTMLUListElement;
  readonly #alert: HTMLElement;
  readonly #form: HTMLFormElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #conversation: Conversation;
  readonly #contact: () => string;
  #lastSent = '';
  #mode: LuziaWidgetMode = 'bubble';

  constructor(root: ShadowRoot, conversation: Conversation, contact: () => string) {
    this.#conversation = conversation;
    this.#contact = contact;
    this.#bubble = root.querySelector('.bubble')!;
    this.#panel = root.querySelector('.panel')!;
    this.#close = root.querySelector('.close')!;
    this.#body = root.querySelector('.body')!;
    this.#greeting = root.querySelector('.greeting')!;
    this.#messages = root.querySelector('.messages')!;
    this.#suggestions = root.querySelector('.suggestions')!;
    this.#alert = root.querySelector('.alert')!;
    this.#form = root.querySelector('.composer')!;
    this.#input = this.#form.querySelector('textarea')!;
    this.#send = this.#form.querySelector('button')!;

    this.#bubble.addEventListener('click', () => this.#setOpen(this.#bubble.getAttribute('aria-expanded') !== 'true'));
    this.#close.addEventListener('click', () => this.#setOpen(false));
    root.querySelector('.new-conversation')!.addEventListener('click', () => {
      conversation.reset();
      this.#input.focus();
    });
    this.#form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit();
    });
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.#submit();
      }
    });

    conversation.subscribe((state) => this.#render(state));
    this.#render(conversation.state);
  }

  /** Applies the Owner's options; called on mount and whenever one changes. */
  configure(options: ViewOptions): void {
    const greeting = options.greeting.trim();
    this.#greeting.textContent = greeting;
    this.#greeting.hidden = !greeting;

    this.#suggestions.replaceChildren(
      ...options.suggestedQuestions.map((question) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'suggestion';
        button.textContent = question;
        button.addEventListener('click', () => this.#conversation.send(question));
        const item = document.createElement('li');
        item.append(button);
        return item;
      }),
    );
    this.#render(this.#conversation.state);

    if (options.mode !== this.#mode) this.#setMode(options.mode);
  }

  /** Inline: the panel is a always-open region of the page. Bubble: a dialog the bubble toggles. */
  #setMode(mode: LuziaWidgetMode): void {
    this.#mode = mode;
    const inline = mode === 'inline';
    this.#panel.setAttribute('role', inline ? 'region' : 'dialog');
    this.#bubble.hidden = inline;
    this.#close.hidden = inline;
    this.#setOpen(inline);
  }

  #setOpen(open: boolean): void {
    this.#panel.hidden = !open;
    this.#bubble.setAttribute('aria-expanded', String(open));
  }

  #submit(): void {
    const text = this.#input.value;
    if (this.#conversation.send(text)) {
      this.#lastSent = text;
      this.#input.value = '';
    }
  }

  #render(state: ConversationState): void {
    // Reuse existing message nodes so a streaming reply only updates its text.
    state.messages.forEach((message, index) => {
      const existing = this.#messages.children[index] as HTMLLIElement | undefined;
      let item = existing;
      if (!item || item.dataset.role !== message.role) {
        item = document.createElement('li');
        item.className = 'message';
        item.dataset.role = message.role;
        if (existing) existing.replaceWith(item);
        else this.#messages.append(item);
      }
      if (item.textContent !== message.content) item.textContent = message.content;
    });
    while (this.#messages.children.length > state.messages.length) this.#messages.lastElementChild?.remove();
    // Suggestions only help the Visitor start; once the conversation has begun they go away.
    this.#suggestions.hidden = state.messages.length > 0 || this.#suggestions.children.length === 0;
    this.#body.scrollTop = this.#body.scrollHeight;

    const streaming = state.status === 'streaming';
    this.#messages.setAttribute('aria-busy', String(streaming));

    // Error, limit and too-long states (see ./alert.ts).
    const failure = state.status === 'error' && state.error ? failureKind(state.error) : null;
    renderAlert(this.#alert, failure, this.#contact());
    const conversationOver = failure === 'limit';
    this.#input.disabled = conversationOver;
    this.#send.disabled = streaming || conversationOver;
    if (failure === 'too-long' && !this.#input.value) this.#input.value = this.#lastSent;
  }
}
