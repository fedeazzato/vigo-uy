import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: the tests don't need the PWA
// plugin or the /vigo-uy/ base, and keeping them apart avoids any interplay
// between vitest and the build config.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
})
