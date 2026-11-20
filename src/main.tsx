import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { UserPrefsProvider } from './context/UserPrefsContext'
import { AuthProvider } from './context/AuthContext'
import App from './App'
// Self-hosted Roboto (the head unit's system font, specs/stock-head-unit-look.md)
// — no Google Fonts request, and the woff2 files land in the PWA precache for
// offline use. Only the used weights (400/500/700) and the latin + latin-ext
// subsets (Spanish needs no cyrillic/greek/vietnamese, and every subset would
// otherwise bloat the precache).
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import '@fontsource/roboto/latin-ext-400.css'
import '@fontsource/roboto/latin-ext-500.css'
import '@fontsource/roboto/latin-ext-700.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <UserPrefsProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UserPrefsProvider>
    </HashRouter>
  </React.StrictMode>
)
