import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from './config/i18n'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './design-system.css'

// i18n is imported above so it starts loading locale files in the background.
// react-i18next with useSuspense:false handles the pre-initialized state by
// showing fallback values, so we render immediately — no waiting needed.

// ErrorBoundary wraps the whole app: without it, any uncaught render error
// anywhere in the tree unmounts React entirely, leaving a blank <div id="root">
// with no indication anything went wrong. This is defense-in-depth — it does
// not replace fixing bugs that throw, but ensures future ones degrade to a
// real "Something went wrong" screen instead of a blank page.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

