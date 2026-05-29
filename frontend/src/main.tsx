import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from './config/i18n'
import App from './App'
import './design-system.css'

// i18n is imported above so it starts loading locale files in the background.
// react-i18next with useSuspense:false handles the pre-initialized state by
// showing fallback values, so we render immediately — no waiting needed.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

