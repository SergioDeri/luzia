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

  const chat = (): HTMLElement | null => root().querySelector<HTMLElement>('[role="dialog"]');

  const messageBox = (): HTMLTextAreaElement => {
    const box = root().querySelector<HTMLTextAreaElement>('textarea[aria-label="Message luzIA"]');
    if (!box) throw new Error('No "Message luzIA" text box.');
    return box;
  };

  return {
    button,
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
    alert: () => {
      const alert = root().querySelector<HTMLElement>('[role="alert"]');
      return alert && !alert.hidden ? (alert.textContent?.trim() ?? '') : null;
    },
    /** Where the link inside the alert (e.g. the Owner's contact) points, if there is one. */
    alertLink: () => root().querySelector<HTMLAnchorElement>('[role="alert"] a')?.getAttribute('href') ?? null,
    /** Whether the Visitor can currently type and send a message. */
    canSend: () => !messageBox().disabled && !button('Send').disabled,
  };
}
