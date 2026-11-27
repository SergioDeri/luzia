import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLuziaWidget } from '../src/index.ts';
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
