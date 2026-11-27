# 10: Evals: `luzia eval`

**What to build:** An Owner can write an eval file of questions — each with facts the answer must contain, or flagged as a trap question the Agent must decline — and run `luzia eval` against their real configured model. Each case goes through the same handler path Visitors use, is graded by an LLM judge using the Owner's chat model, and appears in a per-case report with the Agent's actual answer. The command exits non-zero on any failure.

**Blocked by:** 01 — Tracer bullet: Core-only chat end to end over HTTP

**Status:** done

- [x] Eval file format supports expected-facts cases and trap (must-decline) cases
- [x] `luzia eval` runs every case through the handler and grades it with an LLM judge
- [x] Report lists each case as passed/failed with the actual answer and the judge's reason
- [x] Exit code is non-zero when any case fails
- [x] Seam 3 tests with fake chat and judge models: passing cases pass; a fabricated answer to a trap question is reported failed with the answer shown; exit code reflects failures
- [x] Real-model eval runs are not part of the test suite
