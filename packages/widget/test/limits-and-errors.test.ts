import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLuziaWidget } from '../src/index.ts';
import { installFakeFetch, type FakeFetch } from './support/fake-fetch.ts';
import { visitor } from './support/visitor.ts';

async function openWidget(attributes: Record<string, string>) {
  const host = document.createElement('luzia-widget');
  for (const [name, value] of Object.entries({ endpoint: '/api/luzia', ...attributes })) {
    host.setAttribute(name, value);
  }
  document.body.append(host);
  const widget = visitor(host);
  await widget.click('luzIA chat');
  return widget;
}

async function ask(widget: ReturnType<typeof visitor>, text: string) {
  widget.type(text);
  await widget.click('Send');
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

describe('conversation limit', () => {
  it('tells the Visitor the conversation is over and how to contact the Owner', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    server.failNextWith(429, 'conversation_limit_reached', 'This conversation has reached its limit of 20 messages.');

    await ask(widget, 'One more question');

    expect(widget.alert()).toMatch(/reached the message limit/i);
    expect(widget.alert()).toContain('jamie@example.com');
    expect(widget.alertLink()).toBe('mailto:jamie@example.com');
    expect(widget.canSend()).toBe(false);
  });

  it('links a contact URL', async () => {
    const widget = await openWidget({ contact: 'https://jamie.dev/contact' });
    server.failNextWith(429, 'conversation_limit_reached');

    await ask(widget, 'One more question');

    expect(widget.alertLink()).toBe('https://jamie.dev/contact');
  });

  it('still explains the limit when no contact is configured', async () => {
    const widget = await openWidget({});
    server.failNextWith(429, 'conversation_limit_reached');

    await ask(widget, 'One more question');

    expect(widget.alert()).toMatch(/reached the message limit/i);
    expect(widget.alertLink()).toBeNull();
  });

  it('lets the Visitor chat again after starting a new conversation', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    server.failNextWith(429, 'conversation_limit_reached');
    await ask(widget, 'One more question');
    expect(widget.canSend()).toBe(false);

    await widget.click('New conversation');

    expect(widget.canSend()).toBe(true);
    expect(widget.alert()).toBeNull();
    expect(widget.transcript()).toEqual([]);
    await ask(widget, 'Fresh question');
    expect(server.requests.at(-1)?.body).toEqual({ messages: [{ role: 'user', content: 'Fresh question' }] });
  });
});

describe('message too long', () => {
  it('asks the Visitor to shorten the message and gives it back for editing', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    server.failNextWith(413, 'message_too_long', 'Messages can be at most 1000 characters long.');

    await ask(widget, 'A very long question');

    expect(widget.alert()).toMatch(/too long/i);
    expect(widget.messageBoxValue()).toBe('A very long question');
    expect(widget.transcript()).toEqual([]);
    expect(widget.canSend()).toBe(true);

    await ask(widget, 'Short question');
    expect(server.requests.at(-1)?.body).toEqual({ messages: [{ role: 'user', content: 'Short question' }] });
    expect(widget.alert()).toBeNull();
  });
});

describe('luzIA unavailable', () => {
  it('includes the Owner contact when the server cannot be reached', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    server.failNextWithNetworkError();

    await ask(widget, 'Hello?');

    expect(widget.alert()).toMatch(/luzIA is unavailable/i);
    expect(widget.alertLink()).toBe('mailto:jamie@example.com');
    expect(widget.canSend()).toBe(true);
  });

  it.each([
    ['the chat model fails', 502, 'provider_error'],
    ['the server fails', 500, 'internal_error'],
    ['this site is not allowed to use the server', 403, 'origin_not_allowed'],
  ])('shows the unavailable state when %s', async (_name, status, code) => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    server.failNextWith(status, code);

    await ask(widget, 'Hello?');

    expect(widget.alert()).toMatch(/luzIA is unavailable/i);
    expect(widget.alert()).toContain('jamie@example.com');
  });

  it('shows the unavailable state when the reply breaks off mid-stream', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    await ask(widget, 'Who is Jamie?');
    const reply = await server.nextReply();

    await reply.push('Jamie is');
    await reply.fail();

    expect(widget.alert()).toMatch(/luzIA is unavailable/i);
    expect(widget.alert()).toContain('jamie@example.com');
  });

  it.each([
    ['luzIA cannot be reached', (server: FakeFetch) => server.failNextWithNetworkError()],
    ['the chat model fails', (server: FakeFetch) => server.failNextWith(502, 'provider_error')],
  ])('gives an unanswered message back for editing when %s, so it is not sent twice', async (_name, fail) => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    await ask(widget, 'Who is Jamie?');
    const first = await server.nextReply();
    await first.push('Jamie is a developer.');
    await first.end();
    fail(server);

    await ask(widget, 'Is Jamie available?');

    expect(widget.transcript()).toEqual([
      { role: 'user', text: 'Who is Jamie?' },
      { role: 'assistant', text: 'Jamie is a developer.' },
    ]);
    expect(widget.messageBoxValue()).toBe('Is Jamie available?');

    await widget.click('Send');
    expect(server.requests.at(-1)?.body).toEqual({
      messages: [
        { role: 'user', content: 'Who is Jamie?' },
        { role: 'assistant', content: 'Jamie is a developer.' },
        { role: 'user', content: 'Is Jamie available?' },
      ],
    });
  });

  it('keeps a reply that broke off mid-stream, so the conversation still alternates', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    await ask(widget, 'Who is Jamie?');
    const reply = await server.nextReply();
    await reply.push('Jamie is');
    await reply.fail();

    await ask(widget, 'Go on?');

    expect(server.requests.at(-1)?.body).toEqual({
      messages: [
        { role: 'user', content: 'Who is Jamie?' },
        { role: 'assistant', content: 'Jamie is' },
        { role: 'user', content: 'Go on?' },
      ],
    });
  });

  it('clears the alert once a later message gets a reply', async () => {
    const widget = await openWidget({ contact: 'jamie@example.com' });
    server.failNextWithNetworkError();
    await ask(widget, 'Hello?');

    await ask(widget, 'Hello again?');
    const reply = await server.nextReply();
    await reply.push('Hi!');
    await reply.end();

    expect(widget.alert()).toBeNull();
  });
});
