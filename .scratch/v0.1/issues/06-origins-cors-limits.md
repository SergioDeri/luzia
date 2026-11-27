# 06: Protection: allowed origins, CORS and limits

**What to build:** An Owner's tokens are protected: only allowed origins can use the server (same-origin works with no configuration), CORS preflight is answered, and each conversation is bounded by a maximum number of messages, a maximum Visitor message length and a maximum reply length — all with safe, overridable defaults. When a limit is hit, or the server/provider fails, the Visitor sees a clear message in the widget with the Owner's contact.

**Blocked by:** 01 — Tracer bullet: Core-only chat end to end over HTTP; 02 — Minimal widget: floating bubble with streamed replies

**Status:** done

- [x] Requests from an origin not in the allowed-origins list are rejected; same-origin requests are accepted without configuration
- [x] CORS preflight requests from allowed origins are answered correctly
- [x] Max messages per conversation, max Visitor message length and max output tokens are enforced with documented defaults and can be overridden
- [x] Exceeding a limit returns a distinct error the widget can recognise
- [x] Widget renders the limit state and a generic unavailable state (network/provider error), both including the Owner's contact
- [x] Seam 1 tests cover origin rejection, same-origin acceptance, preflight and each limit; Seam 2 tests cover the limit and error states
