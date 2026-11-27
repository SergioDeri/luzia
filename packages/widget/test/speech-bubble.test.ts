import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLuziaWidget } from '../src/index.ts';
import { installFakeFetch, type FakeFetch } from './support/fake-fetch.ts';
import { visitor } from './support/visitor.ts';

function mountWidget(attributes: Record<string, string> = {}) {
  const host = document.createElement('luzia-widget');
  for (const [name, value] of Object.entries({ endpoint: '/api/luzia', avatar: '/me.png', ...attributes })) {
    host.setAttribute(name, value);
  }
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
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function ask(widget: ReturnType<typeof mountWidget>, question: string) {
  widget.type(question);
  await widget.click('Send');
  return server.nextReply();
}

describe("luzIA's speech bubble", () => {
  it('shows the reply in a bubble over the picture as it streams in, not yet in the history', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'What does she do?');

    await reply.push('She builds ');
    expect(widget.speechBubble()).toBe('She builds ');
    await reply.push('web products.');
    expect(widget.speechBubble()).toBe('She builds web products.');
    expect(widget.visibleTranscript()).toEqual([{ role: 'user', text: 'What does she do?' }]);
    expect(widget.speechBubbleIsDecorative()).toBe(true);
  });

  it('keeps the bubble a few seconds after the reply ends, then moves the reply into the history', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'What does she do?');
    await reply.push('She builds web products.');
    await reply.end();

    await vi.advanceTimersByTimeAsync(3000);
    expect(widget.speechBubble()).toBe('She builds web products.');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(widget.speechBubble()).toBeNull();
    expect(widget.visibleTranscript()).toEqual([
      { role: 'user', text: 'What does she do?' },
      { role: 'assistant', text: 'She builds web products.' },
    ]);
  });

  it('moves the current reply into the history at once when the Visitor asks something else', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const first = await ask(widget, 'First?');
    await first.push('First answer.');
    await first.end();

    await ask(widget, 'Second?');

    expect(widget.speechBubble()).toBeNull();
    expect(widget.visibleTranscript()).toEqual([
      { role: 'user', text: 'First?' },
      { role: 'assistant', text: 'First answer.' },
      { role: 'user', text: 'Second?' },
    ]);
  });

  it('shows a restored conversation straight in the history, with no bubble', async () => {
    const first = mountWidget();
    await first.click('luzIA chat');
    const reply = await ask(first, 'What does she do?');
    await reply.push('She builds web products.');
    await reply.end();
    await vi.advanceTimersByTimeAsync(15_000);
    document.body.replaceChildren();

    const again = mountWidget();
    await again.click('luzIA chat');

    expect(again.speechBubble()).toBeNull();
    expect(again.visibleTranscript().at(-1)).toEqual({ role: 'assistant', text: 'She builds web products.' });
  });

  it('puts the reply in the history and drops the bubble when the reply fails half-way', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'What does she do?');
    await reply.push('She builds');
    await reply.fail();

    expect(widget.speechBubble()).toBeNull();
    expect(widget.visibleTranscript().at(-1)).toEqual({ role: 'assistant', text: 'She builds' });
  });

  it('lets the Visitor scroll a long reply in the bubble to read its beginning', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'Tell me everything.');
    await reply.push('A very long reply. '.repeat(40));

    expect(widget.speechBubbleScrolls()).toBe(true);
  });

  it('keeps the bubble while the mouse is over it, and lets it go a few seconds after the mouse leaves', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'What does she do?');
    await reply.push('She builds web products.');
    await reply.end();

    widget.hoverSpeechBubble();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(widget.speechBubble()).toBe('She builds web products.');

    widget.hoverSpeechBubble(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(widget.speechBubble()).toBe('She builds web products.');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(widget.speechBubble()).toBeNull();
    expect(widget.visibleTranscript().at(-1)).toEqual({ role: 'assistant', text: 'She builds web products.' });
  });

  it('lets the bubble go 2 seconds after the mouse leaves, even for a long reply', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'Tell me everything.');
    const long = 'A long reply. '.repeat(40);
    await reply.push(long);

    widget.hoverSpeechBubble();
    await reply.end();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(widget.speechBubble()).toBe(long);

    widget.hoverSpeechBubble(false);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(widget.speechBubble()).toBeNull();
    expect(widget.visibleTranscript().at(-1)).toEqual({ role: 'assistant', text: long });
  });

  it('lets the bubble go 2 seconds after the mouse leaves while the reply is still streaming', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const reply = await ask(widget, 'Tell me everything.');
    await reply.push('A long reply. '.repeat(40));

    widget.hoverSpeechBubble();
    widget.hoverSpeechBubble(false);
    await reply.push('And more.');
    await reply.end();
    await vi.advanceTimersByTimeAsync(2_500);

    expect(widget.speechBubble()).toBeNull();
  });

  it('moves the bubble’s reply into the history when the next reply starts, and says the new one', async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');
    const first = await ask(widget, 'First?');
    await first.push('First answer.');
    await first.end();
    widget.hoverSpeechBubble();

    const second = await ask(widget, 'Second?');
    await second.push('Second answer.');

    expect(widget.speechBubble()).toBe('Second answer.');
    expect(widget.visibleTranscript()).toEqual([
      { role: 'user', text: 'First?' },
      { role: 'assistant', text: 'First answer.' },
      { role: 'user', text: 'Second?' },
    ]);
  });
});
