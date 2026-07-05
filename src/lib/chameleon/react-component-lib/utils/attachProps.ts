import { camelToDashCase } from './case'

export const attachProps = (node: HTMLElement, newProps: any, oldProps: any = {}) => {
  if (node instanceof Element) {
    const className = getClassName(node.classList, newProps, oldProps)
    if (className !== '') {
      node.className = className
    }

    Object.keys(newProps).forEach((name) => {
      if (
        name === 'children' ||
        name === 'style' ||
        name === 'ref' ||
        name === 'class' ||
        name === 'className' ||
        name === 'forwardedRef'
      ) {
        return
      }
      if (name.indexOf('on') === 0 && name[2] === name[2].toUpperCase()) {
        const eventName = name.substring(2)
        const eventNameLc = eventName[0].toLowerCase() + eventName.substring(1)

        if (!isCoveredByReact(eventNameLc)) {
          syncEvent(node, eventNameLc, newProps[name])
        }
      } else {
        ;(node as any)[name] = newProps[name]
        const propType = typeof newProps[name]
        if (propType === 'string') {
          node.setAttribute(camelToDashCase(name), newProps[name])
        }
      }
    })
  }
}

export const getClassName = (classList: DOMTokenList, newProps: any, oldProps: any) => {
  const newClassProp: string = newProps.className || newProps.class
  const oldClassProp: string = oldProps.className || oldProps.class
  const currentClasses = arrayToMap(classList)
  const incomingPropClasses = arrayToMap(newClassProp ? newClassProp.split(' ') : [])
  const oldPropClasses = arrayToMap(oldClassProp ? oldClassProp.split(' ') : [])
  const finalClassNames: string[] = []
  currentClasses.forEach((currentClass) => {
    if (incomingPropClasses.has(currentClass)) {
      finalClassNames.push(currentClass)
      incomingPropClasses.delete(currentClass)
    } else if (!oldPropClasses.has(currentClass)) {
      finalClassNames.push(currentClass)
    }
  })
  incomingPropClasses.forEach((s) => finalClassNames.push(s))
  return finalClassNames.join(' ')
}

export const transformReactEventName = (eventNameSuffix: string) => {
  switch (eventNameSuffix) {
    case 'doubleclick':
      return 'dblclick'
  }
  return eventNameSuffix
}

/** @license Modernizr 3.0.0pre (Custom Build) | MIT */
export const isCoveredByReact = (eventNameSuffix: string) => {
  if (typeof document === 'undefined') {
    return true
  } else {
    const eventName = 'on' + transformReactEventName(eventNameSuffix)
    let isSupported = eventName in document

    if (!isSupported) {
      const element = document.createElement('div')
      element.setAttribute(eventName, 'return;')
      isSupported = typeof (element as any)[eventName] === 'function'
    }

    return isSupported
  }
}

export const syncEvent = (
  node: Element & { __events?: { [key: string]: ((e: Event) => any) | undefined } },
  eventName: string,
  newEventHandler?: (e: Event) => any
) => {
  const eventStore = node.__events || (node.__events = {})
  const oldEventHandler = eventStore[eventName]

  if (oldEventHandler) {
    node.removeEventListener(eventName, oldEventHandler)
  }

  node.addEventListener(
    eventName,
    (eventStore[eventName] = function handler(e: Event) {
      if (newEventHandler) {
        newEventHandler.call(this, e)
      }
    })
  )
}

const arrayToMap = (arr: string[] | DOMTokenList) => {
  const map = new Map<string, string>()
  ;(arr as string[]).forEach((s: string) => map.set(s, s))
  return map
}
