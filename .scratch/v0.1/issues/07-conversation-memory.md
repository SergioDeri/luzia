# 07: Conversation memory and persistence

**What to build:** A Visitor can ask follow-up questions because the whole conversation is sent with each request, and their conversation survives navigating between portfolio pages or refreshing within the same tab. They can also start a new conversation to reset context. The server stays stateless.

**Blocked by:** 02 — Minimal widget: floating bubble with streamed replies

**Status:** ready-for-agent

- [ ] Each request carries the full prior conversation; follow-up questions reach the model with earlier messages
- [ ] Conversation is persisted in `sessionStorage` and restored when the widget remounts in the same tab
- [ ] A "new conversation" control clears the conversation and its stored copy
- [ ] Seam 2 tests cover persistence across remount and clearing
