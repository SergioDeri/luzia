# @luzia/cli

The `luzia` command line.

```sh
luzia build [--dir knowledge-base] [--out .luzia/knowledge-base.json]
luzia eval  [--file luzia.evals.json] [--kb .luzia/knowledge-base.json]
```

- `luzia build` compiles the Owner's Knowledge Base folder (Core, Instructions, markdown, PDF) into the artifact the server handler loads, and reports the files, chunks and PDF pages it compiled. Run it as part of your app's build.
- `luzia eval` asks the Agent every question in an eval file, grades the answers with an LLM judge using your configured chat model, prints a per-case report, and exits non-zero if any case fails.

Both read the `LUZIA_*` environment variables and provider API keys, loading `.env.local` and `.env` from the current folder when present. See the [root README](../../README.md#evals-luzia-eval) for the eval file format.
