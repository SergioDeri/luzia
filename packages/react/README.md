# @luzia/react

A thin React wrapper over [`@luzia/widget`](../widget), configured with props.

```tsx
import { LuziaWidget } from '@luzia/react';

<LuziaWidget
  endpoint="/api/luzia"
  contact="you@example.com"
  greeting="Hi! I'm luzIA. Ask me anything about Jamie."
  suggestedQuestions={['What role is Jamie looking for?']}
  theme="auto"
  style={{ '--luzia-accent': '#0f766e' }}
/>;
```

Props: `endpoint`, `contact`, `greeting`, `suggestedQuestions`, `mode`, `theme`, `className`, `style`. It is a client component, so it can be used from React Server Components pages. See the [root README](../../README.md#react).
