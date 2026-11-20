import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// RTL only auto-registers its cleanup when the runner exposes globals;
// vitest runs without globals here, so register it explicitly or every
// test leaks its DOM into the next one.
afterEach(cleanup)

// The DOM stubs below only apply to the default jsdom environment; files that
// opt into `@vitest-environment node` (the Edge Function tests, which need
// Node's real WebCrypto) have no window.
if (typeof window !== 'undefined') {
  // jsdom does not implement scrollIntoView; FormError calls it to bring the
  // message on screen when it appears.
  window.HTMLElement.prototype.scrollIntoView = () => {}

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
}
