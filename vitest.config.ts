import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: the tests don't need the PWA
// plugin or the /vigo-uy/ base, and keeping them apart avoids any interplay
// between vitest and the build config.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // CSS stays stubbed in tests, except `?raw` imports: the design-token
    // test (src/designTokens.test.ts) reads the stylesheets as text.
    css: { include: [/\?raw/] },
    // Node 25+ ships its own global localStorage/sessionStorage (Web Storage), which shadows jsdom's and is undefined without a
    // backing file: turn it off so the tests get jsdom's storage, as on older Node.
    execArgv: ['--no-experimental-webstorage'],
  },
})
