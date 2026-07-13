import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// RTL only auto-registers its cleanup when the runner exposes globals;
// vitest runs without globals here, so register it explicitly or every
// test leaks its DOM into the next one.
afterEach(cleanup)

// jsdom does not implement matchMedia; UserPrefsContext reads it for the
// prefers-color-scheme fallback, so give it a minimal static stub.
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList
