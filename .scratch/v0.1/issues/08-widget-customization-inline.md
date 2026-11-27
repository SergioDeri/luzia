# 08: Widget customization and inline mode

**What to build:** An Owner can make the widget feel native to their portfolio: set a greeting, configure suggested questions that Visitors can click to send, theme it with CSS custom properties including light/dark mode, and choose inline mode to embed the chat in a page section instead of a floating bubble. All options work via script-tag attributes and React props.

**Blocked by:** 02 — Minimal widget: floating bubble with streamed replies

**Status:** done

- [x] Greeting is shown when the chat opens
- [x] Suggested questions render as clickable options; clicking one sends it as a message
- [x] Theme is controllable via CSS custom properties, with light and dark modes
- [x] Inline mode renders the chat inside a host element with no bubble
- [x] Every option is configurable both as a Web Component attribute and a React prop
- [x] Seam 2 tests cover each option
