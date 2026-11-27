# 02: Core drafted from the CV

**What to build:** An Owner can point the wizard at their CV PDF. After consenting to send its text to their chosen chat provider (declining falls back to the questions path), the CV text is extracted with core's PDF reader and the Owner's chat model drafts a Core with a dedicated drafting prompt that uses only facts stated in the CV, never infers, and marks missing essentials. The wizard asks for the missing essentials (e.g. role sought, availability, work mode, preferred contact), shows the full draft, and saves it only after the Owner accepts, edits it in their editor, or redoes it. The CV is copied into the Knowledge Base for retrieval.

**Blocked by:** 01 — Tracer bullet: `luzia init` on Next.js with a Core from questions

**Status:** done

- [x] Consent prompt names the provider before any CV text is sent; declining switches to the questions path
- [x] The drafting prompt enforces stated-facts-only and no inference (verified on what the fake model receives)
- [x] Missing essentials flagged by the draft are asked for and merged into the Core
- [x] The draft is shown in full and written only after accept or edit; redo produces a new draft
- [x] The CV PDF is copied into the Knowledge Base and included by the build
- [x] A PDF with little or no extractable text shows a clear message and offers the questions path
- [x] A drafting failure names the provider and variable, lets the Owner re-enter the key and retry, or switch to questions
- [x] Seam tests cover consent declined, happy path, missing essentials, edit/redo, scanned PDF and drafting failure
