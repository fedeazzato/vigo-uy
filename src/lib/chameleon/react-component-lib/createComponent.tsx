import React, { createElement } from 'react'
import { attachProps, camelToDashCase, createForwardRef, dashToPascalCase, isCoveredByReact, mergeRefs } from './utils'

export interface HTMLStencilElement extends HTMLElement {
  componentOnReady(): Promise<this>
}

interface StencilReactInternalProps<ElementType> extends React.HTMLAttributes<ElementType> {
  forwardedRef: React.RefObject<ElementType>
  ref?: React.Ref<any>
}

export const createReactComponent = <
  PropType,
  ElementType extends HTMLStencilElement,
  ContextStateType = {},
  ExpandedPropsTypes = {}
>(
  tagName: string,
  ReactComponentContext?: React.Context<ContextStateType>,
  manipulatePropsFunction?: (
    originalProps: StencilReactInternalProps<ElementType>,
    propsToPass: any
  ) => ExpandedPropsTypes,
  defineCustomElement?: () => void
) => {
  if (defineCustomElement !== undefined) {
    defineCustomElement()
  }

  const displayName = dashToPascalCase(tagName)
  const ReactComponent = class extends React.Component<StencilReactInternalProps<ElementType>> {
    componentEl!: ElementType

    setComponentElRef = (element: ElementType) => {
      this.componentEl = element
    }

    constructor(props: StencilReactInternalProps<ElementType>) {
      super(props)
    }

    componentDidMount() {
      this.componentDidUpdate(this.props)
    }

    componentDidUpdate(prevProps: StencilReactInternalProps<ElementType>) {
      attachProps(this.componentEl, this.props, prevProps)
    }

    render() {
      const { children, forwardedRef, style, className, ref, ...cProps } = this.props

      let propsToPass = Object.keys(cProps).reduce((acc: any, name) => {
        const value = (cProps as any)[name]

        if (name.indexOf('on') === 0 && name[2] === name[2].toUpperCase()) {
          const eventName = name.substring(2).toLowerCase()
          if (typeof document !== 'undefined' && isCoveredByReact(eventName)) {
            acc[name] = value
          }
        } else {
          const type = typeof value

          // Omit `false` booleans entirely rather than setting e.g. `disabled="false"`.
          // React only skips false boolean attributes for HTML tags it recognizes —
          // for custom elements it sets the literal string, and Stencil's
          // ElementInternals-backed props (like `disabled`) treat mere attribute
          // *presence* as truthy, regardless of its value.
          if (type === 'boolean' && value === false) {
            // skip
          } else if (type === 'string' || type === 'boolean' || type === 'number') {
            acc[camelToDashCase(name)] = value
          }
        }
        return acc
      }, {} as ExpandedPropsTypes)

      if (manipulatePropsFunction) {
        propsToPass = manipulatePropsFunction(this.props, propsToPass)
      }

      const newProps: Omit<StencilReactInternalProps<ElementType>, 'forwardedRef'> = {
        ...propsToPass,
        ref: mergeRefs(forwardedRef, this.setComponentElRef),
        style,
      }

      // createElement (not React.createElement) works around a Vite bug that
      // renders custom elements as <tagname> literally: https://github.com/vitejs/vite/issues/6104
      return createElement(tagName, newProps, children)
    }

    static get displayName() {
      return displayName
    }
  }

  if (ReactComponentContext) {
    ReactComponent.contextType = ReactComponentContext
  }

  return createForwardRef<PropType, ElementType>(ReactComponent, displayName)
}
