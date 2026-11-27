import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LuziaWidget, type LuziaWidgetProps } from '../src/index.ts';
import { installFakeFetch, type FakeFetch } from '../../widget/test/support/fake-fetch.ts';
import { visitor } from '../../widget/test/support/visitor.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let server: FakeFetch;
let root: Root;
let container: HTMLElement;

async function renderWidget(props: LuziaWidgetProps) {
  await act(async () => root.render(createElement(LuziaWidget, props)));
  const host = container.querySelector('luzia-widget');
  if (!host) throw new Error('<LuziaWidget> did not render a <luzia-widget>.');
  return visitor(host);
}

beforeEach(() => {
  server = installFakeFetch();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('<LuziaWidget>', () => {
  it('renders the floating bubble that opens and closes the luzIA chat', async () => {
    const widget = await renderWidget({ endpoint: '/api/luzia' });
    expect(widget.isChatOpen()).toBe(false);

    await widget.click('luzIA chat');
    expect(widget.isChatOpen()).toBe(true);
    expect(widget.chatTitle()).toBe('luzIA');

    await widget.click('Close luzIA chat');
    expect(widget.isChatOpen()).toBe(false);
  });

  it('sends messages to the endpoint prop and streams the reply', async () => {
    const widget = await renderWidget({ endpoint: 'https://luzia.example.com/chat' });
    await widget.click('luzIA chat');
    widget.type('What role is Jamie looking for?');
    await widget.click('Send');

    expect(server.requests[0]?.url).toBe('https://luzia.example.com/chat');
    expect(server.requests[0]?.body).toEqual({ messages: [{ role: 'user', content: 'What role is Jamie looking for?' }] });

    const reply = await server.nextReply();
    await reply.push('Jamie is looking ');
    expect(widget.transcript().at(-1)).toEqual({ role: 'assistant', text: 'Jamie is looking ' });
    await reply.push('for a senior role.');
    await reply.end();
    expect(widget.transcript().at(-1)).toEqual({ role: 'assistant', text: 'Jamie is looking for a senior role.' });
  });

  it('uses the new endpoint when the prop changes', async () => {
    await renderWidget({ endpoint: '/api/old' });
    const widget = await renderWidget({ endpoint: '/api/new' });
    await widget.click('luzIA chat');
    widget.type('Hi');
    await widget.click('Send');

    expect(server.requests[0]?.url).toBe('/api/new');
  });
});
