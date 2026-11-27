# Self-hosted, file-based, no database

luzIA ships as open-source packages the Owner deploys themselves (a framework-agnostic server handler mountable in Next.js or deployable standalone, plus an embeddable widget), never as a hosted SaaS. The Owner's information lives as files in their own repo (markdown + CV PDF), not in a database behind an admin panel. This keeps each Owner in control of their own LLM API key and personal data, and means luzIA has no infrastructure to operate.

## Considered Options

- **Hosted SaaS**: easiest onboarding, but we'd hold strangers' personal data and pay for or broker their tokens.
- **Admin panel + database**: friendlier editing, but requires auth and stateful hosting for every Owner.

## Consequences

Any feature needing state (rate limiting by IP, conversation logs, unanswered-question capture) must be optional and depend on storage the Owner opts into (e.g. a KV store).
