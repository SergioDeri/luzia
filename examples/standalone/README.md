# luzIA example: standalone server and a script tag

The luzIA handler deployed on its own as a Vercel Function, for an Owner whose portfolio is a static site. See the [root README](../../README.md#manual-setup-standalone-server-and-a-script-tag) for the full walkthrough.

```
api/luzia.ts             Vercel Function: POST (chat) and OPTIONS (CORS preflight)
knowledge-base/          the Owner's Knowledge Base (core.md, instructions.md)
luzia.evals.json         eval cases for `luzia eval`
public/index.html        placeholder page served at the server's root
static-site/index.html   the Owner's static portfolio: script tag + <luzia-widget>
vercel.json              ships the compiled Knowledge Base with the function
.env.example             environment variables to set in Vercel
```

- `pnpm build` runs `luzia build`, which compiles `knowledge-base/` into `.luzia/knowledge-base.json`. Vercel runs it on every deploy, so updating the Knowledge Base is commit and push.
- `allowedOrigins` in `api/luzia.ts` lists the portfolio's origins (`https://jamie.example.com` here). Replace them with yours, or remove the option and set `LUZIA_ALLOWED_ORIGINS`.
- `static-site/index.html` is not part of this deployment: it stands for the portfolio, hosted anywhere (GitHub Pages, Netlify, another Vercel project). Its `endpoint` points at this server.
- To try it locally, run `vercel dev` here and serve `static-site/` from an allowed origin (e.g. add `http://localhost:8080` to the allowed origins and run `npx serve -l 8080 static-site`), changing the widget's `endpoint` to `http://localhost:3000/api/luzia`.
- `pnpm test` (from the repo root) builds the Knowledge Base, loads the function and checks that only the portfolio's origin gets through.

Inside this monorepo the luzIA packages are linked from source (`workspace:*`). In your own project, install them from npm: `pnpm add @luzia/core` and `pnpm add -D @luzia/cli`.
