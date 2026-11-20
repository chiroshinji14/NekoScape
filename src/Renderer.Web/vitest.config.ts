import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  test: {
    include: ['../../tests/Renderer.Tests/**/*.test.ts'],
    environment: 'node',
  },
});
