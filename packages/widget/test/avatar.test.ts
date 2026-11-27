import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLuziaWidget } from '../src/index.ts';
import { installFakeFetch } from './support/fake-fetch.ts';
import { visitor } from './support/visitor.ts';

function mountWidget(attributes: Record<string, string> = {}) {
  const host = document.createElement('luzia-widget');
  for (const [name, value] of Object.entries({ endpoint: '/api/luzia', ...attributes })) host.setAttribute(name, value);
  document.body.append(host);
  return visitor(host);
}

beforeEach(() => {
  defineLuziaWidget();
  installFakeFetch();
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('avatar in the chat header', () => {
  it("shows luzIA's own icon next to the title when the Owner sets no avatar", async () => {
    const widget = mountWidget();
    await widget.click('luzIA chat');

    expect(widget.headerAvatar()).toEqual({ image: null, decorative: true });
    expect(widget.chatTitle()).toBe('luzIA');
  });

  it("shows the Owner's image instead, still next to the luzIA title", async () => {
    const widget = mountWidget({ avatar: '/images/me.jpg' });
    await widget.click('luzIA chat');

    expect(widget.headerAvatar()).toEqual({ image: '/images/me.jpg', decorative: true });
    expect(widget.chatTitle()).toBe('luzIA');
  });

  it('follows changes to the avatar, and goes back to the icon when it is removed', async () => {
    const widget = mountWidget({ avatar: '/a.png' });
    await widget.click('luzIA chat');

    (widget.host as HTMLElement & { avatar: string }).avatar = '/b.png';
    expect(widget.headerAvatar()?.image).toBe('/b.png');

    widget.host.removeAttribute('avatar');
    expect(widget.headerAvatar()).toEqual({ image: null, decorative: true });
  });

  it('shows the avatar in inline mode too', () => {
    const widget = mountWidget({ mode: 'inline', avatar: '/me.png' });

    expect(widget.headerAvatar()?.image).toBe('/me.png');
  });
});
