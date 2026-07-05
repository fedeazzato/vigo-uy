// Minimal subset of @genexus/chameleon-controls-library's react-output-target
// glue code, hand-copied (not codegen'd) so only the specific components we
// actually use get bundled — see src/lib/chameleon/ChEdit.tsx for why.

export interface StyleReactProps {
  class?: string
  className?: string
  style?: { [key: string]: any }
}
