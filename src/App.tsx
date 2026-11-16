import { useEffect, useState } from 'react'
import { disconnectRoaster, stopReplay } from './live/runtime'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { LiveScreen } from './screens/LiveScreen'

const route = () => (location.hash.startsWith('#/diagnostika') ? 'diagnostika' : 'live')

export default function App() {
  const [r, setR] = useState(route)
  useEffect(() => {
    const on = () => setR(route())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    // the diagnostics page needs the port for itself
    if (r === 'diagnostika') {
      stopReplay()
      void disconnectRoaster()
    }
  }, [r])
  return r === 'diagnostika' ? <DiagnosticsScreen /> : <LiveScreen />
}
