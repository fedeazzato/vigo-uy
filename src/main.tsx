import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { UserPrefsProvider } from './context/UserPrefsContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <UserPrefsProvider>
        <App />
      </UserPrefsProvider>
    </HashRouter>
  </React.StrictMode>
)
