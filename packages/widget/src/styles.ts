/** Shadow DOM styles. Theme tokens are CSS custom properties hosts can override. */
export const styles = `
  :host {
    --luzia-accent: #4f46e5;
    --luzia-accent-contrast: #ffffff;
    --luzia-surface: #ffffff;
    --luzia-text: #18181b;
    --luzia-muted: #f4f4f5;
    --luzia-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 2147483000;
    font-family: var(--luzia-font);
    color: var(--luzia-text);
  }
  [hidden] { display: none !important; }
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
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--luzia-accent);
    color: var(--luzia-accent-contrast);
  }
  .title { margin: 0; font-size: 1rem; }
  .close {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
  }
  .messages {
    flex: 1;
    margin: 0;
    padding: 1rem;
    list-style: none;
    overflow-y: auto;
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
  .alert {
    margin: 0 1rem 0.5rem;
    font-size: 0.875rem;
    color: #b91c1c;
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
    border: 1px solid #d4d4d8;
    border-radius: 0.5rem;
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
`;
