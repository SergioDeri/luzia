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

describe('focus management', () => {
  it('moves focus to the message box when the bubble opens the chat', async () => {
    const widget = mountWidget();
    widget.focus('luzIA chat');

    await widget.click('luzIA chat');

    expect(widget.focused()).toBe('Message luzIA');
  });

  it('returns focus to the bubble when the Visitor closes the chat', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    await widget.click('Close luzIA chat');

    expect(widget.isChatOpen()).toBe(false);
    expect(widget.focused()).toBe('luzIA chat');
  });

  it('closes the chat with Escape from anywhere inside it and returns focus to the bubble', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': '["Is she open to remote work?"]' });
    await widget.click('luzIA chat');
    await widget.press('Escape');
    expect(widget.isChatOpen()).toBe(false);
    expect(widget.focused()).toBe('luzIA chat');

    await widget.click('luzIA chat');
    widget.focus('Is she open to remote work?');
    await widget.press('Escape');
    expect(widget.isChatOpen()).toBe(false);
    expect(widget.focused()).toBe('luzIA chat');
  });

  it('keeps the inline chat open on Escape and does not steal focus when it mounts', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline' });
    expect(document.activeElement).toBe(outside);

    widget.focus('Message luzIA');
    await widget.press('Escape');

    expect(widget.isChatOpen()).toBe(true);
    expect(widget.focused()).toBe('Message luzIA');
  });

  it('keeps focus in the message box after sending, so the Visitor can keep typing', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    widget.focus('Send');

    await widget.click('Send');

    expect(widget.focused()).toBe('Message luzIA');
  });

  it('moves focus to the message box after a suggested question is sent', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': '["Is she open to remote work?"]' });
    await widget.click('luzIA chat');
    widget.focus('Is she open to remote work?');

    await widget.click('Is she open to remote work?');

    expect(server.requests).toHaveLength(1);
    expect(widget.focused()).toBe('Message luzIA');
  });
});

describe('roles, names and keyboard operation', () => {
  const QUESTIONS = '["What role is she looking for?","Is she open to remote work?"]';

  it('exposes the bubble as a toggle that reports whether the chat is expanded', async () => {
    const widget = mountWidget();
    const bubble = widget.button('luzIA chat');
    expect(bubble.getAttribute('aria-expanded')).toBe('false');

    await widget.click('luzIA chat');
    expect(bubble.getAttribute('aria-expanded')).toBe('true');
    expect(widget.chatLabel()).toBe('luzIA');
  });

  it('lets a keyboard user reach every control by name, in a sensible order', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': QUESTIONS });
    expect(widget.tabOrder()).toEqual(['luzIA chat']);

    await widget.click('luzIA chat');

    expect(widget.tabOrder()).toEqual([
      'New conversation',
      'Close luzIA chat',
      'What role is she looking for?',
      'Is she open to remote work?',
      'Message luzIA',
      'Send',
      'luzIA chat',
    ]);
  });

  it('lets a keyboard user reach every inline control, with no bubble or close button', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline', 'suggested-questions': QUESTIONS });

    expect(widget.tabOrder()).toEqual([
      'New conversation',
      'What role is she looking for?',
      'Is she open to remote work?',
      'Message luzIA',
      'Send',
    ]);
  });

  it('starts over from the keyboard and leaves focus in the message box', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.pressEnter();
    const reply = await server.nextReply();
    await reply.push('A senior role.');
    await reply.end();
    widget.focus('New conversation');

    await widget.click('New conversation');

    expect(widget.transcript()).toEqual([]);
    expect(widget.focused()).toBe('Message luzIA');
  });
});

describe('small screens', () => {
  type HappyWindow = { happyDOM: { setViewport(size: { width: number; height: number }): void } };
  const setViewport = (width: number, height: number) =>
    (window as unknown as HappyWindow).happyDOM.setViewport({ width, height });

  beforeEach(() => setViewport(375, 667));
  afterEach(() => setViewport(1024, 768));

  it('opens the bubble chat over the whole screen on a phone', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.chatBox()).toMatchObject({ position: 'fixed', top: '0px', left: '0px', width: '375px', height: '667px' });
  });

  it('keeps the floating panel beside the bubble on a wide screen', async () => {
    setViewport(1280, 800);
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.chatBox().position).not.toBe('fixed');
  });

  it('keeps the inline chat inside the page, at full width', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', mode: 'inline' });

    expect(widget.chatBox()).toMatchObject({ position: 'static', width: '100%' });
  });

  it('gives every control a tap target of at least 44 by 44 pixels', async () => {
    const widget = mountWidget({ endpoint: '/api/luzia', 'suggested-questions': '["Is she open to remote work?"]' });
    await widget.click('luzIA chat');

    for (const name of ['luzIA chat', 'New conversation', 'Close luzIA chat', 'Is she open to remote work?', 'Send']) {
      const target = widget.tapTarget(name);
      expect(target.width, name).toBeGreaterThanOrEqual(44);
      expect(target.height, name).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('screen reader announcements', () => {
  it('announces the streamed reply once it is complete, not token by token', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.pressEnter();
    const reply = await server.nextReply();

    await reply.push('Jamie is looking ');
    await reply.push('for a senior role.');
    expect(widget.announcement()).toBe('');

    await reply.end();
    expect(widget.announcement()).toBe('Jamie is looking for a senior role.');
  });

  it('announces only the newest reply in a follow-up exchange', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.pressEnter();
    const first = await server.nextReply();
    await first.push('A senior role.');
    await first.end();

    widget.type('Remote?');
    await widget.pressEnter();
    const second = await server.nextReply();
    await second.push('Yes, ');
    expect(widget.announcement()).toBe('');
    await second.push('remote is fine.');
    await second.end();

    expect(widget.announcement()).toBe('Yes, remote is fine.');
  });

  it('does not announce a restored conversation when the widget remounts', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.pressEnter();
    const reply = await server.nextReply();
    await reply.push('A senior role.');
    await reply.end();

    document.body.replaceChildren();
    const remounted = mountWidget();
    await remounted.click('luzIA chat');

    expect(remounted.transcript()).toHaveLength(2);
    expect(remounted.announcement()).toBe('');
  });
});
