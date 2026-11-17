import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './ui/theme'
import App from './App'
import { initPersistence } from './storage/persistence'
import { initPwa } from './pwa'
import './live/referenceState'

void initPersistence()
initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
