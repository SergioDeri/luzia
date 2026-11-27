import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'widget',
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
