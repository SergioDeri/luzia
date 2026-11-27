# 06: Production variables (Vercel)

**What to build:** An Owner whose project is linked with the Vercel CLI is offered to upload their luzIA variables with `vercel env add`, after a single confirmation listing variable names and target environments; otherwise the wizard prints the variable names and where each value comes from, without printing secrets.

**Blocked by:** 01 — Tracer bullet: `luzia init` on Next.js with a Core from questions

**Status:** done

- [x] Vercel CLI availability and project linking are detected via the command runner
- [x] Nothing is uploaded before the Owner confirms; on confirm, `vercel env add` is requested per variable and environment
- [x] Without a linked project, a list of variable names and value sources is printed with no secret values
- [x] Seam tests cover linked + confirmed, linked + declined, and not linked
