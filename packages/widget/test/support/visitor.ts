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

  return {
    host,
    button,
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
    transcript: () =>
      [...root().querySelectorAll<HTMLElement>('[data-role]')].map((el) => ({
        role: el.dataset.role,
        text: el.textContent ?? '',
      })),
    alert: () => root().querySelector('[role="alert"]')?.textContent?.trim() ?? null,
    /** The greeting shown in the open chat, or `null` when there is none. */
    greeting: () => {
      const greeting = chat()?.querySelector<HTMLElement>('.greeting');
      return greeting && !greeting.hidden ? (greeting.textContent?.trim() ?? '') : null;
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
