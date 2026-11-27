import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'example-standalone',
    include: ['test/**/*.test.ts'],
  },
});
