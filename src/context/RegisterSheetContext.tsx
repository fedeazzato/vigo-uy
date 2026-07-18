import { createContext, useContext } from 'react'

// Lets pages open the "¿Qué querés registrar?" sheet that lives in Layout
// (single primary CTA per screen instead of three inline buttons). The
// default is a no-op so pages render fine outside Layout (tests).
export const RegisterSheetContext = createContext<{ openRegisterSheet: () => void }>({
  openRegisterSheet: () => {},
})

export function useRegisterSheet() {
  return useContext(RegisterSheetContext)
}
