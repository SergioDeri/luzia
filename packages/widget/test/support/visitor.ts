import { settle } from './fake-fetch.ts';

/**
 * What a Visitor can see and do with a mounted widget, addressed by role and
 * accessible name rather than by internal structure.
 */
export function visitor(host: Element) {
  const root = (): ShadowRoot => {
    if (!host.shadowRoot) throw new Error('The widget has not rendered (no open shadow root).');
    return host.shadowRoot;
  };

  const button = (name: string): HTMLButtonElement => {
    const match = [...root().querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
    );
    if (!match) throw new Error(`No button named "${name}".`);
    return match;
  };

  /** The chat: a dialog in bubble mode, a region in inline mode. */
  const chat = (): HTMLElement | null =>
    root().querySelector<HTMLElement>('[role="dialog"], [role="region"][aria-label="luzIA"]');

  const messageBox = (): HTMLTextAreaElement => {
    const box = root().querySelector<HTMLTextAreaElement>('textarea[aria-label="Message luzIA"]');
    if (!box) throw new Error('No "Message luzIA" text box.');
    return box;
  };

  /** The accessible name of a control, as a screen reader would announce it. */
  const nameOf = (el: Element): string =>
    el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';

  const isOnScreen = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if ((node as HTMLElement).hidden || getComputedStyle(node).display === 'none') return false;
    }
    return true;
  };

  return {
    host,
    button,
    /** The accessible name of the control that has keyboard focus inside the widget, or `null`. */
    focused: (): string | null => {
      if (document.activeElement !== host) return null;
      const active = root().activeElement;
      return active ? nameOf(active) : null;
    },
    /** Moves keyboard focus to the control with this accessible name, as Tab would. */
    focus: (name: string) => {
      const match = [...root().querySelectorAll<HTMLElement>('button, textarea')].find((el) => nameOf(el) === name);
      if (!match) throw new Error(`No control named "${name}".`);
      match.focus();
    },
    /** Presses a key on whatever has focus, as the browser would dispatch it. */
    press: async (key: string) => {
      const target = root().activeElement ?? host;
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
      await settle();
    },
    /**
     * The controls a keyboard user reaches with Tab, in order, by accessible
     * name. Only native buttons and text boxes count: those are what the
     * browser makes focusable and operable with Enter/Space.
     */
    tabOrder: (): string[] =>
      [...root().querySelectorAll<HTMLElement>('button, textarea, [tabindex]')]
        .filter((el) => isOnScreen(el) && !(el as HTMLButtonElement).disabled && el.tabIndex >= 0)
        .map(nameOf),
    /**
     * What polite live regions would announce right now: their text, skipping
     * regions marked busy (screen readers wait until they settle). The
     * `role="alert"` area is assertive and read through {@link alert}.
     */
    announcement: (): string =>
      [...root().querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="log"]')]
        .filter((el) => {
          const live = el.getAttribute('aria-live');
          if (live === 'off' || live === 'assertive' || el.getAttribute('role') === 'alert') return false;
          return el.getAttribute('aria-busy') !== 'true';
        })
        .map((el) => el.textContent?.trim() ?? '')
        .join(' ')
        .trim(),
    /** Whether a button with this name is on screen. */
    hasButton: (name: string) => {
      const match = [...root().querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
      );
      for (let el: Element | null = match ?? null; el; el = el.parentElement) {
        if ((el as HTMLElement).hidden || getComputedStyle(el).display === 'none') return false;
      }
      return match !== undefined;
    },
    /** Whether the chat panel is on screen. */
    isChatOpen: () => {
      const panel = chat();
      return panel !== null && !panel.hidden;
    },
    chatTitle: () => chat()?.querySelector('h2')?.textContent ?? null,
    /** luzIA's avatar at the top of the chat (like a video call): the Owner's image (its URL) or luzIA's icon. */
    avatar: (): { image: string | null; decorative: boolean; speaking: boolean } | null => {
      const stage = chat()?.querySelector<HTMLElement>('.stage');
      const avatar = stage?.querySelector<HTMLElement>('.avatar');
      if (!stage || !avatar || stage.hidden) return null;
      const image = avatar.querySelector('img');
      return {
        image: image?.getAttribute('src') ?? null,
        decorative: avatar.getAttribute('aria-hidden') === 'true' || image?.getAttribute('alt') === '',
        speaking: stage.hasAttribute('data-speaking'),
      };
    },
    /** Whether the avatar comes before the conversation in the chat (on top of it). */
    avatarAboveConversation: (): boolean => {
      const stage = chat()?.querySelector('.stage');
      const log = chat()?.querySelector('[role="log"]');
      return Boolean(stage && log && stage.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING && !stage.contains(log));
    },
    chatLabel: () => chat()?.getAttribute('aria-label') ?? null,
    click: async (name: string) => {
      button(name).click();
      await settle();
    },
    type: (text: string) => {
      const box = messageBox();
      box.value = text;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    },
    pressEnter: async () => {
      messageBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await settle();
    },
    messageBoxValue: () => messageBox().value,
    /** The conversation as rendered: who said what, in order. */
    /** The text in luzIA's speech bubble over the picture, or `null` when there is none on screen. */
    speechBubble: (): string | null => {
      const bubble = chat()?.querySelector<HTMLElement>('.speech');
      return bubble && isOnScreen(bubble) ? (bubble.textContent ?? '') : null;
    },
    /** Whether the speech bubble is hidden from screen readers (replies are announced by the status region). */
    speechBubbleIsDecorative: (): boolean => chat()?.querySelector('.speech')?.getAttribute('aria-hidden') === 'true',
    /** The conversation as the Visitor sees it in the history below the picture (messages on screen only). */
    visibleTranscript: () =>
      [...root().querySelectorAll<HTMLElement>('[data-role]')].filter(isOnScreen).map((el) => ({
        role: el.dataset.role,
        text: el.textContent ?? '',
      })),
    transcript: () =>
      [...root().querySelectorAll<HTMLElement>('[data-role]')].map((el) => ({
        role: el.dataset.role,
        text: el.textContent ?? '',
      })),
    alert: () => {
      const alert = root().querySelector<HTMLElement>('[role="alert"]');
      return alert && !alert.hidden ? (alert.textContent?.trim() ?? '') : null;
    },
    /** Where the link inside the alert (e.g. the Owner's contact) points, if there is one. */
    alertLink: () => root().querySelector<HTMLAnchorElement>('[role="alert"] a')?.getAttribute('href') ?? null,
    /** Whether the Visitor can currently type and send a message. */
    canSend: () => !messageBox().disabled && !button('Send').disabled,
    /** The greeting shown in the open chat, or `null` when there is none. */
    greeting: () => {
      const greeting = chat()?.querySelector<HTMLElement>('.greeting');
      return greeting && !greeting.hidden ? (greeting.textContent?.trim() ?? '') : null;
    },
    /**
     * The chat panel's box as the stylesheet lays it out for the current
     * viewport. The DOM test environment resolves media queries and viewport
     * units but does no real layout, so this is the computed style, not a
     * measured rectangle.
     */
    chatBox: () => {
      const panel = chat();
      if (!panel) throw new Error('No chat panel.');
      const { position, top, left, width, height } = getComputedStyle(panel);
      return { position, top, left, width, height };
    },
    /** The smallest size the stylesheet guarantees a control, in CSS pixels (0 when unset). */
    tapTarget: (name: string) => {
      const { minWidth, minHeight } = getComputedStyle(button(name));
      return { width: parseFloat(minWidth) || 0, height: parseFloat(minHeight) || 0 };
    },
    /** The chat's background and text colours, as computed. */
    chatColors: () => {
      const panel = chat();
      if (!panel) throw new Error('No chat panel.');
      const style = getComputedStyle(panel);
      return { surface: style.backgroundColor, text: style.color };
    },
    /** The suggested questions the Visitor can click right now. */
    suggestedQuestions: () => {
      const list = chat()?.querySelector<HTMLElement>('[aria-label="Suggested questions"]');
      if (!list || list.hidden) return [];
      return [...list.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
    },
  };
}
