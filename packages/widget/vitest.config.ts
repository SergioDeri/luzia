import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'widget',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
