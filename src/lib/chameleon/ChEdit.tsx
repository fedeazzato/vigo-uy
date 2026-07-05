import type { JSX } from '@genexus/chameleon-controls-library'
import { defineCustomElement } from '@genexus/chameleon-controls-library/dist/components/ch-edit.js'
import { createReactComponent } from './react-component-lib'

// Imports the tree-shakeable per-component build instead of the library's
// barrel loader (`chameleon-generate-react` / `@genexus/chameleon-controls-library/loader`),
// which registers every control in the library — including multi-MB ones
// like the Monaco-based code editor and the barcode scanner — and blows up
// the PWA's Workbox precache. This only pulls in ch-edit and its own deps.
export const ChEdit = /*@__PURE__*/ createReactComponent<JSX.ChEdit, HTMLChEditElement>(
  'ch-edit',
  undefined,
  undefined,
  defineCustomElement
)
