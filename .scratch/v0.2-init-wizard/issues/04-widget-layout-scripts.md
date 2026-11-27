# 04: Widget configuration and Next.js layout/scripts changes

**What to build:** An Owner gets the widget on their Next.js site configured from their Core: the contact is taken from the Core automatically, a greeting and three suggested questions are proposed by the chat model from the Core (fixed defaults if no model call is possible) and can be edited, and theme (auto/light/dark) and mode (bubble/inline) are chosen. The wizard adds the React widget to the root layout and prefixes the `dev` and `build` scripts with `luzia build`, each through a shown-and-confirmed change; when the layout can't be modified safely it prints the exact snippet instead.

**Blocked by:** 01 — Tracer bullet: `luzia init` on Next.js with a Core from questions

**Status:** ready-for-agent

- [ ] The widget contact equals the contact in the Core
- [ ] Greeting and three suggested questions are proposed, editable, and written into the widget props
- [ ] Theme and mode choices are written into the widget props
- [ ] The root layout change is shown as a diff and applied only after confirmation; an unrecognised layout gets a printed snippet instead
- [ ] `dev` and `build` scripts are prefixed with `luzia build` after confirmation, without duplicating an existing prefix
- [ ] Seam tests cover all of the above on the Next.js fixture
