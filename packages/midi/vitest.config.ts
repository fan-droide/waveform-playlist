import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom for React hook tests (@testing-library/react needs DOM)
    environment: 'jsdom',
  },
});
