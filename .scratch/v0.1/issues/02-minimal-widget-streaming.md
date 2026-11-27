# 02: Minimal widget: floating bubble with streamed replies

**What to build:** A Visitor on the Next.js example portfolio sees a floating luzIA bubble, opens it, types a question, and watches the Agent's reply stream in. Delivered as a framework-free Web Component plus a thin React wrapper that the example uses. Establishes the Seam 2 test harness (DOM environment, fake streaming `fetch`).

**Blocked by:** 01 — Tracer bullet: Core-only chat end to end over HTTP

**Status:** ready-for-agent

- [ ] Web Component renders a floating bubble that opens and closes a chat panel titled "luzIA"
- [ ] Visitor can type and send a message; the reply renders incrementally as it streams
- [ ] Widget is configured with the server endpoint
- [ ] React wrapper exposes the same configuration as props and is used in the Next.js example
- [ ] Seam 2 tests cover open/close, sending a message and streamed rendering, for both the Web Component and the React wrapper
