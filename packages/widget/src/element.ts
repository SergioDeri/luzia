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
  /**
   * URL of an image shown large and centred at the top of the chat, like a video call (the
   * Owner's photo, a logo…). Without one, luzIA's own icon is shown.
   */
  avatar?: string;
}

export type LuziaWidgetMode = 'bubble' | 'inline';
export type LuziaWidgetTheme = 'light' | 'dark' | 'auto';

// Lets this module be imported during server-side rendering, where there is no DOM.
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** luzIA's own introduction, in the page's language (Spanish or English), for Owners who set no greeting. */
function defaultGreeting(): string {
  const language = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
  return language.startsWith('es')
    ? '¡Hola! Soy luzIA, una IA que responde preguntas sobre la persona de este portfolio: su experiencia, sus proyectos y lo que busca. ¿Qué te gustaría saber?'
    : 'Hi! I’m luzIA, an AI agent that answers questions about the person behind this portfolio: their experience, their projects and what they’re looking for. What would you like to know?';
}

/** How long the speech bubble stays after the mouse leaves it. */
const SPEECH_AFTER_HOVER_MS = 2_000;

/** luzIA's own icon, in the accent colours so it follows the Owner's theme. */
const LUZIA_ICON = `<svg viewBox="0 0 32 32" width="100%" height="100%" focusable="false">
  <circle cx="16" cy="16" r="16" fill="var(--luzia-accent-contrast)" />
  <path d="M16 6l2.6 6.4L25 15l-6.4 2.6L16 24l-2.6-6.4L7 15l6.4-2.6z" fill="var(--luzia-accent)" />
</svg>`;

const TEMPLATE = `
  <section class="panel" role="dialog" aria-label="luzIA" hidden>
    <header class="header">
      <h2 class="title">luzIA</h2>
      <button type="button" class="new-conversation">New conversation</button>
      <button type="button" class="close" aria-label="Close luzIA chat">&times;</button>
    </header>
    <div class="stage">
      <span class="avatar" aria-hidden="true"></span>
      <p class="speech" aria-hidden="true" hidden><span class="speech-text"></span></p>
    </div>
    <div class="body">
      <p class="greeting" hidden></p>
      <ol class="messages" role="log" aria-live="off"></ol>
      <p class="announcer" role="status"></p>
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
 * itself, embedded where the element sits. Attributes (see
 * {@link LuziaWidgetConfig}): `endpoint`, `contact`, `greeting`,
 * `suggested-questions` (JSON array of strings), `mode`, `theme` and `avatar`. Each is
 * also a property (`suggestedQuestions` takes an array).
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

  /** The Owner's greeting; without the attribute, luzIA introduces itself. An empty `greeting=""` turns it off. */
  get greeting(): string {
    return this.getAttribute('greeting') ?? defaultGreeting();
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

  get avatar(): string {
    return this.getAttribute('avatar') ?? '';
  }

  set avatar(value: string) {
    this.setAttribute('avatar', value);
  }

  static get observedAttributes(): string[] {
    return ['greeting', 'suggested-questions', 'mode', 'avatar'];
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
  readonly #avatar: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #speech: HTMLElement;
  readonly #speechText: HTMLElement;
  /**
   * What luzIA is "saying" in the speech bubble, kept out of the history until
   * it ends: a reply (its index in the conversation) or the greeting.
   */
  #speaking: number | 'greeting' | null = null;
  #greetingText = '';
  readonly #host: HTMLElement;
  /** Stops following the visible area of the screen (see {@link View.#followViewport}). */
  #unfollowViewport: (() => void) | null = null;
  /** luzIA greets once per conversation: when the chat first shows, and again after "New conversation". */
  #greeted = false;
  #speechTimer: ReturnType<typeof setTimeout> | undefined;
  /** While the mouse is over the bubble, it stays (the Visitor may be reading or scrolling it). */
  #speechHovered = false;
  /** Once the mouse has been over the bubble and left, it goes soon after (the Visitor has seen it). */
  #speechVisited = false;
  readonly #messages: HTMLOListElement;
  readonly #announcer: HTMLElement;
  readonly #suggestions: HTMLUListElement;
  readonly #alert: HTMLElement;
  readonly #form: HTMLFormElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #conversation: Conversation;
  readonly #contact: () => string;
  #mode: LuziaWidgetMode = 'bubble';
  #wasStreaming = false;

  constructor(root: ShadowRoot, conversation: Conversation, contact: () => string) {
    this.#conversation = conversation;
    this.#host = root.host as HTMLElement;
    this.#contact = contact;
    this.#bubble = root.querySelector('.bubble')!;
    this.#panel = root.querySelector('.panel')!;
    this.#close = root.querySelector('.close')!;
    this.#body = root.querySelector('.body')!;
    this.#greeting = root.querySelector('.greeting')!;
    this.#avatar = root.querySelector('.avatar')!;
    this.#stage = root.querySelector('.stage')!;
    this.#speech = root.querySelector('.speech')!;
    this.#speechText = root.querySelector('.speech-text')!;
    this.#speech.addEventListener('mouseenter', () => {
      this.#speechHovered = true;
      this.#speechVisited = true;
      clearTimeout(this.#speechTimer);
      this.#speechTimer = undefined;
      this.#speech.classList.remove('leaving');
    });
    this.#speech.addEventListener('mouseleave', () => {
      this.#speechHovered = false;
      this.#render(this.#conversation.state);
    });
    this.#messages = root.querySelector('.messages')!;
    this.#announcer = root.querySelector('.announcer')!;
    this.#suggestions = root.querySelector('.suggestions')!;
    this.#alert = root.querySelector('.alert')!;
    this.#form = root.querySelector('.composer')!;
    this.#input = this.#form.querySelector('textarea')!;
    this.#send = this.#form.querySelector('button')!;

    this.#bubble.addEventListener('click', () => this.#toggle(this.#bubble.getAttribute('aria-expanded') !== 'true'));
    this.#close.addEventListener('click', () => this.#toggle(false));
    this.#panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#mode === 'bubble' && !event.isComposing) {
        event.preventDefault();
        this.#toggle(false);
      }
    });
    root.querySelector('.new-conversation')!.addEventListener('click', () => {
      conversation.reset();
      this.#greeted = false;
      this.#greet();
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
    this.#showAvatar(options.avatar.trim());

    this.#greetingText = options.greeting.trim();
    this.#greeting.textContent = this.#greetingText;

    this.#suggestions.replaceChildren(
      ...options.suggestedQuestions.map((question) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'suggestion';
        button.textContent = question;
        // The list hides once the conversation starts, so focus moves on to the message box.
        button.addEventListener('click', () => {
          if (this.#conversation.send(question)) this.#input.focus();
        });
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

  /**
   * The Visitor opens or closes the bubble's chat. Focus follows: into the
   * message box on open, back to the bubble on close.
   */
  #toggle(open: boolean): void {
    this.#setOpen(open);
    (open ? this.#input : this.#bubble).focus();
  }

  #setOpen(open: boolean): void {
    this.#panel.hidden = !open;
    this.#bubble.setAttribute('aria-expanded', String(open));
    if (open) this.#greet();
    this.#unfollowViewport?.();
    this.#unfollowViewport = open ? this.#followViewport() : null;
  }

  /**
   * On a phone the chat fills the screen, but an on-screen keyboard covers its
   * lower part and the browser scrolls the page under it, pushing luzIA's
   * picture and speech bubble out of view. While the chat is open it follows
   * the part of the screen that is actually visible (`visualViewport`), and
   * marks the host with `data-keyboard` so the picture gets smaller.
   */
  #followViewport(): (() => void) | null {
    const viewport = window.visualViewport;
    if (!viewport) return null;
    const fit = () => {
      const phone = this.#mode === 'bubble' && window.matchMedia('(max-width: 480px)').matches;
      if (!phone) return this.#clearViewport();
      this.#host.style.setProperty('--luzia-viewport-height', `${viewport.height}px`);
      this.#host.style.setProperty('--luzia-viewport-top', `${viewport.offsetTop}px`);
      // A keyboard takes a good part of the screen; browser bars alone don't.
      this.#host.toggleAttribute('data-keyboard', viewport.height < window.innerHeight * 0.75);
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
      this.#clearViewport();
    };
  }

  #clearViewport(): void {
    this.#host.style.removeProperty('--luzia-viewport-height');
    this.#host.style.removeProperty('--luzia-viewport-top');
    this.#host.removeAttribute('data-keyboard');
  }

  /** luzIA says the greeting in the bubble when a conversation starts empty (never over a restored one). */
  #greet(): void {
    if (this.#greeted || this.#panel.hidden) return;
    this.#greeted = true;
    if (!this.#greetingText || this.#conversation.state.messages.length > 0) return;
    this.#stopSpeaking();
    this.#speaking = 'greeting';
    this.#showSpeech(this.#greetingText);
    this.#render(this.#conversation.state);
  }

  /** The Owner's image at the top of the chat, or luzIA's icon. Decorative: the title already says "luzIA". */
  #showAvatar(url: string): void {
    const current = this.#avatar.querySelector('img')?.getAttribute('src') ?? null;
    if (url && current === url) return;
    if (!url && current === null && this.#avatar.firstChild) return;
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      this.#avatar.replaceChildren(image);
    } else {
      this.#avatar.innerHTML = LUZIA_ICON;
    }
  }

  /** Sends what the Visitor typed; focus stays in (or returns to) the message box, since Send disables while streaming. */
  #submit(): void {
    const text = this.#input.value;
    if (!this.#conversation.send(text)) return;
    this.#input.value = '';
    this.#input.focus();
  }

  /**
   * The transcript is a log that is not live itself: announcing it would read
   * every streamed token. Instead the status region reads each reply once,
   * when it has finished streaming. Errors are announced by the alert.
   */
  #announce(state: ConversationState, streaming: boolean): void {
    const finished = this.#wasStreaming && !streaming;
    this.#wasStreaming = streaming;
    if (streaming || state.messages.length === 0) this.#announcer.textContent = '';
    if (!finished) return;
    const last = state.messages.at(-1);
    this.#announcer.textContent = state.status === 'idle' && last?.role === 'assistant' ? last.content : '';
  }

  /**
   * Like a video call, luzIA "says" each reply in a bubble over the picture as
   * it streams in; it stays a few seconds after it ends, then fades and the
   * reply takes its place in the history. A new question, an error or a reset
   * moves it to the history at once; a restored conversation never uses it.
   * The bubble is decorative: the status region announces each reply.
   */
  #updateSpeech(state: ConversationState, streaming: boolean): void {
    const last = state.messages.length - 1;
    const lastIsReply = state.messages[last]?.role === 'assistant';
    if (streaming && lastIsReply) {
      if (this.#speaking !== last) this.#stopSpeaking();
      this.#speaking = last;
      clearTimeout(this.#speechTimer);
      this.#showSpeech(state.messages[last]!.content);
    } else if (this.#speaking !== null) {
      const greeting = this.#speaking === 'greeting';
      // The greeting stays until the Visitor says something; a reply until another one starts.
      const stillSaying = greeting ? state.messages.length === 0 : this.#speaking === last && state.status === 'idle';
      if (!stillSaying) this.#stopSpeaking();
      else if (this.#speechTimer === undefined && !this.#speechHovered) {
        const text = greeting ? this.#greetingText : state.messages[last]!.content;
        const delay = this.#speechVisited ? SPEECH_AFTER_HOVER_MS : Math.min(10_000, 4_000 + text.length * 40);
        this.#speechTimer = setTimeout(() => this.#fadeSpeech(), delay);
      }
    }
    // What is being said stays out of the history until the bubble is gone.
    [...this.#messages.children].forEach((item, index) => {
      (item as HTMLElement).hidden = index === this.#speaking;
    });
    this.#greeting.hidden = !this.#greetingText || this.#speaking === 'greeting';
  }

  #showSpeech(text: string): void {
    this.#speech.classList.remove('leaving');
    // Nothing to say yet (the reply hasn't started): no empty bubble.
    this.#speech.hidden = text === '';
    this.#stage.toggleAttribute('data-saying', !this.#speech.hidden);
    // The bubble shows the reply from its beginning; the Visitor scrolls to read the rest.
    if (this.#speechText.textContent !== text) this.#speechText.textContent = text;
  }

  #fadeSpeech(): void {
    this.#speech.classList.add('leaving');
    this.#speechTimer = setTimeout(() => {
      this.#stopSpeaking();
      this.#render(this.#conversation.state);
    }, 400);
  }

  #stopSpeaking(): void {
    clearTimeout(this.#speechTimer);
    this.#speechTimer = undefined;
    this.#speaking = null;
    this.#speech.hidden = true;
    this.#speechHovered = false;
    this.#speechVisited = false;
    this.#stage.removeAttribute('data-saying');
    this.#speechText.scrollTop = 0;
    this.#speech.classList.remove('leaving');
    this.#speechText.textContent = '';
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
    const streaming = state.status === 'streaming';
    this.#updateSpeech(state, streaming);
    this.#body.scrollTop = this.#body.scrollHeight;

    // Like a video call: luzIA's avatar lights up while the reply comes in.
    this.#stage.toggleAttribute('data-speaking', streaming);
    this.#messages.setAttribute('aria-busy', String(streaming));
    this.#announce(state, streaming);

    // Error, limit and too-long states (see ./alert.ts).
    const failure = state.status === 'error' && state.error ? failureKind(state.error) : null;
    renderAlert(this.#alert, failure, this.#contact());
    const conversationOver = failure === 'limit';
    this.#input.disabled = conversationOver;
    this.#send.disabled = streaming || conversationOver;
    // A message that got no reply is given back for editing or resending (see ConversationState.unsent).
    if (state.unsent !== null && !conversationOver && !this.#input.value) this.#input.value = state.unsent;
  }
}
