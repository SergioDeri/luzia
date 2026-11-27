# 05: Standalone path for non-Next.js projects

**What to build:** An Owner whose project isn't Next.js (or an empty folder) gets a standalone luzIA server set up, matching the existing standalone example, with allowed origins set from the portfolio domain(s) they enter, and the wizard prints the `<script>` tag and `<luzia-widget>` snippet with the configured widget options filled in.

**Blocked by:** 01 — Tracer bullet: `luzia init` on Next.js with a Core from questions; 04 — Widget configuration and Next.js layout/scripts changes

**Status:** ready-for-agent

- [ ] Non-Next.js projects take the standalone path
- [ ] The standalone server is scaffolded with a build step running `luzia build`
- [ ] Allowed origins are set from the entered domains; invalid origins are rejected with a clear message
- [ ] The printed snippet includes endpoint, contact from the Core, greeting, suggested questions, theme and mode
- [ ] Seam tests cover the empty-folder fixture end to end
