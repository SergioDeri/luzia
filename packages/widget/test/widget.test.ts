import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLuziaWidget, type LuziaWidgetElement } from '../src/index.ts';
import { installFakeFetch, type FakeFetch } from './support/fake-fetch.ts';
import { visitor } from './support/visitor.ts';

function mountWidget(attributes: Record<string, string> = { endpoint: '/api/luzia' }) {
  const host = document.createElement('luzia-widget');
  for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
  document.body.append(host);
  return visitor(host);
}

let server: FakeFetch;

beforeEach(() => {
  defineLuziaWidget();
  server = installFakeFetch();
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('floating bubble', () => {
  it('starts closed and opens a chat panel titled "luzIA"', async () => {
    const widget = mountWidget();
    expect(widget.isChatOpen()).toBe(false);

    await widget.click('luzIA chat');

    expect(widget.isChatOpen()).toBe(true);
    expect(widget.chatTitle()).toBe('luzIA');
    expect(widget.chatLabel()).toBe('luzIA');
  });

  it('closes the chat panel from the panel and from the bubble', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    await widget.click('Close luzIA chat');
    expect(widget.isChatOpen()).toBe(false);

    await widget.click('luzIA chat');
    await widget.click('luzIA chat');
    expect(widget.isChatOpen()).toBe(false);
  });
});

describe('chatting', () => {
  it('sends the Visitor message to the configured endpoint', async () => {
    const widget = mountWidget({ endpoint: 'https://luzia.example.com/chat' });
    await widget.click('luzIA chat');

    widget.type('What role is Jamie looking for?');
    await widget.click('Send');

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request?.url).toBe('https://luzia.example.com/chat');
    expect(request?.method).toBe('POST');
    expect(request?.headers.get('content-type')).toBe('application/json');
    expect(request?.body).toEqual({ messages: [{ role: 'user', content: 'What role is Jamie looking for?' }] });
    expect(widget.transcript()[0]).toEqual({ role: 'user', text: 'What role is Jamie looking for?' });
    expect(widget.messageBoxValue()).toBe('');
  });

  it('renders the reply incrementally as it streams in', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.click('Send');
    const reply = await server.nextReply();

    await reply.push('Jamie is looking ');
    expect(widget.transcript().at(-1)).toEqual({ role: 'assistant', text: 'Jamie is looking ' });

    await reply.push('for a senior full-stack role.');
    expect(widget.transcript().at(-1)).toEqual({ role: 'assistant', text: 'Jamie is looking for a senior full-stack role.' });

    await reply.end();
    expect(widget.transcript()).toEqual([
      { role: 'user', text: 'What role is Jamie looking for?' },
      { role: 'assistant', text: 'Jamie is looking for a senior full-stack role.' },
    ]);
  });

  it('sends the earlier conversation along with a follow-up question', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.click('Send');
    const reply = await server.nextReply();
    await reply.push('A senior full-stack role.');
    await reply.end();

    widget.type('Remote?');
    await widget.pressEnter();

    expect(server.requests.at(-1)?.body).toEqual({
      messages: [
        { role: 'user', content: 'What role is Jamie looking for?' },
        { role: 'assistant', content: 'A senior full-stack role.' },
        { role: 'user', content: 'Remote?' },
      ],
    });
  });

  it('does not send an empty message or a second one while a reply is streaming', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    widget.type('   ');
    await widget.click('Send');
    expect(server.requests).toHaveLength(0);

    widget.type('First question');
    await widget.click('Send');
    widget.type('Second question');
    await widget.click('Send');
    expect(server.requests).toHaveLength(1);
    expect(widget.messageBoxValue()).toBe('Second question');
  });

  it('tells the Visitor when luzIA cannot be reached', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    server.failNextWithNetworkError();

    widget.type('Hello?');
    await widget.click('Send');

    expect(widget.alert()).toMatch(/luzIA is unavailable/i);
    expect(widget.transcript()).toEqual([{ role: 'user', text: 'Hello?' }]);
  });
});

describe('greeting', () => {
  it('greets the Visitor when the chat opens, without sending the greeting to the server', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', greeting: 'Hi! Ask me anything about Jamie.' });
    await widget.click('luzIA chat');

    expect(widget.greeting()).toBe('Hi! Ask me anything about Jamie.');

    widget.type('Is Jamie available?');
    await widget.click('Send');
    expect(server.requests[0]?.body).toEqual({ messages: [{ role: 'user', content: 'Is Jamie available?' }] });
    expect(widget.greeting()).toBe('Hi! Ask me anything about Jamie.');
  });

  it('shows no greeting when none is configured', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.greeting()).toBeNull();
  });
});

describe('suggested questions', () => {
  const suggestions = JSON.stringify(['What role is Jamie looking for?', 'Is Jamie open to remote work?']);

  it('offers the configured questions and sends one when the Visitor clicks it', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': suggestions });
    await widget.click('luzIA chat');

    expect(widget.suggestedQuestions()).toEqual(['What role is Jamie looking for?', 'Is Jamie open to remote work?']);

    await widget.click('Is Jamie open to remote work?');

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.body).toEqual({ messages: [{ role: 'user', content: 'Is Jamie open to remote work?' }] });
    expect(widget.transcript()[0]).toEqual({ role: 'user', text: 'Is Jamie open to remote work?' });
  });

  it('hides the suggestions once the conversation has started', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': suggestions });
    await widget.click('luzIA chat');

    widget.type('Hello');
    await widget.click('Send');

    expect(widget.suggestedQuestions()).toEqual([]);
  });

  it('can be set as an array through the element property', async () => {
    const widget = mountWidget();
    (widget.host as LuziaWidgetElement).suggestedQuestions = ['What stack does Jamie use?'];
    await widget.click('luzIA chat');

    expect(widget.suggestedQuestions()).toEqual(['What stack does Jamie use?']);
  });

  it('ignores a value that is not a JSON array of strings', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': 'What role? | Remote?' });
    await widget.click('luzIA chat');

    expect(widget.suggestedQuestions()).toEqual([]);
  });

  it('shows the suggestions again when the Owner changes them before the Visitor starts', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': suggestions });
    widget.host.setAttribute('suggested-questions', JSON.stringify(['What stack does Jamie use?']));
    await widget.click('luzIA chat');

    expect(widget.suggestedQuestions()).toEqual(['What stack does Jamie use?']);
  });
});

describe('inline mode', () => {
  it('renders the chat inside the host element, already open and with no bubble', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline', greeting: 'Ask me about Jamie.' });

    expect(widget.isChatOpen()).toBe(true);
    expect(widget.chatTitle()).toBe('luzIA');
    expect(widget.chatLabel()).toBe('luzIA');
    expect(widget.greeting()).toBe('Ask me about Jamie.');
    expect(widget.hasButton('luzIA chat')).toBe(false);
    expect(widget.hasButton('Close luzIA chat')).toBe(false);
    expect(getComputedStyle(widget.host).position).not.toBe('fixed');
  });

  it('lets the Visitor chat inline', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline' });

    widget.type('What role is Jamie looking for?');
    await widget.click('Send');
    const reply = await server.nextReply();
    await reply.push('A senior full-stack role.');
    await reply.end();

    expect(widget.transcript()).toEqual([
      { role: 'user', text: 'What role is Jamie looking for?' },
      { role: 'assistant', text: 'A senior full-stack role.' },
    ]);
  });

  it('uses the floating bubble by default and when switched back from inline', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline' });
    widget.host.setAttribute('mode', 'bubble');

    expect(widget.isChatOpen()).toBe(false);
    expect(widget.hasButton('luzIA chat')).toBe(true);
    expect(getComputedStyle(widget.host).position).toBe('fixed');
  });
});

describe('theme', () => {
  const LIGHT = { surface: '#ffffff', text: '#18181b' };
  const DARK = { surface: '#18181b', text: '#f4f4f5' };

  function prefersColorScheme(scheme: 'light' | 'dark') {
    (window as unknown as { happyDOM: { settings: { device: { prefersColorScheme: string } } } }).happyDOM.settings.device.prefersColorScheme = scheme;
  }

  afterEach(() => prefersColorScheme('light'));

  it('is light by default, even when the Visitor prefers dark', async () => {
    prefersColorScheme('dark');
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline' });

    expect(widget.chatColors()).toEqual(LIGHT);
  });

  it('can be forced dark', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline', theme: 'dark' });

    expect(widget.chatColors()).toEqual(DARK);
  });

  it('follows the Visitor colour-scheme preference when set to auto', async () => {
    prefersColorScheme('dark');
    const dark = mountWidget({ endpoint: '/api/luzia', mode: 'inline', theme: 'auto' });
    expect(dark.chatColors()).toEqual(DARK);

    document.body.replaceChildren();
    prefersColorScheme('light');
    const light = mountWidget({ endpoint: '/api/luzia', mode: 'inline', theme: 'auto' });
    expect(light.chatColors()).toEqual(LIGHT);
  });

  it('takes its colours from CSS custom properties the Owner sets on the element', async () => {
    const widget = mountWidget({
      endpoint: '/api/luzia',
      theme: 'dark',
      style: '--luzia-accent: #e11d48; --luzia-accent-contrast: #000000; --luzia-surface: #0b1020',
    });

    expect(getComputedStyle(widget.button('luzIA chat')).backgroundColor).toBe('#e11d48');
    expect(getComputedStyle(widget.button('luzIA chat')).color).toBe('#000000');
    expect(widget.chatColors()).toEqual({ surface: '#0b1020', text: DARK.text });
  });
});
