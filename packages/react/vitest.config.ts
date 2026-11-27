import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'react',
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
