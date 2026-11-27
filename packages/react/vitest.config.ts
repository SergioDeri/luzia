import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'react',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
