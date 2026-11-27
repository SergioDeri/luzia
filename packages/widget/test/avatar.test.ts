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
  defineLuziaWidget();
  server = installFakeFetch();
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('avatar at the top of the chat, like a video call', () => {
  it("shows luzIA's own icon next to the title when the Owner sets no avatar", async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.avatar()).toMatchObject({ image: null, decorative: true });
    expect(widget.chatTitle()).toBe('luzIA');
  });

  it("shows the Owner's image instead, still next to the luzIA title", async () => {
    const widget = mountWidget({ avatar: '/images/me.jpg' });
    await widget.click('luzIA chat');

    expect(widget.avatar()).toMatchObject({ image: '/images/me.jpg', decorative: true });
    expect(widget.chatTitle()).toBe('luzIA');
    expect(widget.avatarAboveConversation()).toBe(true);
  });

  it('follows changes to the avatar, and goes back to the icon when it is removed', async () => {
    const widget = mountWidget({ avatar: '/a.png' });
    await widget.click('luzIA chat');

    (widget.host as HTMLElement & { avatar: string }).avatar = '/b.png';
    expect(widget.avatar()?.image).toBe('/b.png');

    widget.host.removeAttribute('avatar');
    expect(widget.avatar()).toMatchObject({ image: null, decorative: true });
  });

  it('shows the avatar in inline mode too', () => {
    const widget = mountWidget({ mode: 'inline', avatar: '/me.png' });

    expect(widget.avatar()?.image).toBe('/me.png');
  });

  it('shows luzIA as speaking while a reply streams in, and stops when it ends', async () => {
    const widget = mountWidget({ avatar: '/me.png' });
    await widget.click('luzIA chat');
    widget.type('What does she do?');
    await widget.click('Send');
    const reply = await server.nextReply();

    await reply.push('She builds ');
    expect(widget.avatar()?.speaking).toBe(true);

    await reply.end();
    expect(widget.avatar()?.speaking).toBe(false);
  });
});
