import { Conversation, type ConversationState } from './conversation.ts';
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
}

// Lets this module be imported during server-side rendering, where there is no DOM.
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

const TEMPLATE = `
  <section class="panel" role="dialog" aria-label="luzIA" hidden>
    <header class="header">
      <h2 class="title">luzIA</h2>
      <button type="button" class="close" aria-label="Close luzIA chat">&times;</button>
    </header>
    <ol class="messages" role="log" aria-live="polite"></ol>
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
 * panel where the Visitor talks to the Agent.
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

  connectedCallback(): void {
    if (this.#view) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${styles}</style>${TEMPLATE}`;
    this.#view = new View(root, this.conversation);
  }
}

/** The widget's DOM: wires Visitor input to the conversation and renders its state. */
class View {
  readonly #bubble: HTMLButtonElement;
  readonly #panel: HTMLElement;
  readonly #messages: HTMLOListElement;
  readonly #alert: HTMLElement;
  readonly #form: HTMLFormElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #conversation: Conversation;

  constructor(root: ShadowRoot, conversation: Conversation) {
    this.#conversation = conversation;
    this.#bubble = root.querySelector('.bubble')!;
    this.#panel = root.querySelector('.panel')!;
    this.#messages = root.querySelector('.messages')!;
    this.#alert = root.querySelector('.alert')!;
    this.#form = root.querySelector('.composer')!;
    this.#input = this.#form.querySelector('textarea')!;
    this.#send = this.#form.querySelector('button')!;

    this.#bubble.addEventListener('click', () => this.#setOpen(this.#bubble.getAttribute('aria-expanded') !== 'true'));
    root.querySelector('.close')!.addEventListener('click', () => this.#setOpen(false));
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

  #setOpen(open: boolean): void {
    this.#panel.hidden = !open;
    this.#bubble.setAttribute('aria-expanded', String(open));
  }

  #submit(): void {
    if (this.#conversation.send(this.#input.value)) this.#input.value = '';
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
    this.#messages.scrollTop = this.#messages.scrollHeight;

    const streaming = state.status === 'streaming';
    this.#send.disabled = streaming;
    this.#messages.setAttribute('aria-busy', String(streaming));

    this.#alert.hidden = state.status !== 'error';
    this.#alert.textContent = state.status === 'error' ? 'luzIA is unavailable right now. Please try again later.' : '';
  }
}
