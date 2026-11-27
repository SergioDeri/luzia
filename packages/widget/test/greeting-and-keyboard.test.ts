import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLuziaWidget } from '../src/index.ts';
import { installFakeFetch, type FakeFetch } from './support/fake-fetch.ts';
import { visitor } from './support/visitor.ts';

function mountWidget(attributes: Record<string, string> = {}) {
  const host = document.createElement('luzia-widget');
  for (const [name, value] of Object.entries({ endpoint: '/api/luzia', ...attributes })) host.setAttribute(name, value);
  document.body.append(host);
  return visitor(host);
}

let server: FakeFetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  defineLuziaWidget();
  server = installFakeFetch();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('lang');
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('greeting said by luzIA', () => {
  it('says the greeting in the speech bubble when the chat opens, then keeps it in the history', async () => {
    const widget = mountWidget({ greeting: 'Hi! Ask me anything about Jamie.' });
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toBe('Hi! Ask me anything about Jamie.');
    expect(widget.greeting()).toBeNull();

    await vi.advanceTimersByTimeAsync(12_000);
    expect(widget.speechBubble()).toBeNull();
    expect(widget.greeting()).toBe('Hi! Ask me anything about Jamie.');
  });

  it('greets with a default introduction of luzIA when the Owner sets no greeting', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toMatch(/I’m luzIA, an AI agent that answers questions about/);
  });

  it('greets with the Owner’s name when the server shares it', async () => {
    server.answerOwner('Sergio Deri');
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toMatch(/I’m luzIA, an AI agent that answers questions about Sergio Deri:/);
    expect(server.ownerRequests).toEqual(['/api/luzia']);
  });

  it('greets with the Owner’s name in Spanish on a Spanish page', async () => {
    document.documentElement.lang = 'es';
    server.answerOwner('Sergio Deri');
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toMatch(/Soy luzIA, una IA que responde preguntas sobre Sergio Deri:/);
  });

  it('does not ask the server when the Owner wrote their own greeting', async () => {
    server.answerOwner('Sergio Deri');
    const widget = mountWidget({ greeting: 'Hello!' });
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toBe('Hello!');
    expect(server.ownerRequests).toEqual([]);
  });

  it('greets in Spanish on a Spanish page', async () => {
    document.documentElement.lang = 'es';
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toMatch(/Soy luzIA, una IA que responde preguntas sobre/);
  });

  it('says nothing when the Owner turns the greeting off with an empty greeting', async () => {
    const widget = mountWidget({ greeting: '' });
    await widget.click('luzIA chat');

    expect(widget.speechBubble()).toBeNull();
    expect(widget.greeting()).toBeNull();
  });

  it('greets again when the Visitor starts a new conversation', async () => {
    const widget = mountWidget({ greeting: 'Hello!' });
    await widget.click('luzIA chat');
    await vi.advanceTimersByTimeAsync(12_000);
    widget.type('Is Jamie available?');
    await widget.click('Send');
    const reply = await server.nextReply();
    await reply.push('Yes.');
    await reply.end();
    await vi.advanceTimersByTimeAsync(12_000);

    await widget.click('New conversation');

    expect(widget.speechBubble()).toBe('Hello!');
  });

  it('does not greet over a conversation restored after a reload', async () => {
    const first = mountWidget({ greeting: 'Hello!' });
    await first.click('luzIA chat');
    first.type('Is Jamie available?');
    await first.click('Send');
    const reply = await server.nextReply();
    await reply.push('Yes.');
    await reply.end();
    await vi.advanceTimersByTimeAsync(15_000);
    document.body.replaceChildren();

    const again = mountWidget({ greeting: 'Hello!' });
    await again.click('luzIA chat');

    expect(again.speechBubble()).toBeNull();
  });

  it('moves the greeting to the history at once when the Visitor asks something', async () => {
    const widget = mountWidget({ greeting: 'Hello!' });
    await widget.click('luzIA chat');

    widget.type('Is Jamie available?');
    await widget.click('Send');

    expect(widget.greeting()).toBe('Hello!');
  });
});

describe('phone keyboard', () => {
  type HappyWindow = { happyDOM: { setViewport(size: { width: number; height: number }): void } };
  const setViewport = (width: number, height: number) =>
    (window as unknown as HappyWindow).happyDOM.setViewport({ width, height });

  afterEach(() => setViewport(1024, 768));

  it('fits the chat to the part of the screen above the on-screen keyboard', async () => {
    setViewport(375, 667);
    const viewport = Object.assign(new EventTarget(), { width: 375, height: 667, offsetTop: 0, offsetLeft: 0 });
    vi.stubGlobal('visualViewport', viewport);
    const widget = mountWidget();
    await widget.click('luzIA chat');

    // The keyboard opens: the visible area shrinks and the page scrolls under it.
    Object.assign(viewport, { height: 380, offsetTop: 120 });
    viewport.dispatchEvent(new Event('resize'));

    expect(widget.chatBox()).toMatchObject({ position: 'fixed', top: '120px', height: '380px' });
    expect((widget.host as HTMLElement).hasAttribute('data-keyboard')).toBe(true);

    // It closes again.
    Object.assign(viewport, { height: 667, offsetTop: 0 });
    viewport.dispatchEvent(new Event('resize'));
    expect(widget.chatBox()).toMatchObject({ top: '0px', height: '667px' });
    expect((widget.host as HTMLElement).hasAttribute('data-keyboard')).toBe(false);
  });
});
