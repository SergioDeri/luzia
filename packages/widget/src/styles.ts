/**
 * Shadow DOM styles. Theme tokens are CSS custom properties the Owner can
 * override on the element (`luzia-widget { --luzia-accent: #e11d48; }`); an
 * Owner's value wins over both the light and the dark palette.
 *
 * - `--luzia-accent` / `--luzia-accent-contrast`: bubble, header, Visitor messages, buttons, and text on them
 * - `--luzia-surface` / `--luzia-text`: chat background and text
 * - `--luzia-muted`: Agent messages, greeting and suggested questions
 * - `--luzia-border`: input and inline-panel borders
 * - `--luzia-font`: font family
 * - `--luzia-inline-height`: height of the chat in inline mode
 *
 * Every control is at least 44px square (a comfortable tap target) and shows
 * a focus ring for keyboard users. Below 480px wide the bubble's chat fills
 * the screen; the inline chat stays in the page at full width.
 */
export const styles = `
  :host {
    --luzia-accent: #4f46e5;
    --luzia-accent-contrast: #ffffff;
    --luzia-surface: #ffffff;
    --luzia-text: #18181b;
    --luzia-muted: #f4f4f5;
    --luzia-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
    --luzia-border: #d4d4d8;
    --luzia-inline-height: 32rem;
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 2147483000;
    font-family: var(--luzia-font);
    color: var(--luzia-text);
  }
  :host([theme='dark']) {
    --luzia-surface: #18181b;
    --luzia-text: #f4f4f5;
    --luzia-muted: #27272a;
    --luzia-border: #3f3f46;
  }
  @media (prefers-color-scheme: dark) {
    :host([theme='auto']) {
      --luzia-surface: #18181b;
      --luzia-text: #f4f4f5;
      --luzia-muted: #27272a;
      --luzia-border: #3f3f46;
    }
  }
  [hidden] { display: none !important; }
  button { min-width: 44px; min-height: 44px; }
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--luzia-accent);
    outline-offset: 2px;
  }
  /* The header is accent-coloured, so its focus ring takes the text colour. */
  .header button:focus-visible { outline-color: currentColor; outline-offset: -4px; }
  /* Read by screen readers only: each finished reply (see the element's View). */
  .announcer {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .bubble {
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    margin-left: auto;
    border: none;
    border-radius: 50%;
    background: var(--luzia-accent);
    color: var(--luzia-accent-contrast);
    font: 600 0.8rem var(--luzia-font);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
    cursor: pointer;
  }
  .panel {
    display: flex;
    flex-direction: column;
    width: min(24rem, calc(100vw - 2.5rem));
    height: min(34rem, calc(100vh - 7rem));
    margin-bottom: 0.75rem;
    background: var(--luzia-surface);
    border-radius: 1rem;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.2);
    overflow: hidden;
  }
  :host([mode='inline']) {
    position: static;
    display: block;
    z-index: auto;
  }
  :host([mode='inline']) .panel {
    position: static;
    width: 100%;
    height: var(--luzia-inline-height);
    margin: 0;
    border: 1px solid var(--luzia-border);
    box-shadow: none;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem 0.25rem 1rem;
    background: var(--luzia-accent);
    color: var(--luzia-accent-contrast);
  }
  .avatar {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    margin-inline-end: 0.5rem;
    border-radius: 50%;
    overflow: hidden;
  }
  .avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .title { margin: 0; font-size: 1rem; }
  .new-conversation {
    margin-inline: auto 0.5rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid currentColor;
    border-radius: 0.375rem;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .close {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    overflow-y: auto;
  }
  .greeting {
    align-self: flex-start;
    max-width: 85%;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    background: var(--luzia-muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .messages {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .message {
    max-width: 85%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .message[data-role='user'] {
    align-self: flex-end;
    background: var(--luzia-accent);
    color: var(--luzia-accent-contrast);
  }
  .message[data-role='assistant'] {
    align-self: flex-start;
    background: var(--luzia-muted);
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin: auto 0 0;
    padding: 0;
    list-style: none;
  }
  .suggestion {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--luzia-accent);
    border-radius: 999px;
    background: var(--luzia-surface);
    color: var(--luzia-text);
    font: 0.875rem var(--luzia-font);
    text-align: left;
    cursor: pointer;
  }
  .suggestion:hover { background: var(--luzia-muted); }
  .alert {
    margin: 0 1rem 0.5rem;
    font-size: 0.875rem;
    color: #b91c1c;
  }
  .alert a {
    color: inherit;
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--luzia-muted);
  }
  .composer textarea {
    flex: 1;
    resize: none;
    padding: 0.5rem;
    border: 1px solid var(--luzia-border);
    border-radius: 0.5rem;
    background: var(--luzia-surface);
    color: var(--luzia-text);
    font: inherit;
  }
  .composer button {
    padding: 0 1rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--luzia-accent);
    color: var(--luzia-accent-contrast);
    font: 600 0.875rem var(--luzia-font);
    cursor: pointer;
  }
  .composer button:disabled { opacity: 0.5; cursor: default; }
  @media (max-width: 480px) {
    .panel {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      margin: 0;
      border-radius: 0;
    }
    @supports (height: 100dvh) {
      .panel { height: 100dvh; }
    }
    /* Inline, the chat stays in the page but never taller than the screen. */
    :host([mode='inline']) .panel { height: min(var(--luzia-inline-height), 85vh); }
    .composer { padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }
    /* Below 16px, mobile browsers zoom the page when the text box gets focus. */
    .composer textarea { font-size: 16px; }
  }
`;
