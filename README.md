# luzIA

luzIA is an open-source, self-hosted AI agent that developers embed in their portfolio so visitors (typically recruiters) can ask about them without getting in touch first. The Owner writes a Knowledge Base as markdown files in their own repo, compiles it with `luzia build`, and mounts a framework-agnostic server handler (`@luzia/core`) that streams answers using the LLM provider and API key of their choice.

Documentation is coming in ticket 11. Until then, see `examples/nextjs` for a working setup, and run `pnpm install`, `pnpm typecheck` and `pnpm test` from the repo root.

## License

[MIT](LICENSE)
