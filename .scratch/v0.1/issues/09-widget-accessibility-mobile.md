# 09: Widget accessibility and mobile

**What to build:** A Visitor using a keyboard or screen reader, or browsing on a phone, can use the chat fully: focus is managed when opening/closing, streamed replies are announced, every control is keyboard operable, and the layout adapts to small screens in both bubble and inline modes.

**Blocked by:** 08 — Widget customization and inline mode

**Status:** ready-for-agent

- [ ] Opening the chat moves focus into it; closing returns focus to the bubble; Escape closes the bubble panel
- [ ] Streamed replies are exposed through an ARIA live region
- [ ] All controls (send, suggested questions, new conversation, close) are keyboard operable with visible focus and accessible names
- [ ] Layout is usable on small screens in bubble and inline modes
- [ ] Seam 2 tests cover focus management, ARIA roles/labels and keyboard operation
