import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/manrope/latin-800.css'
import '@fontsource/manrope/latin-ext-800.css'
import './index.css'
import './ui/theme'
import App from './App'
import { initPersistence } from './storage/persistence'
import { initPwa } from './pwa'
import './live/referenceState'

void initPersistence()
void import('./live/dayState').then((m) => m.initDay())
initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
