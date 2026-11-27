# luzIA

An open-source, self-hosted AI agent that developers embed in their portfolio so visitors (typically recruiters) can ask about them without contacting them directly.

## Language

### People

**Owner**:
The person the agent talks about, who also installs and configures it on their portfolio.
_Avoid_: Candidate, developer, user, admin

**Visitor**:
Anyone chatting with the agent on the Owner's portfolio. Usually a recruiter, but never assumed or verified to be one.
_Avoid_: Recruiter, user, client

### Agent behaviour

**Agent**:
The AI the Visitor chats with, always presented as "luzIA". It speaks about the Owner in the third person and never as them.
_Avoid_: Bot, assistant, chatbot, avatar

**Knowledge Base**:
The set of files the Owner provides (CV, experience, salary expectations, etc.) — the only source of facts the agent may state about the Owner. Everything in it is public.
_Avoid_: Profile, data, context, dossier

**Core**:
The part of the Knowledge Base always given to the agent in full — summary, contact details, role sought. The rest of the Knowledge Base is consulted only as needed.
_Avoid_: Summary, pinned section, profile

**Instructions**:
Free-form guidance the Owner writes to tell the agent how to handle specific topics (e.g. salary, availability). Instructions shape behaviour; they are not facts and are not part of the Knowledge Base.
_Avoid_: Rules, prompt, policies
