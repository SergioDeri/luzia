# 03: Instructions by topic

**What to build:** An Owner tells the wizard how the Agent should handle sensitive topics — salary (give a range they provide, suggest a call, or don't discuss), availability, relocation — plus any free-form guidance, and gets an Instructions file generated from fixed templates (no model call), shown before saving.

**Blocked by:** 01 — Tracer bullet: `luzia init` on Next.js with a Core from questions

**Status:** ready-for-agent

- [ ] Each salary choice produces the corresponding Instructions text; the range choice includes the range given
- [ ] Availability, relocation and free-form answers are included; skipped topics are omitted
- [ ] The Instructions are shown before saving and written through the diff-and-confirm step
- [ ] Seam tests cover each salary choice and the optional topics
