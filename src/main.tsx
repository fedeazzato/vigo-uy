import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { UserPrefsProvider } from './context/UserPrefsContext'
import { AuthProvider } from './context/AuthContext'
import App from './App'
// Self-hosted fonts — no Google Fonts request, and the woff2 files land in
// the PWA precache for offline use. Only the used weights and the latin +
// latin-ext subsets (Spanish needs no cyrillic/greek/vietnamese, and every
// subset would otherwise bloat the precache).
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-ext-400.css'
import '@fontsource/inter/latin-ext-500.css'
import '@fontsource/inter/latin-ext-600.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/space-grotesk/latin-ext-400.css'
import '@fontsource/space-grotesk/latin-ext-500.css'
import '@fontsource/space-grotesk/latin-ext-600.css'
import '@fontsource/space-grotesk/latin-ext-700.css'
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
