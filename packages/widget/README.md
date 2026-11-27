# @luzia/widget

The luzIA chat widget: a framework-free `<luzia-widget>` Web Component that Visitors use to chat with the Agent about the Owner. A floating bubble by default, or an inline chat with `mode="inline"`.

On any site, load the self-registering script bundle (a single file, no dependencies):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@luzia/widget/dist/luzia-widget.js"></script>
<luzia-widget endpoint="https://your-luzia-server.vercel.app/api/luzia" contact="you@example.com"></luzia-widget>
```

With a bundler:

```ts
import { defineLuziaWidget } from '@luzia/widget';
defineLuziaWidget();
```

Attributes: `endpoint`, `contact`, `greeting`, `suggested-questions` (JSON array), `mode` (`bubble` | `inline`), `theme` (`light` | `dark` | `auto`), `avatar` (image URL for the chat header; luzIA's icon when unset). Theme colours are `--luzia-*` CSS custom properties. See the [root README](../../README.md#widget) for details. For React, use [`@luzia/react`](../react).

`pnpm build` emits the module build and `dist/luzia-widget.js` (the script bundle, built with esbuild from `src/register.ts`).
